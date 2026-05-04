'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Papa from 'papaparse'
import { extractMapping } from '@/lib/claude'
import { generateCurl } from '@/lib/generate-curl'
import { loadApiDocs } from '@/lib/rl-api-endpoints'
import { executeRow } from '@/lib/executor'
import { downloadCSV } from '@/lib/export'
import { initDb, getSavedCurls, saveCurl, deleteSavedCurl, touchCurl, saveRun, getRuns, deleteRun } from '@/lib/db'
import type { MappingTemplate, LogEntry, RunSummary, SavedCurl, RunRecord } from '@/types'
import MappingPreviewModal from './components/MappingPreviewModal'
import LogPanel from './components/LogPanel'
import SaveCurlModal from './components/SaveCurlModal'
import HistoryView from './components/HistoryView'
import SettingsView from './components/SettingsView'
import EndpointPicker from './components/EndpointPicker'

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

function parseCurlDirect(curl: string): MappingTemplate | null {
  const flat = curl.replace(/\\\n/g, ' ').replace(/\s+/g, ' ').trim()
  const methodMatch = flat.match(/-X\s+(\w+)/i)
  const hasGetFlag = /-G\b|--get\b/.test(flat)
  let method = (methodMatch?.[1] ?? 'GET').toUpperCase()
  if (hasGetFlag) method = 'GET'
  const urlMatch = flat.match(/(https?:\/\/[^\s'"\\]+)/)
  if (!urlMatch) return null
  let url = urlMatch[1]
  // For -G style, --data-urlencode params become URL query params
  if (hasGetFlag) {
    try {
      const urlObj = new URL(url)
      for (const m of flat.matchAll(/--data-urlencode\s+['"]([^'"]+)['"]/g)) {
        const eqIdx = m[1].indexOf('=')
        if (eqIdx > 0) urlObj.searchParams.set(m[1].slice(0, eqIdx), m[1].slice(eqIdx + 1))
      }
      url = urlObj.toString()
    } catch { /* keep original url */ }
  }
  const headers: Record<string, string> = {}
  for (const m of flat.matchAll(/-H\s+['"]([^'"]+)['"]/g)) {
    const idx = m[1].indexOf(':')
    if (idx > 0) headers[m[1].slice(0, idx).trim()] = m[1].slice(idx + 1).trim()
  }
  const placeholders = [...new Set([...curl.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))]
  const mapping: Record<string, string> = {}
  for (const p of placeholders) mapping[p] = p === 'RL_API_KEY' ? 'session_rl_key' : p
  return { method, url, headers, body: null, mapping }
}

export default function Home() {
  // Navigation
  const [activeView, setActiveView] = useState<'operation' | 'history' | 'settings'>('operation')

  // Session keys (never persisted)
  const [rlKey, setRlKey] = useState('')
  const [showRlKey, setShowRlKey] = useState(false)
  const [claudeKey, setClaudeKey] = useState('')

  // Operation inputs
  const [curlCmd, setCurlCmd] = useState('')
  const [context, setContext] = useState('')
  const [expectedOutcome, setExpectedOutcome] = useState('')
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [dryRun, setDryRun] = useState(true)
  const [delayMs, setDelayMs] = useState(200)
  const [singleValues, setSingleValues] = useState<Record<string, string>>({})

  const placeholders = useMemo(() => parsePlaceholders(curlCmd), [curlCmd])

  const detectedMethod = useMemo(() => {
    const m = curlCmd.match(/-X\s+(\w+)/i)
    if (m?.[1]) return m[1].toUpperCase()
    if (/-G\b|--get\b/.test(curlCmd)) return 'GET'
    if (/-d\s|--data(?!-urlencode)/.test(curlCmd)) return 'POST'
    return 'GET'
  }, [curlCmd])

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

  // API docs (from Settings)
  const [apiDocs, setApiDocs] = useState<Record<string, string>>({})
  const [pickedMethod, setPickedMethod] = useState<string | null>(null)

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
  const [fetchProgress, setFetchProgress] = useState<{ pages: number; items: number; total: number | null } | null>(null)
  const abortRef = useRef(false)

  // Toast
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

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
    const stored = localStorage.getItem('claude_api_key')
    if (stored) setClaudeKey(stored)
    setApiDocs(loadApiDocs())
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

  function handleSwitchToOperation() {
    setApiDocs(loadApiDocs())
    setActiveView('operation')
  }

  const canPreview =
    rlKey.trim().length > 0 &&
    claudeKey.trim().length > 0 &&
    curlCmd.trim().length > 0 &&
    placeholders.length > 0 &&
    (mode === 'single' || (mode === 'bulk' && csvRows.length > 0))

  const effectiveMethod = pickedMethod ?? detectedMethod
  const isGetMethod = effectiveMethod === 'GET'

  const canRun =
    !isRunning &&
    rlKey.trim().length > 0 &&
    curlCmd.trim().length > 0 &&
    (isGetMethod || mode === 'single' || csvRows.length > 0) &&
    (isGetMethod || template !== null)

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

  function handleSaveSettings(newClaudeKey: string) {
    setClaudeKey(newClaudeKey)
    localStorage.setItem('claude_api_key', newClaudeKey)
  }

  async function handleGenerateCurl() {
    if (!generateDesc.trim() || !claudeKey.trim()) return
    setIsGenerating(true)
    setGenerateError(null)
    try {
      // Only inject all stored docs when the user hasn't already picked a specific endpoint doc.
      // Dumping everything when context is filled causes Claude to pick the wrong endpoint.
      const storedDocs = loadApiDocs()
      const apiDocsText = context.trim()
        ? undefined
        : (Object.values(storedDocs).filter(Boolean).join('\n\n---\n\n') || undefined)
      const curl = await generateCurl(
        generateDesc,
        context,
        claudeKey,
        mode === 'bulk' ? csvColumns : undefined,
        mode === 'bulk' ? csvRows.slice(0, 2) : undefined,
        apiDocsText,
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
      const t = await extractMapping(curlCmd, context, expectedOutcome, sampleData, claudeKey)
      setTemplate(t)
      setShowPreview(true)
    } catch (e) {
      setMappingError(String(e))
    } finally {
      setIsLoadingMapping(false)
    }
  }

  // Shared bulk execution loop — used by both initial run and retry
  async function runRows(rows: Array<{ originalRow: number; data: Record<string, string> }>, tpl?: MappingTemplate) {
    const activeTpl = tpl ?? template ?? parseCurlDirect(curlCmd)
    if (!activeTpl) return
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
      const entries = await executeRow(activeTpl, rows[i].data, rlKey, dryRun, rows[i].originalRow)
      setLogs((prev) => [...prev, ...entries])
      for (const entry of entries) {
        if (entry.status === 'success') s.success++
        else if (entry.status === 'dry_run') s.dryRun++
        else if (entry.status === 'error') s.failed++
        else s.skipped++
      }
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
    const tpl = template ?? parseCurlDirect(curlCmd)
    if (!tpl) return
    setShowPreview(false)
    setLogs([])
    setSummary(null)

    // GET requests always run once — never iterate CSV rows
    if (isGetMethod) {
      setIsRunning(true)
      setFetchProgress(null)
      abortRef.current = false
      const entries = await executeRow(tpl, singleValues, rlKey, dryRun, 1, (pages, items, total) => {
        setFetchProgress({ pages, items, total })
      }, abortRef)
      setFetchProgress(null)
      setLogs(entries)
      const s: RunSummary = { success: 0, failed: 0, skipped: 0, dryRun: 0 }
      for (const entry of entries) {
        if (entry.status === 'success') s.success++
        else if (entry.status === 'dry_run') s.dryRun++
        else if (entry.status === 'error') s.failed++
        else s.skipped++
      }
      setSummary(s)
      setIsRunning(false)
    } else if (mode === 'single') {
      setIsRunning(true)
      const entries = await executeRow(tpl, singleValues, rlKey, dryRun, 1)
      setLogs(entries)
      const s: RunSummary = { success: 0, failed: 0, skipped: 0, dryRun: 0 }
      for (const entry of entries) {
        if (entry.status === 'success') s.success++
        else if (entry.status === 'dry_run') s.dryRun++
        else if (entry.status === 'error') s.failed++
        else s.skipped++
      }
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
    } else if (csvRows.length > 0) {
      await runRows(csvRows.map((data, i) => ({ originalRow: i + 1, data })), tpl)
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
    const rows = logs.filter((e) => e.status === 'error').map(logToRow)
    downloadCSV(`rl-errors-${Date.now()}.csv`, rows)
    showToast(`Downloaded ${rows.length} error rows`)
  }

  function handleExportAll() {
    downloadCSV(`rl-run-${Date.now()}.csv`, logs.map(logToRow))
    showToast(`Downloaded run log (${logs.length} rows)`)
  }

  function handleExportItems() {
    const allItems = logs.flatMap((e) => e.items ?? [])
    if (allItems.length === 0) return
    const flat = allItems.map((item) =>
      typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : { value: item }
    )
    downloadCSV(`rl-items-${Date.now()}.csv`, flat)
    showToast(`Downloaded ${flat.length} items as CSV`)
  }

  const canRetry = !isRunning && mode === 'bulk' && template !== null && (summary?.failed ?? 0) > 0
  const hasGetItems = !isRunning && logs.some((e) => (e.items?.length ?? 0) > 0)
  const loadedCurl = savedCurls.find((c) => c.name === loadedCurlName)
  const previewRow = mode === 'bulk' ? (csvRows[0] ?? {}) : singleValues

  return (
    <div className="flex flex-col h-screen bg-[#09080f] text-zinc-100 overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-4 px-5 py-2.5 border-b border-white/[0.05] shrink-0">
        <img src="/rli.svg" alt="RL" className="w-6 h-6 rounded-lg shrink-0 object-cover" />
        <span className="text-sm font-semibold text-zinc-100 tracking-tight">RL Console</span>
        <nav className="flex gap-0.5 ml-1">
          {(['operation', 'history', 'settings'] as const).map((view) => (
            <button
              key={view}
              onClick={() => view === 'operation' ? handleSwitchToOperation() : setActiveView(view)}
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
        {runs.length > 0 && activeView === 'operation' && (
          <span className="ml-auto text-[11px] text-zinc-700 tabular-nums">{runs.length} runs</span>
        )}
      </header>

      {/* Main */}
      <div className="flex flex-1 min-h-0">
        {activeView === 'settings' ? (
          <SettingsView claudeKey={claudeKey} onSave={handleSaveSettings} />
        ) : activeView === 'history' ? (
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
                  {!claudeKey && (
                    <p className="mt-2 text-xs text-zinc-600">
                      Claude key not set —{' '}
                      <button
                        onClick={() => setActiveView('settings')}
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
                    <label className="label mb-0 flex items-center gap-2">
                      Curl Command
                      <span className="text-zinc-600 normal-case font-normal tracking-normal">
                        — use {'{{PLACEHOLDER}}'}
                      </span>
                      {(curlCmd.trim() || pickedMethod) && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border normal-case tracking-normal ${
                          effectiveMethod === 'GET'    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          effectiveMethod === 'POST'   ? 'bg-violet-500/10  text-violet-400  border-violet-500/20' :
                          effectiveMethod === 'PUT'    ? 'bg-amber-500/10   text-amber-400   border-amber-500/20'  :
                          effectiveMethod === 'DELETE' ? 'bg-rose-500/10    text-rose-400    border-rose-500/20'   :
                          'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                        }`}>
                          {effectiveMethod}
                        </span>
                      )}
                    </label>
                    <button
                      onClick={() => { setShowGenerate((v) => !v); setGenerateError(null) }}
                      disabled={isRunning}
                      className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                    >
                      {showGenerate ? '↑ hide' : '✦ generate'}
                    </button>
                  </div>

                  <div
                    className="overflow-hidden transition-all duration-200 ease-out"
                    style={{ maxHeight: showGenerate ? '160px' : '0px', opacity: showGenerate ? 1 : 0, marginBottom: showGenerate ? '12px' : '0px' }}
                  >
                    <div className="space-y-2 pt-0.5">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={generateDesc}
                            onChange={(e) => setGenerateDesc(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleGenerateCurl()}
                            placeholder="e.g. create a task with start date, due date and effort"
                            className="input w-full text-sm pr-6"
                            disabled={isGenerating}
                          />
                          {generateDesc && (
                            <button
                              onClick={() => setGenerateDesc('')}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors text-base leading-none"
                              tabIndex={-1}
                            >
                              ×
                            </button>
                          )}
                        </div>
                        <button
                          onClick={handleGenerateCurl}
                          disabled={!generateDesc.trim() || !claudeKey.trim() || isGenerating}
                          className="btn-ghost text-xs px-3 disabled:opacity-40 min-w-[64px] flex items-center justify-center gap-1.5"
                        >
                          {isGenerating ? (
                            <>
                              <span className="animate-spin-sm w-3 h-3 rounded-full border-2 border-zinc-600 border-t-zinc-300 inline-block shrink-0" />
                              <span>Generating</span>
                            </>
                          ) : 'Generate'}
                        </button>
                      </div>
                      {generateError && (
                        <p className="text-xs text-rose-400 font-mono break-all">{generateError}</p>
                      )}
                      <p className="text-[11px] text-zinc-600">
                        API docs from Settings are included automatically.
                      </p>
                    </div>
                  </div>

                  <textarea
                    value={curlCmd}
                    onChange={(e) => { setCurlCmd(e.target.value); setPickedMethod(null) }}
                    rows={5}
                    placeholder={`curl -X DELETE https://api.rocketlane.com/api/1.0/tasks/{{TaskId}} \\\n  -H "api-key: {{RL_API_KEY}}"`}
                    className="input font-mono resize-none w-full text-[12px] leading-relaxed"
                  />
                  <div className="mt-1.5 flex items-start justify-between gap-2">
                    {placeholders.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {placeholders.map((p) => (
                          <code key={p} className="text-[10px] bg-violet-500/10 border border-violet-500/20 text-violet-300 px-2 py-0.5 rounded-md font-mono">
                            {`{{${p}}}`}
                          </code>
                        ))}
                      </div>
                    ) : <span />}
                    {curlCmd.trim() && (
                      <button
                        onClick={() => { setCurlCmd(''); setPickedMethod(null); setTemplate(null) }}
                        className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors shrink-0"
                      >
                        clear
                      </button>
                    )}
                  </div>
                </section>

                {/* Context */}
                <section>
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="label mb-0">Context</label>
                    <EndpointPicker docs={apiDocs} onSelect={(doc, method) => { setContext(doc); setPickedMethod(method) }} />
                  </div>
                  <textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    rows={3}
                    placeholder="Paste endpoint docs, or pick one from Settings above…"
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
                  <div className="flex items-center justify-between mb-2">
                    <p className="label mb-0">Mode</p>
                    {isGetMethod && (
                      <span className="text-[10px] text-zinc-600">not applicable for GET</span>
                    )}
                  </div>
                  <div className={`flex rounded-lg border border-white/[0.08] p-0.5 bg-white/[0.02] transition-opacity ${isGetMethod ? 'opacity-30 pointer-events-none' : ''}`}>
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
                {!isGetMethod && mode === 'single' && placeholders.length > 0 && (
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
                {!isGetMethod && mode === 'bulk' && (
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
                    {isLoadingMapping ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin-sm w-3.5 h-3.5 rounded-full border-2 border-zinc-600 border-t-zinc-300 inline-block" />
                        Generating…
                      </span>
                    ) : 'Preview Mapping'}
                  </button>
                  {dryRun ? (
                    <button
                      onClick={handleRun}
                      disabled={isRunning || !rlKey.trim() || !curlCmd.trim()}
                      className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-25 disabled:cursor-not-allowed shadow-lg shadow-indigo-950/40"
                    >
                      {isRunning ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="animate-spin-sm w-3.5 h-3.5 rounded-full border-2 border-indigo-300/40 border-t-white inline-block" />
                          Running…
                        </span>
                      ) : 'Dry Run'}
                    </button>
                  ) : (
                    <button
                      onClick={handleRun}
                      disabled={!canRun}
                      className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 transition-all disabled:opacity-25 disabled:cursor-not-allowed shadow-lg shadow-black/20"
                    >
                      {isRunning ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="animate-spin-sm w-3.5 h-3.5 rounded-full border-2 border-zinc-400/40 border-t-zinc-900 inline-block" />
                          Running…
                        </span>
                      ) : 'Run'}
                    </button>
                  )}
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
                fetchProgress={fetchProgress}
                onClear={() => { setLogs([]); setSummary(null) }}
                onAbort={() => { abortRef.current = true }}
                onRetry={canRetry ? handleRetryFailed : undefined}
                onExportErrors={!isRunning && logs.some((l) => l.status === 'error') ? handleExportErrors : undefined}
                onExportAll={!isRunning && logs.length > 0 ? handleExportAll : undefined}
                onExportItems={hasGetItems ? handleExportItems : undefined}
              />
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-zinc-800 border border-white/[0.10] text-zinc-100 text-xs font-medium shadow-2xl shadow-black/40 pointer-events-none animate-modal">
          ✓ {toast}
        </div>
      )}

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
    </div>
  )
}
