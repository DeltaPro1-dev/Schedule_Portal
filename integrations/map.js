import 'dotenv/config'
import { mapImported } from './lib/supabase.js'

// Map staged imports → boards/cards. Optional source filter: `node map.js supplypro`.
const source = process.argv.slice(2).find((a) => !a.startsWith('--')) || null

try {
  const n = await mapImported(source)
  console.log(`Mapped ${n} new card(s) into boards${source ? ` (source=${source})` : ''}.`)
} catch (e) {
  console.error('Mapping failed:', e.message)
  process.exitCode = 1
}
