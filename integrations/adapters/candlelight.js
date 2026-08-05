// Candlelight Homes adapter. BuilderLynx vendor portal (candlelight.builderlynx.com/cc).
// First-pass scaffold: login + schedule dump + generic parse — calibrate the schedule
// view in the assisted session. (BuilderLynx also powers DAI and Concord.)
import { makeScaffold } from '../lib/scaffold.js'

const A = makeScaffold({
  source: 'candlelight',
  label: 'Candlelight Homes',
  hostRe: /builderlynx/i,
  homeUrl: (env) => env.CANDLELIGHT_URL || 'https://candlelight.builderlynx.com/cc/',
  scheduleUrl: (env) => env.CANDLELIGHT_SCHEDULE_URL || null,
  userKey: 'CANDLELIGHT_USER',
  passKey: 'CANDLELIGHT_PASS',
})

export const meta = A.meta
export const homeUrl = A.homeUrl
export const isLoggedIn = A.isLoggedIn
export const login = A.login
export const scrape = A.scrape
