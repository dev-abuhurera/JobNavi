import { createClient } from '@/lib/supabase/server'
import { getJobs, deleteAllJobs, deleteJob } from '@/lib/supabase/db'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const jobs = await getJobs(user.id)
  return NextResponse.json(jobs)
}

export async function DELETE(request: Request) {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (id === 'all') {
    const success = await deleteAllJobs(user.id)
    return NextResponse.json({ success })
  }

  if (!id) {
    return NextResponse.json({ error: 'Missing job ID' }, { status: 400 })
  }

  const success = await deleteJob(id, user.id)
  return NextResponse.json({ success })
}
