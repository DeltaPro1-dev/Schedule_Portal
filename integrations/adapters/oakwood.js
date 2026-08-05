// Oakwood Homes (KOVA) adapter. KOVA is an ASP.NET production system; the
// "Job Schedule Activity List" (JobSchActList.aspx) is a flat grid of scheduled
// cleaning activities carrying their Start date, PO#, community, model, address,
// block/lot and status. We read the grid by HEADER NAME (robust to column moves),
// tag each row with its Start date and keep the forward ones.
//
// First-pass login selectors — calibrate once with `--headful` (the run dumps the
// page on login-stuck). Grid pagination (pages 1..N) is followed best-effort.
import { serviceType } from '../lib/normalize.js'
import { baseDate, iso } from '../lib/dates.js'

export const meta = { source: 'oakwood', label: 'Oakwood Homes' }

const BASE = 'https://kova.oakwoodhomesco.com'
const LIST_PATH = '/KovaProduction/Production/Scheduling2/JobSchActList.aspx?root=true&status=Released'
const baseOf = (env) => (env.OAKWOOD_BASE_URL || BASE).replace(/\/$/, '')
const listUrl = (env) => baseOf(env) + LIST_PATH
export const homeUrl = listUrl

// Logged in = the activity grid is reachable and there's no password field.
export async function isLoggedIn(page) {
  const hasPw = await page.$('input[type="password"]').catch(() => null)
  return !hasPw && /kova/i.test(page.url())
}

export async function login(page, env, { dump } = {}) {
  if (!env.OAKWOOD_USER || !env.OAKWOOD_PASS) throw new Error('OAKWOOD_USER and OAKWOOD_PASS are required in integrations/.env')
  await page.goto(baseOf(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForSelector('input[type="password"]', { timeout: 25000 }).catch(() => {})
  // KOVA is ASP.NET WebForms: exact ids SignIn1_username / SignIn1_password /
  // SignIn1_ButtonSignIn (a __doPostBack submit). Env overrides still honored.
  const user =
    (env.OAKWOOD_SEL_USER && (await page.$(env.OAKWOOD_SEL_USER))) ||
    (await page.$('#SignIn1_username, input[name="SignIn1$username"], input[name*="User" i], input[type="text"]'))
  const pass =
    (env.OAKWOOD_SEL_PASS && (await page.$(env.OAKWOOD_SEL_PASS))) ||
    (await page.$('#SignIn1_password, input[name="SignIn1$password"], input[type="password"]'))
  if (!user || !pass) { if (dump) await dump('login-stuck'); throw new Error('Oakwood login fields not found — calibrate selectors with --headful.') }
  await user.fill(env.OAKWOOD_USER)
  await pass.fill(env.OAKWOOD_PASS)
  const submit =
    (env.OAKWOOD_SEL_SUBMIT && (await page.$(env.OAKWOOD_SEL_SUBMIT))) ||
    (await page.$('#SignIn1_ButtonSignIn, input[name="SignIn1$ButtonSignIn"], input[type="submit"]'))
  if (submit) await submit.click().catch(() => {})
  else await page.keyboard.press('Enter')
  await page.waitForLoadState('networkidle').catch(() => {})
  if (!(await isLoggedIn(page))) {
    // Surface KOVA's own error (e.g. "Login Failed!") so bad creds are obvious.
    const msg = await page.$eval('#SignIn1_Message, .loginerror-text', (el) => el.textContent.trim()).catch(() => null)
    if (dump) await dump('login-stuck')
    throw new Error(`Oakwood login not completed${msg ? ` — portal says: "${msg}"` : ''}. Verify OAKWOOD_USER/OAKWOOD_PASS (or run --headful for any challenge).`)
  }
}

function toISO(s) {
  const m = String(s).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (!m) return null
  let [, mm, dd, yy] = m
  if (yy.length === 2) yy = '20' + yy
  return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

// Read the KOVA grid by header name. Returns one object per activity row.
async function extractGrid(page) {
  return page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    // The grid is the table that has a "Community" AND "Activity" header.
    let grid = null
    for (const t of document.querySelectorAll('table')) {
      const heads = [...t.querySelectorAll('th, thead td')].map((h) => norm(h.innerText).toLowerCase())
      if (heads.some((h) => h.includes('community')) && heads.some((h) => h.includes('activity'))) { grid = t; heads.__ = heads; break }
    }
    if (!grid) return []
    const headCells = [...grid.querySelectorAll('th, thead td')].map((h) => norm(h.innerText).toLowerCase())
    const col = (needle) => headCells.findIndex((h) => h.includes(needle))
    const idx = {
      community: col('community'), model: col('model'), batch: col('batch'), address: col('address'),
      blk: col('blk'), lot: col('lot'), builder: col('builder'), activity: col('activity'),
      status: col('status'), po: col('po#') > -1 ? col('po#') : col('po'), start: col('start'),
    }
    const rows = []
    for (const tr of grid.querySelectorAll('tbody tr, tr')) {
      const tds = [...tr.querySelectorAll('td')]
      if (tds.length < 5) continue // header/filler rows
      const cell = (i) => (i > -1 && tds[i] ? norm(tds[i].innerText) : null)
      const activity = cell(idx.activity)
      const community = cell(idx.community)
      const start = cell(idx.start)
      if (!activity || !community || !start) continue
      rows.push({
        community, model: cell(idx.model), batch: cell(idx.batch), address: cell(idx.address),
        block: cell(idx.blk), lot: cell(idx.lot), builder_field: cell(idx.builder),
        activity, status: cell(idx.status), po_number: cell(idx.po), start,
      })
    }
    return rows
  })
}

export async function scrape(page, { dump, env = {} }) {
  await page.goto(listUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  if (!(await isLoggedIn(page))) {
    await login(page, env, { dump })
    await page.goto(listUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  }
  await page.waitForSelector('table', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(1000)
  if (dump) await dump('activity-list')

  // Collect rows across pager pages (best-effort: click numbered pager links).
  const seen = new Set()
  const all = []
  const collect = async () => {
    for (const r of await extractGrid(page)) {
      const key = r.po_number || `${r.community}|${r.lot}|${r.activity}|${r.start}`
      if (seen.has(key)) continue
      seen.add(key)
      all.push(r)
    }
  }
  await collect()
  for (let p = 2; p <= 15; p++) {
    const link = await page.$(`a:has-text("${p}")`).catch(() => null)
    if (!link) break
    await link.click().catch(() => {})
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(600)
    const before = all.length
    await collect()
    if (all.length === before) break // no new rows → stop
  }

  const today = iso(baseDate(env))
  return all
    .map((r) => {
      const scheduled_date = toISO(r.start)
      // "Coach House at Wander (ujpch00)" → community + code
      const cm = String(r.community || '').match(/^(.*?)\s*\(([^)]+)\)\s*$/)
      const community = cm ? cm[1].trim() : r.community
      // Model "Belgian (132UT)" → plan
      const plan = r.model || null
      // Builder column sometimes holds a super name ("Bird, Levi"); keep as super_name if name-like.
      const super_name = r.builder_field && /[a-z],\s*[a-z]/i.test(r.builder_field) ? r.builder_field : null
      return {
        external_id: `oakwood:${r.po_number || `${r.community}|${r.lot}|${r.activity}|${scheduled_date}`}`.slice(0, 200),
        builder: 'Oakwood Homes',
        community,
        subdivision: community,
        lot: r.lot,
        block: r.block,
        plan,
        address: r.address,
        activity: r.activity,
        service_type: serviceType(r.activity),
        scheduled_date,
        po_number: r.po_number,
        builder_order_no: r.po_number,
        super_name,
        status: r.status,
        raw: r,
      }
    })
    // keep only rows with a valid, non-past date (forward schedule)
    .filter((r) => r.scheduled_date && r.scheduled_date >= today)
}
