import { PortalAutomationHybrid } from '../lib/automation/portal_automation_hybrid'
import { PlaywrightDiscovery } from '../lib/automation/playwright_discovery'
import { batchFilterJobsByProfile, UserProfile } from '../lib/utils/matching'
import { getEmbedding } from '../lib/utils/embeddings'
import { isRealUrl, isRealJobTitle, getSourceName, classifyApplicationType } from '../lib/utils/url'
import { OllamaClient } from '../lib/ollama-client'
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

async function isTaskCancelled(taskId: string): Promise<boolean> {
  if (!taskId) return false
  const { data } = await supabase
    .from('discovery_tasks')
    .select('status')
    .eq('id', taskId)
    .maybeSingle()
  return !data || data.status === 'cancelled' || data.status === 'interrupted'
}

// ── DISCOVERY PASS (PLAYWRIGHT DIRECT) ──
async function discoverJobs(keywords: string[], location: string, profile: UserProfile, taskId?: string): Promise<any[]> {
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

  const cancelChecker = taskId ? () => isTaskCancelled(taskId) : undefined

  const discoveredRaw = await PlaywrightDiscovery.discoverJobs(
    keywords,
    location,
    existingJobUrls,
    existingJobKeys,
    cancelChecker
  )

  if (discoveredRaw.length === 0 || (taskId && await isTaskCancelled(taskId))) {
    logger.info('[Discovery]', 'Playwright discovery stopped or 0 new Easy Apply jobs found')
    return []
  }

  // Fast Vector Filtering & Real Job Title Verification
  if (taskId && await isTaskCancelled(taskId)) return []
  const stage1Matched = await batchFilterJobsByProfile(discoveredRaw, profile)
  if (stage1Matched.length === 0 || (taskId && await isTaskCancelled(taskId))) {
    logger.info('[Discovery]', 'Vector similarity matching completed or stopped')
    return []
  }

  const candidateJobs = stage1Matched.filter(j => isRealJobTitle(j.title))
  logger.info('[Discovery]', `✅ Fast Discovery complete: ${candidateJobs.length} verified 24h Easy Apply jobs ready to save`)
  return candidateJobs
}

const ZodJobMatchSchema = z.object({
  fit_score: z.coerce.number().min(0).max(100).catch(75),
  reason: z.preprocess(v => String(v ?? 'Matching candidate skills'), z.string()).catch('Matching candidate skills'),
  tech_stack: z.preprocess(v => Array.isArray(v) ? v.map(String) : [], z.array(z.string())).catch([]),
  is_match: z.preprocess(v => typeof v === 'boolean' ? v : String(v).toLowerCase() !== 'false', z.boolean()).catch(true),
})

async function evaluateJobsWithLLM(jobs: any[], profile: UserProfile, taskId?: string): Promise<any[]> {
  if (jobs.length === 0) return jobs

  const client = new OllamaClient()
  const evaluated: any[] = []
  // Evaluate top 10 candidates for fast discovery response
  const candidates = jobs.slice(0, 10)

  logger.info('[Discovery]', `Running Stage 2 combined LLM evaluation & skill extraction on top ${candidates.length} candidate jobs...`)

  const BATCH_SIZE = 3
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    if (taskId && await isTaskCancelled(taskId)) {
      logger.info('[Discovery]', 'LLM evaluation cancelled by user.')
      break
    }

    const batch = candidates.slice(i, i + BATCH_SIZE)
    const evalPromise = Promise.all(
      batch.map(async (job) => {
        try {
          const profileSummary = profile.dense_summary || profile.experience_summary || (profile.resume_text || '').slice(0, 500)
          
          const systemPrompt = `You are an expert AI job search evaluator. Compare the candidate profile with the job opportunity, extract all required tech stack skills mentioned in the job description, and output a structured match decision.

You MUST respond ONLY with a JSON object in this exact format:
{
  "fit_score": 85,
  "reason": "Strong match with candidate skills and experience",
  "tech_stack": ["AWS", "Node.js", "Python", "React"],
  "is_match": true
}`

          const userPrompt = `CANDIDATE PROFILE:
- Desired Roles: ${profile.desired_roles?.join(', ') || 'Software Engineer'}
- Skills: ${profile.skills?.slice(0, 12).join(', ') || 'Software Development'}
- Resume Summary: "${profileSummary}"

JOB OPPORTUNITY:
- Title: "${job.title}"
- Company: "${job.company}"
- Description: "${(job.description || '').slice(0, 1500)}"`

          const res = await client.chatStructured<z.infer<typeof ZodJobMatchSchema>>(
            [
              ['system', systemPrompt],
              ['human', userPrompt],
            ],
            ZodJobMatchSchema
          )

          if (res && typeof res.fit_score === 'number' && res.fit_score >= 40 && res.is_match !== false) {
            return {
              ...job,
              fit_score: res.fit_score,
              tech_stack: res.tech_stack?.length ? res.tech_stack : (job.tech_stack || []),
              match_reason: res.reason || '',
            }
          } else {
            logger.info('[Discovery]', `Stage 2 rejected "${job.title}" (Score: ${res?.fit_score || 0}): ${res?.reason || 'Low relevance'}`)
            return null
          }
        } catch (err: any) {
          logger.warn('[Discovery]', `Stage 2 evaluation skipped for "${job.title}": ${err.message}. Retaining Stage 1 score.`)
          return job
        }
      })
    )

    const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), 3000))
    const batchResults = await Promise.race([evalPromise, timeoutPromise])

    if (!batchResults) {
      logger.info('[Discovery]', `Stage 2 LLM evaluation timed out (>3s). Retaining Stage 1 vector match scores for ${batch.length} jobs.`)
      evaluated.push(...batch)
    } else {
      for (const r of batchResults) {
        if (r) evaluated.push(r)
      }
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

  for (const job of clean) {
    let embedding: number[] | null = null
    try {
      const jobText = `${job.title || ''} ${job.company || ''} ${(job.description || '').slice(0, 1000)}`
      embedding = await getEmbedding(jobText)
    } catch (e: any) {
      logger.warn('[Worker]', `Failed to generate vector embedding for "${job.title}": ${e.message}`)
    }

    const record: Record<string, any> = {
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

    if (embedding) {
      record.embedding = embedding
    }

    try {
      let { error } = await supabase.from('jobs').insert(record)
      
      // Fallback: If Supabase schema does not have the 'embedding' column yet (PGRST204), retry without it
      if (error && error.code === 'PGRST204' && record.embedding) {
        delete record.embedding
        const retry = await supabase.from('jobs').insert(record)
        error = retry.error
      }

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

let currentTaskId: string | null = null
let currentAppId: string | null = null

async function cleanupStaleTasks() {
  try {
    const { data: staleTasks } = await supabase
      .from('discovery_tasks')
      .select('id')
      .in('status', ['pending', 'queued', 'processing', 'running'])

    if (staleTasks && staleTasks.length > 0) {
      for (const t of staleTasks) {
        await supabase
          .from('discovery_tasks')
          .update({ status: 'interrupted', error_message: 'Worker restarted or closed' })
          .eq('id', t.id)
      }
      logger.info('[Worker]', `Updated ${staleTasks.length} interrupted discovery tasks from previous session.`)
    }

    const { data: staleApps } = await supabase
      .from('applications')
      .select('id')
      .in('current_status', ['pending', 'queued', 'processing'])

    if (staleApps && staleApps.length > 0) {
      for (const a of staleApps) {
        await supabase
          .from('applications')
          .update({ current_status: 'interrupted', notes: 'Worker restarted or closed' })
          .eq('id', a.id)
      }
      logger.info('[Worker]', `Updated ${staleApps.length} interrupted applications from previous session.`)
    }
  } catch (e: any) {
    logger.warn('[Worker]', 'Stale task cleanup warning:', e.message)
  }
}

async function handleShutdown(signal: string) {
  logger.info('[Worker]', `Received ${signal}. Marking active tasks as interrupted...`)
  if (currentTaskId) {
    await supabase.from('discovery_tasks').update({ status: 'interrupted', error_message: `Interrupted by application shutdown (${signal})` }).eq('id', currentTaskId)
  }
  if (currentAppId) {
    await supabase.from('applications').update({ current_status: 'interrupted', notes: `Interrupted by application shutdown (${signal})` }).eq('id', currentAppId)
  }
  process.exit(0)
}

process.on('SIGINT', () => handleShutdown('SIGINT'))
process.on('SIGTERM', () => handleShutdown('SIGTERM'))

// ── ON-DEMAND FRONTEND DISCOVERY TASK LISTENER ──
async function processPendingDiscoveryTasks() {
  const { data: pendingTasks } = await supabase
    .from('discovery_tasks')
    .select('*')
    .or('status.eq.pending,status.eq.queued')
    .order('created_at', { ascending: true })
    .limit(1)

  if (!pendingTasks || pendingTasks.length === 0) return

  for (const task of pendingTasks) {
    currentTaskId = task.id
    try {
      await supabase.from('discovery_tasks').update({ status: 'processing' }).eq('id', task.id)
      await log(task.user_id, `🔍 Frontend triggered discovery task: "${task.keywords?.join(', ')}" in "${task.location}"`, 'info')

      const profile = await getUserProfile(task.user_id)
      const keywords = (task.keywords && task.keywords.length) ? task.keywords : profile.desired_roles
      const location = task.location || profile.city || 'Remote'

      const discovered = await discoverJobs(keywords, location, profile, task.id)
      if (await isTaskCancelled(task.id)) {
        logger.info('[Worker]', `Discovery task ${task.id} was cancelled by user. Aborting.`)
        await log(task.user_id, `⛔ Discovery mission cancelled by user.`, 'info')
        return
      }

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
    } finally {
      currentTaskId = null
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
    currentAppId = app.id
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

      const automation = new PortalAutomationHybrid(supabase)
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
        if (targetJobId) {
          try { await supabase.from('jobs').update({ status: 'closed' }).eq('id', targetJobId) } catch {}
        }
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
    } finally {
      currentAppId = null
    }
  }
}

// ── MAIN WORKER POLLING LOOP ──
async function mainWorkerLoop() {
  logger.info('[Worker]', 'Agent Worker started. Polling for Frontend On-Demand tasks & applications every 5s...')
  await cleanupStaleTasks()
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
