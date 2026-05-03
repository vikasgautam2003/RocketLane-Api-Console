'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Papa from 'papaparse'
import { extractMapping } from '@/lib/claude'
import { executeRow } from '@/lib/executor'
import { downloadCSV } from '@/lib/export'
import { initDb, getSavedCurls, saveCurl, deleteSavedCurl, touchCurl, saveRun, getRuns } from '@/lib/db'
import type { MappingTemplate, LogEntry, RunSummary, SavedCurl, RunRecord } from '@/types'
import MappingPreviewModal from './components/MappingPreviewModal'
import LogPanel from './components/LogPanel'
import SaveCurlModal from './components/SaveCurlModal'
import HistoryView from './components/HistoryView'

function parsePlaceholders(curl: string): string[] {
  return [...new Set([...curl.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))]
}

function logToRow(e: LogEntry) {
  return {
    row: e.row,
    status: e.status,
    status_code: e.statusCode ?? '',
    message: e.message,
    timestamp: e.timestamp,
  }
}

function curlToName(curl: string): string {
  const match = curl.match(/(DELETE|POST|PUT|PATCH|GET)\s+https?:\/\/[^/]+([^\s'"\\]+)/)
  if (match) return `${match[1]} ${match[2]}`.slice(0, 60)
  return curl.replace(/[\n\r]+/g, ' ').trim().slice(0, 60)
}

export default function Home() {
  // Navigation
  const [activeView, setActiveView] = useState<'operation' | 'history'>('operation')

  // Session keys (never persisted)
  const [rlKey, setRlKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [showRlKey, setShowRlKey] = useState(false)
  const [showGeminiKey, setShowGeminiKey] = useState(false)

  // Operation inputs
  const [curlCmd, setCurlCmd] = useState('')
  const [context, setContext] = useState('')
  const [expectedOutcome, setExpectedOutcome] = useState('')
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [dryRun, setDryRun] = useState(true)
  const [delayMs, setDelayMs] = useState(200)
  const [singleValues, setSingleValues] = useState<Record<string, string>>({})

  const placeholders = useMemo(() => parsePlaceholders(curlCmd), [curlCmd])

  useEffect(() => {
    setSingleValues((prev) => {
      const next: Record<string, string> = {}
      for (const p of placeholders) next[p] = prev[p] ?? ''
      return next
    })
  }, [placeholders])

  // CSV / bulk state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [csvColumns, setCsvColumns] = useState<string[]>([])
  const [csvError, setCsvError] = useState<string | null>(null)

  // Mapping state
  const [template, setTemplate] = useState<MappingTemplate | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [mappingError, setMappingError] = useState<string | null>(null)
  const [isLoadingMapping, setIsLoadingMapping] = useState(false)

  // Run state
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [summary, setSummary] = useState<RunSummary | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const abortRef = useRef(false)

  // Persistence state
  const [savedCurls, setSavedCurls] = useState<SavedCurl[]>([])
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [loadedCurlName, setLoadedCurlName] = useState('')
  const [showSaveCurlModal, setShowSaveCurlModal] = useState(false)

  // Init DB and load data on mount
  useEffect(() => {
    initDb().then(() => {
      getSavedCurls().then(setSavedCurls)
      getRuns().then(setRuns)
    })
  }, [])

  async function refreshSavedCurls() {
    setSavedCurls(await getSavedCurls())
  }

  async function refreshHistory() {
    setRuns(await getRuns())
  }

  // Saved curl handlers
  async function handleSaveCurl(name: string) {
    await saveCurl(name, curlCmd, context, expectedOutcome)
    setLoadedCurlName(name)
    setShowSaveCurlModal(false)
    await refreshSavedCurls()
  }

  async function handleLoadCurl(curl: SavedCurl) {
    setCurlCmd(curl.curl_command)
    setContext(curl.context)
    setExpectedOutcome(curl.expected_outcome)
    setLoadedCurlName(curl.name)
    setTemplate(null)
    setMappingError(null)
    await touchCurl(curl.id)
    await refreshSavedCurls()
  }

  async function handleDeleteLoadedCurl() {
    const loaded = savedCurls.find((c) => c.name === loadedCurlName)
    if (!loaded) return
    await deleteSavedCurl(loaded.id)
    setLoadedCurlName('')
    await refreshSavedCurls()
  }

  function handleLoadFromHistory(run: RunRecord) {
    setCurlCmd(run.curl_command)
    setContext(run.context)
    setExpectedOutcome(run.expected_outcome)
    setLoadedCurlName(run.curl_name)
    setTemplate(null)
    setMappingError(null)
    setActiveView('operation')
  }

  const canPreview =
    rlKey.trim().length > 0 &&
    geminiKey.trim().length > 0 &&
    curlCmd.trim().length > 0 &&
    placeholders.length > 0 &&
    (mode === 'single' || (mode === 'bulk' && csvRows.length > 0))

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFile(file)
    setCsvError(null)
    setCsvRows([])
    setCsvColumns([])
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors.length > 0 && result.data.length === 0) {
          setCsvError(result.errors[0].message)
          return
        }
        setCsvRows(result.data)
        setCsvColumns(result.meta.fields ?? [])
      },
      error: (err) => setCsvError(err.message),
    })
    e.target.value = ''
  }

  async function handlePreviewMapping() {
    if (!canPreview) return
    setIsLoadingMapping(true)
    setMappingError(null)
    try {
      const sampleData = mode === 'bulk' ? csvRows.slice(0, 3) : [singleValues]
      const t = await extractMapping(curlCmd, context, expectedOutcome, sampleData, geminiKey)
      setTemplate(t)
      setShowPreview(true)
    } catch (e) {
      setMappingError(String(e))
    } finally {
      setIsLoadingMapping(false)
    }
  }

  // Shared bulk execution loop — used by both initial run and retry
  async function runRows(rows: Array<{ originalRow: number; data: Record<string, string> }>) {
    if (!template) return
    setLogs([])
    setIsRunning(true)
    setSummary(null)
    abortRef.current = false

    const s: RunSummary = { success: 0, failed: 0, skipped: 0, dryRun: 0 }

    for (let i = 0; i < rows.length; i++) {
      if (abortRef.current) {
        setLogs((prev) => [
          ...prev,
          {
            id: `abort-${Date.now()}`,
            row: rows[i].originalRow,
            status: 'skipped',
            message: `ABORTED — stopped after ${i} of ${rows.length} rows`,
            timestamp: new Date().toISOString(),
          },
        ])
        s.skipped++
        break
      }
      setProgress({ current: i + 1, total: rows.length })
      const entry = await executeRow(template, rows[i].data, rlKey, dryRun, rows[i].originalRow)
      setLogs((prev) => [...prev, entry])
      if (entry.status === 'success') s.success++
      else if (entry.status === 'dry_run') s.dryRun++
      else if (entry.status === 'error') s.failed++
      else s.skipped++
      if (i < rows.length - 1 && delayMs > 0 && !abortRef.current) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
      }
    }

    setProgress(null)
    setSummary(s)
    setIsRunning(false)

    saveRun({
      curl_name: loadedCurlName || curlToName(curlCmd),
      curl_command: curlCmd,
      context,
      expected_outcome: expectedOutcome,
      mode: 'bulk',
      total_rows: rows.length,
      succeeded: s.success,
      failed: s.failed,
      skipped: s.skipped,
      dry_run_count: s.dryRun,
      is_dry_run: dryRun ? 1 : 0,
      created_at: new Date().toISOString(),
    }).then(refreshHistory)
  }

  async function handleRun() {
    if (!template) return
    setShowPreview(false)

    if (mode === 'single') {
      setIsRunning(true)
      setSummary(null)
      const entry = await executeRow(template, singleValues, rlKey, dryRun, 1)
      setLogs((prev) => [...prev, entry])
      const s: RunSummary = { success: 0, failed: 0, skipped: 0, dryRun: 0 }
      if (entry.status === 'success') s.success++
      else if (entry.status === 'dry_run') s.dryRun++
      else if (entry.status === 'error') s.failed++
      else s.skipped++
      setSummary(s)
      setIsRunning(false)
      saveRun({
        curl_name: loadedCurlName || curlToName(curlCmd),
        curl_command: curlCmd,
        context,
        expected_outcome: expectedOutcome,
        mode: 'single',
        total_rows: 1,
        succeeded: s.success,
        failed: s.failed,
        skipped: s.skipped,
        dry_run_count: s.dryRun,
        is_dry_run: dryRun ? 1 : 0,
        created_at: new Date().toISOString(),
      }).then(refreshHistory)
    } else {
      await runRows(csvRows.map((data, i) => ({ originalRow: i + 1, data })))
    }
  }

  // Retry only errored rows from the last run — reuses existing template, no Claude call
  async function handleRetryFailed() {
    if (!template) return
    const rowsToRetry = logs
      .filter((e) => e.status === 'error')
      .map((e) => ({ originalRow: e.row, data: csvRows[e.row - 1] }))
      .filter((r): r is { originalRow: number; data: Record<string, string> } => r.data !== undefined)
    if (rowsToRetry.length === 0) return
    await runRows(rowsToRetry)
  }

  function handleExportErrors() {
    downloadCSV(`rl-errors-${Date.now()}.csv`, logs.filter((e) => e.status === 'error').map(logToRow))
  }

  function handleExportAll() {
    downloadCSV(`rl-run-${Date.now()}.csv`, logs.map(logToRow))
  }

  const canRetry = !isRunning && mode === 'bulk' && template !== null && (summary?.failed ?? 0) > 0
  const loadedCurl = savedCurls.find((c) => c.name === loadedCurlName)
  const previewRow = mode === 'bulk' ? (csvRows[0] ?? {}) : singleValues

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-4 px-5 py-3 border-b border-zinc-800 shrink-0">
        <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
        <span className="text-sm font-medium text-zinc-100">Rocketlane API Console</span>
        <nav className="flex gap-1">
          {(['operation', 'history'] as const).map((view) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                activeView === view
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {view[0].toUpperCase() + view.slice(1)}
            </button>
          ))}
        </nav>
        {runs.length > 0 && activeView === 'operation' && (
          <span className="text-xs text-zinc-700">{runs.length} runs logged</span>
        )}
      </header>

      {/* Main */}
      <div className="flex flex-1 min-h-0">
        {activeView === 'history' ? (
          <HistoryView runs={runs} onLoad={handleLoadFromHistory} />
        ) : (
          <>
            {/* Left panel — inputs */}
            <div className="w-[460px] shrink-0 border-r border-zinc-800 overflow-y-auto">
              <div className="p-5 space-y-5">

                {/* Session keys */}
                <section>
                  <p className="label">Session Keys</p>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type={showRlKey ? 'text' : 'password'}
                        value={rlKey}
                        onChange={(e) => setRlKey(e.target.value)}
                        placeholder="Rocketlane API key"
                        className="input flex-1"
                      />
                      <button onClick={() => setShowRlKey((v) => !v)} className="btn-ghost text-xs px-3">
                        {showRlKey ? 'hide' : 'show'}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type={showGeminiKey ? 'text' : 'password'}
                        value={geminiKey}
                        onChange={(e) => setGeminiKey(e.target.value)}
                        placeholder="Gemini API key"
                        className="input flex-1"
                      />
                      <button onClick={() => setShowGeminiKey((v) => !v)} className="btn-ghost text-xs px-3">
                        {showGeminiKey ? 'hide' : 'show'}
                      </button>
                    </div>
                  </div>
                </section>

                {/* Saved curls */}
                <section>
                  <p className="label">Saved Curls</p>
                  <div className="flex gap-2 items-center">
                    <select
                      value=""
                      onChange={(e) => {
                        const curl = savedCurls.find((c) => c.id === Number(e.target.value))
                        if (curl) handleLoadCurl(curl)
                      }}
                      className="input flex-1 text-sm"
                      disabled={savedCurls.length === 0 || isRunning}
                    >
                      <option value="" disabled>
                        {savedCurls.length === 0 ? 'No saved curls' : 'Load saved curl…'}
                      </option>
                      {savedCurls.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowSaveCurlModal(true)}
                      disabled={!curlCmd.trim() || isRunning}
                      className="btn-ghost text-xs px-3 disabled:opacity-40"
                    >
                      Save
                    </button>
                    {loadedCurl && (
                      <button
                        onClick={handleDeleteLoadedCurl}
                        disabled={isRunning}
                        title={`Delete "${loadedCurlName}"`}
                        className="text-zinc-600 hover:text-red-400 transition-colors text-sm disabled:opacity-40"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {loadedCurlName && (
                    <p className="mt-1.5 text-xs text-zinc-600">
                      Loaded: <span className="text-zinc-400">{loadedCurlName}</span>
                    </p>
                  )}
                </section>

                <div className="divider" />

                {/* Curl command */}
                <section>
                  <label className="label">
                    Curl Command{' '}
                    <span className="text-zinc-600 normal-case font-normal">
                      — use {'{{PLACEHOLDER}}'} for variables
                    </span>
                  </label>
                  <textarea
                    value={curlCmd}
                    onChange={(e) => setCurlCmd(e.target.value)}
                    rows={5}
                    placeholder={`curl -X DELETE https://api.rocketlane.com/api/1.0/tasks/{{TaskId}} \\\n  -H "api-key: {{RL_API_KEY}}"`}
                    className="input font-mono resize-none w-full"
                  />
                  {placeholders.length > 0 && (
                    <p className="mt-1.5 text-xs text-zinc-600">
                      Detected:{' '}
                      {placeholders.map((p) => (
                        <code key={p} className="text-blue-400 mr-1 font-mono">{`{{${p}}}`}</code>
                      ))}
                    </p>
                  )}
                </section>

                {/* Context */}
                <section>
                  <label className="label">Context</label>
                  <textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    rows={3}
                    placeholder="Paste endpoint docs, field schema, or OpenAPI spec..."
                    className="input resize-none w-full"
                  />
                </section>

                {/* Expected outcome */}
                <section>
                  <label className="label">Expected Outcome</label>
                  <input
                    type="text"
                    value={expectedOutcome}
                    onChange={(e) => setExpectedOutcome(e.target.value)}
                    placeholder="e.g. 204 — task deleted successfully"
                    className="input w-full"
                  />
                </section>

                {/* Mode toggle */}
                <section>
                  <p className="label">Mode</p>
                  <div className="flex gap-2">
                    {(['single', 'bulk'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`px-4 py-1.5 text-sm rounded border transition-colors ${
                          mode === m
                            ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                            : 'border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400'
                        }`}
                      >
                        {m[0].toUpperCase() + m.slice(1)}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Single mode: field values */}
                {mode === 'single' && placeholders.length > 0 && (
                  <section>
                    <p className="label">Field Values</p>
                    <div className="space-y-2">
                      {placeholders.map((p) => (
                        <div key={p} className="flex items-center gap-3">
                          <code className="text-blue-400 text-xs font-mono w-32 shrink-0 truncate">
                            {`{{${p}}}`}
                          </code>
                          <input
                            type="text"
                            value={singleValues[p] ?? ''}
                            onChange={(e) =>
                              setSingleValues((prev) => ({ ...prev, [p]: e.target.value }))
                            }
                            placeholder={`value for ${p}`}
                            className="input flex-1"
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Bulk mode: CSV upload */}
                {mode === 'bulk' && (
                  <section>
                    <p className="label">CSV File</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isRunning}
                      className="w-full border border-zinc-700 rounded py-2 px-3 text-sm text-left transition-colors hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {csvFile ? (
                        <span className="text-zinc-200 truncate block">{csvFile.name}</span>
                      ) : (
                        <span className="text-zinc-500">↑ Choose CSV file…</span>
                      )}
                    </button>
                    {csvError && <p className="mt-1.5 text-xs text-red-400">{csvError}</p>}
                    {csvColumns.length > 0 && (
                      <div className="mt-2.5 space-y-1.5">
                        <p className="text-xs text-zinc-600">
                          {csvRows.length} rows · {csvColumns.length} columns
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {csvColumns.map((col) => (
                            <span
                              key={col}
                              className="text-xs bg-zinc-800 text-emerald-400 px-2 py-0.5 rounded font-mono"
                            >
                              {col}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {/* Dry run + delay */}
                <section className="flex items-center justify-between">
                  <button
                    onClick={() => setDryRun((v) => !v)}
                    disabled={isRunning}
                    className="flex items-center gap-2.5 disabled:opacity-40"
                  >
                    <span
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        dryRun ? 'bg-sky-600' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-150 ${
                          dryRun ? 'translate-x-4' : ''
                        }`}
                      />
                    </span>
                    <span className="text-sm text-zinc-400">Dry Run</span>
                    {dryRun && <span className="text-xs text-sky-400">ON</span>}
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-600">Delay</span>
                    <input
                      type="range"
                      min={0}
                      max={2000}
                      step={50}
                      value={delayMs}
                      onChange={(e) => setDelayMs(Number(e.target.value))}
                      className="w-20 accent-blue-500"
                    />
                    <span className="text-xs text-zinc-500 w-12 tabular-nums">{delayMs}ms</span>
                  </div>
                </section>

                {/* Mapping error */}
                {mappingError && (
                  <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-xs font-mono whitespace-pre-wrap break-all">
                    {mappingError}
                  </div>
                )}

                {/* Preview button */}
                <button
                  onClick={handlePreviewMapping}
                  disabled={!canPreview || isLoadingMapping || isRunning}
                  className="w-full py-2.5 text-sm font-medium rounded border border-blue-600 text-blue-400 hover:bg-blue-600/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isLoadingMapping ? '⟳ Loading mapping…' : 'Preview Mapping'}
                </button>

              </div>
            </div>

            {/* Right panel — log */}
            <div className="flex-1 min-h-0 bg-zinc-950">
              <LogPanel
                logs={logs}
                isRunning={isRunning}
                summary={summary}
                progress={progress}
                onClear={() => { setLogs([]); setSummary(null) }}
                onAbort={() => { abortRef.current = true }}
                onRetry={canRetry ? handleRetryFailed : undefined}
                onExportErrors={!isRunning && logs.some((l) => l.status === 'error') ? handleExportErrors : undefined}
                onExportAll={!isRunning && logs.length > 0 ? handleExportAll : undefined}
              />
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {showPreview && template && (
        <MappingPreviewModal
          template={template}
          row={previewRow}
          rlKey={rlKey}
          dryRun={dryRun}
          rowCount={mode === 'bulk' ? csvRows.length : 1}
          onConfirm={handleRun}
          onClose={() => setShowPreview(false)}
        />
      )}
      {showSaveCurlModal && (
        <SaveCurlModal
          defaultName={loadedCurlName}
          onSave={handleSaveCurl}
          onClose={() => setShowSaveCurlModal(false)}
        />
      )}
    </div>
  )
}
