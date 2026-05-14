import Sidebar from '@/components/dashboard/Sidebar'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen bg-[#f8fafc] dark:bg-black relative overflow-hidden">
      {/* Sidebar - Desktop */}
      <Sidebar user={user} />
      
      {/* Main Content */}
      <main className="flex-1 h-screen overflow-y-auto relative z-10">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
