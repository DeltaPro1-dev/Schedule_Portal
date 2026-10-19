// Ivory POs (owner, 2026-10-08): the vendor portal's Purchase Orders list, active and archived, with lot,
// activity, issued / approved / completion dates and the PO value. Read-only: the robot asks the same list the
// screen shows (DataTables JSON), 500 rows per page.
export const meta = { source: 'ivory', builder: 'Ivory Homes' }
const LIST_PAGE = 'https://ivoryconstructionportal.com/vendorApp/purchase-order'

const iso = (mdy) => { const m = String(mdy ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[1]}-${m[2]}` : null }
const num = (value) => { const n = Number(String(value ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null }

// One list row -> operations.portal_pos row. The PO is dated by the job's completion when there is one,
// otherwise by its issue date, so it lands next to the Field Control work.
export function poRow(d) {
  const end = iso(d.actual_end_date); const issued = iso(d.podateissued)
  const total = num(d.total ?? d.poamount)
  return {
    source: meta.source, order_id: String(d.ponumber), builder: meta.builder, subdivision: d.area_name || d.area_desc || null,
    lot: d.lot_number ? String(d.lot_number) : null, task: d.pactivity || null, builder_order_no: d.pojobnumber || null,
    po_date: end || issued, total: total ?? 0, origin: 'robot',
    items: [{ status: d.state_name ?? null, issued, approved: iso(d.podateapproved), completed: end, description: d.podescription ?? null, amount: num(d.poamount), tax: num(d.taxamount), address: d.siteaddress1 ?? null }],
  }
}

export async function scrapePOs(page, { log = console.log } = {}) {
  let template = null
  page.on('request', (request) => { if (!template && request.url().endsWith('/vendorApp/purchaselist')) template = { body: request.postData(), csrf: request.headers()['x-csrf-token'] || '' } })
  await page.goto(LIST_PAGE, { waitUntil: 'networkidle' }).catch(() => {})
  for (let i = 0; i < 20 && !template; i++) await page.waitForTimeout(500)
  if (!template) throw new Error('Ivory: the PO list request was not seen')
  const rows = new Map()
  const list = (status, start, length) => page.evaluate(async ({ body, csrf, status, start, length }) => {
    const params = new URLSearchParams(body)
    params.set('job_status', status); params.set('from_date', ''); params.set('to_date', ''); params.set('start', String(start)); params.set('length', String(length))
    const response = await fetch('/vendorApp/purchaselist', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-csrf-token': csrf, 'x-requested-with': 'XMLHttpRequest' }, body: params.toString() })
    if (!response.ok) return { error: response.status }
    const json = await response.json()
    return { total: json.recordsFiltered, data: json.data ?? [] }
  }, { ...template, status, start, length })
  for (const status of ['active', 'archive']) {
    // The list has no fixed order, so pages of 500 skipped some POs and repeated others on every run (2026-10-19:
    // 324 missing on one run, 200 on another). Ask the whole list in one request; page only if the portal refuses.
    const first = await list(status, 0, 500)
    if (first.error) throw new Error(`Ivory list ${status} returned ${first.error}`)
    log(`  ${status}: ${first.total} POs`)
    const whole = first.total > 500 ? await list(status, 0, first.total) : first
    if (!whole.error && whole.data.length >= first.total) {
      for (const d of whole.data) if (d.ponumber) rows.set(String(d.ponumber), poRow(d))
      continue
    }
    for (const d of first.data) if (d.ponumber) rows.set(String(d.ponumber), poRow(d))
    for (let start = 500; start < first.total; start += 500) {
      const result = await list(status, start, 500)
      if (result.error) throw new Error(`Ivory list ${status} returned ${result.error}`)
      for (const d of result.data) if (d.ponumber) rows.set(String(d.ponumber), poRow(d))
      if (!result.data.length) break
    }
  }
  return [...rows.values()].filter((row) => row.po_date)
}
