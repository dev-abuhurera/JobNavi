
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getMissingFields } from '@/lib/utils/profile-completeness'
 
export async function POST(request: Request) {
  const supabase = createClient()
 
  // 1. Must be logged in
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
 
  // 2. Read the body
  const { keywords, location } = await request.json().catch(() => ({}))
 
  // 3. Clean the keywords: strings only, trimmed, no empties, max 10
  const cleanKeywords = (Array.isArray(keywords) ? keywords : [])
    .filter((k) => typeof k === 'string')
    .map((k) => k.trim())
    .filter((k) => k && k.length <= 60)
    .slice(0, 10)
 
  if (cleanKeywords.length === 0) {
    return NextResponse.json({ error: 'At least one keyword is required' }, { status: 400 })
  }
 
  const cleanLocation = String(location || '').trim().slice(0, 100) || 'Remote'
 
  // 4. THE GATE - profile must be complete.
  // The agent fills forms from these fields and leaves blanks rather than
  // guessing, so an incomplete profile means incomplete applications.
  const { data: profile } = await supabase
    .from('profiles')
    .select('resume_path, profile_data')
    .eq('user_id', user.id)
    .maybeSingle()
 
  const missing = getMissingFields(profile)
 
  if (missing.length > 0) {
    return NextResponse.json({
      error: 'profile_incomplete',
      message: 'Complete your profile in Resume Hub before starting a search.',
      missing,
    }, { status: 400 })
  }
 
  // 5. Create the task - the worker picks it up from here
  const { data: task, error } = await supabase
    .from('discovery_tasks')
    .insert({
      user_id: user.id,
      keywords: cleanKeywords,
      location: cleanLocation,
      status: 'pending',
    })
    .select()
    .single()
 
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
 
  return NextResponse.json({ success: true, taskId: task.id })
}
 
