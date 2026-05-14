'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, MapPin, Loader2, Sparkles, Plus, Clock } from 'lucide-react'

export default function DiscoveryPage() {
  const [keywords, setKeywords] = useState('')
  const [location, setLocation] = useState('Remote')
  const [loading, setLoading] = useState(false)
  const [tasks, setTasks] = useState<any[]>([])
  const [hasResume, setHasResume] = useState<boolean | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchTasks()
    checkResumeStatus()
    const channel = supabase
      .channel('discovery_tasks_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discovery_tasks' }, () => {
        fetchTasks()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const checkResumeStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('resume_path, profile_data')
      .eq('user_id', user.id)
      .single()
    
    // Unlock if they have a PDF OR if they have filled out their AI profile data
    const hasData = !!data?.resume_path || (data?.profile_data && Object.keys(data.profile_data).length > 0)
    setHasResume(hasData)
  }

  const fetchTasks = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('discovery_tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)
    if (data) setTasks(data)
  }

  const handleStartDiscovery = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!keywords || !hasResume) return
    
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('discovery_tasks').insert({
      user_id: user.id,
      keywords: keywords.split(',').map(k => k.trim()),
      location,
      status: 'pending'
    })

    if (!error) {
      setKeywords('')
    }
    setLoading(false)
  }

  return (
    <div className="animate-in fade-in duration-700">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Discover Jobs</h1>
        <p className="text-slate-500 dark:text-slate-400">Launch a new search mission across major job portals.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Search Panel */}
        <div className="lg:col-span-2 space-y-6">
          {!hasResume && hasResume !== null && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 flex items-start gap-4 animate-in slide-in-from-top-2 duration-500">
              <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center text-amber-500 shrink-0">
                <Plus size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-amber-600 mb-1">CV Required for Smart Search</h4>
                <p className="text-xs text-amber-600/80 leading-relaxed">
                  To ensure high relevance, the AI agent needs your CV to perform semantic matching. 
                  Please upload your CV in the <a href="/dashboard/resume" className="underline font-bold">Resume Hub</a> to unlock discovery.
                </p>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-3xl p-8 shadow-sm">
            <form onSubmit={handleStartDiscovery} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Job Keywords</label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      disabled={!hasResume}
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl pl-12 pr-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-white disabled:cursor-not-allowed"
                      placeholder="React, Node.js, Frontend..."
                      value={keywords}
                      onChange={e => setKeywords(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Location Preference</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      disabled={!hasResume}
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl pl-12 pr-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-white disabled:cursor-not-allowed"
                      placeholder="Remote, New York, London..."
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <button 
                type="submit"
                disabled={loading || !keywords || !hasResume}
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:bg-slate-200 dark:disabled:bg-white/5 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-3"
              >
                {loading ? <Loader2 className="animate-spin" size={18} /> : (
                  <>
                    {!hasResume ? <Plus size={18} /> : <Sparkles size={18} />}
                    {!hasResume ? 'Upload CV to Unlock' : 'Start AI Search Mission'}
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-6">
            <h4 className="text-sm font-bold text-blue-500 mb-2">How it works</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Our agent will crawl LinkedIn, Indeed, and other portals using your keywords. 
              Discovered jobs are scored by AI and appear in your approvals tab for review.
            </p>
          </div>
        </div>

        {/* Recent Tasks */}
        <div className="space-y-6">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock size={16} className="text-slate-400" />
            Recent Missions
          </h3>
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <div className="p-10 text-center bg-slate-50 dark:bg-white/5 border border-dashed border-slate-200 dark:border-white/10 rounded-3xl">
                <p className="text-xs text-slate-400">No missions yet.</p>
              </div>
            ) : (
              tasks.map(task => (
                <div key={task.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-md ${
                      task.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                      task.status === 'processing' ? 'bg-blue-500/10 text-blue-500 animate-pulse' :
                      'bg-slate-500/10 text-slate-500'
                    }`}>
                      {task.status}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate mb-1">
                    {task.keywords.join(', ')}
                  </div>
                  <div className="text-[11px] text-slate-500">{task.location}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
