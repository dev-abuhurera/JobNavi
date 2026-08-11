// ─────────────────────────────────────────────────────────────────────────────
// app/api/resume/parse/route.ts
// Fast PDF Text Extraction & One-Time Database Storage.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getEmbedding } from '@/lib/utils/embeddings'

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
    } finally {
      await parser.destroy()
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Parse failed: ${e.message}` }, { status: 500 })
  }

  if (text.length < 100) {
    return NextResponse.json({ error: 'No readable text found. This looks like a scanned PDF.' }, { status: 400 })
  }

  // Quick regex extraction for email and phone numbers
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  const phoneMatch = text.match(/(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)

  // Generate Vector Embedding for pgvector Semantic Search (fast 100ms vector call)
  let resume_embedding: number[] | null = null
  try {
    resume_embedding = await getEmbedding(text.slice(0, 1000))
  } catch (e: any) {
    console.warn('[Resume Parse] Vector embedding generation skipped:', e.message)
  }

  // Store raw text and updated data into Supabase DB
  const { data: profile } = await supabase.from('profiles').select('profile_data').eq('user_id', user.id).maybeSingle()
  const existingData = profile?.profile_data || {}

  const profile_data = {
    ...existingData,
    resume_text: text,
    email: existingData.email || (emailMatch ? emailMatch[0] : ''),
    phone: existingData.phone || (phoneMatch ? phoneMatch[0] : ''),
    parsed_at: new Date().toISOString(),
  }

  const upsertPayload: Record<string, any> = {
    user_id: user.id,
    resume_path: 'resume.pdf',
    profile_data,
  }
  if (resume_embedding) {
    upsertPayload.resume_embedding = resume_embedding
  }

  let { error: updError } = await supabase.from('profiles').upsert(upsertPayload, { onConflict: 'user_id' })

  // Fallback: If 'resume_embedding' column is missing in Supabase schema (PGRST204), retry without it
  if (updError && updError.code === 'PGRST204' && upsertPayload.resume_embedding) {
    delete upsertPayload.resume_embedding
    const retry = await supabase.from('profiles').upsert(upsertPayload, { onConflict: 'user_id' })
    updError = retry.error
  }

  if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    length: text.length,
    profile_data,
  })
}