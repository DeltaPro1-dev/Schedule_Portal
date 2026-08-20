// Arive Homes adapter. Arive runs on IHMS web (arr.ihmsweb.com, classic CGI,
// ihmsweb.exe). The vendor calendar (pgm=marwbvt) is a MONTH view:
//   - month navigation is a URL param: &Month=MMDDYYYY (first of month),
//   - each day is a cell `span.ihmscalendarday` whose icon is images/calendar/<day>.png,
//   - clicking a day loads that day's job cards as `.oneDayScheduleDesc` collapsibles,
//     each headed by  "<code> <jobNo> (<address> Block/Lot: <b>/<l>) - <service>".
// Delta only needs the NEXT day (Fri → Sat+Sun+Mon), so we open each target day and
// read its cards. Login verified live; calendar flow calibrated from the assisted dump.
import { serviceType } from '../lib/normalize.js'
import { baseDate, iso, targetDates } from '../lib/dates.js'

export const meta = { source: 'arive', label: 'Arive Homes' }

const BASE = 'https://arr.ihmsweb.com/cgi-bin/ihmsweb.exe'
const baseOf = (env) => env.ARIVE_BASE_URL || BASE
// developmentcode=00 = ALL developments for the company — this bypasses the
// "Select/Change Development" picker and lands straight on the month calendar.
const calendarUrl = (env) =>
  `${baseOf(env)}?pgm=marwbvt&companycode=${env.ARIVE_COMPANY || '010'}&developmentcode=${env.ARIVE_DEV || '00'}`
export const homeUrl = calendarUrl

// Month param the calendar expects for a given date: MM + '01' + YYYY.
function monthParam(d) {
  return `${String(d.getMonth() + 1).padStart(2, '0')}01${d.getFullYear()}`
}

export async function isLoggedIn(page) {
  const hasPw = await page.$('input[type="password"]').catch(() => null)
  if (hasPw) return false
  const body = (await page.content().catch(() => '')) || ''
  return /Scheduling|ihmscalendar|marwbvt/i.test(body) && /ihmsweb/i.test(page.url())
}

export async function login(page, env, { dump } = {}) {
  if (!env.ARIVE_USER || !env.ARIVE_PASS) throw new Error('ARIVE_USER and ARIVE_PASS are required in integrations/.env')
  await page.goto(baseOf(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForSelector('input[type="password"]', { timeout: 25000 }).catch(() => {})
  const user =
    (env.ARIVE_SEL_USER && (await page.$(env.ARIVE_SEL_USER))) ||
    (await page.$('input[name*="user" i], input[name*="login" i], input[type="text"]'))
  const pass = (env.ARIVE_SEL_PASS && (await page.$(env.ARIVE_SEL_PASS))) || (await page.$('input[type="password"]'))
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

// One collapsible heading per job: "<code> <jobNo> (<address> Block/Lot: <b>/<l>) - <service>"
const CARD = /^([A-Z]{1,4})\s+(\d{5,})\s*\(\s*(.+?)\s*Block\/Lot:\s*([0-9A-Za-z]+)\s*\/\s*([0-9A-Za-z]+)\s*\)\s*-\s*(.+)$/

// Read the job cards currently shown for the selected day, with each card's detail link.
async function extractDayCards(page) {
  return page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    const out = []
    for (const h of document.querySelectorAll('.oneDayScheduleDesc, .ui-collapsible-heading')) {
      const text = norm(h.innerText)
      if (!/Block\/Lot/i.test(text)) continue
      const coll = h.closest('.ui-collapsible') || h.parentElement
      const link = coll?.querySelector('a[href*="marwjobs"][href*="housenumber"]')?.getAttribute('href') || null
      out.push({ text, href: link })
    }
    // de-dupe identical headings
    const seen = new Set()
    return out.filter((o) => (seen.has(o.text) ? false : seen.add(o.text)))
  })
}

async function openDay(page, day) {
  // Click the calendar cell whose icon is images/calendar/<day>.png
  const cell = page.locator(`.ihmscalendarday:has(img[src*="/${day}.png"]), img.ihmscalicon[src*="/${day}.png"]`).first()
  if (!(await cell.count())) return false
  await cell.click().catch(() => {})
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1200)
  return true
}

export async function scrape(page, { dump, env = {} }) {
  await page.goto(calendarUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  if (!(await isLoggedIn(page))) {
    await login(page, env, { dump })
    await page.goto(calendarUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  }

  const rows = []
  const seen = new Set()
  for (const d of targetDates(baseDate(env))) {
    const scheduled_date = iso(d)
    // Make sure we're on the right month, then open the day.
    await page.goto(`${calendarUrl(env)}&Month=${monthParam(d)}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.waitForSelector('.ihmscalendar, .ihmscalendarday', { timeout: 20000 }).catch(() => {})
    const opened = await openDay(page, d.getDate())
    if (dump) await dump(`day-${scheduled_date}`)
    if (!opened) { console.warn(`Arive: could not open day ${scheduled_date} on the calendar`); continue }

    const cards = await extractDayCards(page)
    console.log(`[arive] ${scheduled_date}: ${cards.length} card(s)`)
    for (const c of cards) {
      const m = c.text.match(CARD)
      if (!m) continue
      const [, code, jobNo, address, block, lot, serviceRaw] = m
      const service = serviceRaw.replace(/\s+\d+\s*$/, '').trim()
      const house = (c.href && (c.href.match(/housenumber=(\w+)/) || [])[1]) || jobNo
      const external_id = `arive:${house}:${service}`.slice(0, 200)
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
        raw: { code, jobNo, house, address: address.trim(), block, lot, service, href: c.href },
      })
    }
  }

  if (!rows.length) console.warn('Arive: no jobs parsed for the target day(s). Inspect debug/arive-*/day-*.html.')
  return rows
}
