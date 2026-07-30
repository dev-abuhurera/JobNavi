'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, MapPin, Loader2, Zap, Plus, Clock, Sparkles, Compass, CheckCircle2, AlertCircle } from 'lucide-react'

export default function DiscoveryPage() {
  const [keywords, setKeywords] = useState('')
  const [location, setLocation] = useState('Remote')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tasks, setTasks] = useState<any[]>([])

  const [missing, setMissing] = useState<string[] | null>(null)
  const ready = missing?.length === 0

  const supabase = createClient()
  const chanRef = useRef<any>(null)

  const [presetTags, setPresetTags] = useState<string[]>([
    'Backend Developer', 'React.js', 'Full Stack Engineer', 'Python', 'AI Engineer'
  ])

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return setMissing(['Resume'])

    const [profileRes, tasksRes] = await Promise.all([
      supabase.from('profiles').select('resume_path, profile_data').eq('user_id', user.id).maybeSingle(),
      supabase.from('discovery_tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5)
    ])

    const missingList: string[] = []
    if (!profileRes.data?.resume_path) missingList.push('Resume PDF')
    const pd = profileRes.data?.profile_data || {}
    if (!pd.skills || pd.skills.length === 0) missingList.push('Skills')

    if (pd.skills && Array.isArray(pd.skills) && pd.skills.length > 0) {
      setPresetTags(pd.skills.filter(Boolean).slice(0, 8))
    }

    setMissing(missingList)
    if (tasksRes.data) setTasks(tasksRes.data)
  }, [supabase])

  useEffect(() => {
    loadData()
    window.addEventListener('focus', loadData)

    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (!uid || chanRef.current) return
      const ch = supabase.channel('tasks-' + uid)
      ch.on('postgres_changes',
        { event: '*', schema: 'public', table: 'discovery_tasks', filter: `user_id=eq.${uid}` },
        () => loadData()
      )
      ch.subscribe()
      chanRef.current = ch
    })

    return () => {
      window.removeEventListener('focus', loadData)
      if (chanRef.current) {
        supabase.removeChannel(chanRef.current)
        chanRef.current = null
      }
    }
  }, [loadData, supabase])

  const start = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!keywords.trim() || !ready) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
          location: location.trim() || 'Remote',
        }),
      })

      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(body.message || body.error || 'Could not start search mission.')
        if (body.missing) setMissing(body.missing)
        return
      }

      setKeywords('')
    } catch {
      setError('Could not start search mission. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const statusBadge = (status: string) => {
    if (status === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200">
          <CheckCircle2 size={12} className="text-emerald-600" /> Completed
        </span>
      )
    }
    if (status === 'running') {
      return (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 border border-amber-200 animate-pulse">
          <Sparkles size={12} className="text-amber-600" /> Searching...
        </span>
      )
    }
    if (status === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-700 border border-rose-200">
          <AlertCircle size={12} className="text-rose-600" /> Failed
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
        Queued
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Compass size={22} />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Discover Jobs</h1>
        </div>
      </header>

      {/* Main 2-Column Glass Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Form & Search Box */}
        <div className="lg:col-span-2 space-y-5">
          
          {/* Missing Profile Alert */}
          {missing && missing.length > 0 && (
            <div className="bg-amber-500/10 backdrop-blur-xl border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3.5 shadow-xs">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
                <Plus size={18} />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-amber-900">Profile Action Required</h4>
                <p className="text-xs text-amber-800/90 mt-0.5">
                  To match discovered jobs against your resume, please upload your resume in the{' '}
                  <a href="/dashboard/resume" className="font-semibold underline hover:text-amber-950">Resume Hub</a>:
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {missing.map(m => (
                    <span key={m} className="font-mono text-[10px] uppercase tracking-wider font-bold bg-amber-200/60 text-amber-900 px-2.5 py-0.5 rounded-md">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="bg-rose-500/10 backdrop-blur-xl border border-rose-200 rounded-2xl p-4 flex justify-between items-center shadow-xs">
              <p className="text-rose-700 text-sm font-medium">{error}</p>
              <button onClick={() => setError(null)} className="text-xs font-semibold text-rose-700 hover:underline ml-3">
                Dismiss
              </button>
            </div>
          )}

          {/* Main Fancy Search Card */}
          <div className="bg-white/70 backdrop-blur-3xl border border-white/90 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.05)] space-y-6">
            
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900">Launch Search Mission</h3>
            </div>

            {/* Quick Preset Skill Tags */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">Quick Fill Suggestions</span>
              <div className="flex flex-wrap gap-2">
                {presetTags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setKeywords(prev => prev ? `${prev}, ${tag}` : tag)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/80 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200/80 hover:border-emerald-200 transition-all backdrop-blur-md shadow-2xs hover:scale-105 active:scale-95"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={start} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Keywords Input */}
                <div className="space-y-1.5">
                  <label className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                    Search Keywords
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      disabled={!ready}
                      className="w-full bg-white/80 border border-slate-200/80 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 disabled:opacity-50 transition-all shadow-2xs"
                      placeholder="e.g. Backend Developer, React, Python"
                      value={keywords}
                      onChange={e => setKeywords(e.target.value)}
                    />
                  </div>
                </div>

                {/* Location Input */}
                <div className="space-y-1.5">
                  <label className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                    Location / Workplace
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      disabled={!ready}
                      className="w-full bg-white/80 border border-slate-200/80 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 disabled:opacity-50 transition-all shadow-2xs"
                      placeholder="e.g. Remote, San Francisco, London"
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Submit CTA Button */}
              <button
                type="submit"
                disabled={loading || !keywords.trim() || !ready}
                className="w-full py-4 px-6 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    <span>Launching AI Discovery Crawler...</span>
                  </>
                ) : (
                  <>
                    <Zap size={18} fill="currentColor" />
                    <span>{ready ? 'Start Search Mission' : 'Complete Profile to Unlock'}</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Recent Missions Glass Sidebar */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <Clock size={15} className="text-emerald-600" /> Recent Missions
            </h3>
            <span className="text-xs text-slate-400 font-medium">{tasks.length} total</span>
          </div>

          <div className="space-y-3">
            {tasks.length === 0 ? (
              <div className="bg-white/60 backdrop-blur-2xl border border-white/80 rounded-3xl p-8 text-center shadow-xs">
                <Compass size={28} className="text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-medium">No active search missions yet.</p>
              </div>
            ) : (
              tasks.map(t => (
                <div
                  key={t.id}
                  className="bg-white/60 hover:bg-white/90 backdrop-blur-2xl border border-white/80 hover:border-emerald-200/80 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    {statusBadge(t.status)}
                    <span className="font-mono text-[11px] font-medium text-slate-400">
                      {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div>
                    <div className="text-sm font-bold text-slate-900 truncate">
                      {Array.isArray(t.keywords) ? t.keywords.join(', ') : t.keywords}
                    </div>
                    <div className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                      <MapPin size={12} className="text-slate-400" /> {t.location}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}