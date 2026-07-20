// Minimal client-side CSV export. Used by the Table view for the "small export"
// path (§13: CSV for filtered/selected cards) — no server worker needed. Large /
// scheduled exports still go through the async export worker (roadmap G2).

function cell(v) {
  const s = v == null ? '' : String(v)
  // quote if it contains a comma, quote, or newline; double embedded quotes
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// rows: array of objects; columns: [{ key, label }]. Returns a CSV string.
export function toCsv(rows, columns) {
  const header = columns.map((c) => cell(c.label)).join(',')
  const body = rows.map((r) => columns.map((c) => cell(r[c.key])).join(',')).join('\n')
  return `${header}\n${body}`
}

// Trigger a browser download of `text` as `filename`.
export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
