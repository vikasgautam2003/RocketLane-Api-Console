'use client'

import { useEffect, useState } from 'react'

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setExiting(true), 2100)
    const t2 = setTimeout(onDone, 2650)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#09080f]"
      style={exiting ? { animation: 'splash-out 0.5s cubic-bezier(0.4,0,1,1) both' } : undefined}
    >
      <div className="flex flex-col items-center gap-6">

        {/* Logo + glow */}
        <div className="relative flex items-center justify-center">
          <div
            className="absolute rounded-full"
            style={{
              width: 130, height: 130,
              background: 'radial-gradient(circle, rgba(139,92,246,0.4) 0%, transparent 70%)',
              animation: 'splash-glow 2s ease-in-out 0.6s infinite',
            }}
          />
          <img
            src="/rli.svg"
            alt="RL"
            className="w-[72px] h-[72px] rounded-2xl relative z-10 shadow-2xl shadow-violet-950/60"
            style={{ animation: 'splash-logo-in 0.65s cubic-bezier(0.34,1.56,0.64,1) 0.1s both' }}
          />
        </div>

        {/* Wordmark */}
        <div
          className="flex flex-col items-center gap-1"
          style={{ animation: 'splash-text-in 0.4s cubic-bezier(0.16,1,0.3,1) 0.72s both' }}
        >
          <span className="text-zinc-100 text-[22px] font-semibold tracking-tight leading-none">
            RL Console
          </span>
          <span className="text-zinc-600 text-[11px] tracking-[0.18em] uppercase">
            Rocketlane API
          </span>
        </div>

        {/* Loading dots */}
        <div
          className="flex gap-2 items-center"
          style={{ animation: 'splash-text-in 0.3s ease-out 1.05s both' }}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-violet-400/50 inline-block"
              style={{ animation: `splash-dot 1.2s ease-in-out ${1.05 + i * 0.18}s infinite` }}
            />
          ))}
        </div>

      </div>
    </div>
  )
}
