// Builder portal POs (value of each lot) -> operations.portal_pos (owner, 2026-10-08). Read-only on the portals.
//   node pos.js ivory [--dry]
// --dry saves the rows to debug/ and writes nothing. Existing rows keep their revenue confirmation.
import 'dotenv/config'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const POS = { ivory: () => import('./pos/ivory.js') }
const args = process.argv.slice(2)
const name = args.find((a) => !a.startsWith('--'))
const dry = args.includes('--dry')
if (!name || !POS[name]) { console.error(`usage: node pos.js <${Object.keys(POS).join('|')}> [--dry]`); process.exit(1) }

const robot = await POS[name]()
const adapter = await import(`./adapters/${name}.js`) // same login and browser profile as the schedule robot
const debugDir = `debug/pos-${name}`
await mkdir(debugDir, { recursive: true })
const opts = { headless: true, viewport: null, args: ['--disable-blink-features=AutomationControlled'] }
let context
try { context = await chromium.launchPersistentContext(`auth/${name}-profile`, { ...opts, channel: 'chrome' }) }
catch { context = await chromium.launchPersistentContext(`auth/${name}-profile`, opts) }
const page = context.pages()[0] || (await context.newPage())
let exitCode = 0
try {
  if (adapter.homeUrl) await page.goto(adapter.homeUrl(process.env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  if (!(adapter.isLoggedIn ? await adapter.isLoggedIn(page) : false)) { console.log('Logging in…'); await adapter.login(page, process.env, { dump: async () => {} }) }
  console.log(`Reading ${name} POs`)
  const rows = await robot.scrapePOs(page)
  await writeFile(`${debugDir}/pos.json`, JSON.stringify(rows, null, 1))
  console.log(`Read ${rows.length} POs, US$ ${rows.reduce((sum, row) => sum + (row.total || 0), 0).toFixed(2)}`)
  if (dry) console.log('Dry run: nothing written.')
  else {
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { db: { schema: 'operations' }, auth: { persistSession: false, autoRefreshToken: false } })
    const now = new Date().toISOString()
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from('portal_pos').upsert(rows.slice(i, i + 500).map((row) => ({ ...row, updated_at: now })), { onConflict: 'source,order_id' })
      if (error) throw new Error(error.message)
    }
    console.log(`Upserted ${rows.length} rows into operations.portal_pos (source=${robot.meta.source})`)
  }
} catch (error) {
  console.error('FAILED:', error.message)
  await page.screenshot({ path: `${debugDir}/error.png`, fullPage: true }).catch(() => {})
  exitCode = 1
}
await context.close()
process.exit(exitCode)
