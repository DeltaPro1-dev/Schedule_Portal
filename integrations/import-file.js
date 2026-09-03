// Import a schedule EXPORT FILE (Excel/CSV) into schedule_portal.imported_schedules.
//
// For portals we can't scrape unattended (Visionary/D365 needs MFA every login,
// DR Horton likewise), the operator exports the schedule from the portal and drops
// the file here; this importer reads it, maps the columns, and feeds the same staging
// → boards/cards pipeline the scrapers use.
//
//   node import-file.js <source> [file]
//     node import-file.js visionary                  # newest file in inbox/visionary/
//     node import-file.js drhorton "C:\path\sched.xlsx"
//
// Columns are matched by HEADER NAME (fuzzy, case-insensitive), so the same importer
// handles different portals' exports. Rows without a readable date, or dated in the
// past, are skipped.
import 'dotenv/config'
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'
import { getOrgId, upsertSchedules, mapImported } from './lib/supabase.js'
import { serviceType } from './lib/normalize.js'
import { baseDate, iso } from './lib/dates.js'

const BUILDERS = {
  visionary: 'Visionary Homes',
  drhorton: 'DR Horton',
  richmond: 'Richmond American Homes',
  procore: 'Procore',
}

const args = process.argv.slice(2)
const source = args.find((a) => !a.startsWith('--'))
const explicitFile = args.filter((a) => !a.startsWith('--'))[1]
const dryRun = args.includes('--dry-run') // parse + report only, touch nothing

if (!source) {
  console.error(`usage: node import-file.js <source> [file]\n  sources: ${Object.keys(BUILDERS).join(', ')}`)
  process.exit(1)
}

// ── locate the file ──────────────────────────────────────────────────────────
function newestIn(dir) {
  if (!existsSync(dir)) return null
  const files = readdirSync(dir)
    .filter((f) => /\.(xlsx|xlsm|xls|csv)$/i.test(f) && !f.startsWith('~$'))
    .map((f) => ({ f: path.join(dir, f), t: statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  return files[0]?.f || null
}

const file = explicitFile || newestIn(path.join('inbox', source))
if (!file || !existsSync(file)) {
  console.error(`No export file found. Drop the ${source} export in integrations/inbox/${source}/ (xlsx or csv), or pass the path.`)
  process.exit(1)
}
console.log(`Reading ${file}`)

// ── read rows ────────────────────────────────────────────────────────────────
const wb = XLSX.read(readFileSync(file), { type: 'buffer', cellDates: true })
const sheet = wb.Sheets[wb.SheetNames[0]]
const raw = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false })
if (!raw.length) { console.error('The file has no data rows.'); process.exit(1) }

// ── map columns by header name (first pattern that matches wins) ─────────────
const FIELD_PATTERNS = [
  ['scheduled_date', /^(scheduled|sched\.?|start)\s*date$|^date$|^day$|scheduled/i],
  ['activity', /activity|task\s*name|^task$|service|clean|purpose|description/i],
  ['community', /subdivision|community|project|development|lot\s*\/?\s*element|neighborhood|job\s*name/i],
  ['lot', /^lot\s*#?$|^lot\s*(no|number)$|^lot$|lot\s*#/i],
  ['address', /address|street|^site$/i],
  ['plan', /^plan$|model|elevation/i],
  ['super_name', /superintendent|responsible|^super$|builder\s*name|site\s*contact/i],
  ['po_number', /^po\b|purchase\s*order|po\s*#|order\s*(no|number)/i],
  ['phase', /^phase$/i],
  ['block', /^block$/i],
]

const headers = Object.keys(raw[0])
const colFor = {}
for (const [field, re] of FIELD_PATTERNS) {
  const hit = headers.find((h) => re.test(String(h).trim()) && !Object.values(colFor).includes(h))
  if (hit) colFor[field] = hit
}
console.log('Column mapping:')
for (const [f, h] of Object.entries(colFor)) console.log(`  ${f.padEnd(15)} ← "${h}"`)
const missing = ['scheduled_date', 'activity'].filter((f) => !colFor[f])
if (missing.length) {
  console.error(`\nCould not find a column for: ${missing.join(', ')}`)
  console.error(`Headers in the file: ${headers.join(' | ')}`)
  console.error('Tell Claude the header names and the patterns get adjusted.')
  process.exit(1)
}

function toISODate(v) {
  if (!v) return null
  if (v instanceof Date && !isNaN(v)) return iso(v)
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/) // US M/D/Y
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` }
  const d = new Date(s)
  return isNaN(d) ? null : iso(d)
}

const val = (row, field) => {
  const h = colFor[field]
  if (!h) return null
  const v = row[h]
  return v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim()
}

// ── build staging rows ───────────────────────────────────────────────────────
const today = iso(baseDate(process.env))
const organization_id = dryRun ? '00000000-0000-0000-0000-000000000000' : await getOrgId()
const builder = BUILDERS[source] || source
const rows = []
const seen = new Set()
let skippedNoDate = 0
let skippedPast = 0

for (const r of raw) {
  const scheduled_date = toISODate(val(r, 'scheduled_date'))
  if (!scheduled_date) { skippedNoDate++; continue }
  if (scheduled_date < today) { skippedPast++; continue }
  const activity = val(r, 'activity')
  const community = val(r, 'community')
  const lot = val(r, 'lot')
  const external_id = `${source}:${[community, lot, activity, scheduled_date].filter(Boolean).join('|')}`.slice(0, 200)
  if (seen.has(external_id)) continue
  seen.add(external_id)
  rows.push({
    organization_id,
    source,
    external_id,
    builder,
    community,
    subdivision: community,
    lot,
    address: val(r, 'address'),
    activity,
    service_type: serviceType(activity || ''),
    status: null,
    scheduled_date,
    po_number: val(r, 'po_number'),
    phase: val(r, 'phase'),
    plan: val(r, 'plan'),
    elevation: null,
    swing: null,
    block: val(r, 'block'),
    job_start_date: null,
    builder_order_no: val(r, 'po_number'),
    super_name: val(r, 'super_name'),
    super_phone: null,
    super_email: null,
    raw: r,
  })
}

console.log(`\n${raw.length} row(s) in file → ${rows.length} to import` +
  `${skippedNoDate ? ` · ${skippedNoDate} without a date` : ''}${skippedPast ? ` · ${skippedPast} in the past` : ''}`)
if (!rows.length) { console.log('Nothing to import.'); process.exit(0) }

const dates = [...new Set(rows.map((r) => r.scheduled_date))].sort()
console.log(`Dates: ${dates[0]}${dates.length > 1 ? ` .. ${dates[dates.length - 1]}` : ''} (${dates.length} day(s))`)

if (dryRun) {
  console.log('\n--dry-run: nothing written. Sample of what would be imported:')
  for (const r of rows.slice(0, 5)) {
    console.log('  ' + JSON.stringify({ date: r.scheduled_date, community: r.community, lot: r.lot, activity: r.activity, service: r.service_type, address: r.address, super: r.super_name }))
  }
  process.exit(0)
}

const { count } = await upsertSchedules(rows)
console.log(`Upserted ${count} row(s) into schedule_portal.imported_schedules (source=${source})`)
try {
  const mapped = await mapImported(source)
  console.log(`Mapped ${mapped} new card(s) into boards`)
} catch (e) {
  console.warn(`Mapping skipped: ${e.message}`)
}
process.exit(0)
