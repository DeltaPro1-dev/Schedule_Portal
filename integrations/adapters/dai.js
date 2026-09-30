// DAI adapter. BuilderLynx vendor portal (dai.builderlynx.com). The session is not kept between runs,
// so every run logs in (lib/builderlynx.js checks the form first).
// Unit Tasks read by lib/builderlynx.js (calibrated 2026-09-29 on the live portals).
import { makeBuilderLynx } from '../lib/builderlynx.js'

const A = makeBuilderLynx({
  source: 'dai',
  label: 'DAI',
  host: 'https://dai.builderlynx.com',
  urlKey: 'DAI_URL',
  userKey: 'DAI_USER',
  passKey: 'DAI_PASS',
})

export const meta = A.meta
export const homeUrl = A.homeUrl
export const isLoggedIn = A.isLoggedIn
export const login = A.login
export const scrape = A.scrape
