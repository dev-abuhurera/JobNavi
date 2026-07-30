import { PortalAutomationHybrid } from '../lib/automation/portal_automation_hybrid'
import { batchFilterJobsByProfile, UserProfile } from '../lib/utils/matching'
import { isRealUrl, isRealJobTitle, getSourceName, classifyApplicationType } from '../lib/utils/url'
import { GroqRotatingClient } from '../lib/groq-client'
import { validateConfig } from '../lib/config'
import { logger } from '../lib/logger'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import * as dotenv from 'dotenv'
import http from 'http'

dotenv.config({ path: '.env.local' })
const cfg = validateConfig()

const supabase = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey)

// Optional HTTP Server for Cloud Hosting Health Checks (e.g. Render Web Service bypass)
const healthPort = process.env.PORT || 10000
const healthServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ status: 'ok', service: 'jobnavi-worker' }))
})
healthServer.listen(healthPort, () => {
  logger.info('[Worker]', `Worker health check HTTP server listening on port ${healthPort}`)
})

async function log(userId: string, msg: string, level: 'info' | 'success' | 'error' | 'warn' = 'info') {
  logger[level]('[Worker]', msg)
  await supabase.from('activity_logs').insert({ user_id: userId, msg, level })
}

async function getUserProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !data) throw new Error('User profile not found. Please upload your CV first.')

  const pd = data.profile_data || {}
  return {
    userId,
    name: pd.name || '',
    skills: pd.skills || [],
    experience_summary:
      pd.experience_summary ||
      pd.experience?.map((e: any) => e.title || e).join(', ') ||
      '',
    dense_summary: pd.dense_summary || '',
    desired_roles: pd.desired_roles || [],
    preferred_tech: pd.preferred_tech || [],
    resume_text: pd.resume_text || '',
  }
}

// ─────────────────────────────────────────────────────────────────
// Job Discovery
// ─────────────────────────────────────────────────────────────────

async function discoverJobs(keywords: string[], location: string, profile: UserProfile) {
  let allDiscovered: any[] = []
  const serperKey = cfg.serperApiKey

  if (serperKey) {
    const queryList: string[] = []

    // 1. Search for user-requested keywords on LinkedIn (Past 24 Hours)
    for (const kw of keywords) {
      const cleanKw = kw.trim()
      if (!cleanKw) continue
      queryList.push(`${cleanKw} site:linkedin.com/jobs/view`)
      if (location && location.toLowerCase() !== 'remote') {
        queryList.push(`${cleanKw} ${location} site:linkedin.com/jobs/view`)
      }
    }

    // 2. Also search based on top skills from candidate's profile to discover up to 30-40 jobs
    if (profile.skills && profile.skills.length > 0) {
      for (const skill of profile.skills.slice(0, 2)) {
        if (skill && skill.length > 2) {
          queryList.push(`${skill.trim()} Developer site:linkedin.com/jobs/view`)
        }
      }
    }

    // Deduplicate & take top 4 unique 24-hour LinkedIn queries (~30-40 raw job candidates)
    const uniqueQueries = Array.from(new Set(queryList)).slice(0, 4)

    for (const q of uniqueQueries) {
      try {
        logger.info('[Discovery]', `Searching LinkedIn (Past 24h): ${q}`)
        const { data } = await axios.post(
          'https://google.serper.dev/search',
          { q, num: 10, tbs: 'qdr:d' }, // tbs: 'qdr:d' restricts strictly to past 24 hours (day)
          { headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' } }
        )

        const results = (data.organic || [])
          .filter((r: any) => isRealUrl(r.link) && isRealJobTitle(r.title))
          .map((r: any) => {
            let cleanTitle = r.title
              .replace(/ \| LinkedIn/g, '')
              .replace(/\.\.\.$/g, '')
              .trim()

            let companyName = 'Unknown'

            if (cleanTitle.includes(' hiring ')) {
              const parts = cleanTitle.split(' hiring ')
              companyName = parts[0].trim()
              cleanTitle = parts[1].split(' in ')[0].trim()
            }

            if (companyName === 'Unknown' || companyName.length > 50) {
              const lowerSnippet = (r.snippet || '').toLowerCase()
              if (!lowerSnippet.includes('full job description') && !lowerSnippet.startsWith('position:')) {
                const potentialCompany = r.snippet?.split(' · ')[0]?.split(' - ')[0]?.trim()
                if (potentialCompany && potentialCompany.length > 2 && potentialCompany.length < 40) {
                  companyName = potentialCompany
                }
              }
            }

            if (companyName === 'Unknown') {
              companyName = getSourceName(r.link).toUpperCase()
            }

            return {
              title: cleanTitle,
              company: companyName,
              source_url: r.link,
              source: getSourceName(r.link),
              location: location || 'Remote',
              description: r.snippet || '',
              application_type: classifyApplicationType(r.link),
            }
          })
          .filter((j: any) => {
            const isGoodLength = j.title.length > 5 && j.title.length < 80 && j.company.length > 2 && j.company.length < 50
            const isNotDescription = !j.company.toLowerCase().includes('job description') && !j.company.toLowerCase().includes('hourly') && !j.company.toLowerCase().includes('join or sign in')
            
            // Exclude spammy third-party staffing agencies on LinkedIn like Crossing Hurdles
            const thirdPartyAgencies = [
              'crossing hurdles', 'jobs via dice', 'fetchjobs.co', 'engine', 'crossover', 
              'toptal', 'turing', 'braintrust', 'cybercoders', 'teksystems', 'robert half',
              'jobot', 'harnham', 'kforce', 'apex systems', 'insight global', 'randstad', 
              'lhh', 'kelly services', 'jobright', 'actalent', 'beacon hill', 'modis'
            ]

            const companyLower = j.company.toLowerCase()
            const descLower = (j.description || '').toLowerCase()

            const isThirdParty = thirdPartyAgencies.some(agency => 
              companyLower.includes(agency) || descLower.includes(agency)
            )

            return isGoodLength && isNotDescription && !isThirdParty
          })

        logger.info('[Discovery]', `Serper: ${results.length} valid LinkedIn jobs from query`)
        allDiscovered = [...allDiscovered, ...results]
        await new Promise(r => setTimeout(r, 500))
      } catch (err: any) {
        logger.error('[Discovery]', `Serper query failed: ${err.response?.data?.message || err.message}`)
      }
    }
  }

  const seen = new Set<string>()
  const unique = allDiscovered.filter(j => {
    if (!j.source_url || seen.has(j.source_url)) return false
    seen.add(j.source_url)
    return true
  })

  logger.info('[Discovery]', `${unique.length} unique jobs before Stage 1 profile matching`)
  const stage1Matched = await batchFilterJobsByProfile(unique, profile)
  logger.info('[Discovery]', `${stage1Matched.length} jobs after Stage 1 vector filtering`)

  // Stage 2: Deep LLM Scoring with Groq (llama-3.3-70b-versatile)
  const finalMatched = await evaluateJobsWithLLM(stage1Matched, profile)
  logger.info('[Discovery]', `${finalMatched.length} jobs ready after Stage 2 Groq LLM evaluation`)
  return finalMatched
}

async function evaluateJobsWithLLM(jobs: any[], profile: UserProfile): Promise<any[]> {
  if (!cfg.groqApiKey || jobs.length === 0) return jobs

  const client = new GroqRotatingClient(cfg.groqApiKey)
  const evaluated: any[] = []

  logger.info('[Discovery]', `Running Stage 2 Groq LLM evaluation on top ${Math.min(jobs.length, 15)} candidate jobs...`)

  for (const job of jobs.slice(0, 15)) {
    try {
      const profileSummary = profile.dense_summary || profile.experience_summary || (profile.resume_text || '').slice(0, 500)
      const prompt = `
You are an expert AI job search evaluator. Compare the following Candidate Profile with the Job Opportunity.

Candidate Profile:
- Desired Roles: ${profile.desired_roles?.join(', ') || 'Software Engineer'}
- Skills: ${profile.skills?.slice(0, 12).join(', ') || 'Software Development'}
- Resume Summary: "${profileSummary}"

Job Opportunity:
- Title: "${job.title}"
- Company: "${job.company}"
- Description: "${job.description}"

Instructions:
Evaluate how well the candidate fits this job opportunity.
Return a JSON object with:
- "fit_score": integer between 0 and 100 representing overall fit.
- "reason": 1 short sentence explaining why it fits or does not fit.
- "tech_stack": array of strings listing up to 5 main technologies mentioned in the job.
- "is_match": boolean true if fit_score >= 45, otherwise false.
`

      const res = await client.chatJSON<{ fit_score: number; reason: string; tech_stack: string[]; is_match: boolean }>(prompt)

      if (res && typeof res.fit_score === 'number' && res.fit_score >= 40 && res.is_match !== false) {
        evaluated.push({
          ...job,
          fit_score: res.fit_score,
          tech_stack: res.tech_stack || job.tech_stack || [],
          match_reason: res.reason || '',
        })
      } else {
        logger.info('[Discovery]', `Groq Stage 2 rejected "${job.title}" (Score: ${res?.fit_score || 0}): ${res?.reason || 'Low relevance'}`)
      }
    } catch (err: any) {
      logger.warn('[Discovery]', `Groq Stage 2 evaluation failed for "${job.title}": ${err.message}. Retaining Stage 1 score.`)
      evaluated.push(job)
    }
  }

  // Include remaining jobs that weren't evaluated in top 15 if needed
  if (jobs.length > 15) {
    evaluated.push(...jobs.slice(15))
  }

  return evaluated.sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0))
}

// ─────────────────────────────────────────────────────────────────
// Save Jobs
// ─────────────────────────────────────────────────────────────────

async function saveJobs(jobs: any[], userId: string) {
  let savedCount = 0
  let errorCount = 0
  let skippedCount = 0

  const clean = jobs.filter(job => {
    if (!isRealJobTitle(job.title)) { skippedCount++; return false }
    if (!job.source_url || !isRealUrl(job.source_url)) { skippedCount++; return false }
    return true
  })

  const records = clean.map(job => {
    const { similarity, ...dbJob } = job
    return {
      user_id: userId,
      title: dbJob.title,
      company: dbJob.company || 'Unknown',
      location: dbJob.location || 'Remote',
      description: dbJob.description || null,
      source_url: dbJob.source_url,
      source: dbJob.source || 'web',
      tech_stack: dbJob.tech_stack || [],
      fit_score: dbJob.fit_score ?? null,
      recruiter_email: dbJob.recruiter_email || null,
      application_type: dbJob.application_type || classifyApplicationType(dbJob.source_url),
      posting_date: dbJob.posting_date || null,
      status: 'discovered',
    }
  })

  if (records.length > 0) {
    const { data, error } = await supabase
      .from('jobs')
      .upsert(records, { onConflict: 'user_id,source_url', ignoreDuplicates: true })
      .select('id')

    if (error) {
      errorCount = records.length
      logger.error('[Save]', `Batch insert failed: ${error.message}`)
    } else {
      savedCount = data?.length || 0
      skippedCount += records.length - savedCount
    }
  }

  logger.info('[Save]', `Saved: ${savedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`)
  return { savedCount, errorCount, skippedCount }
}

// ─────────────────────────────────────────────────────────────────
// Process Applications
// ─────────────────────────────────────────────────────────────────

async function processApplication(app: any) {
  let automation: PortalAutomationHybrid | null = null

  try {
    const { data: job } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', app.job_id)
      .single()

    if (!job) throw new Error('Job not found for application')

    const manualTypes = ['manual', 'serper', 'web', undefined, null]
    if (manualTypes.includes(job.application_type)) {
      await supabase.from('applications').update({
        current_status: 'skipped',
        notes: 'This job requires manual application. Visit the job URL directly.'
      }).eq('id', app.id)
      return
    }

    if (!job.source_url || !isRealUrl(job.source_url)) {
      await supabase.from('applications').update({
        current_status: 'skipped',
        notes: 'Invalid or aggregator URL. Cannot automate.'
      }).eq('id', app.id)
      return
    }

    automation = new PortalAutomationHybrid(supabase, cfg.groqApiKey)
    const portal = job.source || 'linkedin'
    await automation.init(app.user_id, portal)

    const result = await automation.applyToJob(app.job_id, app.user_id)

    if (result.status === 'applied') {
      await supabase.from('applications').update({
        current_status: 'applied',
        date_applied: new Date().toISOString(),
        notes: `Applied via ${portal} automation. Screenshot: ${result.screenshot || 'none'}`
      }).eq('id', app.id)
    } else if (result.status === 'session_expired') {
      await supabase.from('applications').update({
        current_status: 'session_expired',
        notes: `Session expired for ${portal}. Please reconnect in Settings.`
      }).eq('id', app.id)
    } else if (result.status === 'unconfirmed') {
      await supabase.from('applications').update({
        current_status: 'unconfirmed',
        notes: result.message || 'Application step finished but confirmation screenshot unverified.'
      }).eq('id', app.id)
    } else {
      throw new Error(result.message || `Application status: ${result.status}`)
    }
  } finally {
    await new Promise(r => setTimeout(r, 2000))
    if (automation) await automation.cleanup()
  }
}

// ─────────────────────────────────────────────────────────────────
// Main Loop
// ─────────────────────────────────────────────────────────────────

let isShuttingDown = false

async function claimTask() {
  const { data: pending } = await supabase
    .from('discovery_tasks')
    .select('*')
    .eq('status', 'pending')
    .limit(1)

  if (!pending || pending.length === 0) return null

  const task = pending[0]
  // Atomic claim: only succeeds if still pending
  const { data: claimed } = await supabase
    .from('discovery_tasks')
    .update({ status: 'running' })
    .eq('id', task.id)
    .eq('status', 'pending')
    .select()
    .single()

  return claimed || null
}

async function processTasks() {
  logger.info('[Worker]', 'Agent Worker started. Polling every 5s...')

  while (!isShuttingDown) {
    try {
      const task = await claimTask()
      if (task) {
        const { id, user_id, keywords, location } = task
        await log(user_id, `Starting discovery for: ${keywords.join(', ')} in ${location || 'Remote'}`, 'info')

        try {
          const profile = await getUserProfile(user_id)
          const jobs = await discoverJobs(keywords, location || 'Remote', profile)
          const { savedCount, errorCount, skippedCount } = await saveJobs(jobs, user_id)
          await supabase.from('discovery_tasks').update({ status: 'completed' }).eq('id', id)
          await log(user_id, `Discovery complete. Found ${jobs.length} matches. Saved ${savedCount} new jobs. (${skippedCount} skipped, ${errorCount} errors)`, 'success')
        } catch (err) {
          await supabase.from('discovery_tasks').update({ status: 'failed' }).eq('id', id)
          await log(user_id, `Discovery failed: ${String(err)}`, 'error')
        }
      }

      const { data: apps } = await supabase
        .from('applications')
        .select('*')
        .eq('current_status', 'pending')
        .limit(1)

      if (apps && apps.length > 0) {
        const app = apps[0]
        await log(app.user_id, `Processing application for ${app.company}...`, 'info')
        try {
          await processApplication(app)
          const { data: updatedApp } = await supabase
            .from('applications')
            .select('current_status')
            .eq('id', app.id)
            .single()

          const st = updatedApp?.current_status
          if (st === 'applied') await log(app.user_id, `Successfully applied for ${app.company}`, 'success')
          else if (st === 'session_expired') await log(app.user_id, `Session expired for ${app.company}. Please reconnect in Settings.`, 'error')
          else if (st === 'skipped') await log(app.user_id, `${app.company} skipped.`, 'info')
          else await log(app.user_id, `Application for ${app.company} ended with status: ${st}`, 'info')
        } catch (err) {
          await log(app.user_id, `Application failed for ${app.company}: ${String(err)}`, 'error')
          await supabase.from('applications').update({ current_status: 'failed', notes: String(err) }).eq('id', app.id)
        }
      }
    } catch (err) {
      logger.error('[Worker]', `Loop error: ${String(err)}`)
    }

    if (!isShuttingDown) await new Promise(r => setTimeout(r, 5000))
  }

  logger.info('[Worker]', 'Worker stopped gracefully.')
  process.exit(0)
}

process.on('SIGINT', () => { isShuttingDown = true })
process.on('SIGTERM', () => { isShuttingDown = true })

processTasks().catch(err => {
  logger.error('[Worker]', `Fatal: ${String(err)}`)
  process.exit(1)
})