import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const serviceClient = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await serviceClient
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
