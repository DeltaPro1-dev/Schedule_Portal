// Element Homes adapter. Element uses TradeTopia (tradetopiaportal.com), a trade-
// partner portal (JSP). Login is a standard form; the schedule lives behind it.
//
// STATUS: login is implemented; the SCHEDULE PAGE selectors are NOT yet calibrated
// (no sample of the post-login schedule DOM). `scrape` logs in, opens the schedule
// area, DUMPS the page, and parses any schedule-like table best-effort. Run once
// with `--headful` and inspect debug/element-*/schedule.html to finalize selectors.
import { serviceType } from '../lib/normalize.js'
import { baseDate, iso } from '../lib/dates.js'

export const meta = { source: 'element', label: 'Element Homes' }

const BASE = 'https://www.tradetopiaportal.com'
const baseOf = (env) => (env.ELEMENT_BASE_URL || BASE).replace(/\/$/, '')
const loginUrl = (env) => `${baseOf(env)}/tradepartner/login.jsp`
// Best-guess schedule path; override with ELEMENT_SCHEDULE_URL once known.
const scheduleUrl = (env) => env.ELEMENT_SCHEDULE_URL || `${baseOf(env)}/tradepartner/schedules/updates`
export const homeUrl = loginUrl

export async function isLoggedIn(page) {
  const hasPw = await page.$('input[type="password"]').catch(() => null)
  return !hasPw && !/login\.jsp/i.test(page.url())
}

export async function login(page, env, { dump } = {}) {
  if (!env.ELEMENT_USER || !env.ELEMENT_PASS) throw new Error('ELEMENT_USER and ELEMENT_PASS are required in integrations/.env')
  await page.goto(loginUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForSelector('input[type="password"]', { timeout: 25000 }).catch(() => {})
  const user =
    (env.ELEMENT_SEL_USER && (await page.$(env.ELEMENT_SEL_USER))) ||
    (await page.$('input[name*="user" i], input[name*="email" i], input[type="email"], input[type="text"]'))
  const pass =
    (env.ELEMENT_SEL_PASS && (await page.$(env.ELEMENT_SEL_PASS))) ||
    (await page.$('input[type="password"]'))
  if (!user || !pass) { if (dump) await dump('login-stuck'); throw new Error('Element login fields not found — calibrate selectors with --headful.') }
  await user.fill(env.ELEMENT_USER)
  await pass.fill(env.ELEMENT_PASS)
  const submit =
    (env.ELEMENT_SEL_SUBMIT && (await page.$(env.ELEMENT_SEL_SUBMIT))) ||
    (await page.$('input[type="submit"], button[type="submit"], input[value*="Log" i], button:has-text("Login")'))
  if (submit) await submit.click().catch(() => {})
  else await page.keyboard.press('Enter')
  await page.waitForLoadState('networkidle').catch(() => {})
  if (!(await isLoggedIn(page))) { if (dump) await dump('login-stuck'); throw new Error('Element login not completed — run --headful and finish it once.') }
}

// Best-effort: read a schedule-like table (a table with a date-ish and address-ish
// header). Returns [] until calibrated — the dump is the deliverable for now.
async function extractSchedule(page) {
  return page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    for (const t of document.querySelectorAll('table')) {
      const heads = [...t.querySelectorAll('th, thead td')].map((h) => norm(h.innerText).toLowerCase())
      const hasDate = heads.some((h) => /date|day|schedule/.test(h))
      const hasPlace = heads.some((h) => /address|lot|community|job|site/.test(h))
      if (!(hasDate && hasPlace)) continue
      const col = (re) => heads.findIndex((h) => re.test(h))
      const iDate = col(/date|day/), iAddr = col(/address|site/), iLot = col(/lot/),
        iComm = col(/community|project|job/), iAct = col(/activity|service|task|type/), iStatus = col(/status/)
      const rows = []
      for (const tr of t.querySelectorAll('tbody tr, tr')) {
        const tds = [...tr.querySelectorAll('td')]
        if (tds.length < 2) continue
        const cell = (i) => (i > -1 && tds[i] ? norm(tds[i].innerText) : null)
        const date = cell(iDate)
        if (!date) continue
        rows.push({ date, address: cell(iAddr), lot: cell(iLot), community: cell(iComm), activity: cell(iAct), status: cell(iStatus) })
      }
      if (rows.length) return rows
    }
    return []
  })
}

function toISO(s) {
  const m = String(s).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (!m) return null
  let [, mm, dd, yy] = m
  if (yy.length === 2) yy = '20' + yy
  return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

export async function scrape(page, { dump, env = {} }) {
  if (!(await isLoggedIn(page))) await login(page, env, { dump })
  await page.goto(scheduleUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(1200)
  if (dump) await dump('schedule')

  const raw = await extractSchedule(page)
  if (!raw.length) {
    console.warn('Element: no schedule table matched. Inspect the dumped schedule.html and set ELEMENT_SCHEDULE_URL / selectors.')
    return []
  }
  const today = iso(baseDate(env))
  return raw
    .map((r) => ({
      external_id: `element:${r.community || ''}|${r.lot || ''}|${r.activity || ''}|${toISO(r.date)}`.slice(0, 200),
      builder: 'Element Homes',
      community: r.community,
      subdivision: r.community,
      lot: r.lot,
      address: r.address,
      activity: r.activity,
      service_type: serviceType(r.activity || ''),
      scheduled_date: toISO(r.date),
      status: r.status,
      raw: r,
    }))
    .filter((r) => r.scheduled_date && r.scheduled_date >= today)
}
