import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(req: Request) {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { portal } = await req.json()

  if (!portal) {
    return NextResponse.json({ error: 'portal required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('portal_sessions')
    .delete()
    .eq('user_id', user.id)
    .eq('portal', portal)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
