import { Page } from 'playwright'
import { GroqRotatingClient } from '../groq-client'
import { logger } from '../logger'
import { ExtractedFormField } from './form_extractor'
import { FormDOMActions } from './form_dom_actions'
import { z } from 'zod'

export function buildDynamicStepZodSchema(fields: ExtractedFormField[]) {
  const schemaShape: Record<string, z.ZodTypeAny> = {}

  for (const field of fields) {
    if (!field.selector) continue
    const optionsText = field.options && field.options.length ? ` Available Options (Select exact match string from this list): [${field.options.map(o => `"${o}"`).join(', ')}]` : ''
    
    const isStrictlyNumeric = field.type === 'number' || (
      /how many years|years of experience|ctc|salary|compensation|lpa|lpc|pay rate|notice period/i.test(field.label) &&
      !/summary|describe|overview|tell us|why|headline|bio|about/i.test(field.label)
    )
    const numericHint = isStrictlyNumeric && !optionsText ? ' Return raw numeric digits ONLY based on candidate profile. Do NOT include words or letters.' : ''

    schemaShape[field.selector] = z.string().describe(
      `Answer for question: "${field.label}" (${field.type}).${optionsText}${numericHint}`
    )
  }

  return z.object(schemaShape)
}

export class FormAIFiller {
  private groq: GroqRotatingClient

  constructor(groqApiKey: string) {
    this.groq = new GroqRotatingClient(groqApiKey)
  }

  async fillFormStep(page: Page, modalFields: ExtractedFormField[], profile: any): Promise<void> {
    if (modalFields.length === 0 || page.isClosed()) return

    // ── STEP 1: Identify unfilled questions on current step ──
    const trulyUnfilledFields = modalFields.filter(f => {
      if (!f.isEmpty) return false
      const val = (f.currentValue || '').trim()
      if (val && !val.toLowerCase().startsWith('select') && !val.toLowerCase().startsWith('choose')) {
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

    // ── STEP 2: Pass 1 — Map User-Saved Resume Hub Preferences Only ──
    for (const field of trulyUnfilledFields) {
      if (!field.selector) continue
      const label = field.label.toLowerCase()

      // 1. Checkboxes & Radios for Visa, Work Auth, Relocate (from explicit Resume Hub settings)
      if (field.type === 'radio' || field.type === 'checkbox') {
        let desired = ''
        if (label.includes('sponsor') || label.includes('visa')) {
          desired = FormDOMActions.yesNo(profile.requires_visa_sponsorship)
        } else if (
          label.includes('authoriz') || label.includes('authorised') ||
          label.includes('legally') || label.includes('right to work') ||
          label.includes('work permit') || label.includes('eligible to work')
        ) {
          desired = FormDOMActions.yesNo(profile.work_authorized)
        } else if (label.includes('relocat') && profile.willing_to_relocate) {
          desired = FormDOMActions.yesNo(profile.willing_to_relocate)
        }

        if (desired) {
          const ok = await FormDOMActions.selectRadioByIntent(page, field.selector, desired)
          if (ok) continue
        }
        unmappedFields.push(field)
        continue
      }

      // 2. Selects for Location / Experience / Notice (matching user's saved Resume Hub fields)
      if (field.type === 'select-one' || field.type === 'select') {
        let wanted = ''
        if (label.includes('country') || label.includes('location') || label.includes('city')) {
          wanted = profile.city || ''
        } else if ((label.includes('experience') || label.includes('year') || label.includes('exp')) && profile.years_of_experience) {
          wanted = String(profile.years_of_experience)
        } else if (label.includes('notice') && profile.notice_period) {
          wanted = String(profile.notice_period)
        }

        if (wanted) {
          const ok = await FormDOMActions.selectOptionByIntent(page, field.selector, wanted, field.options || [])
          if (ok) continue
        }
        unmappedFields.push(field)
        continue
      }

      // 3. Text Fields matching User-Saved Resume Hub Data (No hardcoded fallback constants!)
      let value = ''
      if (label.includes('phone') || label.includes('mobile')) value = profile.phone || ''
      else if (label.includes('email')) value = profile.email || ''
      else if (label.includes('first') && label.includes('name')) value = candidateName.split(' ')[0] || ''
      else if (label.includes('last') && label.includes('name')) value = candidateName.split(' ').slice(1).join(' ') || ''
      else if (label.includes('name') && !label.includes('company') && !label.includes('user')) value = candidateName
      else if (label.includes('city') || label.includes('location')) value = profile.city || ''
      else if (label.includes('linkedin')) value = profile.linkedin_url || ''
      else if (label.includes('github')) value = profile.github_url || ''
      else if (label.includes('website') || label.includes('portfolio')) value = profile.portfolio_url || profile.website || ''
      else if (label.includes('notice') && profile.notice_period) value = String(profile.notice_period)
      else if ((label.includes('year') || label.includes('experience')) && profile.years_of_experience) value = String(profile.years_of_experience)
      else if ((label.includes('salary') || label.includes('compensation') || label.includes('pay') || label.includes('ctc')) && profile.expected_salary) value = String(profile.expected_salary)
      else if ((label.includes('hourly') || label.includes('rate')) && profile.hourly_rate) value = String(profile.hourly_rate)
      else if (label.includes('gender') && profile.gender) value = profile.gender
      else if (label.includes('ethnic') && profile.ethnicity) value = profile.ethnicity

      if (value) {
        const ok = await FormDOMActions.fillAndVerify(page, field.selector, value)
        if (ok) continue
      }

      // Defer all other custom questions to LangChain Groq LLM
      const isAuxiliaryField = label === 'search' || label.startsWith('search ') || label === 'filter' || label.startsWith('filter ')
      if (!isAuxiliaryField) {
        unmappedFields.push(field)
      }
    }

    // ── STEP 3: Pass 2 — Dynamic LangChain AI Answering with User Profile Data ──
    if (unmappedFields.length > 0 && !page.isClosed()) {
      console.log(`[FormAIFiller] Dispatching ${unmappedFields.length} custom form questions to LangChain Groq...`)

      const DynamicStepSchema = buildDynamicStepZodSchema(unmappedFields)

      const systemPrompt = `You are an elite, autonomous AI job application assistant acting on behalf of candidate "${candidateName}".
Your mission is to generate 100% accurate, professional, context-aware answers for job application form questions.

CANDIDATE TRUTH CONTEXT (Sourced directly from Candidate's Master Resume Hub):
- Full Name: "${candidateName}"
- Location / City: "${profile.city || ''}"
- Contact Phone: "${profile.phone || ''}"
- Contact Email: "${profile.email || ''}"
- Total Years of Professional Experience: "${profile.years_of_experience || ''}"
- Expected Annual Salary / CTC: "${profile.expected_salary || profile.current_salary || ''}"
- Expected Hourly Pay Rate: "${profile.hourly_rate || ''}"
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

RULE 1: MULTIPLE-CHOICE & DROPDOWN QUESTIONS (select-one, select, radio, checkbox)
- You MUST select an EXACT string match from the provided "Available Options" list for that field. Never invent option strings.
- For Total Experience dropdowns: Pick the range option containing candidate's actual total years of experience (${profile.years_of_experience || ''}). NEVER pick unrealistic "30+ years" options unless total experience is actually 30+.
- For Specific Skill / Tech Experience dropdowns (e.g. "Experience with React / Python / AWS"):
  * If skill is present in candidate's skills or resume: Pick the option matching candidate's skill experience (up to total experience).
  * If skill is NOT present in candidate's resume/skills: Pick the option for "0 years", "0-1 years", "None", or "No experience".

RULE 2: NUMERIC & COMPENSATION QUESTIONS
- Total Years of Experience Questions: Use candidate's actual total years of experience ("${profile.years_of_experience || ''}").
- Specific Skill Experience Questions: If skill is in resume/skills, output relevant years of experience. If skill is unlisted, output "0".
- Salary / CTC Questions: Output candidate's expected annual salary ("${profile.expected_salary || profile.current_salary || ''}").
- Hourly Rate Questions: Output candidate's expected hourly rate ("${profile.hourly_rate || ''}").
- Notice Period Questions: Output candidate's notice period ("${profile.notice_period || ''}"). CRITICAL: Notice period (e.g. 30 days) is NOT years of experience.
- Format for raw numeric fields: Output DIGITS ONLY (e.g. "3", "80000", "30"). Do NOT include currency symbols ($/€/₹/Rs), letters, or range punctuation.

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
- Tailor the answer to the candidate's core skills (${(profile.skills || []).slice(0, 6).join(', ')}) and executive summary.`

      const userPrompt = `QUESTIONS TO ANSWER:
${JSON.stringify(unmappedFields.map(f => ({
  selector: f.selector,
  label: f.label,
  type: f.type,
  options: f.options
})), null, 2)}`

      try {
        const answers = await this.groq.chatStructured<Record<string, any>>(
          [
            ['system', systemPrompt],
            ['human', userPrompt],
          ],
          DynamicStepSchema as any
        )

        if (answers && typeof answers === 'object') {
          const allowedMap = new Map(unmappedFields.map(f => [f.selector as string, f]))
          const successfullyFilledSelectors = new Set<string>()

          for (const [selector, rawVal] of Object.entries(answers)) {
            if (!selector || typeof rawVal !== 'string') continue
            const field = allowedMap.get(selector)
            if (!field) continue

            let ans = rawVal.trim()
            if (!ans || ans.toLowerCase() === 'null') continue

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
              logger.info('[FormAIFiller]', `🤖 LangChain Answered "${field.label}": "${ans}"`)
            }
            await FormDOMActions.delay(150, 300)
          }

          const remainingUnmapped = unmappedFields.filter(f => !f.selector || !successfullyFilledSelectors.has(f.selector))
          unmappedFields.length = 0
          unmappedFields.push(...remainingUnmapped)
        }
      } catch (e: any) {
        logger.warn('[FormAIFiller]', `LangChain dynamic form answering failed: ${e.message}`)
      }
    } else {
      console.log(`[FormAIFiller] ✅ All empty fields resolved statically from profile. Groq LLM not needed for this step.`)
    }
  }
}
