// Paskr / RedTeam adapter (United Contractors, Barr CO). Direct login lives at
// pm.paskr.com/<tenant>/login.cfm (ColdFusion); RedTeam is the SSO front (OAuth).
// First-pass scaffold: login + schedule dump + generic parse — calibrate the
// schedule view in the assisted --headful session.
import { makeScaffold } from '../lib/scaffold.js'

const A = makeScaffold({
  source: 'paskr',
  label: 'Paskr / United Contractors',
  hostRe: /paskr|redteam/i,
  homeUrl: (env) => env.PASKR_URL || 'https://pm.paskr.com/united/login.cfm',
  scheduleUrl: (env) => env.PASKR_SCHEDULE_URL || null,
  userKey: 'PASKR_USER',
  passKey: 'PASKR_PASS',
})

export const meta = A.meta
export const homeUrl = A.homeUrl
export const isLoggedIn = A.isLoggedIn
export const login = A.login
export const scrape = A.scrape
