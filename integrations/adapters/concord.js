// Concord Homes adapter. BuilderLynx vendor portal (concord.builderlynx.com).
// First-pass scaffold: login + schedule dump + generic parse — calibrate the schedule
// view in the assisted session.
import { makeScaffold } from '../lib/scaffold.js'

const A = makeScaffold({
  source: 'concord',
  label: 'Concord Homes',
  hostRe: /builderlynx/i,
  homeUrl: (env) => env.CONCORD_URL || 'https://concord.builderlynx.com/',
  scheduleUrl: (env) => env.CONCORD_SCHEDULE_URL || null,
  userKey: 'CONCORD_USER',
  passKey: 'CONCORD_PASS',
})

export const meta = A.meta
export const homeUrl = A.homeUrl
export const isLoggedIn = A.isLoggedIn
export const login = A.login
export const scrape = A.scrape
