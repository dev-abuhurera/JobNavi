import { createClient } from '@/lib/supabase/server'
import { getJobs, getApplications } from '@/lib/supabase/db'
import { Activity, LayoutDashboard, Search, Target, CheckCircle, ArrowRight } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null

  const jobs = await getJobs(user.id)
  const apps = await getApplications(user.id)
  
  // Count jobs with status 'discovered' for approvals
  const awaitingApproval = jobs.filter(j => j.status === 'discovered').length

  const stats = [
    { label: 'Applications sent', value: apps.length, trend: '+2 this week' },
    { label: 'Active Interviews', value: 0, trend: '+1 this week' },
    { label: 'Awaiting Approval', value: awaitingApproval, trend: awaitingApproval > 0 ? 'Action required' : 'System is ready', color: awaitingApproval > 0 ? 'text-amber-500' : '' },
    { label: 'Average Match', value: '78%', trend: '+2% vs benchmark' },
  ]

  return (
    <div className="animate-in fade-in duration-700">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Overview</h1>
          <p className="text-slate-500 dark:text-slate-400">Welcome back to your job search mission.</p>
        </div>
      </header>

      {/* Real-time Status Banner */}
      <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 flex items-center gap-4 mb-8">
        <div className="animate-spin text-blue-500">
          <Activity size={14} />
        </div>
        <div className="text-[11px] font-bold text-blue-500 uppercase tracking-widest">Current Status:</div>
        <div className="text-sm text-slate-600 dark:text-slate-300 truncate">Agent is standby. Ready for discovery session.</div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{stat.label}</div>
            <div className={`text-4xl font-bold dark:text-white mb-2 ${stat.color || ''}`}>{stat.value}</div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">{stat.trend}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Action Required */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              Action Required
            </h3>
            <button className="text-[11px] font-bold text-blue-500 uppercase tracking-widest hover:underline flex items-center gap-1">
              Open Approvals <ArrowRight size={12} />
            </button>
          </div>
          <div className="p-12 text-center">
            <p className="text-sm text-slate-500">Agent is waiting for more job discoveries.</p>
          </div>
        </div>

        {/* Application Pipeline */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white">Application Pipeline</h3>
            <button className="text-[11px] font-bold text-blue-500 uppercase tracking-widest hover:underline flex items-center gap-1">
              Details <ArrowRight size={12} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-50 dark:border-white/5">
                  <th className="px-6 py-4 font-semibold uppercase text-[10px] tracking-wider">Company</th>
                  <th className="px-6 py-4 font-semibold uppercase text-[10px] tracking-wider">Position</th>
                  <th className="px-6 py-4 font-semibold uppercase text-[10px] tracking-wider">Fit</th>
                  <th className="px-6 py-4 font-semibold uppercase text-[10px] tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                {apps.slice(0, 5).map((app, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">{app.company}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{app.job_title}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                          <div className="bg-blue-500 h-full" style={{ width: `${app.fit_score || 0}%` }}></div>
                        </div>
                        <span className="text-xs font-bold text-blue-500">{app.fit_score}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-md bg-blue-500/10 text-blue-500 text-[10px] font-bold uppercase tracking-widest">
                        {app.current_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
