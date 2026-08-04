// ─────────────────────────────────────────────────────────────────
// lib/automation/playwright_discovery.ts
// Direct Playwright-based LinkedIn Job Discovery.
// Fetches live, active Easy Apply jobs posted within the last 24 hours.
// Replaces cached Serper Google Search.
// ─────────────────────────────────────────────────────────────────

import { chromium, BrowserContext } from 'playwright'
import { validateConfig } from '../config'
import { logger } from '../logger'
import { isRealJobTitle } from '../utils/url'

export interface DiscoveredJob {
  title: string
  company: string
  source_url: string
  source: string
  location: string
  description: string
  application_type: 'linkedin_easy_apply'
}

export class PlaywrightDiscovery {
  /**
   * Discovers active LinkedIn Easy Apply jobs posted in the last 24 hours.
   */
  static async discoverJobs(
    keywords: string[],
    location: string = 'Remote',
    existingUrls: Set<string> = new Set(),
    existingKeys: Set<string> = new Set()
  ): Promise<DiscoveredJob[]> {
    const cfg = validateConfig()
    const allDiscovered: DiscoveredJob[] = []
    const seenUrls = new Set<string>()

    logger.info('[PlaywrightDiscovery]', `Launching Chromium for live LinkedIn Easy Apply discovery...`)

    let context: BrowserContext | null = null

    try {
      // Launch headless Chromium context with bot evasion flags
      context = await chromium.launchPersistentContext('', {
        headless: true,
        executablePath: cfg.chromeExecutablePath || undefined,
        viewport: { width: 1280, height: 800 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--no-first-run',
          '--no-default-browser-check',
        ],
      })

      // Hide webdriver flag
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      })

      const page = await context.newPage()
      
      // Set realistic User-Agent headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
      })

      // Build unique query combinations
      const queries: string[] = []
      for (const kw of keywords) {
        const cleanKw = kw.trim()
        if (cleanKw) {
          queries.push(cleanKw)
        }
      }

      // Take top queries
      const uniqueQueries = Array.from(new Set(queries)).slice(0, 5)

      for (const q of uniqueQueries) {
        try {
          const targetLocation = location.trim() || 'Remote'
          const encodedKw = encodeURIComponent(q)
          const encodedLoc = encodeURIComponent(targetLocation)

          // LinkedIn Search URL Parameters:
          // f_TPR=r86400  -> Posted within past 24 hours
          // f_AL=true     -> Easy Apply ONLY
          // sortBy=DD     -> Sort by most recent
          const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodedKw}&location=${encodedLoc}&f_TPR=r86400&f_AL=true&sortBy=DD`

          logger.info('[PlaywrightDiscovery]', `Navigating LinkedIn (24h Easy Apply): "${q}" in "${targetLocation}"`)
          
          await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
          await page.waitForTimeout(2500) // Allow dynamic cards to load

          // Scroll down slightly to trigger lazy-loading of cards
          await page.evaluate(() => window.scrollBy(0, 500))
          await page.waitForTimeout(1000)

          // Extract job card elements off the DOM
          const rawJobs = await page.evaluate(() => {
            const results: { title: string; company: string; link: string; location: string; snippet: string }[] = []
            
            // Query multiple possible LinkedIn search result card selectors (guest & logged in views)
            const selectors = [
              'ul.jobs-search__results-list > li',
              '.job-card-container',
              'div.base-card',
              '.jobs-search-results__list-item'
            ]

            let cards: Element[] = []
            for (const sel of selectors) {
              const found = Array.from(document.querySelectorAll(sel))
              if (found.length > 0) {
                cards = found
                break
              }
            }

            // Fallback: collect all links matching /jobs/view/
            if (cards.length === 0) {
              const jobLinks = Array.from(document.querySelectorAll('a[href*="/jobs/view/"]'))
              jobLinks.forEach(link => {
                const href = (link as HTMLAnchorElement).href
                const title = link.textContent?.trim() || ''
                if (href && title) {
                  results.push({
                    title,
                    company: 'LinkedIn Posting',
                    link: href,
                    location: '',
                    snippet: ''
                  })
                }
              })
              return results
            }

            cards.forEach(card => {
              // Extract title & link
              const titleEl = card.querySelector('.base-search-card__title, .job-card-list__title, a.job-card-container__link, h3, h4')
              const linkEl = card.querySelector('a.base-card__full-link, a.job-card-container__link, a[href*="/jobs/view/"]') as HTMLAnchorElement | null
              
              // Extract company
              const companyEl = card.querySelector('.base-search-card__subtitle, .job-card-container__company-name, .job-card-container__primary-description')

              // Extract location
              const locationEl = card.querySelector('.job-search-card__location, .job-card-container__metadata-item')

              // Extract time indicator or snippet
              const timeEl = card.querySelector('time, .job-search-card__listdate')

              const title = titleEl?.textContent?.trim() || ''
              const company = companyEl?.textContent?.trim() || 'Unknown'
              const link = linkEl?.href || ''
              const loc = locationEl?.textContent?.trim() || ''
              const snippet = timeEl?.textContent?.trim() || ''

              if (title && link) {
                results.push({
                  title,
                  company,
                  link,
                  location: loc,
                  snippet
                })
              }
            })

            return results
          })

          logger.info('[PlaywrightDiscovery]', `Extracted ${rawJobs.length} raw cards for query "${q}"`)

          for (const raw of rawJobs) {
            // Clean job view URL to canonical format (e.g. https://www.linkedin.com/jobs/view/1234567890/)
            let cleanUrl = raw.link
            const viewMatch = cleanUrl.match(/\/jobs\/view\/(\d+)/)
            if (viewMatch) {
              cleanUrl = `https://www.linkedin.com/jobs/view/${viewMatch[1]}/`
            } else {
              // Clean query parameters from URL
              try {
                const u = new URL(cleanUrl)
                cleanUrl = `${u.origin}${u.pathname}`
              } catch { /* ignore */ }
            }

            // Deduplication checks
            if (seenUrls.has(cleanUrl) || existingUrls.has(cleanUrl)) continue

            const cleanTitle = raw.title.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
            const cleanCompany = raw.company.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()

            const key = `${cleanCompany.toLowerCase()}::${cleanTitle.toLowerCase()}`
            if (existingKeys.has(key)) continue

            if (!isRealJobTitle(cleanTitle)) continue

            seenUrls.add(cleanUrl)
            allDiscovered.push({
              title: cleanTitle,
              company: cleanCompany || 'LinkedIn Posting',
              source_url: cleanUrl,
              source: 'linkedin',
              location: raw.location || location || 'Remote',
              description: `Live LinkedIn Easy Apply Job. Location: ${raw.location || location}`,
              application_type: 'linkedin_easy_apply',
            })
          }

          // Delay between keyword searches to avoid rate limits
          await page.waitForTimeout(1500)
        } catch (err: any) {
          logger.error('[PlaywrightDiscovery]', `Error fetching query "${q}": ${err.message}`)
        }
      }
    } catch (err: any) {
      logger.error('[PlaywrightDiscovery]', `Fatal Playwright discovery error: ${err.message}`)
    } finally {
      if (context) {
        await context.close().catch(() => {})
      }
    }

    logger.info('[PlaywrightDiscovery]', `Discovered ${allDiscovered.length} live 24h Easy Apply jobs via Playwright.`)
    return allDiscovered
  }
}
