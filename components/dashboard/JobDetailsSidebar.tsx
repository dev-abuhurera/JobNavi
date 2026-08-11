'use client'

import { useState, useEffect } from 'react'
import {
  X,
  Building2,
  MapPin,
  ExternalLink,
  Sparkles,
  DollarSign,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Mail,
  Phone,
  Briefcase,
  Layers,
  Check,
  XCircle,
  Trash2,
  Share2,
  Copy,
  Info,
  ShieldCheck,
  Zap,
  TrendingUp,
  FileText
} from 'lucide-react'
import { extractStipendOrSalary, extractRecruiterContacts, formatJobDescription } from '@/lib/utils/job-details'
import { toast } from 'sonner'

interface JobDetailsSidebarProps {
  isOpen: boolean
  onClose: () => void
  job: any | null
  onApprove?: (job: any, skillExp?: Record<string, number>) => Promise<void> | void
  onReject?: (job: any) => Promise<void> | void
  onDelete?: (id: string | number) => Promise<void> | void
  userProfile?: any
}

export function JobDetailsSidebar({
  isOpen,
  onClose,
  job,
  onApprove,
  onReject,
  onDelete,
  userProfile
}: JobDetailsSidebarProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'description' | 'skills' | 'history'>('overview')
  const [skillExp, setSkillExp] = useState<Record<string, number>>({})
  const [copied, setCopied] = useState(false)
  const [submittingAction, setSubmittingAction] = useState(false)

  // Sync skill experience defaults when job opens
  useEffect(() => {
    if (!job) return
    const pdSkillsExp: Record<string, number> = userProfile?.skills_experience || {}
    const defaultYrs = Number(userProfile?.years_of_experience) || 3
    const techStack: string[] = job.tech_stack || []

    const initialExp: Record<string, number> = {}
    for (const tech of techStack) {
      initialExp[tech] = pdSkillsExp[tech] !== undefined ? pdSkillsExp[tech] : defaultYrs
    }
    if (job.metadata?.skills_experience) {
      Object.assign(initialExp, job.metadata.skills_experience)
    }
    setSkillExp(initialExp)
    setActiveTab('overview')
  }, [job, userProfile])

  // ESC key listener to close sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !job) return null

  const compensation = extractStipendOrSalary(job)
  const contacts = extractRecruiterContacts(job)
  const formattedDesc = formatJobDescription(job.description)
  const fitScore = typeof job.fit_score === 'number' ? job.fit_score : (job.fit_score ? Number(job.fit_score) : 75)

  const isDiscovered = job.status === 'discovered' || !job.current_status
  const appStatus = (job.current_status || job.status || 'discovered').toLowerCase()

  const copyJobLink = () => {
    const link = job.source_url || window.location.href
    navigator.clipboard.writeText(link)
    setCopied(true)
    toast.success('Link copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleApproveClick = async () => {
    if (!onApprove) return
    setSubmittingAction(true)
    try {
      await onApprove(job, skillExp)
      onClose()
    } finally {
      setSubmittingAction(false)
    }
  }

  const handleRejectClick = async () => {
    if (!onReject) return
    setSubmittingAction(true)
    try {
      await onReject(job)
      onClose()
    } finally {
      setSubmittingAction(false)
    }
  }

  const handleDeleteClick = async () => {
    if (!onDelete) return
    setSubmittingAction(true)
    try {
      await onDelete(job.id)
      onClose()
    } finally {
      setSubmittingAction(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
      {/* Dark Glass Backdrop Overlay */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-white/95 backdrop-blur-3xl border-l border-slate-200/80 shadow-2xl flex flex-col text-slate-900 transition-all duration-300">
          
          {/* Top Glass Header */}
          <div className="p-6 border-b border-slate-200/80 bg-slate-50/60 backdrop-blur-md flex items-start justify-between gap-4 sticky top-0 z-10">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-lg shadow-lg shadow-emerald-500/20 shrink-0">
                {job.company?.[0]?.toUpperCase() || 'J'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {/* Status Badge */}
                  {appStatus === 'applied' && (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 size={12} className="text-emerald-600" /> Applied
                    </span>
                  )}
                  {(appStatus === 'processing' || appStatus === 'applying') && (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 border border-amber-200 animate-pulse">
                      <Sparkles size={12} className="text-amber-600" /> Applying...
                    </span>
                  )}
                  {(appStatus === 'failed' || appStatus === 'closed') && (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-700 border border-rose-200">
                      <AlertCircle size={12} className="text-rose-600" /> {appStatus === 'closed' ? 'Closed' : 'Failed'}
                    </span>
                  )}
                  {(appStatus === 'discovered' || appStatus === 'pending') && (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-700 border border-sky-200">
                      <Clock size={12} className="text-sky-600" /> Discovered / Pending
                    </span>
                  )}

                  {/* AI Fit Score Pill */}
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                    <Sparkles size={11} className="text-emerald-600" /> {fitScore}% AI Fit
                  </span>
                </div>

                <h2 className="font-display text-xl font-bold text-slate-900 truncate leading-snug">
                  {job.title || job.job_title}
                </h2>
                <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 mt-1 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Building2 size={14} className="text-slate-400" />
                    <span>{job.company}</span>
                  </div>
                  {job.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin size={14} className="text-slate-400" />
                      <span>{job.location}</span>
                    </div>
                  )}
                  {job.source && (
                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                      <Briefcase size={13} className="text-slate-400" />
                      <span>{job.source}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Action & Close Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {job.source_url && (
                <a
                  href={job.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all shadow-2xs"
                  title="Open Original Job Posting"
                >
                  <ExternalLink size={18} />
                </a>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-2xl bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all shadow-2xs"
                title="Close Sidebar"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center border-b border-slate-200/80 bg-slate-50/40 px-6 gap-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-3 px-4 text-xs font-bold transition-all relative border-b-2 ${
                activeTab === 'overview'
                  ? 'border-emerald-600 text-emerald-700 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Overview & Stipend
            </button>
            <button
              onClick={() => setActiveTab('description')}
              className={`py-3 px-4 text-xs font-bold transition-all relative border-b-2 ${
                activeTab === 'description'
                  ? 'border-emerald-600 text-emerald-700 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Full Job Description
            </button>
            {job.tech_stack && job.tech_stack.length > 0 && (
              <button
                onClick={() => setActiveTab('skills')}
                className={`py-3 px-4 text-xs font-bold transition-all relative border-b-2 ${
                  activeTab === 'skills'
                    ? 'border-emerald-600 text-emerald-700 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Required Skills ({job.tech_stack.length})
              </button>
            )}
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {activeTab === 'overview' && (
              <>
                {/* Prominent Stipend / Compensation Highlight Card */}
                <div className="bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-white border border-emerald-300/80 rounded-3xl p-5 shadow-xs relative overflow-hidden space-y-3">
                  <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase tracking-wider font-mono">
                      <DollarSign size={16} className="text-emerald-600" />
                      <span>Compensation & Stipend Details</span>
                    </div>
                    {compensation.type !== 'not_specified' && (
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-800 border border-emerald-300">
                        {compensation.type.toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-2">
                    <div className="text-2xl font-display font-extrabold text-slate-900 tracking-tight">
                      {compensation.text}
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    {compensation.type === 'stipend' && 'Includes monthly fixed stipend allowance as specified in listing.'}
                    {compensation.type === 'salary' && 'Annual estimated CTC / base salary range for this role.'}
                    {compensation.type === 'hourly' && 'Hourly rate compensation offered by company.'}
                    {compensation.type === 'unpaid' && 'This is an unpaid internship or training program.'}
                    {compensation.type === 'not_specified' && 'Salary details not explicitly published in summary. Auto-filler uses your profile salary preference ($' + (userProfile?.expected_salary || '80000') + ') during application submission.'}
                  </p>
                </div>

                {/* AI Fit Match Summary Card */}
                <div className="bg-white/80 border border-slate-200/80 rounded-3xl p-5 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                        <Sparkles size={18} />
                      </div>
                      <div>
                        <h4 className="font-display font-bold text-sm text-slate-900">AI Compatibility Analysis</h4>
                        <p className="text-[11px] text-slate-500">Evaluated against master resume & profile skills</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xl font-bold text-emerald-700">{fitScore}%</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fit Score</div>
                    </div>
                  </div>

                  {job.match_reason && (
                    <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3.5 text-xs text-slate-700 leading-relaxed">
                      <span className="font-bold text-slate-900">Match Reason: </span>
                      {job.match_reason}
                    </div>
                  )}

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${fitScore}%` }}
                    />
                  </div>
                </div>

                {/* Quick Info Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/80 border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <Calendar size={13} className="text-slate-400" /> Discovered Date
                    </div>
                    <div className="text-sm font-semibold text-slate-800">
                      {job.created_at || job.date_found
                        ? new Date(job.created_at || job.date_found).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })
                        : 'Recently'}
                    </div>
                  </div>

                  <div className="bg-white/80 border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <Zap size={13} className="text-slate-400" /> Application Type
                    </div>
                    <div className="text-sm font-semibold text-slate-800 capitalize">
                      {job.application_type ? job.application_type.replace(/_/g, ' ') : 'Easy Apply / Auto Form'}
                    </div>
                  </div>
                </div>

                {/* Recruiter Contacts Box (If detected) */}
                {(contacts.email || contacts.phone) && (
                  <div className="bg-sky-500/5 border border-sky-200/80 rounded-3xl p-5 shadow-2xs space-y-3">
                    <h4 className="font-display font-bold text-xs uppercase tracking-wider text-sky-900 font-mono flex items-center gap-2">
                      <Mail size={15} className="text-sky-600" /> Recruiter Contact Information
                    </h4>
                    <div className="space-y-2 text-xs font-medium text-slate-700">
                      {contacts.email && (
                        <div className="flex items-center gap-2">
                          <Mail size={14} className="text-slate-400" />
                          <a href={`mailto:${contacts.email}`} className="text-sky-700 hover:underline font-semibold">
                            {contacts.email}
                          </a>
                        </div>
                      )}
                      {contacts.phone && (
                        <div className="flex items-center gap-2">
                          <Phone size={14} className="text-slate-400" />
                          <span>{contacts.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tech Stack Preview */}
                {job.tech_stack && job.tech_stack.length > 0 && (
                  <div className="space-y-2.5">
                    <h4 className="font-display font-bold text-xs uppercase tracking-wider text-slate-400 font-mono">
                      Target Technologies
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {job.tech_stack.map((tech: string) => (
                        <span
                          key={tech}
                          className="font-mono text-xs font-bold px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'description' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                    <FileText size={18} className="text-emerald-600" /> Complete Job Description
                  </h3>
                  <button
                    onClick={copyJobLink}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-emerald-700 bg-slate-100 hover:bg-emerald-50 px-3 py-1.5 rounded-xl border border-slate-200 transition-all"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy Posting Link'}
                  </button>
                </div>

                <div className="bg-slate-50/80 border border-slate-200/80 rounded-3xl p-6 shadow-2xs font-sans text-xs text-slate-700 leading-relaxed space-y-4 whitespace-pre-wrap selection:bg-emerald-100 min-h-[160px]">
                  {formattedDesc}
                </div>
              </div>
            )}

            {activeTab === 'skills' && job.tech_stack && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">Required Skills & Experience</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Verify or tune your experience level (years) for each required skill before applying.
                  </p>
                </div>

                <div className="space-y-3">
                  {job.tech_stack.map((tech: string) => (
                    <div
                      key={tech}
                      className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-700 font-bold flex items-center justify-center font-mono text-xs">
                          {tech[0]?.toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-900 text-xs">{tech}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-bold text-slate-400 font-mono">Years:</label>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={skillExp[tech] ?? 3}
                          onChange={e =>
                            setSkillExp(prev => ({ ...prev, [tech]: Math.max(0, parseInt(e.target.value) || 0) }))
                          }
                          className="w-16 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-center text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Sticky Bottom Actions Footer */}
          <div className="p-6 border-t border-slate-200/80 bg-slate-50/80 backdrop-blur-md flex items-center justify-between gap-3 sticky bottom-0 z-10">
            <div className="flex items-center gap-2">
              {job.source_url && (
                <a
                  href={job.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-all shadow-2xs"
                >
                  <ExternalLink size={15} /> View Post
                </a>
              )}
              {onDelete && (
                <button
                  onClick={handleDeleteClick}
                  disabled={submittingAction}
                  className="p-2.5 rounded-2xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all shadow-2xs"
                  title="Delete Job Record"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {isDiscovered && onApprove && (
                <>
                  {onReject && (
                    <button
                      onClick={handleRejectClick}
                      disabled={submittingAction}
                      className="py-2.5 px-4 rounded-2xl border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs transition-all shadow-2xs"
                    >
                      Pass / Skip
                    </button>
                  )}
                  <button
                    onClick={handleApproveClick}
                    disabled={submittingAction}
                    className="py-2.5 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 active:scale-95"
                  >
                    <CheckCircle2 size={16} /> Approve & Auto-Apply
                  </button>
                </>
              )}

              {!isDiscovered && (
                <button
                  onClick={onClose}
                  className="py-2.5 px-5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-2xs"
                >
                  Done
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
