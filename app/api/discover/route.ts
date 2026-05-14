import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { keywords, location } = await request.json()

  // 1. Create a discovery task in the DB
  const { data: task, error: taskError } = await supabase
    .from('discovery_tasks')
    .insert({
      user_id: user.id,
      keywords,
      location,
      status: 'pending'
    })
    .select()
    .single()

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 })
  }

  // 2. Trigger the background worker (Inngest or Webhook)
  // fetch('YOUR_WORKER_URL', { method: 'POST', body: JSON.stringify({ taskId: task.id }) })

  return NextResponse.json({ success: true, taskId: task.id })
}
