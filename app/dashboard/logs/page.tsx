'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Terminal, ShieldCheck, AlertCircle, Info, Trash2, Activity, Sparkles } from 'lucide-react'

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchLogs = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('activity_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)
    if (data) setLogs(data)
    setLoading(false)
  }, [supabase])

  const chanRef = useRef<any>(null)
  useEffect(() => {
    fetchLogs()
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (!uid || chanRef.current) return
      const ch = supabase.channel('logs-' + uid)
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs', filter: `user_id=eq.${uid}` }, (p) => setLogs(c => [p.new, ...c].slice(0, 50)))
      ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'activity_logs', filter: `user_id=eq.${uid}` }, (p) => setLogs(c => c.filter(l => l.id !== p.old.id)))
      ch.subscribe()
      chanRef.current = ch
    })
    return () => { if (chanRef.current) { supabase.removeChannel(chanRef.current); chanRef.current = null } }
  }, [fetchLogs, supabase])

  const clearLogs = async () => {
    if (!window.confirm('Delete all logs?')) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('activity_logs').delete().eq('user_id', user.id)
    setLogs([])
  }

  const renderBadge = (lvl: string) => {
    if (lvl === 'error') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold font-mono bg-rose-100 text-rose-800 border border-rose-200/80 shadow-2xs">
          <AlertCircle size={12} className="text-rose-600 shrink-0" /> ERROR
        </span>
      )
    }
    if (lvl === 'success') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold font-mono bg-emerald-100 text-emerald-800 border border-emerald-200/80 shadow-2xs">
          <ShieldCheck size={12} className="text-emerald-600 shrink-0" /> SUCCESS
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold font-mono bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs">
        <Info size={12} className="text-slate-500 shrink-0" /> INFO
      </span>
    )
  }

  const formatLogMessage = (msg: string) => {
    // If msg is "Application failed for <Company>: Error: <Details>"
    if (msg.includes('for ') && msg.includes(': Error: ')) {
      const [beforeError, errorDetail] = msg.split(': Error: ')
      const [action, company] = beforeError.split('for ')
      return (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs sm:text-sm font-sans font-normal text-slate-700 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span>{action} for</span>
            <span className="font-semibold text-slate-800 bg-slate-100/80 px-2 py-0.5 rounded-md border border-slate-200/60">{company}</span>
          </div>
          <span className="text-rose-600 font-normal text-xs bg-rose-50/80 border border-rose-200/50 px-2 py-0.5 rounded-md">
            {errorDetail}
          </span>
        </div>
      )
    }

    // If msg is "Processing application for <Company>..." or "Application for <Company> ended with status: <Status>"
    if (msg.includes('for ')) {
      const parts = msg.split('for ')
      const action = parts[0]
      const rest = parts.slice(1).join('for ')
      return (
        <div className="flex items-center gap-1.5 text-xs sm:text-sm font-sans font-normal text-slate-700 flex-wrap">
          <span>{action} for</span>
          <span className="font-semibold text-slate-800 bg-slate-100/80 px-2 py-0.5 rounded-md border border-slate-200/60">{rest}</span>
        </div>
      )
    }

    // Default clean typography
    return (
      <span className="text-xs sm:text-sm font-sans font-medium text-slate-700 leading-relaxed">
        {msg}
      </span>
    )
  }

  return (
    <div className="h-[calc(100vh-96px)] flex flex-col space-y-4">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Session Logs</h1>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-200/60 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Live
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={clearLogs}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:text-rose-600 bg-white/70 hover:bg-rose-50/80 border border-white/90 hover:border-rose-200 transition-all backdrop-blur-xl shadow-xs active:scale-95"
          >
            <Trash2 size={14} /> Clear Console
          </button>
        </div>
      </header>

      {/* Main Luxury Light Frosted Glass Console Container */}
      <div className="flex-1 min-h-0 bg-white/80 backdrop-blur-3xl border border-white/90 rounded-3xl overflow-hidden flex flex-col shadow-[0_25px_70px_rgba(0,0,0,0.07),0_10px_20px_rgba(0,0,0,0.03)] transition-all">
        
        {/* Sleek Light Glass Window Header */}
        <div className="border-b border-slate-200/60 bg-gradient-to-r from-slate-50/90 via-white/90 to-slate-50/90 backdrop-blur-2xl px-6 py-4 flex items-center justify-between select-none">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] shadow-2xs hover:opacity-80 transition-opacity" />
              <span className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123] shadow-2xs hover:opacity-80 transition-opacity" />
              <span className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] shadow-2xs hover:opacity-80 transition-opacity" />
            </div>
            <div className="h-4 w-[1px] bg-slate-200/80 mx-1" />
            <div className="flex items-center gap-2 text-slate-800 font-mono text-xs font-bold">
              <Terminal size={15} className="text-emerald-600" />
              <span>agent-worker@jobnavi:~ session.log</span>
            </div>
          </div>

          <div>
            <span className="font-mono text-[11px] font-bold text-slate-500 uppercase tracking-wider">Realtime Stream</span>
          </div>
        </div>

        {/* Structured Divided Light Console Panel */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/40">
          {loading && logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3 py-16">
              <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-xs animate-spin">
                <Activity size={20} className="text-emerald-600" />
              </div>
              <p className="text-sm font-sans font-medium text-slate-500">Connecting to agent telemetry stream...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3 py-16">
              <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-xs">
                <Terminal size={24} className="text-slate-400" />
              </div>
              <p className="text-sm font-sans font-medium text-slate-500">No activity logged yet. Start a job search to populate logs.</p>
            </div>
          ) : (
            <div className="bg-white/80 border border-slate-200/80 rounded-2xl overflow-hidden divide-y divide-slate-100/80 shadow-2xs">
              {logs.map((log, i) => (
                <div
                  key={`${log.id}-${i}`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/70 transition-colors"
                >
                  {/* Column 1: Timestamp */}
                  <div className="w-24 shrink-0 font-mono text-xs font-normal text-slate-400 select-none">
                    [{new Date(log.created_at).toLocaleTimeString([], { hour12: false })}]
                  </div>

                  {/* Column 2: Refined Level Badge */}
                  <div className="w-24 shrink-0">
                    {renderBadge(log.level)}
                  </div>

                  {/* Column 3: Formatted Log Message Data */}
                  <div className="flex-1 min-w-0">
                    {formatLogMessage(log.msg)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Light Glass Footer */}
        <div className="border-t border-slate-200/60 bg-white/60 backdrop-blur-2xl px-5 py-3 flex items-center justify-between text-xs text-slate-500 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Buffer: Last 50 Events</span>
          </div>
          <span className="text-[11px] text-slate-400 font-sans font-medium">JobNavi Autonomous Agent v0.1.0</span>
        </div>
      </div>
    </div>
  )
}