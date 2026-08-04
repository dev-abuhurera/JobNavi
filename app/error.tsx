'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error silently for monitoring
    console.error('[JobNavi Global Error]:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full bg-slate-800/80 backdrop-blur-2xl border border-slate-700/60 rounded-3xl p-8 shadow-2xl relative z-10 text-center space-y-6">
        <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto text-rose-400 shadow-sm">
          <AlertTriangle size={32} />
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-2xl font-bold tracking-tight text-white">
            Something went wrong
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            We encountered an unexpected glitch, but don&apos;t worry—your data and progress are safe.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => reset()}
            className="flex-1 py-3 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 active:scale-95"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="flex-1 py-3 px-4 rounded-xl text-sm font-bold text-slate-300 bg-slate-700/60 hover:bg-slate-700 hover:text-white border border-slate-600/50 transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <Home size={16} />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
