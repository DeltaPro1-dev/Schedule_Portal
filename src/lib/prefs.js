// User preferences — persisted per-browser in localStorage (same MVP stance as
// saved views). Today: in-app notification preferences (muted kinds), consumed
// by the NotificationBell. Server-side per-user prefs (cross-device) are a
// future item needing a table + contract decision.

const KEY = 'delta.prefs.notifications'

export const NOTIFICATION_KINDS = [
  { kind: 'assignment', label: 'New assignment', hint: 'a card lands on your list' },
  { kind: 'status', label: 'Service completed', hint: 'work in your scope is marked done' },
  { kind: 'comment', label: 'Comments', hint: 'new comments on cards you follow' },
  { kind: 'mention', label: 'Mentions', hint: 'someone @mentions you' },
  { kind: 'export', label: 'Export ready', hint: 'your export finished' },
  { kind: 'integration', label: 'Integration errors', hint: 'sync failures / DLQ' },
]

export function getMutedKinds() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')) } catch { return new Set() }
}

export function setKindMuted(kind, muted) {
  const set = getMutedKinds()
  if (muted) set.add(kind); else set.delete(kind)
  try { localStorage.setItem(KEY, JSON.stringify([...set])) } catch { /* quota/disabled */ }
  return set
}
