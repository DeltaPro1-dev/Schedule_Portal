// Buildertrend adapter. Login through Auth0 with the persistent (trusted) Chrome profile; the
// schedule comes from the new Schedule page (see scrape below). Buildertrend may ask for a
// captcha/2FA: run once with --headful and finish it by hand.
import { serviceType } from '../lib/normalize.js'

export const meta = { source: 'buildertrend', label: 'Buildertrend' }

const LOGIN_URL = 'https://buildertrend.net/'
const SUMMARY_URL = 'https://buildertrend.net/subSummary.aspx'
export const homeUrl = (env) => env.BUILDERTREND_URL || SUMMARY_URL

async function fillFirst(page, selectors, value) {
  for (const sel of selectors) {
    const el = await page.$(sel).catch(() => null) // SPA may destroy the context mid-query
    if (el) { await el.fill(value).catch(() => {}); return sel }
  }
  return null
}

// Logged in = we're in the app (no password field, not on the Auth0 login page).
export async function isLoggedIn(page) {
  const hasPassword = await page.$('input[type="password"]').catch(() => null)
  return !hasPassword && !/auth0|\/login/i.test(page.url())
}

export async function login(page, env, { dump } = {}) {
  await page.goto(env.BUILDERTREND_URL || LOGIN_URL, { waitUntil: 'domcontentloaded' }).catch(() => {})
  // Buildertrend uses Auth0 universal login — the form renders after a redirect.
  await page.waitForSelector('#username, input[name="username"], input[type="password"]', { timeout: 25000 }).catch(() => {})
  // Auto-fill + submit. The trusted (persistent, real-Chrome) profile means reCAPTCHA
  // no longer challenges, so this logs in unattended. If a captcha/2FA DOES appear,
  // solve it once in the --headful window — the wait below gives you time.
  await fillFirst(page, ['#username', 'input[name="username"]', 'input[inputmode="email"]', 'input[type="text"]'], env.BUILDERTREND_USER || '')
  await fillFirst(page, ['#password', 'input[name="password"]', 'input[type="password"]'], env.BUILDERTREND_PASS || '')
  const submit =
    (env.BUILDERTREND_SEL_SUBMIT && (await page.$(env.BUILDERTREND_SEL_SUBMIT))) ||
    (await page.$('button[type="submit"][name="action"]')) ||
    (await page.$('button[type="submit"]')) ||
    (await page.$('button:has-text("Login")'))
  if (submit) await submit.click().catch(() => {})
  else await page.keyboard.press('Enter')
  await page.waitForLoadState('networkidle').catch(() => {})
  const authed = await page
    .waitForFunction(() => !document.querySelector('input[type="password"]') && !/log ?in/i.test(document.title), { timeout: 180000, polling: 1000 })
    .then(() => true)
    .catch(() => false)
  if (!authed) {
    if (dump) await dump('login-stuck')
    throw new Error('Buildertrend login not completed (captcha/2FA?). Run `--headful` and finish it by hand; the trusted Chrome profile usually avoids the captcha afterwards.')
  }
}

// Parse "Bristol Farms 219 - Corbridge Spec" → community / lot / plan (best-effort).
function parseJob(job) {
  const out = { community: job || null, lot: null, plan: null }
  const dash = job.split(/\s+-\s+/)
  const head = dash[0] || ''
  if (dash.length > 1) out.plan = dash.slice(1).join(' - ').trim()
  const lotM = head.match(/^(.*?)\s+(\d+[A-Za-z]?)\s*$/)
  if (lotM) { out.community = lotM[1].trim(); out.lot = lotM[2] } else { out.community = head.trim() || null }
  return out
}


// Buildertrend's new app (Sept 2026) replaced the sub Summary repeater with a React Schedule page that
// needs a job selected. We open Project Management → Schedule, pick "All N Jobs" in the job picker and
// read the app's own CalendarList response (JSON), for this month and the next one. Only items assigned
// to our account (isCurrentUser) and not completed are kept. Item ids are the same as the old
// OpenDetails ids, so already imported schedules are updated, not duplicated.
const SCHEDULE_URL = 'https://buildertrend.net/app/subs/Schedules/0'
const CALENDAR_API = /\/api\/calendar\/CalendarList/i

const dateOnly = (value) => (value ? String(value).slice(0, 10) : null)
const firstOfNextMonth = (iso) => { const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10) }

// "1st Clean (Regal Homes, LC)" → activity "1st Clean", builder "Regal Homes, LC".
export function splitTitle(title) {
  const text = String(title || '').replace(/\s+/g, ' ').trim()
  const m = text.match(/^(.*?)\s*\(([^()]+)\)\s*$/)
  return m ? { activity: m[1].trim(), builder: m[2].trim() } : { activity: text, builder: null }
}

// Calendar items → imported_schedules rows (same shape as before).
export function calendarRows(items, today) {
  const seen = new Set()
  return items
    .filter((item) => (item.assignedUsers || []).some((user) => user?.extraData?.isCurrentUser))
    .filter((item) => !item.completed && (dateOnly(item.endDate) || dateOnly(item.startDate)) >= today)
    .filter((item) => (seen.has(item.id) ? false : seen.add(item.id)))
    .map((item) => {
      const { activity, builder } = splitTitle(item.title)
      const job = parseJob(String(item.jobTitle || ''))
      return {
        activity,
        builder,
        service_type: serviceType(activity),
        community: job.community,
        lot: job.lot,
        plan: job.plan,
        scheduled_date: dateOnly(item.startDate),
        external_id: `bt:${item.id}`,
        raw: { id: item.id, title: item.title, job: item.jobTitle, jobId: item.jobId, start: item.startDate, end: item.endDate, status: item.status },
      }
    })
}

export async function scrape(page, { dump }) {
  await page.goto(SCHEDULE_URL, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForSelector('[data-testid="JobListItem-0"]', { timeout: 45000 }).catch(() => {})
  // "All N Jobs" is the first item of the job picker; selecting it loads the calendar of every job.
  const firstCall = page.waitForResponse((res) => CALENDAR_API.test(res.url()), { timeout: 60000 }).catch(() => null)
  await page.click('[data-testid="JobListItem-0"]').catch(() => {})
  const response = await firstCall
  await page.waitForTimeout(1500)
  await dump('schedule')
  if (!response) throw new Error('Buildertrend: the Schedule did not load (CalendarList not called). Check the debug schedule.png.')
  const request = response.request()
  const body = JSON.parse(request.postData() || '{}')
  const first = await response.json().catch(() => null)
  const items = [...(first?.data?.calendarItems || [])]
  // Next month too (the Month view only covers the current one).
  const headers = Object.fromEntries(Object.entries(request.headers()).filter(([key]) => !/^(content-length|host|cookie)$/i.test(key)))
  const next = await page.request.post(response.url(), { headers: { ...headers, 'content-type': 'application/json' }, data: JSON.stringify({ ...body, startDate: `${firstOfNextMonth(body.startDate || new Date().toISOString())}T00:00:00` }) }).catch(() => null)
  const nextBody = next && next.ok() ? await next.json().catch(() => null) : null
  if (nextBody?.data?.calendarItems) items.push(...nextBody.data.calendarItems)
  else console.warn('Buildertrend: next month not loaded; only the current month was read.')
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
  return calendarRows(items, today)
}
