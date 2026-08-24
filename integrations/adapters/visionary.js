// Visionary Homes adapter. Visionary runs on Microsoft Dynamics 365 F&O
// (visionary.operations.dynamics.com). Login is Azure AD with MFA (a code every new
// login) — the persistent profile keeps the session; re-auth via --headful when it
// lapses. The schedule lives in the vendor workspace (mi=SAB_ConsVendPortalWorkspace)
// as a VIRTUALIZED grid: cell values are on <input value="..."> elements whose id
// encodes the (grid, col, row). The grid is sorted oldest-first and only ~20 rows
// render at a time, so we SCROLL its container to load everything, extract by input
// value, then filter to the next day (Fri -> Sat+Sun+Mon).
import { serviceType } from '../lib/normalize.js'
import { baseDate, iso, targetDates } from '../lib/dates.js'

export const meta = { source: 'visionary', label: 'Visionary Homes' }

const APP = 'https://visionary.operations.dynamics.com/'
const workspaceUrl = (env) => env.VISIONARY_URL || `${APP}?cmp=VE&mi=SAB_ConsVendPortalWorkspace`
export const homeUrl = workspaceUrl

export async function isLoggedIn(page) {
  const u = page.url()
  if (/login\.microsoftonline|\/oauth2\//i.test(u)) return false
  const hasPw = await page.$('input[type="password"]').catch(() => null)
  return !hasPw && /dynamics\.com/i.test(u)
}

export async function login(page, env, { dump } = {}) {
  await page.goto(workspaceUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  const email = await page.$('input[type="email"], input[name="loginfmt"]').catch(() => null)
  if (email && env.VISIONARY_USER) {
    await email.fill(env.VISIONARY_USER).catch(() => {})
    await (await page.$('#idSIButton9, input[type="submit"]'))?.click().catch(() => {})
  }
  if (env.VISIONARY_PASS) {
    const pass = await page.waitForSelector('input[type="password"]', { timeout: 12000 }).catch(() => null)
    if (pass) { await pass.fill(env.VISIONARY_PASS).catch(() => {}); await (await page.$('#idSIButton9, input[type="submit"]'))?.click().catch(() => {}) }
  }
  console.log('Visionary: complete the MFA code + prompts in the browser (up to 4 min)…')
  const authed = await page
    .waitForFunction(() => /dynamics\.com/i.test(location.href) && !/login\.microsoftonline|\/oauth2\//i.test(location.href), { timeout: 240000, polling: 1500 })
    .then(() => true).catch(() => false)
  if (!authed) { if (dump) await dump('login-stuck'); throw new Error('Visionary login not completed (MFA). Run --headful and enter the code — the profile keeps the session.') }
}

function toISODate(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

// Read every rendered activity-grid cell from its <input value>, grouped by row.
async function extractRendered(page) {
  return page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    const rows = {}
    for (const el of document.querySelectorAll('[value][id*="WBSActiv"], [value][id*="Simple"], [value][id*="FinancialInstance"]')) {
      const id = el.id || ''
      const m = id.match(/_(\d+)_(\d+)_(\d+)_/) // grid_col_row
      if (!m) continue
      const key = `${m[1]}_${m[3]}` // grid+row (window-relative)
      const val = norm(el.getAttribute('value'))
      if (!val) continue
      let col = null
      if (/FinancialInstance/.test(id)) col = 'lotElement'
      else if (/SchedStartDate/.test(id)) col = 'start'
      else if (/SchedEndDate/.test(id)) col = 'end'
      else if (/ReportingActivity/.test(id)) col = 'activity'
      else if (/CostCategory/.test(id)) col = 'cost'
      else if (/responsibleWorker/.test(id)) col = 'responsible'
      else if (/Simple|Address/i.test(id)) col = 'address'
      if (col) (rows[key] = rows[key] || {})[col] = val
    }
    return Object.values(rows)
  })
}

// Scroll the grid's scrollable container one page; returns false if it can't scroll further.
async function scrollGrid(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[id*="WBSActiv"]')
    let n = el
    while (n && n !== document.body) {
      const s = getComputedStyle(n)
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 10) {
        const before = n.scrollTop
        n.scrollTop = Math.min(n.scrollTop + n.clientHeight * 0.85, n.scrollHeight)
        return n.scrollTop > before
      }
      n = n.parentElement
    }
    const before = window.scrollY
    window.scrollBy(0, 600)
    return window.scrollY > before
  })
}

export async function scrape(page, { dump, env = {} }) {
  await page.goto(workspaceUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  if (!(await isLoggedIn(page))) await login(page, env, { dump })
  // After Azure AD login D365 lands on the default Dashboard — re-open the workspace
  // by its menu item so the activities grid renders.
  await page.goto(workspaceUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForSelector('[id*="WBSActiv"]', { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(2500)

  const targets = targetDates(baseDate(env))
  const targetSet = new Set(targets.map(iso))

  // Scroll the whole (ascending-sorted) grid, accumulating every row.
  const all = new Map()
  let stable = 0
  for (let i = 0; i < 80 && stable < 3; i++) {
    for (const r of await extractRendered(page)) {
      const k = `${r.lotElement || ''}|${r.start || ''}|${r.activity || ''}|${r.responsible || ''}`
      if (k.trim() !== '|||') all.set(k, r)
    }
    const moved = await scrollGrid(page)
    await page.waitForTimeout(450)
    stable = moved ? 0 : stable + 1
  }
  const list = [...all.values()]
  const dates = list.map((r) => toISODate(r.start)).filter(Boolean).sort()
  console.log(`[visionary] loaded ${list.length} activities · dates ${dates[0]} .. ${dates[dates.length - 1]}`)
  if (dump) await dump('workspace')

  const rows = []
  const seen = new Set()
  for (const r of list) {
    const scheduled_date = toISODate(r.start)
    if (!scheduled_date || !targetSet.has(scheduled_date)) continue
    // "Desert Color Sage Haven SF-03/03/340" → community + lot (last of the /-parts)
    let community = r.lotElement || null, lot = null
    const lm = String(r.lotElement || '').match(/^(.*?)-([\dA-Za-z]+)\/([\dA-Za-z]+)\/([\dA-Za-z]+)\s*$/)
    if (lm) { community = lm[1].trim(); lot = lm[4] }
    const activity = r.activity || r.cost || null
    const external_id = `visionary:${r.lotElement || ''}|${activity}|${scheduled_date}`.replace(/\s+/g, ' ').slice(0, 200)
    if (seen.has(external_id)) continue
    seen.add(external_id)
    rows.push({
      external_id,
      builder: 'Visionary Homes',
      community,
      subdivision: community,
      lot,
      address: r.address || null,
      activity,
      service_type: serviceType(`${activity} ${r.cost || ''}`),
      scheduled_date,
      super_name: r.responsible || null,
      status: null,
      raw: r,
    })
  }
  console.log(`[visionary] ${rows.length} activity(ies) on target day(s)`)
  return rows
}
