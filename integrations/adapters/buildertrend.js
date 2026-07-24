// Buildertrend adapter. The sub "Summary" (subSummary.aspx) is a forward list of
// upcoming cleans: Status | Title | Job, with "Begins on M-D-YYYY". We pull them all
// and tag each with its begin date. First-pass selectors/parse — calibrate with the
// --headful dump. Buildertrend may use 2FA; use --persist to log in once and reuse.
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
  await page.goto(env.BUILDERTREND_URL || LOGIN_URL, { waitUntil: 'domcontentloaded' })
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

function toISO(s) {
  const m = String(s).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (!m) return null
  let [, mm, dd, yy] = m
  if (yy.length === 2) yy = '20' + yy
  return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
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

const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

export async function scrape(page, { dump }) {
  await page.goto(SUMMARY_URL, { waitUntil: 'domcontentloaded' }).catch(() => {})
  // The "Work Schedule snapshot" rows come from the rptrUpcomingSchedule repeater.
  await page.waitForSelector('tr[id*="rptrUpcomingSchedule"]', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(1500) // let the SPA settle so content()/screenshot don't race a re-render
  await dump('summary')

  // Parse from the HTML string (not page.evaluate) — the SPA re-renders and would
  // otherwise destroy the execution context mid-extraction.
  const html = await page.content().catch(() => '')
  const trs = html.match(/<tr id="[^"]*rptrUpcomingSchedule[^"]*"[\s\S]*?<\/tr>/gi) || []

  return trs
    .map((tr) => {
      const id = (tr.match(/OpenDetails\((\d+)/) || [])[1] || null
      const a = (tr.match(/<a[^>]*OpenDetails[\s\S]*?<\/a>/i) || [])[0] || ''
      const title = strip(a)
      const tds = tr.match(/<td[\s\S]*?<\/td>/gi) || []
      const job = strip(tds[tds.length - 1] || '')
      const status = strip(tds[0] || '')
      if (!title || !job) return null
      const begin = (status.match(/Begins on\s+([\d/-]+)/i) || [])[1] || null
      const j = parseJob(job)
      return {
        activity: title,
        service_type: serviceType(title),
        community: j.community,
        lot: j.lot,
        plan: j.plan,
        scheduled_date: begin ? toISO(begin) : null,
        external_id: id ? `bt:${id}` : `bt:${title}|${job}`.slice(0, 200),
        raw: { title, job, status, id },
      }
    })
    .filter(Boolean)
}
