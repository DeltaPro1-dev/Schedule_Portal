// David Weekley Homes adapter. Vendor Portal at vendor.davidweekleyhomes.com (SPA,
// WS-Federation login via vendorauth.davidweekleyhomes.com). The calendar is backed by
// two JSON APIs (share the browser session cookies), so we skip the DOM entirely:
//   * /TaskApi/get/tasks?start=..&end=..  → the scheduled cleaning tasks:
//       { id, jobNumber, title (clean type), start (date), address, lot, block, phase,
//         builderName (superintendent), isConfirmed, confirmedByVendorName }
//   * /Community/GetCommunitiesWithJobs   → jobNumber → community name, Plan, Elevation
// We pull the NEXT day (Fri → Sat+Sun+Mon), join the two, and emit one row per task.
// Login is WS-Fed: the persistent profile keeps the session; if it lapses, run once
// with `--headful` and sign in by hand.
import { serviceType } from '../lib/normalize.js'
import { baseDate, iso, targetDates, addDays } from '../lib/dates.js'

export const meta = { source: 'davidweekley', label: 'David Weekley Homes' }

const BASE = 'https://vendor.davidweekleyhomes.com'
const baseOf = (env) => (env.DAVIDWEEKLEY_URL || BASE).replace(/\/$/, '')
export const homeUrl = (env) => `${baseOf(env)}/Vendor`

export async function isLoggedIn(page) {
  const hasPw = await page.$('input[type="password"]').catch(() => null)
  return !hasPw && /vendor\.davidweekleyhomes\.com/i.test(page.url()) && !/signin|vendorauth/i.test(page.url())
}

export async function login(page, env, { dump } = {}) {
  await page.goto(homeUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  // Redirects to the WS-Fed sign-in form when the session has lapsed.
  await page.waitForSelector('input[type="password"], input[name="Username" i], input[type="email"]', { timeout: 15000 }).catch(() => {})
  const user =
    (env.DAVIDWEEKLEY_SEL_USER && (await page.$(env.DAVIDWEEKLEY_SEL_USER))) ||
    (await page.$('input[name="Username" i], input[name*="user" i], input[type="email"], input[type="text"]'))
  const pass = (await page.$('input[type="password"]'))
  if (user && pass && env.DAVIDWEEKLEY_USER && env.DAVIDWEEKLEY_PASS) {
    await user.fill(env.DAVIDWEEKLEY_USER).catch(() => {})
    await pass.fill(env.DAVIDWEEKLEY_PASS).catch(() => {})
    const submit = (await page.$('button[type="submit"], input[type="submit"], button:has-text("Sign In"), button:has-text("Log In")'))
    if (submit) await submit.click().catch(() => {})
    else await page.keyboard.press('Enter')
    await page.waitForLoadState('networkidle').catch(() => {})
  }
  if (!(await isLoggedIn(page))) {
    if (dump) await dump('login-stuck')
    throw new Error('David Weekley login not completed (WS-Federation). Run once with --headful and sign in by hand — the profile keeps the session.')
  }
}

// /Date(ms)/ or ISO → YYYY-MM-DD
function toISODate(s) {
  if (!s) return null
  const m = String(s).match(/\/Date\((\d+)\)\//)
  if (m) { const d = new Date(Number(m[1])); return iso(d) }
  const im = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return im ? `${im[1]}-${im[2]}-${im[3]}` : null
}

async function getJSON(page, url) {
  const res = await page.request.get(url, { headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } })
  if (!res.ok()) throw new Error(`${url} → HTTP ${res.status()}`)
  return res.json()
}

export async function scrape(page, { dump, env = {} }) {
  await page.goto(homeUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  if (!(await isLoggedIn(page))) await login(page, env, { dump })

  const targets = targetDates(baseDate(env))
  const targetSet = new Set(targets.map(iso))
  const startISO = iso(targets[0])
  const endISO = iso(addDays(targets[targets.length - 1], 1))

  // Tasks (clean type + date + job + super + address/lot/phase)
  const tasksUrl = `${baseOf(env)}/TaskApi/get/tasks?start=${startISO}T00:00:00-06:00&end=${endISO}T00:00:00-06:00`
  const tasks = await getJSON(page, tasksUrl)
  const taskArr = Array.isArray(tasks) ? tasks : tasks.data || tasks.tasks || []

  // Community/plan lookup by job number
  const byJob = new Map()
  try {
    const comms = await getJSON(page, `${baseOf(env)}/Community/GetCommunitiesWithJobs?_=${startISO.replace(/-/g, '')}`)
    for (const c of Array.isArray(comms) ? comms : []) {
      for (const j of c.Jobs || []) {
        byJob.set(String(j.JobNumber), {
          community: c.DisplayName || null,
          plan: [j.Plan, j.Elevation].filter((x) => x && x.trim()).join(' / ') || null,
        })
      }
    }
  } catch (e) {
    console.warn(`David Weekley: community lookup skipped: ${e.message}`)
  }

  const rows = []
  const seen = new Set()
  for (const t of taskArr) {
    const scheduled_date = toISODate(t.start)
    if (!scheduled_date || !targetSet.has(scheduled_date)) continue
    const external_id = `davidweekley:${t.id || `${t.jobNumber}:${t.title}:${scheduled_date}`}`.slice(0, 200)
    if (seen.has(external_id)) continue
    seen.add(external_id)
    const meta2 = byJob.get(String(t.jobNumber)) || {}
    rows.push({
      external_id,
      builder: 'David Weekley Homes',
      community: meta2.community || t.address || null,
      subdivision: meta2.community || null,
      lot: t.lot || null,
      block: t.block || null,
      phase: t.phase || null,
      plan: meta2.plan || null,
      address: [t.address, t.cityStateAndPostalCode].filter(Boolean).join(', ') || t.address || null,
      activity: t.title || null,
      service_type: serviceType(t.title || ''),
      scheduled_date,
      builder_order_no: t.jobNumber || null,
      super_name: t.builderName || null,
      status: t.isConfirmed ? 'confirmed' : 'awaiting_confirmation',
      raw: t,
    })
  }
  console.log(`[davidweekley] ${taskArr.length} task(s) in range · ${rows.length} on target day(s)`)
  if (dump) await dump('vendor')
  return rows
}
