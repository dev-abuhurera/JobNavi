import Sidebar from '@/components/dashboard/Sidebar'
import Header from '@/components/dashboard/Header'
import { NotificationProvider } from '@/components/providers/NotificationProvider'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <NotificationProvider>
      <div className="flex h-screen bg-paper overflow-hidden">
        <Sidebar user={user} />
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <Header user={user} />
          <main className="flex-1 overflow-y-auto p-8 max-w-6xl w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </NotificationProvider>
  )
}