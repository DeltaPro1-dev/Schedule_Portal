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
    const el = await page.$(sel)
    if (el) { await el.fill(value).catch(() => {}); return sel }
  }
  return null
}

export async function isLoggedIn(page) {
  const t = await page.evaluate(() => document.body?.innerText || '').catch(() => '')
  return /Summary|Sign Out|Log Out|Dashboard/i.test(t) && !/password/i.test(t)
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

export async function scrape(page, { dump }) {
  await page.goto(SUMMARY_URL, { waitUntil: 'networkidle' }).catch(() => {})
  // The "Work Schedule snapshot" rows come from the rptrUpcomingSchedule repeater.
  await page.waitForSelector('tr[id*="rptrUpcomingSchedule"]', { timeout: 20000 }).catch(() => {})
  await dump('summary')

  const rows = await page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    const out = []
    for (const tr of document.querySelectorAll('tr[id*="rptrUpcomingSchedule"]')) {
      const tds = [...tr.querySelectorAll('td')]
      if (tds.length < 2) continue
      const a = tr.querySelector('a[onclick*="OpenDetails"]') || tr.querySelector('a')
      const id = (a?.getAttribute('onclick')?.match(/OpenDetails\((\d+)/) || [])[1] || null
      out.push({
        status: norm(tds[0]?.innerText),                     // "Begins on M-D-YYYY" or blank
        title: norm(a?.innerText || tds[tds.length - 2]?.innerText),
        job: norm(tds[tds.length - 1]?.innerText),
        id,
      })
    }
    return out
  })

  return rows
    .filter((r) => r.title && r.job)
    .map((r) => {
      const begin = (r.status.match(/Begins on\s+([\d/-]+)/i) || [])[1] || null
      const j = parseJob(r.job)
      return {
        activity: r.title,
        service_type: serviceType(r.title),
        community: j.community,
        lot: j.lot,
        plan: j.plan,
        scheduled_date: begin ? toISO(begin) : null,
        external_id: r.id ? `bt:${r.id}` : `bt:${r.title}|${r.job}`.slice(0, 200),
        raw: { title: r.title, job: r.job, status: r.status, id: r.id },
      }
    })
}
