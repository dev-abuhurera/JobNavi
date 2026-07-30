'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LayoutDashboard, Search, Target, Activity, CheckCircle, FileText, Settings, Zap, LogOut, Sparkles } from 'lucide-react'

const NAV = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard, section: 'Main' },
  { label: 'Discover Jobs', href: '/dashboard/discovery', icon: Search, section: 'Main' },
  { label: 'Applications', href: '/dashboard/applications', icon: Target, section: 'Main' },
  { label: 'Session Logs', href: '/dashboard/logs', icon: Activity, section: 'Agent Control' },
  { label: 'Approvals', href: '/dashboard/approvals', icon: CheckCircle, section: 'Agent Control' },
  { label: 'Resume Hub', href: '/dashboard/resume', icon: FileText, section: 'Configuration' },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings, section: 'Configuration' },
]
const SECTIONS = Array.from(new Set(NAV.map(i => i.section)))

export default function Sidebar({ user }: { user: { email?: string } | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const logout = async () => {
    await supabase.auth.signOut()
    router.refresh()
    router.push('/login')
  }

  return (
    <aside className="w-72 h-screen bg-white/70 backdrop-blur-3xl border-r border-white/90 shadow-[4px_0_30px_rgba(0,0,0,0.03)] flex flex-col p-6 select-none shrink-0">
      
      {/* Brand Header */}
      <div className="flex items-center justify-between mb-4 px-1 pt-1">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
            <Zap size={18} className="text-white" fill="currentColor" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-display text-lg font-bold tracking-tight text-slate-900">JobNavi</span>
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-md bg-emerald-500/10 text-emerald-700 border border-emerald-200">
              AI
            </span>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-200/80 backdrop-blur-md">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          Live
        </span>
      </div>

      {/* Partition Divider Line */}
      <div className="border-b border-slate-200/60 mb-4" />

      {/* Nav Menu */}
      <nav className="flex-1 space-y-6 overflow-y-auto pr-1">
        {SECTIONS.map(section => (
          <div key={section}>
            <h3 className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-3">{section}</h3>
            <div className="space-y-1">
              {NAV.filter(i => i.section === section).map(item => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/20 scale-[1.02]'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/80 hover:shadow-2xs'
                    }`}
                  >
                    <item.icon size={18} className={active ? 'text-white' : 'text-slate-400 group-hover:text-slate-700'} />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User Account Footer */}
      <div className="mt-auto pt-4 border-t border-slate-200/60">
        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/90 border border-white shadow-[0_4px_20px_rgba(0,0,0,0.03)] backdrop-blur-2xl hover:shadow-md transition-all duration-300 group">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-400 text-white font-extrabold font-mono text-sm flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0 uppercase border border-white/40">
            {user?.email?.charAt(0) || 'U'}
          </div>
          <div className="overflow-hidden flex-1">
            <div className="text-xs font-bold text-slate-900 truncate">{user?.email || 'Not signed in'}</div>
            <div className="text-[10px] font-medium text-slate-400 truncate">Logged in</div>
          </div>
          <button
            onClick={logout}
            aria-label="Sign out"
            title="Sign out"
            className="p-2.5 rounded-xl text-slate-400 hover:text-rose-600 bg-slate-100/80 hover:bg-rose-50 border border-slate-200/60 hover:border-rose-200 transition-all active:scale-90 shadow-2xs"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}