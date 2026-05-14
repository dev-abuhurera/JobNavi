'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Settings, User, Shield, Bell, Cloud, Link2, RefreshCw } from 'lucide-react'

export default function SettingsPage() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    
    const { data } = await supabase.from('profiles').select('*').eq('user_id', user.id).single()
    if (data) setProfile(data)
    setLoading(false)
  }

  const sections = [
    { id: 'profile', label: 'User Profile', icon: User },
    { id: 'portals', label: 'Portal Connectivity', icon: Link2 },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
  ]

  const [saving, setSaving] = useState(false)
  const [activeSec, setActiveSec] = useState('profile')

  const handleSaveProfile = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: profile.full_name,
        // Add other fields you want to save here
      })
      .eq('user_id', user.id)

    if (error) {
      alert(`Error saving profile: ${error.message}`)
    } else {
      alert('Profile saved successfully!')
    }
    setSaving(false)
  }

  return (
    <div className="animate-in fade-in duration-700">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400">Configure your agent preferences and account connections.</p>
      </header>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Navigation */}
        <aside className="w-full lg:w-64 space-y-2">
          {sections.map(s => (
            <button 
              key={s.id}
              onClick={() => setActiveSec(s.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeSec === s.id 
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' 
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <s.icon size={18} />
              <span className="font-bold text-sm">{s.label}</span>
            </button>
          ))}
        </aside>

        {/* Content Area */}
        <div className="flex-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-3xl p-10 shadow-sm">
          {activeSec === 'profile' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <div className="flex items-center gap-6 mb-8">
                <div className="w-20 h-20 rounded-full bg-blue-500/10 border-2 border-blue-500/20 flex items-center justify-center text-blue-500 text-3xl font-bold uppercase">
                  {profile?.full_name?.charAt(0) || 'U'}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{profile?.full_name || 'Your Name'}</h3>
                  <p className="text-sm text-slate-500">Full stack developer • Remote preferred</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Full Name</label>
                  <input 
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-white"
                    value={profile?.full_name || ''}
                    onChange={e => setProfile({...profile, full_name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Phone Number</label>
                  <input 
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-white"
                    placeholder="+1 234 567 890"
                    value={profile?.phone || ''}
                    onChange={e => setProfile({...profile, phone: e.target.value})}
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 dark:border-white/5 flex justify-end">
                <button 
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold px-8 py-3 rounded-2xl transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
                >
                  {saving && <RefreshCw className="animate-spin" size={16} />}
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </div>
          )}

          {activeSec === 'portals' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
              <div className="p-6 rounded-2xl border border-blue-500/10 bg-blue-500/5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#0077b5] rounded-xl flex items-center justify-center text-white text-lg font-bold">in</div>
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">LinkedIn Connected</div>
                    <div className="text-[11px] text-emerald-500 font-bold uppercase tracking-widest">Active & Authenticated</div>
                  </div>
                </div>
                <button className="text-xs font-bold text-red-500 hover:underline">Disconnect</button>
              </div>

              <div className="p-6 rounded-2xl border border-slate-100 dark:border-white/10 flex items-center justify-between opacity-50 grayscale">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#2164f3] rounded-xl flex items-center justify-center text-white text-lg font-bold">I</div>
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">Indeed</div>
                    <div className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">Not Connected</div>
                  </div>
                </div>
                <button className="text-xs font-bold text-blue-500 hover:underline">Connect</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
