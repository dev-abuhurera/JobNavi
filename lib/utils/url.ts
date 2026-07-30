// ─────────────────────────────────────────────────────────────────
// lib/utils/url.ts
// Deduplicated URL validation and classification helpers.
// Single source of truth — previously duplicated across
// lib/automation/discovery.ts and scripts/worker.ts.
// ─────────────────────────────────────────────────────────────────

import type { ApplicationType } from '../types'

/**
 * Returns true if the URL points to a real, individual job posting.
 * Rejects aggregator search pages, listing pages, and placeholder hosts.
 */
export function isRealUrl(url: string): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    const lower = url.toLowerCase()

    // Reject known fake/placeholder hosts
    const fakeHosts = ['example.com', 'test.com', 'placeholder.com']
    if (fakeHosts.some(h => parsed.hostname.endsWith(h))) return false

    // Reject aggregator search/listing pages
    const aggregatorPatterns = [
      '/jobs?', '/search?', '/q-', '-jobs.html',
      '/find-jobs', '/all-jobs', '/browse/',
      'salary', '/jobs/search', '/jobs/list',
      '/results', '/explore',
    ]

    if (aggregatorPatterns.some(p => lower.includes(p))) {
      // Allow specific job view URLs that happen to match the pattern
      if (
        lower.includes('viewjob') ||
        lower.includes('/rc/clk') ||
        lower.includes('/jobs/view/') ||
        lower.includes('/job/') ||
        lower.includes('jk=')
      ) return true
      return false
    }

    // LinkedIn: only allow specific job postings, not search pages
    if (parsed.hostname.includes('linkedin.com')) {
      return lower.includes('/jobs/view/') || lower.includes('currentJobId=')
    }

    return true
  } catch {
    return false
  }
}

/**
 * Returns true if the string looks like a real job title (not an ad or snippet).
 */
export function isRealJobTitle(title: string): boolean {
  if (!title) return false
  if (title.length > 120) return false

  const adPatterns = [
    'browse', 'apply early', 'new openings daily', 'get seen first',
    '1-click apply', '/hr)', '/hr.', 'per hour', 'openings daily',
    'new york city, ny', 'hiring now', 'see all jobs', 'view all',
  ]

  const lower = title.toLowerCase()
  return !adPatterns.some(p => lower.includes(p))
}

/**
 * Derives a short source name (e.g. 'linkedin') from a job URL.
 */
export function getSourceName(url: string): string {
  if (!url) return 'web'
  try {
    const domain = new URL(url).hostname.toLowerCase()
    if (domain.includes('linkedin.com')) return 'linkedin'
  } catch { /* ignore */ }
  return 'web'
}

/**
 * Classifies the application type based on the job URL or recruiter email.
 */
export function classifyApplicationType(
  url: string,
  recruiterEmail?: string | null
): ApplicationType {
  if (recruiterEmail) return 'email_outreach'
  const lower = (url || '').toLowerCase()
  if (lower.includes('linkedin.com')) return 'linkedin_easy_apply'
  return 'manual'
}
