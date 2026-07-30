'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Link2, RefreshCw, CheckCircle2, XCircle, Loader2, Wifi, WifiOff, Settings, ShieldCheck, Clock, ArrowUpRight } from 'lucide-react'

type SessionStatus = 'active' | 'expired' | 'connecting' | null

const AVAILABLE_PORTALS = [
  { id: 'linkedin', label: 'LinkedIn', description: 'Automated 1-Click Easy Apply portal integration', bg: 'bg-[#0a66c2]', code: 'in' },
]

const COMING_SOON_PORTALS = [
  { id: 'indeed', label: 'Indeed', description: '1-Click Apply & Resume Matching', bg: 'bg-[#2164f3]', code: 'Id' },
  { id: 'glassdoor', label: 'Glassdoor', description: 'Automated Company Pipeline Submissions', bg: 'bg-[#0caa41]', code: 'Gd' },
  { id: 'wellfound', label: 'Wellfound (AngelList)', description: 'Startup & Remote Role Auto-Apply', bg: 'bg-[#e00000]', code: 'Wf' },
  { id: 'ziprecruiter', label: 'ZipRecruiter', description: 'Smart Auto-Fill Application Pipeline', bg: 'bg-[#357738]', code: 'Zr' },
]

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<Record<string, SessionStatus>>({})
  const [portalLoading, setPortalLoading] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)
  const supabase = createClient()

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ text, type }); setTimeout(() => setToast(null), 3000)
  }

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/status')
      if (res.ok) { const d = await res.json(); setSessions(d.sessions || {}) }
    } catch {}
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setUserId(data.user.id); refreshStatus() }
      setLoading(false)
    })
    const interval = setInterval(refreshStatus, 4000)
    return () => clearInterval(interval)
  }, [refreshStatus, supabase.auth])

  const connect = async (portalId: string) => {
    setPortalLoading(s => ({ ...s, [portalId]: true }))
    try {
      const res = await fetch('/api/portal/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal: portalId }) })
      const d = await res.json()
      if (res.ok) { showToast(d.message || 'Browser window opened. Log in to save your session.', 'info'); setSessions(s => ({ ...s, [portalId]: 'connecting' })) }
      else showToast(d.error || 'Failed to start connection', 'error')
    } catch { showToast('Connection failed', 'error') }
    setPortalLoading(s => ({ ...s, [portalId]: false }))
  }

  const disconnect = async (portalId: string) => {
    setPortalLoading(s => ({ ...s, [portalId]: true }))
    try {
      const res = await fetch('/api/portal/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal: portalId }) })
      if (res.ok) { showToast('Portal session disconnected', 'success'); setSessions(s => ({ ...s, [portalId]: null })) }
      else showToast('Failed to disconnect portal', 'error')
    } catch { showToast('Disconnect failed', 'error') }
    setPortalLoading(s => ({ ...s, [portalId]: false }))
  }

  const statusPill = (status: SessionStatus) => {
    if (status === 'active') return (
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1.5 backdrop-blur-md">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Active Session
      </span>
    )
    if (status === 'connecting') return (
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 border border-amber-200 inline-flex items-center gap-1.5 animate-pulse backdrop-blur-md">
        <Loader2 size={12} className="animate-spin text-amber-600" /> Waiting for Login...
      </span>
    )
    if (status === 'expired') return (
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-rose-500/10 text-rose-700 border border-rose-200 inline-flex items-center gap-1.5 backdrop-blur-md">
        <XCircle size={12} className="text-rose-600" /> Session Expired
      </span>
    )
    return (
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 inline-flex items-center gap-1.5">
        <WifiOff size={12} className="text-slate-400" /> Not Connected
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Fancy Glass Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
            <Settings size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Settings</h1>
              <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200">
                Portal Integrations
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Settings Glass Box */}
      <div className="bg-white/70 backdrop-blur-3xl border border-white/90 rounded-3xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.04)] space-y-8">
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Link2 size={20} className="text-emerald-600" />
              <h3 className="font-display font-bold text-xl text-slate-900">Connected Portals</h3>
            </div>
            <ShieldCheck size={20} className="text-emerald-600" />
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Authenticate your portals below to enable automated background job applications.
          </p>
        </div>

        {/* Section 1: Available Portals */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Available Portals</span>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/60 text-slate-500">1 Available</span>
          </div>

          {loading ? (
            <div className="h-28 bg-slate-100/80 rounded-2xl animate-pulse" />
          ) : (
            AVAILABLE_PORTALS.map(p => {
              const status = sessions[p.id]
              const busy = portalLoading[p.id]
              const connected = status === 'active'
              return (
                <div
                  key={p.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white/90 border border-slate-200/80 rounded-2xl shadow-2xs hover:shadow-xs transition-all"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className={`w-12 h-12 rounded-2xl ${p.bg} text-white flex items-center justify-center font-display font-black text-lg shadow-md shrink-0`}>
                      {p.code}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="font-bold text-slate-900 text-base">
                        {p.label}
                      </div>
                      <div>{statusPill(status)}</div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {connected ? (
                      <button
                        disabled={busy}
                        onClick={() => disconnect(p.id)}
                        className="py-2.5 px-5 rounded-2xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 transition-all active:scale-95 shadow-2xs disabled:opacity-50"
                      >
                        {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Disconnect'}
                      </button>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() => connect(p.id)}
                        className="py-2.5 px-5 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all active:scale-95 shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : status === 'expired' ? (
                          <>
                            <RefreshCw size={14} /> Reconnect
                          </>
                        ) : (
                          'Connect Portal'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Section 2: Coming Soon Portals */}
        <div className="space-y-4 pt-4 border-t border-slate-200/60">
          <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-slate-400" />
              <span>Upcoming Integrations</span>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/60 text-slate-500">4 Upcoming</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {COMING_SOON_PORTALS.map(p => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-4 p-5 bg-white/90 border border-slate-200/80 rounded-2xl transition-all shadow-2xs hover:shadow-xs"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={`w-11 h-11 rounded-xl ${p.bg} text-white flex items-center justify-center font-display font-bold text-base shrink-0 shadow-xs`}>
                    {p.code}
                  </div>
                  <div className="truncate">
                    <div className="font-bold text-slate-900 text-sm truncate">{p.label}</div>
                  </div>
                </div>

                <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-slate-100/90 text-slate-500 border border-slate-200/80 shrink-0">
                  Coming Soon
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Floating Glass Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/90 text-white backdrop-blur-2xl border border-white/20 px-5 py-3.5 rounded-2xl shadow-2xl font-medium text-xs flex items-center gap-2.5 animate-bounce">
          {toast.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-400" /> : toast.type === 'error' ? <XCircle size={16} className="text-rose-400" /> : <Loader2 size={16} className="animate-spin text-amber-400" />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  )
}