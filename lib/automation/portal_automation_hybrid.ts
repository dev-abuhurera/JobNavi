import { chromium, BrowserContext, Page, Browser, ElementHandle } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { GroqRotatingClient } from '../groq-client'
import { normalizeProfile } from '../utils/profile'
import { validateConfig } from '../config'
import { logger } from '../logger'
import type { NormalizedProfile, ApplicationResult } from '../types'

export { normalizeProfile }
export type { NormalizedProfile }

export class PortalAutomationHybrid {
  private supabase: any
  private groq: GroqRotatingClient
  private context: BrowserContext | null = null
  private browser: Browser | null = null
  private _hasSession: boolean = false

  constructor(supabase: any, groqApiKey: string) {
    this.supabase = supabase
    this.groq = new GroqRotatingClient(groqApiKey)
  }

  // ─────────────────────────────────────────────────────────────────
  // Initialization — loads saved portal session from Supabase
  // ─────────────────────────────────────────────────────────────────

  async init(userId: string, portal: string) {
    const cfg = validateConfig()
    const realProfile = cfg.chromeProfilePath
    const tempProfile = `/tmp/chrome-agent-profile-${Date.now()}`

    const launchArgs = [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ]

    const launchOptions = {
      headless: false,
      executablePath: cfg.chromeExecutablePath,
      viewport: { width: 1366, height: 768 } as const,
      args: launchArgs,
    }

    // ── Try real Chrome profile first ──
    try {
      this.context = await chromium.launchPersistentContext(realProfile, launchOptions)
      console.log(`[Automation] Launched persistent context using real Chrome profile for ${portal}`)
    } catch (e: any) {
      const isLocked = e.message.includes('EBUSY') ||
                       e.message.includes('lock') ||
                       e.message.includes('ProcessSingleton') ||
                       e.message.includes('SingletonLock')

      if (isLocked) {
        // ── Fallback: temp profile (Chrome is already open) ──
        console.warn(`[Automation] ⚠️ Real Chrome profile is locked (Chrome is open). Falling back to temp profile for ${portal}.`)
        console.warn(`[Automation] ⚠️ You may need to log in manually for this session.`)
        this.context = await chromium.launchPersistentContext(tempProfile, {
          ...launchOptions,
          args: [...launchArgs, '--no-first-run', '--no-default-browser-check'],
        })
        console.log(`[Automation] Launched temp Chrome context for ${portal}`)
      } else {
        throw e
      }
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

    // Fetch job details
    const { data: job } = await this.supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (!job) throw new Error(`Job ${jobId} not found in database`)

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

      // Route to correct portal handler
      switch (job.application_type) {
        case 'linkedin_easy_apply':
          result = await this._applyLinkedIn(page, job, profile, userId)
          break
        default:
          result = { status: 'error', message: `${job.source} requires manual application` }
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

    // Step 2 — Check session valid
    if (page.url().includes('authwall') || page.url().includes('login')) {
      return { status: 'session_expired' }
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

      // Check if it's an external apply button instead
      let externalBtn: any = null
      try {
        externalBtn = await page.$('button:has-text("Apply")')
      } catch { /* ignore */ }

      if (externalBtn) {
        const screenshot = await this._screenshot(page, userId, job.company)
        return {
          status: 'error',
          screenshot,
          message: 'External application — not Easy Apply.'
        }
      }

      const screenshot = await this._screenshot(page, userId, job.company)
      return { status: 'no_apply_button', screenshot, message: 'No Easy Apply or Apply button found on job page' }
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

    // Step 7 — Handle form ONLY inside the modal
    return await this._handleModalForm(page, profile, userId, job.company, resumePath)
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

  private async _handleModalForm(page: Page, profile: any, userId: string, company: string, resumePath: string) {
    const maxSteps = 10
    const MODAL_SELECTOR = '[role="dialog"], .artdeco-modal, .jobs-easy-apply-modal, [data-test-modal], [aria-modal="true"]'

    let consecutiveEmptySteps = 0

    for (let step = 0; step < maxSteps; step++) {
      await this._delay(1000, 2000)

      if (page.isClosed()) {
        return { status: 'error', message: 'Browser page was closed unexpectedly' }
      }

      // Get ONLY fields inside the modal — not the whole page
      let modalFields: Array<{
        selector: string | null
        type: string
        label: string
        currentValue: string
        isEmpty: boolean
        required: boolean
        options?: string[]
      }> = []

      try {
        modalFields = await page.evaluate((modalSel) => {
          const modal = document.querySelector(modalSel) as Element | null
          if (!modal) return []

          return Array.from(modal.querySelectorAll(
            'input:not([type="hidden"]):not([type="file"]), textarea, select'
          ))
            .filter(el => (el as HTMLElement).offsetParent !== null)
            .map(el => {
              const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
              let selector = input.id ? `#${input.id}` : (input.name ? `[name="${input.name}"]` : null)
              if (!selector && el.tagName.toLowerCase() === 'select') {
                const form = el.closest('form')
                if (form) {
                   const selects = Array.from(form.querySelectorAll('select'))
                   const idx = selects.indexOf(input as HTMLSelectElement)
                   selector = `select:nth-of-type(${idx + 1})`
                }
              }

              let label = ''
              if (input.id) {
                const labelEl = document.querySelector(`label[for="${input.id}"]`)
                if (labelEl) label = labelEl.textContent?.trim() || ''
              }
              if (!label) {
                const parentLabel = el.closest('label') || el.closest('fieldset')?.querySelector('legend')
                if (parentLabel) label = parentLabel.textContent?.trim() || ''
              }
              if (!label) {
                label = input.getAttribute('placeholder') || input.getAttribute('aria-label') || ''
              }

              let currentValue = input.value || ''
              let isEmpty = !currentValue
              if (input.type === 'checkbox' || input.type === 'radio') {
                isEmpty = !(input as HTMLInputElement).checked
              }

              const options = el.tagName.toLowerCase() === 'select'
                ? Array.from((el as HTMLSelectElement).options).map(o => o.text.trim())
                : undefined

              return {
                selector,
                type: input.type || el.tagName.toLowerCase(),
                label: label.substring(0, 150).replace(/\s+/g, ' '),
                currentValue,
                isEmpty,
                required: input.required || input.getAttribute('aria-required') === 'true',
                options
              }
            })
            .filter(f => f.selector && f.isEmpty)
        }, MODAL_SELECTOR)
      } catch (e: any) {
        if (page.isClosed()) return { status: 'error', message: 'Browser page was closed unexpectedly' }
        console.warn(`[Automation] Could not read modal fields on step ${step + 1}:`, (e as Error).message)
      }

      console.log(`[Automation] Modal step ${step + 1}: ${modalFields.length} unfilled fields`)

      if (modalFields.length === 0) {
        consecutiveEmptySteps++
        console.log('[Automation] No fields to fill on this step — likely a review/preview page')
      } else {
        consecutiveEmptySteps = 0
      }

      // Fields the heuristic can't confidently map go to the Groq pass.
      const unmappedTextInputs: typeof modalFields = []

      // ── Heuristic fill — PROFILE ONLY, no hardcoded answers ──
      for (const field of modalFields) {
        if (!field.selector) continue
        const label = field.label.toLowerCase()

        // ---- Radio / checkbox: map from profile, match by label intent ----
        if (field.type === 'radio' || field.type === 'checkbox') {
          let desired = '' // 'yes' | 'no' | ''

          if (label.includes('sponsor') || label.includes('visa')) {
            desired = this._yesNo(profile.requires_visa_sponsorship)
          } else if (
            label.includes('authoriz') || label.includes('authorised') ||
            label.includes('legally') || label.includes('right to work') ||
            label.includes('work permit') || label.includes('eligible to work')
          ) {
            desired = this._yesNo(profile.work_authorized)
          } else if (label.includes('relocat')) {
            desired = this._yesNo(profile.willing_to_relocate)
          }

          // No saved answer -> defer, never guess
          if (!desired) { unmappedTextInputs.push(field); continue }

          const ok = await this._selectRadioByIntent(page, field.selector, desired)
          if (!ok) unmappedTextInputs.push(field)
          continue
        }

        // ---- Select / dropdown: map known ones, else defer to Groq ----
        if (field.type === 'select-one' || field.type === 'select') {
          let wanted = ''
          if (label.includes('country') || label.includes('location') || label.includes('city')) {
            wanted = profile.city || ''
          } else if (label.includes('experience') || label.includes('year')) {
            wanted = profile.years_of_experience || ''
          }
          // NOTE: no options[1] fallback. Unknown dropdown -> Groq decides
          // from the real option list, or it's deferred.
          if (!wanted) { unmappedTextInputs.push(field); continue }

          const ok = await this._selectOptionByIntent(page, field.selector, wanted, field.options || [])
          if (!ok) unmappedTextInputs.push(field)
          continue
        }

        // ---- Text / tel / email / textarea: map from profile ----
        let value = ''
        if (label.includes('phone') || label.includes('mobile')) value = profile.phone || ''
        else if (label.includes('email')) value = profile.email || ''
        else if (label.includes('first') && label.includes('name')) value = (profile.name || '').split(' ')[0] || ''
        else if (label.includes('last') && label.includes('name')) value = (profile.name || '').split(' ').slice(1).join(' ')
        else if (label.includes('name') && !label.includes('company') && !label.includes('user')) value = profile.name || ''
        else if (label.includes('city') || label.includes('location')) value = profile.city || ''
        else if (label.includes('linkedin')) value = profile.linkedin_url || ''
        else if (label.includes('salary') || label.includes('compensation') || label.includes('expected')) value = profile.expected_salary || ''
        else if (label.includes('experience') || label.includes('year')) value = profile.years_of_experience || ''
        else if (label.includes('notice')) value = profile.notice_period || ''
        else if (label.includes('website') || label.includes('portfolio')) value = profile.website || ''

        if (value) {
          const ok = await this._fillAndVerify(page, field.selector, value)
          if (!ok) unmappedTextInputs.push(field)
        } else {
          // No profile value -> let Groq try from the full profile context
          unmappedTextInputs.push(field)
        }
      }

      // ── Groq batch fill for unmapped fields (validated + verified) ──
      if (unmappedTextInputs.length > 0 && !page.isClosed()) {
        console.log(`[Automation] ${unmappedTextInputs.length} unmapped fields — using Groq.`)

        const fieldsForLLM = unmappedTextInputs.map(f => ({
          id: f.selector,
          label: f.label,
          type: f.type,
          required: f.required,
          options: f.options && f.options.length ? f.options : undefined,
        }))

        const prompt = this._buildFillPrompt(profile, fieldsForLLM)

        try {
          const raw = await this.groq.chatJSON<Record<string, string>>(prompt)

          // Validate the response against the exact fields we sent.
          const allowed = new Map(unmappedTextInputs.map(f => [f.selector as string, f]))

          for (const [selector, ansRaw] of Object.entries(raw)) {
            const field = allowed.get(selector)
            if (!field) continue                 // reject invented selectors
            if (typeof ansRaw !== 'string') continue
            const ans = ansRaw.trim()
            if (!ans) continue                    // empty = no answer; leave blank

            if (!this._answerFitsType(field, ans)) {
              logger.warn('[Automation]', `Dropped ill-typed answer for "${field.label}" (${field.type}): "${ans.slice(0, 40)}"`)
              continue
            }

            if (field.type === 'select-one' || field.type === 'select') {
              await this._selectOptionByIntent(page, selector, ans, field.options || [])
            } else if (field.type === 'radio' || field.type === 'checkbox') {
              await this._selectRadioByIntent(page, selector, this._yesNo(ans) || ans)
            } else {
              await this._fillAndVerify(page, selector, ans)
            }
            await this._delay(200, 400)
          }
        } catch (e: any) {
          logger.warn('[Automation]', `Groq batch fill failed: ${e.message}`)
        }
      }

      // Handle resume file upload inside modal
      if (!page.isClosed() && resumePath) {
        try {
          const modal = await page.$(MODAL_SELECTOR)
          if (modal) {
            const fileInput = await modal.$('input[type="file"]')
            if (fileInput) {
              await fileInput.setInputFiles(resumePath)
              await this._delay(1000, 2000)
            }
          }
        } catch { /* ignore */ }
      }

      if (page.isClosed()) return { status: 'error', message: 'Browser page was closed unexpectedly' }

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

      if (clickResult.clicked) {
        console.log(`[Automation] ➡️ Clicked "${clickResult.label}" button in modal`)
        consecutiveEmptySteps = 0

        if (clickResult.isSubmit) {
          await this._delay(3000, 4000)
          let success = false
          try {
            success = await page.evaluate(() => {
              const body = (document.body as HTMLBodyElement).innerText.toLowerCase()
              return body.includes('application was sent') || body.includes('applied') || body.includes('success')
            })
          } catch { /* ignore */ }

          const screenshot = await this._screenshot(page, userId, company)
          return { status: success ? 'applied' : 'unconfirmed', screenshot }
        } else {
          // Wait 2s for step transition, then proceed immediately
          await this._delay(1500, 2500)
          continue
        }
      }

      // If no button click occurred and 2 consecutive steps had no fields, stop cleanly
      if (modalFields.length === 0 && consecutiveEmptySteps >= 2) {
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

  /** Normalize any yes/no-ish profile value to 'yes' | 'no' | ''. */
  private _yesNo(v: any): string {
    const s = String(v ?? '').trim().toLowerCase()
    if (!s) return ''
    if (['yes', 'y', 'true', '1', 'authorized', 'authorised'].includes(s)) return 'yes'
    if (['no', 'n', 'false', '0'].includes(s)) return 'no'
    return '' // unknown value -> treat as unanswered, never guess
  }

  /**
   * Selects the radio in a group whose LABEL expresses the desired yes/no
   * intent — matches "I am authorized to work", "No, I do not require
   * sponsorship", etc. Returns false if nothing matched, so the caller can
   * defer instead of forcing a wrong click.
   */
  private async _selectRadioByIntent(page: Page, selector: string, desired: string): Promise<boolean> {
    const want = String(desired || '').toLowerCase()
    if (!want) return false
    try {
      return await page.evaluate(({ sel, want }) => {
        const input = document.querySelector(sel) as HTMLInputElement | null
        if (!input || !input.name) return false
        const group = Array.from(document.querySelectorAll(`input[name="${input.name}"]`)) as HTMLInputElement[]

        const labelOf = (r: HTMLInputElement) =>
          (r.closest('label')?.textContent ||
           document.querySelector(`label[for="${r.id}"]`)?.textContent || '')
            .replace(/\s+/g, ' ').trim().toLowerCase()

        const positive = ['yes', 'i am', 'authorized', 'authorised', 'do have', 'willing', 'able to']
        const negative = ['no', 'not ', 'do not', "don't", 'unable', 'require sponsorship']

        const match = group.find(r => {
          const l = labelOf(r)
          if (!l) return false
          if (want === 'yes') return l.startsWith('yes') || positive.some(p => l.includes(p))
          if (want === 'no') return l.startsWith('no') || negative.some(n => l.includes(n))
          // If caller passed a literal option text, try to match it directly.
          return l.includes(want)
        })

        if (match) { match.click(); return true }
        return false
      }, { sel: selector, want })
    } catch {
      return false
    }
  }

  /**
   * Selects a dropdown option by best-effort intent match against the real
   * option list. Never picks an arbitrary index. Returns false if nothing
   * reasonable matched.
   */
  private async _selectOptionByIntent(page: Page, selector: string, wanted: string, options: string[]): Promise<boolean> {
    const w = String(wanted || '').trim().toLowerCase()
    if (!w) return false
    try {
      const el = await page.$(selector)
      if (!el) return false

      const exact = options.find(o => o.trim().toLowerCase() === w)
      const partial = exact || options.find(o => {
        const opt = o.trim().toLowerCase()
        return opt.includes(w) || w.includes(opt)
      })
      if (!partial) return false

      try { await el.selectOption({ label: partial }) }
      catch { await el.selectOption({ value: partial }) }

      const now = await el.evaluate((n: any) =>
        (n as HTMLSelectElement).value || (n as HTMLSelectElement).selectedOptions?.[0]?.text || '')
      return !!now
    } catch {
      return false
    }
  }

  /**
   * Types a value into a text-like field and reads it back to confirm it
   * landed. One retry, then gives up (returns false) rather than leaving a
   * half-filled or wrong field.
   */
  private async _fillAndVerify(page: Page, selector: string, value: string): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (page.isClosed()) return false
        const el = await page.$(selector)
        if (!el || !(await el.isVisible())) return false

        await el.click()
        await el.fill('') // clear
        await this._typeHumanEl(el, value)
        await this._delay(150, 300)

        const got = await el.evaluate((n: any) => (n as HTMLInputElement).value || '')
        if (got.trim() === value.trim()) return true
        // else loop and retry once
      } catch {
        // fall through to retry / fail
      }
    }
    return false
  }

  /** Cheap type sanity check so a number field never gets prose, etc. */
  private _answerFitsType(field: { type: string; label: string }, ans: string): boolean {
    const t = field.type
    if (t === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ans)
    if (t === 'tel') return /\d/.test(ans) && ans.length <= 20
    const numish = /(year|experience|salary|how many|number of|notice)/.test(field.label.toLowerCase())
    if (numish && !/\d/.test(ans)) return false
    if (t !== 'textarea' && ans.length > 120) return false
    return true
  }

  /** Builds the strict, per-field Groq prompt. */
  private _buildFillPrompt(
    profile: any,
    fields: Array<{ id: string | null; label: string; type: string; required: boolean; options?: string[] }>
  ): string {
    const candidate = {
      name: profile.name,
      city: profile.city,
      phone: profile.phone,
      email: profile.email,
      linkedin_url: profile.linkedin_url,
      website: profile.website,
      years_of_experience: profile.years_of_experience,
      expected_salary: profile.expected_salary,
      notice_period: profile.notice_period,
      work_authorized: profile.work_authorized,
      requires_visa_sponsorship: profile.requires_visa_sponsorship,
      willing_to_relocate: profile.willing_to_relocate,
      skills: profile.skills,
      experience_summary: profile.experience_summary,
      resume_text: (profile.resume_text || '').slice(0, 2000),
    }

    return `You fill one candidate's job application fields. Answer ONLY from the profile below.

HARD RULES:
- Answer each field INDEPENDENTLY. Never copy an answer from one field into another.
- If the profile does not clearly contain the answer, return "" for that field. Do NOT guess names, employers, dates, salaries, locations, or eligibility.
- Keep every answer as SHORT as validly possible. A number field gets only the number. A location field gets only a place name. A yes/no field gets exactly "Yes" or "No".
- For a dropdown, you MUST return one value copied EXACTLY from that field's "options" list, or "" if none fit.
- For a cover-letter / "why" field, write at most 3 plain sentences grounded only in the profile. No em dashes.
- Return ONLY a JSON object mapping each field "id" to its answer string.
- Use ONLY the ids provided. Do NOT add, rename, or invent ids. Do NOT include commentary.

CANDIDATE PROFILE:
${JSON.stringify(candidate)}

FIELDS (answer each by matching its label to the profile; respect its type and options):
${JSON.stringify(fields, null, 2)}

Return example: { "#q1": "3", "#loc": "${profile.city || ''}", "#auth": "Yes" }`
  }

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
        this.context = await chromium.launchPersistentContext(
          cfg.chromeProfilePath,
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
      const storagePath = `${userId}/resume.pdf`
      const tmpDir = path.join(os.tmpdir(), 'jobnavi-resumes')
      fs.mkdirSync(tmpDir, { recursive: true })
      const localPath = path.join(tmpDir, `${userId}_resume.pdf`)

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
        console.log(`[Automation] ✅ Resume downloaded from Supabase Storage → ${localPath}`)
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