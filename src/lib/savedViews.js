// Saved table views — persisted per-browser in localStorage. This is the MVP
// (no schema change): views are filter/sort presets local to the user's browser.
// Shared / cross-device views (the `SavedView` table in data-model.md) remain a
// future item and need a migration + contract decision (Regra de Ouro).

const KEY = 'delta.savedViews.table'

export function listViews() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

function write(views) {
  try { localStorage.setItem(KEY, JSON.stringify(views)) } catch { /* quota / disabled — ignore */ }
}

// Save a named view. config = { query, status, sort }. Returns the new list.
export function saveView(name, config) {
  const views = listViews()
  const id = `v-${name.toLowerCase().replace(/\s+/g, '-')}-${views.length}`
  views.push({ id, name: name.trim(), ...config })
  write(views)
  return views
}

export function removeView(id) {
  const views = listViews().filter((v) => v.id !== id)
  write(views)
  return views
}
