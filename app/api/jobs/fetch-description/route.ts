import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { chromium } from 'playwright'

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

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { jobId, sourceUrl } = await request.json()
    if (!jobId && !sourceUrl) {
      return NextResponse.json({ error: 'Missing jobId or sourceUrl' }, { status: 400 })
    }

    // 1. Fetch current job record from DB
    let targetJob: any = null
    if (jobId) {
      const { data } = await supabase.from('jobs').select('*').eq('id', jobId).eq('user_id', user.id).maybeSingle()
      targetJob = data
    }

    const urlToScrape = targetJob?.source_url || sourceUrl || ''

    const isPlaceholderDesc = (desc: string) => {
      if (!desc) return true
      if (desc.length < 250) return true
      const lower = desc.toLowerCase()
      return (
        lower.includes('discovered on linkedin') ||
        lower.includes('easy apply position') ||
        lower.startsWith('live linkedin easy apply job')
      )
    }

    const currentDescIsReal = targetJob?.description && !isPlaceholderDesc(targetJob.description)

    // If description and tech_stack are both already complete real data, return immediately
    if (
      currentDescIsReal &&
      Array.isArray(targetJob.tech_stack) &&
      targetJob.tech_stack.length > 0
    ) {
      return NextResponse.json({
        description: targetJob.description,
        tech_stack: targetJob.tech_stack
      })
    }

    let fullDescription = currentDescIsReal ? targetJob.description : ''

    if (!fullDescription && !urlToScrape) {
      return NextResponse.json({ error: 'No source URL found for job' }, { status: 404 })
    }

    // Method 1: Try LinkedIn guest API if URL contains job ID
    const matchViewId = urlToScrape.match(/\/jobs\/view\/(\d+)/) || urlToScrape.match(/currentJobId=(\d+)/)
    if (matchViewId && matchViewId[1]) {
      const linkedInId = matchViewId[1]
      try {
        const guestRes = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${linkedInId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        })
        if (guestRes.ok) {
          const guestHtml = await guestRes.text()
          fullDescription = parseLinkedInHtml(guestHtml)
        }
      } catch (e: any) {
        console.warn('[FetchDescriptionAPI] Guest API error:', e.message)
      }
    }

    // Method 2: Direct HTTP fetch of sourceUrl
    if (!fullDescription || fullDescription.length < 50) {
      try {
        const directRes = await fetch(urlToScrape, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        })
        if (directRes.ok) {
          const directHtml = await directRes.text()
          fullDescription = parseLinkedInHtml(directHtml)
        }
      } catch (e: any) {
        console.warn('[FetchDescriptionAPI] Direct fetch error:', e.message)
      }
    }

    // Method 3: Headless Chrome via Playwright as robust fallback
    if (!fullDescription || fullDescription.length < 50) {
      let browser: any = null
      try {
        const chromePath = process.env.CHROME_EXECUTABLE || '/usr/bin/google-chrome'
        browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] })
        const page = await browser.newPage({
          extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' }
        })
        await page.goto(urlToScrape, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await page.waitForTimeout(1500)

        fullDescription = await page.evaluate(() => {
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
          return document.body.innerText || ''
        })
      } catch (e: any) {
        console.warn('[FetchDescriptionAPI] Playwright fallback error:', e.message)
      } finally {
        if (browser) await browser.close().catch(() => {})
      }
    }

    if (!fullDescription || fullDescription.length < 20) {
      return NextResponse.json({
        description: targetJob?.description || 'Could not automatically retrieve full description from source website. Please click View Post to read on source site.'
      })
    }

    // Extract required skills 100% dynamically from fullDescription using Ollama LLM
    let extractedTech: string[] = []
    try {
      const { OllamaClient } = await import('@/lib/ollama-client')
      const client = new OllamaClient()
      const systemPrompt = `You are a technical skills extractor. Extract all required skills, tools, programming languages, frameworks, and key technical qualifications mentioned in the job description. Respond ONLY with a valid JSON array of strings.`
      const userPrompt = `JOB DESCRIPTION:\n${fullDescription.slice(0, 4000)}`

      const res = await client.chatJSON<any>(`${systemPrompt}\n\n${userPrompt}`)
      if (Array.isArray(res)) {
        extractedTech = res.map(String).filter(Boolean)
      } else if (res && Array.isArray(res.skills)) {
        extractedTech = res.skills.map(String).filter(Boolean)
      } else if (res && Array.isArray(res.tech_stack)) {
        extractedTech = res.tech_stack.map(String).filter(Boolean)
      } else if (res && typeof res === 'object') {
        const values = Object.values(res).find(v => Array.isArray(v)) as string[] | undefined
        if (values) extractedTech = values.map(String).filter(Boolean)
      }
    } catch (e: any) {
      console.warn('[FetchDescriptionAPI] Dynamic LLM skill extraction error:', e.message)
    }

    if (jobId) {
      const updateData: Record<string, any> = { description: fullDescription }
      if (extractedTech.length > 0) {
        updateData.tech_stack = extractedTech
      }
      await supabase.from('jobs').update(updateData).eq('id', jobId).eq('user_id', user.id)
      await supabase.from('applications').update({ notes: fullDescription }).eq('job_id', jobId).eq('user_id', user.id)
    }

    return NextResponse.json({ description: fullDescription, tech_stack: extractedTech })

  } catch (err: any) {
    console.error('[FetchDescriptionAPI] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
