// Data API used by the UI. In demo mode (no .env) it is the in-memory mock.
// When Supabase is configured it talks to the schedule_portal schema. Both
// expose the same method surface, so components never change.

import { supabase } from './supabase.js'
import { mockApi } from './mock.js'
import { initials, REGION_LABEL } from './present.js'

export const configured =
  !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY

// Members have no name column (identity lives in Supabase Auth); derive a
// readable display name from the invite email's local part.
function titleFromEmail(email) {
  const local = String(email || '').split('@')[0]
  const t = local.split(/[._-]+/).filter(Boolean).map((s) => s[0].toUpperCase() + s.slice(1)).join(' ')
  return t || email || 'Unknown'
}
// DB role enum → the display keys the Members screen understands.
const ROLE_DISPLAY = { admin: 'admin', coordinator: 'coordinator', supervisor: 'supervisor', operator: 'operator', finance: 'finance', viewer: 'read' }
const regionText = (r) => (r === 'all' ? 'All' : REGION_LABEL[r] || r)

function mapCard(row) {
  return {
    ...row,
    client: row.client || null,
    labels: (row.card_labels || []).map((cl) => cl.label).filter(Boolean),
    labelKeys: (row.card_labels || []).map((cl) => cl.label?.key).filter(Boolean),
    checklist: row.checklist_items || [],
    comments: row.comments || [],
    attachments: row.attachments || [],
  }
}

export const ATTACH_BUCKET = 'schedule-attachments'

let _orgId
async function myOrg() {
  if (_orgId) return _orgId
  const { data, error } = await supabase.rpc('my_org')
  if (error) throw error
  _orgId = data
  return _orgId
}

const MONTHS3 = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
function parseBoardDate(title) {
  const m = String(title || '').match(/([A-Za-z]{3})\/(\d{1,2})\/(\d{2})/)
  if (!m) return null
  const mon = MONTHS3[m[1].toLowerCase()]
  if (mon == null) return null
  const y = 2000 + Number(m[3])
  const dd = String(m[2]).padStart(2, '0')
  const mm = String(mon + 1).padStart(2, '0')
  return { date: `${y}-${mm}-${dd}`, month: `${y}-${mm}` }
}

const realApi = {
  async getBoards() {
    const { data, error } = await supabase
      .from('boards')
      .select('*, lists(count)')
      .order('date', { ascending: false })
    if (error) throw error
    // subtract the pool list (one per board) from the worker count
    return data.map((b) => ({ ...b, workerCount: Math.max(0, (b.lists?.[0]?.count ?? 0) - 1) }))
  },

  async getBoardDetail(boardId) {
    const [{ data: board, error: be }, { data: lists, error: le }, { data: cards, error: ce }, { data: cos }] =
      await Promise.all([
        supabase.from('boards').select('*').eq('id', boardId).single(),
        supabase.from('lists').select('*').eq('board_id', boardId).order('position'),
        supabase
          .from('cards')
          .select('*, client:clients(*), card_labels(label:labels(*)), checklist_items(*), comments(*), attachments(*)')
          .eq('board_id', boardId)
          .is('deleted_at', null)
          .order('position'),
        supabase.from('workers').select('name').eq('kind', 'company').is('deleted_at', null).limit(20),
      ])
    if (be || le || ce) throw be || le || ce
    return { board, lists, cards: cards.map(mapCard), vendors: (cos || []).map((c) => c.name) }
  },

  async addBoard({ title, date, month, cover_hue }) {
    const parsed = !date || !month ? parseBoardDate(title) : null
    const d = date || parsed?.date
    const mo = month || parsed?.month
    if (!d || !mo) throw new Error('Include the date in the title, e.g. "JUL/19/26 · SATURDAY"')
    const { data, error } = await supabase
      .from('boards')
      .insert({ organization_id: await myOrg(), title, date: d, month: mo, cover_hue: cover_hue ?? 210 })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') throw new Error(`A board for ${d} already exists — open it from Boards.`)
      throw error
    }
    // auto-generate columns: the pool + one list per active employee (roster)
    const org = await myOrg()
    const { data: workers } = await supabase
      .from('workers').select('id,name')
      .eq('kind', 'employee').eq('active', true).is('deleted_at', null)
      .order('name')
    const lists = [{ organization_id: org, board_id: data.id, name: 'DELTA OFFICE / WAREHOUSE', position: 0, is_pool: true }]
    ;(workers || []).forEach((w, i) => lists.push({ organization_id: org, board_id: data.id, worker_id: w.id, name: w.name, position: i + 1, is_pool: false }))
    const { error: le } = await supabase.from('lists').insert(lists)
    if (le) throw le
    return { ...data, workerCount: (workers || []).length }
  },

  async getRoster() {
    const { data, error } = await supabase.from('workers').select('*').is('deleted_at', null).order('name')
    if (error) throw error
    return (data || []).map((w) => ({ ...w, initials: w.initials || initials(w.name) }))
  },
  async addWorker({ name, region, kind }) {
    const org = await myOrg()
    const { data, error } = await supabase
      .from('workers').insert({ organization_id: org, name, region, kind, initials: initials(name) })
      .select().single()
    if (error) throw error
    return { ...data, initials: data.initials || initials(data.name) }
  },
  async updateWorker(id, patch) {
    const { error } = await supabase.from('workers').update(patch).eq('id', id)
    if (error) throw error
  },
  async removeWorker(id) {
    const { error } = await supabase.from('workers').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  // ── Settings data (read-only surfaces) ──────────────────────────────────────
  async getOrganization() {
    const { data, error } = await supabase.from('organizations').select('*').eq('id', await myOrg()).single()
    if (error) throw error
    return data
  },
  async getLabels() {
    const { data, error } = await supabase.from('labels').select('*').order('name')
    if (error) throw error
    return data || []
  },

  // ── Customers (clients table — RLS from 0002, no migration needed) ─────────
  async getClients() {
    const { data, error } = await supabase.from('clients').select('*').is('deleted_at', null).order('name')
    if (error) throw error
    return data || []
  },
  async addClient({ name, address, fin_contact, notes }) {
    const { data, error } = await supabase
      .from('clients')
      .insert({ organization_id: await myOrg(), name, address: address || null, fin_contact: fin_contact || null, notes: notes || null })
      .select().single()
    if (error) throw error
    return data
  },
  async updateClient(id, patch) {
    const { error } = await supabase.from('clients').update(patch).eq('id', id)
    if (error) throw error
  },
  async removeClient(id) {
    const { error } = await supabase.from('clients').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  // ── Teams (migration 0011; callers tolerate a missing table → empty state) ──
  async getTeams() {
    const { data, error } = await supabase
      .from('teams')
      .select('*, team_members(id, worker:workers(id, name, region))')
      .is('deleted_at', null)
      .order('name')
    if (error) throw error
    return (data || []).map((t) => ({
      ...t,
      members: (t.team_members || []).map((tm) => ({ id: tm.id, worker: tm.worker })).filter((m) => m.worker),
    }))
  },
  async addTeam({ name, region }) {
    const { data, error } = await supabase
      .from('teams')
      .insert({ organization_id: await myOrg(), name, region: region || null })
      .select().single()
    if (error) throw error
    return { ...data, members: [] }
  },
  async removeTeam(id) {
    const { error } = await supabase.from('teams').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },
  async addTeamMember(teamId, workerId) {
    const { error } = await supabase
      .from('team_members')
      .insert({ organization_id: await myOrg(), team_id: teamId, worker_id: workerId })
    if (error) throw error
  },
  async removeTeamMember(memberId) {
    const { error } = await supabase.from('team_members').delete().eq('id', memberId)
    if (error) throw error
  },

  async addList({ board_id, name }) {
    const org = await myOrg()
    const { count } = await supabase.from('lists').select('id', { count: 'exact', head: true }).eq('board_id', board_id)
    const { data, error } = await supabase
      .from('lists')
      .insert({ organization_id: org, board_id, name, position: count ?? 0 })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async addCard({ board_id, list_id, raw_title, ...fields }) {
    const org = await myOrg()
    const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).eq('list_id', list_id)
    const { data, error } = await supabase
      .from('cards')
      .insert({ organization_id: org, board_id, list_id, position: count ?? 0, raw_title: raw_title || null, ...fields })
      .select('*, client:clients(*), card_labels(label:labels(*))')
      .single()
    if (error) throw error
    return mapCard(data)
  },

  // Patch free-text card fields (inline editing). RLS/region guards decide if the
  // caller may edit; status changes still go through card_transition (the FSM).
  async updateCard(cardId, patch) {
    const { data, error } = await supabase
      .from('cards')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', cardId)
      .select('*, client:clients(*), card_labels(label:labels(*)), checklist_items(*), comments(*), attachments(*)')
      .single()
    if (error) throw error
    return mapCard(data)
  },

  async moveCard(cardId, toListId, position, version) {
    const { data, error } = await supabase.rpc('card_move', {
      p_card_id: cardId, p_to_list_id: toListId, p_position: position, p_version: version,
    })
    if (error) throw error
    return data
  },

  async transitionCard(cardId, to, version) {
    const { data, error } = await supabase.rpc('card_transition', {
      p_card_id: cardId, p_to: to, p_version: version,
    })
    if (error) throw error
    return data
  },

  async toggleDone(cardId, current) {
    const done = !current
    const { data, error } = await supabase
      .from('cards')
      .update(done ? { done: true, status: 'completed' } : { done: false })
      .eq('id', cardId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async addComment(cardId, body) {
    const { error } = await supabase.from('comments').insert({ card_id: cardId, body })
    if (error) throw error
  },

  async addChecklistItem(cardId, text) {
    const { error } = await supabase.from('checklist_items').insert({ card_id: cardId, text })
    if (error) throw error
  },

  async toggleChecklistItem(cardId, itemId, current) {
    const { error } = await supabase
      .from('checklist_items')
      .update({ done: !current })
      .eq('id', itemId)
    if (error) throw error
  },

  // Realtime: notify on any change to this board's cards/lists (and the board
  // row itself). Returns an unsubscribe fn. RLS scopes the stream to our org.
  // Requires migration 0006 (tables added to the supabase_realtime publication).
  subscribeBoard(boardId, onChange) {
    const channel = supabase
      .channel(`board:${boardId}`)
      .on('postgres_changes', { event: '*', schema: 'schedule_portal', table: 'cards', filter: `board_id=eq.${boardId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'schedule_portal', table: 'lists', filter: `board_id=eq.${boardId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'schedule_portal', table: 'boards', filter: `id=eq.${boardId}` }, onChange)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  },

  // ── Admin screens (real data) ──────────────────────────────────────────────
  // Members: read the org's memberships. RLS returns all rows for admins and only
  // the caller's own row otherwise (Members & RBAC is an admin/coordinator module).
  async getMembers() {
    const { data, error } = await supabase
      .from('memberships')
      .select('id, invited_email, role, region, status, worker:workers(name)')
      .order('status')
    if (error) throw error
    return (data || []).map((m) => ({
      id: m.id,
      name: titleFromEmail(m.invited_email),
      email: m.invited_email || '',
      role: ROLE_DISPLAY[m.role] || m.role,
      region: regionText(m.region),
      status: m.status,
      worker: m.worker?.name || null,   // D6: linked worker (operator "assigned" scope)
    }))
  },

  // Invite a member (admin-only via memberships_admin_write RLS). Access level is
  // derived from the role; it can be tuned later in the DB / a future admin UI.
  async inviteMember({ email, role, region }) {
    const access = role === 'admin' ? 'admin'
      : ['coordinator', 'supervisor', 'operator'].includes(role) ? 'editor'
      : 'none'
    const { error } = await supabase.from('memberships').insert({
      organization_id: await myOrg(), invited_email: email, role, region, access, status: 'invited',
    })
    if (error) throw error
  },

  // Audit: immutable action log, newest first. Resolve actor names from the
  // memberships we can see (best-effort — non-admins only resolve their own).
  async getAudit() {
    const [{ data: events, error }, { data: mems }] = await Promise.all([
      supabase.from('audit_events').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('memberships').select('user_id, invited_email'),
    ])
    if (error) throw error
    const emailByUser = Object.fromEntries((mems || []).filter((m) => m.user_id).map((m) => [m.user_id, m.invited_email]))
    return (events || []).map((e) => {
      const isSystem = e.actor_kind === 'system' || !e.actor_user_id
      const email = emailByUser[e.actor_user_id]
      const user = isSystem ? 'System' : email ? titleFromEmail(email) : 'User'
      const d = e.detail || {}
      // structured before→after diff, when the event carries one
      const diff =
        d.from && d.to ? { field: 'status', from: d.from, to: d.to }
        : d.toListId ? { field: 'list', from: d.fromListId || '—', to: d.toListId }
        : null
      const detail =
        diff?.field === 'status' ? 'status change'
        : diff?.field === 'list' ? 'moved card between workers'
        : `${(e.verb || '').toLowerCase()} ${e.entity_type || ''}`.trim() || (e.entity_type || 'action')
      return {
        id: e.id,
        ts: new Date(e.created_at).toLocaleString(),
        user, initials: initials(user),
        verb: e.verb,
        entity: e.entity_type || null,
        detail, diff,
        correlation: e.correlation_id || e.request_id || null,
        scope: e.scope || '—',
        ip: e.ip || '—',
      }
    })
  },

  // ── notifications (in-app) ──────────────────────────────────────────────────
  // Reads the caller's own notifications (RLS: user_id = auth.uid()). The table +
  // producers ship in migration 0009 (export.ready trigger today; more via triggers
  // once deployed). Empty until 0009 is applied — the UI shows a valid empty state.
  async getNotifications() {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return (data || []).map((n) => ({
      id: n.id, kind: n.kind, title: n.title, body: n.body, read: n.read,
      created_at: n.created_at,
    }))
  },
  async markNotificationRead(id) {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
    if (error) throw error
  },
  async markAllNotificationsRead() {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('read', false)
    if (error) throw error
  },

  // Record a completed client-side export (audit trail). Uses the exports_insert
  // RLS policy (member inserts their own row for their org). Best-effort — the
  // file download already happened, so a logging failure must not surface as a
  // failed export.
  async logExport({ report_type, format, row_count, params_json }) {
    const { data: auth } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('exports')
      .insert({
        organization_id: await myOrg(), requested_by: auth?.user?.id ?? null,
        report_type, format, row_count: row_count ?? null, params_json: params_json || {},
        status: 'done', finished_at: new Date().toISOString(),
      })
      .select().single()
    if (error) throw error
    return data
  },

  // Exports: static format cards + the org's recent export jobs (table may be
  // empty until the export worker exists).
  async getExports() {
    const { data, error } = await supabase
      .from('exports').select('*').order('created_at', { ascending: false }).limit(50)
    if (error) throw error
    const FMT = { csv: 'CSV', xlsx: 'XLSX', pdf: 'PDF', json: 'JSON' }
    const jobs = (data || []).map((x) => ({
      name: x.report_type || 'Export',
      when: new Date(x.created_at).toLocaleString(),
      rows: x.row_count != null ? `${x.row_count} rows` : '—',
      fmt: FMT[x.format] || String(x.format || '').toUpperCase(),
      by: x.requested_by ? '—' : 'System',
      status: x.status === 'done' ? 'completed' : x.status,   // enum: queued|processing|done|failed
    }))
    return {
      formats: [
        { ext: 'CSV', name: 'Daily schedule', hint: 'workers + services', color: 'var(--green-ink)' },
        { ext: 'XLSX', name: 'Billing', hint: 'by client / region', color: 'var(--green-ink)' },
        { ext: 'PDF', name: 'Operational report', hint: 'executive summary', color: '#dc2626' },
        { ext: 'JSON', name: 'Full backup', hint: 'all boards', color: 'var(--navy)' },
      ],
      jobs,
    }
  },

  // Integration: Field Control sync queue + computed stats.
  async getIntegration() {
    const { data, error } = await supabase
      .from('integration_events').select('*').order('created_at', { ascending: false }).limit(50)
    if (error) throw error
    const rows = (data || []).map((e) => ({
      id: e.id,
      entity: `${e.entity_type || 'event'}${e.entity_id ? ' · ' + String(e.entity_id).slice(0, 8) : ''}`,
      key: e.idempotency_key,
      attempts: `attempt ${e.attempts}`,
      when: new Date(e.created_at).toLocaleTimeString(),
      direction: e.direction === 'push' ? 'Delta → Field Control' : 'Field Control → Delta',
      status: e.status === 'done' ? 'synced' : e.status,     // enum: queued|retrying|done|dlq
      err: e.last_error || '',
    }))
    const n = (s) => rows.filter((r) => r.status === s).length
    const synced = rows.filter((r) => r.status === 'synced').length
    return {
      stats: [
        { v: String(n('queued')), label: 'Queued', color: 'oklch(0.52 0.13 90)' },
        { v: String(n('retrying')), label: 'Retrying', color: '#2563eb' },
        { v: String(n('dlq')), label: 'Dead-letter (DLQ)', color: '#dc2626' },
        { v: `${synced}/${rows.length}`, label: 'Synced', color: 'var(--green-ink)' },
      ],
      rows,
    }
  },

  // Re-queue a failed/retrying integration event (DLQ → queued). Server-side via
  // an RPC (migration 0012); the queue is otherwise service-role-only. Inert until
  // Field Control feeds the queue (decision D8), but the button is wired.
  async reprocessIntegration(id) {
    const { error } = await supabase.rpc('reprocess_integration', { p_id: id })
    if (error) throw error
  },

  // ── Attachments (Supabase Storage bucket `schedule-attachments`) ────────────
  // Upload to <card_id>/<ts>-<name>, then record the row. Bucket is private;
  // read/write/delete are gated by the storage policies in migration 0003.
  async addAttachment(cardId, file) {
    const key = `${cardId}/${Date.now()}-${file.name}`
    const { error: ue } = await supabase.storage.from(ATTACH_BUCKET).upload(key, file, {
      contentType: file.type || 'application/octet-stream', upsert: false,
    })
    if (ue) throw ue
    const { data: auth } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('attachments')
      .insert({ card_id: cardId, uploaded_by: auth?.user?.id ?? null, filename: file.name, mime: file.type || null, size: file.size, s3_key: key })
      .select().single()
    if (error) {
      // roll back the orphaned object so storage and table stay consistent
      await supabase.storage.from(ATTACH_BUCKET).remove([key])
      throw error
    }
    return data
  },
  // Short-lived signed URL to open/preview a private attachment.
  async attachmentUrl(s3_key) {
    const { data, error } = await supabase.storage.from(ATTACH_BUCKET).createSignedUrl(s3_key, 3600)
    if (error) throw error
    return data.signedUrl
  },
}

// In real mode, realApi implements the CRUD/board endpoints; the permissions
// matrix stays mock-served (static reference data, identical in both modes).
// Demo mode has no realtime backend — provide a no-op so Board can always call it.
if (!mockApi.subscribeBoard) mockApi.subscribeBoard = () => () => {}

export const api = configured ? { ...mockApi, ...realApi } : mockApi
export const demoMode = !configured
