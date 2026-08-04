// ─────────────────────────────────────────────────────────────────
// lib/types/index.ts
// Single source of truth for all shared types across the application.
// ─────────────────────────────────────────────────────────────────

// ── Status / Classification Enums ────────────────────────────────

export type ApplicationStatus =
  | 'pending'
  | 'applied'
  | 'unconfirmed'
  | 'failed'
  | 'skipped'
  | 'session_expired'
  | 'no_apply_button'

export type ApplicationType =
  | 'linkedin_easy_apply'
  | 'email_outreach'
  | 'manual'

export type JobStatus =
  | 'discovered'
  | 'approved'
  | 'applied'
  | 'rejected'
  | 'skipped'

export type LogLevel = 'info' | 'success' | 'error' | 'warn'

// ── Job ──────────────────────────────────────────────────────────

export interface Job {
  id?: string | number
  user_id?: string
  title: string
  company: string
  location: string
  description?: string
  source_url: string
  source: string
  tech_stack?: string[]
  fit_score?: number
  recruiter_email?: string | null
  posting_date?: string | null
  application_type?: ApplicationType | string
  status?: JobStatus | string
  created_at?: string
}

// ── Profile ──────────────────────────────────────────────────────

/**
 * Canonical profile shape used by all form-filling code.
 * Produced by normalizeProfile() from the raw Supabase JSONB blob.
 */
export interface NormalizedProfile {
  name: string
  email: string
  phone: string
  city: string
  linkedin_url: string
  portfolio_url: string
  github_url: string
  expected_salary: string
  hourly_rate: string
  years_of_experience: string
  website: string
  date_of_birth: string
  skills: string[]
  experience_summary: string
  resume_text: string
  requires_visa_sponsorship: string
  work_authorized: string
  notice_period: string
  willing_to_relocate: string
  gender: string
  ethnicity: string
}

// ── Form Filling ─────────────────────────────────────────────────

export interface FormField {
  name: string
  selector: string
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'file'
}

export interface FormAnalysis {
  fields: FormField[]
}

export interface ModalField {
  selector: string | null
  type: string
  label: string
  currentValue: string
  isEmpty: boolean
  required: boolean
  options?: string[]
}

// ── Application Result ───────────────────────────────────────────

export interface ApplicationResult {
  status: ApplicationStatus | string
  screenshot?: string
  message?: string
}

// ── Activity Log ─────────────────────────────────────────────────

export interface ActivityLog {
  id?: string | number
  user_id: string
  msg: string
  level: LogLevel
  created_at?: string
}
