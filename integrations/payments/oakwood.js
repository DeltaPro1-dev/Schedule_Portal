// Oakwood (Kova) payments (owner, 2026-10-08): "Purchase Orders (Paid)" lists every paid PO with community,
// lot, activity, amount, start date, paid date (last status change) and check/ACH number. Read-only: the
// robot only filters the list by paid date and reads the grid.
export const meta = { source: 'oakwood', builder: 'Oakwood Homes' }

const LIST = 'https://kova.oakwoodhomesco.com/KovaProduction/Production/Jobs/JobPOList.aspx?qrefobjtype=JobPO&root=true&status=Paid'
const F = 'ctl00$GridContent$_JobPOGrid$_Filters$'
const GRID = '#ctl00_GridContentJobPOGridJobPODataGrid_ctl00'
const CAP = 1000 // Kova shows at most the first 1000 records of a search

const mdy = (iso) => { const [y, m, d] = iso.split('-'); return `${Number(m)}/${Number(d)}/${y}` }
export function isoDate(value) {
  const m = String(value ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null
}
export function money(value) {
  const text = String(value ?? '').trim()
  if (!/\d/.test(text)) return null
  const n = Number(text.replace(/[^0-9.]/g, ''))
  return /^\(|-/.test(text.replace(/[$\s]/g, '')) ? -n : n
}

// Grid row (cells by header) -> portal_payments row.
export function paymentRow(cell) {
  const po = cell['PO#'] || ''
  return {
    payment_key: `${po}-${cell['Incr'] || '0'}`,
    builder: meta.builder,
    community: (cell['Community'] || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || null,
    batch: cell['Batch'] || null,
    address: cell['Address'] || null,
    lot: cell['Lot#'] || null,
    block: cell['Blk'] && cell['Blk'] !== '0' ? cell['Blk'] : null,
    activity_code: cell['Act'] || null,
    activity: cell['Activity'] || null,
    po_number: po || null,
    increment: cell['Incr'] || null,
    is_draw: /^y/i.test(cell['Is Draw PO'] || ''),
    amount: money(cell['PO Amount']),
    start_date: isoDate(cell['Start Date']),
    status: cell['Status'] || null,
    activity_status: cell['Act. Status'] || null,
    paid_date: isoDate(cell['Date']),
    check_number: cell['Check#'] || null,
    ref_number: cell['Ref#'] || null,
    notes: cell['Notes'] || null,
    model: cell['Model Name'] || cell['ModelID'] || null,
    raw: cell,
  }
}

async function readGrid(page) {
  return page.evaluate((grid) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
    const table = document.querySelector(grid)
    if (!table) return { headers: [], rows: [] }
    const rows = [...table.querySelectorAll('tbody > tr.rgRow, tbody > tr.rgAltRow')].map((tr) => [...tr.children].map((td) => norm(td.innerText)))
    // The header row with one cell per data column (Kova adds a pager/command row to the head).
    const headRows = [...(table.tHead?.rows ?? [])].map((tr) => [...tr.cells].map((th) => norm(th.innerText)))
    const headers = headRows.find((cells) => cells.length === rows[0]?.length) ?? headRows[headRows.length - 1] ?? []
    const capMsg = (document.body.innerText.match(/Showing only the first[^\n]*/) || [''])[0]
    const capped = Boolean(capMsg)
    const next = !!document.querySelector('.rgNumPart a.rgCurrentPage + a')
    return { headers, rows, capped, next, capMsg, dates: rows.slice(0, 3).map((r) => r[16]), min: document.querySelector('input[name$="MinDateLastStatusChgTextBox"]')?.value }
  }, GRID)
}

// Kova grids post back through RadAjax: wait for its loading panel to go away.
const LOADING = '.RadAjax.form-loadingpanel'
async function settle(page) {
  await page.waitForTimeout(400)
  await page.waitForSelector(LOADING, { state: 'hidden', timeout: 90000 }).catch(() => {})
  await page.waitForLoadState('networkidle').catch(() => {})
}
async function postbackWait(page, action) {
  await settle(page)
  await action()
  await settle(page)
}

async function search(page, from, to) {
  // A fresh list for each search: the grid keeps the page it was on, which would skip the first page.
  await page.goto(LIST, { waitUntil: 'networkidle' }).catch(() => {})
  await settle(page)
  await page.fill(`input[name="${F}MinDateLastStatusChgTextBox"]`, mdy(from))
  await page.fill(`input[name="${F}MaxDateLastStatusChgTextBox"]`, mdy(to))
  await postbackWait(page, () => page.click(`input[name="${F}ImageGoFilterButton"]`))
  // Kova keeps the grid page in the server session: go back to page 1 before reading.
  const firstPage = '.rgNumPart a:first-child'
  if ((await page.textContent('.rgNumPart a.rgCurrentPage').catch(() => '1'))?.trim() !== '1' && (await page.$(firstPage))) {
    await postbackWait(page, () => page.click(firstPage))
    await page.waitForFunction(() => document.querySelector('.rgNumPart a.rgCurrentPage')?.textContent?.trim() === '1', null, { timeout: 90000 }).catch(() => {})
  }
  const out = []
  for (let pageNo = 1; ; pageNo++) {
    const { headers, rows, capped, next, capMsg, dates, min } = await readGrid(page)
    if (process.env.PAYMENTS_DEBUG) console.log('   page', pageNo, headers.length, 'headers,', rows.length, 'rows', capMsg, JSON.stringify(dates), 'min', min)
    if (capped) return { capped: true, cells: [] }
    out.push(...rows.filter((cells) => cells.length === headers.length).map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i]]))))
    if (!next || pageNo > 20) break
    const current = await page.textContent('.rgNumPart a.rgCurrentPage').catch(() => '')
    await postbackWait(page, () => page.click('.rgNumPart a.rgCurrentPage + a'))
    await page.waitForFunction((was) => document.querySelector('.rgNumPart a.rgCurrentPage')?.textContent !== was, current, { timeout: 90000 }).catch(() => {})
  }
  return { capped: false, cells: out }
}

const addDays = (iso, days) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const monthEnd = (iso) => { const d = new Date(`${iso.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10) }

// Paid POs whose payment date is between from and to, one month (or less) per search so no search hits the cap.
export async function scrapePayments(page, { from, to, log = console.log }) {
  await page.goto(LIST, { waitUntil: 'networkidle' }).catch(() => {})
  // Pages of 100 rows; the pager is followed (changing the page size clears the date filter).
  const out = new Map()
  const windows = []
  for (let start = from; start <= to; start = addDays(monthEnd(start), 1)) windows.push([start, monthEnd(start) < to ? monthEnd(start) : to])
  while (windows.length) {
    const [a, b] = windows.shift()
    const { capped, cells } = await search(page, a, b)
    if (capped && a < b) {
      const mid = addDays(a, Math.floor((Date.parse(b) - Date.parse(a)) / 172800000))
      windows.unshift([a, mid], [addDays(mid, 1), b]); continue
    }
    if (capped) throw new Error(`Oakwood: more than ${CAP} payments on ${a}`)
    for (const cell of cells) { const row = paymentRow(cell); out.set(row.payment_key, row) }
    log(`  ${a}..${b}: ${cells.length} paid POs`)
  }
  return [...out.values()]
}
