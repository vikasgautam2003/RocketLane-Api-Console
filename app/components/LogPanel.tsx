'use client'

import { useEffect, useRef } from 'react'
import type { LogEntry, RunSummary } from '@/types'

interface Props {
  logs: LogEntry[]
  isRunning: boolean
  summary: RunSummary | null
  progress: { current: number; total: number } | null
  fetchProgress?: { pages: number; items: number; total: number | null } | null
  onClear: () => void
  onAbort: () => void
  onRetry?: () => void
  onExportErrors?: () => void
  onExportAll?: () => void
  onExportItems?: () => void
}

const ICON: Record<LogEntry['status'], string> = {
  success: '✓',
  error: '✗',
  skipped: '⚠',
  dry_run: '⊘',
}

const COLOR: Record<LogEntry['status'], string> = {
  success: 'text-emerald-400',
  error: 'text-rose-400',
  skipped: 'text-amber-400',
  dry_run: 'text-violet-400',
}

const ROW_BG: Record<LogEntry['status'], string> = {
  success: 'hover:bg-emerald-500/[0.04]',
  error: 'hover:bg-rose-500/[0.05]',
  skipped: 'hover:bg-amber-500/[0.04]',
  dry_run: 'hover:bg-violet-500/[0.05]',
}

export default function LogPanel({
  logs,
  isRunning,
  summary,
  progress,
  fetchProgress,
  onClear,
  onAbort,
  onRetry,
  onExportErrors,
  onExportAll,
  onExportItems,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const hasActions = !isRunning && (onRetry || onExportErrors || onExportAll || onExportItems)

  return (
    <div className="flex flex-col h-full bg-[#09080f]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.05] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-[0.12em]">Output</span>
          {isRunning && progress && (
            <span className="text-xs text-zinc-500 tabular-nums font-mono">
              {progress.current} / {progress.total}
            </span>
          )}
          {isRunning && !progress && (
            <span className="flex items-center gap-1.5 text-xs text-violet-400">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              running
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isRunning && progress && (
            <button
              onClick={onAbort}
              className="text-xs text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-400/40 px-2.5 py-1 rounded-md transition-all"
            >
              Abort
            </button>
          )}
          {!isRunning && logs.length > 0 && (
            <button
              onClick={onClear}
              className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {progress && (
        <div className="shrink-0 h-[2px] bg-white/[0.04]">
          <div
            className="h-full bg-violet-500/70 transition-all duration-200"
            style={{ width: `${(progress.current / progress.total) * 100}%` }}
          />
        </div>
      )}

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto px-5 py-4 font-mono text-[11px] leading-relaxed">
        {fetchProgress && (
          <div className="flex items-center gap-2.5 px-1 py-1 mb-2 rounded bg-violet-500/[0.06] border border-violet-500/[0.12]">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shrink-0" />
            <span className="text-violet-300">
              Fetching page {fetchProgress.pages}
              {fetchProgress.total != null
                ? ` · ${fetchProgress.items} / ${fetchProgress.total} items`
                : ` · ${fetchProgress.items} items so far`}
              …
            </span>
          </div>
        )}
        {logs.length === 0 && !fetchProgress ? (
          <p className="text-zinc-700 italic text-xs mt-2">
            No output yet — preview mapping and confirm to begin.
          </p>
        ) : logs.length > 0 ? (
          <div className="space-y-px">
            {logs.map((entry) => (
              <div
                key={entry.id}
                className={`flex gap-2.5 px-1 py-0.5 rounded transition-colors ${ROW_BG[entry.status]}`}
              >
                <span className={`shrink-0 w-3 text-center ${COLOR[entry.status]}`}>
                  {ICON[entry.status]}
                </span>
                <span className="text-zinc-600 shrink-0 tabular-nums">[{entry.row}]</span>
                {entry.statusCode && (
                  <span className={`shrink-0 tabular-nums font-semibold ${COLOR[entry.status]}`}>
                    {entry.statusCode}
                  </span>
                )}
                <span className={`${COLOR[entry.status]} opacity-80 whitespace-pre-wrap break-all`}>
                  {entry.message}
                </span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        ) : null}
      </div>

      {/* Summary + actions */}
      {summary && (
        <div className="border-t border-white/[0.05] px-5 py-3.5 shrink-0 space-y-3">
          <div className="flex gap-4 text-[11px] font-mono">
            {summary.success > 0 && (
              <span className="text-emerald-400">{summary.success} succeeded</span>
            )}
            {summary.dryRun > 0 && (
              <span className="text-violet-400">{summary.dryRun} dry-run</span>
            )}
            {summary.failed > 0 && (
              <span className="text-rose-400">{summary.failed} failed</span>
            )}
            {summary.skipped > 0 && (
              <span className="text-amber-400">{summary.skipped} skipped</span>
            )}
          </div>

          {hasActions && (
            <div className="flex gap-2 flex-wrap">
              {onRetry && summary.failed > 0 && (
                <button
                  onClick={onRetry}
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/[0.08] text-zinc-400 hover:border-violet-500/30 hover:text-violet-300 transition-all"
                >
                  ↺ Retry failed ({summary.failed})
                </button>
              )}
              {onExportErrors && summary.failed > 0 && (
                <button
                  onClick={onExportErrors}
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/[0.08] text-zinc-400 hover:border-rose-500/30 hover:text-rose-300 transition-all"
                >
                  ↓ Errors CSV
                </button>
              )}
              {onExportAll && logs.length > 0 && (
                <button
                  onClick={onExportAll}
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/[0.08] text-zinc-400 hover:border-zinc-500/40 hover:text-zinc-200 transition-all"
                  title="Export the run log (status, row, message) as CSV"
                >
                  ↓ Run log CSV
                </button>
              )}
              {onExportItems && (
                <button
                  onClick={onExportItems}
                  className="text-xs px-3 py-1.5 rounded-lg border border-emerald-500/25 text-emerald-400 hover:border-emerald-400/50 hover:bg-emerald-500/[0.06] transition-all font-medium"
                  title="Export the raw API items as CSV (all fields)"
                >
                  ↓ Items CSV
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
