'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, XCircle, ExternalLink, Briefcase, Sparkles, Building2, MapPin, Globe, Trash2 } from 'lucide-react'

export default function ApprovalsPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchJobs()
  }, [])

  const fetchJobs = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'discovered')
      .order('fit_score', { ascending: false })
    
    if (data) setJobs(data)
    setLoading(false)
  }

  const handleAction = async (job: any, action: 'approved' | 'rejected') => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('jobs')
      .update({ status: action })
      .eq('id', job.id)

    if (!error) {
      setJobs(jobs.filter(j => j.id !== job.id))
      
      if (action === 'approved') {
        // Create an application record in 'pending' status
        await supabase.from('applications').insert({
          user_id: user.id,
          job_id: job.id,
          company: job.company,
          job_title: job.title,
          fit_score: job.fit_score,
          current_status: 'pending',
          source_url: job.source_url
        })
      }
    }
  }

  const handleDelete = async (id: string | number) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (!error) {
      setJobs(prev => prev.filter(j => j.id !== id))
    }
  }

  return (
    <div className="animate-in fade-in duration-700">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Approvals</h1>
        <p className="text-slate-500 dark:text-slate-400">Review AI-discovered jobs and authorize the agent to apply.</p>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-3xl p-8 animate-pulse">
              <div className="h-6 bg-slate-100 dark:bg-white/5 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-slate-100 dark:bg-white/5 rounded w-1/2 mb-8"></div>
              <div className="h-20 bg-slate-100 dark:bg-white/5 rounded w-full"></div>
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-3xl p-20 text-center">
          <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-500">
            <CheckCircle size={40} />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">You're all caught up!</h3>
          <p className="text-slate-500 max-w-xs mx-auto">Start a new Discovery mission to find more opportunities.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {jobs.map((job) => (
            <div key={job.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-3xl p-8 shadow-sm hover:shadow-md transition-all flex flex-col group relative">
              <button 
                onClick={() => handleDelete(job.id)}
                className="absolute top-6 right-6 p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                title="Permanently Delete"
              >
                <Trash2 size={18} />
              </button>

              <div className="flex items-start justify-between mb-6 pr-8">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded">
                      {job.fit_score}% Match
                    </span>
                    <Sparkles size={12} className="text-blue-400" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{job.title}</h3>
                </div>
                <a href={job.source_url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-500 transition-colors">
                  <ExternalLink size={20} />
                </a>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <Building2 size={16} className="text-slate-400" />
                  <span className="font-semibold">{job.company}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <MapPin size={16} className="text-slate-400" />
                  <span>{job.location}</span>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-5 mb-8 flex-1">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">AI Summary</h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-4 leading-relaxed">
                  {job.description || "Position matches your target criteria for technology stack and experience level."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => handleAction(job, 'rejected')}
                  className="flex items-center justify-center gap-2 py-3 bg-slate-50 dark:bg-white/5 hover:bg-red-500/10 hover:text-red-500 text-slate-500 dark:text-slate-400 font-bold rounded-2xl transition-all"
                >
                  <XCircle size={18} />
                  Pass
                </button>
                <button 
                  onClick={() => handleAction(job, 'approved')}
                  className="flex items-center justify-center gap-2 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-500/20"
                >
                  <CheckCircle size={18} />
                  Apply
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
