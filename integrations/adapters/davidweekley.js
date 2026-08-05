// David Weekley Homes adapter. Vendor Portal at vendor.davidweekleyhomes.com — a
// calendar grid of cards (service title, address, job#, "Awaiting Confirmation" /
// "Confirmed by X"). The generic table parser likely returns [] against a card grid;
// the DUMP is the deliverable until the assisted session, where the card DOM gets a
// dedicated parser (see Downloads/David Weekley.png for the layout).
import { makeScaffold } from '../lib/scaffold.js'

const A = makeScaffold({
  source: 'davidweekley',
  label: 'David Weekley Homes',
  hostRe: /davidweekleyhomes/i,
  homeUrl: (env) => env.DAVIDWEEKLEY_URL || 'https://vendor.davidweekleyhomes.com',
  scheduleUrl: (env) => env.DAVIDWEEKLEY_SCHEDULE_URL || null,
  userKey: 'DAVIDWEEKLEY_USER',
  passKey: 'DAVIDWEEKLEY_PASS',
})

export const meta = A.meta
export const homeUrl = A.homeUrl
export const isLoggedIn = A.isLoggedIn
export const login = A.login
export const scrape = A.scrape
