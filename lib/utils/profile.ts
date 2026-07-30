// ─────────────────────────────────────────────────────────────────
// lib/utils/profile.ts
// Profile normalization — moved from portal_automation_hybrid.ts
// so it can be imported cleanly by the worker and any future code.
// ─────────────────────────────────────────────────────────────────

import type { NormalizedProfile } from '../types'
import { logger } from '../logger'

export type { NormalizedProfile }

/**
 * Maps the raw profile_data JSONB blob (with whatever keys it happens to have)
 * into a guaranteed-key NormalizedProfile. Logs a warning for any required
 * field that ends up empty after checking all known aliases.
 *
 * Supports flat keys (raw.email) and common nested shapes:
 *   { contact: { email, phone } }
 *   { personal_info: { city, dob } }
 *   { personalInfo: { linkedin } }
 */
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
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
    }
    return ''
  }

  const profile: NormalizedProfile = {
    name: pick('name', 'full_name', 'fullName', 'candidate_name', 'candidateName', 'display_name'),
    email: pick('email', 'email_address', 'emailAddress', 'contact_email', 'user_email'),
    phone: pick(
      'phone', 'phone_number', 'phoneNumber', 'mobile', 'mobile_number',
      'contact_number', 'contactNumber', 'tel', 'whatsapp', 'whatsapp_number'
    ),
    city: pick(
      'city', 'location', 'address', 'current_location', 'currentLocation',
      'current_city', 'town', 'residence'
    ),
    linkedin_url: pick(
      'linkedin_url', 'linkedin', 'linkedinUrl', 'linkedin_profile',
      'linkedinProfile', 'linked_in', 'linkedin_link'
    ),
    expected_salary: pick(
      'expected_salary', 'salary_expectation', 'salary', 'expectedSalary',
      'desired_salary', 'salary_expected', 'expected_salary_pkr'
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