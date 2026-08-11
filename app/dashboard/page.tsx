import { createClient } from '@/lib/supabase/server'
import { getJobs, getApplications } from '@/lib/supabase/db'
import { ArrowRight, Send, Briefcase, CheckCircle2, Target, Layers, Compass, Building2, Activity } from 'lucide-react'
import { RecentApplicationsTable } from '@/components/dashboard/RecentApplicationsTable'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [jobs, apps] = await Promise.all([
    getJobs(user.id),
    getApplications(user.id),
  ])

  const awaitingApproval = jobs.filter(j => j.status === 'discovered').length
  const appliedCount = apps.filter(a => a.current_status === 'applied').length
  const scored = apps.filter(a => typeof a.fit_score === 'number')
  const avgMatch = scored.length ? Math.round(scored.reduce((s, a) => s + a.fit_score, 0) / scored.length) : 0

  const stats = [
    {
      label: 'Applications Sent',
      value: appliedCount,
      sub: `${apps.length} Submissions`,
      icon: <Send size={16} className="text-white" />,
    },
    {
      label: 'Jobs Discovered',
      value: jobs.length,
      sub: 'In Discovery Pipeline',
      icon: <Briefcase size={16} className="text-white" />,
    },
    {
      label: 'Awaiting Approval',
      value: awaitingApproval,
      sub: awaitingApproval > 0 ? 'Pending Review' : 'All Jobs Reviewed',
      icon: <CheckCircle2 size={16} className="text-white" />,
    },
    {
      label: 'Average Match Score',
      value: scored.length ? `${avgMatch}%` : 'N/A',
      sub: `${scored.length} Scored by AI`,
      icon: <Target size={16} className="text-white" />,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Sleek Glass Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Overview</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-200 backdrop-blur-md">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              Live
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-0.5">Live overview of your job discovery and application pipeline.</p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/dashboard/logs"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white/80 hover:bg-white border border-slate-200/80 shadow-2xs transition-all active:scale-95"
          >
            <Activity size={15} className="text-emerald-600" /> Session Logs
          </a>
          <a
            href="/dashboard/discovery"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-sm shadow-emerald-600/20 transition-all active:scale-95"
          >
            <Compass size={15} /> Start Discovery Search
          </a>
        </div>
      </header>

      {/* 4 Compact Telemetry Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <div
            key={i}
            className="group bg-white/80 backdrop-blur-2xl border border-slate-200/80 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">{s.label}</span>
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-xs">
                {s.icon}
              </div>
            </div>

            <div>
              <div className="font-display text-2xl font-bold tracking-tight text-slate-900">
                {s.value}
              </div>
              <div className="mt-1.5 inline-flex items-center font-mono text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 border border-emerald-200/70">
                {s.sub}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 2-Column Main Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Left Column: Action Required Glass Card */}
        <div className="bg-white/80 backdrop-blur-2xl border border-slate-200/80 rounded-2xl p-5 shadow-2xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <h3 className="font-display font-bold text-base text-slate-900">Action Required</h3>
              </div>
              
              <a
                href="/dashboard/approvals"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 px-2.5 py-1 rounded-xl transition-all"
              >
                Open Approvals <ArrowRight size={13} />
              </a>
            </div>

            <p className="text-xs text-slate-500 font-medium">
              Approve jobs for your agent to apply.
            </p>
          </div>

          <div className="bg-emerald-500/5 border border-emerald-200/80 rounded-xl p-4 text-center space-y-3">
            {awaitingApproval > 0 ? (
              <>
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs border border-emerald-200/80">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <div className="text-base font-bold text-slate-900">{awaitingApproval} Job(s) Pending Review</div>
                  <p className="text-xs text-slate-500 mt-0.5">Review applicant profiles and match scores.</p>
                </div>
                <a
                  href="/dashboard/approvals"
                  className="inline-flex items-center justify-center w-full py-2.5 px-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all shadow-sm shadow-emerald-600/20 active:scale-95"
                >
                  Review Jobs Now
                </a>
              </>
            ) : (
              <>
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs border border-emerald-200/80">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">All Discovered Jobs Reviewed</div>
                  <p className="text-xs text-slate-500 mt-0.5">Your discovery pipeline is 100% up to date.</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Column: Application Pipeline Glass Table */}
        <RecentApplicationsTable apps={apps} />

      </div>
    </div>
  )
}