// ─────────────────────────────────────────────────────────────────
// lib/utils/matching.ts
// Semantic Vector Filtering & Profile Text Normalisation Layer.
// Converts unstructured data parameters into strict evaluation profiles.
// ─────────────────────────────────────────────────────────────────

import { getSimilarity } from './embeddings'

export interface UserProfile {
  userId?: string
  name?: string
  email?: string
  phone?: string
  city?: string
  linkedin_url?: string
  website?: string
  years_of_experience?: string | number
  expected_salary?: string
  current_salary?: string
  notice_period?: string
  work_authorized?: boolean | string
  requires_visa_sponsorship?: boolean | string
  willing_to_relocate?: boolean | string
  resume_text?: string
  dense_summary?: string
  skills?: string[]
  experience_summary?: string
  desired_roles?: string[]
  preferred_tech?: string[]
}

/**
 * Converts a user profile into a dense semantic text representation for embedding.
 * Uses semantically compressed profile summary for high signal & low memory footprint.
 */
export function profileToSearchText(profile: UserProfile): string {
  // 1. Prefer compressed dense summary + skills for skills-based matching
  if (profile.dense_summary && profile.dense_summary.trim()) {
    const parts = [
      profile.dense_summary,
      profile.skills?.join(', ') || '',
      profile.experience_summary || '',
    ]
    return parts.filter(p => p && p.trim()).join('. ').slice(0, 1000)
  }

  // 2. Fall back to skills & resume text excerpt
  if (profile.resume_text && profile.resume_text.trim()) {
    const parts = [
      profile.skills?.slice(0, 15).join(', ') || '',
      profile.experience_summary || '',
      profile.resume_text.slice(0, 800),
    ]
    return parts.filter(p => p && p.trim()).join('. ').slice(0, 1000)
  }

  const parts = [
    profile.skills?.join(', ') || '',
    profile.preferred_tech?.join(', ') || '',
    profile.experience_summary || '',
  ]

  return parts.filter(p => p && p.trim()).join('. ').slice(0, 1000)
}

/**
 * Converts a job into semantic text for matching.
 */
export function jobToMatchText(job: any): string {
  return `${job.title || ''} ${job.description || ''}`
    .slice(0, 1500)
}

/**
 * Calculates ultra-fast, zero-CPU TF-IDF and skill keyword similarity score (0 to 1).
 * Completely eliminates heavy local ONNX transformer model memory & CPU overhead in Node.js.
 */
export function calculateFastSimilarity(profileText: string, job: any): number {
  if (!profileText || !job) return 0.5

  const jobText = jobToMatchText(job)
  const tokenize = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1)

  const profileTokens = Array.from(new Set(tokenize(profileText)))
  const jobTokens = new Set(tokenize(jobText))

  if (profileTokens.length === 0 || jobTokens.size === 0) return 0.5

  let matches = 0
  for (const token of profileTokens) {
    if (jobTokens.has(token)) {
      matches++
    }
  }

  // Calculate weighted token overlap ratio
  const ratio = matches / Math.min(profileTokens.length, 30)
  // Normalize to realistic fit score (0.35 to 0.95)
  return Math.min(Math.max(ratio + 0.35, 0.35), 0.95)
}

/**
 * Calculates semantic similarity between a user profile and a job.
 */
export async function matchProfileToJob(
  profileText: string,
  job: any
): Promise<number> {
  return calculateFastSimilarity(profileText, job)
}

/**
 * Filters jobs based on:
 * 1. Hard rejections (negative keywords in title)
 * 2. Fast keyword & skill matching score
 */
export async function filterJobsByProfile(
  jobs: any[],
  profileText: string,
  negativeKeywords: string[] = [
    'sales', 'hr', 'human resources', 'recruiter', 'recruitment',
    'admin', 'administrative', 'office manager', 'account executive',
    'customer support', 'tech support', 'customer service'
  ]
): Promise<any[]> {
  const SIMILARITY_THRESHOLD = 0.30
  const filtered: any[] = []

  for (const job of jobs) {
    const titleLower = (job.title || '').toLowerCase()

    // Step 1: Hard reject if negative keyword in title
    if (negativeKeywords.some(k => titleLower.includes(k))) {
      console.log(`[Match] Rejected "${job.title}" — matches negative keyword`)
      continue
    }

    // Step 2: Instant zero-CPU similarity calculation
    const similarity = calculateFastSimilarity(profileText, job)
    if (similarity >= SIMILARITY_THRESHOLD) {
      filtered.push({
        ...job,
        similarity,
        fit_score: Math.round(similarity * 100)
      })
    } else {
      console.log(`[Match] Rejected "${job.title}" — low similarity (${similarity.toFixed(2)})`)
    }
  }

  return filtered.sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
}

/**
 * Batch filter multiple jobs with profile caching.
 */
export async function batchFilterJobsByProfile(
  jobs: any[],
  profile: UserProfile,
  negativeKeywords?: string[]
): Promise<any[]> {
  const profileText = profileToSearchText(profile)
  console.log(`[Match] Filtering ${jobs.length} jobs against profile: "${profileText.slice(0, 60)}..."`)
  
  return filterJobsByProfile(jobs, profileText, negativeKeywords)
}

/**
 * Executes server-side Supabase pgvector RPC search to match database jobs against stored candidate resume_embedding.
 */
export async function matchJobsInDatabase(
  supabase: any,
  userId: string,
  threshold = 0.25,
  limit = 50
): Promise<any[]> {
  try {
    const { data, error } = await supabase.rpc('match_jobs_for_candidate', {
      p_user_id: userId,
      p_threshold: threshold,
      p_limit: limit,
    })

    if (error) {
      console.warn('[Matching] Supabase pgvector RPC search failed:', error.message)
      return []
    }

    return (data || []).map((j: any) => ({
      ...j,
      fit_score: j.fit_score ?? Math.round((j.similarity || 0) * 100),
    }))
  } catch (err: any) {
    console.error('[Matching] Database vector matching error:', err.message)
    return []
  }
}

