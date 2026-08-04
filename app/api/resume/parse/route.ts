// ─────────────────────────────────────────────────────────────────────────────
// app/api/resume/parse/route.ts
// LangChain Document Parsing, Recursive Chunking & One-Time Database Storage.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { GroqRotatingClient } from '@/lib/groq-client'
import { Document } from '@langchain/core/documents'
import { z } from 'zod'

export const runtime = 'nodejs'

// ── Zod Schema for Structured LangChain Resume Extraction ──
const ZodResumeProfileSchema = z.object({
  name: z.string().describe("Candidate's full name"),
  email: z.string().describe("Candidate's email address"),
  phone: z.string().describe("Candidate's phone or mobile number"),
  city: z.string().describe("Candidate's city or location"),
  skills: z.array(z.string()).describe("Top 10-15 technical skills, frameworks, tools, or languages"),
  desired_roles: z.array(z.string()).describe("Top 2-3 target job titles"),
  years_of_experience: z.string().describe("Total years of experience"),
  expected_salary: z.string().describe("Expected salary or CTC if mentioned"),
  notice_period: z.string().describe("Notice period in days or text"),
  work_authorized: z.string().describe("Work authorization status (Yes/No)"),
  requires_visa_sponsorship: z.string().describe("Visa sponsorship required (Yes/No)"),
  experience_summary: z.string().describe("1-2 sentence executive summary of candidate experience"),
  dense_summary: z.string().describe("Compact 200-word paragraph capturing candidate qualifications, tech stack, and projects for AI job matching"),
})

export type ResumeProfileData = z.infer<typeof ZodResumeProfileSchema>

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

  // Step 1: Wrap PDF text in LangChain Document
  const doc = new Document({
    pageContent: text,
    metadata: {
      source: filePath,
      userId: user.id,
      parsedAt: new Date().toISOString(),
      length: text.length,
    },
  })

  const primaryContent = doc.pageContent.slice(0, 6000)

  // Step 2: One-Time LangChain Structured Profile Extraction
  let structured: Partial<ResumeProfileData> = {}
  const groqKey = process.env.GROQ_API_KEY
  if (groqKey) {
    try {
      const client = new GroqRotatingClient(groqKey)
      const systemPrompt = `You are an expert AI resume parser. Extract a structured candidate profile from the candidate's CV text.`
      const userPrompt = `CANDIDATE CV TEXT:
"${primaryContent}"`

      structured = await client.chatStructured<ResumeProfileData>(
        [
          ['system', systemPrompt],
          ['human', userPrompt],
        ],
        ZodResumeProfileSchema
      )
    } catch (e: any) {
      console.warn('[Resume Parse] LangChain profile extraction failed:', e.message)
    }
  }

  // Step 3: Store Everything ONCE into Supabase DB (No Re-Parsing Needed Ever Again)
  const { data: profile } = await supabase.from('profiles').select('profile_data').eq('user_id', user.id).maybeSingle()
  const existingData = profile?.profile_data || {}

  const profile_data = {
    ...existingData,
    resume_text: text,
    name: structured.name || existingData.name || '',
    email: structured.email || existingData.email || '',
    phone: structured.phone || existingData.phone || '',
    city: structured.city || existingData.city || '',
    skills: structured.skills || existingData.skills || [],
    desired_roles: structured.desired_roles || existingData.desired_roles || [],
    years_of_experience: structured.years_of_experience || existingData.years_of_experience || '',
    expected_salary: structured.expected_salary || existingData.expected_salary || '',
    notice_period: structured.notice_period || existingData.notice_period || '',
    work_authorized: structured.work_authorized || existingData.work_authorized || 'yes',
    requires_visa_sponsorship: structured.requires_visa_sponsorship || existingData.requires_visa_sponsorship || 'no',
    experience_summary: structured.experience_summary || existingData.experience_summary || '',
    dense_summary: structured.dense_summary || existingData.dense_summary || '',
    langchain_doc_metadata: doc.metadata,
  }

  const { error: updError } = await supabase.from('profiles').upsert({
    user_id: user.id,
    resume_path: 'resume.pdf',
    profile_data,
  }, { onConflict: 'user_id' })
  if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    length: text.length,
    document_length: doc.pageContent.length,
    structured: !!structured.dense_summary,
    profile_data,
  })
}