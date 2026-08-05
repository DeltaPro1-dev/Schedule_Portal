// Assisted calibration helper. Opens a portal in a real Chrome window (headful,
// using the adapter's persistent profile), auto-logs-in where the adapter supports
// it, then snapshots the CURRENT page every few seconds while YOU navigate to the
// schedule you want. Afterwards, inspect debug/explore-<name>/ and pick the snapshot
// that shows the schedule — that DOM is what the parser gets written against.
//
//   node explore.js <portal> [--minutes=4] [--url=<startUrl>]
//
// Example: node explore.js arive        → logs into Arive, you pick a development /
//          open the schedule, and it captures the page as you go.
import 'dotenv/config'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const ADAPTERS = {
  supplypro: () => import('./adapters/supplypro.js'),
  buildertrend: () => import('./adapters/buildertrend.js'),
  ivory: () => import('./adapters/ivory.js'),
  oakwood: () => import('./adapters/oakwood.js'),
  arive: () => import('./adapters/arive.js'),
  element: () => import('./adapters/element.js'),
  visionary: () => import('./adapters/visionary.js'),
  paskr: () => import('./adapters/paskr.js'),
  richmond: () => import('./adapters/richmond.js'),
  buildright: () => import('./adapters/buildright.js'),
  pulte: () => import('./adapters/pulte.js'),
  davidweekley: () => import('./adapters/davidweekley.js'),
  candlelight: () => import('./adapters/candlelight.js'),
  dai: () => import('./adapters/dai.js'),
  fieldstone: () => import('./adapters/fieldstone.js'),
  concord: () => import('./adapters/concord.js'),
}

const args = process.argv.slice(2)
const name = args.find((a) => !a.startsWith('--'))
const minutes = Number((args.find((a) => a.startsWith('--minutes=')) || '').split('=')[1]) || 4
const urlArg = (args.find((a) => a.startsWith('--url=')) || '').split('=')[1] || null
const clickText = (args.find((a) => a.startsWith('--click=')) || '').split('=')[1] || null

if (!name || !ADAPTERS[name]) {
  console.error(`usage: node explore.js <portal> [--minutes=N] [--url=...]\n  portals: ${Object.keys(ADAPTERS).join(', ')}`)
  process.exit(1)
}

const mod = await ADAPTERS[name]()
const env = process.env
const debugDir = `debug/explore-${name}`
const profileDir = `auth/${name}-profile`
await mkdir(debugDir, { recursive: true })
await mkdir('auth', { recursive: true })

async function launch() {
  const opts = { headless: false, viewport: null, args: ['--disable-blink-features=AutomationControlled'] }
  try { return await chromium.launchPersistentContext(profileDir, { ...opts, channel: 'chrome' }) }
  catch { return await chromium.launchPersistentContext(profileDir, opts) }
}
const context = await launch()
const page = context.pages()[0] || (await context.newPage())

async function snap(tag) {
  const stamp = tag
  try {
    await writeFile(`${debugDir}/${stamp}.url.txt`, page.url())
    await writeFile(`${debugDir}/${stamp}.html`, await page.content())
    await page.screenshot({ path: `${debugDir}/${stamp}.png`, fullPage: true })
  } catch { /* page mid-navigation — skip this tick */ }
}

try {
  const start = urlArg || (mod.homeUrl ? mod.homeUrl(env) : 'about:blank')
  await page.goto(start, { waitUntil: 'domcontentloaded' }).catch(() => {})

  const loggedIn = mod.isLoggedIn ? await mod.isLoggedIn(page).catch(() => false) : false
  if (!loggedIn && mod.login) {
    console.log('Attempting auto-login… (finish any MFA/captcha in the window by hand)')
    await mod.login(page, env, { dump: snap }).catch((e) => console.warn(`auto-login note: ${e.message}`))
  }

  // Optional: click a link/tab by its text right after login (e.g. --click="Full Schedule")
  if (clickText) {
    const link = await page.$(`a:has-text("${clickText}"), button:has-text("${clickText}")`).catch(() => null)
    if (link) { await link.click().catch(() => {}); await page.waitForLoadState('networkidle').catch(() => {}); console.log(`clicked "${clickText}"`) }
    else console.warn(`--click: no "${clickText}" link found on the landing page`)
  }

  const ticks = Math.max(1, Math.round((minutes * 60) / 6))
  console.log(`\n▶ Browser is open. Navigate to the SCHEDULE you want (pick a development, open the calendar/list, etc.).`)
  console.log(`  I'll snapshot the screen every 6s for ~${minutes} min → integrations/${debugDir}/`)
  console.log(`  Leave the target page on screen; you can close the window early when done.\n`)
  for (let i = 1; i <= ticks; i++) {
    await page.waitForTimeout(6000)
    if (context.pages().length === 0) { console.log('Window closed — stopping.'); break }
    const idx = String(i).padStart(2, '0')
    await snap(`t${idx}`)
    process.stdout.write(`  · snapshot ${idx} (${page.url().slice(0, 70)})\n`)
  }
  console.log(`\n✔ Done. Snapshots in integrations/${debugDir}/ — tell Claude which page had the schedule.`)
} catch (e) {
  console.error('Explore failed:', e.message)
} finally {
  await context.close().catch(() => {})
}
