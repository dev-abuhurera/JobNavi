import { Page } from 'playwright'
import { OllamaClient } from '../ollama-client'
import { logger } from '../logger'
import { ExtractedFormField } from './form_extractor'
import { FormDOMActions } from './form_dom_actions'
import { z } from 'zod'

export function sanitizeNumericValue(val: string): string {
  if (!val) return ''
  const trimmed = val.trim()

  // If already pure digits (e.g. "3", "80000"), return as is
  if (/^\d+$/.test(trimmed)) return trimmed

  // Handle range strings like "2-3 years", "2 - 3", "2-3", "2 to 3 years", "3+ years"
  const rangeMatch = trimmed.match(/^(\d+)\s*(?:-|\bto\b|\+)\s*\d*/i)
  if (rangeMatch && rangeMatch[1]) {
    return rangeMatch[1]
  }

  // Handle text strings like "3 years", "3 yrs", "$80,000"
  const singleNumMatch = trimmed.match(/(\d[\d,]*)/)
  if (singleNumMatch && singleNumMatch[1]) {
    return singleNumMatch[1].replace(/,/g, '')
  }

  return trimmed
}

export function buildDynamicStepZodSchema(fields: ExtractedFormField[]) {
  const schemaShape: Record<string, z.ZodTypeAny> = {}

  fields.forEach((field, idx) => {
    if (!field.selector) return
    const fieldKey = `field_${idx}`
    const optionsText = field.options && field.options.length ? ` Available Options (Select exact match string from this list): [${field.options.map(o => `"${o}"`).join(', ')}]` : ''
    
    const isStrictlyNumeric = field.type === 'number' || (
      /how many years|years of experience|ctc|salary|compensation|lpa|lpc|pay rate|notice period/i.test(field.label) &&
      !/summary|describe|overview|tell us|why|headline|bio|about/i.test(field.label)
    )
    const numericHint = isStrictlyNumeric && !optionsText ? ' Return raw numeric digits ONLY as a single integer (e.g. "2" or "3"). Do NOT include words, "years", ranges like "2-3", or letters.' : ''

    const flexibleVal = z.union([z.string(), z.number(), z.boolean()])
      .optional()
      .transform(v => v !== undefined && v !== null ? String(v) : '')
      .describe(`Answer for question: "${field.label}" (${field.type}).${optionsText}${numericHint}`)

    schemaShape[fieldKey] = flexibleVal
    schemaShape[field.selector] = flexibleVal
  })

  return z.object(schemaShape).passthrough()
}

export interface FillStepOptions {
  allowLlmRetry?: boolean
  failedAttempts?: Map<string, string[]>
  previousFailedAnswers?: Record<string, string>
  skills_experience?: Record<string, number>
}

export class FormAIFiller {
  private ai: OllamaClient

  constructor(options?: { host?: string; model?: string }) {
    this.ai = new OllamaClient(options || {})
  }

  async fillFormStep(page: Page, modalFields: ExtractedFormField[], profile: any, options: FillStepOptions = {}): Promise<void> {
    if (modalFields.length === 0 || page.isClosed()) return

    const failedAttemptsMap = options.failedAttempts || new Map<string, string[]>()

    // ── STEP 1: Identify unfilled questions on current step ──
    const trulyUnfilledFields = modalFields.filter(f => f.isEmpty)

    if (trulyUnfilledFields.length === 0) {
      console.log(`[FormAIFiller] ✅ All ${modalFields.length} fields on this step are already filled/cached. Skipping fill pass.`)
      return
    }

    const unmappedFields: ExtractedFormField[] = []
    const candidateName = profile.name || ''

    // ── STEP 2: Pass 1 — Map User-Saved Resume Hub Preferences Directly ──
    for (const field of trulyUnfilledFields) {
      if (!field.selector) continue
      const label = field.label.toLowerCase()

      // Identify if this question matches any of candidate's 14 dedicated Resume Hub fields
      let profileValue = ''
      let isWorkAuth = false
      let isVisaSponsorship = false
      let isRelocation = false

      if (label.includes('sponsor') || label.includes('visa') || label.includes('immigration')) {
        isVisaSponsorship = true
        profileValue = FormDOMActions.yesNo(profile.requires_visa_sponsorship) || 'no'
      } else if (
        label.includes('authoriz') || label.includes('authorised') ||
        label.includes('legally') || label.includes('right to work') ||
        label.includes('work permit') || label.includes('eligible to work') ||
        label.includes('work in') || label.includes('authorized to work')
      ) {
        isWorkAuth = true
        profileValue = FormDOMActions.yesNo(profile.work_authorized) || 'yes'
      } else if (label.includes('relocat') || label.includes('relocation') || label.includes('willing to move')) {
        isRelocation = true
        profileValue = FormDOMActions.yesNo(profile.willing_to_relocate) || 'yes'
      } else if (label.includes('phone') || label.includes('mobile') || label.includes('cell') || label.includes('contact number') || label.includes('telephone')) {
        profileValue = profile.phone || ''
      } else if (label.includes('email') || label.includes('e-mail')) {
        profileValue = profile.email || ''
      } else if (label.includes('first') && label.includes('name')) {
        profileValue = candidateName.split(' ')[0] || ''
      } else if (label.includes('last') && label.includes('name')) {
        profileValue = candidateName.split(' ').slice(1).join(' ') || ''
      } else if (label.includes('name') && !label.includes('company') && !label.includes('user') && !label.includes('project') && !label.includes('file')) {
        profileValue = candidateName
      } else if (label.includes('city') || label.includes('location') || label.includes('address') || label.includes('country') || label.includes('residence') || label.includes('living') || label.includes('based') || label.includes('town') || label.includes('state')) {
        profileValue = profile.city || ''
      } else if (label.includes('linkedin') || label.includes('linked in')) {
        profileValue = profile.linkedin_url || profile.linkedin || ''
      } else if (label.includes('github') || label.includes('git hub') || label.includes('repository')) {
        profileValue = profile.github_url || profile.github || ''
      } else if (label.includes('portfolio') || label.includes('website') || label.includes('site') || label.includes('blog') || label.includes('homepage')) {
        profileValue = profile.portfolio_url || profile.website || profile.portfolio || profile.linkedin_url || profile.github_url || ''
      } else if (label.includes('url') || label.includes('link') || label.includes('web page')) {
        profileValue = profile.portfolio_url || profile.linkedin_url || profile.github_url || profile.website || ''
      } else if ((label.includes('notice') || label.includes('availability')) && profile.notice_period) {
        profileValue = String(profile.notice_period)
      } else if ((label.includes('salary') || label.includes('compensation') || label.includes('pay') || label.includes('ctc')) && profile.expected_salary) {
        profileValue = sanitizeNumericValue(String(profile.expected_salary))
      } else if ((label.includes('hourly') || label.includes('rate')) && profile.hourly_rate) {
        profileValue = sanitizeNumericValue(String(profile.hourly_rate))
      } else if (label.includes('gender') && profile.gender) {
        profileValue = profile.gender
      } else if ((label.includes('ethnic') || label.includes('race')) && profile.ethnicity) {
        profileValue = profile.ethnicity
      }

      // 0. Application Agreement & Consent Checkboxes (Terms, Privacy, Consent, Declarations)
      if (field.type === 'checkbox') {
        console.log(`[FormAIFiller] 🎯 Auto-agreeing to checkbox terms/consent for "${field.label}" — checking directly without AI.`)
        const filled = await FormDOMActions.selectRadioByIntent(page, field.selector, 'yes')
        if (filled) continue
      }

      // 1. Age Verification Questions (e.g. "Are you 18 years of age or older?")
      const isAgeQuestion = (label.includes('18') || label.includes('age') || label.includes('legal age') || label.includes('adult')) &&
        !label.includes('package') && !label.includes('page')

      if (isAgeQuestion) {
        let filled = false
        if (field.type === 'radio' || field.type === 'checkbox') {
          filled = await FormDOMActions.selectRadioByIntent(page, field.selector, 'yes')
        } else if (field.type === 'select-one' || field.type === 'select') {
          filled = await FormDOMActions.selectOptionByIntent(page, field.selector, 'yes', field.options || [])
        } else {
          filled = await FormDOMActions.fillAndVerify(page, field.selector, 'Yes')
        }
        if (filled) continue
      }

      // 2. Total Overall Work Experience Questions (e.g. "Total years of work experience?")
      const isTotalExpQuestion = (label.includes('total') || label.includes('overall') || label.includes('entire') || label.includes('cumulative')) &&
        (label.includes('year') || label.includes('experience') || label.includes('yr'))

      if (isTotalExpQuestion && profile.years_of_experience !== undefined) {
        const totalYrsStr = String(profile.years_of_experience)
        let filled = false
        if (field.type === 'radio' || field.type === 'checkbox') {
          filled = await FormDOMActions.selectRadioByIntent(page, field.selector, totalYrsStr)
        } else if (field.type === 'select-one' || field.type === 'select') {
          filled = await FormDOMActions.selectOptionByIntent(page, field.selector, totalYrsStr, field.options || [])
        } else {
          filled = await FormDOMActions.fillAndVerify(page, field.selector, totalYrsStr)
        }
        if (filled) continue
      }

      // 3. Skill-Specific Experience Questions (e.g. "How many years of Python / RAG / React experience do you have?")
      const isSkillExpQuestion = (label.includes('year') || label.includes('experience') || label.includes('yr') || label.includes('how many')) &&
        !isAgeQuestion && !isTotalExpQuestion

      let matchedSkillYrs: number | null = null
      if (isSkillExpQuestion) {
        const skillsExpMap: Record<string, number> = {
          ...(profile.skills_experience || {}),
          ...(options.skills_experience || {}),
        }

        const cleanLabel = label.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()

        // Match label directly against skills_experience entries
        for (const [skill, yrs] of Object.entries(skillsExpMap)) {
          const sLower = skill.toLowerCase().trim()
          if (!sLower) continue
          const baseSkill = sLower.replace(/\.?js$/i, '').replace(/\s+/g, '')
          if (
            label.includes(sLower) ||
            cleanLabel.includes(sLower) ||
            (baseSkill.length >= 2 && label.replace(/\s+/g, '').includes(baseSkill))
          ) {
            matchedSkillYrs = Number(yrs)
            break
          }
        }

        // If not explicitly in skillsExpMap, check candidate's listed profile skills
        if (matchedSkillYrs === null) {
          const userSkills: string[] = Array.isArray(profile.skills) ? profile.skills.map((s: string) => String(s).toLowerCase().trim()) : []
          const isUserSkill = userSkills.some(s => s && (label.includes(s) || cleanLabel.includes(s)))
          if (isUserSkill && profile.years_of_experience) {
            matchedSkillYrs = Number(profile.years_of_experience)
          } else {
            // Check if label specifically asks for an unlisted technology/tool
            const knownTechKeywords = ['python', 'java', 'javascript', 'typescript', 'react', 'node', 'c++', 'c#', 'sql', 'aws', 'docker', 'kubernetes', 'rag', 'llm', 'ai', 'langchain', 'autogen', 'crewai', 'langgraph', 'git', 'linux', 'devops', 'testing', 'qa', 'mongodb', 'postgres', 'redis']
            const asksUnlistedTech = knownTechKeywords.some(w => label.includes(w))
            if (asksUnlistedTech) {
              matchedSkillYrs = 0
            }
          }
        }
      }

      if (matchedSkillYrs !== null) {
        const valueStr = String(matchedSkillYrs)
        console.log(`[FormAIFiller] 🎯 Saved Profile Match for "${field.label}": ${valueStr} years — filling directly without AI.`)
        let filled = false
        if (field.type === 'radio' || field.type === 'checkbox') {
          filled = await FormDOMActions.selectRadioByIntent(page, field.selector, valueStr)
        } else if (field.type === 'select-one' || field.type === 'select') {
          filled = await FormDOMActions.selectOptionByIntent(page, field.selector, valueStr, field.options || [])
        } else {
          filled = await FormDOMActions.fillAndVerify(page, field.selector, valueStr)
        }
        if (filled) continue
      }

      const isKnownProfileQuestion = isWorkAuth || isVisaSponsorship || isRelocation || Boolean(profileValue)

      if (isKnownProfileQuestion) {
        console.log(`[FormAIFiller] 🎯 Saved Profile Match for "${field.label}": "${profileValue || 'Yes/No preference'}" — filling directly without AI.`)
        let filled = false
        if (field.type === 'radio' || field.type === 'checkbox') {
          const intent = profileValue || (isWorkAuth ? 'yes' : isVisaSponsorship ? 'no' : isRelocation ? 'yes' : '')
          if (intent) {
            filled = await FormDOMActions.selectRadioByIntent(page, field.selector, intent)
          }
        } else if (field.type === 'select-one' || field.type === 'select') {
          const intent = profileValue || (isWorkAuth ? 'Yes' : isVisaSponsorship ? 'No' : isRelocation ? 'Yes' : '')
          if (intent) {
            filled = await FormDOMActions.selectOptionByIntent(page, field.selector, intent, field.options || [])
          }
        } else if (profileValue) {
          filled = await FormDOMActions.fillAndVerify(page, field.selector, profileValue)
        }

        // Dedicated Resume Hub questions are filled statically and NEVER sent to the LLM
        continue
      }

      // Defer only unknown/custom questions to local Ollama LLM
      const isAuxiliaryField = label === 'search' || label.startsWith('search ') || label === 'filter' || label.startsWith('filter ')
      if (!isAuxiliaryField) {
        unmappedFields.push(field)
      }
    }

    // Check if LLM retries are allowed for unmapped fields
    if (options.allowLlmRetry === false) {
      console.log(`[FormAIFiller] ℹ️ Skipping Ollama LLM retry pass for ${unmappedFields.length} fields (allowLlmRetry: false).`)
      return
    }

    // ── STEP 3: Pass 2 — Dynamic Ollama AI Answering with User Profile Data ──
    if (unmappedFields.length > 0 && !page.isClosed()) {
      console.log(`[FormAIFiller] Dispatching ${unmappedFields.length} custom form questions to AI model...`)

      // Build failure context feedback string if previous attempts failed
      const failedContextLines: string[] = []
      for (const field of unmappedFields) {
        if (!field.selector) continue
        const previousFails = failedAttemptsMap.get(field.selector)
        if (previousFails && previousFails.length > 0) {
          failedContextLines.push(`- Question "${field.label}": DO NOT output these previously failed values: [${previousFails.map(v => `"${v}"`).join(', ')}]`)
        }
      }

      const failureRulesPrompt = failedContextLines.length > 0
        ? `\n\nRULE 6: PREVIOUS FAILED ANSWERS TO AVOID (CRITICAL)\nThe following answers failed verification on previous attempts for these exact fields. You MUST output alternative valid options or values:\n${failedContextLines.join('\n')}`
        : ''

      const DynamicStepSchema = buildDynamicStepZodSchema(unmappedFields)
      const skillsBreakdown = Object.entries({ ...(profile.skills_experience || {}), ...(options.skills_experience || {}) })
        .map(([s, y]) => `${s}: ${y} years`)
        .join(', ')

      const systemPrompt = `You are an elite, autonomous AI job application assistant acting on behalf of candidate "${candidateName}".
Your mission is to generate 100% accurate, professional, context-aware answers for job application form questions.

CANDIDATE TRUTH CONTEXT (Sourced directly from Candidate's Master Resume Hub):
- Full Name: "${candidateName}"
- Location / City: "${profile.city || ''}"
- Contact Phone: "${profile.phone || ''}"
- Contact Email: "${profile.email || ''}"
- Total Years of Professional Experience: "${sanitizeNumericValue(String(profile.years_of_experience || ''))}"
- Skill-Specific Experience Breakdown: "${skillsBreakdown || (profile.skills || []).join(', ')}"
- Expected Annual Salary / CTC: "${sanitizeNumericValue(String(profile.expected_salary || profile.current_salary || ''))}"
- Expected Hourly Pay Rate: "${sanitizeNumericValue(String(profile.hourly_rate || ''))}"
- Notice Period: "${profile.notice_period || ''}"
- Work Authorization Status: "${profile.work_authorized || 'Yes'}"
- Visa Sponsorship Required: "${profile.requires_visa_sponsorship || 'No'}"
- Willing to Relocate: "${profile.willing_to_relocate || 'Yes'}"
- Gender: "${profile.gender || 'Prefer not to say'}"
- Ethnicity: "${profile.ethnicity || 'Prefer not to say'}"
- LinkedIn URL: "${profile.linkedin_url || ''}"
- Portfolio URL: "${profile.portfolio_url || profile.website || ''}"
- GitHub URL: "${profile.github_url || ''}"
- Technical & Professional Skills: "${(profile.skills || []).join(', ')}"
- Executive Experience Summary: "${profile.experience_summary || ''}"
- Master Resume Content: "${(profile.resume_text || '').slice(0, 3500).replace(/\s+/g, ' ')}"

COMPREHENSIVE MASTER ANSWERING RULES:

RULE 1: DROPDOWN & RADIO SELECTION
- You MUST select an EXACT string match from the provided "Available Options" list for that field. Never invent option strings.
- For Total Experience dropdowns: Pick the option matching candidate's total years of experience (${sanitizeNumericValue(String(profile.years_of_experience || '3'))}).
- For Specific Skill / Tech / Tool Experience dropdowns (e.g. "Experience with Python / Java / React / AWS / Docker"):
  * ALWAYS pick the option matching the candidate's exact years specified in Skill-Specific Experience Breakdown (e.g. React: 5 years -> pick option with 5 or 5+).
  * NEVER pick "None", "0 years", "No experience", "N/A", or "0" for technical skill questions.

RULE 2: NUMERIC & EXPERIENCE TEXT INPUTS (Years of Experience, Counts, Salary)
- You MUST output DIGITS ONLY as a SINGLE integer (e.g. "1", "2", "3", "5", "80000").
- NEVER output text words like "None", "Zero", "N/A", "years", "yrs", "no", or range strings like "1-2".
- For any tech or skill experience question, output the candidate's exact years for that skill (or positive integer like "3" or "5"). NEVER output "0" or "None".

RULE 3: YES / NO & AGREEMENT QUESTIONS
- Work Authorization / Legally Eligible: Output "Yes" (or candidate's work_authorized status).
- Visa Sponsorship Required: Output "${profile.requires_visa_sponsorship === 'yes' ? 'Yes' : 'No'}".
- Relocation / Onsite / Hybrid / Commute / Travel: Output "Yes" (unless candidate explicitly specified No).
- Background Checks / Drug Screenings / Terms & Agreements: Output "Yes".

RULE 4: URL & PROFILE LINK QUESTIONS
- LinkedIn URL: Output "${profile.linkedin_url || ''}".
- Portfolio / Website URL: Output "${profile.portfolio_url || profile.website || ''}".
- GitHub URL: Output "${profile.github_url || ''}".

RULE 5: OPEN-ENDED NARRATIVE QUESTIONS (Cover Letter, Why hire you, Project details, Overview)
- Generate a 2-3 sentence executive answer written in confident first-person ("I am a...").
- Tailor the answer to the candidate's core skills (${(profile.skills || []).slice(0, 6).join(', ')}) and executive summary.${failureRulesPrompt}`

      const userPrompt = `QUESTIONS TO ANSWER:
${JSON.stringify(unmappedFields.map((f, idx) => ({
  field_id: `field_${idx}`,
  selector: f.selector,
  label: f.label,
  type: f.type,
  options: f.options
})), null, 2)}`

      try {
        const answers = await this.ai.chatStructured<Record<string, any>>(
          [
            ['system', systemPrompt],
            ['human', userPrompt],
          ],
          DynamicStepSchema as any
        )

        if (answers && typeof answers === 'object') {
          const indexMap = new Map(unmappedFields.map((f, idx) => [`field_${idx}`, f]))
          const selectorMap = new Map(unmappedFields.map(f => [f.selector as string, f]))
          const successfullyFilledSelectors = new Set<string>()

          for (const [key, rawVal] of Object.entries(answers)) {
            if (!key || typeof rawVal !== 'string') continue
            const field = indexMap.get(key) || selectorMap.get(key)
            if (!field || !field.selector) continue

            const selector = field.selector
            let ans = rawVal.trim()
            if (!ans || ans.toLowerCase() === 'null') continue

            const labelLower = (field.label || '').toLowerCase()
            const isNumericField = field.type === 'number' || 
              labelLower.includes('year') || 
              labelLower.includes('experience') || 
              labelLower.includes('how many') || 
              labelLower.includes('number of') || 
              labelLower.includes('salary') || 
              labelLower.includes('pay') || 
              labelLower.includes('ctc') || 
              labelLower.includes('hourly') || 
              labelLower.includes('rate')

            if (isNumericField && field.type !== 'select-one' && field.type !== 'select' && field.type !== 'radio' && field.type !== 'checkbox') {
              let digits = sanitizeNumericValue(ans)
              if (!digits || digits === '0') {
                digits = '1' // Enforce positive experience digit (at least 1) instead of 0 or None
              }
              ans = digits
            }

            let ok = false
            if (field.type === 'select-one' || field.type === 'select') {
              ok = await FormDOMActions.selectOptionByIntent(page, selector, ans, field.options || [])
            } else if (field.type === 'radio' || field.type === 'checkbox') {
              ok = await FormDOMActions.selectRadioByIntent(page, selector, FormDOMActions.yesNo(ans) || ans)
            } else {
              ok = await FormDOMActions.fillAndVerify(page, selector, ans)
            }

            if (ok) {
              successfullyFilledSelectors.add(selector)
              logger.info('[FormAIFiller]', `🤖 AI Answered "${field.label}": "${ans}"`)
              await FormDOMActions.showInPageNotification(page, `🤖 AI Field Answered`, `"${field.label.substring(0, 25)}...": "${ans}"`)
            } else {
              // Record failed attempt for selector to avoid repeating failed values in retries
              const existingFails = failedAttemptsMap.get(selector) || []
              if (!existingFails.includes(ans)) {
                existingFails.push(ans)
                failedAttemptsMap.set(selector, existingFails)
              }
            }
            await FormDOMActions.delay(150, 300)
          }

          const remainingUnmapped = unmappedFields.filter(f => !f.selector || !successfullyFilledSelectors.has(f.selector))
          unmappedFields.length = 0
          unmappedFields.push(...remainingUnmapped)
        }
      } catch (e: any) {
        logger.warn('[FormAIFiller]', `AI dynamic form answering failed: ${e.message}`)
      }
    } else {
      console.log(`[FormAIFiller] ✅ All empty fields resolved statically from profile. Ollama LLM not needed for this step.`)
    }
  }

  /**
   * LangChain-backed Pre-Submit Form Auditor.
   * Audits active modal step fields before progress click ('Next' / 'Submit') to ensure
   * all required questions are satisfied and properly populated.
   */
  async auditStepFields(page: Page, fields: ExtractedFormField[]): Promise<{ isComplete: boolean; missingRequired: string[] }> {
    if (fields.length === 0 || page.isClosed()) return { isComplete: true, missingRequired: [] }

    const missingRequired: string[] = []

    for (const field of fields) {
      if (field.required && field.isEmpty) {
        missingRequired.push(field.label)
        logger.warn('[FormAIFiller]', `⚠️ LangChain Audit Warning: Required field "${field.label}" remains unfilled on active modal step.`)
      }
    }

    const isComplete = missingRequired.length === 0
    if (isComplete) {
      console.log(`[FormAIFiller] ✅ LangChain Pre-Submit Audit Passed: All ${fields.length} modal step fields satisfied.`)
    } else {
      console.log(`[FormAIFiller] ⚠️ LangChain Pre-Submit Audit Failed: ${missingRequired.length} required fields missing (${missingRequired.join(', ')}).`)
    }

    return { isComplete, missingRequired }
  }
}
