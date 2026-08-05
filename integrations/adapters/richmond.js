// Richmond American Homes adapter. Richmond (MDC Holdings) does NOT expose a web
// schedule — they drop schedules as FILES on ShareFile (mdcholdings.sharefile.com),
// per subdivision (Pastures at Saddleback, Wildhorse, Overlake, Drumore, Anderson
// Farms, …). So this needs a DOWNLOAD + parse flow, not a table scrape.
//
// First-pass scaffold: logs into ShareFile and DUMPS the landing folder so we can map
// the folder structure in the assisted session, then wire a download+parse step.
// ShareFile uses a two-step "SplitCredentials" login — calibrate selectors headful.
import { makeScaffold } from '../lib/scaffold.js'

const A = makeScaffold({
  source: 'richmond',
  label: 'Richmond American Homes',
  hostRe: /sharefile/i,
  homeUrl: (env) => env.RICHMOND_URL || 'https://mdcholdings.sharefile.com/Authentication/Login#SplitCredentials',
  scheduleUrl: (env) => env.RICHMOND_SCHEDULE_URL || null,
  userKey: 'RICHMOND_USER',
  passKey: 'RICHMOND_PASS',
})

export const meta = A.meta
export const homeUrl = A.homeUrl
export const isLoggedIn = A.isLoggedIn
export const login = A.login
export const scrape = A.scrape
