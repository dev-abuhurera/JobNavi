'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, XCircle, ExternalLink, Building2, MapPin, Trash2, CheckCircle2, Sparkles, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { JobDetailsSidebar } from '@/components/dashboard/JobDetailsSidebar'

export default function ApprovalsPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [selectedJob, setSelectedJob] = useState<any | null>(null)
  const [deletingId, setDeletingId] = useState<string | number | null>(null)

  const { data: approvalData, isLoading: loading, refetch } = useQuery({
    queryKey: ['approvals'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return { jobs: [], profile: {} }
      const [jobsRes, profileRes] = await Promise.all([
        supabase.from('jobs').select('*').eq('user_id', user.id).eq('status', 'discovered').order('fit_score', { ascending: false }),
        supabase.from('profiles').select('profile_data').eq('user_id', user.id).maybeSingle()
      ])
      return {
        jobs: jobsRes.data || [],
        profile: profileRes.data?.profile_data || {}
      }
    },
  })

  const jobs = approvalData?.jobs || []
  const userProfile = approvalData?.profile || {}

  const openJobModal = (job: any) => {
    setSelectedJob(job)
  }

  const handleAction = async (job: any, action: 'approved' | 'rejected', customSkillExp?: Record<string, number>) => {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return

    const finalSkillExp = customSkillExp || {}

    // Also sync skill experience back to user profile for future auto-fills
    if (action === 'approved' && Object.keys(finalSkillExp).length > 0) {
      const mergedExp = { ...(userProfile?.skills_experience || {}), ...finalSkillExp }
      try {
        await supabase.from('profiles').upsert({
          user_id: user.id,
          profile_data: { ...(userProfile || {}), skills_experience: mergedExp, skills: Object.keys(mergedExp) }
        }, { onConflict: 'user_id' })
      } catch {}
    }

    const { error } = await supabase
      .from('jobs')
      .update({ status: action })
      .eq('id', job.id)
      .eq('user_id', user.id)

    if (error) {
      toast.error('Could not update job status', { description: error.message })
      return
    }

    queryClient.invalidateQueries({ queryKey: ['approvals'] })
    if (selectedJob?.id === job.id) setSelectedJob(null)

    if (action === 'rejected') {
      toast.info('Job passed', { description: `Passed on "${job.title}" at ${job.company}` })
      return
    }

    const { data: existingApp } = await supabase
      .from('applications')
      .select('id')
      .eq('user_id', user.id)
      .eq('job_id', job.id)
      .maybeSingle()

    const appData = {
      user_id: user.id,
      job_id: job.id,
      company: job.company,
      job_title: job.title,
      location: job.location,
      source: job.source,
      fit_score: job.fit_score ?? null,
      current_status: 'pending',
      source_url: job.source_url,
      notes: JSON.stringify({ skills_experience: finalSkillExp }),
    }

    let appError;
    if (existingApp) {
      const { error } = await supabase.from('applications').update(appData).eq('id', existingApp.id)
      appError = error
    } else {
      const { error } = await supabase.from('applications').insert(appData)
      appError = error
    }

    queryClient.invalidateQueries({ queryKey: ['applications'] })

    if (appError) {
      toast.error('Failed to queue job', { description: appError.message })
      return
    }

    toast.success('Job Approved & Queued!', {
      description: `Authorized agent to auto-apply for "${job.title}" at ${job.company}.`,
    })
  }

  const confirmDelete = async (id: string | number) => {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    const { error } = await supabase.from('jobs').delete().eq('id', id).eq('user_id', user.id)
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      if (selectedJob?.id === id) setSelectedJob(null)
      toast.info('Job record deleted')
    } else {
      toast.error('Failed to delete job', { description: error.message })
    }
    setDeletingId(null)
  }

  return (
    <div className="space-y-6">
      {/* Fancy Glass Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Approvals</h1>
              <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200">
                {jobs.length} Pending Review
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-0.5">Click any job card to inspect requirements, complete description, stipend & skill experience before applying.</p>
          </div>
        </div>
      </header>

      {/* Main Glass Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="bg-white/60 border border-white/80 rounded-3xl p-6 space-y-4 animate-pulse">
              <div className="h-6 bg-slate-100 rounded-xl w-3/4" />
              <div className="h-4 bg-slate-100 rounded-xl w-1/2" />
              <div className="h-20 bg-slate-100 rounded-2xl" />
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white/70 backdrop-blur-3xl border border-white/90 rounded-3xl p-16 text-center shadow-[0_20px_50px_rgba(0,0,0,0.04)] space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
            <ShieldCheck size={28} />
          </div>
          <h3 className="font-display text-xl font-bold text-slate-900">All Caught Up!</h3>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">
            There are no jobs pending review. Launch a search mission from Discover Jobs to find new opportunities.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {jobs.map((job: any) => (
            <div
              key={job.id}
              onClick={() => openJobModal(job)}
              className="group relative bg-white/70 backdrop-blur-3xl border border-white/90 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.04)] hover:shadow-xl hover:scale-[1.01] cursor-pointer transition-all duration-300 flex flex-col justify-between space-y-5"
            >
              <div>
                {/* Header Row: Match Pill & Action Icons */}
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1 font-mono text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200">
                    <Sparkles size={13} className="text-emerald-600" /> {job.fit_score}% AI Match
                  </span>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {job.source_url && (
                      <a
                        href={job.source_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-all"
                        title="View Job Post"
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); setDeletingId(job.id) }}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                      title="Delete Record"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Job Title */}
                <h3 className="font-display text-lg font-bold text-slate-900 leading-snug mb-3">
                  {job.title}
                </h3>

                {/* Meta details */}
                <div className="space-y-1.5 text-xs font-semibold text-slate-600 mb-4">
                  <div className="flex items-center gap-2">
                    <Building2 size={15} className="text-slate-400 shrink-0" />
                    <span>{job.company}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin size={15} className="text-slate-400 shrink-0" />
                    <span>{job.location}</span>
                  </div>
                </div>

                {/* Tech Stack Pills preview */}
                {job.tech_stack && job.tech_stack.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {job.tech_stack.slice(0, 5).map((t: string) => (
                      <span key={t} className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Job Summary */}
                <div className="bg-white/60 border border-slate-200/70 rounded-2xl p-4 shadow-2xs">
                  <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                    {job.match_reason || job.description || 'Matches your target resume criteria and experience profile.'}
                  </p>
                </div>
              </div>

              {/* Pass vs Apply CTA Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={e => { e.stopPropagation(); handleAction(job, 'rejected') }}
                  className="py-3 px-4 rounded-2xl text-xs font-bold text-slate-700 hover:text-rose-600 bg-slate-100/80 hover:bg-rose-50 border border-slate-200/80 hover:border-rose-200/80 transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <XCircle size={16} /> Pass
                </button>
                <button
                  onClick={e => { e.stopPropagation(); openJobModal(job) }}
                  className="py-3 px-4 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all active:scale-95 shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle size={16} /> Review & Apply
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* JOB DETAILS & STIPEND SIDEBAR */}
      <JobDetailsSidebar
        isOpen={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        job={selectedJob}
        onApprove={(j, exp) => handleAction(j, 'approved', exp)}
        onReject={j => handleAction(j, 'rejected')}
        onDelete={confirmDelete}
        userProfile={userProfile}
      />

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <Trash2 size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Delete Job Discovery</h3>
              <p className="text-sm text-slate-500 mt-1">Are you sure you want to delete this job discovery record? This action cannot be undone.</p>
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