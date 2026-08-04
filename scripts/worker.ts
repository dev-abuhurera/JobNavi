import { PortalAutomationHybrid } from '../lib/automation/portal_automation_hybrid'
import { PlaywrightDiscovery } from '../lib/automation/playwright_discovery'
import { batchFilterJobsByProfile, UserProfile } from '../lib/utils/matching'
import { isRealUrl, isRealJobTitle, getSourceName, classifyApplicationType } from '../lib/utils/url'
import { GroqRotatingClient } from '../lib/groq-client'
import { validateConfig } from '../lib/config'
import { logger } from '../lib/logger'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import http from 'http'

dotenv.config({ path: '.env.local' })
const cfg = validateConfig()

const supabase = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey)

// Minimal HTTP server for deployment health checks (dynamic port allocation)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }))
})
const requestedPort = process.env.WORKER_PORT ? parseInt(process.env.WORKER_PORT, 10) : (process.env.PORT && process.env.PORT !== '3000' ? parseInt(process.env.PORT, 10) : 0)

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    logger.warn('[Worker]', `Requested port is busy. Binding health check server to an available free port...`)
    server.listen(0)
  } else {
    logger.error('[Worker]', `Health check server error:`, err.message)
  }
})

server.listen(requestedPort, () => {
  const addr = server.address()
  const assignedPort = typeof addr === 'object' && addr ? addr.port : requestedPort
  logger.info('[Worker]', `Health check server listening on port ${assignedPort}`)
})

async function log(userId: string, message: string, level: 'info' | 'warn' | 'error' = 'info') {
  try {
    const { error } = await supabase.from('activity_logs').insert({
      user_id: userId,
      msg: message,
      level,
    })
    if (error) {
      logger.error('[Worker]', `Failed to write activity log: ${error.message}`)
    }
  } catch (e) {
    logger.error('[Worker]', `Failed to write activity log:`, e)
  }
}

async function getUserProfile(userId: string): Promise<UserProfile> {
  const { data: p } = await supabase
    .from('profiles')
    .select('profile_data')
    .eq('user_id', userId)
    .maybeSingle()

  const pd = p?.profile_data || {}
  return {
    userId,
    name: pd.name || '',
    email: pd.email || '',
    phone: pd.phone || '',
    city: pd.city || '',
    linkedin_url: pd.linkedin_url || '',
    website: pd.website || '',
    years_of_experience: pd.years_of_experience || 0,
    expected_salary: pd.expected_salary || '',
    current_salary: pd.current_salary || '',
    notice_period: pd.notice_period || '',
    work_authorized: pd.work_authorized || 'yes',
    requires_visa_sponsorship: pd.requires_visa_sponsorship || 'no',
    willing_to_relocate: pd.willing_to_relocate ?? true,
    skills: pd.skills || [],
    desired_roles: pd.desired_roles || [],
    experience_summary: pd.experience_summary || '',
    dense_summary: pd.dense_summary || '',
    resume_text: pd.resume_text || '',
  }
}

// ── DISCOVERY PASS (PLAYWRIGHT DIRECT) ──
async function discoverJobs(keywords: string[], location: string, profile: UserProfile): Promise<any[]> {
  logger.info('[Discovery]', `Starting Playwright Direct LinkedIn Discovery for keywords: [${keywords.join(', ')}] in "${location}"`)
  
  const existingJobUrls = new Set<string>()
  const existingJobKeys = new Set<string>()
  
  const { data: dbJobs } = await supabase.from('jobs').select('source_url, title, company')
  if (dbJobs) {
    dbJobs.forEach(j => {
      if (j.source_url) existingJobUrls.add(j.source_url)
      if (j.title && j.company) existingJobKeys.add(`${j.title.toLowerCase()}|${j.company.toLowerCase()}`)
    })
  }

  const discoveredRaw = await PlaywrightDiscovery.discoverJobs(
    keywords,
    location,
    existingJobUrls,
    existingJobKeys
  )

  if (discoveredRaw.length === 0) {
    logger.info('[Discovery]', 'Playwright discovery found 0 new Easy Apply jobs')
    return []
  }

  // Stage 1 Vector Filtering
  const stage1Matched = await batchFilterJobsByProfile(discoveredRaw, profile)
  if (stage1Matched.length === 0) {
    logger.info('[Discovery]', 'Stage 1 similarity matching filtered out all discovered jobs')
    return []
  }

  // Stage 2 LangChain LLM Fit Evaluation
  const finalMatched = await evaluateJobsWithLLM(stage1Matched, profile)
  const candidateJobs = finalMatched.filter(j => isRealJobTitle(j.title))

  logger.info('[Discovery]', `${candidateJobs.length} verified 24h Easy Apply jobs ready to save`)
  return candidateJobs
}

const ZodJobMatchSchema = z.object({
  fit_score: z.number().min(0).max(100).describe('Integer score between 0 and 100'),
  reason: z.string().describe('Short explanation of candidate fit'),
  tech_stack: z.array(z.string()).describe('List of main technologies required'),
  is_match: z.boolean().describe('True if candidate is a good match'),
})

async function evaluateJobsWithLLM(jobs: any[], profile: UserProfile): Promise<any[]> {
  if (!cfg.groqApiKey || jobs.length === 0) return jobs

  const client = new GroqRotatingClient(cfg.groqApiKey)
  const evaluated: any[] = []

  logger.info('[Discovery]', `Running Stage 2 LangChain LLM evaluation on top ${Math.min(jobs.length, 50)} candidate jobs...`)

  for (const job of jobs.slice(0, 50)) {
    try {
      const profileSummary = profile.dense_summary || profile.experience_summary || (profile.resume_text || '').slice(0, 500)
      
      const systemPrompt = `You are an expert AI job search evaluator. Compare the candidate profile with the job opportunity and output a structured match decision.`

      const userPrompt = `CANDIDATE PROFILE:
- Desired Roles: ${profile.desired_roles?.join(', ') || 'Software Engineer'}
- Skills: ${profile.skills?.slice(0, 12).join(', ') || 'Software Development'}
- Resume Summary: "${profileSummary}"

JOB OPPORTUNITY:
- Title: "${job.title}"
- Company: "${job.company}"
- Description: "${job.description}"`

      const res = await client.chatStructured<z.infer<typeof ZodJobMatchSchema>>(
        [
          ['system', systemPrompt],
          ['human', userPrompt],
        ],
        ZodJobMatchSchema
      )

      if (res && typeof res.fit_score === 'number' && res.fit_score >= 40 && res.is_match !== false) {
        evaluated.push({
          ...job,
          fit_score: res.fit_score,
          tech_stack: res.tech_stack || job.tech_stack || [],
          match_reason: res.reason || '',
        })
      } else {
        logger.info('[Discovery]', `LangChain Stage 2 rejected "${job.title}" (Score: ${res?.fit_score || 0}): ${res?.reason || 'Low relevance'}`)
      }
    } catch (err: any) {
      logger.warn('[Discovery]', `LangChain Stage 2 evaluation failed for "${job.title}": ${err.message}. Retaining Stage 1 score.`)
      evaluated.push(job)
    }
  }

  return evaluated
}

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
    return {
      user_id: userId,
      title: job.title,
      company: job.company || 'Unknown',
      location: job.location || 'Remote',
      description: job.description || '',
      source_url: job.source_url,
      source: getSourceName(job.source_url),
      fit_score: job.fit_score || 50,
      tech_stack: job.tech_stack || [],
      status: 'discovered',
      application_type: classifyApplicationType(job.source_url)
    }
  })

  for (const record of records) {
    try {
      const { error } = await supabase.from('jobs').insert(record)
      if (!error) {
        savedCount++
      } else if (error.code === '23505') {
        skippedCount++
      } else {
        errorCount++
        logger.error('[Worker]', `Failed to save job "${record.title}": ${error.message} (Code: ${error.code})`)
      }
    } catch (e: any) {
      errorCount++
      logger.error('[Worker]', `Exception saving job "${record.title}": ${e?.message || e}`)
    }
  }

  logger.info('[Worker]', `Job saving step complete: ${savedCount} saved, ${skippedCount} skipped, ${errorCount} errors.`)
}

// ── ON-DEMAND FRONTEND DISCOVERY TASK LISTENER ──
async function processPendingDiscoveryTasks() {
  const { data: pendingTasks } = await supabase
    .from('discovery_tasks')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)

  if (!pendingTasks || pendingTasks.length === 0) return

  for (const task of pendingTasks) {
    try {
      await supabase.from('discovery_tasks').update({ status: 'processing' }).eq('id', task.id)
      await log(task.user_id, `🔍 Frontend triggered discovery task: "${task.keywords?.join(', ')}" in "${task.location}"`, 'info')

      const profile = await getUserProfile(task.user_id)
      const keywords = (task.keywords && task.keywords.length) ? task.keywords : profile.desired_roles
      const location = task.location || profile.city || 'Remote'

      const discovered = await discoverJobs(keywords, location, profile)
      if (discovered.length > 0) {
        await saveJobs(discovered, task.user_id)
        await log(task.user_id, `✅ Discovery complete: Saved ${discovered.length} Easy Apply jobs to queue.`, 'info')
      } else {
        await log(task.user_id, `ℹ️ Discovery complete: No new jobs found for criteria.`, 'info')
      }

      await supabase.from('discovery_tasks').update({ status: 'completed' }).eq('id', task.id)
    } catch (err: any) {
      logger.error('[Worker]', `Discovery task ${task.id} failed:`, err.message)
      await supabase.from('discovery_tasks').update({ status: 'failed', error_message: err.message }).eq('id', task.id)
    }
  }
}

// ── ON-DEMAND FRONTEND APPLICATION PROCESSOR ──
async function processPendingApplications() {
  const { data: pending, error } = await supabase
    .from('applications')
    .select('*')
    .or('current_status.ilike.pending,current_status.ilike.queued')
    .order('created_at', { ascending: true })
    .limit(5)

  if (error) {
    logger.error('[Worker]', 'Failed to fetch pending applications:', error.message)
    return
  }

  if (!pending || pending.length === 0) return

  for (const app of pending) {
    try {
      // Mark as processing immediately so frontend reflects active status
      await supabase.from('applications').update({ current_status: 'processing' }).eq('id', app.id)

      let job = app.jobs

      if (!job && app.job_id) {
        const { data: fetchedJob } = await supabase
          .from('jobs')
          .select('*')
          .eq('id', app.job_id)
          .maybeSingle()
        job = fetchedJob
      }

      const sourceUrl = job?.source_url || app.source_url || ''
      const title = job?.title || app.job_title || 'Job Opportunity'
      const company = job?.company || app.company || 'Company'
      const appType = job?.application_type || (sourceUrl.includes('linkedin.com') ? 'linkedin_easy_apply' : 'manual')

      if (!sourceUrl) {
        await supabase.from('applications').update({
          current_status: 'failed',
          notes: 'Failed: Missing job source URL.'
        }).eq('id', app.id)
        continue
      }

      if (appType !== 'linkedin_easy_apply') {
        await supabase.from('applications').update({
          current_status: 'skipped',
          notes: `Skipped: ${title} at ${company} is not a LinkedIn Easy Apply position.`
        }).eq('id', app.id)
        await log(app.user_id, `ℹ️ Skipped "${title}" at "${company}": Not a LinkedIn Easy Apply job`, 'info')
        continue
      }

      await log(app.user_id, `🤖 Frontend requested auto-apply for "${title}" at "${company}"`, 'info')

      const automation = new PortalAutomationHybrid(supabase, cfg.groqApiKey)
      const portal = job?.source || app.source || 'linkedin'
      const isHeadless = process.env.HEADLESS === 'true'
      await automation.init(app.user_id, portal, isHeadless)

      const targetJobId = job?.id || app.job_id || app.id
      const result = await automation.applyToJob(targetJobId, app.user_id)

      if (result.status === 'applied') {
        await supabase.from('applications').update({
          current_status: 'applied',
          date_applied: new Date().toISOString(),
          notes: `Applied via ${portal} automation. Screenshot: ${result.screenshot || 'none'}`
        }).eq('id', app.id)
        await log(app.user_id, `✅ Successfully applied to "${title}" at "${company}"!`, 'info')
      } else if (result.status === 'job_closed') {
        await supabase.from('applications').update({
          current_status: 'closed',
          notes: 'Job posting is no longer taking applications.'
        }).eq('id', app.id)
        await log(app.user_id, `⚠️ Job closed for "${title}" at "${company}".`, 'warn')
      } else {
        await supabase.from('applications').update({
          current_status: 'failed',
          notes: result.message || 'Application failed'
        }).eq('id', app.id)
        await log(app.user_id, `❌ Application failed for "${title}": ${result.message}`, 'error')
      }
    } catch (err: any) {
      logger.error('[Worker]', `Application failed for application ${app.id}:`, err.message)
      await supabase.from('applications').update({
        current_status: 'failed',
        notes: `Application failed: ${err.message}`
      }).eq('id', app.id)
    }
  }
}

// ── MAIN WORKER POLLING LOOP ──
async function mainWorkerLoop() {
  logger.info('[Worker]', 'Agent Worker started. Polling for Frontend On-Demand tasks & applications every 5s...')
  while (true) {
    try {
      // 1. Process explicit user discovery tasks triggered from Frontend Dashboard
      await processPendingDiscoveryTasks()

      // 2. Process explicit user application requests triggered from Frontend Dashboard
      await processPendingApplications()
    } catch (e: any) {
      logger.error('[Worker]', 'Worker main loop error:', e.message)
    }
    await new Promise(r => setTimeout(r, 5000))
  }
}

mainWorkerLoop()
