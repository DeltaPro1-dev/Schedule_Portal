// Build Right Contractors (CoConstruct) adapter. Partner portal at
// coconstruct.com/app/partner/auth/parmainmenu.aspx. First-pass scaffold: login +
// schedule dump + generic parse — calibrate the schedule view in the assisted session.
import { makeScaffold } from '../lib/scaffold.js'

const A = makeScaffold({
  source: 'buildright',
  label: 'Build Right (CoConstruct)',
  builder: 'Build Right Contractors',
  hostRe: /coconstruct/i,
  homeUrl: (env) => env.BUILDRIGHT_URL || 'https://coconstruct.com/app/partner/auth/parmainmenu.aspx',
  scheduleUrl: (env) => env.BUILDRIGHT_SCHEDULE_URL || null,
  userKey: 'BUILDRIGHT_USER',
  passKey: 'BUILDRIGHT_PASS',
})

export const meta = A.meta
export const homeUrl = A.homeUrl
export const isLoggedIn = A.isLoggedIn
export const login = A.login
export const scrape = A.scrape
