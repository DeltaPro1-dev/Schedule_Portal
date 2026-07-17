// Presentation helpers to render schedule_portal data in the Claude Design look.
import { cardTitle } from './title.js'

export function initials(name = '') {
  return (
    name
      .replace(/[,&]/g, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('') || '?'
  ).toUpperCase()
}

// Split the structured title into a bold head (client/first segment) + rest.
export function cardHeadBody(card) {
  const full = cardTitle(card)
  const idx = full.indexOf(' · ')
  if (idx === -1) return { head: full, body: '' }
  return { head: full.slice(0, idx), body: full.slice(idx) }
}

// Deterministic avatar hue from a string.
export function hueOf(seed = '') {
  let h = 9
  for (const c of seed) h = (h * 33 + c.charCodeAt(0)) >>> 0
  return h % 360
}

export function avatarStyle(seed) {
  const h = hueOf(seed)
  return {
    width: 30, height: 30, flex: 'none', borderRadius: '50%',
    background: `oklch(0.92 0.05 ${h})`, color: `oklch(0.42 0.12 ${h})`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 600, fontFamily: 'var(--sans)',
  }
}

export const REGION_LABEL = {
  north: 'North', south: 'South', st_george: 'St George',
  another: 'Another State', all: 'All regions',
}

// Structured-description key/value rows for the card modal.
export function cardFields(card) {
  const rows = [
    ['Client', card.client?.name || card.client_text],
    ['Building', card.building],
    ['Service type', card.service_type],
    ['Scheduled', card.scheduled_time],
    ['Address', card.address || card.client?.address],
    ['Plan', card.plan],
    ['Lot', card.lot],
    ['Finance', card.fin_contact],
    ['PS note', card.ps_note],
  ]
  return rows.filter(([, v]) => v).map(([k, v]) => ({ k, v }))
}
