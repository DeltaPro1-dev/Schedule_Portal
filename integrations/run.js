import 'dotenv/config'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { getOrgId, upsertSchedules } from './lib/supabase.js'
import { toRow } from './lib/normalize.js'

const ADAPTERS = {
  supplypro: () => import('./adapters/supplypro.js'),
  buildertrend: () => import('./adapters/buildertrend.js'),
}

const args = process.argv.slice(2)
const name = args.find((a) => !a.startsWith('--'))
const headful = args.includes('--headful')

if (!name || !ADAPTERS[name]) {
  console.error(`usage: node run.js <adapter> [--headful]\n  adapters: ${Object.keys(ADAPTERS).join(', ')}`)
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const debugDir = `debug/${name}-${stamp}`
const profileDir = `auth/${name}-profile` // persistent Chrome profile: session + captcha trust

const mod = await ADAPTERS[name]()
const env = process.env
await mkdir(debugDir, { recursive: true })
await mkdir('auth', { recursive: true })

// Real Chrome + a persistent per-adapter profile, with the automation flag off, so
// reCAPTCHA behaves (passes with one click) and the trusted session persists across
// runs. Falls back to bundled Chromium if Chrome isn't installed.
async function launch() {
  const opts = { headless: !headful, viewport: null, args: ['--disable-blink-features=AutomationControlled'] }
  try { return await chromium.launchPersistentContext(profileDir, { ...opts, channel: 'chrome' }) }
  catch { return await chromium.launchPersistentContext(profileDir, opts) }
}
const context = await launch()
const page = context.pages()[0] || (await context.newPage())

async function dump(tag) {
  try {
    await page.screenshot({ path: `${debugDir}/${tag}.png`, fullPage: true })
    await writeFile(`${debugDir}/${tag}.html`, await page.content())
  } catch (e) {
    console.warn(`dump(${tag}) failed:`, e.message)
  }
}

try {
  if (mod.homeUrl) await page.goto(mod.homeUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  const loggedIn = mod.isLoggedIn ? await mod.isLoggedIn(page) : false
  if (!loggedIn) {
    console.log('Logging in…')
    await mod.login(page, env, { dump })
  }

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
  await context.close()
}
