// ─────────────────────────────────────────────────────────────────
// lib/config.ts
// Validates all required environment variables at startup.
// Call validateConfig() once at the top of scripts/worker.ts.
// ─────────────────────────────────────────────────────────────────

export interface AppConfig {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  groqApiKey: string
  chromeProfilePath: string
  chromeExecutablePath: string
}

const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GROQ_API_KEY',
] as const

export function validateConfig(): AppConfig {
  const missing = REQUIRED_VARS.filter(v => !process.env[v]?.trim())

  if (missing.length > 0) {
    console.error(
      `\n[Config] ❌ Missing required environment variables:\n` +
      missing.map(v => `  • ${v}`).join('\n') +
      `\n\nCopy .env.example to .env.local and fill in the values.\n`
    )
    process.exit(1)
  }

  return {
    supabaseUrl:           process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    groqApiKey:            process.env.GROQ_API_KEY!,

    // Browser paths — override via env for portability across machines
    chromeProfilePath: process.env.CHROME_PROFILE_PATH ||
      `${process.env.HOME || '/root'}/.config/google-chrome/Default`,

    chromeExecutablePath: process.env.CHROME_EXECUTABLE ||
      '/usr/bin/google-chrome',
  }
}
