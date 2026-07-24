// Dictionary of place references — data completion for incomplete imported cards.
// An entry maps a place identifier (building/subdivision/client/address) to the
// canonical field values; incomplete cards from the same place get auto-completed.
// Pure logic here (no I/O), used by the Dictionary screen and batch-apply.

// Fields a card needs to be exportable to Field Control. A card missing any of
// these (empty/null) is "incomplete".
export const REQUIRED_FIELDS = [
  { key: 'client', label: 'Client / builder' },
  { key: 'address', label: 'Address' },
  { key: 'service_type', label: 'Service type' },
  { key: 'plan', label: 'Floor plan' },
  { key: 'lot', label: 'Lot' },
]

// Fields a dictionary entry can fill on a card.
export const FILL_FIELDS = ['client_text', 'address', 'subdivision', 'plan', 'lot', 'service_type', 'fin_contact', 'ps_note']

// What can key a reference (must be a value present on the incomplete card).
export const MATCH_FIELDS = [
  { key: 'building', label: 'Building' },
  { key: 'subdivision', label: 'Subdivision / community' },
  { key: 'client', label: 'Client / builder' },
  { key: 'address', label: 'Address' },
]
// Most specific → least specific (specific reference wins when several match).
const SPECIFICITY = { building: 0, address: 1, subdivision: 2, client: 3 }

const norm = (v) => String(v ?? '').trim().toLowerCase()
const isEmpty = (v) => v == null || String(v).trim() === ''

// A card's value for a logical field (client is client_text || client.name).
export function cardValue(card, key) {
  if (key === 'client') return card.client_text || card.client?.name || ''
  return card[key] ?? ''
}

// Which required fields are missing on a card.
export function missingFields(card) {
  return REQUIRED_FIELDS.filter((f) => isEmpty(cardValue(card, f.key)))
}
export const isIncomplete = (card) => missingFields(card).length > 0

// Entries that match a card (its non-empty identifier equals the entry's key).
export function matchingEntries(card, entries) {
  return (entries || [])
    .filter((e) => !isEmpty(e.match_value) && norm(cardValue(card, e.match_field)) === norm(e.match_value))
    .sort((a, b) => (SPECIFICITY[a.match_field] ?? 9) - (SPECIFICITY[b.match_field] ?? 9))
}

// Patch of empty card fields to fill from matching entries (specific wins).
// Returns {} when nothing to fill.
export function computeFills(card, entries) {
  const matches = matchingEntries(card, entries)
  const patch = {}
  for (const key of FILL_FIELDS) {
    if (!isEmpty(cardValue(card, key === 'client_text' ? 'client' : key))) continue
    for (const e of matches) {
      if (!isEmpty(e[key])) { patch[key] = e[key]; break }
    }
  }
  return patch
}

// Build a reference draft from a card that has the correct values (for "save as
// reference"): key = the strongest identifier present, fills = the card's values.
export function referenceFromCard(card) {
  const field = ['building', 'subdivision', 'client', 'address'].find((k) => !isEmpty(cardValue(card, k)))
  const draft = { match_field: field || 'building', match_value: field ? cardValue(card, field) : '' }
  for (const key of FILL_FIELDS) {
    const v = key === 'client_text' ? cardValue(card, 'client') : card[key]
    if (!isEmpty(v)) draft[key] = v
  }
  return draft
}
