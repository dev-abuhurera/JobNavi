'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { Toaster, toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export interface AppNotification {
  id: string
  title: string
  description?: string
  level: 'info' | 'success' | 'warning' | 'error'
  timestamp: Date
  read: boolean
  link?: string
}

interface NotificationContextType {
  notifications: AppNotification[]
  unreadCount: number
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAll: () => void
  addNotification: (notif: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const supabase = createClient()
  const router = useRouter()

  const addNotification = useCallback((notif: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotif: AppNotification = {
      ...notif,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date(),
      read: false,
    }

    setNotifications(prev => [newNotif, ...prev].slice(0, 30))

    // Trigger Sonner toast
    const options = {
      description: notif.description,
      action: notif.link ? {
        label: 'View',
        onClick: () => router.push(notif.link!),
      } : undefined,
    }

    switch (notif.level) {
      case 'success':
        toast.success(notif.title, options)
        break
      case 'error':
        toast.error(notif.title, options)
        break
      case 'warning':
        toast.warning(notif.title, options)
        break
      default:
        toast.info(notif.title, options)
        break
    }
  }, [router])

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }, [])

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  // Supabase Realtime setup
  useEffect(() => {
    let tasksChannel: any = null
    let jobsChannel: any = null
    let appsChannel: any = null
    let logsChannel: any = null

    supabase.auth.getUser().then(({ data }: { data: any }) => {
      const uid = data.user?.id
      if (!uid) return

      const prefix = `realtime-${uid}-${Math.random().toString(36).substring(2, 6)}`

      // 1. Discovery tasks realtime
      tasksChannel = supabase.channel(`${prefix}-tasks`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'discovery_tasks', filter: `user_id=eq.${uid}` }, (payload: any) => {
          const newStatus = payload.new.status
          const oldStatus = payload.old?.status
          if (newStatus !== oldStatus) {
            if (newStatus === 'completed') {
              addNotification({
                title: 'Discovery Mission Completed!',
                description: 'New Easy Apply job matches found. Click to review in Approvals.',
                level: 'success',
                link: '/dashboard/approvals',
              })
            } else if (newStatus === 'failed') {
              addNotification({
                title: 'Discovery Mission Failed',
                description: payload.new.error_message || 'Could not complete job discovery.',
                level: 'error',
                link: '/dashboard/discovery',
              })
            }
          }
        })
        .subscribe()

      // 2. Jobs discovered realtime
      jobsChannel = supabase.channel(`${prefix}-jobs`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jobs', filter: `user_id=eq.${uid}` }, (payload: any) => {
          const job = payload.new
          addNotification({
            title: `New Job: ${job.title}`,
            description: `${job.company || 'Company'} · ${job.fit_score ? `${job.fit_score}% AI Match` : 'Awaiting Review'}`,
            level: 'info',
            link: '/dashboard/approvals',
          })
        })
        .subscribe()

      // 3. Applications status realtime
      appsChannel = supabase.channel(`${prefix}-apps`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'applications', filter: `user_id=eq.${uid}` }, (payload: any) => {
          const app = payload.new
          const oldStatus = payload.old?.current_status
          if (app.current_status !== oldStatus) {
            if (app.current_status === 'applied') {
              addNotification({
                title: 'Application Submitted!',
                description: `Successfully applied to ${app.job_title || 'Position'} at ${app.company || 'Company'}`,
                level: 'success',
                link: '/dashboard/applications',
              })
            } else if (app.current_status === 'processing') {
              addNotification({
                title: 'Agent Applying...',
                description: `Submitting application for ${app.job_title || 'Position'} at ${app.company || 'Company'}`,
                level: 'info',
                link: '/dashboard/applications',
              })
            } else if (app.current_status === 'failed') {
              addNotification({
                title: 'Application Failed',
                description: app.notes || `Failed for ${app.job_title || 'Position'} at ${app.company || 'Company'}`,
                level: 'error',
                link: '/dashboard/applications',
              })
            }
          }
        })
        .subscribe()

      // 4. Activity Logs error alerts realtime
      logsChannel = supabase.channel(`${prefix}-logs`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs', filter: `user_id=eq.${uid}` }, (payload: any) => {
          const log = payload.new
          if (log.level === 'error') {
            addNotification({
              title: 'Agent Worker Alert',
              description: log.msg,
              level: 'error',
              link: '/dashboard/logs',
            })
          }
        })
        .subscribe()
    })

    return () => {
      if (tasksChannel) supabase.removeChannel(tasksChannel)
      if (jobsChannel) supabase.removeChannel(jobsChannel)
      if (appsChannel) supabase.removeChannel(appsChannel)
      if (logsChannel) supabase.removeChannel(logsChannel)
    }
  }, [addNotification, supabase])

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, clearAll, addNotification }}>
      {children}
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          className: '!rounded-2xl !font-sans !text-xs !shadow-xl !backdrop-blur-xl !border-slate-200/80',
        }}
      />
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}
