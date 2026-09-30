// BuilderLynx vendor portals (Candlelight, DAI, Concord). Calibrated 2026-09-29 on the live portals:
// the supplier home links "Unit Tasks" by status to ScheduleLiveAreaTaskSearch.jsp, a table with
//   ID (SLAT #n) | Area ("Phase 1 Blocks > BLD 10") | Schedule Live Task ("FINAL CLEAN") | ... |
//   Start Date ("May 8, 2025 Thu") | End Date | Status | ... | Completion Supplier
// Builders leave old tasks as "New", so only tasks starting from today up to WINDOW_DAYS (60) ahead are
// kept. The session is not persisted on every portal, so the login form is always checked first.
import { serviceType } from './normalize.js'
import { formLogin } from './scaffold.js'

const STATUSES = ['New', 'In progress', 'Scheduled', 'Schedule Work Order', 'Confirmed', 'Late']
const WINDOW_DAYS = 60
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

// "May 8, 2025 Thu" → "2025-05-08"
export function blDate(text) {
  const m = String(text || '').match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})/)
  if (!m || !MONTHS[m[1].toLowerCase()]) return null
  return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

// Table rows (cells as text, first row = header) → imported_schedules rows.
export function taskRows(source, builder, table, today, windowDays = WINDOW_DAYS) {
  const [head, ...body] = table
  const col = (re) => head.findIndex((h) => re.test(h))
  const i = { id: col(/^id$/i), area: col(/^area$/i), task: col(/schedule live task|^task$/i), start: col(/start date/i), status: col(/^status$/i) }
  if (i.id < 0 || i.task < 0 || i.start < 0) return []
  const last = new Date(`${today}T12:00:00Z`); last.setUTCDate(last.getUTCDate() + windowDays)
  const until = last.toISOString().slice(0, 10)
  const seen = new Set()
  const rows = []
  for (const cells of body) {
    const id = (cells[i.id] || '').match(/#\s*(\d+)/)?.[1]
    const scheduled_date = blDate(cells[i.start])
    if (!id || !scheduled_date || scheduled_date < today || scheduled_date > until || seen.has(id)) continue
    seen.add(id)
    const area = (cells[i.area] || '').replace(/\s+/g, ' ').trim()
    const parts = area.split('>').map((s) => s.trim()).filter(Boolean)
    const activity = (cells[i.task] || '').replace(/\s+/g, ' ').trim()
    rows.push({
      external_id: `${source}:slat:${id}`,
      builder,
      community: parts.length > 1 ? parts.slice(0, -1).join(' > ') : area || null,
      subdivision: parts[0] || null,
      lot: parts.length > 1 ? parts.at(-1) : null,
      activity,
      service_type: serviceType(activity),
      scheduled_date,
      status: i.status > -1 ? cells[i.status] || null : null,
      raw: { id, area, task: activity, start: cells[i.start], status: i.status > -1 ? cells[i.status] : null },
    })
  }
  return rows
}

export function makeBuilderLynx({ source, label, builder = label, host, userKey, passKey, urlKey }) {
  const baseOf = (env) => (env[urlKey] || host).replace(/\/(cc\/?)?$/, '')
  const homeUrl = (env) => `${baseOf(env)}/cc/`
  async function isLoggedIn(page) {
    await page.waitForLoadState('domcontentloaded').catch(() => {})
    await page.waitForTimeout(1500) // the login form renders after the first paint
    return !(await page.$('input[type="password"]').catch(() => null)) && /builderlynx/i.test(page.url())
  }
  async function login(page, env, { dump } = {}) {
    await formLogin(page, env, { label, startUrl: homeUrl(env), user: env[userKey], pass: env[passKey], userKey, passKey }, dump)
  }
  async function scrape(page, { dump, env = {} }) {
    await page.goto(homeUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
    if (!(await isLoggedIn(page))) await login(page, env, { dump })
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
    const rows = []
    for (const status of STATUSES) {
      const url = `${baseOf(env)}/cc/module1design/schedule/ScheduleLiveAreaTaskSearch.jsp?statuses=${encodeURIComponent(status)}&grouping=Supplier&supplier=&ordering=Closing%20Date&cid=-1`
      await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForTimeout(1200)
      if (await page.$('input[type="password"]').catch(() => null)) throw new Error(`${label}: session lost while reading the task list.`)
      if (status === 'New' && dump) await dump('tasks-new')
      const table = await page.evaluate(() => {
        const text = (cell) => cell.innerText.replace(/\s+/g, ' ').trim()
        // The header row has exactly "ID", "Schedule Live Task" and "Start Date" cells (the Group By /
        // Sort By filter box above the list also contains those words, in one cell).
        for (const tr of document.querySelectorAll('tr')) {
          const head = [...tr.cells].map(text)
          if (!(head.includes('ID') && head.includes('Schedule Live Task') && head.includes('Start Date'))) continue
          const rows = [...tr.closest('table').rows].map((r) => [...r.cells].map(text))
          return [head, ...rows.filter((cells) => cells.length === head.length && /SLAT\s*#/i.test(cells.join(' ')))]
        }
        return null
      })
      if (table) rows.push(...taskRows(source, builder, table, today))
    }
    const unique = [...new Map(rows.map((r) => [r.external_id, r])).values()]
    console.log(`[${source}] ${unique.length} task(s) from ${today} to +${WINDOW_DAYS} days`)
    return unique
  }
  return { meta: { source, label }, homeUrl, isLoggedIn, login, scrape }
}
