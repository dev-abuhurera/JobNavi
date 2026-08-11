
import type { NormalizedProfile } from '../types'
import { logger } from '../logger'

export type { NormalizedProfile }

export function normalizeProfile(raw: Record<string, any>): NormalizedProfile {
  // Flatten one level of common nested containers
  const containers = [
    'contact', 'contact_info', 'contactInfo',
    'personal_info', 'personalInfo',
    'profile', 'details', 'basic_info', 'basicInfo',
  ]

  const flat: Record<string, any> = { ...raw }
  for (const c of containers) {
    const nested = raw?.[c]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      for (const [k, v] of Object.entries(nested)) {
        if (flat[k] === undefined || flat[k] === null || String(flat[k]).trim() === '') {
          flat[k] = v
        }
      }
    }
  }

  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = flat[k]
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        const str = String(v).trim()
        const low = str.toLowerCase()
        // Skip generic placeholder strings like "Candidate", "User", "Test Candidate"
        if (['candidate', 'candidate name', 'user', 'user name', 'test candidate', 'null', 'undefined'].includes(low)) {
          continue
        }
        return str
      }
    }
    return ''
  }

  // Fallback extraction from resume_text if key fields missing
  const resumeStr = String(flat.resume_text || raw.resume_text || '')
  let extractedEmail = ''
  let extractedPhone = ''
  let extractedName = ''

  if (resumeStr) {
    const emailMatch = resumeStr.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    if (emailMatch) extractedEmail = emailMatch[0]

    const phoneMatch = resumeStr.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/)
    if (phoneMatch && phoneMatch[0].length >= 7) extractedPhone = phoneMatch[0]

    // Extract candidate name from top of resume text (e.g. "MUHAMMAD ABUHURERA")
    const nameLineMatch = resumeStr.split('\n')[0]?.trim()
    if (nameLineMatch) {
      const cleanNameLine = nameLineMatch.split(/\||-|–|—|\bFull-Stack\b|\bSoftware\b|\bDeveloper\b/i)[0]?.trim()
      if (cleanNameLine && cleanNameLine.length >= 3 && cleanNameLine.length <= 40 && !cleanNameLine.includes('@')) {
        extractedName = cleanNameLine
      }
    }
  }

  const profile: NormalizedProfile = {
    name: pick('full_name', 'fullName', 'display_name', 'name', 'candidate_name', 'candidateName') || extractedName,
    email: pick('email', 'email_address', 'emailAddress', 'contact_email', 'user_email') || extractedEmail,
    phone: pick(
      'phone', 'phone_number', 'phoneNumber', 'mobile', 'mobile_number',
      'contact_number', 'contactNumber', 'tel', 'whatsapp', 'whatsapp_number'
    ) || extractedPhone,
    city: pick(
      'city', 'location', 'address', 'current_location', 'currentLocation',
      'current_city', 'town', 'residence'
    ),
    linkedin_url: pick(
      'linkedin_url', 'linkedin', 'linkedinUrl', 'linkedin_profile',
      'linkedinProfile', 'linked_in', 'linkedin_link'
    ),
    portfolio_url: pick(
      'portfolio_url', 'portfolio', 'portfolioUrl', 'website',
      'personal_website', 'personalWebsite', 'site', 'portfolio_link'
    ),
    github_url: pick(
      'github_url', 'github', 'githubUrl', 'github_profile',
      'githubProfile', 'git_hub', 'github_link'
    ),
    expected_salary: pick(
      'expected_salary', 'salary_expectation', 'salary', 'expectedSalary',
      'desired_salary', 'salary_expected', 'expected_salary_pkr'
    ),
    hourly_rate: pick(
      'hourly_rate', 'hourly_rate_expectation', 'hourly_rate_usd', 'hourlyRate',
      'desired_hourly_rate', 'hourly_pay', 'hourly_wage'
    ),
    years_of_experience: pick(
      'years_of_experience', 'experience_years', 'experienceYears',
      'years_experience', 'total_experience', 'totalExperience',
      'yearsOfExperience', 'experience'
    ),
    website: pick('website', 'portfolio', 'portfolio_url', 'portfolioUrl', 'personal_website', 'personalWebsite', 'site'),
    date_of_birth: pick('date_of_birth', 'dob', 'birth_date', 'birthDate', 'dateOfBirth'),
    skills: Array.isArray(flat.skills)
      ? flat.skills
      : (Array.isArray(raw.skills) ? raw.skills : []),
    experience_summary: pick('experience_summary', 'summary', 'bio', 'about', 'about_me', 'aboutMe', 'objective'),
    resume_text: pick('resume_text', 'cv_text', 'raw_text', 'resumeText', 'extracted_text'),
    requires_visa_sponsorship: pick('requires_visa_sponsorship', 'visa_sponsorship', 'needs_sponsorship'),
    work_authorized: pick('work_authorized', 'authorized_to_work', 'work_authorization'),
    notice_period: pick('notice_period', 'noticePeriod', 'availability'),
    willing_to_relocate: pick('willing_to_relocate', 'relocate', 'relocation'),
    gender: pick('gender', 'sex'),
    ethnicity: pick('ethnicity', 'race'),
  }

  const REQUIRED_FIELDS: (keyof NormalizedProfile)[] = ['name', 'email', 'phone', 'city']
  for (const field of REQUIRED_FIELDS) {
    if (!profile[field]) {
      logger.warn('[Profile]', `Missing required field: "${field}" — form fills for this field will be skipped.`)
    }
  }

  return profile
}