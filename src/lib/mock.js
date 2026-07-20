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
// Mutable label list for demo CRUD; ids mirror the key so cards (which carry
// labelKeys) resolve regardless of real/mock. labelByKey is rebuilt on changes.
let labelsList = LABELS.map((l) => ({ ...l, id: 'lb-' + l.key }))
let labelByKey = Object.fromEntries(labelsList.map((l) => [l.key, l]))
const rebuildLabels = () => { labelByKey = Object.fromEntries(labelsList.map((l) => [l.key, l])) }
const mockLabelKey = (name) =>
  String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'label'

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
  { id: 'm5', name: 'Luciana Fernandes', email: 'luciana@deltaproclean.com', role: 'operator', region: 'North', status: 'active' },
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

const clone = (x) => structuredClone(x)
const wait = (ms = 90) => new Promise((res) => setTimeout(res, ms))
function detail(id) {
  if (!boardCache[id]) { const b = findBoard(id); if (!b) return null; boardCache[id] = genBoard(b) }
  return boardCache[id]
}
function resolveCard(c) {
  return { ...clone(c), labels: (c.labelKeys || []).map((k) => labelByKey[k]).filter(Boolean), attachments: c.attachments || [] }
}

// ── cities → region (demo seed; real mode starts empty) ──────────────────────
let citiesList = [
  { id: 'city-stg', name: 'St. George', region: 'st_george' },
  { id: 'city-wsh', name: 'Washington', region: 'st_george' },
  { id: 'city-hur', name: 'Hurricane', region: 'st_george' },
  { id: 'city-ced', name: 'Cedar City', region: 'st_george' },
  { id: 'city-slc', name: 'Salt Lake City', region: 'north' },
  { id: 'city-lv', name: 'Las Vegas', region: 'another' },
]

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
      vendors: [...d.vendors],
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
    return {
      stats: [
        { v: '1', label: 'Queued', color: 'oklch(0.52 0.13 90)' },
        { v: '1', label: 'Retrying', color: '#2563eb' },
        { v: '2', label: 'Dead-letter (DLQ)', color: '#dc2626' },
        { v: '2/6', label: 'Synced today', color: 'var(--green-ink)' },
      ],
      rows: [
        { entity: 'Work order · OS-4821', key: 'idmp-4821-a1', attempts: 'attempt 1', when: '09:42:07', direction: 'Delta → Field Control', status: 'synced', err: '' },
        { entity: 'Team check-in · North', key: 'idmp-north-ck', attempts: 'attempt 1', when: '09:40:11', direction: 'Field Control → Delta', status: 'synced', err: '' },
        { entity: 'Completion · KIA Findlay', key: 'idmp-kia-fin', attempts: 'attempt 3', when: '09:38:02', direction: 'Delta → Field Control', status: 'retrying', err: 'Field Control endpoint timeout (504)' },
        { entity: 'New client · Aspire Club House', key: 'idmp-aspire-01', attempts: 'attempt 5', when: '09:12:44', direction: 'Delta → Field Control', status: 'dlq', err: 'Validation rejected: missing tax ID' },
        { entity: 'Route update · South', key: 'idmp-south-rt', attempts: 'attempt 1', when: '09:10:00', direction: 'Field Control → Delta', status: 'queued', err: '' },
        { entity: 'Work order · OS-4815', key: 'idmp-4815-b2', attempts: 'attempt 2', when: '08:55:19', direction: 'Delta → Field Control', status: 'dlq', err: 'Version conflict (409) — reconciliation pending' },
      ],
    }
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
      jobs: [
        { name: 'Daily schedule — JUL/16/26', when: 'Jul 16, 08:12', rows: '200 rows', fmt: 'CSV', by: 'Marina Rocha', status: 'completed' },
        { name: 'Weekly billing — W28', when: 'Jul 16, 07:40', rows: '1,284 rows', fmt: 'XLSX', by: 'Marina Rocha', status: 'completed' },
        { name: 'Operational report — July', when: 'Jul 16, 07:38', rows: '42 pages', fmt: 'PDF', by: 'Rui Braga', status: 'processing' },
        { name: 'Full backup — all boards', when: 'Jul 16, 06:00', rows: '18,902 rows', fmt: 'JSON', by: 'System (scheduled)', status: 'queued' },
        { name: 'Daily schedule — JUL/15/26', when: 'Jul 15, 18:20', rows: '162 rows', fmt: 'CSV', by: 'Aisha Burgess', status: 'completed' },
      ],
    }
  },
  async getAudit() {
    await wait()
    const verbs = ['LOGIN', 'CREATE', 'UPDATE', 'MOVE', 'COMPLETE', 'EXPORT', 'DELETE']
    const users = MEMBERS.slice(0, 6)
    const r = rng(seedOf('audit'))
    const rows = []
    for (let i = 0; i < 12; i++) {
      const u = pick(r, users)
      rows.push({
        id: 'a' + i, ts: `2026-07-17 09:${String(59 - i * 3).padStart(2, '0')}:0${i % 9}`,
        user: u.name, initials: initials(u.name), verb: pick(r, verbs),
        detail: pick(r, ['card on Gray Star', 'board JUL/17', 'export daily schedule', 'member invite', 'St George Crew card']),
        scope: pick(r, ['North', 'South', 'St George', 'All']), ip: `10.0.${Math.floor(r() * 9)}.${Math.floor(r() * 250)}`,
      })
    }
    return rows
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

  // ── Labels (Etiquetas) ──────────────────────────────────────────────────────
  async getLabels() {
    await wait()
    return labelsList.map(clone).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  },
  async addLabel({ name, color, kind }) {
    await wait()
    const key = mockLabelKey(name)
    if (labelsList.some((l) => l.key === key)) throw new Error(`A label like "${name}" already exists.`)
    const lb = { id: 'lb-' + key, key, name, color, kind }
    labelsList.unshift(lb); rebuildLabels()
    return clone(lb)
  },
  async updateLabel(id, patch) {
    await wait()
    const lb = labelsList.find((l) => l.id === id)
    if (lb) { Object.assign(lb, patch); rebuildLabels() }
    return lb ? clone(lb) : null
  },
  async removeLabel(id) {
    await wait()
    labelsList = labelsList.filter((l) => l.id !== id); rebuildLabels()
  },
  async toggleCardLabel(cardId, label, on) {
    await wait()
    for (const bid in boardCache) {
      const c = boardCache[bid].cards.find((x) => x.id === cardId)
      if (c) {
        c.labelKeys = c.labelKeys || []
        if (on) { if (!c.labelKeys.includes(label.key)) c.labelKeys.push(label.key) }
        else c.labelKeys = c.labelKeys.filter((k) => k !== label.key)
        return resolveCard(c)
      }
    }
  },

  // ── Cities → region lookup ──────────────────────────────────────────────────
  async getCities() { await wait(); return citiesList.map(clone).sort((a, b) => a.name.localeCompare(b.name)) },
  async addCity({ name, region }) {
    await wait()
    if (citiesList.some((c) => c.name.toLowerCase() === String(name).toLowerCase())) throw new Error(`"${name}" is already listed.`)
    const c = { id: nid('city'), name, region }
    citiesList.unshift(c)
    return clone(c)
  },
  async updateCity(id, patch) {
    await wait()
    const c = citiesList.find((x) => x.id === id)
    if (c) Object.assign(c, patch)
    return c ? clone(c) : null
  },
  async removeCity(id) { await wait(); citiesList = citiesList.filter((x) => x.id !== id) },
}
