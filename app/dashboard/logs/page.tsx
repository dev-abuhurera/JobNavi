'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Terminal, Clock, ShieldCheck, AlertCircle, Info } from 'lucide-react'

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchLogs()
    
    // Subscribe to INSERT AND DELETE events
    const channel = supabase
      .channel('activity_logs_realtime')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'activity_logs' 
      }, (payload) => {
        setLogs(current => [payload.new, ...current].slice(0, 50))
      })
      .on('postgres_changes', { 
        event: 'DELETE', 
        schema: 'public', 
        table: 'activity_logs' 
      }, (payload) => {
        // Remove deleted log from UI
        setLogs(current => current.filter(log => log.id !== payload.old.id))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const fetchLogs = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    
    const { data } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    
    if (data) setLogs(data)
    setLoading(false)
  }

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to delete all logs from the database?')) return
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setLoading(true)
    const { error } = await supabase
      .from('activity_logs')
      .delete()
      .eq('user_id', user.id)

    if (error) {
      alert(`Error clearing logs: ${error.message}`)
    } else {
      setLogs([])  // ✅ This clears the UI
    }
    setLoading(false)
  }

  const getLogIcon = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'error': return <AlertCircle size={14} className="text-red-400" />
      case 'success': return <ShieldCheck size={14} className="text-emerald-400" />
      default: return <Info size={14} className="text-blue-400" />
    }
  }

  return (
    <div className="animate-in fade-in duration-700 h-[calc(100vh-160px)] flex flex-col">
      <header className="mb-8 shrink-0">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Session Logs</h1>
        <p className="text-slate-500 dark:text-slate-400">Monitor your agent's real-time autonomous activity.</p>
      </header>

      <div className="flex-1 min-h-0 bg-black border border-white/10 rounded-3xl overflow-hidden flex flex-col shadow-2xl">
        <div className="bg-white/5 border-b border-white/5 px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-slate-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Agent Output Console</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Live Stream</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 font-mono text-xs md:text-sm space-y-3 custom-scrollbar">
          {loading && logs.length === 0 ? (
            <div className="flex items-center gap-3 text-slate-500 italic">
              <Clock size={14} className="animate-spin" />
              <span>Initializing console connection...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex items-center gap-3 text-slate-500 italic">
              <Info size={14} />
              <span>Waiting for agent activity...</span>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex gap-4 group animate-in slide-in-from-bottom-2 duration-300">
                <span className="text-slate-600 shrink-0 select-none opacity-50">
                  [{new Date(log.created_at).toLocaleTimeString([], { hour12: false })}]
                </span>
                <div className="flex items-start gap-2">
                  <span className="mt-1 shrink-0">{getLogIcon(log.level)}</span>
                  <span className={`${
                    log.level === 'error' ? 'text-red-400' :
                    log.level === 'success' ? 'text-emerald-400' :
                    'text-slate-300'
                  } break-all leading-relaxed`}>
                    {log.msg}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="bg-white/5 border-t border-white/5 px-6 py-4 flex items-center justify-between shrink-0">
          <p className="text-[10px] text-slate-500">Showing last 50 events. Session active.</p>
          <button 
            onClick={handleClearLogs}
            disabled={loading}
            className="text-[10px] font-bold text-slate-400 hover:text-white disabled:opacity-50 uppercase tracking-widest transition-colors"
          >
            Clear Console
          </button>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  )
}