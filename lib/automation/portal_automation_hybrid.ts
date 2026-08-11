import { chromium, BrowserContext, Page, Browser, ElementHandle } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { normalizeProfile } from '../utils/profile'
import { validateConfig } from '../config'
import { logger } from '../logger'
import type { NormalizedProfile, ApplicationResult } from '../types'
import { FormExtractor } from './form_extractor'
import { FormDOMActions } from './form_dom_actions'
import { FormAIFiller } from './form_ai_filler'
import { StagehandService } from './stagehand_service'
export { normalizeProfile }
export type { NormalizedProfile }

export class PortalAutomationHybrid {
  private supabase: any
  private groqApiKey?: string
  private context: BrowserContext | null = null
  private browser: Browser | null = null
  private _hasSession: boolean = false

  constructor(supabase: any, groqApiKey: string = '') {
    this.supabase = supabase
    this.groqApiKey = groqApiKey
  }

  private _getUserProfileDir(userId: string, portal: string): string {
    const dir = path.join(os.tmpdir(), 'jobnavi-user-profiles', `user_${userId}_${portal}`)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    return dir
  }

  // ─────────────────────────────────────────────────────────────────
  // Initialization — loads saved portal session from Supabase
  // ─────────────────────────────────────────────────────────────────

  async init(userId: string, portal: string, isHeadless: boolean = false) {
    const cfg = validateConfig()
    const userProfileDir = this._getUserProfileDir(userId, portal)

    const launchArgs = [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ]

    const launchOptions = {
      headless: isHeadless,
      executablePath: cfg.chromeExecutablePath,
      viewport: { width: 1366, height: 768 } as const,
      args: launchArgs,
    }

    try {
      this.context = await chromium.launchPersistentContext(userProfileDir, launchOptions)
      console.log(`[Automation] Launched isolated browser context for user ${userId} (${portal})`)
    } catch (e: any) {
      const tempDir = path.join(os.tmpdir(), `jobnavi-temp-profile-${Date.now()}`)
      this.context = await chromium.launchPersistentContext(tempDir, {
        ...launchOptions,
        args: [...launchArgs, '--no-first-run', '--no-default-browser-check'],
      })
      console.log(`[Automation] Launched temp browser context for ${portal}`)
    }

    this._hasSession = true

    // Remove webdriver flag to avoid bot detection
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    })

    // ── Inject saved session cookies from Supabase ──
    try {
      const { data: sessionRow } = await this.supabase
        .from('portal_sessions')
        .select('session_data')
        .eq('user_id', userId)
        .eq('portal', portal)
        .single()

      if (sessionRow?.session_data) {
        const storageState = JSON.parse(Buffer.from(sessionRow.session_data, 'base64').toString('utf-8'))

        if (storageState.cookies && storageState.cookies.length > 0) {
          await this.context.addCookies(storageState.cookies)
          console.log(`[Automation] ✅ Injected ${storageState.cookies.length} saved cookies for ${portal}`)
        }

        if (storageState.origins && storageState.origins.length > 0) {
          for (const origin of storageState.origins) {
            for (const item of origin.localStorage || []) {
              await this.context.addInitScript(({ originUrl, key, val }: { originUrl: string, key: string, val: string }) => {
                if (window.location.origin === originUrl) {
                  localStorage.setItem(key, val)
                }
              }, { originUrl: origin.origin, key: item.name, val: item.value })
            }
          }
          console.log(`[Automation] ✅ Injected localStorage for ${storageState.origins.length} origins`)
        }
      } else {
        console.log(`[Automation] No saved session found for ${portal}. Will rely on persistent Chrome profile.`)
      }
    } catch (sessionError: any) {
      console.warn(`[Automation] ⚠️ Could not load saved session for ${portal}: ${sessionError.message}`)
    }
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

    // Fetch job details with fallback
    const { data: jobRow } = await this.supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle()

    const { data: appRow } = await this.supabase
      .from('applications')
      .select('*')
      .or(`job_id.eq.${jobId},id.eq.${jobId}`)
      .eq('user_id', userId)
      .maybeSingle()

    if (!jobRow && !appRow) throw new Error(`Job ${jobId} not found in database`)

    let job = jobRow ? { ...jobRow } : {
      id: appRow.job_id || appRow.id,
      user_id: appRow.user_id,
      title: appRow.job_title || 'Job Opportunity',
      company: appRow.company || 'Unknown',
      location: appRow.location || 'Remote',
      source_url: appRow.source_url,
      source: appRow.source || 'linkedin',
      application_type: appRow.source_url?.includes('linkedin.com') ? 'linkedin_easy_apply' : 'manual'
    }

    if (appRow?.notes) {
      (job as any).app_notes = appRow.notes
    }

    // Fetch candidate profile and normalize to canonical shape
    const { data: profileRow } = await this.supabase
      .from('profiles')
      .select('profile_data')
      .eq('user_id', userId)
      .single()

    const profile = normalizeProfile(profileRow?.profile_data || {})

    console.log(`[Automation] Applying to: ${job.title} at ${job.company} via ${job.source}`)

    const page = await this.context.newPage()
    let result: { status: string; screenshot?: string; message?: string }

    try {
      // Display a beautiful flash message before opening the portal
      const portalName = job.source ? job.source.charAt(0).toUpperCase() + job.source.slice(1).replace('_apply', '') : 'Portal';
      await page.setContent(`
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #0f172a; font-family: system-ui, -apple-system, sans-serif; margin: 0;">
          <div style="text-align: center; padding: 50px; background: #1e293b; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); max-width: 500px; border: 1px solid #334155;">
            <div style="width: 80px; height: 80px; background: #3b82f6; border-radius: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            </div>
            <h1 style="color: #f8fafc; font-size: 28px; font-weight: 700; margin: 0 0 12px; letter-spacing: -0.5px;">JobNavi Auto-Apply</h1>
            <p style="color: #94a3b8; font-size: 18px; margin: 0 0 30px; line-height: 1.5;">Preparing to open <strong style="color: #38bdf8;">${portalName}</strong> for <br/><strong style="color: #f1f5f9;">${job.company}</strong>...</p>
            <div style="position: relative; height: 6px; background: #334155; border-radius: 10px; overflow: hidden; width: 100%;">
              <div style="position: absolute; top: 0; left: 0; height: 100%; background: #3b82f6; width: 50%; border-radius: 10px; animation: progress 2s ease-in-out infinite;"></div>
            </div>
            <style>
              @keyframes progress { 
                0% { left: -50%; } 
                100% { left: 100%; } 
              }
            </style>
          </div>
        </div>
      `);
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check session validity only for automated portals that require login
      const automatedPortals = ['linkedin']
      if (automatedPortals.includes(job.source)) {
        const sessionValid = await this._checkSessionValid(page, job.source)
        if (!sessionValid) {
          return { status: 'session_expired', message: `Please reconnect your ${job.source} account in Settings` }
        }
      }

      // Route to correct portal handler with smart application_type fallback
      const appType = job.application_type || (job.source_url?.includes('linkedin.com') ? 'linkedin_easy_apply' : 'manual')
      switch (appType) {
        case 'linkedin_easy_apply':
          result = await this._applyLinkedIn(page, job, profile, userId)
          break
        default:
          result = { status: 'error', message: `${job.source || 'Portal'} requires manual application` }
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
  // Browser Pre-Verification — Checks live page for Easy Apply & closed status
  // ─────────────────────────────────────────────────────────────────

  async verifyEasyApplyJobs(jobs: any[]): Promise<any[]> {
    if (!this.context) throw new Error('Automation not initialized. Call init() first.')
    const verifiedJobs: any[] = []
    const page = await this.context.newPage()

    try {
      // Disable images, media, and fonts for lightweight fast page checks
      await page.route('**/*', route => {
        const type = route.request().resourceType()
        if (['image', 'media', 'font'].includes(type)) {
          route.abort()
        } else {
          route.continue()
        }
      })

      for (const job of jobs) {
        if (!job.source_url) continue

        try {
          console.log(`[Pre-Verify] Checking live page for "${job.title}" at ${job.company}...`)
          await page.goto(job.source_url, { waitUntil: 'domcontentloaded', timeout: 20000 })
          // Wait longer for LinkedIn's JS to render the apply button area
          await this._delay(2500, 4000)

          const check = await page.evaluate(() => {
            const pageText = (document.body?.innerText || '').toLowerCase()

            // Check if the job is closed
            const isClosed =
              pageText.includes('no longer accepting applications') ||
              pageText.includes('this job is no longer accepting applications') ||
              pageText.includes('position closed') ||
              pageText.includes('position has been filled') ||
              pageText.includes('no longer accepting responses') ||
              pageText.includes('this position has been filled')

            if (isClosed) return { isValid: false, reason: 'Job is closed / no longer accepting applications' }

            // Check if it's explicitly an external apply (definitive rejection)
            const isExternalManaged =
              pageText.includes('responses managed off linkedin') ||
              pageText.includes('promoted by hirer · responses managed off linkedin')

            if (isExternalManaged) return { isValid: false, reason: 'External Apply job (Responses managed off LinkedIn)' }

            // Scan all clickable elements for the Easy Apply button
            const candidates = Array.from(
              document.querySelectorAll('button, a, div[role="button"], span[role="button"], [class*="apply" i]')
            ) as HTMLElement[]

            const hasEasyApply = candidates.some(el => {
              if (el.offsetParent === null) return false // not visible
              const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
              const aria = (el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase()
              return text.includes('easy apply') || aria.includes('easy apply')
            })

            if (hasEasyApply) return { isValid: true, reason: 'Valid Easy Apply job' }

            // Check if there's only a plain "Apply" button (external redirect) without Easy Apply
            const hasPlainApply = candidates.some(el => {
              if (el.offsetParent === null) return false
              const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
              return (text === 'apply' || text.startsWith('apply '))
            })

            if (hasPlainApply) return { isValid: false, reason: 'External Apply button only (not Easy Apply)' }

            return { isValid: false, reason: 'No Easy Apply button found on page' }
          }).catch(e => ({ isValid: false, reason: e.message }))

          if (check.isValid) {
            console.log(`[Pre-Verify] ✅ Verified active Easy Apply job: "${job.title}" at ${job.company}`)
            verifiedJobs.push(job)
          } else {
            console.log(`[Pre-Verify] ❌ Rejected "${job.title}" at ${job.company}: ${check.reason}`)
          }
        } catch (err: any) {
          console.warn(`[Pre-Verify] ⚠️ Skipping "${job.title}": Page check error: ${err.message}`)
        }
      }
    } finally {
      await page.close().catch(() => {})
    }

    return verifiedJobs
  }

  // ─────────────────────────────────────────────────────────────────
  // LinkedIn Easy Apply — Fixed Implementation
  // ─────────────────────────────────────────────────────────────────

  private async _applyLinkedIn(page: Page, job: any, profile: any, userId: string) {
    // Hard-stop if no resume found before attempting any form interaction
    const resumePath = await this._findResumeFile(userId)
    if (!resumePath) {
      return {
        status: 'error',
        message: 'resume_not_found: No resume file found in Supabase Storage or local paths. Upload your resume in the Resume Hub before applying.'
      }
    }

    // Step 1 — Navigate to job
    try {
      await page.goto(job.source_url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    } catch (e: any) {
      if (page.isClosed()) return { status: 'error', message: 'Browser page was closed unexpectedly during navigation' }
      throw e
    }
    await this._delay(2000, 3000)

    // Extract full job description from live page and update DB if available
    try {
      const fullDesc = await page.evaluate(() => {
        const selectors = [
          '#job-details',
          '.jobs-description__content',
          '.jobs-description-content',
          '.show-more-less-html__markup',
          '.description__text',
          'article.jobs-description__container',
          '.jobs-box__html-content'
        ]
        for (const sel of selectors) {
          const el = document.querySelector(sel)
          if (el && el.textContent && el.textContent.trim().length > 50) {
            return el.textContent.trim()
          }
        }
        return ''
      })

      if (fullDesc) {
        job.description = fullDesc
        const targetId = job.id
        if (targetId) {
          await this.supabase.from('jobs').update({ description: fullDesc }).eq('id', targetId)
        }
      }
    } catch { /* ignore */ }

    // Step 2 — Check session valid
    if (page.url().includes('authwall') || page.url().includes('login')) {
      return { status: 'session_expired' }
    }

    // Step 2b — Check if job is closed / no longer accepting applications on the live LinkedIn page
    const isJobClosedPage = await page.evaluate(() => {
      const pageText = (document.body?.innerText || '').toLowerCase()
      return (
        pageText.includes('no longer accepting applications') ||
        pageText.includes('this job is no longer accepting applications') ||
        pageText.includes('position closed') ||
        pageText.includes('position has been filled') ||
        pageText.includes('no longer accepting responses')
      )
    }).catch(() => false)

    if (isJobClosedPage) {
      console.log(`[Automation] 🚫 Job page indicates: "No longer accepting applications"`)
      const screenshot = await this._screenshot(page, userId, job.company)
      return {
        status: 'job_closed',
        screenshot,
        message: 'Job is no longer accepting applications (closed/filled by recruiter).'
      }
    }

    // Step 3 — Wait for the job details pane to render, then find the Easy Apply button
    // by scanning visible elements for "Easy Apply" text/aria-label — much more
    // robust than relying on LinkedIn's auto-generated CSS class names.
    try {
      await page.waitForSelector(
        '.jobs-unified-top-card, .job-details-jobs-unified-top-card__container, .jobs-apply-button, .jobs-s-apply',
        { timeout: 15000 }
      )
    } catch {
      console.log('[Automation] Job details pane never appeared — page may be a search/listing page')
    }
    // Extra buffer for the apply button to mount after the pane loads
    await this._delay(1000, 2000)

    try {
      const url = page.url()
      const title = await page.title()
      const paneCheck = await page.evaluate(() => {
        return {
          hasUnifiedCard: !!document.querySelector('.jobs-unified-top-card'),
          hasUnifiedContainer: !!document.querySelector('.job-details-jobs-unified-top-card__container'),
          hasApplyClass: !!document.querySelector('[class*="jobs-apply"]'),
          bodyTextStart: document.body.innerText.substring(0, 300).replace(/\\s+/g, ' ')
        }
      })
      console.log('[DEBUG] Job pane check:', JSON.stringify({ url, title, ...paneCheck }, null, 2))
    } catch { /* ignore */ }

    const easyApplyBtn = await this._findEasyApplyButton(page)

    if (!easyApplyBtn) {
      // Debug dump so future failures are diagnosable from logs
      try {
        const buttonDump = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('button, a, div[role="button"], span[role="button"], [class*="apply" i]'))
            .filter(b => (b as HTMLElement).offsetParent !== null)
            .map(b => ({
              tag: b.tagName,
              text: (b.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 60),
              aria: b.getAttribute('aria-label'),
              class: (b.className || '').toString().substring(0, 120),
            }))
            .filter(b => b.text || b.aria)
        })
        console.log('[DEBUG] Visible clickable elements:', JSON.stringify(buttonDump, null, 2))
      } catch { /* ignore */ }

      const screenshot = await this._screenshot(page, userId, job.company)
      return { status: 'no_apply_button', screenshot, message: 'Skipped: Not a LinkedIn Easy Apply job (external Apply buttons disabled).' }
    }

    // Step 5 — Click Easy Apply (with retry if modal doesn't open)
    let activeApplyBtn: ElementHandle<Element> | null = easyApplyBtn
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await activeApplyBtn?.scrollIntoViewIfNeeded()

        // Right before clicking, log what we're about to click
        const targetInfo = await page.evaluate(() => {
          const el = document.querySelector('[data-jobnavi-target="easy-apply"]') as HTMLElement
          if (!el) return null
          return {
            tag: el.tagName,
            href: el.getAttribute('href'),
            onclick: !!el.onclick,
            parentTag: el.parentElement?.tagName,
            parentClass: el.parentElement?.className?.substring(0, 100),
          }
        })
        console.log('[DEBUG] Easy Apply target info:', JSON.stringify(targetInfo, null, 2))

        // Full event dispatch for Ember/React compatibility (plain .click() doesn't trigger LinkedIn's listeners)
        await page.evaluate(() => {
          const el = document.querySelector('[data-jobnavi-target="easy-apply"]') as HTMLElement
          if (!el) return
          el.scrollIntoView({ block: 'center' })
          el.focus()
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
        })
      } catch (e: any) {
        if (page.isClosed()) return { status: 'error', message: 'Browser page was closed unexpectedly during Easy Apply click' }
        throw e
      }
      await this._delay(1500, 2500)

      // Step 6 — VERIFY modal opened (wait for visibility, don't just check at one instant)
      const modalOpen = await this._waitForModal(page, 8000)

      if (modalOpen) {
        console.log('[Automation] ✅ Modal detected after attempt', attempt + 1)
        break
      }

      // Debug: log DOM state when modal fails to open
      try {
        const domState = await page.evaluate(() => {
          const dialogs = document.querySelectorAll('[role="dialog"], [aria-modal="true"]')
          const modals = document.querySelectorAll('.artdeco-modal, .jobs-easy-apply-modal')
          return {
            dialogs: dialogs.length,
            modals: modals.length,
            visibleDialogs: Array.from(dialogs).filter(d => (d as HTMLElement).offsetParent !== null).length,
            visibleModals: Array.from(modals).filter(m => (m as HTMLElement).offsetParent !== null).length,
            url: window.location.href.substring(0, 150),
          }
        })
        console.log(`[DEBUG] Modal check after attempt ${attempt + 1}:`, JSON.stringify(domState))
      } catch { /* ignore */ }

      if (attempt === 0) {
        console.log('[Automation] Modal not detected after first click — retrying with fresh handle...')
        await this._delay(1000, 1500)
        // re-find the button in case the DOM re-rendered, and use the fresh handle
        const retryBtn = await this._findEasyApplyButton(page)
        if (retryBtn) activeApplyBtn = retryBtn
        continue
      } else {
        const screenshot = await this._screenshot(page, userId, job.company)
        return {
          status: 'error',
          screenshot,
          message: 'Easy Apply button clicked but modal did not open'
        }
      }
    }

    console.log('[Automation] ✅ Easy Apply modal is open — starting form fill')

    let jobSkillsExperience: Record<string, number> = { ...(profile?.skills_experience || {}) }
    const notesContent = (job as any)?.app_notes || (job as any)?.notes || ''
    if (notesContent) {
      try {
        const parsed = JSON.parse(notesContent)
        if (parsed && typeof parsed.skills_experience === 'object') {
          jobSkillsExperience = { ...jobSkillsExperience, ...parsed.skills_experience }
        }
      } catch {}
    }
    return await this._handleModalForm(page, profile, userId, job.company, resumePath, jobSkillsExperience)
  }

  /**
   * Finds the "Easy Apply" button using a plain JS text/aria scan across all
   * visible clickable elements. This avoids brittleness from LinkedIn's
   * auto-generated CSS class names and handles cases where the label text
   * is split across nested <span> elements.
   */
  private async _findEasyApplyButton(page: Page): Promise<ElementHandle<Element> | null> {
    if (page.isClosed()) return null

    try {
      const found = await page.evaluate(() => {
        // Clear any previous tags
        document.querySelectorAll('[data-jobnavi-target="easy-apply"]').forEach(el => {
          el.removeAttribute('data-jobnavi-target')
        })

        const candidates = Array.from(
          document.querySelectorAll('button, a, div[role="button"], span[role="button"], [class*="apply" i]')
        ) as HTMLElement[]

        // First pass: exact-ish match on "easy apply"
        let best = candidates.find(el => {
          if (el.offsetParent === null) return false
          const text = (el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase()
          const aria = (el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().toLowerCase()
          return text.includes('easy apply') || aria.includes('easy apply')
        })

        // Second pass: some jobs render just "Apply" but the button itself
        // (not external link) has an aria-label mentioning "Easy Apply"
        if (!best) {
          best = candidates.find(el => {
            if (el.offsetParent === null) return false
            const aria = (el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().toLowerCase()
            return aria.startsWith('easy apply') || aria.includes('easy apply to')
          })
        }

        if (best) {
          best.setAttribute('data-jobnavi-target', 'easy-apply')
          return true
        }
        return false
      })

      if (found) {
        return await page.$('[data-jobnavi-target="easy-apply"]')
      }
    } catch (e: any) {
      if (!page.isClosed()) {
        console.warn('[Automation] _findEasyApplyButton evaluate failed:', e.message)
      }
    }

    return null
  }

  /**
   * Waits for a LinkedIn Easy Apply modal to become visible, trying multiple
   * known selector shapes AND content-based detection. Returns true as soon
   * as one is found visible.
   */
  private async _waitForModal(page: Page, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (page.isClosed()) return false

      try {
        const found = await page.evaluate(() => {
          // Strategy 1: Standard modal selectors
          const selectors = [
            '.jobs-easy-apply-modal',
            '[data-test-modal]',
            '.artdeco-modal__content',
            '.artdeco-modal',
            '[role="dialog"]',
            '[aria-modal="true"]',
          ]

          for (const sel of selectors) {
            const el = document.querySelector(sel) as HTMLElement | null
            if (el && el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0) {
              return true
            }
          }

          // Strategy 2: Find heading with "Apply to" text inside any modal-like container
          const headings = document.querySelectorAll('h2, h3, h1')
          for (const h of headings) {
            const text = (h.textContent || '').trim().toLowerCase()
            if (text.startsWith('apply to') || text.startsWith('apply at')) {
              // Confirm it's inside a modal-like overlay (has close button, form inputs, etc.)
              const parent = h.closest('[role="dialog"], [aria-modal="true"], .artdeco-modal, div[class*="modal"], div[class*="overlay"]') as HTMLElement
              if (parent && parent.offsetWidth > 0) return true
              // Even without a parent match, if the heading is visible and there's a form nearby
              const hEl = h as HTMLElement
              if (hEl.offsetParent !== null) {
                const container = h.parentElement?.parentElement
                if (container && container.querySelector('input, select, textarea, button')) {
                  return true
                }
              }
            }
          }

          // Strategy 3: Overlay backdrop detection (LinkedIn shows a dark overlay behind the modal)
          const overlays = document.querySelectorAll('.artdeco-modal-overlay, .artdeco-modal__overlay, [class*="overlay"][class*="modal"]')
          for (const ov of overlays) {
            if ((ov as HTMLElement).offsetParent !== null) return true
          }

          return false
        })

        if (found) return true
      } catch { /* page might be navigating, retry */ }

      await this._delay(300, 500)
    }
    return false
  }

  // ─────────────────────────────────────────────────────────────────
  // Modal Form Handler — all interactions scoped inside the modal
  //
  // Fill strategy (safe, profile-driven):
  //  1. Known fields are filled from the user's PROFILE only. No hardcoded
  //     answers, no invented defaults. A blank profile value => the field is
  //     deferred to the Groq pass (never guessed).
  //  2. Yes/No answers are matched to the real radio LABEL text on the page,
  //     so "I am authorized to work" is selected when the user saved "Yes".
  //  3. The Groq response is VALIDATED against the exact fields/types we sent
  //     before anything is typed. Invented selectors and type-mismatched
  //     answers are dropped — this is what stops values landing in the wrong
  //     field.
  //  4. Every fill is VERIFIED by reading the field back. A field that does
  //     not accept its value is isolated instead of corrupting the step.
  // ─────────────────────────────────────────────────────────────────

  private async _handleModalForm(page: Page, profile: any, userId: string, company: string, resumePath: string, jobSkillsExperience?: Record<string, number>) {
    const maxSteps = 10
    const MODAL_SELECTOR = '[role="dialog"], .artdeco-modal, .jobs-easy-apply-modal, [data-test-modal], [aria-modal="true"]'
    const aiFiller = new FormAIFiller(this.groqApiKey)

    let lastModalContent = ''
    let stuckCount = 0
    let uploadedInThisModal = false

    for (let step = 0; step < maxSteps; step++) {
      await this._delay(200, 400)

      if (page.isClosed()) {
        return { status: 'error', message: 'Browser page was closed unexpectedly' }
      }

      // Step 1: Extract form JSON schema using FormExtractor module
      let allFormFields = await FormExtractor.extractFormJSON(page)
      if (allFormFields.length === 0) {
        await this._delay(400, 700)
        allFormFields = await FormExtractor.extractFormJSON(page)
      }
      const unfilledFields = allFormFields.filter(f => f.isEmpty)

      console.log(`[Automation] Modal step ${step + 1}: ${unfilledFields.length} unfilled fields (${allFormFields.length} total fields on step)`)
      if (unfilledFields.length > 0) {
        console.log(`[Automation] 🔍 Detected unfilled fields: ${unfilledFields.map(f => `"${f.label}" (${f.type})`).join(', ')}`)
      }

      // Step 2: Fill out form step via FormAIFiller (Heuristics + Groq JSON Answering)
      if (allFormFields.length > 0) {
        await aiFiller.fillFormStep(page, allFormFields, profile, { skills_experience: jobSkillsExperience })
        await this._delay(150, 300)
      }

      // Handle conditional master resume file upload inside application modal
      if (!page.isClosed() && resumePath && fs.existsSync(resumePath)) {
        try {
          const hasFileInput = await page.evaluate(() => {
            const modal = document.querySelector('.jobs-easy-apply-modal, [role="dialog"], .artdeco-modal') || document.body
            return Boolean(modal.querySelector('input[type="file"], button[aria-label*="upload" i], label[for*="file" i], .jobs-document-upload__upload-button'))
          }).catch(() => false)

          if (hasFileInput) {
            // Check Condition 1: Is a resume currently attached or selected on screen?
            const hasAttachedResume = await page.evaluate(() => {
              const modal = document.querySelector('.jobs-easy-apply-modal, [role="dialog"], .artdeco-modal') || document.body
              
              // 1. Checked radio button or selected document item in document upload list
              const checkedRadio = modal.querySelector('input[type="radio"]:checked, [class*="document-upload"] input:checked, [class*="card--selected"], [class*="item--selected"]')
              if (checkedRadio) return true

              // 2. Uploaded document title / filename element / remove button
              const docElement = modal.querySelector(
                '.jobs-document-upload__file-name, .jobs-document-upload__title, [class*="document-upload" i] [class*="title" i], [class*="file-name" i], button[aria-label*="Remove" i], button[aria-label*="Dismiss" i], button[aria-label*="Delete" i]'
              )
              if (docElement && (docElement.textContent || '').trim().length > 0) return true

              // 3. Text content containing attached document extension (.pdf / .docx)
              const text = (modal.textContent || '').toLowerCase()
              return text.includes('.pdf') || text.includes('.docx')
            }).catch(() => false)

            // Check Condition 2: Was the resume updated in the Resume Hub after our last upload?
            const lastHubUpdate = profile?.resume_updated_at ? new Date(profile.resume_updated_at).getTime() : 0
            const lastPortalUpload = (this as any)._lastResumeUploadTime || 0
            const isResumeHubUpdated = lastHubUpdate > lastPortalUpload

            const shouldUpload = (!hasAttachedResume && !uploadedInThisModal) || isResumeHubUpdated

            if (shouldUpload) {
              const reason = !hasAttachedResume ? 'No resume detected on form' : 'Resume Hub updated with new CV'
              console.log(`[Automation] 📄 Executing resume upload (${reason})...`)

              // 1. Direct input set
              const fileInputs = await page.$$('input[type="file"], .jobs-easy-apply-modal input[type="file"], [role="dialog"] input[type="file"]').catch(() => [])
              for (const fileInput of fileInputs) {
                try {
                  await fileInput.setInputFiles(resumePath)
                  console.log(`[Automation] 📄 Automatically uploaded master resume PDF into application form!`)
                  await this._delay(2000, 3000)
                } catch { /* ignore */ }
              }

              // 2. Click "Upload resume" button / label and handle FileChooser popup
              const uploadBtns = await page.$$('button:has-text("Upload resume"), label:has-text("Upload resume"), .jobs-document-upload__upload-button, label[for*="file" i], button[aria-label*="upload" i]').catch(() => [])
              for (const btn of uploadBtns) {
                try {
                  const isVisible = await btn.isVisible().catch(() => false)
                  if (isVisible) {
                    const [fileChooser] = await Promise.all([
                      page.waitForEvent('filechooser', { timeout: 2500 }).catch(() => null),
                      btn.click({ force: true }).catch(() => null)
                    ])
                    if (fileChooser) {
                      await fileChooser.setFiles(resumePath)
                      console.log(`[Automation] 📄 Clicked "Upload resume" button & attached master resume PDF (waiting 2.5s)...`)
                      await this._delay(2000, 3000)
                      break
                    }
                  }
                } catch { /* ignore */ }
              }

              uploadedInThisModal = true
              ;(this as any)._lastResumeUploadTime = Date.now()
            }
          }
        } catch { /* ignore */ }
      }

      // Handle Work Experience / Position adding based on Candidate Master Resume details
      if (!page.isClosed()) {
        try {
          const addExperienceBtn = page.locator('button:has-text("Add work experience"), button:has-text("Add position"), button:has-text("Add employment"), button:has-text("Add experience")').first()
          const hasAddExperienceBtn = (await addExperienceBtn.count().catch(() => 0)) > 0 && await addExperienceBtn.isVisible().catch(() => false)

          if (hasAddExperienceBtn) {
            // Check if candidate resume actually contains work experience history
            const hasWorkExperienceInResume = (() => {
              if (profile?.experience_summary && profile.experience_summary.trim().length > 20) return true
              if (profile?.years_of_experience && parseInt(String(profile.years_of_experience)) > 0) return true
              const resumeText = (profile?.resume_text || '').toLowerCase()
              return /experience|work history|employment|developer|engineer|manager|associate|intern|company|role|position/i.test(resumeText) && resumeText.length > 50
            })()

            // Check if a work experience entry card is already filled / visible on screen
            const hasExistingExperienceOnScreen = await page.evaluate(() => {
              const modal = document.querySelector('.jobs-easy-apply-modal, [role="dialog"], .artdeco-modal') || document.body
              const expCard = modal.querySelector('.jobs-work-experience-card, [data-test-work-experience-item], [class*="work-experience" i] [class*="item" i], [class*="experience" i] [class*="card" i]')
              return !!expCard
            }).catch(() => false)

            if (hasWorkExperienceInResume && !hasExistingExperienceOnScreen) {
              console.log(`[Automation] 💼 Candidate resume contains work experience — clicking "Add work experience" to populate details...`)
              await addExperienceBtn.click({ force: true }).catch(() => {})
              await this._delay(1000, 1500)
              
              // Re-extract & fill newly revealed work experience fields via FormAIFiller
              const newlyRevealedFields = await FormExtractor.extractFormJSON(page)
              if (newlyRevealedFields.length > 0) {
                await aiFiller.fillFormStep(page, newlyRevealedFields, profile)
              }
            } else {
              console.log(`[Automation] ℹ️ Candidate resume has no work experience history or position is already present — skipping "Add work experience" button.`)
            }
          }
        } catch { /* ignore */ }
      }

      if (page.isClosed()) return { status: 'error', message: 'Browser page was closed unexpectedly' }

      // Step 3: Re-verify form fields state & active on-screen errors before advancing
      let remainingUnfilled = (await FormExtractor.extractFormJSON(page)).filter(f => f.isEmpty)
      const hasErrors = await FormDOMActions.hasValidationErrors(page)

      if (remainingUnfilled.length > 0 || hasErrors) {
        console.log(`[Automation] ⚠️ Step ${step + 1} has ${remainingUnfilled.length} unfilled questions (errors: ${hasErrors}) — running retry fill pass...`)
        if (remainingUnfilled.length > 0) {
          await aiFiller.fillFormStep(page, remainingUnfilled, profile)
          await this._delay(200, 400)
        }
        remainingUnfilled = (await FormExtractor.extractFormJSON(page)).filter(f => f.isEmpty)
      }

      // STRICT FORM GATING: If unfilled fields or validation errors persist, block advancing
      if (remainingUnfilled.some(f => f.required || f.isEmpty) && hasErrors) {
        console.log(`[Automation] ⛔ Form gating active: blocking "Next" click until ${remainingUnfilled.length} questions are satisfied.`)
        await this._delay(300, 500)
      }

      // Step 4: Record current modal content for post-click verification
      if (page.isClosed()) return { status: 'error', message: 'Browser page was closed unexpectedly' }

      const currentModalContent = await page.evaluate(() => {
        const m = document.querySelector('.jobs-easy-apply-modal, [role="dialog"], [aria-modal="true"], .artdeco-modal')
        return (m?.textContent || '').replace(/\s+/g, ' ').substring(0, 300)
      }).catch(() => '')

      if (!lastModalContent && currentModalContent) {
        lastModalContent = currentModalContent
      }

      // Dynamic submit/next button detection — evaluated directly in browser DOM
      const clickResult = await page.evaluate(() => {
        const modals = Array.from(document.querySelectorAll('.jobs-easy-apply-modal, [aria-modal="true"], [role="dialog"], .artdeco-modal')) as HTMLElement[]
        const activeModal = modals.find(m => m.offsetParent !== null && m.offsetWidth > 0 && m.offsetHeight > 0) || document.querySelector('.jobs-easy-apply-modal') || document.body

        // Query all buttons inside active modal or footer/action-bar
        let buttons = Array.from(activeModal.querySelectorAll('button, footer button, div[class*="action"] button')) as HTMLButtonElement[]

        if (!buttons.length) {
          buttons = Array.from(document.querySelectorAll('footer button, .artdeco-modal__action-bar button, button.artdeco-button--primary')) as HTMLButtonElement[]
        }

        const targetBtn = buttons.find(b => {
          const text = (b.textContent || '').trim().toLowerCase()
          const aria = (b.getAttribute('aria-label') || '').trim().toLowerCase()

          // Exclude close/dismiss/cancel buttons
          const isDismiss = /close|dismiss|cancel/i.test(text) || /close|dismiss|cancel/i.test(aria)
          if (isDismiss) return false

          const isAction = /next|continue|review|submit|apply/i.test(text) || /next|continue|review|submit|apply/i.test(aria) || b.classList.contains('artdeco-button--primary')
          return isAction
        })

        if (!targetBtn) return { clicked: false, isSubmit: false, label: '', disabledReason: 'No action button found' }

        const isDisabled = targetBtn.disabled || targetBtn.getAttribute('aria-disabled') === 'true' || targetBtn.classList.contains('artdeco-button--disabled')
        const text = (targetBtn.textContent || '').trim().toLowerCase()
        const aria = (targetBtn.getAttribute('aria-label') || '').trim().toLowerCase()

        if (isDisabled) {
          return { clicked: false, isSubmit: false, label: text || aria, disabledReason: `Button "${text || aria}" is disabled (missing required field fill)` }
        }

        const isSubmit = text.includes('submit') || aria.includes('submit')

        // Dispatch full event sequence for Ember/React compatibility
        targetBtn.focus()
        targetBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
        targetBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
        targetBtn.click()

        return { clicked: true, isSubmit, label: text || aria, disabledReason: '' }
      }).catch(e => ({ clicked: false, isSubmit: false, label: '', disabledReason: e.message }))

      if (clickResult.disabledReason) {
        console.log(`[Automation] ⚠️ Button state check: ${clickResult.disabledReason}`)
      }

      if (!clickResult.clicked) {
        const aiClicked = await StagehandService.act('Click the Next, Continue, Review, or Submit button to advance the job application step')
        if (aiClicked) {
          clickResult.clicked = true
          await this._delay(2000, 3000)
        }
      }

      if (clickResult.clicked) {
        console.log(`[Automation] ➡️ Clicked "${clickResult.label}" button in modal`)

        if (clickResult.isSubmit) {
          await this._delay(3000, 4000)

          // Screenshot final confirmation screen
          const screenshot = await this._screenshot(page, userId, company)
          console.log(`[Automation] 🎉 Application successfully submitted for ${company}! Status: applied`)
          return { status: 'applied', screenshot, message: `Application for ${company} was successfully submitted!` }
        } else {
          // Wait 2s for step transition animation to paint new content
          await this._delay(2000, 3000)

          const postClickModalContent = await page.evaluate(() => {
            const m = document.querySelector('.jobs-easy-apply-modal, [role="dialog"], [aria-modal="true"], .artdeco-modal')
            return (m?.textContent || '').replace(/\s+/g, ' ').substring(0, 300)
          }).catch(() => '')

          if (postClickModalContent && postClickModalContent === lastModalContent) {
            stuckCount++
            console.log(`[Automation] ⚠️ Modal content unchanged after clicking "${clickResult.label}" (stuck count: ${stuckCount})`)
            if (stuckCount >= 4) {
              const screenshot = await this._screenshot(page, userId, company)
              return {
                status: 'unconfirmed',
                screenshot,
                message: 'Modal stuck on form step — required fields blocked step advancement'
              }
            }
          } else {
            stuckCount = 0
            if (postClickModalContent) lastModalContent = postClickModalContent
          }

          continue
        }
      }

      // If no button click occurred and 2 consecutive steps had no fields, stop cleanly
      if (allFormFields.length === 0 && stuckCount >= 2) {
        const screenshot = await this._screenshot(page, userId, company)
        return {
          status: 'unconfirmed',
          screenshot,
          message: 'No fields and no actionable button across multiple steps — modal may be stuck'
        }
      }

      const screenshot = await this._screenshot(page, userId, company)
      return {
        status: 'unconfirmed',
        screenshot,
        message: 'Could not find enabled next or submit button in modal (or validation errors prevented clicking)'
      }
    }

    const screenshot = await this._screenshot(page, userId, company)
    return { status: 'unconfirmed', screenshot, message: 'Max steps reached' }
  }

  // ─────────────────────────────────────────────────────────────────
  // Form-fill helpers (safe mapping, validation, verification)
  // ─────────────────────────────────────────────────────────────────



  // ─────────────────────────────────────────────────────────────────
  // Session Management
  // ─────────────────────────────────────────────────────────────────

  async saveSession(userId: string, portal: string) {
    if (!this.context) return

    const state = await this.context.storageState()
    const encoded = Buffer.from(JSON.stringify(state)).toString('base64')

    const { error } = await this.supabase.from('portal_sessions').upsert({
      user_id: userId,
      portal,
      session_data: encoded,
      saved_at: new Date().toISOString(),
    }, { onConflict: 'user_id,portal' })

    if (error) console.error(`[Automation] Failed to save session for ${portal}:`, error.message)

    console.log(`[Automation] Session saved for ${portal}`)
  }

  async startLoginSession(userId: string, portal: string): Promise<boolean> {
    if (!this.context) {
      try {
        const cfg = validateConfig()
        const userProfileDir = this._getUserProfileDir(userId, portal)
        this.context = await chromium.launchPersistentContext(
          userProfileDir,
          {
            headless: false,
            executablePath: cfg.chromeExecutablePath,
            viewport: { width: 1366, height: 768 },
            args: [
              '--disable-blink-features=AutomationControlled',
              '--no-sandbox',
            ]
          }
        )
      } catch (e: any) {
        if (e.message.includes('EBUSY') || e.message.includes('lock')) {
          console.error(`[CRITICAL ERROR] Failed to launch Chrome. Close your Chrome browser first!`)
        }
        throw e
      }

      // Remove webdriver flag to avoid bot detection
      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      })
    }

    const page = await this.context.newPage()
    const loginUrls: Record<string, string> = {
      linkedin: 'https://www.linkedin.com/login',
    }

    await page.goto(loginUrls[portal] || loginUrls.linkedin)
    console.log(`[Automation] Browser opened for ${portal} — please log in manually`)

    // Wait up to 10 minutes for user to login
    const deadline = Date.now() + 10 * 60 * 1000

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000))

      try {
        if (page.isClosed()) break;
        const url = page.url()

        const successUrls: Record<string, string[]> = {
          linkedin: ['linkedin.com/feed'],
        }

        const matchUrls = successUrls[portal] || ['feed', 'dashboard']
        if (matchUrls.some(match => url.includes(match))) {
          await this.saveSession(userId, portal)
          await page.close()
          return true
        }
      } catch (error) {
        // Page was likely closed by the user manually
        break;
      }
    }

    await page.close()
    return false
  }

  // ─────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────

  /** Random delay — simulates human pacing */
  private async _delay(min: number, max: number): Promise<void> {
    const ms = Math.floor(Math.random() * (max - min) + min)
    await new Promise(r => setTimeout(r, ms))
  }

  /** Screenshot saving to local machine is disabled */
  private async _screenshot(page: Page, userId: string, company: string): Promise<string> {
    return ''
  }

  /** Human-like typing (single canonical implementation) */
  private async _typeHuman(page: Page, text: string) {
    for (const char of text) {
      await page.keyboard.type(char)
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 80 + 40)))
    }
  }

  // Types into a specific element so the value never lands in the wrong field.
  private async _typeHumanEl(el: any, text: string) {
    await el.type(text, { delay: Math.floor(Math.random() * 60 + 40) })
  }

  private async _checkSessionValid(page: Page, portal: string): Promise<boolean> {
    // If no session was loaded during init(), log a warning but proceed
    // (allows the AI to try navigating the login flow if needed, or user to manually intervene)
    if (!this._hasSession) {
      console.log(`[Automation] No session on file for ${portal} — proceeding without session validation...`)
    }

    const checkUrls: Record<string, string> = {
      linkedin: 'https://www.linkedin.com/feed',
    }

    const checkUrl = checkUrls[portal]
    if (!checkUrl) return true // Unknown portal — assume valid

    try {
      await page.goto(checkUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    } catch (error: any) {
      console.log(`[Automation] Session check warning for ${portal}: ${error.message}`)
    }

    // We return true immediately so the script doesn't abort early.
    // The actual application process will wait for the Apply button, allowing manual intervention.
    return true
  }

  private async _findResumeFile(userId: string): Promise<string | null> {
    // 1. Try Supabase Storage first (the primary upload path from the UI)
    try {
      const { data: profileRow } = await this.supabase
        .from('profiles')
        .select('profile_data')
        .eq('user_id', userId)
        .maybeSingle()

      const pData = profileRow?.profile_data || {}
      const candidateName = pData.name ? String(pData.name).trim().replace(/[^a-zA-Z0-9]+/g, '_') : ''

      let cleanFileName = 'CV.pdf'
      if (candidateName) {
        cleanFileName = `${candidateName}_CV.pdf`
      } else if (pData.resume_filename) {
        const orig = String(pData.resume_filename).replace(/[^a-zA-Z0-9._-]+/g, '_')
        cleanFileName = orig.toLowerCase().endsWith('.pdf') ? orig : `${orig}.pdf`
      }

      const storagePath = `${userId}/resume.pdf`
      const userTmpDir = path.join(os.tmpdir(), 'jobnavi-resumes', `user_${userId}`)
      fs.mkdirSync(userTmpDir, { recursive: true })
      const localPath = path.join(userTmpDir, cleanFileName)

      if (fs.existsSync(localPath)) {
        console.log(`[Automation] Resume found in local cache: ${localPath}`)
        return localPath
      }

      const { data: fileData, error } = await this.supabase.storage
        .from('resumes')
        .download(storagePath)

      if (!error && fileData) {
        const arrayBuffer = await fileData.arrayBuffer()
        fs.writeFileSync(localPath, Buffer.from(arrayBuffer))
        console.log(`[Automation] ✅ Resume downloaded from Supabase Storage as clean PDF → ${localPath}`)
        return localPath
      }
    } catch (storageErr: any) {
      console.warn(`[Automation] Supabase Storage resume fetch failed: ${storageErr.message}`)
    }

    // 2. Fallback: local filesystem paths (legacy / dev)
    const localPaths = [
      path.join(process.cwd(), 'data', 'resumes', `${userId}_resume.pdf`),
      path.join(process.cwd(), 'data', 'resumes', `${userId}_resume.docx`),
      path.join(process.cwd(), 'public', 'resumes', `${userId}_resume.pdf`),
    ]
    for (const p of localPaths) {
      if (fs.existsSync(p)) {
        console.log(`[Automation] Resume found at local path: ${p}`)
        return p
      }
    }

    console.warn(`[Automation] ⚠️  No resume file found for user ${userId} — checked Supabase Storage and local paths.`)
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

  private async _showToast(page: Page, message: string, type: 'info' | 'success' | 'error' = 'info') {
    try {
      await page.evaluate(({ msg, type }) => {
        let container = document.getElementById('agent-toast-container')
        if (!container) {
          container = document.createElement('div')
          container.id = 'agent-toast-container'
          container.style.position = 'fixed'
          container.style.top = '20px'
          container.style.right = '20px'
          container.style.zIndex = '2147483647'
          container.style.display = 'flex'
          container.style.flexDirection = 'column'
          container.style.gap = '10px'
          container.style.pointerEvents = 'none'
          document.body.appendChild(container)
        }

        const toast = document.createElement('div')
        toast.style.padding = '15px 20px'
        toast.style.borderRadius = '8px'
        toast.style.color = 'white'
        toast.style.fontFamily = 'system-ui, sans-serif'
        toast.style.fontSize = '14px'
        toast.style.fontWeight = 'bold'
        toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
        toast.style.opacity = '0'
        toast.style.transform = 'translateX(100%)'
        toast.style.transition = 'all 0.3s ease'

        if (type === 'success') toast.style.backgroundColor = '#10b981'
        else if (type === 'error') toast.style.backgroundColor = '#ef4444'
        else toast.style.backgroundColor = '#3b82f6'

        toast.innerText = msg
        container.appendChild(toast)

        requestAnimationFrame(() => {
          toast.style.opacity = '1'
          toast.style.transform = 'translateX(0)'
        })

        setTimeout(() => {
          toast.style.opacity = '0'
          toast.style.transform = 'translateX(100%)'
          setTimeout(() => toast.remove(), 300)
        }, 4000)

      }, { msg: message, type })
    } catch (e) {
      // Ignore if page is closed
    }
  }

  async cleanup() {
    if (this.context) {
      await this.context.close()
      this.context = null
    }
  }
}