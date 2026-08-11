'use client'

import React from 'react'
import NotificationBell from './NotificationBell'
import { Activity, ShieldCheck } from 'lucide-react'

export default function Header({ user }: { user: { email?: string } | null }) {
  return (
    <header className="sticky top-0 z-40 w-full bg-white/60 backdrop-blur-2xl border-b border-white/80 px-8 py-3.5 flex items-center justify-between shadow-[0_4px_20px_rgba(0,0,0,0.02)] select-none">
      
      {/* Left: Agent Telemetry Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/80 border border-slate-200/70 shadow-2xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-mono text-xs font-bold text-slate-800">JobNavi Engine Active</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 font-medium">
          <ShieldCheck size={14} className="text-emerald-600" />
          <span>Real-time Telemetry Connected</span>
        </div>
      </div>

      {/* Right: Notification Bell & Quick Actions */}
      <div className="flex items-center gap-3">
        <a
          href="/dashboard/logs"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white/80 hover:bg-white border border-slate-200/80 shadow-2xs transition-all active:scale-95"
        >
          <Activity size={14} className="text-emerald-600" /> Live Logs
        </a>

        <NotificationBell />
      </div>
    </header>
  )
}
