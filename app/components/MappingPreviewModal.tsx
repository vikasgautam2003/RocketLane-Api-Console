'use client'

import { buildRequest } from '@/lib/executor'
import type { MappingTemplate } from '@/types'

interface Props {
  template: MappingTemplate
  row: Record<string, string>
  rlKey: string
  dryRun: boolean
  rowCount: number
  onConfirm: () => void
  onClose: () => void
}

function isAuthHeader(key: string) {
  const k = key.toLowerCase()
  return k.includes('key') || k.includes('auth') || k.includes('token') || k.includes('secret')
}

export default function MappingPreviewModal({ template, row, rlKey, dryRun, rowCount, onConfirm, onClose }: Props) {
  const req = buildRequest(template, row, rlKey)

  const unresolved = [
    ...[...req.url.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]),
    ...(req.body ? [...JSON.stringify(req.body).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]) : []),
  ].filter((v, i, a) => a.indexOf(v) === i)

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-zinc-100 font-medium text-sm">
            Mapping Preview
            {rowCount > 1 && (
              <span className="text-zinc-500 font-normal"> — {rowCount} rows{rowCount > 1 && ', showing row 1'}</span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Field mapping */}
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Field Mapping</p>
            <div className="space-y-2">
              {Object.entries(template.mapping).map(([placeholder, source]) => (
                <div key={placeholder} className="flex items-center gap-3 text-sm">
                  <code className="bg-zinc-800 text-blue-400 px-2 py-0.5 rounded font-mono text-xs shrink-0">
                    {`{{${placeholder}}}`}
                  </code>
                  <span className="text-zinc-600">→</span>
                  {source === 'session_rl_key' ? (
                    <span className="text-amber-400 text-xs">session RL key</span>
                  ) : (
                    <span className="text-xs text-zinc-400">
                      column{' '}
                      <span className="text-emerald-400 font-mono">&quot;{source}&quot;</span>
                      {row[source] !== undefined && (
                        <span className="text-zinc-600"> = &quot;{row[source] || '(empty)'}&quot;</span>
                      )}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Resolved request */}
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Request That Will Be Sent</p>
            <div className="bg-zinc-950 rounded border border-zinc-800 p-4 font-mono text-xs space-y-2">
              <div>
                <span className="text-violet-400 font-medium">{req.method}</span>{' '}
                <span className="text-zinc-200 break-all">{req.url}</span>
              </div>
              <div>
                <span className="text-zinc-600">Headers:</span>
                {Object.entries(req.headers).map(([k, v]) => (
                  <div key={k} className="ml-3 mt-0.5">
                    <span className="text-zinc-500">{k}:</span>{' '}
                    <span className="text-zinc-300">
                      {isAuthHeader(k) ? `${v.slice(0, 8)}…` : v}
                    </span>
                  </div>
                ))}
              </div>
              {req.body ? (
                <div>
                  <span className="text-zinc-600">Body:</span>
                  <pre className="ml-3 mt-0.5 text-zinc-300 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(req.body, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="text-zinc-600">Body: none</div>
              )}
            </div>
          </div>

          {/* Warnings */}
          {unresolved.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3">
              <p className="text-amber-400 text-xs font-medium mb-1">⚠ Unresolved placeholders</p>
              {unresolved.map((p) => (
                <p key={p} className="text-amber-300 text-xs font-mono">
                  {`{{${p}}}`} has no mapping — will be sent as-is
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-zinc-800 shrink-0">
          {!dryRun && rowCount > 1 && (
            <p className="text-xs text-red-400 mr-auto">
              ⚠ This will fire {rowCount} real {template.method} requests — cannot be undone
            </p>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2 text-sm rounded font-medium transition-colors ${
              dryRun
                ? 'bg-sky-600 hover:bg-sky-500 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {dryRun ? 'Confirm (Dry Run)' : 'Confirm & Run'}
          </button>
        </div>
      </div>
    </div>
  )
}

