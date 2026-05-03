'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Papa from 'papaparse'
import { extractMapping } from '@/lib/claude'
import { generateCurl } from '@/lib/generate-curl'
import { executeRow } from '@/lib/executor'
import { downloadCSV } from '@/lib/export'
import { initDb, getSavedCurls, saveCurl, deleteSavedCurl, touchCurl, saveRun, getRuns, deleteRun } from '@/lib/db'
import type { MappingTemplate, LogEntry, RunSummary, SavedCurl, RunRecord } from '@/types'
import MappingPreviewModal from './components/MappingPreviewModal'
import LogPanel from './components/LogPanel'
import SaveCurlModal from './components/SaveCurlModal'
import HistoryView from './components/HistoryView'
import SettingsModal from './components/SettingsModal'

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
  const [showRlKey, setShowRlKey] = useState(false)
  const [geminiKey, setGeminiKey] = useState('')
  const [showSettings, setShowSettings] = useState(false)

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

  // Curl generation state
  const [showGenerate, setShowGenerate] = useState(false)
  const [generateDesc, setGenerateDesc] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

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
    const stored = localStorage.getItem('gemini_api_key')
    if (stored) setGeminiKey(stored)
  }, [])

  async function refreshSavedCurls() {
    setSavedCurls(await getSavedCurls())
  }

  async function refreshHistory() {
    setRuns(await getRuns())
  }

  async function handleDeleteRun(id: number) {
    await deleteRun(id)
    await refreshHistory()
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

  const canRun =
    template !== null &&
    !dryRun &&
    !isRunning &&
    rlKey.trim().length > 0 &&
    (mode === 'single' || csvRows.length > 0)

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

  function handleSaveSettings(newGeminiKey: string) {
    setGeminiKey(newGeminiKey)
    localStorage.setItem('gemini_api_key', newGeminiKey)
  }

  async function handleGenerateCurl() {
    if (!generateDesc.trim() || !geminiKey.trim()) return
    setIsGenerating(true)
    setGenerateError(null)
    try {
      const curl = await generateCurl(
        generateDesc,
        context,
        geminiKey,
        mode === 'bulk' ? csvColumns : undefined,
        mode === 'bulk' ? csvRows.slice(0, 2) : undefined,
      )
      setCurlCmd(curl)
      setTemplate(null)
      setShowGenerate(false)
      setGenerateDesc('')
    } catch (e) {
      setGenerateError(String(e))
    } finally {
      setIsGenerating(false)
    }
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
    <div className="flex flex-col h-screen bg-[#09080f] text-zinc-100 overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-4 px-5 py-2.5 border-b border-white/[0.05] shrink-0">
        <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0 shadow-[0_0_8px_rgba(167,139,250,0.6)]" />
        <span className="text-sm font-semibold text-zinc-100 tracking-tight">Rocketlane API Console</span>
        <nav className="flex gap-0.5 ml-1">
          {(['operation', 'history'] as const).map((view) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                activeView === view
                  ? 'bg-violet-500/15 text-violet-200 font-medium border border-violet-500/20'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
              }`}
            >
              {view[0].toUpperCase() + view.slice(1)}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {runs.length > 0 && activeView === 'operation' && (
            <span className="text-[11px] text-zinc-700 tabular-nums">{runs.length} runs</span>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-violet-300 hover:bg-violet-500/[0.08] transition-all"
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1 min-h-0">
        {activeView === 'history' ? (
          <HistoryView runs={runs} onLoad={handleLoadFromHistory} onDelete={handleDeleteRun} />
        ) : (
          <>
            {/* Left panel — inputs */}
            <div className="w-[480px] shrink-0 border-r border-white/[0.05] overflow-y-auto bg-[#0d0b18]">
              <div className="p-5 space-y-5">

                {/* Session keys */}
                <section>
                  <p className="label">Session Keys</p>
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
                  {!geminiKey && (
                    <p className="mt-2 text-xs text-zinc-600">
                      Gemini key not set —{' '}
                      <button
                        onClick={() => setShowSettings(true)}
                        className="text-violet-400/80 hover:text-violet-300 transition-colors"
                      >
                        open Settings ↗
                      </button>
                    </p>
                  )}
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
                        className="text-zinc-600 hover:text-red-400 transition-colors text-base disabled:opacity-40"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {loadedCurlName && (
                    <p className="mt-2 text-[11px] text-zinc-600">
                      Loaded: <span className="text-zinc-400">{loadedCurlName}</span>
                    </p>
                  )}
                </section>

                <div className="divider" />

                {/* Curl command */}
                <section>
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="label mb-0">
                      Curl Command
                      <span className="text-zinc-600 normal-case font-normal tracking-normal ml-1">
                        — use {'{{PLACEHOLDER}}'}
                      </span>
                    </label>
                    <button
                      onClick={() => { setShowGenerate((v) => !v); setGenerateError(null) }}
                      disabled={isRunning}
                      className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                    >
                      {showGenerate ? '↑ hide' : '✦ generate'}
                    </button>
                  </div>

                  {showGenerate && (
                    <div className="mb-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={generateDesc}
                          onChange={(e) => setGenerateDesc(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleGenerateCurl()}
                          placeholder="e.g. create a task with start date, due date and effort"
                          className="input flex-1 text-sm"
                          disabled={isGenerating}
                          autoFocus
                        />
                        <button
                          onClick={handleGenerateCurl}
                          disabled={!generateDesc.trim() || !geminiKey.trim() || isGenerating}
                          className="btn-ghost text-xs px-3 disabled:opacity-40 min-w-[64px]"
                        >
                          {isGenerating ? '⟳' : 'Generate'}
                        </button>
                      </div>
                      {generateError && (
                        <p className="text-xs text-red-400 font-mono break-all">{generateError}</p>
                      )}
                      <p className="text-[11px] text-zinc-600">
                        Paste endpoint docs in Context below for best results.
                      </p>
                    </div>
                  )}

                  <textarea
                    value={curlCmd}
                    onChange={(e) => setCurlCmd(e.target.value)}
                    rows={5}
                    placeholder={`curl -X DELETE https://api.rocketlane.com/api/1.0/tasks/{{TaskId}} \\\n  -H "api-key: {{RL_API_KEY}}"`}
                    className="input font-mono resize-none w-full text-[12px] leading-relaxed"
                  />
                  {placeholders.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {placeholders.map((p) => (
                        <code key={p} className="text-[10px] bg-violet-500/10 border border-violet-500/20 text-violet-300 px-2 py-0.5 rounded-md font-mono">
                          {`{{${p}}}`}
                        </code>
                      ))}
                    </div>
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
                    className="input resize-none w-full text-sm leading-relaxed"
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
                  <div className="flex rounded-lg border border-white/[0.08] p-0.5 bg-white/[0.02]">
                    {(['single', 'bulk'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`flex-1 px-4 py-1.5 text-sm rounded-md transition-all duration-150 ${
                          mode === m
                            ? 'bg-white/[0.08] text-zinc-100 font-medium shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-300'
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
                          <code className="text-violet-300 text-[11px] font-mono w-32 shrink-0 truncate bg-violet-500/[0.07] px-2 py-1 rounded-md">
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
                      className="w-full border border-white/[0.08] rounded-lg py-2.5 px-3 text-sm text-left transition-all hover:border-white/[0.14] hover:bg-white/[0.02] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {csvFile ? (
                        <span className="text-zinc-200 truncate block">{csvFile.name}</span>
                      ) : (
                        <span className="text-zinc-500">↑ Choose CSV file…</span>
                      )}
                    </button>
                    {csvError && <p className="mt-1.5 text-xs text-red-400">{csvError}</p>}
                    {csvColumns.length > 0 && (
                      <div className="mt-3 space-y-3">
                        <p className="text-[11px] text-zinc-600">
                          {csvRows.length} rows · {csvColumns.length} columns
                        </p>
                        {/* Inline CSV preview table */}
                        <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                          <table className="w-full text-[10px] font-mono border-collapse">
                            <thead>
                              <tr className="bg-white/[0.03] border-b border-white/[0.05]">
                                {csvColumns.map((col) => (
                                  <th key={col} className="px-2.5 py-1.5 text-left text-emerald-400 whitespace-nowrap font-semibold tracking-wide">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {csvRows.slice(0, 3).map((row, i) => (
                                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                  {csvColumns.map((col) => (
                                    <td key={col} className="px-2.5 py-1.5 text-zinc-400 whitespace-nowrap max-w-[120px]">
                                      <span className="block truncate" title={row[col]}>
                                        {row[col] || <span className="text-zinc-700">—</span>}
                                      </span>
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {csvRows.length > 3 && (
                            <p className="px-2.5 py-1.5 text-[10px] text-zinc-700 border-t border-white/[0.03]">
                              + {csvRows.length - 3} more rows
                            </p>
                          )}
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
                      className={`relative rounded-full transition-colors duration-200 ${
                        dryRun ? 'bg-indigo-600' : 'bg-white/[0.10]'
                      }`}
                      style={{ height: '18px', width: '32px' }}
                    >
                      <span
                        className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          dryRun ? 'translate-x-[14px] left-0.5' : 'left-0.5'
                        }`}
                      />
                    </span>
                    <span className="text-sm text-zinc-400">Dry Run</span>
                    {dryRun && <span className="text-[11px] text-indigo-400 font-medium">ON</span>}
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-600">Delay</span>
                    <input
                      type="range"
                      min={0}
                      max={2000}
                      step={50}
                      value={delayMs}
                      onChange={(e) => setDelayMs(Number(e.target.value))}
                      className="w-20 accent-blue-500"
                    />
                    <span className="text-[11px] text-zinc-500 w-12 tabular-nums">{delayMs}ms</span>
                  </div>
                </section>

                {/* Mapping error */}
                {mappingError && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] p-3 text-red-400 text-xs font-mono whitespace-pre-wrap break-all">
                    {mappingError}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pb-1">
                  <button
                    onClick={handlePreviewMapping}
                    disabled={!canPreview || isLoadingMapping || isRunning}
                    className="flex-1 py-2.5 text-sm font-medium rounded-lg border border-white/[0.1] text-zinc-400 hover:text-zinc-200 hover:border-white/[0.18] hover:bg-white/[0.03] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isLoadingMapping ? '⟳ Loading…' : 'Preview Mapping'}
                  </button>
                  <button
                    onClick={handleRun}
                    disabled={!canRun}
                    className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 transition-all disabled:opacity-25 disabled:cursor-not-allowed shadow-lg shadow-black/20"
                  >
                    Run
                  </button>
                </div>

              </div>
            </div>

            {/* Right panel — log */}
            <div className="flex-1 min-h-0">
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
          csvRows={mode === 'bulk' ? csvRows : undefined}
          csvColumns={mode === 'bulk' ? csvColumns : undefined}
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
      {showSettings && (
        <SettingsModal
          geminiKey={geminiKey}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
