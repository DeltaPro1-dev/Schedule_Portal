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

// Idempotent upsert on (source, external_id).
export async function upsertSchedules(rows) {
  if (!rows.length) return { count: 0 }
  const { error, count } = await supabase
    .from('imported_schedules')
    .upsert(rows, { onConflict: 'source,external_id', count: 'exact' })
  if (error) throw error
  return { count: count ?? rows.length }
}
