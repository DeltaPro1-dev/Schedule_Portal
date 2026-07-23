// SupplyPro (Hyphen) adapter. First-pass, DOM-agnostic extraction from rendered
// text — resilient enough for a POC. Every run also dumps HTML + a screenshot so
// selectors/parsing can be tightened against the real page. Covers multiple
// builders under one SupplyPro login.
import { parseSupplyProOrder } from '../lib/normalize.js'

export const meta = { source: 'supplypro', label: 'SupplyPro (Hyphen)' }

async function fillFirst(page, selectors, value) {
  for (const sel of selectors) {
    const el = await page.$(sel)
    if (el) { await el.fill(value); return sel }
  }
  return null
}

export async function login(page, env) {
  await page.goto(env.SUPPLYPRO_URL, { waitUntil: 'domcontentloaded' })
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
  if (!u || !p) throw new Error('SupplyPro login fields not found — set SUPPLYPRO_SEL_USER/PASS in .env after inspecting debug/ HTML')

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

export async function scrape(page, { dump }) {
  // Land on the orders / To Do view if not already there.
  if (!(await isLoggedIn(page))) {
    // some tenants land on a dashboard; try the Orders nav
    const orders = await page.$('a:has-text("Orders"), a:has-text("To Do")')
    if (orders) await orders.click().catch(() => {})
    await page.waitForLoadState('networkidle').catch(() => {})
  }
  await dump('orders') // screenshot + HTML for calibration

  const bodyText = await page.evaluate(() => document.body.innerText)
  const dateM = bodyText.match(/To Do Orders For\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i)
  const scheduled_date = dateM ? toISO(dateM[1]) : null

  const lines = bodyText.split('\n').map((s) => s.trim()).filter(Boolean)
  // order lines look like "<Activity> [codes][flags] - Block X, Lot Y, <address>"
  const orderLines = lines.filter((l) => /\bLot\b/i.test(l) && (l.includes('[') || /\bBlock\b/i.test(l)))

  return orderLines.map((line) => ({ ...parseSupplyProOrder(line), scheduled_date, raw: { line } }))
}
