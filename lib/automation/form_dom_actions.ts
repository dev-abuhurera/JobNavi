

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
      const modalLoc = page.locator('.jobs-easy-apply-modal, .jobs-easy-apply-content, [role="dialog"], .artdeco-modal').first()

      // Helper to check if any radio in the container is checked
      const checkContainerSelected = async (container: any) => {
        return await container.evaluate((c: Element) => {
          const radios = Array.from(c.querySelectorAll('input[type="radio"]')) as HTMLInputElement[]
          return radios.some(r => r.checked)
        }).catch(() => false)
      }

      if (selector) {
        try {
          const inputLoc = page.locator(selector).first()
          if ((await inputLoc.count()) > 0) {
            const containerLoc = inputLoc.locator('xpath=ancestor::*[self::fieldset or @role="radiogroup" or contains(@class, "fb-dash-form-element") or contains(@class, "jobs-easy-apply-form-section__element") or contains(@class, "artdeco-form-element")]').first()
            const scope = (await containerLoc.count()) > 0 ? containerLoc : modalLoc

            const wantCap = want.charAt(0).toUpperCase() + want.slice(1).toLowerCase()
            const matchers = [
              scope.locator('label').filter({ hasText: new RegExp(`^\\s*${want}\\s*$`, 'i') }),
              scope.getByRole('radio', { name: new RegExp(`^${want}$`, 'i') }),
              scope.locator('label').filter({ hasText: new RegExp(`^${want}`, 'i') }),
              scope.getByText(wantCap, { exact: true }),
            ]

            for (const m of matchers) {
              if ((await m.count()) > 0) {
                await m.first().click({ force: true })
                await this.delay(100, 200)
                const verified = await checkContainerSelected((await containerLoc.count()) > 0 ? containerLoc : scope)
                if (verified) return true
              }
            }
          }
        } catch { /* fallback to DOM evaluate */ }
      }

      // 2. DOM Evaluate Fallback for Ember/React pointer dispatch & state verification
      const isSelectedInDom = await page.evaluate(({ sel, want }) => {
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

        if (!input || group.length === 0) return false

        const labelOf = (r: HTMLInputElement) => {
          let text = ''
          if (r.id) {
            const lEl = document.querySelector(`label[for="${r.id}"]`)
            if (lEl) text = lEl.textContent || ''
          }
          if (!text) {
            const parentLbl = r.closest('label') || r.closest('.artdeco-radio') || r.closest('.fb-dash-form-element__option')
            if (parentLbl) text = parentLbl.textContent || ''
          }
          if (!text && r.parentElement) {
            text = r.parentElement.textContent || ''
          }
          if (!text) text = r.value || ''
          return text.replace(/\s+/g, ' ').trim().toLowerCase()
        }

        const wantLower = want.toLowerCase()

        let match = group.find(r => {
          const l = labelOf(r)
          const valLower = (r.value || '').toLowerCase()
          if (valLower === wantLower) return true
          if (!l) return false
          if (wantLower === 'yes' || wantLower === 'true') {
            return l === 'yes' || l.startsWith('yes') || l.includes('authorized') || l.includes('authorised') || l.includes('willing') || valLower === 'yes'
          }
          if (wantLower === 'no' || wantLower === 'false') {
            return l === 'no' || l.startsWith('no') || l.includes('do not') || l.includes("don't") || l.includes('unable') || valLower === 'no'
          }
          return l === wantLower || l.startsWith(wantLower) || l.includes(wantLower)
        })

        if (!match && group.length > 0) {
          match = group[0]
        }

        if (!match) return false

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

        return group.some(r => r.checked)
      }, { sel: selector, want })

      return isSelectedInDom
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

        // Check if setting value programmatically opened suggestions dropdown
        const suggestionSelector = '[role="option"], .basic-typeahead__result, .search-basic-typeahead__results button, div[data-test-typeahead-dropdown] li, div[class*="typeahead"] [role="button"]'
        let hasSuggestions = await page.evaluate((sel) => {
          const items = Array.from(document.querySelectorAll(sel)) as HTMLElement[]
          return items.some(i => i.offsetWidth > 0 && i.offsetHeight > 0 && !i.textContent?.toLowerCase().includes('urn:li'))
        }, suggestionSelector).catch(() => false)

        // Only type character-by-character if programmatic fill did not trigger suggestions
        if (!hasSuggestions) {
          await this._typeHuman(page, value)
          await this.delay(400, 600)
          hasSuggestions = await page.evaluate((sel) => {
            const items = Array.from(document.querySelectorAll(sel)) as HTMLElement[]
            return items.some(i => i.offsetWidth > 0 && i.offsetHeight > 0 && !i.textContent?.toLowerCase().includes('urn:li'))
          }, suggestionSelector).catch(() => false)
        }

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

        // Sanity check: Ensure value didn't degrade to a raw URN token (e.g. "urn:li:geo:107164441")
        const finalVal = await el.inputValue().catch(() => '')
        const lowVal = finalVal.trim().toLowerCase()
        const isGarbageUrn = lowVal.includes('urn:li') || lowVal.includes('geo:') || lowVal === '[object object]'

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

      // Verify that input actually contains non-empty text
      const verifiedVal = await el.inputValue().catch(() => '')
      if (!verifiedVal || verifiedVal.trim().length === 0) {
        // Reset/clear field if fill attempt resulted in empty value
        await el.fill('').catch(() => {})
        return false
      }

      return true
    } catch {
      // Clean up input on uncaught error
      try {
        const el = page.locator(selector).first()
        await el.fill('').catch(() => {})
      } catch { /* ignore */ }
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

  /** Injects or updates an elegant glassmorphism HUD notification bar directly in the browser page. */
  static async showInPageNotification(page: Page, title: string, subtitle?: string): Promise<void> {
    try {
      if (page.isClosed()) return
      await page.evaluate(({ title, subtitle }) => {
        let banner = document.getElementById('jobnavi-agent-banner') as HTMLDivElement
        if (!banner) {
          banner = document.createElement('div')
          banner.id = 'jobnavi-agent-banner'
          banner.style.position = 'fixed'
          banner.style.top = '16px'
          banner.style.right = '16px'
          banner.style.zIndex = '2147483647'
          banner.style.background = 'rgba(15, 23, 42, 0.94)'
          banner.style.backdropFilter = 'blur(12px)'
          banner.style.border = '1px solid rgba(59, 130, 246, 0.5)'
          banner.style.borderRadius = '12px'
          banner.style.padding = '12px 18px'
          banner.style.color = '#ffffff'
          banner.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          banner.style.fontSize = '13px'
          banner.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(59, 130, 246, 0.3)'
          banner.style.transition = 'all 0.3s ease-in-out'
          banner.style.pointerEvents = 'none'
          banner.style.maxWidth = '360px'
          
          if (!document.getElementById('jobnavi-agent-style')) {
            const styleTag = document.createElement('style')
            styleTag.id = 'jobnavi-agent-style'
            styleTag.innerHTML = `
              @keyframes jobnaviPulse {
                0% { transform: scale(0.95); opacity: 0.8; box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
                70% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 8px rgba(59, 130, 246, 0); }
                100% { transform: scale(0.95); opacity: 0.8; box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
              }
            `
            document.head.appendChild(styleTag)
          }
          document.body.appendChild(banner)
        }

        banner.style.display = 'flex'
        banner.style.alignItems = 'center'
        banner.style.gap = '12px'

        banner.innerHTML = `
          <div style="width: 10px; height: 10px; border-radius: 50%; background: #3b82f6; animation: jobnaviPulse 1.5s infinite; flex-shrink: 0;"></div>
          <div>
            <div style="font-weight: 700; color: #60a5fa; letter-spacing: 0.5px; font-size: 11px; text-transform: uppercase; margin-bottom: 2px;">⚡ JobNavi Autonomous AI Agent</div>
            <div style="font-weight: 600; font-size: 13px; color: #f8fafc; line-height: 1.3;">${title}</div>
            ${subtitle ? `<div style="font-size: 11px; color: #94a3b8; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px;">${subtitle}</div>` : ''}
          </div>
        `
      }, { title, subtitle }).catch(() => {})
    } catch {
      /* ignore if page navigating */
    }
  }
}
