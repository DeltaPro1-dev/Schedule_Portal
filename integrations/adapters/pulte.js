// Pulte Group adapter. Builder Web Portal at bwp.pulte.com. First-pass scaffold:
// login + schedule dump + generic parse — calibrate the schedule view in the
// assisted --headful session.
import { makeScaffold } from '../lib/scaffold.js'

const A = makeScaffold({
  source: 'pulte',
  label: 'Pulte Group',
  hostRe: /pulte/i,
  homeUrl: (env) => env.PULTE_URL || 'https://bwp.pulte.com/',
  scheduleUrl: (env) => env.PULTE_SCHEDULE_URL || null,
  userKey: 'PULTE_USER',
  passKey: 'PULTE_PASS',
})

export const meta = A.meta
export const homeUrl = A.homeUrl
export const isLoggedIn = A.isLoggedIn
export const login = A.login
export const scrape = A.scrape
