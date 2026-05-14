import Groq from 'groq-sdk'
import axios from 'axios'

export interface Job {
  id?: string | number
  title: string
  company: string
  location: string
  description?: string
  source_url: string
  source: string
  tech_stack?: string[]
  fit_score?: number
  recruiter_email?: string | null
  posting_date?: string | null
  application_type?: string
  status?: string
}

const NEGATIVE_KEYWORDS = [
  'sales', 'hr', 'human resources', 'recruiter', 'recruitment', 
  'admin', 'administrative', 'office manager', 'account executive',
  'customer support', 'tech support', 'customer service'
]

/**
 * Handles real-time job searching via Google CSE and AI parsing via Groq.
 */
export async function discoverJobs(keywords: string[], location: string = "Remote"): Promise<Job[]> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  
  console.log(`[Discovery] Searching for: ${keywords.join(', ')} in ${location}`)

  const cleanKeywords = keywords.filter(k => !['remote', 'jobs'].includes(k.toLowerCase()))
  const query = location.toLowerCase() === 'remote' 
    ? `${cleanKeywords.join(' ')} developer jobs` 
    : `${cleanKeywords.join(' ')} jobs in ${location}`
  
  let searchResults: any[] = []

  // 1. Discovery via Serper (Google Search Proxy)
  const serperKey = (process.env.SERPER_API_KEY || '').trim()
  
  if (serperKey) {
    console.log('[Discovery] Using Serper API for discovery')
    try {
      const response = await axios.post('https://google.serper.dev/search', {
        q: query,
        num: 15
      }, {
        headers: {
          'X-API-KEY': serperKey,
          'Content-Type': 'application/json'
        }
      })
      
      const items = response.data.organic || []
      if (items.length > 0) {
        searchResults = items.map((item: any) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet
        }))
        console.log(`[Discovery] Serper: ${searchResults.length} results found`)
        
        // --- NEW PROFILE-BASED MATCHING ---
        const { batchFilterJobsByProfile } = await import('../utils/matching')
        
        // Create a temporary profile from the search keywords for the UI search
        const tempProfile = {
          desired_roles: keywords,
          experience_summary: `Looking for roles related to ${keywords.join(', ')} in ${location}`
        }
        
        searchResults = await batchFilterJobsByProfile(searchResults, tempProfile)
        console.log(`[Discovery] Profile Matching: Kept ${searchResults.length} jobs`);
      }
    } 
    catch (error: any) {
      console.error('[Discovery] Serper API failed:', error.message)
    }
  }

  if (searchResults.length === 0) {
    return []
  }

  const prompt = `You are a job data extractor. I will provide you with a list of search result snippets for job postings.
Your task is to extract real job data from these snippets and return a JSON array of job objects.

Search Criteria: ${keywords.join(', ')} in ${location}

Search Results:
${JSON.stringify(searchResults)}

Rules:

1. ONLY extract jobs that appear in the snippets. DO NOT invent jobs.
2. Use the "link" field from the search result as the "source_url".
3. For fit_score calculate 0-100:
   - 90-100: Job title contains exact search keywords
   - 70-89: Related role, most tech stack matches
   - 50-69: Partial match
   - Below 50: Do not include this job at all
4. For application_type use:
   - "linkedin_easy_apply" if URL contains linkedin.com
   - "indeed_apply" if URL contains indeed.com
   - "rozee_apply" if URL contains rozee.pk
   - "email_outreach" if recruiter_email is present
   - "manual" otherwise
5. Return a JSON object with a "jobs" array containing objects with these exact fields:
   - "title", "company", "location", "description", "source_url", "source", "tech_stack", "fit_score", "recruiter_email", "posting_date", "application_type"

Return ONLY the JSON. No explanation.`

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' }
    })

    const content = completion.choices[0]?.message?.content
    if (!content) return []

    const parsed = JSON.parse(content)
    const jobs = parsed.jobs || parsed || []
    const allJobs = (Array.isArray(jobs) ? jobs : []).filter(j => isRealUrl(j.source_url))

    console.log(`[Discovery] AI extracted ${allJobs.length} potential jobs from snippets`)
    return allJobs

  } catch (error) {
    console.error('[Discovery] AI parsing failed:', error)
    return []
  }
}

export function classifyApplicationType(job: any): string {
  const url = (job.source_url || '').toLowerCase()
  const email = job.recruiter_email

  if (email) return 'email_outreach'
  if (url.includes('linkedin.com')) return 'linkedin_easy_apply'
  if (url.includes('indeed.com')) return 'indeed_apply'
  if (url.includes('rozee.pk')) return 'rozee_apply'
  if (url.includes('mustakbil.com')) return 'mustakbil_apply'
  if (url.includes('remotive.com')) return 'remotive_apply'
  if (url.includes('arbeitnow.com')) return 'portal_apply'
  return 'manual'
}

/**
 * Saves discovered jobs to the database
 */
export async function saveDiscoveredJobs(supabase: any, jobs: any[], userId: string) {
  const formattedJobs = jobs.map(job => ({
    user_id: userId,
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    source_url: job.source_url,
    source: job.source,
    tech_stack: job.tech_stack || [],
    fit_score: job.fit_score ?? 70,
    recruiter_email: job.recruiter_email,
    application_type: classifyApplicationType(job),
    posting_date: job.posting_date,
    status: 'discovered',
    created_at: new Date().toISOString()
  }))

  if (formattedJobs.length === 0) return true

  const { error } = await supabase
    .from('jobs')
    .upsert(formattedJobs, { onConflict: 'user_id,source_url' })

  if (error) {
    console.error('[Discovery] Failed to save jobs:', error)
    return false
  }
  return true
}

function isRealUrl(url: string): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    const lowerUrl = url.toLowerCase()
    
    const fakeHosts = ['example.com', 'test.com', 'placeholder.com']
    if (fakeHosts.some(h => parsed.hostname.endsWith(h))) return false

    const aggregatorPatterns = [
      '/jobs?', '/search?', '/q-', '-jobs.html', 
      'results', 'explore', 'all-jobs', '/find-jobs'
    ]
    
    if (aggregatorPatterns.some(p => lowerUrl.includes(p))) {
      if (lowerUrl.includes('viewjob') || lowerUrl.includes('/rc/clk')) return true
      return false
    }
    
    if (parsed.hostname.includes('linkedin.com') && lowerUrl.includes('/jobs/search')) return false
    
    return true
  } catch {
    return false
  }
}
