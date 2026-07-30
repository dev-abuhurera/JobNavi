import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { GroqRotatingClient } from '@/lib/groq-client'

export const runtime = 'nodejs'

export async function POST() {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const filePath = `${user.id}/resume.pdf`
  const { data: file, error: dlError } = await supabase.storage.from('resumes').download(filePath)
  if (dlError || !file) {
    return NextResponse.json({ error: 'Resume not found in storage' }, { status: 404 })
  }

  let text = ''
  try {
    const { PDFParse } = await import('pdf-parse')
    const buffer = Buffer.from(await file.arrayBuffer())

    const parser = new PDFParse({ data: buffer })
    try {
      const parsed = await parser.getText()
      text = (parsed.text || '')
        .replace(/--\s*\d+\s+of\s+\d+\s*--/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8000)
    } finally {
      await parser.destroy()
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Parse failed: ${e.message}` }, { status: 500 })
  }

  if (text.length < 100) {
    return NextResponse.json({ error: 'No readable text found. This looks like a scanned PDF.' }, { status: 400 })
  }

  // Generate One-Time Semantic Compression using Groq LLM
  let structured: any = {}
  const groqKey = process.env.GROQ_API_KEY
  if (groqKey) {
    try {
      const client = new GroqRotatingClient(groqKey)
      const prompt = `
Extract a structured semantic summary from the candidate's resume below.

Resume Text:
"${text.slice(0, 5000)}"

Return a JSON object with:
- "skills": Array of top 10-15 technical skills, frameworks, tools, or languages.
- "desired_roles": Array of top 2-3 target job titles.
- "experience_summary": 1-2 sentence executive summary of candidate experience.
- "dense_summary": A compact, high-density 200-word paragraph capturing candidate qualifications, tech stack, experience level, and key projects for AI job matching.
`
      structured = await client.chatJSON(prompt)
    } catch (e: any) {
      console.warn('[Resume Parse] Groq Semantic Compression failed, using fallbacks:', e.message)
    }
  }

  const { data: profile } = await supabase.from('profiles').select('profile_data').eq('user_id', user.id).maybeSingle()
  const existingData = profile?.profile_data || {}

  const profile_data = {
    ...existingData,
    resume_text: text,
    skills: structured.skills || existingData.skills || [],
    desired_roles: structured.desired_roles || existingData.desired_roles || [],
    experience_summary: structured.experience_summary || existingData.experience_summary || '',
    dense_summary: structured.dense_summary || existingData.dense_summary || '',
  }

  const { error: updError } = await supabase.from('profiles').update({ profile_data }).eq('user_id', user.id)
  if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })

  return NextResponse.json({ success: true, length: text.length, structured: !!structured.dense_summary })
}