// Procore adapter. Procore is a construction-management platform; Delta accesses it
// as a vendor/sub. Login is at login.procore.com (may present MFA/company selection),
// then the schedule lives inside a project's Schedule tool.
//
// First-pass scaffold: login + schedule dump + generic parse. The real parser is
// written against the DOM captured in the assisted session (`npm run explore procore`).
// Procore also has an OAuth REST API — if UI scraping proves brittle, that is the
// better long-term path (needs an app registration on Procore's developer portal).
import { makeScaffold } from '../lib/scaffold.js'

const A = makeScaffold({
  source: 'procore',
  label: 'Procore',
  hostRe: /procore\.com/i,
  homeUrl: (env) => env.PROCORE_URL || 'https://login.procore.com/',
  scheduleUrl: (env) => env.PROCORE_SCHEDULE_URL || null,
  userKey: 'PROCORE_USER',
  passKey: 'PROCORE_PASS',
})

export const meta = A.meta
export const homeUrl = A.homeUrl
export const isLoggedIn = A.isLoggedIn
export const login = A.login
export const scrape = A.scrape
