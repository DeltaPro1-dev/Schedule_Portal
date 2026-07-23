import 'dotenv/config'
import { chromium } from 'playwright'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { getOrgId, upsertSchedules } from './lib/supabase.js'
import { toRow } from './lib/normalize.js'

const ADAPTERS = {
  supplypro: () => import('./adapters/supplypro.js'),
}

const args = process.argv.slice(2)
const name = args.find((a) => !a.startsWith('--'))
const headful = args.includes('--headful')
const persist = args.includes('--persist') // save/reuse the login session (helps with MFA)

if (!name || !ADAPTERS[name]) {
  console.error(`usage: node run.js <adapter> [--headful] [--persist]\n  adapters: ${Object.keys(ADAPTERS).join(', ')}`)
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const debugDir = `debug/${name}-${stamp}`
const authFile = `auth/${name}.json`
const exists = async (p) => access(p).then(() => true).catch(() => false)

const mod = await ADAPTERS[name]()
const env = process.env

await mkdir(debugDir, { recursive: true })
await mkdir('auth', { recursive: true })

const browser = await chromium.launch({ headless: !headful })
const reuse = persist && (await exists(authFile))
const context = await browser.newContext(reuse ? { storageState: authFile } : {})
const page = await context.newPage()

async function dump(tag) {
  try {
    await page.screenshot({ path: `${debugDir}/${tag}.png`, fullPage: true })
    await writeFile(`${debugDir}/${tag}.html`, await page.content())
  } catch (e) {
    console.warn(`dump(${tag}) failed:`, e.message)
  }
}

try {
  if (reuse && env.SUPPLYPRO_URL) {
    await page.goto(env.SUPPLYPRO_URL, { waitUntil: 'domcontentloaded' }).catch(() => {})
  }
  const loggedIn = mod.isLoggedIn ? await mod.isLoggedIn(page) : false
  if (!loggedIn) {
    console.log('Logging in…')
    await mod.login(page, env)
  }
  if (persist) await context.storageState({ path: authFile })

  console.log('Scraping…')
  const parsed = await mod.scrape(page, { dump, env })
  console.log(`Extracted ${parsed.length} rows`)
  await writeFile(`${debugDir}/parsed.json`, JSON.stringify(parsed, null, 2))

  const organization_id = await getOrgId()
  const rows = parsed
    .filter((p) => p.external_id)
    .map((p) => toRow({ source: mod.meta.source, organization_id, parsed: p, scheduled_date: p.scheduled_date, status: p.status, raw: p.raw }))

  const { count } = await upsertSchedules(rows)
  console.log(`Upserted ${count} rows into schedule_portal.imported_schedules (source=${mod.meta.source})`)
  console.log(`Debug artifacts: integrations/${debugDir}`)
} catch (e) {
  console.error('Run failed:', e.message)
  await dump('error')
  process.exitCode = 1
} finally {
  await browser.close()
}
