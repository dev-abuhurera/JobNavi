'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FileText, Upload, Trash2, CheckCircle, FileUp, Sparkles, FileSearch } from 'lucide-react'

export default function ResumeHubPage() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'info' | 'error', message: string } | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()
    
    if (data) setProfile(data)
    setLoading(false)
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setNotification({ type: 'info', message: 'Uploading and analyzing CV...' })
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const filePath = `${user.id}/resume.pdf`
    
    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(filePath, file, { upsert: true })

    if (!uploadError) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ resume_path: filePath })
        .eq('user_id', user.id)

      if (!updateError) {
        setProfile({ ...profile, resume_path: filePath })
        setNotification({ type: 'success', message: 'CV uploaded! Now, please ensure your profile summary is updated below.' })
        setTimeout(() => setNotification(null), 5000)
      } else {
        setNotification({ type: 'error', message: `Database Update Failed: ${updateError.message}` })
      }
    } else {
      console.error('Storage Error:', uploadError)
      setNotification({ type: 'error', message: `Storage Error: ${uploadError.message}. Make sure the "resumes" bucket exists in Supabase Storage.` })
    }
    setUploading(false)
  }

  return (
    <div className="animate-in fade-in duration-700">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Resume Hub</h1>
        <p className="text-slate-500 dark:text-slate-400">Manage the documents your agent uses for applications.</p>
      </header>

      {notification && (
        <div className={`mb-8 p-4 rounded-2xl border flex items-center gap-3 animate-in slide-in-from-top-4 duration-300 ${
          notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
          notification.type === 'info' ? 'bg-blue-500/10 border-blue-500/20 text-blue-500' :
          'bg-red-500/10 border-red-500/20 text-red-500'
        }`}>
          {notification.type === 'success' ? <CheckCircle size={18} /> : <Sparkles size={18} />}
          <p className="text-sm font-medium">{notification.message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Upload and Profile Data */}
        <div className="space-y-8">
          {/* Upload Card */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-3xl p-10 shadow-sm flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500 mb-6">
              <FileUp size={40} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Upload Master Resume</h3>
            <p className="text-sm text-slate-500 mb-8 max-w-xs">
              Upload your latest resume in PDF format for automated applications.
            </p>

            <label className="w-full relative group">
              <input 
                type="file" 
                accept=".pdf" 
                onChange={handleUpload}
                className="hidden" 
                disabled={uploading}
              />
              <div className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/20 cursor-pointer flex items-center justify-center gap-3">
                {uploading ? <Loader2 className="animate-spin" size={18} /> : (
                  <>
                    <Upload size={18} />
                    Choose PDF File
                  </>
                )}
              </div>
            </label>
            <p className="mt-4 text-[10px] text-slate-400 uppercase tracking-widest font-bold">Max size: 5MB • PDF Only</p>
          </div>

          {/* AI Matching Profile Data */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-3xl p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2 bg-purple-500/10 text-purple-500 rounded-lg">
                <Sparkles size={16} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">AI Search Profile</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-1">Experience Summary</label>
                <textarea 
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:text-white min-h-[100px]"
                  placeholder="Tell the AI about your background and what you're looking for..."
                  value={profile?.profile_data?.experience_summary || ''}
                  onChange={e => {
                    const newProfileData = { ...(profile?.profile_data || {}), experience_summary: e.target.value };
                    setProfile({ ...profile, profile_data: newProfileData });
                  }}
                />
              </div>
              
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 px-1">Key Skills (comma separated)</label>
                <input 
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:text-white"
                  placeholder="React, Node.js, Python, AWS..."
                  value={profile?.profile_data?.skills?.join(', ') || ''}
                  onChange={e => {
                    const skills = e.target.value.split(',').map(s => s.trim());
                    const newProfileData = { ...(profile?.profile_data || {}), skills };
                    setProfile({ ...profile, profile_data: newProfileData });
                  }}
                />
              </div>

              <button 
                onClick={async () => {
                  setUploading(true);
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) return;
                  const { error } = await supabase
                    .from('profiles')
                    .update({ profile_data: profile.profile_data })
                    .eq('user_id', user.id);
                  
                  if (!error) {
                    setNotification({ type: 'success', message: 'Profile updated! Smart Search is now ready.' });
                    setTimeout(() => setNotification(null), 5000);
                  }
                  setUploading(false);
                }}
                disabled={uploading}
                className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold py-3 rounded-xl text-sm transition-transform active:scale-[0.98]"
              >
                Save AI Profile
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Status */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-3xl p-8 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-500" />
              Active Document
            </h3>
            
            {profile?.resume_path ? (
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-xl flex items-center justify-center">
                    <FileText size={24} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">Master_Resume.pdf</div>
                    <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Storage Linked</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center border-2 border-dashed border-slate-100 dark:border-white/5 rounded-2xl">
                <p className="text-sm text-slate-400">No PDF uploaded yet.</p>
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/10 rounded-3xl p-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-white dark:bg-zinc-800 rounded-xl flex items-center justify-center text-blue-500 shadow-sm shrink-0">
                <FileSearch size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">How AI Matching Works</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  The agent uses your <strong>Experience Summary</strong> and <strong>Skills</strong> above to build a vector map of your profile. 
                  It then compares this map to every job description it finds to ensure you only see perfect matches.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Loader2({ className, size }: { className?: string, size?: number }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
}
