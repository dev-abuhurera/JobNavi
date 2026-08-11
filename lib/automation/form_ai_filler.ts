import { Page } from 'playwright'
import { OllamaClient } from '../ollama-client'
import { logger } from '../logger'
import { ExtractedFormField } from './form_extractor'
import { FormDOMActions } from './form_dom_actions'
import { StagehandService } from './stagehand_service'
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

  // String contains no digits (e.g. "Yes", "No", "N/A") -> return empty string
  return ''
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

  constructor(apiKeyOrOptions?: string | { host?: string; model?: string }) {
    if (typeof apiKeyOrOptions === 'object') {
      this.ai = new OllamaClient(apiKeyOrOptions)
    } else {
      this.ai = new OllamaClient()
    }
  }

  async fillFormStep(page: Page, modalFields: ExtractedFormField[], profile: any, options: FillStepOptions = {}): Promise<void> {
    if (modalFields.length === 0 || page.isClosed()) return

    const failedAttemptsMap = options.failedAttempts || new Map<string, string[]>()

    // ── STEP 1: Identify unfilled or invalidly filled questions on current step ──
    const trulyUnfilledFields = modalFields.filter(f => {
      const val = (f.currentValue || '').trim()
      const labelLower = (f.label || '').toLowerCase()
      const isNumericField = f.type === 'number' || 
        labelLower.includes('year') || 
        labelLower.includes('experience') || 
        labelLower.includes('how many') || 
        labelLower.includes('number of') || 
        labelLower.includes('salary') || 
        labelLower.includes('pay') || 
        labelLower.includes('ctc') || 
        labelLower.includes('hourly') || 
        labelLower.includes('rate')

      // If numeric field contains non-numeric text (e.g. "Yes", "No"), treat as needing correction
      if (isNumericField && f.type !== 'select-one' && f.type !== 'select' && f.type !== 'radio' && f.type !== 'checkbox') {
        const digits = sanitizeNumericValue(val)
        if (!digits || !/^\d+$/.test(digits)) {
          return true
        }
      }

      if (!f.isEmpty && val && !val.toLowerCase().startsWith('select') && !val.toLowerCase().startsWith('choose')) {
        return false  
      }
      return true
    })

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
      } else if (label.includes('phone') || label.includes('mobile') || label.includes('cell')) {
        profileValue = profile.phone || ''
      } else if (label.includes('email') || label.includes('e-mail')) {
        profileValue = profile.email || ''
      } else if (label.includes('first') && label.includes('name')) {
        profileValue = candidateName.split(' ')[0] || ''
      } else if (label.includes('last') && label.includes('name')) {
        profileValue = candidateName.split(' ').slice(1).join(' ') || ''
      } else if (label.includes('name') && !label.includes('company') && !label.includes('user') && !label.includes('project')) {
        profileValue = candidateName
      } else if (label.includes('city') || label.includes('location') || label.includes('address') || label.includes('country')) {
        profileValue = profile.city || ''
      } else if (label.includes('linkedin')) {
        profileValue = profile.linkedin_url || ''
      } else if (label.includes('github')) {
        profileValue = profile.github_url || ''
      } else if (label.includes('website') || label.includes('portfolio')) {
        profileValue = profile.portfolio_url || profile.website || ''
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

      // 1. Age Verification Questions (e.g. "Are you 18 years of age or older?")
      const isAgeQuestion = (label.includes('18') || label.includes('age') || label.includes('legal age') || label.includes('adult')) &&
        !label.includes('package') && !label.includes('page')

      if (isAgeQuestion) {
        if (field.type === 'radio' || field.type === 'checkbox') {
          await FormDOMActions.selectRadioByIntent(page, field.selector, 'yes', field.label)
        } else if (field.type === 'select-one' || field.type === 'select') {
          await FormDOMActions.selectOptionByIntent(page, field.selector, 'yes', field.options || [], field.label)
        } else {
          await FormDOMActions.fillAndVerify(page, field.selector, 'Yes', field.label)
        }
        continue
      }

      // 2. Total Overall Work Experience Questions (e.g. "Total years of work experience?")
      const isTotalExpQuestion = (label.includes('total') || label.includes('overall') || label.includes('entire') || label.includes('cumulative')) &&
        (label.includes('year') || label.includes('experience') || label.includes('yr'))

      if (isTotalExpQuestion) {
        const totalYrsStr = String(profile.years_of_experience ?? 3)
        if (field.type === 'radio' || field.type === 'checkbox') {
          await FormDOMActions.selectRadioByIntent(page, field.selector, totalYrsStr, field.label)
        } else if (field.type === 'select-one' || field.type === 'select') {
          await FormDOMActions.selectOptionByIntent(page, field.selector, totalYrsStr, field.options || [], field.label)
        } else {
          await FormDOMActions.fillAndVerify(page, field.selector, totalYrsStr, field.label)
        }
        continue
      }

      // 3. Skill-Specific Experience Questions (e.g. "How many years of Python / RAG / React experience do you have?")
      const isSkillExpQuestion = (label.includes('year') || label.includes('experience') || label.includes('yr') || label.includes('how many')) &&
        !isAgeQuestion && !isTotalExpQuestion

      if (isSkillExpQuestion) {
        const skillsExpMap: Record<string, number> = {
          ...(profile.skills_experience || {}),
          ...(options.skills_experience || {}),
        }

        const cleanLabel = label.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
        let matchedSkillYrs: number | null = null

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
            } else {
              matchedSkillYrs = profile.years_of_experience ? Number(profile.years_of_experience) : 3
            }
          }
        }

        const valueStr = String(matchedSkillYrs ?? 3)
        if (field.type === 'radio' || field.type === 'checkbox') {
          await FormDOMActions.selectRadioByIntent(page, field.selector, valueStr, field.label)
        } else if (field.type === 'select-one' || field.type === 'select') {
          await FormDOMActions.selectOptionByIntent(page, field.selector, valueStr, field.options || [], field.label)
        } else {
          await FormDOMActions.fillAndVerify(page, field.selector, valueStr, field.label)
        }
        continue
      }

      const isKnownProfileQuestion = isWorkAuth || isVisaSponsorship || isRelocation || Boolean(profileValue)

      if (isKnownProfileQuestion) {
        let filled = false
        if (field.type === 'radio' || field.type === 'checkbox') {
          const intent = profileValue || (isWorkAuth ? 'yes' : isVisaSponsorship ? 'no' : isRelocation ? 'yes' : '')
          if (intent) {
            filled = await FormDOMActions.selectRadioByIntent(page, field.selector, intent, field.label)
          }
        } else if (field.type === 'select-one' || field.type === 'select') {
          const intent = profileValue || (isWorkAuth ? 'Yes' : isVisaSponsorship ? 'No' : isRelocation ? 'Yes' : '')
          if (intent) {
            filled = await FormDOMActions.selectOptionByIntent(page, field.selector, intent, field.options || [], field.label)
          }
        } else if (profileValue) {
          filled = await FormDOMActions.fillAndVerify(page, field.selector, profileValue, field.label)
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

    const remainingForLlm = unmappedFields

    if (options.allowLlmRetry === false || remainingForLlm.length === 0) {
      return
    }

    // ── STEP 3: Pass 2 — Dynamic Stagehand AI Action Answering ──
    if (remainingForLlm.length > 0 && !page.isClosed()) {
      console.log(`[FormAIFiller] Dispatching ${remainingForLlm.length} custom form question(s) to Stagehand AI: ${remainingForLlm.map(f => `"${f.label}"`).join(', ')}`)

      for (const field of remainingForLlm) {
        if (page.isClosed()) break
        const label = field.label || 'form question'
        const actPrompt = `Fill out "${label}" using candidate profile: Name ${candidateName}, Skills ${(profile.skills || []).slice(0, 5).join(', ')}, Exp ${profile.years_of_experience || 3} yrs, City ${profile.city || ''}`
        const ok = await StagehandService.act(actPrompt)
        if (ok) {
          logger.info('[FormAIFiller]', `🤖 Stagehand Answered "${label}"`)
          await FormDOMActions.showInPageNotification(page, `🤖 Stagehand Field Answered`, `"${label.substring(0, 25)}..."`)
        }
      }
    }
  }
}
