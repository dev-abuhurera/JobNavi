'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, 
  Search, 
  Target, 
  Activity, 
  CheckCircle, 
  FileText, 
  Settings, 
  Briefcase 
} from 'lucide-react'

interface SidebarProps {
  user: any
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()

  const navItems = [
    { label: 'Overview', href: '/dashboard', icon: LayoutDashboard, section: 'Main' },
    { label: 'Discover Jobs', href: '/dashboard/discovery', icon: Search, section: 'Main' },
    { label: 'Applications', href: '/dashboard/applications', icon: Target, section: 'Main' },
    { label: 'Session Logs', href: '/dashboard/logs', icon: Activity, section: 'Agent Control' },
    { label: 'Approvals', href: '/dashboard/approvals', icon: CheckCircle, section: 'Agent Control' },
    { label: 'Resume Hub', href: '/dashboard/resume', icon: FileText, section: 'Configuration' },
    { label: 'Settings', href: '/dashboard/settings', icon: Settings, section: 'Configuration' },
  ]

  const sections = Array.from(new Set(navItems.map(item => item.section)))

  return (
    <aside className="w-72 h-screen bg-black border-r border-white/10 flex flex-col p-8 z-20">
      <div className="flex items-center gap-3 mb-12 px-3">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-400 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/50">
          <Briefcase size={16} color="white" />
        </div>
        <span className="text-xl font-bold tracking-tight text-white">JobAgent.ai</span>
      </div>

      <div className="flex-1 space-y-8">
        {sections.map(section => (
          <div key={section}>
            <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-4 px-4">{section}</h3>
            <div className="space-y-1">
              {navItems.filter(item => item.section === section).map(item => {
                const isActive = pathname === item.href
                return (
                  <Link 
                    key={item.href} 
                    href={item.href}
                    className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 ${
                      isActive 
                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' 
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <item.icon size={18} />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto">
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5">
          <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold uppercase">
            {user.email?.charAt(0) || 'U'}
          </div>
          <div className="overflow-hidden">
            <div className="text-sm font-semibold text-white truncate">{user.email}</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Job Seeker</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
