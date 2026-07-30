import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('portal_sessions')
    .select('portal, saved_at')
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Derive status: if a row exists → 'active', else null
  const portals = ['linkedin']
  const statusMap: Record<string, string | null> = {}
  for (const p of portals) {
    const row = data?.find(d => d.portal === p)
    statusMap[p] = row ? 'active' : null
  }

  return NextResponse.json({ sessions: statusMap })
}
