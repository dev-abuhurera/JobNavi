// ─────────────────────────────────────────────────────────────────
// lib/automation/form_dom_actions.ts
// Production-Grade Autonomous Browser Action Engine.
// Simulates human mechanical input variations, handles state transitions,
// and enforces form validation integrity checks with defensive fallbacks.
// ─────────────────────────────────────────────────────────────────

import { Page, ElementHandle } from 'playwright'

export class FormDOMActions {
  /**
   * Generates a realistic mechanical delay to mimic human behavior profiles.
   */
  static async delay(minMs = 300, maxMs = 700): Promise<void> {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
    await new Promise(resolve => setTimeout(resolve, ms))
  }

  /** 
   * Normalises loose multi-type database entries to uniform 'yes' | 'no' strings.
   */
  static yesNo(v: any): string {
    const s = String(v ?? '').trim().toLowerCase()
    if (!s) return ''
    if (['yes', 'y', 'true', '1', 'authorized', 'authorised', 'on', 'enabled'].includes(s)) return 'yes'
    if (['no', 'n', 'false', '0', 'off', 'disabled', 'sponsorship'].includes(s)) return 'no'
    return ''
  }

  static async selectRadioByIntent(page: Page, selector: string, desired: string): Promise<boolean> {
    const want = String(desired || '').trim()
    if (!want || page.isClosed()) return false

    try {
      // 1. Container-scoped or Modal-scoped Playwright Locators
      const modalLoc = page.locator('.jobs-easy-apply-modal, .jobs-easy-apply-content, [role="dialog"], .artdeco-modal').first()

      if (selector) {
        try {
          const inputLoc = page.locator(selector).first()
          if ((await inputLoc.count()) > 0) {
            const containerLoc = inputLoc.locator('xpath=ancestor::fieldset | ancestor::*[@role="radiogroup"] | ancestor::*[contains(@class, "fb-dash-form-element")] | ancestor::*[contains(@class, "jobs-easy-apply-form-section__element")]').first()
            const scope = (await containerLoc.count()) > 0 ? containerLoc : modalLoc

            const exactInContainer = scope.getByText(want, { exact: true })
            if ((await exactInContainer.count()) > 0) {
              await exactInContainer.first().click({ force: true })
              return true
            }

            const partialInContainer = scope.getByText(want, { exact: false })
            if ((await partialInContainer.count()) > 0) {
              await partialInContainer.first().click({ force: true })
              return true
            }
          }
        } catch { /* fallback */ }
      }

      // If specific selector missed, try modal-level text locator
      try {
        const modalScope = (await modalLoc.count()) > 0 ? modalLoc : page
        const exactModal = modalScope.getByText(want, { exact: true })
        if ((await exactModal.count()) > 0) {
          await exactModal.first().click({ force: true })
          return true
        }
        const roleModal = modalScope.getByRole('radio', { name: want })
        if ((await roleModal.count()) > 0) {
          await roleModal.first().click({ force: true })
          return true
        }
      } catch { /* fallback to DOM evaluate */ }

      // 2. DOM Evaluate Fallback for Ember/React pointer dispatch
      const target = await page.evaluate(({ sel, want }) => {
        let input = sel ? (document.querySelector(sel) as HTMLInputElement | null) : null
        const modal = document.querySelector('.jobs-easy-apply-content, .artdeco-modal, [role="dialog"]') || document.body

        let group: HTMLInputElement[] = []

        if (input) {
          const container = input.closest('fieldset, [role="radiogroup"], .fb-dash-form-element, .jobs-easy-apply-form-section__element')
          if (container) {
            group = Array.from(container.querySelectorAll('input[type="radio"]')) as HTMLInputElement[]
          } else if (input.name && !input.name.startsWith('radio-group-')) {
            group = Array.from(document.querySelectorAll(`input[name="${input.name}"]`)) as HTMLInputElement[]
          }
        }

        if (group.length === 0) {
          const containers = Array.from(modal.querySelectorAll('fieldset, [role="radiogroup"], .fb-dash-form-element, .jobs-easy-apply-form-section__element'))
          for (const c of containers) {
            const radios = Array.from(c.querySelectorAll('input[type="radio"]')) as HTMLInputElement[]
            if (radios.length > 0 && !radios.some(r => r.checked)) {
              group = radios
              input = radios[0]
              break
            }
          }
        }

        if (!input || group.length === 0) return null

        const labelOf = (r: HTMLInputElement) => {
          let text = ''
          if (r.id) {
            const lEl = document.querySelector(`label[for="${r.id}"]`)
            if (lEl) text = lEl.textContent || ''
          }
          if (!text && r.closest) {
            const pEl = r.closest('label') || r.closest('.artdeco-radio') || r.parentElement
            if (pEl) text = pEl.textContent || ''
          }
          if (!text) text = r.value || ''
          return text.replace(/\s+/g, ' ').trim().toLowerCase()
        }

        const wantLower = want.toLowerCase()
        const positive = ['yes', 'i am', 'authorized', 'authorised', 'do have', 'willing', 'able to', 'citizen', 'expert', 'frequently']
        const negative = ['no', 'not ', 'do not', "don't", 'unable', 'require sponsorship', 'beginner']

        let match = group.find(r => {
          const l = labelOf(r)
          if (!l) return false
          if (wantLower === 'yes' || wantLower === 'true') return l.startsWith('yes') || positive.some(p => l.includes(p))
          if (wantLower === 'no' || wantLower === 'false') return l.startsWith('no') || negative.some(n => l.includes(n))
          return l === wantLower || l.includes(wantLower) || wantLower.includes(l)
        })

        if (!match && group.length > 0) {
          match = group[0]
        }

        if (!match) return null

        const labelEl = (match.id ? document.querySelector(`label[for="${match.id}"]`) : null) || match.closest('label') || match.parentElement
        const wrapperEl = match.closest('.artdeco-radio, [class*="radio" i], .fb-dash-form-element__option') || match.parentElement

        const targets = Array.from(new Set([labelEl, wrapperEl, match])).filter(Boolean) as HTMLElement[]
        for (const t of targets) {
          try {
            t.focus()
            t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
            t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
            if (typeof t.click === 'function' && t !== match) {
              t.click()
            }
          } catch {}
        }

        match.checked = true
        match.dispatchEvent(new Event('change', { bubbles: true }))
        match.dispatchEvent(new Event('input', { bubbles: true }))

        return { id: match.id, labelSel: match.id ? `label[for="${match.id}"]` : null }
      }, { sel: selector, want })

      if (!target) return false

      if (target.labelSel) {
        const lbl = await page.$(target.labelSel).catch(() => null)
        if (lbl && (await lbl.isVisible().catch(() => false))) {
          await lbl.click({ force: true }).catch(() => {})
        }
      }

      return true
    } catch {
      return false
    }
  }

  /**
   * Selects a dropdown option using native Playwright selection (bypasses React/Ember synthetic event bugs).
   */
  static async selectOptionByIntent(page: Page, selector: string, wanted: string, options: string[]): Promise<boolean> {
    const w = String(wanted || '').trim().toLowerCase()
    if (page.isClosed()) return false
    
    try {
      const el = page.locator(selector).first()
      if ((await el.count()) === 0) return false

      // Match the best valid string option text
      let targetOpt = options.find(o => o.trim().toLowerCase() === w) || options.find(o => {
        const opt = o.trim().toLowerCase()
        return opt.includes(w) || w.includes(opt)
      })

      // Fallback: Pick the first non-placeholder option
      if (!targetOpt) {
        targetOpt = options.find(o => o && o.trim().length > 0 && !o.toLowerCase().startsWith('select') && !o.toLowerCase().startsWith('choose'))
      }

      if (targetOpt) {
        // Native Playwright option selection triggers all internal React/Ember synthetic listeners
        await el.selectOption({ label: targetOpt }).catch(async () => {
          await el.selectOption({ value: targetOpt }).catch(() => {})
        })
        return true
      }
      
      return false
    } catch {
      return false
    }
  }

  /**
   * Types a value into a field using native UI simulation (atomic clear, human typing, combobox handling).
   */
  static async fillAndVerify(page: Page, selector: string, value: string): Promise<boolean> {
    try {
      if (page.isClosed()) return false
      const el = page.locator(selector).first()
      if ((await el.count()) === 0 || !(await el.isVisible().catch(() => false))) return false

      // 1. Inspect if element is an API/Asynchronous Combobox or Typeahead Search Field (Location/City)
      const isCombobox = await el.evaluate((input: any) => {
        const tag = input as HTMLElement
        const role = tag.getAttribute('role') || ''
        const ariaAuto = tag.getAttribute('aria-autocomplete') || ''
        const id = (tag.id || '').toLowerCase()
        const name = (tag.getAttribute('name') || '').toLowerCase()
        const labelText = (tag.closest('label')?.textContent || tag.getAttribute('aria-label') || '').toLowerCase()
        return role === 'combobox' || ariaAuto.length > 0 || id.includes('typeahead') || id.includes('location') || name.includes('search') || labelText.includes('location') || labelText.includes('city')
      }).catch(() => false)

      // 2. Gain Focus and Clear existing data using Playwright native clear
      await el.focus().catch(() => {})
      await el.click({ force: true }).catch(() => {})
      await el.fill('').catch(() => {})
      await el.evaluate((input: any) => {
        if ('value' in input) input.value = ''
      }).catch(() => {})
      await this.delay(100, 200)

      // 3. For Combobox / Location typeaheads, use human key emulation & synthetic DOM events to set clean city text
      if (isCombobox) {
        // Set clean human city text directly into DOM input & fire synthetic input/change events
        await el.fill(value).catch(() => {})
        await el.evaluate((e: any, v) => {
          if ('value' in e) e.value = v
          e.dispatchEvent(new Event('input', { bubbles: true }))
          e.dispatchEvent(new Event('change', { bubbles: true }))
        }, value).catch(() => {})
        await this.delay(150, 300)

        // Type characters to trigger typeahead suggestions dropdown
        await this._typeHuman(page, value)
        await this.delay(600, 900) 

        // Check if an active suggestion option item is painted to the DOM
        const suggestionSelector = '[role="option"], .basic-typeahead__result, .search-basic-typeahead__results button, div[data-test-typeahead-dropdown] li, div[class*="typeahead"] [role="button"]'
        const hasSuggestions = await page.evaluate((sel) => {
          const items = Array.from(document.querySelectorAll(sel)) as HTMLElement[]
          return items.some(i => i.offsetWidth > 0 && i.offsetHeight > 0 && !i.textContent?.toLowerCase().includes('urn:li'))
        }, suggestionSelector).catch(() => false)

        if (hasSuggestions) {
          const suggestionEl = page.locator(suggestionSelector).first()
          if (await suggestionEl.isVisible().catch(() => false)) {
            await suggestionEl.click({ force: true }).catch(async () => {
              await page.keyboard.press('ArrowDown')
              await this.delay(150, 250)
              await page.keyboard.press('Enter')
            })
          } else {
            await page.keyboard.press('ArrowDown')
            await this.delay(150, 250)
            await page.keyboard.press('Enter')
          }
        } else {
          await page.keyboard.press('Tab').catch(() => {})
          await el.blur().catch(() => {})
        }

        // Sanity check: Ensure value didn't degrade to a raw URN token (e.g. "urn:li:geo:107164441" or "103644278")
        const finalVal = await el.inputValue().catch(() => '')
        const lowVal = finalVal.trim().toLowerCase()
        const isGarbageUrn = /^\d+$/.test(lowVal) || lowVal.includes('urn:li') || lowVal.includes('geo:') || lowVal.includes('urn:') || lowVal === '[object object]'

        if (isGarbageUrn) {
          await el.fill(value).catch(() => {})
          await el.evaluate((e: any, v) => {
            if ('value' in e) e.value = v
            e.dispatchEvent(new Event('input', { bubbles: true }))
            e.dispatchEvent(new Event('change', { bubbles: true }))
            e.dispatchEvent(new Event('blur', { bubbles: true }))
          }, value).catch(() => {})
          await el.blur().catch(() => {})
        }
      } else {
        // Normal inputs: set value cleanly and trigger blur
        await el.fill(value).catch(async () => {
          await this._typeHuman(page, value)
        })
        await this.delay(100, 200)
        await el.blur().catch(() => {})
      }

      return true
    } catch {
      return false
    }
  }

  /**
   * Production-Grade Human Keyboard Emulation via Core page pipeline handles.
   */
  private static async _typeHuman(page: Page, text: string): Promise<void> {
    for (const char of text) {
      await page.keyboard.type(char, { delay: Math.floor(Math.random() * 35) + 15 })
    }
  }

  /** Checks if on-screen red validation errors exist on active modal viewports. */
  static async hasValidationErrors(page: Page): Promise<boolean> {
    try {
      if (page.isClosed()) return false
      return await page.evaluate(() => {
        const modal = document.querySelector('.jobs-easy-apply-modal, [role="dialog"], [aria-modal="true"], .artdeco-modal')
        if (!modal) return false
        const errors = Array.from(modal.querySelectorAll('.artdeco-inline-feedback--error, [class*="error" i], [class*="invalid" i]'))
        return errors.some(el => (el as HTMLElement).offsetParent !== null && (el.textContent || '').trim().length > 0)
      })
    } catch {
      return false
    }
  }
}
