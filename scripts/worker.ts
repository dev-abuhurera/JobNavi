/**
 * Job Search Agent - Background Worker (Production Ready)
 * This worker polls for discovery tasks and pending applications.
 * Uses semantic profile-to-job matching and respects system shutdown signals.
 */
import { PortalAutomation } from '../lib/automation/portal_automation'
import { batchFilterJobsByProfile, UserProfile } from '../lib/utils/matching'
import { createClient } from '@supabase/supabase-js'
import Groq from 'groq-sdk'
import axios from 'axios'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

async function log(userId: string, msg: string, level: 'info' | 'success' | 'error' = 'info') {
  const timestamp = new Date().toLocaleTimeString()
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${msg}`)
  await supabase.from('activity_logs').insert({ user_id: userId, msg, level })
}

function isRealUrl(url: string): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    const lowerUrl = url.toLowerCase()
    const fakeHosts = ['example.com', 'test.com', 'placeholder.com']
    if (fakeHosts.some(h => parsed.hostname.endsWith(h))) return false
    const aggregatorPatterns = ['/jobs?', '/search?', '/q-', '-jobs.html', 'results', 'explore', 'all-jobs', '/find-jobs']
    if (aggregatorPatterns.some(p => lowerUrl.includes(p))) {
      if (lowerUrl.includes('viewjob') || lowerUrl.includes('/rc/clk')) return true
      return false
    }
    return true
  } catch {
    return false
  }
}

async function getUserProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).single()
  if (error || !data) throw new Error('User profile not found or incomplete')
  return {
    skills: data.profile_data?.skills || [],
    experience: data.profile_data?.experience || [],
    preferences: data.profile_data?.preferences || {}
  }
}

async function discoverJobs(keywords: string[], location: string, profile: UserProfile) {
  let allDiscovered: any[] = []
  
  // 1. Serper/Google Search
  try {
    const query = `${keywords.join(' ')} developer jobs`
    const { data } = await axios.post('https://google.serper.dev/search', { q: query }, {
      headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' }
    })
    const serperJobs = (data.organic || []).map((res: any) => ({
      title: res.title,
      company: res.snippet?.split(' · ')[0] || 'Unknown',
      source_url: res.link,
      source: 'serper',
      location
    })).filter((j: any) => isRealUrl(j.source_url))
    allDiscovered = [...allDiscovered, ...serperJobs]
  } catch (err) {
    console.error('[Discovery] Serper failed:', err)
  }

  // 2. Remotive API
  try {
    const { data } = await axios.get(`https://remotive.com/api/remote-jobs?search=${keywords[0]}`)
    const remotiveJobs = (data.jobs || []).map((j: any) => ({
      title: j.title,
      company: j.company_name,
      source_url: j.url,
      source: 'remotive',
      location: 'Remote',
      description: j.description?.replace(/<[^>]*>/g, '').slice(0, 500)
    }))
    allDiscovered = [...allDiscovered, ...remotiveJobs]
  } catch (err) {
    console.error('[Discovery] Remotive failed:', err)
  }

  return batchFilterJobsByProfile(allDiscovered, profile)
}

async function saveJobs(jobs: any[], userId: string) {
  for (const job of jobs) {
    const { data: existing } = await supabase.from('jobs').select('id').eq('source_url', job.source_url).eq('user_id', userId).single()
    if (!existing) {
      await supabase.from('jobs').insert({ ...job, user_id: userId, status: 'discovered' })
    }
  }
}

async function processApplication(app: any) {
  const automation = new PortalAutomation()
  try {
    const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', app.user_id).single()
    const { data: job } = await supabase.from('jobs').select('*').eq('id', app.job_id).single()
    if (!profile || !job) throw new Error('Incomplete data for application')
    await automation.applyToJob(job.source_url, profile)
    await supabase.from('applications').update({ current_status: 'applied', applied_at: new Date().toISOString() }).eq('id', app.id)
  } finally {
    await automation.close()
  }
}

// ─────────────────────────────────────────────────────────────────
// Main Loop & Shutdown Logic
// ─────────────────────────────────────────────────────────────────

let isShuttingDown = false

async function processTasks() {
  console.log('🚀 Agent Worker started. Polling for tasks every 5s...')
  
  while (!isShuttingDown) {
    try {
      // 1. Discovery tasks
      const { data: tasks } = await supabase.from('discovery_tasks').select('*').eq('status', 'pending').limit(1)

      if (tasks && tasks.length > 0) {
        const { id, user_id, keywords, location } = tasks[0]
        await supabase.from('discovery_tasks').update({ status: 'running' }).eq('id', id)
        await log(user_id, `Starting discovery for: ${keywords.join(', ')}`, 'info')

        try {
          const profile = await getUserProfile(user_id)
          const jobs = await discoverJobs(keywords, location || 'Remote', profile)
          await saveJobs(jobs, user_id)
          await supabase.from('discovery_tasks').update({ status: 'completed' }).eq('id', id)
          await log(user_id, `Discovery complete. Found ${jobs.length} matches.`, 'success')
        } catch (err) {
          await supabase.from('discovery_tasks').update({ status: 'failed' }).eq('id', id)
          await log(user_id, `Discovery failed: ${String(err)}`, 'error')
        }
      }

      // 2. Pending applications
      const { data: apps } = await supabase.from('applications').select('*').eq('current_status', 'pending').limit(1)
      if (apps && apps.length > 0) {
        const app = apps[0]
        await log(app.user_id, `Processing application for ${app.company}...`, 'info')
        try {
          await processApplication(app)
          await log(app.user_id, `Successfully applied to ${app.company}`, 'success')
        } catch (err) {
          await log(app.user_id, `Application failed for ${app.company}: ${String(err)}`, 'error')
          await supabase.from('applications').update({ current_status: 'failed' }).eq('id', app.id)
        }
      }
    } catch (err) {
      console.error('[CRITICAL] Loop error:', err)
    }

    if (!isShuttingDown) {
      await new Promise(r => setTimeout(r, 5000))
    }
  }
  
  console.log('👋 Worker loop stopped gracefully.')
  process.exit(0)
}

process.on('SIGINT', () => { isShuttingDown = true; console.log('\n[SIGINT] Stopping...') })
process.on('SIGTERM', () => { isShuttingDown = true; console.log('\n[SIGTERM] Stopping...') })

processTasks().catch(err => {
  console.error('[FATAL] Worker crashed:', err)
  process.exit(1)
})
