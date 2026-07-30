import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { PortalAutomationHybrid } from '@/lib/automation/portal_automation_hybrid'
import { validateConfig } from '@/lib/config'
import { logger } from '@/lib/logger'

const serviceClient = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const activeSessions = new Set<string>()

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { portal } = await req.json()
  if (!portal) {
    return NextResponse.json({ error: 'portal required' }, { status: 400 })
  }

  const userId = user.id
  const key = `${userId}:${portal}`
  if (activeSessions.has(key)) {
    return NextResponse.json({
      status: 'already_connecting',
      message: 'Login window is already open. Please complete the login in the browser window.'
    })
  }

  activeSessions.add(key)

  const cfg = validateConfig()
  const automation = new PortalAutomationHybrid(serviceClient, cfg.groqApiKey)

  automation.startLoginSession(userId, portal)
    .then(success => {
      activeSessions.delete(key)
      if (success) {
        logger.success('[API]', `Session saved for ${portal} (user: ${userId})`)
      } else {
        logger.warn('[API]', `Login timed out for ${portal} (user: ${userId})`)
      }
    })
    .catch(err => {
      activeSessions.delete(key)
      logger.error('[API]', `startLoginSession error for ${portal}:`, err)
    })

  return NextResponse.json({
    status: 'connecting',
    message: `A browser window has opened. Please log in to ${portal} and the session will be saved automatically.`
  })
}