// Concord Homes adapter. BuilderLynx vendor portal (concord.builderlynx.com).
// Unit Tasks read by lib/builderlynx.js (calibrated 2026-09-29 on the live portals).
import { makeBuilderLynx } from '../lib/builderlynx.js'

const A = makeBuilderLynx({
  source: 'concord',
  label: 'Concord Homes',
  host: 'https://concord.builderlynx.com',
  urlKey: 'CONCORD_URL',
  userKey: 'CONCORD_USER',
  passKey: 'CONCORD_PASS',
})

export const meta = A.meta
export const homeUrl = A.homeUrl
export const isLoggedIn = A.isLoggedIn
export const login = A.login
export const scrape = A.scrape
