import { createClient } from '@/lib/supabase/server'
import { getApplications, deleteAllApplications, deleteApplication } from '@/lib/supabase/db'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const applications = await getApplications(user.id)
  return NextResponse.json(applications)
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (id === 'all') {
    const success = await deleteAllApplications(user.id)
    return NextResponse.json({ success })
  }

  if (!id) {
    return NextResponse.json({ error: 'Missing application ID' }, { status: 400 })
  }

  const success = await deleteApplication(id, user.id)
  return NextResponse.json({ success })
}
