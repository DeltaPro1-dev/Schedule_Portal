// Visionary Homes adapter. Visionary runs on Microsoft Dynamics 365 Finance &
// Operations (visionary.operations.dynamics.com) behind Azure AD with MFA — they
// send a one-time CODE on every login. That makes it ASSISTED-ONLY:
//   node run.js visionary --headful
// enter the email + password + the MFA code by hand in the window; the run waits.
//
// STATUS: login/hand-off is implemented; the SCHEDULE VIEW inside D365 is not yet
// located (heavy SPA — needs a discovery session). `scrape` dumps the landing page
// and returns []. Once we know the schedule form/grid URL, wire it here.
export const meta = { source: 'visionary', label: 'Visionary Homes' }

const APP = 'https://visionary.operations.dynamics.com/'
const appUrl = (env) => env.VISIONARY_URL || APP
export const homeUrl = appUrl

export async function isLoggedIn(page) {
  // In the D365 app (not on a microsoftonline.com login/MFA page) and no password field.
  const hasPw = await page.$('input[type="password"]').catch(() => null)
  return !hasPw && /dynamics\.com/i.test(page.url()) && !/login\.microsoftonline|\/oauth2\//i.test(page.url())
}

export async function login(page, env, { dump } = {}) {
  await page.goto(appUrl(env), { waitUntil: 'domcontentloaded' }).catch(() => {})
  // Azure AD: fill the email if the field is present; password + MFA are done by hand.
  const email = await page.$('input[type="email"], input[name="loginfmt"]').catch(() => null)
  if (email && env.VISIONARY_USER) {
    await email.fill(env.VISIONARY_USER).catch(() => {})
    const next = await page.$('#idSIButton9, input[type="submit"]').catch(() => null)
    if (next) await next.click().catch(() => {})
  }
  if (env.VISIONARY_PASS) {
    const pass = await page.waitForSelector('input[type="password"]', { timeout: 15000 }).catch(() => null)
    if (pass) {
      await pass.fill(env.VISIONARY_PASS).catch(() => {})
      const signin = await page.$('#idSIButton9, input[type="submit"]').catch(() => null)
      if (signin) await signin.click().catch(() => {})
    }
  }
  console.log('Visionary: complete the MFA code + any prompts in the browser window (up to 4 min)…')
  const authed = await page
    .waitForFunction(() => /dynamics\.com/i.test(location.href) && !/login\.microsoftonline|\/oauth2\//i.test(location.href), { timeout: 240000, polling: 1500 })
    .then(() => true)
    .catch(() => false)
  if (!authed) { if (dump) await dump('login-stuck'); throw new Error('Visionary login not completed (MFA). Re-run with --headful and enter the code.') }
}

export async function scrape(page, { dump, env = {} }) {
  if (!(await isLoggedIn(page))) await login(page, env, { dump })
  await page.waitForTimeout(2000)
  if (dump) await dump('landing')
  console.warn('Visionary: schedule view not yet located inside D365. Inspect debug/visionary-*/landing.html to find the schedule form, then wire scrape().')
  return []
}
