// Ivory Construction Portal adapter. The dashboard supplies the forward schedule;
// each unique job page enriches rows with plan, address and superintendent details.

export const meta = { source: 'ivory', label: 'Ivory Homes' }

const BASE_URL = 'https://ivoryconstructionportal.com'
const dashboardUrl = (env) => `${(env.IVORY_BASE_URL || BASE_URL).replace(/\/$/, '')}/vendorApp/dashboard`
export const homeUrl = dashboardUrl

export async function isLoggedIn(page) {
  return !/\/login(?:$|[/?])/i.test(page.url()) && !!(await page.$('a[href*="/vendorApp/logout"]'))
}

export async function login(page, env, { dump } = {}) {
  const base = (env.IVORY_BASE_URL || BASE_URL).replace(/\/$/, '')
  if (!env.IVORY_USER || !env.IVORY_PASS) throw new Error('IVORY_USER and IVORY_PASS are required in integrations/.env')
  await page.goto(`${base}/vendorApp/login`, { waitUntil: 'domcontentloaded' })

  const ivory = await page.$('button:has-text("Ivory")')
  if (ivory) await ivory.click().catch(() => {})
  const user = await page.$('input[name="user"]')
  const pass = await page.$('input[name="pass"]')
  if (!user || !pass) throw new Error('Ivory login fields not found')
  await user.fill(env.IVORY_USER)
  await pass.fill(env.IVORY_PASS)
  const remember = await page.$('input[name="remember"]')
  if (remember) await remember.check().catch(() => {})
  const submit = await page.$('button[type="submit"]')
  if (submit) await submit.click()
  else await page.keyboard.press('Enter')

  const authed = await page.waitForURL((url) => !/\/login(?:$|[/?])/i.test(url.pathname), { timeout: 30000 }).then(() => true).catch(() => false)
  if (!authed || !(await isLoggedIn(page))) {
    if (dump) await dump('login-stuck')
    throw new Error('Ivory login not completed. Run with --headful and select Ivory/sign in once to refresh the persistent session.')
  }
}

async function extractDashboardRows(page) {
  return page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    const rows = []
    for (const table of document.querySelectorAll('table.activity-table')) {
      const dm = String(table.id || '').match(/^(\d{2})(\d{2})(\d{4})$/)
      if (!dm) continue
      const scheduled_date = `${dm[3]}-${dm[1]}-${dm[2]}`
      for (const tr of table.querySelectorAll('tbody tr')) {
        const cells = [...tr.querySelectorAll('td')].map((td) => norm(td.innerText))
        const activity = cells[0] || null
        const community = cells[1] || null
        const lot = cells[2] || null
        if (!activity || !community) continue
        const jobHref = tr.querySelector('a[href*="/vendorApp/jobs/"][href*="/active/null/"]')?.href || ''
        const poHref = tr.querySelector('a[title="View Purchase Order"]')?.href || ''
        const jobToken = (jobHref.match(/\/jobs\/([^/]+)\/active\/null\//) || [])[1] || null
        const poNumber = (poHref.match(/\/(\d+)\/?$/) || [])[1] || null
        rows.push({
          activity, community, lot, scheduled_date, jobHref, jobToken, poNumber,
          scheduled_start: cells[3] || null,
          scheduled_finish: cells[4] || null,
          superintendent_notes: cells[5] || null,
        })
      }
    }
    return rows
  })
}

async function extractJobDetail(page) {
  return page.evaluate(() => {
    const value = (placeholder) => document.querySelector(`input[placeholder="${placeholder}"]`)?.value?.trim() || null
    return {
      plan: value('Plan Name'),
      address: value('Address'),
      super_name: value('Superintendent Name'),
      super_email: value('Superintendent Email'),
      super_phone: value('Superintendent Phone'),
    }
  })
}

export async function scrape(page, { dump, env = {} }) {
  await page.goto(dashboardUrl(env), { waitUntil: 'networkidle' }).catch(() => {})
  if (!(await isLoggedIn(page))) {
    await login(page, env, { dump })
    await page.goto(dashboardUrl(env), { waitUntil: 'networkidle' }).catch(() => {})
  }
  await page.waitForSelector('table.activity-table', { state: 'attached', timeout: 30000 })
  if (dump) await dump('dashboard')
  const dashboardRows = await extractDashboardRows(page)

  // A job may contain several scheduled cleaning tasks. Visit it only once.
  const details = new Map()
  for (const href of new Set(dashboardRows.map((r) => r.jobHref).filter(Boolean))) {
    try {
      await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForSelector('input[placeholder="Plan Name"]', { state: 'attached', timeout: 15000 })
      details.set(href, await extractJobDetail(page))
    } catch (e) {
      console.warn(`Ivory detail skipped (${href}): ${e.message}`)
      details.set(href, {})
    }
  }

  return dashboardRows.map((r) => {
    const detail = details.get(r.jobHref) || {}
    const externalKey = r.poNumber || r.jobToken || `${r.community}|${r.lot}`
    return {
      external_id: `ivory:${externalKey}:${r.scheduled_date}:${r.activity}`.slice(0, 200),
      builder: 'Ivory Homes',
      community: r.community,
      subdivision: r.community,
      lot: r.lot,
      activity: r.activity,
      scheduled_date: r.scheduled_date,
      po_number: r.poNumber,
      plan: detail.plan || null,
      address: detail.address || null,
      super_name: detail.super_name || null,
      super_email: detail.super_email || null,
      super_phone: detail.super_phone || null,
      status: null,
      raw: { ...r, ...detail, job_href: r.jobHref || null, po_number: r.poNumber },
    }
  })
}