// Move a portal's trusted browser session between machines (owner, 2026-10-19: robots moved to the cloud server).
//   node session-transfer.js export <portal>   -> auth/<portal>-session.json (cookies + local storage of the profile)
//   node session-transfer.js import <portal>   <- auth/<portal>-session.json into this machine's profile
// The file holds login cookies: keep it private and delete it after the import.
import { chromium } from 'playwright'
import { readFile, writeFile, rm } from 'node:fs/promises'

const [mode, name] = process.argv.slice(2)
if (!['export', 'import'].includes(mode) || !name) { console.error('usage: node session-transfer.js export|import <portal>'); process.exit(1) }
const profileDir = `auth/${name}-profile`
const file = `auth/${name}-session.json`
const opts = { headless: true, viewport: null, args: ['--disable-blink-features=AutomationControlled'] }
let context
try { context = await chromium.launchPersistentContext(profileDir, { ...opts, channel: 'chrome' }) }
catch { context = await chromium.launchPersistentContext(profileDir, opts) }
try {
  if (mode === 'export') {
    const state = await context.storageState()
    await writeFile(file, JSON.stringify(state))
    console.log(`Exported ${state.cookies.length} cookies and ${state.origins.length} origins to ${file}`)
  } else {
    const state = JSON.parse(await readFile(file, 'utf8'))
    await context.addCookies(state.cookies)
    const page = context.pages()[0] || (await context.newPage())
    for (const origin of state.origins ?? []) {
      if (!origin.localStorage?.length) continue
      await page.goto(origin.origin, { waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.evaluate((items) => { for (const { name, value } of items) localStorage.setItem(name, value) }, origin.localStorage).catch(() => {})
    }
    await rm(file, { force: true })
    console.log(`Imported ${state.cookies.length} cookies into ${profileDir} (session file removed)`)
  }
} finally { await context.close() }
