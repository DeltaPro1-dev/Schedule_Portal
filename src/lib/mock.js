// Rich, deterministic in-memory backend for demo mode. Shapes mirror the
// schedule_portal.* tables + the Claude Design prototype's realistic dataset.

import { allowedTransitions } from './stateMachine.js'
import { initials } from './present.js'

// ── seeded RNG (mulberry32) so the demo is stable across reloads ─────────────
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const seedOf = (s) => { let h = 9; for (const c of String(s)) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)]

// ── palettes ─────────────────────────────────────────────────────────────────
export const LABELS = [
  { key: 'model_home', name: 'Model Home', color: '#4CAF50', kind: 'type' },
  { key: 'office', name: 'Office', color: '#607D8B', kind: 'type' },
  { key: 'residential', name: 'Residential', color: '#8BC34A', kind: 'type' },
  { key: 'st_george', name: 'St George', color: '#FF9800', kind: 'region' },
  { key: 'floor_care', name: 'Floor Care', color: '#795548', kind: 'type' },
  { key: 'south', name: 'South', color: '#2196F3', kind: 'region' },
  { key: 'scheduled_time', name: 'Scheduled Time', color: '#9C27B0', kind: 'schedule' },
  { key: 'north', name: 'North', color: '#3F51B5', kind: 'region' },
  { key: 'another_state', name: 'Another State', color: '#9E9E9E', kind: 'region' },
  { key: 'janitorial', name: 'Janitorial', color: '#00BCD4', kind: 'type' },
  { key: 'windows', name: 'Windows', color: '#03A9F4', kind: 'type' },
  { key: 'quality_inspection', name: 'Quality Inspection', color: '#F44336', kind: 'type' },
  { key: 'commercial', name: 'Commercial', color: '#009688', kind: 'type' },
  { key: 'hpw', name: 'HPW', color: '#673AB7', kind: 'type' },
  { key: 'emergency', name: 'Emergency', color: '#E91E63', kind: 'type' },
]
const labelByKey = Object.fromEntries(LABELS.map((l) => [l.key, l]))

const FIRST = ['Tariq', 'Chloe', 'Carla', 'Isabel', 'Lorena', 'Hannah', 'Priya', 'Tomas', 'Alejandra', 'Emma', 'John', 'Vanessa', 'Reinaldo', 'Valente', 'Luanna', 'Ricardo', 'Andrea', 'Marina', 'Rui', 'Aisha', 'David', 'Luciana', 'Paulo', 'Gabriel', 'Sofia', 'Miguel', 'Beatriz', 'Diego', 'Camila', 'Mateo']
const LAST = ['Furbert', 'Gutierrez Bautista', 'Tucker', 'Burgess', 'Bortoloni', 'Vidal Canova', 'Lopez Restrepo', 'da Cunha', 'Barrote', 'Gomez', 'Bascome', 'Santos', 'Fernandes', 'Rocha', 'Braga', 'Silva', 'Costa', 'Oliveira', 'Reis', 'Nunes']
const COMPANIES = ['Shine In Cleaning LLC', 'R&V Professional Services', 'WGJ Services', 'Ultra Cleaning', 'Bright Path Cleaning LLC', 'BH Cleaning LLC', 'Gray Star Cleaning LLC', 'Vidal Canova Services', 'Reinaldo Cleaning LLC', 'Andrea Gomez Cleaning']
const CLIENTS = ['Gray Star Construction', 'Big-D Construction', 'Okland Construction', 'Layton Construction', 'Grass Creek Construction', 'Findlay Automotive', 'Aspire Club House']
const BUILDINGS = ['Tower B - 14th Floor', 'Warehouse North', 'St. George Hospital Bldg 1', 'Seminary Cedar City - 9193', 'Grass Creek - Model Homes', 'Main Office', 'Showroom', 'Parking structure']
const SERVICES = ['Deep Clean CML', 'Single Clean CML (T&M)', 'Monthly Contract - 4 HOURS', 'Power Washer CML (Extra Job)', 'Janitorial Services', 'Extra Job CML', 'Windows', 'HPW']
const ADDRESSES = ['1380 E Medical Center Dr, St. George, UT 84790', '626 N 1100 E, Washington, UT 84780', '1405 Sunland Dr, St. George, UT 84790', '803 W St George Blvd, St. George, UT 84770', '250 N Bluff St, St. George, UT 84770']
const FINS = ['ROBERT', 'DAVID', 'CHARLIE YOURSTON', 'GAVON', 'STEVE', 'ANNA']
const PS_NOTES = ['Bring floor buffer', 'Called Paula.', "PLEASE, DON'T LEAVE WITHOUT SIGN-OFF", 'Findlay Automotive of Utah. Monday to Friday.', 'Do you have a girl for this one?', '']
const REGIONS = ['north', 'south', 'st_george', 'another']
const TIMES = ['6am', '7am', '7:30am', '8am', '9am', '2pm', '7pm', '']

// ── roster (200) ─────────────────────────────────────────────────────────────
let roster = null
function buildRoster() {
  const r = rng(seedOf('delta-roster'))
  const out = []
  for (let i = 0; i < 200; i++) {
    const isCo = r() < 0.35
    const name = isCo
      ? `${pick(r, ['Bright Path', 'Shine In', 'BH', 'R&V', 'WGJ', 'Ultra', 'Gray Star', 'Vidal', 'Reinaldo'])}, Cleaning LLC${r() < 0.5 ? '' : ' ' + Math.floor(r() * 200)}`
      : `${pick(r, LAST)}, ${pick(r, FIRST)}`
    out.push({ id: 'w' + i, name, initials: initials(name), region: pick(r, REGIONS), kind: isCo ? 'company' : 'employee', access: 'none' })
  }
  return out
}
export function getRosterList() { if (!roster) roster = buildRoster(); return roster }

// ── members (7) ──────────────────────────────────────────────────────────────
const MEMBERS = [
  { id: 'm1', name: 'Marina Rocha', email: 'marina@deltaproclean.com', role: 'coordinator', region: 'All', status: 'active' },
  { id: 'm2', name: 'Rui Braga', email: 'rui@deltaproclean.com', role: 'supervisor', region: 'South', status: 'active' },
  { id: 'm3', name: 'Aisha Burgess', email: 'aisha@deltaproclean.com', role: 'supervisor', region: 'North', status: 'active' },
  { id: 'm4', name: 'David Tucker', email: 'david@deltaproclean.com', role: 'supervisor', region: 'St George', status: 'active' },
  { id: 'm5', name: 'Luciana Fernandes', email: 'luciana@deltaproclean.com', role: 'operator', region: 'North', status: 'active', worker: 'Fernandes, Luciana' },
  { id: 'm6', name: 'Paulo Santos', email: 'paulo@deltaproclean.com', role: 'finance', region: 'All', status: 'active' },
  { id: 'm7', name: 'new.manager@client.com', email: 'new.manager@client.com', role: 'read', region: 'St George', status: 'invited' },
]

// ── boards: July (current) + archived months ────────────────────────────────
const WD_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const WD_FULL = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const MON3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

// derive date/month from a board title like "JUL/19/26 · SATURDAY"
function parseTitleDate(title) {
  const m = String(title || '').match(/([A-Za-z]{3})\/(\d{1,2})\/(\d{2})/)
  if (m) {
    const mon = MON3.indexOf(m[1].toUpperCase())
    if (mon >= 0) {
      const y = 2000 + Number(m[3])
      const dd = String(m[2]).padStart(2, '0')
      const mm = String(mon + 1).padStart(2, '0')
      return { date: `${y}-${mm}-${dd}`, month: `${y}-${mm}` }
    }
  }
  return { date: '2026-07-25', month: '2026-07' }
}

function monthDays(year, monthIdx, key, baseHue, closed) {
  const r = rng(seedOf(key))
  const out = []
  const dim = new Date(year, monthIdx + 1, 0).getDate()
  for (let d = 1; d <= dim; d++) {
    const date = new Date(year, monthIdx, d)
    const dow = date.getDay()
    if (dow === 0) continue // skip Sundays
    const dd = String(d).padStart(2, '0')
    out.push({
      id: `${key.replace('-', '')}_${dd}`,
      date: `${year}-${String(monthIdx + 1).padStart(2, '0')}-${dd}`,
      title: `${MON3[monthIdx]}/${dd}/${String(year).slice(2)} · ${WD_FULL[dow]}`,
      month: key,
      status: closed ? 'closed' : 'open',
      starred: !closed && r() < 0.12,
      cover_hue: Math.round((baseHue + d * 9) % 360),
      workerCount: 60 + Math.floor(r() * 145),
    })
  }
  return out
}
let boardsAll = null
function buildBoards() {
  return [
    ...monthDays(2026, 6, '2026-07', 200, false),   // July (current)
    ...monthDays(2026, 5, '2026-06', 150, true),    // June (archived)
    ...monthDays(2026, 4, '2026-05', 90, true),     // May (archived)
    ...monthDays(2026, 3, '2026-04', 30, true),     // April (archived)
  ]
}
function allBoards() { if (!boardsAll) boardsAll = buildBoards(); return boardsAll }
function findBoard(id) { return allBoards().find((b) => b.id === id) }

// ── board detail: generated once per board, then mutable (cache) ─────────────
const boardCache = {}
let seq = 1000
const nid = (p) => `${p}-${++seq}`

function regionLabelKey(region) { return region === 'st_george' ? 'st_george' : region }

function genBoard(board) {
  const r = rng(seedOf(board.id))
  const persons = getRosterList().filter((w) => w.kind === 'employee')
  const cos = getRosterList().filter((w) => w.kind === 'company')
  const nCols = 6 + Math.floor(r() * 7)          // 6–12 worker columns
  const lists = [{ id: nid('l'), board_id: board.id, worker_id: 'pool', name: 'DELTA OFFICE / WAREHOUSE', position: 0, is_pool: true, version: 1 }]
  const cards = []
  const chosen = []
  for (let i = 0; i < nCols; i++) chosen.push(persons[Math.floor(r() * persons.length)])
  chosen.forEach((w, i) => {
    const listId = nid('l')
    lists.push({ id: listId, board_id: board.id, worker_id: w.id, name: w.name, position: i + 1, is_pool: false, version: 1 })
    const nCards = 1 + Math.floor(r() * 3)
    for (let c = 0; c < nCards; c++) {
      const client = pick(r, CLIENTS)
      const region = w.region
      const done = r() < 0.28
      const statuses = ['unscheduled', 'scheduled', 'assigned', 'in_progress', 'completed']
      cards.push({
        id: nid('card'), board_id: board.id, list_id: listId, position: c,
        status: done ? 'completed' : pick(r, statuses),
        scheduled_time: pick(r, TIMES),
        client_id: null, client: { name: client, address: pick(r, ADDRESSES) },
        building: pick(r, BUILDINGS), plan: 'No Plan', lot: 'No Lot',
        service_type: pick(r, SERVICES), address: pick(r, ADDRESSES),
        fin_contact: pick(r, FINS), ps_note: pick(r, PS_NOTES), raw_title: null,
        done, version: 1,
        labelKeys: [regionLabelKey(region), 'commercial', r() < 0.4 ? 'scheduled_time' : 'floor_care'].filter(Boolean),
        checklist: [], comments: c === 0 ? [{ id: nid('cm'), author: 'Coordinator', body: 'Confirmed with client.', created_at: '2026-07-16T18:00:00Z' }] : [], attachments: [],
      })
    }
  })
  // pool = vendor/company resource names
  const vendors = []
  for (let i = 0; i < 13; i++) vendors.push(cos[Math.floor(r() * cos.length)].name)
  return { board: { ...board }, lists, cards, vendors: [...new Set(vendors)] }
}

// export jobs — mutable so a client-side export shows up in "Recent exports"
let exportJobs = null
function getExportJobs() {
  if (!exportJobs) exportJobs = [
    { name: 'Daily schedule — JUL/16/26', when: 'Jul 16, 08:12', rows: '200 rows', fmt: 'CSV', by: 'Marina Rocha', status: 'completed' },
    { name: 'Weekly billing — W28', when: 'Jul 16, 07:40', rows: '1,284 rows', fmt: 'XLSX', by: 'Marina Rocha', status: 'completed' },
    { name: 'Operational report — July', when: 'Jul 16, 07:38', rows: '42 pages', fmt: 'PDF', by: 'Rui Braga', status: 'processing' },
    { name: 'Full backup — all boards', when: 'Jul 16, 06:00', rows: '18,902 rows', fmt: 'JSON', by: 'System (scheduled)', status: 'queued' },
    { name: 'Daily schedule — JUL/15/26', when: 'Jul 15, 18:20', rows: '162 rows', fmt: 'CSV', by: 'Aisha Burgess', status: 'completed' },
  ]
  return exportJobs
}

// clients — mutable CRUD store seeded from the demo palette
let clientsStore = null
function getClientsStore() {
  if (!clientsStore) {
    const r = rng(seedOf('clients'))
    clientsStore = CLIENTS.map((name, i) => ({
      id: 'cl' + i, name,
      address: pick(r, ADDRESSES),
      fin_contact: pick(r, FINS),
      notes: r() < 0.3 ? 'Monthly contract' : null,
    }))
  }
  return clientsStore
}

// teams — mutable store seeded from the roster
let teamsStore = null
function getTeamsStore() {
  if (!teamsStore) {
    const emps = getRosterList().filter((w) => w.kind === 'employee')
    const mk = (id, name, region, idxs) => ({
      id, name, region, notes: null,
      members: idxs.map((i, j) => ({ id: `${id}-m${j}`, worker: { id: emps[i].id, name: emps[i].name, region: emps[i].region } })),
    })
    teamsStore = [
      mk('t1', 'St George Crew', 'st_george', [0, 3, 7]),
      mk('t2', 'North Route', 'north', [1, 4, 9, 12]),
      mk('t3', 'South Floor Care', 'south', [2, 5]),
    ]
  }
  return teamsStore
}

// integration events — mutable so "Reprocess" sticks within a demo session
let integrationRows = null
function getIntegrationRows() {
  if (!integrationRows) integrationRows = [
    { id: 'ie1', entity: 'Work order · OS-4821', key: 'idmp-4821-a1', attempts: 'attempt 1', when: '09:42:07', direction: 'Delta → Field Control', status: 'synced', err: '' },
    { id: 'ie2', entity: 'Team check-in · North', key: 'idmp-north-ck', attempts: 'attempt 1', when: '09:40:11', direction: 'Field Control → Delta', status: 'synced', err: '' },
    { id: 'ie3', entity: 'Completion · KIA Findlay', key: 'idmp-kia-fin', attempts: 'attempt 3', when: '09:38:02', direction: 'Delta → Field Control', status: 'retrying', err: 'Field Control endpoint timeout (504)' },
    { id: 'ie4', entity: 'New client · Aspire Club House', key: 'idmp-aspire-01', attempts: 'attempt 5', when: '09:12:44', direction: 'Delta → Field Control', status: 'dlq', err: 'Validation rejected: missing tax ID' },
    { id: 'ie5', entity: 'Route update · South', key: 'idmp-south-rt', attempts: 'attempt 1', when: '09:10:00', direction: 'Field Control → Delta', status: 'queued', err: '' },
    { id: 'ie6', entity: 'Work order · OS-4815', key: 'idmp-4815-b2', attempts: 'attempt 2', when: '08:55:19', direction: 'Delta → Field Control', status: 'dlq', err: 'Version conflict (409) — reconciliation pending' },
  ]
  return integrationRows
}

// notifications — mutable so mark-as-read sticks within a demo session
let notifs = null
function getNotifs() {
  if (!notifs) notifs = [
    { id: 'n1', kind: 'assignment', title: 'New assignment', body: 'KIA Findlay · Single Clean CML assigned to your list', read: false, created_at: '2026-07-17T09:42:00Z' },
    { id: 'n2', kind: 'status', title: 'Service completed', body: 'Okland Construction · St. George Hospital marked completed', read: false, created_at: '2026-07-17T09:20:00Z' },
    { id: 'n3', kind: 'integration', title: 'Integration error', body: 'New client · Aspire Club House fell into the DLQ (missing tax ID)', read: false, created_at: '2026-07-17T09:12:00Z' },
    { id: 'n4', kind: 'export', title: 'Export ready', body: 'Weekly billing — W28 (XLSX) finished · 1,284 rows', read: true, created_at: '2026-07-16T07:41:00Z' },
    { id: 'n5', kind: 'comment', title: 'New comment', body: 'Marina Rocha commented on Gray Star card: "Confirmed with client."', read: true, created_at: '2026-07-16T18:03:00Z' },
    { id: 'n6', kind: 'mention', title: 'You were mentioned', body: 'Rui Braga mentioned you on the South route card', read: true, created_at: '2026-07-15T14:10:00Z' },
  ]
  return notifs
}

const clone = (x) => structuredClone(x)
const wait = (ms = 90) => new Promise((res) => setTimeout(res, ms))
function detail(id) {
  if (!boardCache[id]) { const b = findBoard(id); if (!b) return null; boardCache[id] = genBoard(b) }
  return boardCache[id]
}
function resolveCard(c) {
  return { ...clone(c), labels: (c.labelKeys || []).map((k) => labelByKey[k]).filter(Boolean), attachments: c.attachments || [] }
}

export const mockApi = {
  async getBoards() {
    await wait()
    return allBoards().map(clone)
  },
  async getBoardDetail(boardId) {
    await wait()
    const d = detail(boardId)
    if (!d) throw new Error('not_found')
    const jobs = d.cards.length
    const completed = d.cards.filter((c) => c.done).length
    return {
      board: { ...clone(d.board), jobs, completed },
      lists: d.lists.map(clone),
      cards: d.cards.map(resolveCard),
      // recompute from the live roster companies (mirrors real mode) so a newly
      // added vendor shows immediately, instead of the frozen genBoard list
      vendors: getRosterList().filter((w) => w.kind === 'company' && w.active !== false && !w.deleted_at).map((w) => w.name).slice(0, 20),
    }
  },
  async getRoster() { await wait(); return getRosterList().map(clone) },
  async addWorker({ name, region, kind }) {
    await wait()
    const w = { id: nid('w'), name, initials: initials(name), region, kind, access: 'none', active: true }
    getRosterList().unshift(w)
    return clone(w)
  },
  async updateWorker(id, patch) {
    await wait()
    const w = getRosterList().find((x) => x.id === id)
    if (w) Object.assign(w, patch)
    return w ? clone(w) : null
  },
  async removeWorker(id) {
    await wait()
    roster = getRosterList().filter((x) => x.id !== id)
  },
  async getMembers() { await wait(); return MEMBERS.map(clone) },
  async inviteMember({ email, role, region }) {
    await wait()
    const RLBL = { north: 'North', south: 'South', st_george: 'St George', another: 'Another State', all: 'All' }
    const m = { id: nid('m'), name: email, email, role: role === 'viewer' ? 'read' : role, region: RLBL[region] || region, status: 'invited' }
    MEMBERS.push(m)
    return clone(m)
  },

  // ── settings data ──────────────────────────────────────────────────────────
  async getOrganization() {
    await wait(30)
    return { id: 'org-demo', name: 'Delta Pro Clean', slug: 'delta-pro-clean', created_at: '2026-07-17T00:00:00Z' }
  },
  async getLabels() { await wait(30); return LABELS.map(clone) },

  // ── customers (clients) ────────────────────────────────────────────────────
  async getClients() { await wait(); return getClientsStore().map(clone) },
  async addClient({ name, address, fin_contact, notes }) {
    await wait()
    const c = { id: nid('cl'), name, address: address || null, fin_contact: fin_contact || null, notes: notes || null }
    getClientsStore().unshift(c)
    return clone(c)
  },
  async updateClient(id, patch) {
    await wait()
    const c = getClientsStore().find((x) => x.id === id)
    if (c) Object.assign(c, patch)
  },
  async removeClient(id) {
    await wait()
    clientsStore = getClientsStore().filter((x) => x.id !== id)
  },

  // ── teams ──────────────────────────────────────────────────────────────────
  async getTeams() { await wait(); return getTeamsStore().map(clone) },
  async addTeam({ name, region }) {
    await wait()
    const t = { id: nid('t'), name, region: region || null, notes: null, members: [] }
    getTeamsStore().unshift(t)
    return clone(t)
  },
  async removeTeam(id) {
    await wait()
    teamsStore = getTeamsStore().filter((x) => x.id !== id)
  },
  async addTeamMember(teamId, workerId) {
    await wait()
    const t = getTeamsStore().find((x) => x.id === teamId)
    const w = getRosterList().find((x) => x.id === workerId)
    if (t && w && !t.members.some((m) => m.worker.id === workerId)) {
      t.members.push({ id: nid('tm'), worker: { id: w.id, name: w.name, region: w.region } })
    }
  },
  async removeTeamMember(memberId) {
    await wait()
    for (const t of getTeamsStore()) {
      const i = t.members.findIndex((m) => m.id === memberId)
      if (i >= 0) { t.members.splice(i, 1); return }
    }
  },
  async getPermMatrix() {
    await wait()
    const g = (label, kind) => ({ label, kind })
    return {
      cols: ['Coordinator', 'Supervisor', 'Operator', 'Finance', 'Read'],
      rows: [
        { module: 'Boards & Cards', cells: [g('Full', 'full'), g('Region', 'region'), g('Own', 'own'), g('View', 'view'), g('View', 'view')] },
        { module: 'Scheduling / allocation', cells: [g('Full', 'full'), g('Region', 'region'), g('View', 'view'), g('View', 'view'), g('View', 'view')] },
        { module: 'Exports', cells: [g('Full', 'full'), g('Region', 'region'), g('—', 'none'), g('Full', 'full'), g('—', 'none')] },
        { module: 'Audit', cells: [g('Full', 'full'), g('Region', 'region'), g('—', 'none'), g('View', 'view'), g('—', 'none')] },
        { module: 'Integrations', cells: [g('Full', 'full'), g('—', 'none'), g('—', 'none'), g('View', 'view'), g('—', 'none')] },
        { module: 'Members & RBAC', cells: [g('Full', 'full'), g('—', 'none'), g('—', 'none'), g('—', 'none'), g('—', 'none')] },
      ],
    }
  },
  async getIntegration() {
    await wait()
    const rows = getIntegrationRows()
    const n = (s) => rows.filter((r) => r.status === s).length
    const synced = n('synced')
    return {
      stats: [
        { v: String(n('queued')), label: 'Queued', color: 'oklch(0.52 0.13 90)' },
        { v: String(n('retrying')), label: 'Retrying', color: '#2563eb' },
        { v: String(n('dlq')), label: 'Dead-letter (DLQ)', color: '#dc2626' },
        { v: `${synced}/${rows.length}`, label: 'Synced today', color: 'var(--green-ink)' },
      ],
      rows: rows.map(clone),
    }
  },
  async reprocessIntegration(id) {
    await wait()
    const r = getIntegrationRows().find((x) => x.id === id)
    if (r) { r.status = 'queued'; r.err = ''; r.attempts = 'attempt ' + ((parseInt(r.attempts.replace(/\D/g, '')) || 0) + 1) }
  },
  async getExports() {
    await wait()
    return {
      formats: [
        { ext: 'CSV', name: 'Daily schedule', hint: 'workers + services', color: 'var(--green-ink)' },
        { ext: 'XLSX', name: 'Billing', hint: 'by client / region', color: 'var(--green-ink)' },
        { ext: 'PDF', name: 'Operational report', hint: 'executive summary', color: '#dc2626' },
        { ext: 'JSON', name: 'Full backup', hint: 'all boards', color: 'var(--navy)' },
      ],
      jobs: [...getExportJobs()],
    }
  },
  async logExport({ report_type, format, row_count }) {
    await wait(40)
    getExportJobs().unshift({
      name: report_type || 'Export',
      when: new Date().toLocaleString(),
      rows: row_count != null ? `${row_count} rows` : '—',
      fmt: String(format || '').toUpperCase(),
      by: 'You', status: 'completed',
    })
  },
  async getAudit() {
    await wait()
    const verbs = ['LOGIN', 'CREATE', 'UPDATE', 'MOVE', 'COMPLETE', 'EXPORT', 'DELETE']
    const users = MEMBERS.slice(0, 6)
    const r = rng(seedOf('audit'))
    const STATES = ['unscheduled', 'scheduled', 'assigned', 'in_progress', 'completed']
    const rows = []
    for (let i = 0; i < 14; i++) {
      const u = pick(r, users)
      const verb = pick(r, verbs)
      // structured before→after diff for the verbs that carry one
      let diff = null, entity = 'card', detail
      if (verb === 'MOVE') { diff = { field: 'list', from: pick(r, COMPANIES), to: pick(r, COMPANIES) }; detail = 'moved card between workers' }
      else if (verb === 'UPDATE' || verb === 'COMPLETE') { const a = pick(r, STATES); diff = { field: 'status', from: a, to: verb === 'COMPLETE' ? 'completed' : pick(r, STATES) }; detail = 'status change' }
      else if (verb === 'CREATE') { entity = pick(r, ['card', 'board']); detail = `created ${entity}` }
      else if (verb === 'EXPORT') { entity = 'export'; detail = pick(r, ['daily schedule (CSV)', 'full backup (JSON)']) }
      else if (verb === 'DELETE') { detail = 'archived card' }
      else { entity = 'session'; detail = 'signed in' }
      rows.push({
        id: 'a' + i, ts: `2026-07-17 09:${String(59 - i * 3).padStart(2, '0')}:0${i % 9}`,
        user: u.name, initials: initials(u.name), verb, entity, detail, diff,
        scope: pick(r, ['North', 'South', 'St George', 'All']), ip: `10.0.${Math.floor(r() * 9)}.${Math.floor(r() * 250)}`,
        correlation: `cor-${(seedOf('c' + i) % 100000).toString(16)}`,
      })
    }
    return rows
  },

  // ── notifications (in-app) ─────────────────────────────────────────────────
  async getNotifications() {
    await wait(40)
    return getNotifs().map(clone)
  },
  async markNotificationRead(id) {
    await wait(20)
    const n = getNotifs().find((x) => x.id === id); if (n) n.read = true
  },
  async markAllNotificationsRead() {
    await wait(20)
    getNotifs().forEach((n) => { n.read = true })
  },

  // ── mutations (act on the board cache) ─────────────────────────────────────
  async addBoard({ title }) {
    await wait()
    const p = parseTitleDate(title)
    const b = { id: nid('b'), date: p.date, title: title || 'New board', month: p.month, status: 'open', starred: false, cover_hue: 210, workerCount: 0 }
    allBoards().unshift(b)
    // auto-generate columns: pool + one list per active employee (roster)
    const emps = getRosterList().filter((w) => w.kind === 'employee' && w.active !== false).slice(0, 40)
    const cos = getRosterList().filter((w) => w.kind === 'company').slice(0, 13)
    const lists = [{ id: nid('l'), board_id: b.id, worker_id: 'pool', name: 'DELTA OFFICE / WAREHOUSE', position: 0, is_pool: true, version: 1 }]
    emps.forEach((w, i) => lists.push({ id: nid('l'), board_id: b.id, worker_id: w.id, name: w.name, position: i + 1, is_pool: false, version: 1 }))
    b.workerCount = emps.length
    boardCache[b.id] = { board: b, lists, cards: [], vendors: cos.map((c) => c.name) }
    return clone(b)
  },
  async addList({ board_id, name }) {
    await wait()
    const d = detail(board_id)
    const l = { id: nid('l'), board_id, worker_id: null, name, position: d.lists.length, is_pool: false, version: 1 }
    d.lists.push(l)
    return clone(l)
  },
  async addCard({ board_id, list_id, raw_title, ...fields }) {
    await wait()
    const d = detail(board_id)
    const pos = d.cards.filter((c) => c.list_id === list_id).length
    const card = { id: nid('card'), board_id, list_id, position: pos, status: 'unscheduled', raw_title: raw_title || null, done: false, version: 1, labelKeys: ['scheduled_time'], checklist: [], comments: [], attachments: [], client: null, ...fields }
    d.cards.push(card)
    return resolveCard(card)
  },
  async updateCard(cardId, patch) {
    await wait()
    for (const id in boardCache) {
      const c = boardCache[id].cards.find((x) => x.id === cardId)
      if (c) { Object.assign(c, patch); c.version++; return resolveCard(c) }
    }
    throw new Error('not_found')
  },
  async duplicateCard(cardId) {
    await wait()
    for (const id in boardCache) {
      const c = boardCache[id].cards.find((x) => x.id === cardId)
      if (c) {
        const pos = boardCache[id].cards.filter((x) => x.list_id === c.list_id).length
        const copy = {
          ...clone(c), id: nid('card'), position: pos, done: false, version: 1,
          labelKeys: [...(c.labelKeys || [])],
          checklist: (c.checklist || []).map((it) => ({ id: nid('ck'), text: it.text, done: false, position: it.position })),
          comments: [], attachments: [],
        }
        boardCache[id].cards.push(copy)
        return resolveCard(copy)
      }
    }
    throw new Error('not_found')
  },
  async moveCard(cardId, toListId, position, version) {
    await wait()
    for (const id in boardCache) {
      const c = boardCache[id].cards.find((x) => x.id === cardId)
      if (c) { if (c.version !== version) throw new Error('version_conflict'); c.list_id = toListId; c.position = position; c.version++; return resolveCard(c) }
    }
    throw new Error('not_found')
  },
  async transitionCard(cardId, to, version) {
    await wait()
    for (const id in boardCache) {
      const c = boardCache[id].cards.find((x) => x.id === cardId)
      if (c) {
        if (c.version !== version) throw new Error('version_conflict')
        if (!allowedTransitions(c.status).includes(to)) throw new Error('invalid_transition')
        c.status = to; c.done = to === 'completed'; c.version++; return resolveCard(c)
      }
    }
    throw new Error('not_found')
  },
  async toggleDone(cardId) {
    await wait()
    for (const id in boardCache) {
      const c = boardCache[id].cards.find((x) => x.id === cardId)
      if (c) { c.done = !c.done; if (c.done) c.status = 'completed'; c.version++; return resolveCard(c) }
    }
  },
  async addComment(cardId, body) {
    await wait()
    for (const id in boardCache) {
      const c = boardCache[id].cards.find((x) => x.id === cardId)
      if (c) { c.comments.push({ id: nid('cm'), author: 'You', body, created_at: new Date().toISOString() }); return resolveCard(c) }
    }
  },
  async addChecklistItem(cardId, text) {
    await wait()
    for (const id in boardCache) {
      const c = boardCache[id].cards.find((x) => x.id === cardId)
      if (c) { c.checklist.push({ id: nid('ck'), text, done: false, position: c.checklist.length }); return resolveCard(c) }
    }
  },
  async toggleChecklistItem(cardId, itemId) {
    await wait()
    for (const id in boardCache) {
      const c = boardCache[id].cards.find((x) => x.id === cardId)
      if (c) { const it = c.checklist.find((i) => i.id === itemId); if (it) it.done = !it.done; return resolveCard(c) }
    }
  },
  async addAttachment(cardId, file) {
    await wait()
    for (const id in boardCache) {
      const c = boardCache[id].cards.find((x) => x.id === cardId)
      if (c) {
        ;(c.attachments ||= []).push({
          id: nid('att'), card_id: cardId, filename: file.name, mime: file.type || null,
          size: file.size, s3_key: `${cardId}/${file.name}`, scan_status: 'clean',
          created_at: new Date().toISOString(), _url: URL.createObjectURL(file),
        })
        return resolveCard(c)
      }
    }
  },
  async attachmentUrl(s3_key) {
    await wait(30)
    for (const id in boardCache) {
      for (const c of boardCache[id].cards) {
        const a = (c.attachments || []).find((x) => x.s3_key === s3_key)
        if (a) return a._url || '#'
      }
    }
    return '#'
  },
}
