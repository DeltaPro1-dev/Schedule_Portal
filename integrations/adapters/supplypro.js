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
    [env.SUPPLYPRO_SEL_USER, '#UserName', '#username', 'input[name="UserName"]', 'input[name="username"]', 'input[type="email"]', 'input[type="text"]'].filter(Boolean),
    env.SUPPLYPRO_USER,
  )
  const p = await fillFirst(
    page,
    [env.SUPPLYPRO_SEL_PASS, '#Password', '#password', 'input[name="Password"]', 'input[type="password"]'].filter(Boolean),
    env.SUPPLYPRO_PASS,
  )
  return !!(u && p)
}

export async function login(page, env) {
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

  const submit =
    (env.SUPPLYPRO_SEL_SUBMIT && (await page.$(env.SUPPLYPRO_SEL_SUBMIT))) ||
    (await page.$('button[type="submit"]')) ||
    (await page.$('input[type="submit"]'))
  if (submit) await submit.click()
  else await page.keyboard.press('Enter')

  await page.waitForLoadState('networkidle').catch(() => {})
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
    let ul = null
    for (const b of document.querySelectorAll('b')) {
      if (norm(b.textContent).toLowerCase() === 'to do') {
        let el = b.nextElementSibling
        while (el && el.tagName !== 'UL') el = el.nextElementSibling
        ul = el
        break
      }
    }
    return ul
      ? [...ul.querySelectorAll('li')].map((li) => ({ line: norm(li.innerText), href: li.querySelector('a')?.href || null }))
      : []
  })
}

export async function scrape(page, { dump, env = {} }) {
  // The SCHEDULE lives in the "To Do Calendar" (CalendarDay.asp). "To Do Orders"
  // is billing data for a later module — not the schedule.
  const link = await page.$('a:has-text("To Do Calendar")')
  if (link) {
    await link.click().catch(() => {})
    await page.waitForLoadState('networkidle').catch(() => {})
  }
  const calBase = page.url().split('?')[0] // .../CalendarDay.asp
  const sessid = (page.url().match(/sessid=([^&]+)/i) || [])[1] || ''

  // Rule: next day; on Friday, Sat/Sun/Mon. (Override "today" with SCRAPE_BASE_DATE.)
  const dates = targetDates(baseDate(env))

  const rows = []
  let first = true
  for (const dt of dates) {
    const p = parts(dt)
    const url = `${calBase}?d=${p.d}&m=${p.m}&y=${p.y}${sessid ? `&sessid=${sessid}` : ''}`
    await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {})
    if (first) { await dump(`calendar-${iso(dt)}`); first = false } // one dump for calibration
    const scheduled_date = iso(dt)
    for (const it of await extractToDo(page)) {
      if (!it.line || !/\bLot\b/i.test(it.line)) continue // skip "No Orders Today"
      const parsed = parseSupplyProOrder(it.line)
      const oid = it.href?.match(/order(?:_|%5f)id=(\d+)/i) // order_id param (NOT OrderDetail/job_id)
      if (oid) parsed.external_id = `order:${oid[1]}`
      rows.push({ ...parsed, scheduled_date, raw: { line: it.line, href: it.href, date: scheduled_date } })
    }
  }
  return rows
}
