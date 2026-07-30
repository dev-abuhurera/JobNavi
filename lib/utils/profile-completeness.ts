
const REQUIRED = {
  work_authorized: 'Work authorization',
  requires_visa_sponsorship: 'Visa sponsorship',
  willing_to_relocate: 'Willing to relocate',
  city: 'Location / City',
  expected_salary: 'Expected salary',
  years_of_experience: 'Years of experience',
  notice_period: 'Notice period',
}

const filled = (v: any) => String(v ?? '').trim() !== ''

export function getMissingFields(profile: any): string[] {
  const data = profile?.profile_data || {}
  const missing: string[] = []

  // Resume: an uploaded file OR parsed text both count
  if (!filled(profile?.resume_path) && !filled(data.resume_text)) {
    missing.push('Resume')
  }

  // Each required preference
  for (const [key, label] of Object.entries(REQUIRED)) {
    if (!filled(data[key])) missing.push(label)
  }

  // Skills need at least one entry
  if (!data.skills?.some(filled)) {
    missing.push('Key skills')
  }

  return missing
}
