// Which day(s) to pull. Rule: normally the NEXT day; on Friday, pull the whole
// weekend + Monday (Sat, Sun, Mon). Runs on the machine's local date.

export function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function targetDates(today = new Date()) {
  const dow = today.getDay() // 0=Sun … 5=Fri … 6=Sat
  const offsets = dow === 5 ? [1, 2, 3] : [1] // Friday → Sat/Sun/Mon; otherwise → next day
  return offsets.map((n) => addDays(today, n))
}

export function parts(d) {
  return { d: d.getDate(), m: d.getMonth() + 1, y: d.getFullYear() }
}

export function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Resolve the "base date" (today), overridable via env for testing/backfill.
export function baseDate(env = {}) {
  return env.SCRAPE_BASE_DATE ? new Date(`${env.SCRAPE_BASE_DATE}T12:00:00`) : new Date()
}
