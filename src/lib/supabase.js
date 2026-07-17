import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill them in.',
  )
}

// All queries default to the `schedule_portal` schema (shared project — see
// DECISIONS.md G1). Remember to add it to "Exposed schemas" in the dashboard.
// Fall back to harmless placeholders when unconfigured so the module doesn't
// throw at import time — App gates all real usage behind the `configured` check.
export const supabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'public-anon-placeholder',
  { db: { schema: 'schedule_portal' } },
)

// RPCs / helpers are also under schedule_portal; supabase.rpc() resolves within
// the configured schema.
export const SCHEMA = 'schedule_portal'
