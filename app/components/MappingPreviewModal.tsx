'use client'

import { useState } from 'react'
import { buildRequest } from '@/lib/executor'
import type { MappingTemplate } from '@/types'

interface Props {
  template: MappingTemplate
  row: Record<string, string>
  rlKey: string
  dryRun: boolean
  rowCount: number
  csvRows?: Record<string, string>[]
  csvColumns?: string[]
  onConfirm: () => void
  onClose: () => void
}

function isAuthHeader(key: string) {
  const k = key.toLowerCase()
  return k.includes('key') || k.includes('auth') || k.includes('token') || k.includes('secret')
}

const METHOD_COLOR: Record<string, string> = {
  GET: 'text-emerald-400',
  POST: 'text-violet-400',
  PUT: 'text-amber-400',
  PATCH: 'text-amber-400',
  DELETE: 'text-rose-400',
}

export default function MappingPreviewModal({
  template, row, rlKey, dryRun, rowCount,
  csvRows, csvColumns,
  onConfirm, onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<'mapping' | 'csv'>('mapping')
  const req = buildRequest(template, row, rlKey)
  const methodColor = METHOD_COLOR[req.method] ?? 'text-zinc-300'
  const hasCsv = csvRows && csvRows.length > 0 && csvColumns && csvColumns.length > 0

  const unresolved = [
    ...[...req.url.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]),
    ...(req.body ? [...JSON.stringify(req.body).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]) : []),
  ].filter((v, i, a) => a.indexOf(v) === i)

  return (
    <div className="animate-backdrop fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="animate-modal bg-[#100e1c] border border-violet-500/[0.12] rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl shadow-violet-950/40">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
          <div>
            <h2 className="text-zinc-100 font-semibold text-sm">Mapping Preview</h2>
            {rowCount > 1 && (
              <p className="text-zinc-500 text-xs mt-0.5">{rowCount} rows · showing row 1</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-all text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        {hasCsv && (
          <div className="flex gap-1 px-6 pt-4 shrink-0">
            {(['mapping', 'csv'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                  activeTab === tab
                    ? 'bg-violet-500/15 text-violet-300 font-medium border border-violet-500/25'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
                }`}
              >
                {tab === 'mapping' ? 'Field Mapping' : (
                  <>CSV Data <span className="ml-1 text-zinc-600">{csvRows!.length} rows</span></>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* === MAPPING TAB === */}
          {activeTab === 'mapping' && (
            <>
              {/* Field mapping */}
              <div>
                {!hasCsv && <p className="label">Field Mapping</p>}
                <div className="space-y-1.5">
                  {Object.entries(template.mapping).map(([placeholder, source]) => (
                    <div key={placeholder} className="flex items-center gap-3 py-1">
                      <code className="bg-violet-500/10 border border-violet-500/20 text-violet-300 px-2.5 py-1 rounded-lg font-mono text-[11px] shrink-0">
                        {`{{${placeholder}}}`}
                      </code>
                      <span className="text-zinc-600 text-xs">→</span>
                      {source === 'session_rl_key' ? (
                        <span className="text-amber-400/90 text-xs font-medium">session RL key</span>
                      ) : (
                        <span className="text-xs text-zinc-400 min-w-0">
                          column{' '}
                          <span className="text-emerald-400 font-mono">&quot;{source}&quot;</span>
                          {row[source] !== undefined && (
                            <span className="text-zinc-600"> = &quot;{String(row[source] || '(empty)')}&quot;</span>
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Resolved request */}
              <div>
                <p className="label">Request That Will Be Sent</p>
                <div className="bg-black/50 rounded-xl border border-white/[0.05] p-4 font-mono text-[11px] space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${methodColor}`}>{req.method}</span>
                    <span className="text-zinc-200 break-all">{req.url}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-zinc-600">Headers:</span>
                    {Object.entries(req.headers).map(([k, v]) => (
                      <div key={k} className="ml-3">
                        <span className="text-zinc-500">{k}:</span>{' '}
                        <span className="text-zinc-300">
                          {isAuthHeader(k) ? `${v.slice(0, 8)}…` : v}
                        </span>
                      </div>
                    ))}
                  </div>
                  {req.body ? (
                    <div className="space-y-1">
                      <span className="text-zinc-600">Body:</span>
                      <pre className="ml-3 text-zinc-300 overflow-x-auto whitespace-pre-wrap text-[11px]">
                        {JSON.stringify(req.body, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <span className="text-zinc-600">Body: none</span>
                  )}
                </div>
              </div>

              {/* Warnings */}
              {unresolved.length > 0 && (
                <div className="bg-amber-500/[0.07] border border-amber-500/20 rounded-xl p-4">
                  <p className="text-amber-400 text-xs font-semibold mb-2">⚠ Unresolved placeholders</p>
                  {unresolved.map((p) => (
                    <p key={p} className="text-amber-300/70 text-xs font-mono">
                      {`{{${p}}}`} has no mapping — will be sent as-is
                    </p>
                  ))}
                </div>
              )}
            </>
          )}

          {/* === CSV TAB === */}
          {activeTab === 'csv' && hasCsv && (
            <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
              <table className="w-full text-[11px] font-mono border-collapse">
                <thead>
                  <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                    <th className="px-3 py-2 text-left text-zinc-600 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap w-8">#</th>
                    {csvColumns!.map((col) => (
                      <th key={col} className="px-3 py-2 text-left text-zinc-500 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvRows!.slice(0, 20).map((row, i) => (
                    <tr key={i} className={`border-b border-white/[0.03] transition-colors hover:bg-violet-500/[0.04] ${i === 0 ? 'bg-violet-500/[0.03]' : ''}`}>
                      <td className="px-3 py-2 text-zinc-700 tabular-nums">{i + 1}</td>
                      {csvColumns!.map((col) => (
                        <td key={col} className="px-3 py-2 text-zinc-300 whitespace-nowrap max-w-[180px]">
                          <span className="block truncate" title={row[col]}>
                            {row[col] || <span className="text-zinc-700">—</span>}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {csvRows!.length > 20 && (
                    <tr>
                      <td colSpan={csvColumns!.length + 1} className="px-3 py-2.5 text-zinc-600 text-center text-[11px]">
                        + {csvRows!.length - 20} more rows
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-white/[0.06] shrink-0">
          {!dryRun && rowCount > 1 && (
            <p className="text-xs text-rose-400/80 mr-auto">
              ⚠ Fires {rowCount} real {template.method} requests — cannot be undone
            </p>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-200 transition-colors rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2 text-sm rounded-lg font-medium transition-all ${
              dryRun
                ? 'bg-indigo-600/90 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/40'
                : 'bg-zinc-100 hover:bg-white text-zinc-900 shadow-lg shadow-black/30'
            }`}
          >
            {dryRun ? 'Confirm (Dry Run)' : 'Confirm & Run'}
          </button>
        </div>
      </div>
    </div>
  )
}
