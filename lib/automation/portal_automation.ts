import { chromium, BrowserContext, Page, Browser } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

/**
 * PortalAutomation — handles automated job applications via Playwright
 * Supports: LinkedIn Easy Apply, Indeed Apply, Rozee.pk, Mustakbil
 * Features: human-like delays, session management, screenshots, proof logging
 */
export class PortalAutomation {
  private supabase: any
  private context: BrowserContext | null = null
  private browser: Browser | null = null

  constructor(supabase: any) {
    this.supabase = supabase
  }

  // ─────────────────────────────────────────────────────────────────
  // Initialization — loads saved portal session from Supabase
  // ─────────────────────────────────────────────────────────────────

  async init(userId: string, portal: string) {
    this.browser = await chromium.launch({
      headless: false, // Visible browser — less bot detection, easier to debug
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
      ],
    })

    // Try to load saved session
    const { data: session } = await this.supabase
      .from('portal_sessions')
      .select('session_data')
      .eq('user_id', userId)
      .eq('portal', portal)
      .single()

    if (session?.session_data) {
      try {
        const storageState = JSON.parse(
          Buffer.from(session.session_data, 'base64').toString()
        )
        this.context = await this.browser.newContext({
          storageState,
          viewport: { width: 1366, height: 768 },
          userAgent:
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        })
        console.log(`[Automation] Loaded saved session for ${portal}`)
      } catch (e) {
        console.warn(`[Automation] Session parse failed — starting fresh for ${portal}`)
        this.context = await this.browser.newContext({
          viewport: { width: 1366, height: 768 },
        })
      }
    } else {
      this.context = await this.browser.newContext({
        viewport: { width: 1366, height: 768 },
      })
      console.log(`[Automation] No session found for ${portal} — starting fresh`)
    }

    // Remove webdriver flag to avoid bot detection
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    })
    
  }

  // ─────────────────────────────────────────────────────────────────
  // Main apply method — routes to correct portal handler
  // ─────────────────────────────────────────────────────────────────

  async applyToJob(jobId: string, userId: string): Promise<{
    status: string
    screenshot?: string
    message?: string
  }> {
    if (!this.context) throw new Error('Automation not initialized. Call init() first.')

    // Fetch job details
    const { data: job } = await this.supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (!job) throw new Error(`Job ${jobId} not found in database`)

    // Fetch candidate profile
    const { data: profileRow } = await this.supabase
      .from('profiles')
      .select('profile_data')
      .eq('user_id', userId)
      .single()

    const profile = profileRow?.profile_data || {}

    console.log(`[Automation] Applying to: ${job.title} at ${job.company} via ${job.source}`)

    const page = await this.context.newPage()
    let result: { status: string; screenshot?: string; message?: string }

    try {
      // Check session is still valid before applying
      const sessionValid = await this._checkSessionValid(page, job.source)
      if (!sessionValid) {
        return { status: 'session_expired', message: `Please reconnect your ${job.source} account in Settings` }
      }

      // Route to correct portal handler
      switch (job.application_type) {
        case 'linkedin_easy_apply':
          result = await this._handleLinkedIn(page, job, profile, userId)
          break
        case 'indeed_apply':
          result = await this._handleIndeed(page, job, profile, userId)
          break
        case 'rozee_apply':
          result = await this._handleRozee(page, job, profile, userId)
          break
        case 'mustakbil_apply':
          result = await this._handleMustakbil(page, job, profile, userId)
          break
        default:
          result = { status: 'manual_required', message: `${job.source} requires manual application` }
      }

      // Update application status in database
      if (result.status === 'applied') {
        await this.supabase
          .from('applications')
          .update({
            current_status: 'applied',
            date_applied: new Date().toISOString(),
            notes: `Applied via ${job.source} automation`,
          })
          .eq('job_id', jobId)
          .eq('user_id', userId)
      }

    } catch (error: any) {
      console.error(`[Automation] Error: ${error.message}`)
      result = { status: 'error', message: error.message }
    } finally {
      await page.close()
    }

    return result
  }

  // ─────────────────────────────────────────────────────────────────
  // LinkedIn Easy Apply
  // ─────────────────────────────────────────────────────────────────

  private async _handleLinkedIn(page: Page, job: any, profile: any, userId: string) {
    await page.goto(job.source_url, { waitUntil: 'networkidle' })
    await this._humanDelay(2000, 4000)

    // Check if redirected to login
    if (page.url().includes('login') || page.url().includes('authwall')) {
      return { status: 'session_expired', message: 'LinkedIn session expired — please reconnect' }
    }

    // Find Easy Apply button — try multiple selectors
    const applyButton = await this._findElement(page, [
      '.jobs-apply-button',
      'button:has-text("Easy Apply")',
      '[data-control-name="jobdetails_topcard_inapply"]',
      'button.jobs-apply-button',
    ])

    if (!applyButton) {
      return { status: 'no_apply_button', message: 'Easy Apply button not found — may require external application' }
    }

    await applyButton.click()
    await this._humanDelay(1500, 3000)

    // Handle multi-step form
    let stepCount = 0
    const maxSteps = 8

    while (stepCount < maxSteps) {
      stepCount++

      // Fill phone number if field appears
      const phoneField = await page.$('input[id*="phone"], input[name*="phone"], input[placeholder*="phone"]')
     
      if (phoneField) {
        await phoneField.click()
        await phoneField.fill('')  // clear first
        for (const char of (profile.phone || '')) {
          await phoneField.type(char)
          await new Promise(r => setTimeout(r, Math.random() * 100 + 50))
        }
      }

      // Upload resume if file input appears
      const fileInput = await page.$('input[type="file"]')
      if (fileInput) {
        const resumePath = await this._findResumeFile(userId)
        if (resumePath) {
          await fileInput.setInputFiles(resumePath)
          await this._humanDelay(1000, 2000)
          console.log(`[Automation] Resume uploaded: ${resumePath}`)
        }
      }

      // Check for Next button
      const nextButton = await this._findElement(page, [
        'button:has-text("Next")',
        'button:has-text("Continue")',
        'button[aria-label="Continue to next step"]',
      ])

      // Check for Submit/Review button
      const submitButton = await this._findElement(page, [
        'button:has-text("Submit application")',
        'button:has-text("Submit")',
        'button[aria-label="Submit application"]',
      ])

      if (submitButton) {
        await this._humanDelay(1000, 2000)
        await submitButton.click()
        await this._humanDelay(2000, 4000)

        // Take screenshot as proof
        const screenshotPath = await this._takeScreenshot(page, userId, job.company)
        console.log(`[Automation] ✅ LinkedIn Easy Apply submitted for ${job.company}`)
        return { status: 'applied', screenshot: screenshotPath }
      }

      if (nextButton) {
        await nextButton.click()
        await this._humanDelay(1500, 3000)
        continue
      }

      // No next or submit — we're stuck
      break
    }

    const screenshotPath = await this._takeScreenshot(page, userId, job.company)
    return { status: 'incomplete', screenshot: screenshotPath, message: 'Could not complete all form steps' }
  }

  // ─────────────────────────────────────────────────────────────────
  // Indeed Apply
  // ─────────────────────────────────────────────────────────────────

  private async _handleIndeed(page: Page, job: any, profile: any, userId: string) {
    await page.goto(job.source_url, { waitUntil: 'networkidle' })
    await this._humanDelay(2000, 3000)

    if (page.url().includes('login') || page.url().includes('signin')) {
      return { status: 'session_expired', message: 'Indeed session expired — please reconnect' }
    }

    // Find apply button
    const applyButton = await this._findElement(page, [
      'button:has-text("Apply now")',
      'button:has-text("Apply")',
      '#indeedApplyButton',
      '.ia-IndeedApplyButton',
    ])

    if (!applyButton) {
      return { status: 'no_apply_button', message: 'Apply button not found on Indeed job page' }
    }

    await applyButton.click()
    await this._humanDelay(2000, 3000)

    // Fill name fields
    const firstNameField = await page.$('input[name="firstName"], input[id*="first"]')
    if (firstNameField) {
      const nameParts = (profile.name || 'Candidate').split(' ')
      await firstNameField.click()
      await this._humanType(page, nameParts[0] || 'Candidate')
      await this._humanDelay(300, 700)
    }

    const lastNameField = await page.$('input[name="lastName"], input[id*="last"]')
    if (lastNameField) {
      const nameParts = (profile.name || 'Candidate Name').split(' ')
      await lastNameField.click()
      await this._humanType(page, nameParts[1] || 'Candidate')
      await this._humanDelay(300, 700)
    }

    // Fill email
    const emailField = await page.$('input[type="email"], input[name="email"]')
    if (emailField) {
      await emailField.click()
      await this._humanType(page, profile.email || '')
      await this._humanDelay(300, 700)
    }

    // Fill phone
    const phoneField = await page.$('input[type="tel"], input[name="phone"]')
    if (phoneField) {
      await phoneField.click()
      await this._humanType(page, profile.phone || '')
      await this._humanDelay(300, 700)
    }

    // Upload resume
    const fileInput = await page.$('input[type="file"]')
    if (fileInput) {
      const resumePath = await this._findResumeFile(userId)
      if (resumePath) {
        await fileInput.setInputFiles(resumePath)
        await this._humanDelay(1500, 2500)
      }
    }

    await this._humanDelay(1000, 2000)

    // Submit
    const submitButton = await this._findElement(page, [
      'button:has-text("Submit")',
      'button:has-text("Submit your application")',
      'button[type="submit"]',
    ])

    if (submitButton) {
      await submitButton.click()
      await this._humanDelay(2000, 4000)
      const screenshotPath = await this._takeScreenshot(page, userId, job.company)
      console.log(`[Automation] ✅ Indeed application submitted for ${job.company}`)
      return { status: 'applied', screenshot: screenshotPath }
    }

    const screenshotPath = await this._takeScreenshot(page, userId, job.company)
    return { status: 'incomplete', screenshot: screenshotPath, message: 'Submit button not found' }
  }

  // ─────────────────────────────────────────────────────────────────
  // Rozee.pk Apply
  // ─────────────────────────────────────────────────────────────────

  private async _handleRozee(page: Page, job: any, profile: any, userId: string) {
    await page.goto(job.source_url, { waitUntil: 'networkidle' })
    await this._humanDelay(2000, 3000)

    if (page.url().includes('login') || page.url().includes('signin')) {
      return { status: 'session_expired', message: 'Rozee session expired — please reconnect' }
    }

    // Find apply button
    const applyButton = await this._findElement(page, [
      'button:has-text("Apply")',
      'a:has-text("Apply Now")',
      '.apply-btn',
      '#apply-button',
    ])

    if (!applyButton) {
      return { status: 'no_apply_button', message: 'Apply button not found on Rozee job page' }
    }

    await applyButton.click()
    await this._humanDelay(2000, 3000)

    // Fill cover letter if field exists
    const coverLetterField = await page.$('textarea[name*="cover"], textarea[id*="cover"]')
    if (coverLetterField && job.cover_letter) {
      await coverLetterField.click()
      await this._humanType(page, job.cover_letter)
      await this._humanDelay(500, 1000)
    }

    // Upload CV
    const fileInput = await page.$('input[type="file"]')
    if (fileInput) {
      const resumePath = await this._findResumeFile(userId)
      if (resumePath) {
        await fileInput.setInputFiles(resumePath)
        await this._humanDelay(1500, 2500)
      }
    }

    await this._humanDelay(1000, 2000)

    // Submit
    const submitButton = await this._findElement(page, [
      'button[type="submit"]',
      'button:has-text("Submit")',
      'button:has-text("Apply Now")',
      'input[type="submit"]',
    ])

    if (submitButton) {
      await submitButton.click()
      await this._humanDelay(2000, 4000)
      const screenshotPath = await this._takeScreenshot(page, userId, job.company)
      console.log(`[Automation] ✅ Rozee application submitted for ${job.company}`)
      return { status: 'applied', screenshot: screenshotPath }
    }

    const screenshotPath = await this._takeScreenshot(page, userId, job.company)
    return { status: 'incomplete', screenshot: screenshotPath, message: 'Submit button not found on Rozee' }
  }

  // ─────────────────────────────────────────────────────────────────
  // Mustakbil Apply
  // ─────────────────────────────────────────────────────────────────

  private async _handleMustakbil(page: Page, job: any, profile: any, userId: string) {
    await page.goto(job.source_url, { waitUntil: 'networkidle' })
    await this._humanDelay(2000, 3000)

    if (page.url().includes('login')) {
      return { status: 'session_expired', message: 'Mustakbil session expired — please reconnect' }
    }

    const applyButton = await this._findElement(page, [
      'button:has-text("Apply")',
      'a:has-text("Apply Now")',
      '.apply-job-btn',
    ])

    if (!applyButton) {
      return { status: 'no_apply_button', message: 'Apply button not found on Mustakbil' }
    }

    await applyButton.click()
    await this._humanDelay(2000, 3000)

    // Upload resume
    const fileInput = await page.$('input[type="file"]')
    if (fileInput) {
      const resumePath = await this._findResumeFile(userId)
      if (resumePath) {
        await fileInput.setInputFiles(resumePath)
        await this._humanDelay(1500, 2500)
      }
    }

    const submitButton = await this._findElement(page, [
      'button[type="submit"]',
      'button:has-text("Apply")',
    ])

    if (submitButton) {
      await submitButton.click()
      await this._humanDelay(2000, 3000)
      const screenshotPath = await this._takeScreenshot(page, userId, job.company)
      return { status: 'applied', screenshot: screenshotPath }
    }

    const screenshotPath = await this._takeScreenshot(page, userId, job.company)
    return { status: 'incomplete', screenshot: screenshotPath }
  }

  // ─────────────────────────────────────────────────────────────────
  // Session Management
  // ─────────────────────────────────────────────────────────────────

  async saveSession(userId: string, portal: string) {
    if (!this.context) return

    const state = await this.context.storageState()
    const encoded = Buffer.from(JSON.stringify(state)).toString('base64')

    await this.supabase.from('portal_sessions').upsert({
      user_id: userId,
      portal,
      session_data: encoded,
      connected_at: new Date().toISOString(),
      status: 'active',
    }, { onConflict: 'user_id,portal' })

    console.log(`[Automation] Session saved for ${portal}`)
  }

  async startLoginSession(userId: string, portal: string): Promise<boolean> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: false })
    }

    this.context = await this.browser.newContext({
      viewport: { width: 1366, height: 768 },
    })

    const page = await this.context.newPage()
    const loginUrls: Record<string, string> = {
      linkedin: 'https://www.linkedin.com/login',
      indeed: 'https://secure.indeed.com/account/login',
      rozee: 'https://www.rozee.pk/login',
      mustakbil: 'https://www.mustakbil.com/login',
    }

    await page.goto(loginUrls[portal] || loginUrls.linkedin)
    console.log(`[Automation] Browser opened for ${portal} — please log in manually`)

    // Wait up to 3 minutes for user to login
    const deadline = Date.now() + 3 * 60 * 1000

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000))
      const url = page.url()

      const successUrls: Record<string, string> = {
        linkedin: 'linkedin.com/feed',
        indeed: 'indeed.com/jobs',
        rozee: 'rozee.pk/candidate',
        mustakbil: 'mustakbil.com/jobs',
      }

      if (url.includes(successUrls[portal] || 'feed')) {
        await this.saveSession(userId, portal)
        await page.close()
        return true
      }
    }

    await page.close()
    return false
  }

  // ─────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────

  private async _findElement(page: Page, selectors: string[]) {
    for (const selector of selectors) {
      try {
        const el = await page.waitForSelector(selector, { timeout: 3000 })
        if (el && await el.isVisible()) return el
      } catch {
        continue
      }
    }
    return null
  }

  private async _humanDelay(min: number, max: number) {
    const ms = Math.floor(Math.random() * (max - min) + min)
    await new Promise(r => setTimeout(r, ms))
  }

  private async _humanType(page: Page, text: string) {
    for (const char of text) {
      await page.keyboard.type(char)
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 100 + 50)))
    }
  }

  private async _checkSessionValid(page: Page, portal: string): Promise<boolean> {
    const checkUrls: Record<string, string> = {
      linkedin: 'https://www.linkedin.com/feed',
      indeed: 'https://www.indeed.com/jobs',
      rozee: 'https://www.rozee.pk',
      mustakbil: 'https://www.mustakbil.com',
      remotive: 'https://remotive.com',
      arbeitnow: 'https://www.arbeitnow.com',
    }

    const checkUrl = checkUrls[portal]
    if (!checkUrl) return true // Unknown portal — assume valid

    try {
      await page.goto(checkUrl, { waitUntil: 'networkidle', timeout: 10000 })
      const url = page.url()
      return !url.includes('login') && !url.includes('signin') && !url.includes('authwall')
    } catch {
      return false
    }
  }

  private async _findResumeFile(userId: string): Promise<string | null> {
    const searchPaths = [
      path.join(process.cwd(), 'data', 'resumes', `${userId}_resume.pdf`),
      path.join(process.cwd(), 'data', 'resumes', `${userId}_resume.docx`),
      path.join(process.cwd(), 'data', 'candidate_profiles', `${userId}_master_cv.docx`),
      path.join(process.cwd(), 'public', 'resumes', `${userId}_resume.pdf`),
    ]

    for (const p of searchPaths) {
      if (fs.existsSync(p)) return p
    }

    console.warn(`[Automation] No resume file found for user ${userId}`)
    return null
  }

  private async _takeScreenshot(page: Page, userId: string, company: string): Promise<string> {
    const dir = path.join(process.cwd(), 'public', 'screenshots')
    fs.mkdirSync(dir, { recursive: true })

    const filename = `${userId}_${company.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.png`
    const filepath = path.join(dir, filename)

    await page.screenshot({ path: filepath, fullPage: true })

    // Save reference to Supabase
    await this.supabase.from('screenshots').insert({
      user_id: userId,
      company,
      file_path: `/screenshots/${filename}`,
      created_at: new Date().toISOString(),
    })

    console.log(`[Automation] Screenshot saved: ${filepath}`)
    return `/screenshots/${filename}`
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.context = null
    }
  }
}