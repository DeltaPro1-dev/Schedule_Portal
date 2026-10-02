// Read-only SupplyPro history reader: walks the To Do Calendar day by day for a past period, opens
// every order linked on each day and keeps the PO items and total (to check the invoiced amount per
// house). Writes only local files — nothing goes to the database and no portal action is clicked.
//   node history-supplypro.js 2026-07-01 2026-07-31 <output.json>
import 'dotenv/config'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { login, isLoggedIn, homeUrl, extractDetail } from './adapters/supplypro.js'

const [startIso, endIso, outFile] = process.argv.slice(2)
if (!startIso || !endIso || !outFile) { console.error('usage: node history-supplypro.js <start> <end> <output.json>'); process.exit(1) }
const env = process.env
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const debugDir = `debug/supplypro-history-${stamp}`
await mkdir(debugDir, { recursive: true })

const opts = { headless: true, viewport: null, args: ['--disable-blink-features=AutomationControlled'] }
const context = await chromium.launchPersistentContext('auth/supplypro-profile', { ...opts, channel: 'chrome' }).catch(() => chromium.launchPersistentContext('auth/supplypro-profile', opts))
const page = context.pages()[0] || (await context.newPage())
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const dump = async (tag) => { try { await writeFile(`${debugDir}/${tag}.html`, await page.content()) } catch {} }
const onLogin = async () => /login/i.test((await page.title()) || '') || !!(await page.$('input[type="password"]'))

async function openCalendar() {
  if (await onLogin()) await login(page, env, { dump })
  const link = await page.$('a:has-text("To Do Calendar")')
  if (link) { await link.click().catch(() => {}); await page.waitForLoadState('networkidle').catch(() => {}) }
  if (!link || (await onLogin())) {
    await login(page, env, { dump })
    const again = await page.$('a:has-text("To Do Calendar")')
    if (again) { await again.click().catch(() => {}); await page.waitForLoadState('networkidle').catch(() => {}) }
  }
  return { base: page.url().split('?')[0], sessid: (page.url().match(/sessid=([^&]+)/i) || [])[1] || '' }
}

const orders = new Map()
const days = []
try {
  await page.goto(homeUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  if (!(await isLoggedIn(page))) await login(page, env, { dump })
  await dump('home') // left menu: other order lists (history / completed) for calibration
  let cal = await openCalendar()
  for (let day = new Date(`${startIso}T12:00:00`); day <= new Date(`${endIso}T12:00:00`); day.setDate(day.getDate() + 1)) {
    const date = day.toISOString().slice(0, 10)
    const url = (sid) => `${cal.base}?d=${day.getDate()}&m=${day.getMonth() + 1}&y=${day.getFullYear()}${sid ? `&sessid=${sid}` : ''}`
    await page.goto(url(cal.sessid), { waitUntil: 'networkidle' }).catch(() => {})
    if (await onLogin()) { cal = await openCalendar(); await page.goto(url(cal.sessid), { waitUntil: 'networkidle' }).catch(() => {}) }
    await dump(`calendar-${date}`)
    // every order on the day, whatever the section (To Do, completed, …)
    const links = await page.evaluate(() => [...document.querySelectorAll('a[href*="OrderDetail" i]')].map((a) => ({ href: a.href, text: (a.closest('li') || a).innerText.replace(/\s+/g, ' ').trim() })))
    days.push({ date, links: links.length })
    for (const link of links) {
      const id = link.href.match(/order(?:_|%5f)id=(\d+)/i)?.[1]
      if (!id || orders.has(id)) continue
      orders.set(id, { order_id: id, calendar_date: date, line: link.text, href: link.href })
    }
    console.log(date, links.length, 'links,', orders.size, 'orders so far')
    await pause(800)
  }
  let n = 0
  for (const order of orders.values()) {
    try {
      await page.goto(order.href, { waitUntil: 'networkidle' })
      if (await onLogin()) { cal = await openCalendar(); await page.goto(order.href, { waitUntil: 'networkidle' }) }
      if (n === 0) await dump('order-detail-first')
      Object.assign(order, await extractDetail(page))
    } catch (error) { order.error = error.message }
    if (++n % 25 === 0) { console.log('details', n, '/', orders.size); await writeFile(outFile, JSON.stringify({ days, orders: [...orders.values()] }, null, 1)) }
    await pause(800)
  }
} finally {
  await writeFile(outFile, JSON.stringify({ days, orders: [...orders.values()] }, null, 1))
  console.log('saved', orders.size, 'orders to', outFile)
  await context.close()
}
