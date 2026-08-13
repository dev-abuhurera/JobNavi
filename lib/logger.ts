import type { LogLevel } from './types'

const ICONS: Record<LogLevel, string> = {
  info:    'ℹ️ ',
  success: '✅',
  warn:    '⚠️ ',
  error:   '❌',
}

function formatMessage(level: LogLevel, tag: string, message: string): string {
  const ts = new Date().toISOString()
  const icon = ICONS[level]
  return `[${ts}] ${icon} ${tag} ${message}`
}

export const logger = {
  info(tag: string, message: string): void {
    console.log(formatMessage('info', tag, message))
  },

  success(tag: string, message: string): void {
    console.log(formatMessage('success', tag, message))
  },

  warn(tag: string, message: string, err?: Error | unknown): void {
    const extra = err instanceof Error ? ` — ${err.message}` : ''
    console.warn(formatMessage('warn', tag, message + extra))
  },

  error(tag: string, message: string, err?: Error | unknown): void {
    const extra = err instanceof Error ? ` — ${err.message}` : ''
    console.error(formatMessage('error', tag, message + extra))
    if (err instanceof Error && err.stack && process.env.NODE_ENV !== 'production') {
      console.error(err.stack)
    }
  },
}
