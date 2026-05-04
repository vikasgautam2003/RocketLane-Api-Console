'use client'

import { useState, useEffect, useCallback } from 'react'
import { RL_CATEGORIES, loadApiDocs, saveApiDocs } from '@/lib/rl-api-endpoints'
import type { HttpMethod } from '@/lib/rl-api-endpoints'

interface Props {
  claudeKey: string
  onSave: (key: string) => void
}

const METHOD_STYLE: Record<HttpMethod, string> = {
  GET:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  POST:   'bg-violet-500/10  text-violet-400  border-violet-500/20',
  PUT:    'bg-amber-500/10   text-amber-400   border-amber-500/20',
  DELETE: 'bg-rose-500/10    text-rose-400    border-rose-500/20',
}

export default function SettingsView({ claudeKey, onSave }: Props) {
  const [draft, setDraft] = useState(claudeKey)
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(RL_CATEGORIES[0].name)
  const [expandedEndpoints, setExpandedEndpoints] = useState<Set<string>>(new Set())
  const [docs, setDocs] = useState<Record<string, string>>({})

  useEffect(() => { setDraft(claudeKey) }, [claudeKey])

  useEffect(() => {
    setDocs(loadApiDocs())
  }, [])

  const handleSaveKey = useCallback(() => {
    onSave(draft.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [draft, onSave])

  function toggleEndpoint(key: string) {
    setExpandedEndpoints((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function updateDoc(key: string, value: string) {
    const next = { ...docs, [key]: value }
    setDocs(next)
    saveApiDocs(next)
  }

  const changed = draft.trim() !== claudeKey

  const filledCount = (categoryName: string) => {
    const cat = RL_CATEGORIES.find((c) => c.name === categoryName)
    if (!cat) return 0
    return cat.endpoints.filter((e) => docs[e.key]?.trim()).length
  }

  const currentCategory = RL_CATEGORIES.find((c) => c.name === selectedCategory)!

  return (
    <div className="flex-1 flex flex-col bg-[#09080f] overflow-hidden">

      {/* Claude key — compact top bar */}
      <div className="px-6 py-4 border-b border-white/[0.05] shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex-1 max-w-sm">
            <p className="text-[10px] text-zinc-500 uppercase tracking-[0.12em] font-semibold mb-2">Claude API Key</p>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setSaved(false) }}
                onKeyDown={(e) => e.key === 'Enter' && changed && handleSaveKey()}
                placeholder="sk-ant-..."
                className="input flex-1 text-sm"
              />
              <button onClick={() => setShowKey((v) => !v)} className="btn-ghost text-xs px-3">
                {showKey ? 'hide' : 'show'}
              </button>
              <button
                onClick={handleSaveKey}
                disabled={!draft.trim() || !changed}
                className="px-4 py-2 text-sm rounded-lg font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Save
              </button>
            </div>
          </div>
          {saved && <span className="text-xs text-emerald-400 mt-4">Saved ✓</span>}
          {claudeKey && !changed && (
            <span className="text-xs text-zinc-600 mt-4">Key is set</span>
          )}
        </div>
      </div>

      {/* API Docs — two-panel */}
      <div className="flex flex-1 min-h-0">

        {/* Left sidebar — categories */}
        <div className="w-52 shrink-0 border-r border-white/[0.05] overflow-y-auto py-3">
          <p className="px-4 text-[10px] text-zinc-600 uppercase tracking-[0.12em] font-semibold mb-2">
            API Docs
          </p>
          {RL_CATEGORIES.map((cat) => {
            const filled = filledCount(cat.name)
            const total = cat.endpoints.length
            const isActive = selectedCategory === cat.name
            return (
              <button
                key={cat.name}
                onClick={() => setSelectedCategory(cat.name)}
                className={`w-full flex items-center justify-between px-4 py-2 text-left transition-all ${
                  isActive
                    ? 'bg-violet-500/10 text-violet-200 border-r-2 border-violet-500'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
                }`}
              >
                <span className="text-xs truncate">{cat.name}</span>
                {filled > 0 && (
                  <span className={`text-[10px] tabular-nums shrink-0 ml-2 ${
                    isActive ? 'text-violet-400' : 'text-zinc-600'
                  }`}>
                    {filled}/{total}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Right panel — endpoints */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-4 border-b border-white/[0.04] shrink-0">
            <h2 className="text-sm font-semibold text-zinc-200">{selectedCategory}</h2>
            <p className="text-xs text-zinc-600 mt-0.5">
              Paste the API docs for each endpoint. Used by Generate Curl as context.
            </p>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {currentCategory.endpoints.map((endpoint) => {
              const isExpanded = expandedEndpoints.has(endpoint.key)
              const hasDocs = !!docs[endpoint.key]?.trim()
              return (
                <div key={endpoint.key}>
                  <button
                    onClick={() => toggleEndpoint(endpoint.key)}
                    className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-white/[0.02] transition-colors group"
                  >
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 w-14 text-center ${METHOD_STYLE[endpoint.method]}`}>
                      {endpoint.method}
                    </span>
                    <span className="flex-1 text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">
                      {endpoint.name}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {hasDocs && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
                      )}
                      <span className={`text-zinc-600 text-xs transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}>
                        ▾
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-6 pb-4">
                      <textarea
                        value={docs[endpoint.key] ?? ''}
                        onChange={(e) => updateDoc(endpoint.key, e.target.value)}
                        rows={6}
                        placeholder={`Paste the "${endpoint.name}" docs from developer.rocketlane.com — URL, params, request body, response shape…`}
                        className="input w-full text-xs font-mono resize-y leading-relaxed"
                        autoFocus
                      />
                      <p className="mt-1.5 text-[10px] text-zinc-700">Auto-saved on change.</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
