// Fieldstone Homes adapter. BuilderPortal.net vendor portal at
// fieldstone.builderportal.net/BuilderPortal. First-pass scaffold: login + schedule
// dump + generic parse — calibrate the schedule view in the assisted session.
import { makeScaffold } from '../lib/scaffold.js'

const A = makeScaffold({
  source: 'fieldstone',
  label: 'Fieldstone Homes',
  hostRe: /builderportal/i,
  homeUrl: (env) => env.FIELDSTONE_URL || 'https://fieldstone.builderportal.net/BuilderPortal',
  scheduleUrl: (env) => env.FIELDSTONE_SCHEDULE_URL || null,
  userKey: 'FIELDSTONE_USER',
  passKey: 'FIELDSTONE_PASS',
})

export const meta = A.meta
export const homeUrl = A.homeUrl
export const isLoggedIn = A.isLoggedIn
export const login = A.login
export const scrape = A.scrape
