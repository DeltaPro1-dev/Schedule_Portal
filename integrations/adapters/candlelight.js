// Candlelight Homes adapter. BuilderLynx vendor portal (candlelight.builderlynx.com/cc).
// Unit Tasks read by lib/builderlynx.js (calibrated 2026-09-29 on the live portals).
import { makeBuilderLynx } from '../lib/builderlynx.js'

const A = makeBuilderLynx({
  source: 'candlelight',
  label: 'Candlelight Homes',
  host: 'https://candlelight.builderlynx.com',
  urlKey: 'CANDLELIGHT_URL',
  userKey: 'CANDLELIGHT_USER',
  passKey: 'CANDLELIGHT_PASS',
})

export const meta = A.meta
export const homeUrl = A.homeUrl
export const isLoggedIn = A.isLoggedIn
export const login = A.login
export const scrape = A.scrape
