'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Zap, Trash2, RefreshCw, Briefcase, MapPin, ExternalLink, Trash, Loader } from 'lucide-react'

interface Job {

  id: string | number
  title: string
  company: string
  location: string
  description?: string
  source_url: string
  source: string
  tech_stack?: string[]
  fit_score?: number
  posting_date?: string
  status?: string
  created_at: string
  
}

export default function DiscoverPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const [keywords, setKeywords] = useState('')
  const [location, setLocation] = useState('Remote')
  const [error, setError] = useState<string | null>(null)
  
  const supabase = createClient()
  const realtimeChannel = useRef<any>(null)
  const pollInterval = useRef<NodeJS.Timeout | null>(null)

  // Fetch initial jobs
  const fetchJobs = async () => {
    try {
      setError(null)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error: fetchError } = await supabase
        .from('jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      
      if (fetchError) throw fetchError
      setJobs(data || [])
    } catch (err: any) {
      console.error('[Dashboard] Error fetching jobs:', err)
      setError(err?.message || 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }

  // Set up Realtime subscription
  const setupRealtimeListener = () => {
    if (realtimeChannel.current) {
      supabase.removeChannel(realtimeChannel.current)
    }

    const channel = supabase
      .channel('jobs-realtime')
      // Listen for INSERT events
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'jobs' },
        (payload: any) => {
          console.log('[Realtime] New job inserted:', payload.new)
          setJobs(prev => {
            if (prev.some(job => job.id === payload.new.id)) return prev
            return [payload.new, ...prev]
          })
        }
      )
      // Listen for UPDATE events
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs' },
        (payload: any) => {
          console.log('[Realtime] Job updated:', payload.new)
          setJobs(prev => prev.map(job => job.id === payload.new.id ? payload.new : job))
        }
      )
      // Listen for DELETE events
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'jobs' },
        (payload: any) => {
          console.log('[Realtime] Job deleted:', payload.old.id)
          setJobs(prev => prev.filter(job => job.id !== payload.old.id))
        }
      )
      .subscribe()

    realtimeChannel.current = channel
  }

  // Poll for scanning status
  const pollScanningStatus = async () => {
    try {
      const { data: tasks } = await supabase
        .from('discovery_tasks')
        .select('id, status')
        .in('status', ['pending', 'running'])
        .limit(1)

      if (!tasks || tasks.length === 0) {
        setIsScanning(false)
        if (pollInterval.current) {
          clearInterval(pollInterval.current)
          pollInterval.current = null
        }
      }
    } catch (err) {
      console.error('[Dashboard] Error polling scanning status:', err)
    }
  }

  useEffect(() => {
    fetchJobs()
    setupRealtimeListener()
    return () => {
      if (realtimeChannel.current) supabase.removeChannel(realtimeChannel.current)
      if (pollInterval.current) clearInterval(pollInterval.current)
    }
  }, [])

  const handleStartScan = async () => {
    if (!keywords.trim()) {
      setError('Please enter keywords')
      return
    }

    setIsScanning(true)
    setError(null)

    try {
      const response = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: keywords.split(',').map(k => k.trim()).filter(k => k.length > 0),
          location: location || 'Remote',
        }),
      })

      if (!response.ok) throw new Error('Failed to start discovery')

      if (pollInterval.current) clearInterval(pollInterval.current)
      pollInterval.current = setInterval(pollScanningStatus, 2000)
    } catch (err: any) {
      setError(err?.message || 'Failed to start discovery')
      setIsScanning(false)
    }
  }

  const handleDeleteJob = async (id: string | number) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const deletedJob = jobs.find(j => j.id === id)
    setJobs(prev => prev.filter(j => j.id !== id))

    const { error: deleteError } = await supabase
      .from('jobs')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('[Delete Error]:', deleteError)
      setError(`Delete Failed: ${deleteError.message}`)
      if (deletedJob) setJobs(prev => [deletedJob, ...prev])
    } else {
      console.log('[Delete Success] Job removed from Supabase')
    }
  }

  const handleClearAll = async () => {
    if (!window.confirm('Clear all jobs? This cannot be undone.')) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const backup = jobs
    setJobs([])

    const { error: clearError } = await supabase
      .from('jobs')
      .delete()
      .eq('user_id', user.id)

    if (clearError) {
      console.error('[Clear All Error]:', clearError)
      setError(`Clear All Failed: ${clearError.message}`)
      setJobs(backup)
    } else {
      console.log('[Clear All Success] All jobs removed')
    }
  }

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700">
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl flex justify-between items-center">
          <p className="text-red-700 dark:text-red-400 text-sm font-medium">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-600 dark:text-red-300 hover:underline">Dismiss</button>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-3xl p-8 mb-8 shadow-sm">
        <div className="flex flex-wrap gap-6 items-end">
          <div className="flex-1 min-w-[240px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block px-1">Search Keywords</label>
            <input
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all dark:text-white"
              placeholder="React, Node.js, MERN, Frontend..."
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              disabled={isScanning}
            />
          </div>
          <div className="w-48">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block px-1">Location</label>
            <input
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all dark:text-white"
              value={location}
              onChange={e => setLocation(e.target.value)}
              disabled={isScanning}
            />
          </div>
          <button
            className="h-[58px] px-8 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl font-bold flex items-center gap-3 transition-all disabled:opacity-50"
            onClick={handleStartScan}
            disabled={isScanning || !keywords.trim()}
          >
            {isScanning ? <><RefreshCw className="animate-spin" size={18} /> Scanning...</> : <><Zap size={18} fill="white" /> Start Discovery</>}
          </button>
          {jobs.length > 0 && (
            <button className="h-[58px] px-6 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl font-bold flex items-center gap-2 transition-all" onClick={handleClearAll} disabled={isScanning}>
              <Trash2 size={18} /> Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader className="animate-spin text-blue-500 mr-2" size={32} />
          <span className="text-slate-500 text-sm">Loading jobs...</span>
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Briefcase className="mb-4 text-slate-300 dark:text-slate-600" size={48} />
          <p className="text-slate-500 text-sm font-medium">No jobs discovered yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {jobs.map(job => (
            <div key={job.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center text-xl">
                  {job.source?.toLowerCase().includes('linkedin') ? '💼' : '🚀'}
                </div>
                <button className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 transition-all" onClick={() => handleDeleteJob(job.id)}>
                  <Trash size={16} />
                </button>
              </div>
              <h4 className="font-bold text-slate-900 dark:text-white mb-1 line-clamp-2">{job.title}</h4>
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                <span className="font-semibold text-blue-500">{job.company}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><MapPin size={12} /> {job.location}</span>
              </div>
              <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-1.5 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                    <div className="bg-blue-500 h-full" style={{ width: `${job.fit_score || 0}%` }}></div>
                  </div>
                  <span className="text-xs font-bold text-blue-500">{job.fit_score || 0}%</span>
                </div>
                <a href={job.source_url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 hover:text-blue-500 transition-all">
                  View Source <ExternalLink size={10} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}