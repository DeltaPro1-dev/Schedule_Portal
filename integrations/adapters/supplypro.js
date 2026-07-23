// SupplyPro (Hyphen) adapter. First-pass, DOM-agnostic extraction from rendered
// text — resilient enough for a POC. Every run also dumps HTML + a screenshot so
// selectors/parsing can be tightened against the real page. Covers multiple
// builders under one SupplyPro login.
import { parseSupplyProOrder } from '../lib/normalize.js'
import { targetDates, parts, iso, baseDate } from '../lib/dates.js'

export const meta = { source: 'supplypro', label: 'SupplyPro (Hyphen)' }

async function fillFirst(page, selectors, value) {
  for (const sel of selectors) {
    const el = await page.$(sel)
    if (el) { await el.fill(value); return sel }
  }
  return null
}

// The order-management portal login (www.supplypro.com is just the marketing site).
const PORTAL_LOGIN = 'https://supplysystem.supplypro.com/'

async function tryFillCreds(page, env) {
  const u = await fillFirst(
    page,
    [env.SUPPLYPRO_SEL_USER, '#user_name', 'input[name="user_name"]', '#UserName', 'input[name="UserName"]', 'input[type="email"]', 'input[type="text"]'].filter(Boolean),
    env.SUPPLYPRO_USER,
  )
  const p = await fillFirst(
    page,
    [env.SUPPLYPRO_SEL_PASS, '#password', 'input[name="password"]', '#Password', 'input[type="password"]'].filter(Boolean),
    env.SUPPLYPRO_PASS,
  )
  return !!(u && p)
}

async function submitLogin(page, env) {
  const submit =
    (env.SUPPLYPRO_SEL_SUBMIT && (await page.$(env.SUPPLYPRO_SEL_SUBMIT))) ||
    (await page.$('input[name="cmdSubmit"]')) ||
    (await page.$('input[type="submit"]')) ||
    (await page.$('button[type="submit"]'))
  if (submit) await submit.click().catch(() => {})
  else await page.keyboard.press('Enter')
  await page.waitForLoadState('networkidle').catch(() => {})
}

// SupplyPro shows a "Force Login" prompt when the account is already logged in
// elsewhere — tick the box and confirm to take over the session.
async function handleForceLogin(page, dump) {
  const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '')
  if (!/force ?login|already (logged|signed)|active session|another (session|location)|currently logged/i.test(text)) return
  if (dump) await dump('force-login')
  const cb =
    (await page.$('input[type="checkbox"][name*="force" i]')) ||
    (await page.$('input[type="checkbox"][id*="force" i]')) ||
    (await page.$('input[type="checkbox"]'))
  if (cb) await cb.check().catch(() => {})
  const btn =
    (await page.$('input[value*="force" i]')) ||
    (await page.$('button:has-text("Force")')) ||
    (await page.$('a:has-text("Force")')) ||
    (await page.$('input[name="cmdSubmit"]')) ||
    (await page.$('input[type="submit"]')) ||
    (await page.$('button[type="submit"]'))
  if (btn) { await btn.click().catch(() => {}); await page.waitForLoadState('networkidle').catch(() => {}) }
}

export async function login(page, env, { dump } = {}) {
  await page.goto(env.SUPPLYPRO_URL || PORTAL_LOGIN, { waitUntil: 'domcontentloaded' })
  let filled = await tryFillCreds(page, env)
  if (!filled) {
    // likely the marketing site — follow its "LOG IN" link to the real portal
    const link = await page.$('a:has-text("LOG IN"), a:has-text("Log In"), a:has-text("Login"), a:has-text("Sign In")')
    if (link) {
      await link.click().catch(() => {})
      await page.waitForLoadState('networkidle').catch(() => {})
    } else {
      await page.goto(PORTAL_LOGIN, { waitUntil: 'domcontentloaded' }).catch(() => {})
    }
    filled = await tryFillCreds(page, env)
  }
  if (!filled) throw new Error('SupplyPro login fields not found — check debug/ HTML and set SUPPLYPRO_SEL_USER/PASS in .env')

  await submitLogin(page, env)
  await handleForceLogin(page, dump) // take over an existing session if prompted
}

// True if we appear to be logged in (Order Management visible).
export async function isLoggedIn(page) {
  const t = await page.evaluate(() => document.body?.innerText || '').catch(() => '')
  return /Order Management|Sign Out|To Do/i.test(t)
}

function toISO(mdy) {
  const m = String(mdy).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  let [, mm, dd, yy] = m
  if (yy.length === 2) yy = '20' + yy
  return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

// Extract the "To Do" order <li> items on the current CalendarDay page.
//   <li><a href="...OrderDetail.asp?...order_id=NNN...">Activity [codes][flags]</a>
//        - <span>Block X, Lot Y, address</span></li>
async function extractToDo(page) {
  return page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    // The section header is <b>To Do</b> immediately followed by its <ul>.
    // (The left-nav also has a <b>&nbsp;To Do</b> — it has no adjacent <ul>, so skip it.)
    let ul = null
    for (const b of document.querySelectorAll('b')) {
      if (norm(b.textContent).toLowerCase() !== 'to do') continue
      const sib = b.nextElementSibling
      if (sib && sib.tagName === 'UL') { ul = sib; break }
    }
    return ul
      ? [...ul.querySelectorAll('li')].map((li) => ({ line: norm(li.innerText), href: li.querySelector('a')?.href || null }))
      : []
  })
}

// Extract the circled OrderDetail fields. Fields render as `<b>Label:</b><br>value`
// (detail column) or `<b>Label:</b></td><td>value` (Order Information table); the
// builder title is a centered `<td class="large"><b>…</b></td>`.
async function extractDetail(page) {
  const html = await page.evaluate(() => document.body.innerHTML)
  const dec = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  const grab = (labels) => {
    for (const lab of labels) {
      const re = new RegExp('<b>\\s*' + esc(lab) + '\\s*:?\\s*</b>(?:\\s|</td>|<td[^>]*>|<br\\s*/?>|<b>|</b>)*([^<]+)', 'i')
      const m = html.match(re)
      if (m && dec(m[1])) return dec(m[1])
    }
    return null
  }
  const b = html.match(/class="large"[^>]*>\s*<b>([^<]+)<\/b>/i)
  return {
    task: grab(['Task']),
    planEtc: grab(['Plan / Elevation / Swing', 'Plan/Elevation/Swing']),
    subPhase: grab(['Subdivision / Phase', 'Subdivision/Phase']),
    lotBlock: grab(['Lot / Block', 'Lot/Block']),
    jobStart: grab(['Job Start Date']),
    orderNo: grab(["Builder's Order Number", 'Builder Order Number']),
    builder: b ? dec(b[1]) : null,
  }
}

const splitSlash = (s, n) => (s ? s.split('/').map((x) => x.trim()) : []).concat(Array(n).fill(null)).slice(0, n)

export async function scrape(page, { dump, env = {} }) {
  // The SCHEDULE lives in the "To Do Calendar" (CalendarDay.asp). "To Do Orders"
  // is billing data for a later module — not the schedule.
  const onLogin = async () => /login/i.test((await page.title()) || '') || !!(await page.$('input[type="password"]'))
  const openCalendar = async () => {
    const l = await page.$('a:has-text("To Do Calendar")')
    if (l) { await l.click().catch(() => {}); await page.waitForLoadState('networkidle').catch(() => {}) }
    return !!l
  }
  // Ensure we're logged in and on the calendar (heals an expired --persist session).
  if (await onLogin()) await login(page, env, { dump })
  if (!(await openCalendar()) || (await onLogin())) { await login(page, env, { dump }); await openCalendar() }
  let calBase = page.url().split('?')[0] // .../CalendarDay.asp
  let sessid = (page.url().match(/sessid=([^&]+)/i) || [])[1] || ''

  // Rule: next day; on Friday, Sat/Sun/Mon. (Override "today" with SCRAPE_BASE_DATE.)
  const dates = targetDates(baseDate(env))

  const rows = []
  let calDumped = false
  let detailDumped = false
  for (const dt of dates) {
    const p = parts(dt)
    const dayUrl = (sid) => `${calBase}?d=${p.d}&m=${p.m}&y=${p.y}${sid ? `&sessid=${sid}` : ''}`
    await page.goto(dayUrl(sessid), { waitUntil: 'networkidle' }).catch(() => {})
    if (await onLogin()) {
      // session expired mid-run → re-login, refresh sessid, retry this date
      await login(page, env, { dump })
      await openCalendar()
      calBase = page.url().split('?')[0]
      sessid = (page.url().match(/sessid=([^&]+)/i) || [])[1] || sessid
      await page.goto(dayUrl(sessid), { waitUntil: 'networkidle' }).catch(() => {})
    }
    if (!calDumped) { await dump(`calendar-${iso(dt)}`); calDumped = true }
    const scheduled_date = iso(dt)
    // capture the list first (visiting a detail navigates away from the calendar)
    const items = (await extractToDo(page)).filter((it) => it.line && /\bLot\b/i.test(it.line))
    for (const it of items) {
      const parsed = parseSupplyProOrder(it.line)
      const oid = it.href?.match(/order(?:_|%5f)id=(\d+)/i) // order_id param (NOT OrderDetail/job_id)
      if (oid) parsed.external_id = `order:${oid[1]}`

      let detail = {}
      if (it.href) {
        try {
          await page.goto(it.href, { waitUntil: 'networkidle' })
          if (!detailDumped) { await dump('order-detail'); detailDumped = true } // calibrate once
          detail = await extractDetail(page)
        } catch { /* keep the base row if the detail page fails */ }
      }
      const [plan, elevation, swing] = splitSlash(detail.planEtc, 3)
      const [subdivision, phase] = splitSlash(detail.subPhase, 2)
      const [lotD, blockD] = splitSlash(detail.lotBlock, 2)

      rows.push({
        ...parsed,
        builder: detail.builder || parsed.builder || null,
        community: subdivision || parsed.community || null,
        subdivision: subdivision || null,
        phase: phase || null,
        plan: plan || null,
        elevation: elevation || null,
        swing: swing || null,
        lot: lotD || parsed.lot || null,
        block: blockD || parsed.block || null,
        job_start_date: detail.jobStart ? toISO(detail.jobStart) : null,
        builder_order_no: detail.orderNo || null,
        scheduled_date,
        raw: { line: it.line, href: it.href, date: scheduled_date, detail },
      })
    }
  }
  return rows
}
