// Builder portal payments -> operations.portal_payments (owner, 2026-10-08). Read-only on the portals.
//   node payments.js oakwood [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--dry]
// Default window: the last 90 days of payment dates. --dry saves the rows to debug/ and writes nothing.
import 'dotenv/config'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const PAYMENTS = { oakwood: () => import('./payments/oakwood.js') }
const args = process.argv.slice(2)
const name = args.find((a) => !a.startsWith('--'))
const opt = (key) => (args.find((a) => a.startsWith(`--${key}=`)) || '').split('=')[1] || null
const dry = args.includes('--dry')
if (!name || !PAYMENTS[name]) { console.error(`usage: node payments.js <${Object.keys(PAYMENTS).join('|')}> [--from=] [--to=] [--dry]`); process.exit(1) }

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date())
const back = (days) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10) }
const from = opt('from') || back(90)
const to = opt('to') || today

const payments = await PAYMENTS[name]()
const adapter = await import(`./adapters/${name}.js`) // same login and browser profile as the schedule robot
const debugDir = `debug/payments-${name}`
await mkdir(debugDir, { recursive: true })
const opts = { headless: true, viewport: null, args: ['--disable-blink-features=AutomationControlled', '--window-size=1600,1000'] }
let context
try { context = await chromium.launchPersistentContext(`auth/${name}-profile`, { ...opts, channel: 'chrome' }) }
catch { context = await chromium.launchPersistentContext(`auth/${name}-profile`, opts) }
const page = context.pages()[0] || (await context.newPage())
let exitCode = 0
try {
  if (adapter.homeUrl) await page.goto(adapter.homeUrl(process.env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  if (!(adapter.isLoggedIn ? await adapter.isLoggedIn(page) : false)) { console.log('Logging in…'); await adapter.login(page, process.env, { dump: async () => {} }) }
  console.log(`Reading ${name} payments paid ${from}..${to}`)
  const rows = await payments.scrapePayments(page, { from, to })
  await writeFile(`${debugDir}/payments.json`, JSON.stringify(rows, null, 1))
  const total = rows.reduce((sum, row) => sum + (row.amount || 0), 0)
  console.log(`Read ${rows.length} paid POs, US$ ${total.toFixed(2)}, ${new Set(rows.map((r) => r.check_number).filter(Boolean)).size} checks`)
  if (dry) console.log('Dry run: nothing written.')
  else {
    const { supabase } = await import('./lib/supabase.js')
    let written = 0
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await supabase.schema('public').rpc('portal_payments_upsert', { p_source: payments.meta.source, p_rows: rows.slice(i, i + 500) })
      if (error) throw new Error(error.message)
      written += data ?? 0
    }
    console.log(`Upserted ${written} rows into operations.portal_payments (source=${payments.meta.source})`)
  }
} catch (error) {
  console.error('FAILED:', error.message)
  await page.screenshot({ path: `${debugDir}/error.png`, fullPage: true }).catch(() => {})
  exitCode = 1
}
await context.close()
process.exit(exitCode)
