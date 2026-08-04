'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCw, LayoutDashboard } from 'lucide-react'
import Link from 'next/link'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Dashboard Error]:', error)
  }, [error])

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white/80 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-8 shadow-xl space-y-6">
        <div className="w-14 h-14 bg-rose-50 border border-rose-200/80 rounded-2xl flex items-center justify-center mx-auto text-rose-600 shadow-xs">
          <AlertCircle size={28} />
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
            Dashboard View Error
          </h2>
          <p className="text-slate-500 text-xs leading-relaxed">
            This section experienced a transient loading issue. Click below to refresh the view.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => reset()}
            className="flex-1 py-3 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 active:scale-95"
          >
            <RefreshCw size={14} />
            Reload Component
          </button>
          <Link
            href="/dashboard"
            className="flex-1 py-3 px-4 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <LayoutDashboard size={14} />
            Dashboard Home
          </Link>
        </div>
      </div>
    </div>
  )
}
