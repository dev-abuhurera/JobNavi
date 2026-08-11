// ─────────────────────────────────────────────────────────────────
// lib/utils/job-details.ts
// Utility functions for parsing complete job details, stipend, salary,
// recruiter contacts, and description sections.
// ─────────────────────────────────────────────────────────────────

export interface ParsedJobInfo {
  stipendOrSalary: string
  stipendType: 'stipend' | 'salary' | 'hourly' | 'unpaid' | 'not_specified'
  recruiterEmail?: string
  recruiterPhone?: string
  experienceRequired?: string
  formattedDescription: string
}

/**
 * Extracts stipend, salary, hourly pay, or compensation details from job text / metadata.
 */
export function extractStipendOrSalary(job: any): { text: string; type: 'stipend' | 'salary' | 'hourly' | 'unpaid' | 'not_specified' } {
  if (!job) return { text: 'Not specified in job listing', type: 'not_specified' }

  // Check explicit properties first if present
  if (job.stipend) return { text: String(job.stipend), type: 'stipend' }
  if (job.salary) return { text: String(job.salary), type: 'salary' }
  if (job.compensation) return { text: String(job.compensation), type: 'salary' }

  // Check notes JSON if present
  if (job.notes) {
    try {
      const parsed = typeof job.notes === 'string' ? JSON.parse(job.notes) : job.notes
      if (parsed?.stipend) return { text: String(parsed.stipend), type: 'stipend' }
      if (parsed?.salary) return { text: String(parsed.salary), type: 'salary' }
    } catch {}
  }

  const desc = (job.description || '') + ' ' + (job.title || '')

  // 1. Unpaid check
  if (/\b(unpaid|non-paid|0\s*salary|no\s*stipend|voluntary)\b/i.test(desc)) {
    return { text: 'Unpaid Opportunity', type: 'unpaid' }
  }

  // 2. Stipend patterns (e.g. Stipend: PKR 40,000/month, $500/mo, etc.)
  const stipendRegexes = [
    /stipend[:\s]+([$€£₹]?\s*[\d,]+(?:\s*-\s*[$€£₹]?\s*[\d,]+)?\s*(?:k|K|pkr|rs|usd|eur|gbp)?\s*(?:\/|\s*per\s*)?(?:month|mo|pm|hr|hour)?)/i,
    /([$€£₹]|pkr|rs\.?)\s*[\d,kK]+\s*(?:-\s*[$€£₹]?\s*[\d,kK]+)?\s*(?:\/|\s*per\s*)?(?:month|mo|pm)\b/i,
    /stipend\s*of\s*([^\n\.,;]{3,30})/i,
    /monthly\s*stipend[:\s]+([^\n\.,;]{3,30})/i
  ]

  for (const reg of stipendRegexes) {
    const match = desc.match(reg)
    if (match) {
      const clean = match[0].trim().replace(/^stipend[:\s]*/i, '')
      return { text: clean, type: 'stipend' }
    }
  }

  // 3. Hourly rate patterns
  const hourlyMatch = desc.match(/([$€£₹]\s*\d+(?:\.\d{2})?\s*(?:-\s*[$€£₹]?\s*\d+(?:\.\d{2})?)?\s*(?:\/|\s*per\s*)?(?:hr|hour))/i)
  if (hourlyMatch) {
    return { text: hourlyMatch[0].trim(), type: 'hourly' }
  }

  // 4. Annual / Monthly Salary patterns
  const salaryRegexes = [
    /(?:salary|compensation|pay|ctc)[:\s]+([$€£₹]?\s*[\d,]+(?:\s*-\s*[$€£₹]?\s*[\d,]+)?\s*(?:k|K|lpa|pkr|rs|usd|eur|gbp)?\s*(?:\/|\s*per\s*)?(?:year|yr|annum|month|mo)?)/i,
    /([$€£₹]\s*[\d,]+k?\s*(?:-\s*[$€£₹]?\s*[\d,]+k?)\s*(?:\/|\s*per\s*)?(?:year|yr|annum|a\s*year)?)/i,
    /(\d+\s*-\s*\d+\s*lpa)/i
  ]

  for (const reg of salaryRegexes) {
    const match = desc.match(reg)
    if (match) {
      const clean = match[0].trim().replace(/^(?:salary|compensation|pay|ctc)[:\s]*/i, '')
      return { text: clean, type: 'salary' }
    }
  }

  return { text: 'Not specified in job listing', type: 'not_specified' }
}

/**
 * Extracts recruiter email / phone if available in job description or record.
 */
export function extractRecruiterContacts(job: any): { email?: string; phone?: string } {
  const email = job?.recruiter_email || (job?.description?.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/)?.[0])
  const phone = job?.recruiter_phone || (job?.description?.match(/\b(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/)?.[0])
  return { email, phone }
}

/**
 * Cleans up and formats full job description for presentation.
 */
export function formatJobDescription(description?: string): string {
  if (!description || !description.trim()) {
    return 'No full description provided for this job listing. Click "View Original Listing" to view on the source website.'
  }

  return description
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim()
}
