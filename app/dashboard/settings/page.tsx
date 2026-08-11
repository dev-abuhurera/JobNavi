'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Link2, RefreshCw, CheckCircle2, XCircle, Loader2, Wifi, WifiOff, Settings, ShieldCheck, Clock, ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'

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
  const [savingLinks, setSavingLinks] = useState(false)
  const [profileData, setProfileData] = useState<{ portfolio_url: string; github_url: string }>({
    portfolio_url: '',
    github_url: '',
  })
  const supabase = createClient()

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (type === 'success') toast.success(text)
    else if (type === 'error') toast.error(text)
    else toast.info(text)
  }

  const fetchProfile = useCallback(async (uid: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle()
    if (data?.profile_data) {
      setProfileData({
        portfolio_url: data.profile_data.portfolio_url || data.profile_data.portfolio || data.profile_data.website || '',
        github_url: data.profile_data.github_url || data.profile_data.github || '',
      })
    }
  }, [supabase])

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/status')
      if (res.ok) { const d = await res.json(); setSessions(d.sessions || {}) }
    } catch {}
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (user) {
        setUserId(user.id)
        refreshStatus()
        fetchProfile(user.id)
      }
      setLoading(false)
    })
    const interval = setInterval(refreshStatus, 4000)
    return () => clearInterval(interval)
  }, [fetchProfile, refreshStatus, supabase.auth])

  const saveLinks = async () => {
    if (!userId) return

    setSavingLinks(true)
    const { data: existing } = await supabase.from('profiles').select('profile_data').eq('user_id', userId).maybeSingle()
    const mergedData = {
      ...(existing?.profile_data || {}),
      portfolio_url: profileData.portfolio_url.trim(),
      github_url: profileData.github_url.trim(),
      website: profileData.portfolio_url.trim() || profileData.github_url.trim(),
    }

    const { error } = await supabase.from('profiles').upsert(
      { user_id: userId, profile_data: mergedData },
      { onConflict: 'user_id' }
    )

    setSavingLinks(false)
    if (error) {
      showToast(`Save failed: ${error.message}`, 'error')
    } else {
      showToast('Profile links saved successfully!', 'success')
    }
  }

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
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        showToast(d.message || 'Portal session disconnected', 'success')
        setSessions(s => ({ ...s, [portalId]: null }))
        await refreshStatus()
      } else {
        showToast(d.error || 'Failed to disconnect portal', 'error')
      }
    } catch {
      showToast('Disconnect failed', 'error')
    }
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
                Portals & Links
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Settings Glass Box */}
      <div className="bg-white/70 backdrop-blur-3xl border border-white/90 rounded-3xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.04)] space-y-8">
        
        {/* Section 1: Candidate Profile Links */}
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Link2 size={20} className="text-emerald-600" />
              <h3 className="font-display font-bold text-xl text-slate-900">Profile & Portfolio Links</h3>
            </div>
            <ShieldCheck size={20} className="text-emerald-600" />
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Manage your professional links below. These are automatically attached when auto-filling job application forms.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
            {/* Portfolio URL Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Portfolio Website URL</span>
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Optional</span>
              </label>
              <input
                type="text"
                value={profileData.portfolio_url}
                onChange={e => setProfileData(p => ({ ...p, portfolio_url: e.target.value }))}
                placeholder="https://yourportfolio.com"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>

            {/* GitHub URL Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>GitHub Profile URL</span>
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Optional</span>
              </label>
              <input
                type="text"
                value={profileData.github_url}
                onChange={e => setProfileData(p => ({ ...p, github_url: e.target.value }))}
                placeholder="https://github.com/yourusername"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={saveLinks}
              disabled={savingLinks}
              className="py-2.5 px-6 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all shadow-md shadow-emerald-600/20 active:scale-95 flex items-center gap-2 disabled:opacity-50"
            >
              {savingLinks ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              <span>Save Profile Links</span>
            </button>
          </div>
        </div>

        {/* Section 2: Connected Portals */}
        <div className="space-y-4 pt-4 border-t border-slate-200/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Link2 size={20} className="text-emerald-600" />
              <h3 className="font-display font-bold text-xl text-slate-900 font-display font-bold">Connected Portals</h3>
            </div>
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

        {/* Section 3: Coming Soon Portals */}
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
    </div>
  )
}