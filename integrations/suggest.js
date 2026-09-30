// Jev suggestions for client tasks without a rule (suggestion only). `npm run suggest` runs it on all
// imports; run.js also runs it after every portal run.
import 'dotenv/config'
import { suggestServices } from './lib/suggest.js'

try { await suggestServices({ max: Number(process.argv[2]) || 300 }) }
catch (e) { console.error('Suggest failed:', e.message); process.exitCode = 1 }
