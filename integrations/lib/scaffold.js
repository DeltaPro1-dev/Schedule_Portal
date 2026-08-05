// Shared scaffolding for first-pass portal adapters. The real per-portal parser is
// calibrated in an assisted --headful session; until then these give a WORKING
// login (or a clear error), a schedule-page DUMP, and a best-effort generic parse.
import { serviceType } from './normalize.js'
import { baseDate, iso } from './dates.js'

export function need(env, keys) {
  const miss = keys.filter((k) => !env[k])
  if (miss.length) throw new Error(`Missing ${miss.join(', ')} in integrations/.env`)
}

// Generic form login: fills the first email/text + password field, submits, and
// verifies the password field is gone. Selectors overridable via cfg.sel.{user,pass,submit}.
export async function formLogin(page, env, cfg, dump) {
  const { label, startUrl, user, pass, userKey, passKey, sel = {} } = cfg
  need(env, [userKey, passKey])
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForSelector(sel.pass || 'input[type="password"]', { timeout: 25000 }).catch(() => {})
  const uEl =
    (sel.user && (await page.$(sel.user))) ||
    (await page.$('input[type="email"], input[name*="user" i], input[name*="email" i], input[name*="login" i], input[type="text"]'))
  const pEl = (sel.pass && (await page.$(sel.pass))) || (await page.$('input[type="password"]'))
  if (!uEl || !pEl) { if (dump) await dump('login-stuck'); throw new Error(`${label}: login fields not found — calibrate selectors with --headful.`) }
  await uEl.fill(user)
  await pEl.fill(pass)
  const sEl =
    (sel.submit && (await page.$(sel.submit))) ||
    (await page.$('button[type="submit"], input[type="submit"], button:has-text("Log In"), button:has-text("Login"), button:has-text("Sign In")'))
  if (sEl) await sEl.click().catch(() => {})
  else await page.keyboard.press('Enter')
  await page.waitForLoadState('networkidle').catch(() => {})
  const stillLogin = await page.$('input[type="password"]').catch(() => null)
  if (stillLogin) {
    const msg = await page.$eval('.error, .alert, [class*="error" i], [class*="fail" i]', (el) => el.textContent.trim().slice(0, 140)).catch(() => null)
    if (dump) await dump('login-stuck')
    throw new Error(`${label}: login not completed${msg ? ` — portal says: "${msg}"` : ''}. Verify creds or run --headful for MFA/captcha.`)
  }
}

// Best-effort schedule extraction: the first table whose header has a date-ish AND
// a place-ish column. Returns loose rows for toParsed().
export async function genericSchedule(page) {
  return page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    for (const t of document.querySelectorAll('table')) {
      const heads = [...t.querySelectorAll('th, thead td')].map((h) => norm(h.innerText).toLowerCase())
      if (!heads.length) continue
      const hasDate = heads.some((h) => /date|day|scheduled|start/.test(h))
      const hasPlace = heads.some((h) => /address|lot|community|job|site|subdivision|plan/.test(h))
      if (!(hasDate && hasPlace)) continue
      const col = (re) => heads.findIndex((h) => re.test(h))
      const i = {
        date: col(/date|scheduled|start|day/), addr: col(/address|site/), lot: col(/lot/),
        comm: col(/community|subdivision|project|job/), act: col(/activity|service|task|type|description/),
        status: col(/status/), po: col(/po|order/),
      }
      const rows = []
      for (const tr of t.querySelectorAll('tbody tr, tr')) {
        const tds = [...tr.querySelectorAll('td')]
        if (tds.length < 2) continue
        const c = (k) => (i[k] > -1 && tds[i[k]] ? norm(tds[i[k]].innerText) : null)
        const date = c('date')
        if (!date) continue
        rows.push({ date, address: c('addr'), lot: c('lot'), community: c('comm'), activity: c('act'), status: c('status'), po_number: c('po') })
      }
      if (rows.length) return rows
    }
    return []
  })
}

export function toISO(s) {
  const m = String(s).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (!m) return null
  let [, mm, dd, yy] = m
  if (yy.length === 2) yy = '20' + yy
  return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

// Map a generic row → the parsed shape run.js/toRow expects.
export function toParsed(source, builder, r) {
  return {
    external_id: `${source}:${r.po_number || `${r.community || ''}|${r.lot || ''}|${r.activity || ''}|${toISO(r.date) || r.date}`}`.slice(0, 200),
    builder,
    community: r.community || null,
    subdivision: r.community || null,
    lot: r.lot || null,
    address: r.address || null,
    activity: r.activity || null,
    service_type: serviceType(r.activity || ''),
    scheduled_date: toISO(r.date),
    po_number: r.po_number || null,
    status: r.status || null,
    raw: r,
  }
}

// Build a standard scaffold adapter object from a small config. Uses closures (no
// `this`) so the named re-exports in each adapter file work when called by run.js.
export function makeScaffold(cfg) {
  const {
    source, label, builder = label, hostRe,
    homeUrl, scheduleUrl, userKey, passKey, sel,
  } = cfg
  async function isLoggedIn(page) {
    const hasPw = await page.$('input[type="password"]').catch(() => null)
    if (hasPw) return false
    return hostRe ? hostRe.test(page.url()) : !/login|signin|auth/i.test(page.url())
  }
  async function login(page, env, { dump } = {}) {
    await formLogin(page, env, { label, startUrl: homeUrl(env), user: env[userKey], pass: env[passKey], userKey, passKey, sel }, dump)
  }
  async function scrape(page, { dump, env = {} }) {
    await page.goto(homeUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
    if (!(await isLoggedIn(page))) await login(page, env, { dump })
    const target = (scheduleUrl && scheduleUrl(env)) || homeUrl(env)
    await page.goto(target, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.waitForTimeout(1500)
    if (dump) await dump('schedule')
    const today = iso(baseDate(env))
    const raw = await genericSchedule(page)
    if (!raw.length) console.warn(`${label}: no schedule table matched. Inspect debug/${source}-*/schedule.html — calibrate parser in the assisted session.`)
    return raw.map((r) => toParsed(source, builder, r)).filter((r) => r.scheduled_date && r.scheduled_date >= today)
  }
  return { meta: { source, label }, homeUrl, isLoggedIn, login, scrape }
}
