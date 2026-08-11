'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Target, ExternalLink, Trash2, Search, CheckCircle2, Calendar, Sparkles, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { JobDetailsSidebar } from '@/components/dashboard/JobDetailsSidebar'

export default function ApplicationsPage() {
  const [apps, setApps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [selectedJob, setSelectedJob] = useState<any | null>(null)
  const supabase = createClient()

  const fetchApps = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    let { data, error } = await supabase.from('applications').select('*, jobs(*)').eq('user_id', user.id).order('created_at', { ascending: false })
    if (error) {
      const fallback = await supabase.from('applications').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      data = fallback.data
    }
    if (data) setApps(data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    let channel: any = null
    fetchApps()
    window.addEventListener('focus', fetchApps)

    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id
      if (!uid) return
      const ch = supabase.channel(`apps-${uid}-${Math.random().toString(36).substring(2, 6)}`)
      ch.on('postgres_changes',
        { event: '*', schema: 'public', table: 'applications', filter: `user_id=eq.${uid}` },
        () => fetchApps()
      )
      ch.subscribe()
      channel = ch
    })

    return () => {
      window.removeEventListener('focus', fetchApps)
      if (channel) supabase.removeChannel(channel)
    }
  }, [fetchApps, supabase])

  const [deletingId, setDeletingId] = useState<number | null>(null)

  const confirmDelete = async (id: number | string) => {
    const numId = Number(id)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const appToDelete = apps.find(a => a.id === numId)
    const { error } = await supabase.from('applications').delete().eq('id', numId).eq('user_id', user.id)
    if (!error) {
      setApps(prev => prev.filter(a => a.id !== numId))
      if (selectedJob?.id === numId) setSelectedJob(null)
      toast.info('Application Record Deleted', {
        description: appToDelete ? `Removed ${appToDelete.job_title} at ${appToDelete.company}` : undefined,
      })
    } else {
      toast.error('Failed to Delete Application', { description: error.message })
    }
    setDeletingId(null)
  }

  const filtered = apps.filter(a =>
    (a.company || '').toLowerCase().includes(q.toLowerCase()) ||
    (a.job_title || '').toLowerCase().includes(q.toLowerCase())
  )

  const openAppSidebar = (app: any) => {
    const fullJob = {
      ...(app.jobs || {}),
      ...app,
      id: app.id,
      title: app.job_title || app.jobs?.title || 'Job Position',
      company: app.company || app.jobs?.company || 'Company',
      description: app.jobs?.description || app.description || app.notes || '',
      tech_stack: app.jobs?.tech_stack || app.tech_stack || [],
      location: app.location || app.jobs?.location || 'Remote',
      source_url: app.source_url || app.jobs?.source_url,
      fit_score: app.fit_score || app.jobs?.fit_score || 0
    }
    setSelectedJob(fullJob)
  }

  return (
    <div className="space-y-6">
      {/* Fancy Glass Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
            <Target size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Applications</h1>
              <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200">
                {filtered.length} Submissions
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-0.5">Click any job application card to open the complete details & stipend sidebar.</p>
          </div>
        </div>

        {/* Translucent Glass Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            className="w-full bg-white/80 border border-slate-200/80 rounded-2xl pl-11 pr-4 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all shadow-2xs"
            placeholder="Search company or position..."
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
      </header>

      {/* Main Glass Table Box */}
      <div className="bg-white/70 backdrop-blur-3xl border border-white/90 rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-200/60 bg-slate-50/50 select-none">
                <th className="px-6 py-3.5 font-mono font-bold uppercase text-[10px] tracking-wider">Company</th>
                <th className="px-6 py-3.5 font-mono font-bold uppercase text-[10px] tracking-wider">Position</th>
                <th className="px-6 py-3.5 font-mono font-bold uppercase text-[10px] tracking-wider">AI Fit Score</th>
                <th className="px-6 py-3.5 font-mono font-bold uppercase text-[10px] tracking-wider">Status</th>
                <th className="px-6 py-3.5 font-mono font-bold uppercase text-[10px] tracking-wider">Applied Date</th>
                <th className="px-6 py-3.5 font-mono font-bold uppercase text-[10px] tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-6 py-4">
                      <div className="h-5 bg-slate-100 rounded-xl animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3 shadow-2xs">
                      <Target size={24} />
                    </div>
                    <p className="text-slate-700 font-bold text-sm">No applications found.</p>
                    <p className="text-slate-400 text-xs mt-1">Start a discovery search to begin auto-applying.</p>
                  </td>
                </tr>
              ) : (
                filtered.map(app => (
                  <tr
                    key={app.id}
                    onClick={() => openAppSidebar(app)}
                    className="group hover:bg-white/90 cursor-pointer transition-all duration-200"
                  >
                    
                    {/* Company */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200/60 flex items-center justify-center text-slate-700 font-bold shrink-0">
                          <Building2 size={16} />
                        </div>
                        <span className="font-bold text-slate-900 text-sm group-hover:text-emerald-700 transition-colors">
                          {app.company}
                        </span>
                      </div>
                    </td>

                    {/* Job Title */}
                    <td className="px-6 py-4 text-slate-700 font-semibold text-xs">{app.job_title}</td>

                    {/* Fit Score */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all"
                            style={{ width: `${app.fit_score || 0}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs font-bold text-emerald-700">{app.fit_score || 0}%</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      {(() => {
                        const st = (app.current_status || 'pending').toLowerCase()
                        if (st === 'applied') {
                          return (
                            <span className="inline-flex items-center gap-1 font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider">
                              <CheckCircle2 size={12} className="text-emerald-600" /> Applied
                            </span>
                          )
                        }
                        if (st === 'processing' || st === 'applying') {
                          return (
                            <span className="inline-flex items-center gap-1 font-mono px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 border border-amber-200 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                              <Sparkles size={12} className="text-amber-600" /> Applying...
                            </span>
                          )
                        }
                        if (st === 'failed' || st === 'closed') {
                          return (
                            <span className="inline-flex items-center gap-1 font-mono px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-700 border border-rose-200 text-[10px] font-bold uppercase tracking-wider">
                              {st === 'closed' ? 'Closed' : 'Failed'}
                            </span>
                          )
                        }
                        if (st === 'skipped') {
                          return (
                            <span className="inline-flex items-center gap-1 font-mono px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold uppercase tracking-wider">
                              Skipped
                            </span>
                          )
                        }
                        return (
                          <span className="inline-flex items-center gap-1 font-mono px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-700 border border-sky-200 text-[10px] font-bold uppercase tracking-wider">
                            Pending
                          </span>
                        )
                      })()}
                    </td>

                    {/* Date */}
                    <td className="px-6 py-4 text-xs font-medium text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={13} className="text-slate-400" />
                        {new Date(app.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                        {app.source_url && (
                          <a
                            href={app.source_url}
                            target="_blank"
                            rel="noreferrer"
                            title="View Job Listing"
                            className="p-2 rounded-xl text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-all"
                          >
                            <ExternalLink size={15} />
                          </a>
                        )}
                        <button
                          onClick={() => setDeletingId(app.id)}
                          title="Delete Record"
                          className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over Job Details Sidebar */}
      <JobDetailsSidebar
        isOpen={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        job={selectedJob}
        onDelete={confirmDelete}
      />

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <Trash2 size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Delete Application</h3>
              <p className="text-sm text-slate-500 mt-1">Are you sure you want to delete this application record? This action cannot be undone.</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDelete(deletingId)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-sm font-semibold text-white transition-all shadow-md shadow-rose-600/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}