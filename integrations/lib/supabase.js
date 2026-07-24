import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SECRET_KEY (see .env.example)')

// Backend client: secret key bypasses RLS, so we scope by organization_id ourselves.
export const supabase = createClient(url, key, {
  db: { schema: 'schedule_portal' },
  auth: { persistSession: false, autoRefreshToken: false },
})

let _orgId
export async function getOrgId(slug = 'delta-pro-clean') {
  if (_orgId) return _orgId
  const { data, error } = await supabase.from('organizations').select('id').eq('slug', slug).single()
  if (error) throw new Error(`Cannot resolve org "${slug}": ${error.message}`)
  _orgId = data.id
  return _orgId
}

// Map staged rows → boards/cards (idempotent, in the DB). Returns cards created.
export async function mapImported(source = null) {
  const { data, error } = await supabase.rpc('map_imported_schedules', { p_source: source })
  if (error) throw error
  return data ?? 0
}

// Idempotent upsert on (source, external_id).
export async function upsertSchedules(rows) {
  if (!rows.length) return { count: 0 }
  const { error, count } = await supabase
    .from('imported_schedules')
    .upsert(rows, { onConflict: 'source,external_id', count: 'exact' })
  if (error) throw error
  return { count: count ?? rows.length }
}

// Fill only missing presentation fields on already-mapped cards. This preserves
// dispatch/manual edits while allowing a calibrated adapter to enrich older imports.
export async function syncMappedCardDetails(source) {
  const { data: imports, error: ie } = await supabase
    .from('imported_schedules')
    .select('mapped_card_id,builder,community,plan,lot,address,super_name,super_phone,po_number')
    .eq('source', source)
    .not('mapped_card_id', 'is', null)
  if (ie) throw ie
  if (!imports?.length) return 0

  const ids = imports.map((row) => row.mapped_card_id)
  const { data: cards, error: ce } = await supabase
    .from('cards')
    .select('id,client_text,building,plan,lot,address,ps_note')
    .in('id', ids)
  if (ce) throw ce
  const byId = new Map((cards || []).map((card) => [card.id, card]))
  let updated = 0

  for (const row of imports) {
    const card = byId.get(row.mapped_card_id)
    if (!card) continue
    const patch = {}
    if (!card.client_text && row.builder) patch.client_text = row.builder
    if (!card.building && row.community) patch.building = row.community
    if (!card.plan && row.plan) patch.plan = row.plan
    if (!card.lot && row.lot) patch.lot = row.lot
    if (!card.address && row.address) patch.address = row.address
    const ps = [
      row.super_name ? `SUPER: ${row.super_name}${row.super_phone ? ` ${row.super_phone}` : ''}` : null,
      row.po_number ? `PO: ${row.po_number}` : null,
      `SRC: ${source}`,
    ].filter(Boolean).join(' · ')
    if ((!card.ps_note || card.ps_note === `SRC: ${source}`) && ps !== card.ps_note) patch.ps_note = ps
    if (!Object.keys(patch).length) continue
    const { error } = await supabase.from('cards').update(patch).eq('id', card.id)
    if (error) throw error
    updated += 1
  }
  return updated
}