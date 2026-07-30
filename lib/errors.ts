// ─────────────────────────────────────────────────────────────────
// lib/errors.ts
// Typed error classes — replace throw new Error(string) pattern.
// Callers can now use `instanceof` to handle errors by type.
// ─────────────────────────────────────────────────────────────────

export class JobNaviError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

/** LinkedIn session has expired — user must reconnect in Settings. */
export class SessionExpiredError extends JobNaviError {
  constructor(portal: string = 'linkedin') {
    super(`Session expired for ${portal}. Please reconnect in Settings.`)
  }
}

/** No resume file found in Supabase Storage or local fallback paths. */
export class ResumeNotFoundError extends JobNaviError {
  constructor(userId: string) {
    super(
      `No resume found for user ${userId}. Upload your resume in Resume Hub before applying.`
    )
  }
}

/** The Easy Apply button could not be located on the job page. */
export class NoEasyApplyButtonError extends JobNaviError {
  constructor(url: string) {
    super(`No Easy Apply button found on page: ${url}`)
  }
}

/** The Easy Apply button was clicked but the modal did not open. */
export class ModalDidNotOpenError extends JobNaviError {
  constructor() {
    super('Easy Apply button clicked but modal did not open after 2 attempts.')
  }
}

/** Job URL is invalid, a search page, or an aggregator listing. */
export class InvalidJobUrlError extends JobNaviError {
  constructor(url: string) {
    super(`Invalid or aggregator URL — cannot automate: ${url}`)
  }
}

/** User profile not found in database. */
export class ProfileNotFoundError extends JobNaviError {
  constructor(userId: string) {
    super(`User profile not found for ${userId}. Please upload your CV first.`)
  }
}

/** Application type is not supported by the automation engine. */
export class UnsupportedApplicationTypeError extends JobNaviError {
  constructor(type: string) {
    super(`Application type "${type}" is not supported by the automation engine.`)
  }
}
