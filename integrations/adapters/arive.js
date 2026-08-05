// Arive Homes adapter. Arive runs on IHMS web (arr.ihmsweb.com, a classic CGI app,
// ihmsweb.exe). The vendor calendar (pgm=marwbvt) is a week view: each day carries
// job cards shaped like
//   "VT 32001011 (5132 N Vario Alley Block/Lot: 03/011) - NHP Final Cleaning"
// i.e. <builderCode> <jobNo> (<address> Block/Lot: <block>/<lot>) - <service>.
//
// We read the calendar in DOM order, tracking the current day header (weekday +
// day-of-month), and resolve each day-of-month to a full date near "today".
// First-pass login selectors/parse — calibrate with the --headful dump.
import { serviceType } from '../lib/normalize.js'
import { baseDate, iso, addDays } from '../lib/dates.js'

export const meta = { source: 'arive', label: 'Arive Homes' }

const BASE = 'https://arr.ihmsweb.com/cgi-bin/ihmsweb.exe'
const baseOf = (env) => env.ARIVE_BASE_URL || BASE
const calendarUrl = (env) => `${baseOf(env)}?pgm=marwbvt`
// "Full Schedule" is the COMBINED, all-developments flat list — the scrape target.
// (marwbvt is a per-development calendar picker.) Override via ARIVE_SCHEDULE_URL.
const scheduleUrl = (env) => env.ARIVE_SCHEDULE_URL || `${baseOf(env)}?table=2&pgm=marwbvu&fullSched=1`
export const homeUrl = calendarUrl

export async function isLoggedIn(page) {
  const hasPw = await page.$('input[type="password"]').catch(() => null)
  if (hasPw) return false
  // logged in when the app chrome is present (nav tabs Dashboard/Scheduling/Profile)
  const body = (await page.content().catch(() => '')) || ''
  return /Scheduling/i.test(body) && /ihmsweb/i.test(page.url())
}

export async function login(page, env, { dump } = {}) {
  if (!env.ARIVE_USER || !env.ARIVE_PASS) throw new Error('ARIVE_USER and ARIVE_PASS are required in integrations/.env')
  await page.goto(baseOf(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForSelector('input[type="password"]', { timeout: 25000 }).catch(() => {})
  const user =
    (env.ARIVE_SEL_USER && (await page.$(env.ARIVE_SEL_USER))) ||
    (await page.$('input[name*="user" i], input[name*="login" i], input[type="text"]'))
  const pass =
    (env.ARIVE_SEL_PASS && (await page.$(env.ARIVE_SEL_PASS))) ||
    (await page.$('input[type="password"]'))
  if (!user || !pass) { if (dump) await dump('login-stuck'); throw new Error('Arive login fields not found — calibrate selectors with --headful.') }
  await user.fill(env.ARIVE_USER)
  await pass.fill(env.ARIVE_PASS)
  const submit =
    (env.ARIVE_SEL_SUBMIT && (await page.$(env.ARIVE_SEL_SUBMIT))) ||
    (await page.$('input[type="submit"], button[type="submit"], input[value*="Login" i], button:has-text("Login")'))
  if (submit) await submit.click().catch(() => {})
  else await page.keyboard.press('Enter')
  await page.waitForLoadState('networkidle').catch(() => {})
  if (!(await isLoggedIn(page))) { if (dump) await dump('login-stuck'); throw new Error('Arive login not completed — run --headful and finish it once.') }
}

// Walk the calendar in document order → [{ dayNum, cards:[rawCardText] }].
async function extractDays(page) {
  return page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    const WD = /^(sun|mon|tue|wed|thu|thr|fri|sat)[a-z]*$/i
    const lines = norm(document.body.innerText).length
      ? document.body.innerText.split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
      : []
    const days = []
    let cur = null
    let pendingWeekday = false
    for (const line of lines) {
      if (WD.test(line)) { pendingWeekday = true; continue }
      if (pendingWeekday && /^\d{1,2}$/.test(line)) { cur = { dayNum: parseInt(line, 10), buf: [] }; days.push(cur); pendingWeekday = false; continue }
      pendingWeekday = false
      // combined "Mon 20" on one line
      const m = line.match(/^(sun|mon|tue|wed|thu|thr|fri|sat)[a-z]*\s+(\d{1,2})$/i)
      if (m) { cur = { dayNum: parseInt(m[2], 10), buf: [] }; days.push(cur); continue }
      if (cur) cur.buf.push(line)
    }
    return days.map((d) => ({ dayNum: d.dayNum, blob: d.buf.join(' ') }))
  })
}

// Resolve a day-of-month to a full ISO date nearest to `base`.
function resolveDate(dayNum, base) {
  for (let off = -7; off <= 21; off++) {
    const d = addDays(base, off)
    if (d.getDate() === dayNum) return iso(d)
  }
  return null
}

const CARD = /([A-Z]{1,4})\s+(\d{5,})\s*\(([^)]*?)\s*Block\/Lot:\s*([0-9A-Za-z]+)\s*\/\s*([0-9A-Za-z]+)\s*\)\s*-\s*([^\n]+?)(?=\s*(?:[A-Z]{1,4}\s+\d{5,}\s*\()|$)/g

export async function scrape(page, { dump, env = {} }) {
  await page.goto(calendarUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  if (!(await isLoggedIn(page))) {
    await login(page, env, { dump })
  }
  // Go straight to the combined Full Schedule list (all developments).
  await page.goto(scheduleUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(1500)
  if (dump) await dump('schedule')

  const base = baseDate(env)
  const rows = []
  const seen = new Set()

  // The list carries the same card grammar as the calendar:
  //   <builderCode> <jobNo> (<address> Block/Lot: <block>/<lot>) - <service>
  // plus a date per row. We pull day blobs (calendar shape) AND fall back to a flat
  // scan tagging each card with the nearest preceding date on the page.
  const days = await extractDays(page)
  for (const day of days) {
    const scheduled_date = resolveDate(day.dayNum, base)
    if (!scheduled_date) continue
    pushCards(day.blob, scheduled_date, rows, seen)
  }

  if (!rows.length) {
    // Flat fallback: scan the whole page text, tracking the last seen date token.
    const text = await page.evaluate(() => document.body.innerText).catch(() => '')
    const DATE = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/
    let curDate = null
    for (const line of text.split('\n').map((s) => s.replace(/\s+/g, ' ').trim())) {
      const dm = line.match(DATE)
      if (dm) {
        let [, mm, dd, yy] = dm
        if (yy.length === 2) yy = '20' + yy
        curDate = `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
      }
      if (curDate) pushCards(line, curDate, rows, seen)
    }
  }

  if (!rows.length) console.warn('Arive: no jobs parsed. Inspect debug/arive-*/schedule.html — set ARIVE_SCHEDULE_URL or adjust the CARD pattern.')
  return rows
}

function pushCards(blob, scheduled_date, rows, seen) {
  let m
  CARD.lastIndex = 0
  while ((m = CARD.exec(blob))) {
    const [, code, jobNo, address, block, lot, serviceRaw] = m
    const service = serviceRaw.replace(/\s+\d+\s*$/, '').trim() // strip trailing count badge
    const external_id = `arive:${jobNo}:${service}`.slice(0, 200)
    if (seen.has(external_id)) continue
    seen.add(external_id)
    rows.push({
      external_id,
      builder: 'Arive Homes',
      community: code || null,
      subdivision: code || null,
      lot,
      block,
      address: address.trim() || null,
      activity: service,
      service_type: serviceType(service),
      scheduled_date,
      builder_order_no: jobNo,
      status: null,
      raw: { code, jobNo, address: address.trim(), block, lot, service },
    })
  }
}
