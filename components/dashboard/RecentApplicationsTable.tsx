'use client'

import { useState } from 'react'
import { Layers, Building2, CheckCircle2, ArrowRight } from 'lucide-react'
import { JobDetailsSidebar } from './JobDetailsSidebar'

interface RecentApplicationsTableProps {
  apps: any[]
}

export function RecentApplicationsTable({ apps }: RecentApplicationsTableProps) {
  const [selectedJob, setSelectedJob] = useState<any | null>(null)

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
    <>
      <div className="lg:col-span-2 bg-white/80 backdrop-blur-2xl border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs flex flex-col">
        <div className="p-4 border-b border-slate-200/60 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200/60 flex items-center justify-center text-slate-700 shrink-0">
              <Layers size={16} />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-slate-900">Application Pipeline</h3>
              <p className="text-xs text-slate-500">Click any row for complete description & stipend information.</p>
            </div>
          </div>
          
          <a
            href="/dashboard/applications"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 px-3 py-1.5 rounded-xl transition-all"
          >
            View All Applications <ArrowRight size={13} />
          </a>
        </div>

        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-200/60 bg-slate-50/30 select-none">
                <th className="px-4 py-2.5 font-mono font-bold uppercase text-[9px] tracking-wider">Company</th>
                <th className="px-4 py-2.5 font-mono font-bold uppercase text-[9px] tracking-wider">Position</th>
                <th className="px-4 py-2.5 font-mono font-bold uppercase text-[9px] tracking-wider">AI Fit</th>
                <th className="px-4 py-2.5 font-mono font-bold uppercase text-[9px] tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {apps.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2 shadow-2xs">
                      <Layers size={20} />
                    </div>
                    <p className="text-slate-700 font-bold text-xs">No applications submitted yet.</p>
                    <p className="text-slate-400 text-[11px] mt-0.5">Start a discovery mission to begin auto-applying.</p>
                  </td>
                </tr>
              ) : (
                apps.slice(0, 6).map((app, i) => (
                  <tr
                    key={i}
                    onClick={() => openAppSidebar(app)}
                    className="group hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200/60 flex items-center justify-center text-slate-700 font-bold shrink-0">
                          <Building2 size={14} />
                        </div>
                        <span className="font-bold text-slate-900 text-xs group-hover:text-emerald-700 transition-colors">
                          {app.company}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium text-xs">{app.job_title}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all"
                            style={{ width: `${app.fit_score || 0}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs font-bold text-emerald-700">{app.fit_score || 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200/70 text-[9px] font-bold uppercase tracking-wider">
                        <CheckCircle2 size={11} /> {app.current_status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <JobDetailsSidebar
        isOpen={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        job={selectedJob}
      />
    </>
  )
}
