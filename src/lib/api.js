// Data API used by the UI. In demo mode (no .env) it is the in-memory mock.
// When Supabase is configured it talks to the schedule_portal schema. Both
// expose the same method surface, so components never change.

import { supabase } from './supabase.js'
import { mockApi } from './mock.js'

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

const realApi = {
  async getBoards() {
    const { data, error } = await supabase
      .from('boards')
      .select('*, lists(count)')
      .order('date', { ascending: false })
    if (error) throw error
    return data.map((b) => ({ ...b, workerCount: b.lists?.[0]?.count ?? 0 }))
  },

  async getBoardDetail(boardId) {
    const [{ data: board, error: be }, { data: lists, error: le }, { data: cards, error: ce }] =
      await Promise.all([
        supabase.from('boards').select('*').eq('id', boardId).single(),
        supabase.from('lists').select('*').eq('board_id', boardId).order('position'),
        supabase
          .from('cards')
          .select('*, client:clients(*), card_labels(label:labels(*)), checklist_items(*), comments(*)')
          .eq('board_id', boardId)
          .is('deleted_at', null)
          .order('position'),
      ])
    if (be || le || ce) throw be || le || ce
    return { board, lists, cards: cards.map(mapCard) }
  },

  async addBoard({ title, date, month, cover_hue }) {
    const { data, error } = await supabase
      .from('boards')
      .insert({ title, date, month, cover_hue })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async addList({ board_id, name }) {
    const { data, error } = await supabase
      .from('lists')
      .insert({ board_id, name })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async addCard({ board_id, list_id, raw_title, ...fields }) {
    const { data, error } = await supabase
      .from('cards')
      .insert({ board_id, list_id, raw_title: raw_title || null, ...fields })
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
    const { data, error } = await supabase
      .from('cards')
      .update({ done: !current })
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
