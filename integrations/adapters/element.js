// Element Homes adapter. Element uses TradeTopia (tradetopiaportal.com). The Daily
// Schedule is a date-addressable page:
//   /tradepartner/schedules/dailySchedule?date=MM/DD/YYYY&myAssignments=true&myTrades=true&...
// It renders (Bootstrap, not a table) one block per lot:
//   "<Subdivision> / <Lot> / <Address>"
//   "<Superintendent> - <email>"
//   "<City> , <ST> <ZIP>"
//   then a task list: <Task Name> / <Start Date> / <Finish Date> / <PO/Trade>
// A task line is the one immediately followed by a MM/DD/YYYY date. Delta pulls the
// NEXT day (Fri -> Sat+Sun+Mon). Calibrated from the assisted session.
import { serviceType } from '../lib/normalize.js'
import { baseDate, iso, targetDates } from '../lib/dates.js'

export const meta = { source: 'element', label: 'Element Homes' }

const BASE = 'https://www.tradetopiaportal.com'
const baseOf = (env) => (env.ELEMENT_BASE_URL || BASE).replace(/\/$/, '')
const loginUrl = (env) => `${baseOf(env)}/tradepartner/login.jsp`
const dayUrl = (env, mdY) =>
  `${baseOf(env)}/tradepartner/schedules/dailySchedule?date=${mdY}` +
  `&myAssignments=true&myTrades=true&allTrades=false&completedLots=false&completedTasks=false`
export const homeUrl = (env) => `${baseOf(env)}/tradepartner/home`

// MM/DD/YYYY for the date param.
const mdy = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`

export async function isLoggedIn(page) {
  const hasPw = await page.$('input[type="password"]').catch(() => null)
  return !hasPw && !/login\.jsp|\/login\b/i.test(page.url())
}

export async function login(page, env, { dump } = {}) {
  if (!env.ELEMENT_USER || !env.ELEMENT_PASS) throw new Error('ELEMENT_USER and ELEMENT_PASS are required in integrations/.env')
  await page.goto(loginUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForSelector('input[type="password"]', { timeout: 25000 }).catch(() => {})
  const user =
    (env.ELEMENT_SEL_USER && (await page.$(env.ELEMENT_SEL_USER))) ||
    (await page.$('input[name*="user" i], input[name*="email" i], input[type="email"], input[type="text"]'))
  const pass = (env.ELEMENT_SEL_PASS && (await page.$(env.ELEMENT_SEL_PASS))) || (await page.$('input[type="password"]'))
  if (!user || !pass) { if (dump) await dump('login-stuck'); throw new Error('Element login fields not found — calibrate with --headful.') }
  await user.fill(env.ELEMENT_USER)
  await pass.fill(env.ELEMENT_PASS)
  const submit =
    (env.ELEMENT_SEL_SUBMIT && (await page.$(env.ELEMENT_SEL_SUBMIT))) ||
    (await page.$('button[type="submit"], input[type="submit"], button:has-text("Log In"), button:has-text("Login"), button:has-text("Sign In")'))
  if (submit) await submit.click().catch(() => {})
  else await page.keyboard.press('Enter')
  await page.waitForLoadState('networkidle').catch(() => {})
  if (!(await isLoggedIn(page))) { if (dump) await dump('login-stuck'); throw new Error('Element login not completed — run --headful and finish it once (session persists in the profile).') }
}

// Grab the main content text lines (skip the nav/breadcrumb chrome).
async function scheduleLines(page) {
  return page.evaluate(() => {
    // Task rows live in collapsed Bootstrap accordions (display:none), which innerText
    // skips — force them open so the tasks are readable.
    for (const e of document.querySelectorAll('.collapse')) { e.classList.add('show'); e.style.display = '' }
    const main = document.querySelector('.buildtopia-body') || document.querySelector('.container-fluid.body') || document.body
    return (main.innerText || '').split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
  })
}

const HEADER = /^(.+?)\s+\/\s+(.+?)\s+\/\s+(.+)$/ // Subdivision / Lot / Address
const CITY = /^(.+?)\s*,\s*([A-Z]{2})\s+(\d{5})/
const DATEL = /^\d{2}\/\d{2}\/\d{4}$/
const NAVWORDS = /^(Home|Schedules|Documents|Bids|Contracts|Lots|Purchase Orders|Lien Waivers|Invoices|Service Orders|NSO Quotes|Reports|Daily Schedule|Weekly Schedule|Monthly Schedule|Lot Matrix|Search|Date|Updates|Tasks|Task Name|Start Date|Finish Date|POs|Trade Name|Print.*)$/i

function parseDay(lines, scheduled_date) {
  const jobs = []
  let cur = null
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i]
    const h = L.match(HEADER)
    // A job header: "Sub / Lot / Address", address has a digit, not a breadcrumb/trade line.
    if (h && /\d/.test(h[3]) && !NAVWORDS.test(h[1]) && !/Trade Name|Interior|Exterior/i.test(L)) {
      cur = { subdivision: h[1].trim(), lot: h[2].trim(), address: h[3].trim(), super_name: null, super_email: null, city: null, tasks: [] }
      jobs.push(cur)
      // the next couple of lines usually carry superintendent + city
      for (let k = i + 1; k < Math.min(i + 4, lines.length); k++) {
        const n = lines[k]
        if (!cur.super_name && /@/.test(n) && / - /.test(n)) { const [nm, em] = n.split(' - '); cur.super_name = nm.trim(); cur.super_email = (em || '').trim() }
        else if (!cur.super_name && / - /.test(n) && !HEADER.test(n)) { cur.super_name = n.split(' - ')[0].trim() }
        const c = n.match(CITY)
        if (c && !cur.city) cur.city = `${c[1].trim()}, ${c[2]} ${c[3]}`
      }
      continue
    }
    // A task line is one immediately followed by a date (its Start Date).
    if (cur && i + 1 < lines.length && DATEL.test(lines[i + 1]) && !DATEL.test(L) && !NAVWORDS.test(L) && !CITY.test(L) && !/@/.test(L)) {
      cur.tasks.push(L)
    }
  }
  // flatten to one row per task
  const rows = []
  for (const j of jobs) {
    const tasks = j.tasks.length ? j.tasks : [null]
    for (const t of tasks) {
      rows.push({
        external_id: `element:${j.lot}|${t || 'task'}|${scheduled_date}`.replace(/\s+/g, ' ').slice(0, 200),
        builder: 'Element Homes',
        community: j.subdivision,
        subdivision: j.subdivision,
        lot: j.lot,
        address: j.city ? `${j.address}, ${j.city}` : j.address,
        activity: t,
        service_type: serviceType(t || ''),
        scheduled_date,
        super_name: j.super_name,
        super_email: j.super_email,
        status: null,
        raw: { ...j, task: t },
      })
    }
  }
  return rows
}

// Load the Daily Schedule for a given MM/DD/YYYY. The SPA cold-loads the "Updates"
// tab, so we activate "Daily Schedule" once, then drive the #date form (onchange=
// submitForm) which reloads the daily grid for that date.
async function openDay(page, env, mdY) {
  await page.goto(dayUrl(env, mdY), { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(600)
  const hasDate = async () => !!(await page.$('#date').catch(() => null))
  // The SPA cold-loads the "Updates" tab — activate "Daily Schedule" if the date form isn't present.
  if (!(await hasDate())) {
    const ds = page.locator('a:has-text("Daily Schedule"), button:has-text("Daily Schedule")').first()
    if (await ds.count()) { await ds.click().catch(() => {}); await page.waitForLoadState('domcontentloaded').catch(() => {}) }
    await page.waitForSelector('#date', { timeout: 12000 }).catch(() => {})
  }
  // Drive the daily-view date form (onchange=submitForm) to the exact day.
  const cur = await page.$eval('#date', (el) => el.value).catch(() => null)
  if (cur && cur !== mdY) {
    await page.evaluate((v) => {
      const el = document.querySelector('#date')
      if (!el) return
      el.value = v
      if (typeof window.submitForm === 'function') window.submitForm()
      else el.dispatchEvent(new Event('change'))
    }, mdY).catch(() => {})
    await page.waitForNavigation({ timeout: 12000 }).catch(() => {})
  }
  await page.waitForSelector('#date', { timeout: 12000 }).catch(() => {})
  // The task grid loads by AJAX after the #date form — wait for it to settle
  // (a "Trade Name" header when there are jobs, or an empty-state message).
  await page.waitForFunction(
    () => /Trade Name|No tasks|No schedule|no results|nothing scheduled/i.test(document.body.innerText),
    { timeout: 12000 },
  ).catch(() => {})
  await page.waitForTimeout(700)
}

export async function scrape(page, { dump, env = {} }) {
  await page.goto(homeUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  if (!(await isLoggedIn(page))) await login(page, env, { dump })

  const rows = []
  const seen = new Set()
  for (const d of targetDates(baseDate(env))) {
    const scheduled_date = iso(d)
    await openDay(page, env, mdy(d))
    if (dump) await dump(`day-${scheduled_date}`)
    const lines = await scheduleLines(page)
    const dayRows = parseDay(lines, scheduled_date)
    console.log(`[element] ${scheduled_date}: ${dayRows.length} task(s)`)
    for (const r of dayRows) {
      if (seen.has(r.external_id)) continue
      seen.add(r.external_id)
      rows.push(r)
    }
  }
  if (!rows.length) console.warn('Element: no tasks parsed. Inspect debug/element-*/day-*.html.')
  return rows
}
