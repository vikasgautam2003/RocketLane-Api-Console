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
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-sm shadow-2xl">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-100">Save Curl</h2>
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
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="px-5 py-2 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
