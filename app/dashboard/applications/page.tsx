'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Target, ExternalLink, Trash2, Search, Filter } from 'lucide-react'

export default function ApplicationsPage() {
  const [apps, setApps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const supabase = createClient()

  useEffect(() => {
    fetchApplications()
  }, [])

  const fetchApplications = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    
    const { data } = await supabase
      .from('applications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    
    if (data) setApps(data)
    setLoading(false)
  }

  const handleDelete = async (id: number) => {
    const { error } = await supabase.from('applications').delete().eq('id', id)
    if (!error) {
      setApps(apps.filter(a => a.id !== id))
    }
  }

  const filteredApps = apps.filter(app => 
    app.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.job_title.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Applications</h1>
          <p className="text-slate-500 dark:text-slate-400">Track and manage your automated outreach pipeline.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-xl pl-11 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-white"
              placeholder="Search company..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="p-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-xl text-slate-500 hover:text-blue-500 transition-colors">
            <Filter size={18} />
          </button>
        </div>
      </header>

      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-50 dark:border-white/5">
                <th className="px-8 py-5 font-semibold uppercase text-[10px] tracking-wider">Target Company</th>
                <th className="px-8 py-5 font-semibold uppercase text-[10px] tracking-wider">Position</th>
                <th className="px-8 py-5 font-semibold uppercase text-[10px] tracking-wider">Fit Score</th>
                <th className="px-8 py-5 font-semibold uppercase text-[10px] tracking-wider">Status</th>
                <th className="px-8 py-5 font-semibold uppercase text-[10px] tracking-wider">Date Sent</th>
                <th className="px-8 py-5 font-semibold uppercase text-[10px] tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/5">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-8 py-5">
                      <div className="h-4 bg-slate-100 dark:bg-white/5 rounded w-full"></div>
                    </td>
                  </tr>
                ))
              ) : filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Target size={40} className="text-slate-200" />
                      <p className="text-slate-500 text-sm">No applications found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredApps.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="font-bold text-slate-900 dark:text-white">{app.company}</div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-tighter mt-0.5">{app.portal || 'Direct'}</div>
                    </td>
                    <td className="px-8 py-5 text-slate-600 dark:text-slate-400 font-medium">{app.job_title}</td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-[60px] h-1.5 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                          <div className="bg-blue-500 h-full" style={{ width: `${app.fit_score}%` }}></div>
                        </div>
                        <span className="text-xs font-bold text-blue-500">{app.fit_score}%</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-[10px] font-bold uppercase tracking-widest">
                        {app.current_status}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-slate-500">
                      {new Date(app.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a 
                          href={app.source_url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="p-2 bg-slate-100 dark:bg-white/10 rounded-lg text-slate-500 hover:text-blue-500 transition-colors"
                        >
                          <ExternalLink size={14} />
                        </a>
                        <button 
                          onClick={() => handleDelete(app.id)}
                          className="p-2 bg-slate-100 dark:bg-white/10 rounded-lg text-slate-500 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
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
