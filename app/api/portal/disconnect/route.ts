import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import fs from 'fs'
import path from 'path'

const serviceClient = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function handleDisconnect(req: Request) {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const portal = body.portal || 'linkedin'

  if (!portal) {
    return NextResponse.json({ error: 'portal required' }, { status: 400 })
  }

  // Delete from portal_sessions using service role client to bypass RLS limits
  const { error: err1 } = await serviceClient
    .from('portal_sessions')
    .delete()
    .eq('user_id', user.id)
    .eq('portal', portal)

  // Also delete from portal_accounts table if present
  await serviceClient
    .from('portal_accounts')
    .delete()
    .eq('user_id', user.id)
    .eq('portal', portal)

  if (err1) {
    return NextResponse.json({ error: err1.message }, { status: 500 })
  }

  // Also remove local disk session file if exists
  try {
    const localDir = path.join(process.cwd(), '.user_context', user.id)
    const localFile = path.join(localDir, `${portal}_state.json`)
    if (fs.existsSync(localFile)) {
      fs.unlinkSync(localFile)
    }
  } catch {}

  return NextResponse.json({ success: true, message: `${portal} portal disconnected` })
}

export async function POST(req: Request) {
  return handleDisconnect(req)
}

export async function DELETE(req: Request) {
  return handleDisconnect(req)
}
