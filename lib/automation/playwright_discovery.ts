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
    existingKeys: Set<string> = new Set(),
    isCancelled?: () => Promise<boolean> | boolean
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

          // Try extracting the main pre-rendered job description pane text on the search page
          const initialDescPaneText = await page.evaluate(() => {
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
          }).catch(() => '')

          for (const raw of rawJobs) {
            if (isCancelled && await isCancelled()) break

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

            // Use extracted description if available, otherwise construct descriptive details
            const jobDesc = (initialDescPaneText && allDiscovered.length === 0)
              ? initialDescPaneText
              : `${cleanTitle} at ${cleanCompany}. Location: ${raw.location || location}. Easy Apply position discovered on LinkedIn.`

            seenUrls.add(cleanUrl)
            allDiscovered.push({
              title: cleanTitle,
              company: cleanCompany || 'LinkedIn Posting',
              source_url: cleanUrl,
              source: 'linkedin',
              location: raw.location || location || 'Remote',
              description: jobDesc,
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

    if (allDiscovered.length > 0) {
      if (isCancelled && await isCancelled()) {
        logger.info('[PlaywrightDiscovery]', 'Job enrichment cancelled by user request.')
        return []
      }
      logger.info('[PlaywrightDiscovery]', `Fast fetching descriptions for ${allDiscovered.length} jobs via parallel HTTP...`)
      const enrichedJobs = await Promise.all(allDiscovered.map(j => enrichJobDetails(j)))
      return enrichedJobs
    }

    return allDiscovered
  }
}

function cleanHtmlText(htmlSnippet: string): string {
  return htmlSnippet
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

function parseLinkedInHtml(html: string): string {
  if (!html) return ''
  const matchMarkup = html.match(/class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
  if (matchMarkup && matchMarkup[1]) {
    return cleanHtmlText(matchMarkup[1])
  }

  const matchDesc = html.match(/class="[^"]*description__text[^"]*"[^>]*>([\s\S]*?)<\/section>/i) ||
                    html.match(/class="[^"]*description__text[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                    html.match(/id="job-details"[^>]*>([\s\S]*?)<\/div>/i)
  if (matchDesc && matchDesc[1]) {
    return cleanHtmlText(matchDesc[1])
  }

  return ''
}

export async function enrichJobDetails(job: DiscoveredJob): Promise<DiscoveredJob> {
  let fullDesc = ''

  const viewMatch = job.source_url.match(/\/jobs\/view\/(\d+)/) || job.source_url.match(/currentJobId=(\d+)/)
  if (viewMatch && viewMatch[1]) {
    const linkedInId = viewMatch[1]
    try {
      const guestRes = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${linkedInId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
      if (guestRes.ok) {
        const guestHtml = await guestRes.text()
        fullDesc = parseLinkedInHtml(guestHtml)
      }
    } catch {}
  }

  if (!fullDesc || fullDesc.length < 50) {
    try {
      const directRes = await fetch(job.source_url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
      if (directRes.ok) {
        const directHtml = await directRes.text()
        fullDesc = parseLinkedInHtml(directHtml)
      }
    } catch {}
  }

  if (fullDesc && fullDesc.length > 50) {
    job.description = fullDesc
    const extracted = extractSkillsFromText(fullDesc)
    if (extracted.length > 0) {
      (job as any).tech_stack = extracted
    }
  }

  return job
}

const SKILLS_DICTIONARY = [
  'Generative AI', 'LLMs', 'Multi-Agent Systems', 'Agent Frameworks', 'Autogen', 'LangGraph',
  'CrewAI', 'LangChain', 'RAG', 'Retrieval-Augmented Generation', 'Semantic Search', 'Vector Databases',
  'Knowledge Graphs', 'Fine-tuning', 'PEFT', 'LoRA', 'Prompt Engineering', 'PyTorch', 'TensorFlow',
  'OpenAI', 'Deep Learning', 'NLP', 'Machine Learning', 'Computer Vision', 'Python', 'Java',
  'JavaScript', 'TypeScript', 'C++', 'C#', '.NET', 'Go', 'Golang', 'Rust', 'Ruby', 'PHP',
  'Swift', 'Kotlin', 'Scala', 'SQL', 'React', 'Node.js', 'Next.js', 'Vue', 'Angular',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'Linux', 'Git',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'DynamoDB', 'Elasticsearch', 'Pinecone', 'ChromaDB'
]

function extractSkillsFromText(text: string): string[] {
  if (!text) return []
  const found = new Set<string>()
  const textLower = text.toLowerCase()
  for (const tech of SKILLS_DICTIONARY) {
    const techLower = tech.toLowerCase()
    const pattern = tech.length <= 4
      ? new RegExp(`\\b${techLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      : new RegExp(`${techLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
    if (pattern.test(textLower)) {
      found.add(tech)
    }
  }
  return Array.from(found)
}
