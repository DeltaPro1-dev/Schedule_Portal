// Build the structured card briefing from its fields (see glossary.md).

function cleanRawTitle(value = '') {
  return String(value)
    .replace(/\*\*/g, '')
    .replace(/^\s*&\s*/, '')
    .replace(/\s+-\s+-\s+/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function weekday(date) {
  if (!date) return null
  const parsed = new Date(`${date}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()
}

export function cardTitle(card) {
  if (card.raw_title) return cleanRawTitle(card.raw_title)
  const parts = []
  const day = weekday(card.board_date)
  if (day) parts.push(day)
  const client = card.client?.name || card.client_text
  if (client) parts.push(client)
  if (card.building && card.building !== client) parts.push(card.building)
  if (card.plan) parts.push(card.plan)
  if (card.lot) parts.push(`Lot ${card.lot}`)
  if (card.service_type) parts.push(card.service_type)
  if (card.scheduled_time) parts.push(card.scheduled_time)
  if (card.address) parts.push(`(${card.address})`)
  if (card.fin_contact) parts.push(`FIN: ${card.fin_contact}`)
  if (card.ps_note) parts.push(`PS: ${card.ps_note}`)
  return parts.join(' - ') || 'Untitled service'
}

export function cardHeadline(card) {
  if (card.raw_title) return cleanRawTitle(card.raw_title)
  return card.client?.name || card.client_text || card.building || card.service_type || 'Service'
}