'use client'

import { useState, useRef, useEffect } from 'react'
import { RL_CATEGORIES } from '@/lib/rl-api-endpoints'
import type { HttpMethod } from '@/lib/rl-api-endpoints'

const METHOD_BADGE: Record<HttpMethod, string> = {
  GET:    'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  POST:   'bg-orange-500/20  text-orange-400  border-orange-500/30',
  PUT:    'bg-blue-500/20    text-blue-400    border-blue-500/30',
  DELETE: 'bg-rose-500/20   text-rose-400    border-rose-500/30',
}

interface Props {
  docs: Record<string, string>
  onSelect: (doc: string, method: HttpMethod) => void
}

export default function EndpointPicker({ docs, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10)
  }, [open])

  const filledCount = Object.values(docs).filter(Boolean).length

  const filtered = RL_CATEGORIES.map((cat) => ({
    ...cat,
    endpoints: cat.endpoints.filter((ep) => {
      if (!search) return true
      const q = search.toLowerCase()
      return ep.name.toLowerCase().includes(q) || cat.name.toLowerCase().includes(q) || ep.method.toLowerCase().includes(q)
    }),
  })).filter((cat) => cat.endpoints.length > 0)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 text-[10px] border rounded-md px-2 py-1 transition-all ${
          open
            ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
            : 'bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-zinc-200 hover:border-violet-500/25'
        }`}
      >
        <span>Endpoint docs</span>
        {filledCount > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 shrink-0" />
        )}
        <span className={`text-zinc-500 text-[8px] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-68 bg-[#0d0b18] border border-white/[0.09] rounded-xl shadow-2xl shadow-black/60 z-50 overflow-hidden"
          style={{ width: '268px' }}
        >
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06]">
            <span className="text-zinc-600 text-xs shrink-0">⌕</span>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (setOpen(false), setSearch(''))}
              placeholder="Search endpoints…"
              className="flex-1 bg-transparent text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-zinc-600 hover:text-zinc-400 text-xs">×</button>
            )}
          </div>

          {/* Endpoint list */}
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-5 text-xs text-zinc-600 text-center">No endpoints match</p>
            )}
            {filtered.map((cat) => (
              <div key={cat.name}>
                <p className="px-3 pt-2.5 pb-1 text-[9px] text-zinc-600 uppercase tracking-[0.14em] font-semibold">
                  {cat.name}
                </p>
                {cat.endpoints.map((ep) => {
                  const hasDocs = !!docs[ep.key]?.trim()
                  return (
                    <button
                      key={ep.key}
                      onClick={() => {
                        if (!hasDocs) return
                        onSelect(docs[ep.key], ep.method)
                        setOpen(false)
                        setSearch('')
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                        hasDocs
                          ? 'hover:bg-white/[0.04] cursor-pointer'
                          : 'opacity-35 cursor-not-allowed'
                      }`}
                    >
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 w-11 text-center tracking-wide ${METHOD_BADGE[ep.method]}`}>
                        {ep.method}
                      </span>
                      <span className={`text-[11px] flex-1 truncate ${hasDocs ? 'text-zinc-300' : 'text-zinc-600'}`}>
                        {ep.name}
                      </span>
                      {hasDocs && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 border-t border-white/[0.05] flex items-center justify-between">
            <span className="text-[9px] text-zinc-700">
              {filledCount} / {RL_CATEGORIES.reduce((a, c) => a + c.endpoints.length, 0)} with docs
            </span>
            <span className="text-[9px] text-zinc-700">esc to close</span>
          </div>
        </div>
      )}
    </div>
  )
}
