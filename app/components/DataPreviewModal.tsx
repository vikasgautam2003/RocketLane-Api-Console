'use client'

import { useEffect, useState } from 'react'

interface Props {
  fileName: string
  columns: string[]
  rows: Record<string, string>[]
  onClose: () => void
}

export default function DataPreviewModal({ fileName, columns, rows, onClose }: Props) {
  // Defer heavy table render so the modal frame + spinner paint first.
  // Two rAFs guarantee the browser has actually painted before we render rows.
  const [ready, setReady] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setReady(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [])

  // Fast close — drop the heavy table from DOM, play exit animation, then unmount.
  // Without this, React has to tear down thousands of <td> nodes synchronously
  // and the modal appears to "hang" for a beat before disappearing.
  const EXIT_MS = 220
  function handleClose() {
    if (closing) return
    if (!ready) { onClose(); return }
    setClosing(true)
    setTimeout(onClose, EXIT_MS)
  }

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, closing])

  return (
    <div
      className={`${closing ? 'animate-backdrop-out' : 'animate-backdrop'} fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-6`}
      onClick={handleClose}
    >
      <div
        className={`${closing ? 'animate-modal-out' : 'animate-modal'} bg-[#100e1c] border border-violet-500/[0.12] rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl shadow-violet-950/40`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-zinc-100 font-semibold text-sm truncate" title={fileName}>
              {fileName}
            </h2>
            <p className="text-zinc-500 text-xs mt-0.5 font-mono">
              {rows.length.toLocaleString()} rows · {columns.length} columns
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-all text-xl leading-none shrink-0 ml-3"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {closing ? (
            // Empty during close — the exit animation handles the visual.
            // Stripping the table here keeps unmount cheap.
            <div className="h-full" />
          ) : !ready ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
              <div className="relative w-12 h-12">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'radial-gradient(circle, rgba(139,92,246,0.4) 0%, transparent 70%)',
                    animation: 'splash-glow 1.6s ease-in-out infinite',
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="animate-spin-sm w-7 h-7 rounded-full border-[2.5px] border-violet-900/40 border-t-violet-300 inline-block" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-zinc-300 text-sm font-medium">Preparing preview…</p>
                <p className="text-zinc-600 text-xs mt-1 font-mono">
                  {rows.length.toLocaleString()} rows × {columns.length} columns
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full text-[11px] font-mono border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#100e1c] border-b border-white/[0.08]">
                  <th className="px-3 py-2.5 text-left text-zinc-600 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap w-12 bg-[#100e1c]">
                    #
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2.5 text-left text-emerald-400 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap bg-[#100e1c]"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-white/[0.03] hover:bg-violet-500/[0.04] transition-colors"
                  >
                    <td className="px-3 py-1.5 text-zinc-700 tabular-nums">{i + 1}</td>
                    {columns.map((col) => (
                      <td
                        key={col}
                        className="px-3 py-1.5 text-zinc-300 whitespace-nowrap max-w-[280px]"
                      >
                        <span className="block truncate" title={row[col]}>
                          {row[col] || <span className="text-zinc-700">—</span>}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-white/[0.06] shrink-0">
          <span className="text-[11px] text-zinc-600 font-mono">
            Scroll to view all rows · press <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400 text-[10px]">Esc</kbd> to close
          </span>
          <button
            onClick={handleClose}
            className="text-xs px-4 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
