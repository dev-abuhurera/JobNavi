'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Bell, CheckCircle2, AlertCircle, Info, Sparkles, Check, Trash2, ExternalLink } from 'lucide-react'
import { useNotifications, AppNotification } from '@/components/providers/NotificationProvider'
import { useRouter } from 'next/navigation'

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleNotificationClick = (n: AppNotification) => {
    markAsRead(n.id)
    if (n.link) {
      router.push(n.link)
      setOpen(false)
    }
  }

  const renderIcon = (level: AppNotification['level']) => {
    switch (level) {
      case 'success':
        return <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
      case 'error':
        return <AlertCircle size={16} className="text-rose-600 shrink-0" />
      case 'warning':
        return <Sparkles size={16} className="text-amber-600 shrink-0" />
      default:
        return <Info size={16} className="text-sky-600 shrink-0" />
    }
  }

  return (
    <div className="relative" ref={ref}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2.5 rounded-2xl bg-white/80 hover:bg-white border border-slate-200/80 hover:border-slate-300 text-slate-600 hover:text-slate-900 transition-all shadow-2xs active:scale-95 flex items-center justify-center"
        aria-label="Open notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow-md shadow-emerald-500/30 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Menu */}
      {open && (
        <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white/95 backdrop-blur-3xl border border-white/90 rounded-3xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          
          {/* Popover Header */}
          <div className="px-5 py-3.5 border-b border-slate-200/60 bg-slate-50/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-bold text-slate-900">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-500/10 text-emerald-700 border border-emerald-200">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  title="Mark all as read"
                  className="p-1.5 rounded-xl text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 text-[11px] font-bold transition-all flex items-center gap-1"
                >
                  <Check size={14} /> Read all
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  title="Clear all notifications"
                  className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Notifications Scroll List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100/80 p-1">
            {notifications.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto shadow-2xs">
                  <Bell size={20} />
                </div>
                <p className="text-xs font-bold text-slate-700">No new notifications</p>
                <p className="text-[11px] text-slate-400">Agent activity alerts will appear here in real-time.</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-3.5 rounded-2xl transition-all cursor-pointer flex items-start gap-3 ${
                    !n.read ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : 'hover:bg-slate-50/80'
                  }`}
                >
                  <div className="mt-0.5">{renderIcon(n.level)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={`text-xs font-bold truncate ${!n.read ? 'text-slate-900' : 'text-slate-700'}`}>
                        {n.title}
                      </h4>
                      <span className="text-[9px] font-mono font-medium text-slate-400 shrink-0">
                        {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {n.description && (
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                        {n.description}
                      </p>
                    )}
                  </div>
                  {n.link && (
                    <ExternalLink size={12} className="text-slate-400 shrink-0 self-center" />
                  )}
                </div>
              ))
            )}
          </div>

        </div>
      )}
    </div>
  )
}
