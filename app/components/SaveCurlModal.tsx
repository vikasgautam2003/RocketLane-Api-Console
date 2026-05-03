'use client'

import { useState } from 'react'

interface Props {
  defaultName?: string
  onSave: (name: string) => void
  onClose: () => void
}

export default function SaveCurlModal({ defaultName = '', onSave, onClose }: Props) {
  const [name, setName] = useState(defaultName)

  function submit() {
    if (name.trim()) onSave(name.trim())
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#100e1c] border border-violet-500/[0.12] rounded-2xl w-full max-w-sm shadow-2xl shadow-violet-950/40">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-zinc-100">Save Curl</h2>
        </div>
        <div className="px-5 py-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="e.g. Delete Tasks"
            className="input w-full"
            autoFocus
          />
          <p className="mt-2 text-xs text-zinc-600">
            Saves curl, context, and expected outcome. Overwrites if name already exists.
          </p>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-white/[0.06]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="px-5 py-2 text-sm rounded-lg font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-950/40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
