'use client'

import { useEffect, useRef } from 'react'
import type { LogEntry, RunSummary } from '@/types'

interface Props {
  logs: LogEntry[]
  isRunning: boolean
  summary: RunSummary | null
  progress: { current: number; total: number } | null
  onClear: () => void
  onAbort: () => void
  onRetry?: () => void
  onExportErrors?: () => void
  onExportAll?: () => void
}

const ICON: Record<LogEntry['status'], string> = {
  success: '✓',
  error: '✗',
  skipped: '⚠',
  dry_run: '⊘',
}

const COLOR: Record<LogEntry['status'], string> = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  skipped: 'text-amber-400',
  dry_run: 'text-sky-400',
}

export default function LogPanel({
  logs,
  isRunning,
  summary,
  progress,
  onClear,
  onAbort,
  onRetry,
  onExportErrors,
  onExportAll,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const hasActions = !isRunning && (onRetry || onExportErrors || onExportAll)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Output</span>
          {isRunning && progress && (
            <span className="text-xs text-zinc-500 tabular-nums">
              {progress.current} / {progress.total}
            </span>
          )}
          {isRunning && !progress && (
            <span className="flex items-center gap-1 text-xs text-blue-400">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              running
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isRunning && progress && (
            <button
              onClick={onAbort}
              className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-400/50 px-2 py-0.5 rounded transition-colors"
            >
              Abort
            </button>
          )}
          {!isRunning && logs.length > 0 && (
            <button
              onClick={onClear}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {progress && (
        <div className="shrink-0">
          <div className="h-0.5 bg-zinc-800">
            <div
              className="h-0.5 bg-blue-500 transition-all duration-200"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-zinc-700 italic">
            No output yet. Preview mapping and run an operation to see results.
          </p>
        ) : (
          <div className="space-y-1">
            {logs.map((entry) => (
              <div key={entry.id} className="flex gap-2 leading-relaxed">
                <span className={`shrink-0 ${COLOR[entry.status]}`}>{ICON[entry.status]}</span>
                <span className="text-zinc-600 shrink-0">[{entry.row}]</span>
                {entry.statusCode && (
                  <span className="text-zinc-600 shrink-0">{entry.statusCode}</span>
                )}
                <span className={`${COLOR[entry.status]} whitespace-pre-wrap break-all`}>
                  {entry.message}
                </span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Summary + actions */}
      {summary && (
        <div className="border-t border-zinc-800 px-4 py-3 shrink-0 space-y-2.5">
          {/* Counts */}
          <div className="flex gap-4 text-xs font-mono">
            {summary.success > 0 && (
              <span className="text-emerald-400">{summary.success} succeeded</span>
            )}
            {summary.dryRun > 0 && (
              <span className="text-sky-400">{summary.dryRun} dry-run</span>
            )}
            {summary.failed > 0 && (
              <span className="text-red-400">{summary.failed} failed</span>
            )}
            {summary.skipped > 0 && (
              <span className="text-amber-400">{summary.skipped} skipped</span>
            )}
          </div>

          {/* Action buttons */}
          {hasActions && (
            <div className="flex gap-2 flex-wrap">
              {onRetry && summary.failed > 0 && (
                <button
                  onClick={onRetry}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  ↺ Retry failed ({summary.failed})
                </button>
              )}
              {onExportErrors && summary.failed > 0 && (
                <button
                  onClick={onExportErrors}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  ↓ Export errors
                </button>
              )}
              {onExportAll && logs.length > 0 && (
                <button
                  onClick={onExportAll}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  ↓ Export all
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
