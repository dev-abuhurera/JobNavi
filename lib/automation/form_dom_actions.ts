

import { Page, ElementHandle } from 'playwright'
import { StagehandService } from './stagehand_service'

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

  static async selectRadioByIntent(page: Page, selector: string, desired: string, fieldLabel = 'radio question'): Promise<boolean> {
    const want = String(desired || '').trim()
    if (!want || page.isClosed()) return false

    // 1. Primary AI Action via Stagehand act()
    const aiSuccess = await StagehandService.act(`Select the "${want}" radio option for "${fieldLabel.substring(0, 80)}"`)
    if (aiSuccess) return true

    // 2. Playwright locator fallback
    try {
      const inputLoc = page.locator(selector).first()
      if ((await inputLoc.count()) > 0) {
        await inputLoc.click({ force: true }).catch(() => {})
        return true
      }
    } catch { /* ignore */ }
    return false
  }

  /**
   * Selects a dropdown option using Stagehand act() single-step action.
   */
  static async selectOptionByIntent(page: Page, selector: string, wanted: string, options: string[], fieldLabel = 'dropdown'): Promise<boolean> {
    const w = String(wanted || '').trim()
    if (page.isClosed()) return false
    
    // 1. Primary AI Action via Stagehand act()
    const aiSuccess = await StagehandService.act(`Select option "${w}" from dropdown "${fieldLabel.substring(0, 80)}"`)
    if (aiSuccess) return true

    // 2. Native Playwright fallback
    try {
      const el = page.locator(selector).first()
      if ((await el.count()) > 0) {
        let targetOpt = options.find(o => o.trim().toLowerCase() === w.toLowerCase()) || options[0]
        if (targetOpt) {
          await el.selectOption({ label: targetOpt }).catch(() => {})
          return true
        }
      }
    } catch { /* ignore */ }
    return false
  }

  /**
   * Types a value into a field using Stagehand act() single-step action.
   */
  static async fillAndVerify(page: Page, selector: string, value: string, fieldLabel = 'input field'): Promise<boolean> {
    if (page.isClosed()) return false

    // 1. Primary AI Action via Stagehand act()
    const aiSuccess = await StagehandService.act(`Fill out field "${fieldLabel.substring(0, 80)}" with "${value}"`)
    if (aiSuccess) return true

    // 2. Playwright locator fallback
    try {
      const el = page.locator(selector).first()
      if ((await el.count()) > 0 && await el.isVisible().catch(() => false)) {
        await el.fill(value).catch(() => {})
        return true
      }
    } catch { /* ignore */ }

    return false
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
