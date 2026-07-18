// Data API used by the UI. In demo mode (no .env) it is the in-memory mock.
// When Supabase is configured it talks to the schedule_portal schema. Both
// expose the same method surface, so components never change.

import { supabase } from './supabase.js'
import { mockApi } from './mock.js'
import { initials } from './present.js'

export const configured =
  !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY

function mapCard(row) {
  return {
    ...row,
    client: row.client || null,
    labels: (row.card_labels || []).map((cl) => cl.label).filter(Boolean),
    labelKeys: (row.card_labels || []).map((cl) => cl.label?.key).filter(Boolean),
    checklist: row.checklist_items || [],
    comments: row.comments || [],
  }
}

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
          .select('*, client:clients(*), card_labels(label:labels(*)), checklist_items(*), comments(*)')
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
}

// In real mode, realApi implements the CRUD/board endpoints; reference-only
// screens (roster/members/perm-matrix/integration/exports/audit) fall back to
// mock data until their backend endpoints exist.
export const api = configured ? { ...mockApi, ...realApi } : mockApi
export const demoMode = !configured
