// Normalize raw portal rows into schedule_portal.imported_schedules shape.

// Map free-text activity to a coarse service_type (extend as needed).
export function serviceType(activity = '') {
  const a = activity.toLowerCase()
  if (a.includes('power') || a.includes('pressure')) return 'Power Wash'
  if (a.includes('window')) return 'Windows'
  if (a.includes('touch')) return 'Touch Up'
  if (a.includes('final') || a.includes('sign off')) return 'Final Clean'
  if (a.includes('rough') || a.includes('drywall') || a.includes('sweep')) return 'Rough Clean'
  if (a.includes('initial') || a.includes('1st') || a.includes('first')) return 'Initial Clean'
  if (a.includes('clean')) return 'Clean'
  return activity.trim() || null
}

// Parse a SupplyPro "To Do" order line, e.g.:
// "Interior Clean II Touch Up [685426 - 238443-000 - 63060][LC] [A] - Block 1, Lot 0233, 3355 W 3550 South West Haven"
export function parseSupplyProOrder(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim()
  const out = { activity: null, external_id: null, po_number: null, lot: null, address: null, block: null }

  const firstBracket = clean.indexOf('[')
  out.activity = (firstBracket > -1 ? clean.slice(0, firstBracket) : clean).trim() || null

  // codes inside the first [ ... - ... - ... ] group
  const codes = clean.match(/\[([^\]]+)\]/g)?.map((s) => s.slice(1, -1)) || []
  const codeGroup = codes.find((c) => c.includes('-'))
  if (codeGroup) {
    const parts = codeGroup.split('-').map((s) => s.trim())
    out.po_number = parts[0] || null
    out.external_id = parts.join('-')      // stable per order line
  }

  const loc = clean.match(/Block\s*([^,]+),\s*Lot\s*([^,]+),\s*(.+)$/i)
  if (loc) {
    out.block = loc[1].trim()
    out.lot = loc[2].trim()
    out.address = loc[3].trim()
  }
  // fallback external id if no code group
  if (!out.external_id) out.external_id = `${out.activity}|${out.lot || ''}|${out.address || ''}`.slice(0, 200)
  return out
}

// Build the DB row from a parsed order.
export function toRow({ source, organization_id, parsed, scheduled_date, status, raw }) {
  return {
    organization_id,
    source,
    external_id: parsed.external_id,
    builder: parsed.builder || null,
    community: parsed.community || null,
    lot: parsed.lot || null,
    address: parsed.address || null,
    activity: parsed.activity || null,
    service_type: serviceType(parsed.activity || ''),
    status: status || null,
    scheduled_date: scheduled_date || null,
    po_number: parsed.po_number || null,
    subdivision: parsed.subdivision || null,
    phase: parsed.phase || null,
    plan: parsed.plan || null,
    elevation: parsed.elevation || null,
    swing: parsed.swing || null,
    block: parsed.block || null,
    job_start_date: parsed.job_start_date || null,
    builder_order_no: parsed.builder_order_no || null,
    super_name: parsed.super_name || null,
    super_phone: parsed.super_phone || null,
    super_email: parsed.super_email || null,
    raw: raw ?? parsed,
  }
}
