'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { FileText, Upload, CheckCircle, FileUp, Loader2, Sparkles, ShieldCheck, CheckCircle2, Sliders, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

const PREF_FIELDS = [
  { key: 'requires_visa_sponsorship', label: 'Require visa sponsorship?', type: 'select', options: ['No', 'Yes'] },
  { key: 'work_authorized', label: 'Authorized to work in target country?', type: 'select', options: ['Yes', 'No'] },
  { key: 'willing_to_relocate', label: 'Willing to relocate?', type: 'select', options: ['Yes', 'No'] },
  { key: 'city', label: 'Location / City', type: 'text', placeholder: 'Islamabad' },
  { key: 'expected_salary', label: 'Expected annual salary ($)', type: 'text', placeholder: '80000' },
  { key: 'hourly_rate', label: 'Expected hourly rate ($ / hr)', type: 'text', placeholder: '35' },
  { key: 'notice_period', label: 'Notice period', type: 'text', placeholder: '2 weeks' },
  { key: 'gender', label: 'Gender (optional)', type: 'text', placeholder: 'Prefer not to say' },
  { key: 'ethnicity', label: 'Ethnicity (optional)', type: 'text', placeholder: 'Prefer not to say' },
]

const MAX_BYTES = 5 * 1024 * 1024

export default function ResumeHubPage() {
  const [localProfile, setLocalProfile] = useState<any>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null)
  const [saved, setSaved] = useState(false)
  const supabase = createClient()
  const queryClient = useQueryClient()

  const notify = (type: 'success' | 'info' | 'error', message: string) => {
    setNote({ type, message })
    setTimeout(() => setNote(null), 5000)

    if (type === 'success') {
      toast.success('Resume Hub', { description: message })
    } else if (type === 'error') {
      toast.error('Resume Hub', { description: message })
    } else {
      toast.info('Resume Hub', { description: message })
    }
  }

  const { data: fetchedProfile, refetch: fetchProfile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return null
      const { data } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle()
      return data || null
    },
  })

  useEffect(() => {
    if (fetchedProfile) {
      setLocalProfile(fetchedProfile)
    }
  }, [fetchedProfile])

  const profile = localProfile || fetchedProfile || {}

  const setPref = (key: string, val: any) =>
    setLocalProfile((p: any) => ({ ...p, profile_data: { ...(p?.profile_data || {}), [key]: val } }))

  const savePrefs = async () => {
    setSaving(true)
    setSaved(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { error } = await supabase
      .from('profiles')
      .upsert(
        { user_id: user.id, profile_data: profile?.profile_data || {} },
        { onConflict: 'user_id' }
      )

    setSaving(false)
    if (error) {
      notify('error', `Save failed: ${error.message}`)
    } else {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      notify('success', 'Preferences saved! These auto-fill matching questions during applications.')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_BYTES) {
      notify('error', 'That PDF is larger than 5MB. Try exporting a smaller version.')
      e.target.value = ''
      return
    }

    setUploading(true)
    notify('info', 'Uploading master CV...')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const filePath = `${user.id}/resume.pdf`
    const { error: upErr } = await supabase.storage.from('resumes').upload(filePath, file, { upsert: true })
    if (upErr) { notify('error', `Storage error: ${upErr.message}`); setUploading(false); return }

    const nowIso = new Date().toISOString()
    const { error: dbErr } = await supabase.from('profiles').upsert({
      user_id: user.id,
      resume_path: 'resume.pdf',
      profile_data: { 
        ...(profile?.profile_data || {}), 
        resume_filename: file.name,
        resume_updated_at: nowIso,
      },
    }, { onConflict: 'user_id' })

    if (dbErr) { notify('error', `Database update failed: ${dbErr.message}`); setUploading(false); return }

    notify('info', 'CV uploaded. Extracting text for AI matching...')

    try {
      const res = await fetch('/api/resume/parse', { method: 'POST' })
      const body = await res.json().catch(() => ({}))

      if (res.ok) {
        await fetchProfile()
        notify('success', 'CV parsed successfully. AI matching now uses your master resume!')
      } else {
        await fetchProfile()
        notify('error', body.error || 'Text extraction failed.')
      }
    } catch {
      notify('error', 'CV stored, but text extraction failed.')
    }

    e.target.value = ''
    setUploading(false)
  }

  const pd = profile?.profile_data || {}
  const hasText = Boolean(pd.resume_text)

  return (
    <div className="space-y-6">
      {/* Fancy Glass Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
            <FileText size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Resume Hub</h1>
              <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200">
                Master Profile
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-0.5">Manage your master resume document and application auto-fill preferences.</p>
          </div>
        </div>
      </header>

      {/* Floating Notification Banner */}
      {note && (
        <div className={`p-4 rounded-2xl border backdrop-blur-xl flex items-center gap-3 text-sm font-semibold shadow-xs ${
          note.type === 'success' ? 'bg-emerald-500/10 border-emerald-200 text-emerald-800' :
          note.type === 'info' ? 'bg-sky-500/10 border-sky-200 text-sky-800' :
          'bg-rose-500/10 border-rose-200 text-rose-800'
        }`}>
          {note.type === 'success' ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" /> : <AlertCircle size={18} className="shrink-0" />}
          <span>{note.message}</span>
        </div>
      )}

      {/* 2-Column Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column: CV Upload & Active Document Card */}
        <div className="space-y-6">
          
          {/* Upload Master Resume Glass Card */}
          <div className="bg-white/70 backdrop-blur-3xl border border-white/90 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.04)] space-y-5">
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900">Upload Master Resume</h3>
            </div>

            <label className="block w-full cursor-pointer">
              <input type="file" accept=".pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
              
              <div className="border-2 border-dashed border-emerald-300/80 hover:border-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all rounded-2xl p-8 text-center space-y-3 group">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center mx-auto shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                  {uploading ? <Loader2 className="animate-spin" size={26} /> : <FileUp size={26} />}
                </div>

                <div>
                  <div className="text-sm font-bold text-slate-900">
                    {uploading ? 'Processing Resume PDF...' : 'Click to Upload Resume PDF'}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Accepts PDF files up to 5MB.</p>
                </div>

                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-md shadow-emerald-600/20">
                  <Upload size={14} /> Choose PDF File
                </div>
              </div>
            </label>
          </div>

          {/* Active Document Status Card */}
          <div className="bg-white/70 backdrop-blur-3xl border border-white/90 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.04)] space-y-4">
            <div>
              <h3 className="font-display font-bold text-lg text-slate-900">Active Master Document</h3>
              <p className="text-xs text-slate-500 mt-0.5">AI matching automatically evaluates job descriptions against this CV.</p>
            </div>

            {profile?.resume_path ? (
              <div className="flex items-center gap-3.5 p-4 bg-gradient-to-r from-emerald-50/60 via-white/90 to-white border border-emerald-200/80 rounded-2xl shadow-xs">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
                  <FileText size={22} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="text-sm font-extrabold text-slate-900 truncate">{pd.resume_filename || 'master_resume.pdf'}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                      hasText ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-200' : 'bg-amber-500/10 text-amber-700 border border-amber-200'
                    }`}>
                      <CheckCircle2 size={11} /> {hasText ? `Parsed · ${pd.resume_text.length} chars` : 'Stored · Pending parse'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-white/40">
                <FileText size={24} className="text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-medium">No master resume uploaded yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Application Auto-Fill Preferences */}
        <div className="bg-white/70 backdrop-blur-3xl border border-white/90 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.04)] space-y-5">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-emerald-600" />
                <h3 className="font-display font-bold text-lg text-slate-900">Application Preferences</h3>
              </div>
              <ShieldCheck size={18} className="text-emerald-600" />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              These answers automatically fill application form questions when submitting applications.
            </p>
          </div>

          <div className="space-y-4">
            {PREF_FIELDS.map(f => (
              <div key={f.key} className="space-y-1.5">
                <label className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                  {f.label}
                </label>
                {f.type === 'select' ? (
                  <select
                    className="w-full bg-white/80 border border-slate-200/80 rounded-2xl p-3 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 shadow-2xs transition-all"
                    value={pd[f.key] || ''}
                    onChange={e => setPref(f.key, e.target.value)}
                  >
                    <option value="">Select option</option>
                    {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    className="w-full bg-white/80 border border-slate-200/80 rounded-2xl p-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 shadow-2xs transition-all"
                    placeholder={f.placeholder}
                    value={pd[f.key] || ''}
                    onChange={e => setPref(f.key, e.target.value)}
                  />
                )}
              </div>
            ))}

            {/* Skills Input */}
            <div className="space-y-1.5">
              <label className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                Key Skills (comma-separated)
              </label>
              <input
                className="w-full bg-white/80 border border-slate-200/80 rounded-2xl p-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 shadow-2xs transition-all"
                placeholder="JavaScript, React, Node.js, Python, AI Agents"
                value={pd.skills?.join(', ') || ''}
                onChange={e => setPref('skills', e.target.value.split(',').map(s => s.trim()))}
              />
            </div>

            {/* Save Preferences CTA */}
            <button
              onClick={savePrefs}
              disabled={saving || saved}
              className={`w-full py-3.5 px-6 rounded-2xl font-bold text-sm text-white transition-all shadow-md flex items-center justify-center gap-2 ${
                saved
                  ? 'bg-emerald-600 text-white shadow-emerald-600/20'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/25 active:scale-98'
              }`}
            >
              {saving ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span>Saving Preferences...</span>
                </>
              ) : saved ? (
                <>
                  <CheckCircle2 size={18} />
                  <span>Preferences Saved!</span>
                </>
              ) : (
                <>
                  <CheckCircle size={18} />
                  <span>Save Application Preferences</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}