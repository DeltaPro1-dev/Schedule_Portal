// Arive Homes adapter. Arive runs on IHMS web (arr.ihmsweb.com, classic CGI,
// ihmsweb.exe). The vendor calendar (pgm=marwbvt) is a MONTH view. Key findings from
// the assisted calibration:
//   - The "All developments" view (developmentcode=00) renders an EMPTY month grid.
//   - A SINGLE development's calendar (developmentcode=<CODE>) embeds that dev's jobs
//     in the day cells: each job is a `.oneDayScheduleDesc` collapsible headed by
//     "<code> <jobNo> (<address> Block/Lot: <b>/<l>) - <service>", inside the day's
//     <td> whose icon is images/calendar/<day>.png.
//   - Month nav is a URL param: &Month=MMDDYYYY (first of month).
// So we read the dev list from the picker, then scan each development's calendar for
// the target month(s) and keep the target day's jobs. Delta needs the NEXT day
// (Fri -> Sat+Sun+Mon). Login verified live.
import { serviceType } from '../lib/normalize.js'
import { baseDate, iso, targetDates } from '../lib/dates.js'

export const meta = { source: 'arive', label: 'Arive Homes' }

const BASE = 'https://arr.ihmsweb.com/cgi-bin/ihmsweb.exe'
const baseOf = (env) => env.ARIVE_BASE_URL || BASE
const company = (env) => env.ARIVE_COMPANY || '010'
const pickerUrl = (env) => `${baseOf(env)}?pgm=marwbvt`
const devCalUrl = (env, code, monthP) =>
  `${baseOf(env)}?pgm=marwbvt&companycode=${company(env)}&developmentcode=${code}` +
  `&filter_companycode=all&filter_alpha=all&Month=${monthP}`
export const homeUrl = pickerUrl

// Calendar month param for a date: MM + '01' + YYYY.
const monthParam = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}01${d.getFullYear()}`

export async function isLoggedIn(page) {
  const hasPw = await page.$('input[type="password"]').catch(() => null)
  if (hasPw) return false
  const body = (await page.content().catch(() => '')) || ''
  return /Scheduling|ihmscalendar|marwbvt|Select\/Change Development/i.test(body) && /ihmsweb/i.test(page.url())
}

export async function login(page, env, { dump } = {}) {
  if (!env.ARIVE_USER || !env.ARIVE_PASS) throw new Error('ARIVE_USER and ARIVE_PASS are required in integrations/.env')
  await page.goto(baseOf(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForSelector('input[type="password"]', { timeout: 25000 }).catch(() => {})
  const user =
    (env.ARIVE_SEL_USER && (await page.$(env.ARIVE_SEL_USER))) ||
    (await page.$('input[name*="user" i], input[name*="login" i], input[type="text"]'))
  const pass = (env.ARIVE_SEL_PASS && (await page.$(env.ARIVE_SEL_PASS))) || (await page.$('input[type="password"]'))
  if (!user || !pass) { if (dump) await dump('login-stuck'); throw new Error('Arive login fields not found — calibrate selectors with --headful.') }
  await user.fill(env.ARIVE_USER)
  await pass.fill(env.ARIVE_PASS)
  const submit =
    (env.ARIVE_SEL_SUBMIT && (await page.$(env.ARIVE_SEL_SUBMIT))) ||
    (await page.$('input[type="submit"], button[type="submit"], input[value*="Login" i], button:has-text("Login")'))
  if (submit) await submit.click().catch(() => {})
  else await page.keyboard.press('Enter')
  await page.waitForLoadState('networkidle').catch(() => {})
  if (!(await isLoggedIn(page))) { if (dump) await dump('login-stuck'); throw new Error('Arive login not completed — run --headful and finish it once.') }
}

// One collapsible heading per job: "<code> <jobNo> (<address> Block/Lot: <b>/<l>) - <service>"
const CARD = /^([A-Z]{1,4})\s+(\d{5,})\s*\(\s*(.+?)\s*Block\/Lot:\s*([0-9A-Za-z]+)\s*\/\s*([0-9A-Za-z]+)\s*\)\s*-\s*(.+)$/

// The development codes Delta can be scheduled in — read from the picker list.
async function developmentCodes(page, env) {
  if (env.ARIVE_DEVS) return env.ARIVE_DEVS.split(',').map((s) => s.trim()).filter(Boolean)
  await page.goto(pickerUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(400)
  return page.evaluate(() => {
    const s = new Set()
    for (const a of document.querySelectorAll('a[href*="developmentcode="]')) {
      const m = (a.getAttribute('href') || '').match(/developmentcode=([A-Za-z0-9]+)/)
      if (m && m[1] !== '00') s.add(m[1])
    }
    return [...s]
  })
}

// Read the embedded job cards on a single development's month calendar, each tagged
// with its day-of-month (from the containing cell's calendar/<day>.png icon).
async function extractCardsWithDay(page) {
  return page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    const out = []
    for (const card of document.querySelectorAll('.oneDayScheduleDesc')) {
      const text = norm(card.innerText)
      if (!/Block\/Lot/i.test(text)) continue
      const td = card.closest('td')
      let day = null
      const img = td?.querySelector('img.ihmscalicon[src*="calendar/"]')
      if (img) { const m = (img.getAttribute('src') || '').match(/calendar\/(\d+)\.png/); if (m) day = +m[1] }
      if (!day) { const lbl = td?.querySelector('.formcellheading'); const m = lbl && norm(lbl.innerText).match(/\[(\d+)\]/); if (m) day = +m[1] }
      const coll = card.closest('.ui-collapsible') || card.parentElement
      const href = coll?.querySelector('a[href*="marwjobs"][href*="housenumber"]')?.getAttribute('href') || null
      out.push({ day, text, href })
    }
    return out
  })
}

// Enrich a job from its marwjobs detail page: subdivision + city (from the
// "Job Start -- <Subdivision>- <City> (CODE)" header), plan (Model/Elevation),
// superintendent (name/phone/email). Fields come from a jQuery Mobile reflow table
// where each cell is "<label><value>".
async function extractDetail(page) {
  return page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    const f = {}
    for (const td of document.querySelectorAll('td, div.formcell, li')) {
      const lab = td.querySelector('.ui-table-cell-label, .formcellheading, b, label')
      if (!lab) continue
      const label = norm(lab.innerText)
      if (!label || label.length > 32) continue
      const full = norm(td.innerText)
      const value = full.startsWith(label) ? norm(full.slice(label.length)) : norm(full.replace(label, ''))
      if (value && !f[label]) f[label] = value
    }
    let subdivision = null, city = null
    const m = norm(document.body.innerText).match(/--\s*(.+?)\s*\(([A-Z]{1,4})\)/)
    if (m) { const parts = m[1].split(/-\s+/); if (parts.length > 1) city = parts.pop().trim(); subdivision = parts.join('- ').trim() }
    return {
      subdivision, city,
      plan: f['Model/Elevation'] || null,
      super_name: f['Superintendent'] || null,
      super_phone: f['Phone'] || null,
      super_email: f['Email'] || null,
      address: f['Address'] || null,
    }
  })
}

export async function scrape(page, { dump, env = {} }) {
  await page.goto(pickerUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  if (!(await isLoggedIn(page))) {
    await login(page, env, { dump })
  }

  const targetDs = targetDates(baseDate(env))
  const targetSet = new Set(targetDs.map(iso))
  const months = [...new Set(targetDs.map(monthParam))]

  const codes = await developmentCodes(page, env)
  console.log(`[arive] scanning ${codes.length} developments for ${[...targetSet].join(', ')}`)

  const rows = []
  const seen = new Set()
  let scanned = 0
  for (const code of codes) {
    for (const mp of months) {
      await page.goto(devCalUrl(env, code, mp), { waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForTimeout(350)
      const mm = mp.slice(0, 2)
      const yyyy = mp.slice(4)
      for (const c of await extractCardsWithDay(page)) {
        if (!c.day) continue
        const scheduled_date = `${yyyy}-${mm}-${String(c.day).padStart(2, '0')}`
        if (!targetSet.has(scheduled_date)) continue
        const m = c.text.match(CARD)
        if (!m) continue
        const [, dcode, jobNo, address, block, lot, serviceRaw] = m
        const service = serviceRaw.replace(/\s+\d+\s*$/, '').trim()
        const house = (c.href && (c.href.match(/housenumber=(\w+)/) || [])[1]) || jobNo
        const external_id = `arive:${house}:${service}`.slice(0, 200)
        if (seen.has(external_id)) continue
        seen.add(external_id)
        rows.push({
          external_id,
          builder: 'Arive Homes',
          community: dcode || code,
          subdivision: dcode || code,
          lot,
          block,
          address: address.trim() || null,
          activity: service,
          service_type: serviceType(service),
          scheduled_date,
          builder_order_no: jobNo,
          status: null,
          raw: { code, dcode, jobNo, house, address: address.trim(), block, lot, service, href: c.href },
        })
      }
    }
    scanned += 1
  }
  console.log(`[arive] scanned ${scanned} developments · ${rows.length} job(s) on target day(s)`)

  // Enrich each target-day job from its detail page (subdivision/city/plan/super).
  for (const r of rows) {
    const href = r.raw?.href
    if (!href) continue
    try {
      await page.goto(new URL(href, baseOf(env)).href, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(400)
      const d = await extractDetail(page)
      if (d.subdivision) { r.community = d.subdivision; r.subdivision = d.subdivision }
      if (d.plan) r.plan = d.plan
      if (d.address) r.address = d.address
      if (d.city && r.address && !r.address.includes(d.city)) r.address = `${r.address}, ${d.city}`
      r.super_name = d.super_name
      r.super_phone = d.super_phone
      r.super_email = d.super_email
      r.raw.detail = d
    } catch (e) {
      console.warn(`[arive] detail enrich skipped (${href}): ${e.message}`)
    }
  }

  if (dump) await dump('last-dev-calendar')
  return rows
}
