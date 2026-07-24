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
  const u = await fillFirst(
    page,
    [env.BUILDERTREND_SEL_USER, '#username', 'input[name="username"]', 'input[inputmode="email"]', 'input[type="email"]', 'input[type="text"]'].filter(Boolean),
    env.BUILDERTREND_USER,
  )
  const p = await fillFirst(
    page,
    [env.BUILDERTREND_SEL_PASS, '#password', 'input[name="password"]', 'input[type="password"]'].filter(Boolean),
    env.BUILDERTREND_PASS,
  )
  if (!u || !p) { if (dump) await dump('login'); throw new Error('Buildertrend login fields not found — check debug/ HTML and set BUILDERTREND_SEL_USER/PASS') }
  const submit =
    (env.BUILDERTREND_SEL_SUBMIT && (await page.$(env.BUILDERTREND_SEL_SUBMIT))) ||
    (await page.$('button[type="submit"][name="action"]')) ||
    (await page.$('button[type="submit"]')) ||
    (await page.$('button:has-text("Login")')) ||
    (await page.$('button:has-text("Sign In")'))
  if (submit) await submit.click().catch(() => {})
  else await page.keyboard.press('Enter')
  await page.waitForLoadState('networkidle').catch(() => {})
  // Auth0 MFA — solve in the --headful window; --persist reuses the session next run.
  if (dump && /verification code|two-?factor|authenticator|one-?time|enter the code/i.test(await page.evaluate(() => document.body?.innerText || '').catch(() => ''))) {
    await dump('2fa')
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
  await dump('summary')

  // Rows: Status(begin date) | Title(activity) | Job. Read the grid; each data row
  // has a Title cell and a Job cell, with an optional "Begins on <date>" in Status.
  const rows = await page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    const out = []
    for (const tr of document.querySelectorAll('tr')) {
      const cells = [...tr.querySelectorAll('td')].map((c) => norm(c.innerText))
      if (cells.length < 2) continue
      const rowText = norm(tr.innerText)
      if (/^status\b/i.test(rowText) || !rowText) continue
      const begin = (rowText.match(/Begins on\s+([\d/-]+)/i) || [])[1] || null
      // Title/Job are the last two non-empty cells (Status may be empty or the begin note)
      const nonEmpty = cells.filter(Boolean)
      const link = tr.querySelector('a[href]')?.href || null
      out.push({ cells, begin, link, rowText })
    }
    return out
  })

  return rows
    .map((r) => {
      // Title = clean type, Job = community/lot/plan. Heuristic: the last two cells.
      const vals = r.cells.filter((c) => c && !/^Begins on/i.test(c))
      const job = vals[vals.length - 1] || ''
      const title = vals[vals.length - 2] || ''
      if (!job || !title) return null
      const j = parseJob(job)
      const idM = r.link?.match(/(?:jobsiteId|scheduleItemId|id)=(\d+)/i)
      return {
        activity: title,
        service_type: serviceType(title),
        community: j.community,
        lot: j.lot,
        plan: j.plan,
        scheduled_date: r.begin ? toISO(r.begin) : null,
        external_id: idM ? `bt:${idM[1]}` : `bt:${title}|${job}`.slice(0, 200),
        raw: { title, job, begin: r.begin, link: r.link },
      }
    })
    .filter(Boolean)
}
