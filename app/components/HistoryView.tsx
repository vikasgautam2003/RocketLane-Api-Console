'use client'

import type { RunRecord } from '@/types'

interface Props {
  runs: RunRecord[]
  onLoad: (run: RunRecord) => void
  onDelete: (id: number) => void
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
}

export default function HistoryView({ runs, onLoad, onDelete }: Props) {
  if (runs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#09080f]">
        <p className="text-zinc-600 text-sm italic">
          No run history yet. Complete an operation to see it here.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#09080f]">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-[#09080f]">
          <tr className="border-b border-white/[0.05]">
            <th className="text-left px-5 py-3 text-[10px] text-zinc-600 uppercase tracking-[0.1em] font-semibold">Time</th>
            <th className="text-left px-5 py-3 text-[10px] text-zinc-600 uppercase tracking-[0.1em] font-semibold">Curl</th>
            <th className="text-left px-5 py-3 text-[10px] text-zinc-600 uppercase tracking-[0.1em] font-semibold">Mode</th>
            <th className="text-right px-5 py-3 text-[10px] text-zinc-600 uppercase tracking-[0.1em] font-semibold">Rows</th>
            <th className="text-left px-5 py-3 text-[10px] text-zinc-600 uppercase tracking-[0.1em] font-semibold">Result</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              className="border-b border-white/[0.03] hover:bg-violet-500/[0.04] transition-colors"
            >
              <td className="px-5 py-3 text-xs text-zinc-600 tabular-nums whitespace-nowrap font-mono">
                {formatDate(run.created_at)}
              </td>
              <td className="px-5 py-3 text-zinc-300 max-w-[260px] text-sm">
                <span className="truncate block" title={run.curl_name}>{run.curl_name}</span>
              </td>
              <td className="px-5 py-3 text-xs text-zinc-500 whitespace-nowrap">
                {run.mode}
                {run.is_dry_run === 1 && (
                  <span className="ml-1.5 text-violet-400/80">(dry)</span>
                )}
              </td>
              <td className="px-5 py-3 text-xs text-zinc-500 tabular-nums text-right font-mono">
                {run.total_rows}
              </td>
              <td className="px-5 py-3">
                <span className="text-xs font-mono flex gap-2">
                  {run.succeeded > 0 && <span className="text-emerald-400">{run.succeeded}✓</span>}
                  {run.dry_run_count > 0 && <span className="text-violet-400">{run.dry_run_count}⊘</span>}
                  {run.failed > 0 && <span className="text-rose-400">{run.failed}✗</span>}
                  {run.skipped > 0 && <span className="text-amber-400">{run.skipped}⚠</span>}
                </span>
              </td>
              <td className="px-5 py-3 text-right">
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => onLoad(run)}
                    className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    Load →
                  </button>
                  <button
                    onClick={() => onDelete(run.id!)}
                    className="text-zinc-700 hover:text-rose-400 transition-colors text-sm leading-none"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
