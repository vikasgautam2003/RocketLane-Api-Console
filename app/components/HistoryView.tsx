'use client'

import type { RunRecord } from '@/types'

interface Props {
  runs: RunRecord[]
  onLoad: (run: RunRecord) => void
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
}

export default function HistoryView({ runs, onLoad }: Props) {
  if (runs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-600 text-sm italic">
          No run history yet. Complete an operation to see it here.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-zinc-950">
          <tr className="border-b border-zinc-800">
            <th className="text-left px-5 py-2.5 text-xs text-zinc-500 uppercase tracking-wider font-medium">
              Time
            </th>
            <th className="text-left px-5 py-2.5 text-xs text-zinc-500 uppercase tracking-wider font-medium">
              Curl
            </th>
            <th className="text-left px-5 py-2.5 text-xs text-zinc-500 uppercase tracking-wider font-medium">
              Mode
            </th>
            <th className="text-right px-5 py-2.5 text-xs text-zinc-500 uppercase tracking-wider font-medium">
              Rows
            </th>
            <th className="text-left px-5 py-2.5 text-xs text-zinc-500 uppercase tracking-wider font-medium">
              Result
            </th>
            <th className="px-5 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              className="border-b border-zinc-800/50 hover:bg-zinc-900/40 transition-colors"
            >
              <td className="px-5 py-3 text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                {formatDate(run.created_at)}
              </td>
              <td className="px-5 py-3 text-zinc-300 max-w-[260px]">
                <span className="truncate block" title={run.curl_name}>
                  {run.curl_name}
                </span>
              </td>
              <td className="px-5 py-3 text-xs text-zinc-500 whitespace-nowrap">
                {run.mode}
                {run.is_dry_run === 1 && (
                  <span className="ml-1 text-sky-500">(dry)</span>
                )}
              </td>
              <td className="px-5 py-3 text-xs text-zinc-400 tabular-nums text-right">
                {run.total_rows}
              </td>
              <td className="px-5 py-3">
                <span className="text-xs font-mono flex gap-2">
                  {run.succeeded > 0 && (
                    <span className="text-emerald-400">{run.succeeded}✓</span>
                  )}
                  {run.dry_run_count > 0 && (
                    <span className="text-sky-400">{run.dry_run_count}⊘</span>
                  )}
                  {run.failed > 0 && (
                    <span className="text-red-400">{run.failed}✗</span>
                  )}
                  {run.skipped > 0 && (
                    <span className="text-amber-400">{run.skipped}⚠</span>
                  )}
                </span>
              </td>
              <td className="px-5 py-3 text-right">
                <button
                  onClick={() => onLoad(run)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Load →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
