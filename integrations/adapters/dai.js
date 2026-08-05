// DAI adapter. BuilderLynx vendor portal (dai.builderlynx.com). NOTE: DAI now routes
// through a "Premier" link they send by EMAIL — set DAI_URL to that link when it
// arrives (the static login may no longer land on the schedule). First-pass scaffold:
// login + schedule dump + generic parse — calibrate in the assisted session.
import { makeScaffold } from '../lib/scaffold.js'

const A = makeScaffold({
  source: 'dai',
  label: 'DAI',
  hostRe: /builderlynx/i,
  homeUrl: (env) => env.DAI_URL || 'https://dai.builderlynx.com',
  scheduleUrl: (env) => env.DAI_SCHEDULE_URL || null,
  userKey: 'DAI_USER',
  passKey: 'DAI_PASS',
})

export const meta = A.meta
export const homeUrl = A.homeUrl
export const isLoggedIn = A.isLoggedIn
export const login = A.login
export const scrape = A.scrape
