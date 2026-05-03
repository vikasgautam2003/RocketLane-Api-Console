'use client'

import { useState } from 'react'

interface Props {
  geminiKey: string
  onSave: (geminiKey: string) => void
  onClose: () => void
}

export default function SettingsModal({ geminiKey: initial, onSave, onClose }: Props) {
  const [key, setKey] = useState(initial)
  const [show, setShow] = useState(false)

  function save() {
    onSave(key.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#100e1c] border border-violet-500/[0.12] rounded-2xl w-full max-w-sm shadow-2xl shadow-violet-950/40">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Settings</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-all text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="label">Gemini API Key</label>
            <div className="flex gap-2">
              <input
                type={show ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                placeholder="AIza..."
                className="input flex-1"
                autoFocus
              />
              <button onClick={() => setShow((v) => !v)} className="btn-ghost text-xs px-3">
                {show ? 'hide' : 'show'}
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-600">
              Stored locally on this device. Used only for mapping and curl generation.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-white/[0.06]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!key.trim()}
            className="px-5 py-2 text-sm rounded-lg font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-950/40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
