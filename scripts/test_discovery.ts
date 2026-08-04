import { PlaywrightDiscovery } from '../lib/automation/playwright_discovery'
import { logger } from '../lib/logger'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function testDiscovery() {
  logger.info('[Test]', 'Starting Playwright direct LinkedIn discovery test...')
  const jobs = await PlaywrightDiscovery.discoverJobs(['React Developer', 'Full Stack Developer'], 'Remote')
  logger.info('[Test]', `Successfully discovered ${jobs.length} jobs via Playwright:`)
  console.log(JSON.stringify(jobs.slice(0, 5), null, 2))
}

testDiscovery().catch(err => {
  logger.error('[Test]', `Discovery test failed: ${err.message}`)
  process.exit(1)
})
