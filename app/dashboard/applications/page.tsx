'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Target, ExternalLink, Trash2, Search, CheckCircle2, Calendar, Sparkles, Building2 } from 'lucide-react'

export default function ApplicationsPage() {
  const [apps, setApps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const supabase = createClient()

  const fetchApps = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('applications').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (data) setApps(data)
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchApps() }, [fetchApps])

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this application record?')) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('applications').delete().eq('id', id).eq('user_id', user.id)
    if (!error) setApps(apps.filter(a => a.id !== id))
  }

  const filtered = apps.filter(a =>
    (a.company || '').toLowerCase().includes(q.toLowerCase()) ||
    (a.job_title || '').toLowerCase().includes(q.toLowerCase())
  )

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
            <p className="text-slate-500 text-sm mt-0.5">Track and manage your automated job application pipeline.</p>
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
                  <tr key={app.id} className="group hover:bg-white/90 transition-colors">
                    
                    {/* Company */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200/60 flex items-center justify-center text-slate-700 font-bold shrink-0">
                          <Building2 size={16} />
                        </div>
                        <span className="font-bold text-slate-900 text-sm">{app.company}</span>
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
                      <span className="inline-flex items-center gap-1 font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider">
                        <CheckCircle2 size={12} /> {app.current_status}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-6 py-4 text-xs font-medium text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={13} className="text-slate-400" />
                        {new Date(app.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
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
                          onClick={() => handleDelete(app.id)}
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
    </div>
  )
}