// Build the structured card briefing from its fields (see glossary.md).
// Manual cards fall back to raw_title.

export function cardTitle(card) {
  if (card.raw_title) return card.raw_title
  const parts = []
  if (card.scheduled_time) parts.push(`SCHEDULED AT ${card.scheduled_time}`)
  const client = card.client?.name || card.client_text
  if (client) parts.push(client)
  if (card.building) parts.push(card.building)
  if (card.service_type) parts.push(card.service_type)
  if (card.address) parts.push(`(${card.address})`)
  if (card.fin_contact) parts.push(`FIN: ${card.fin_contact}`)
  if (card.ps_note) parts.push(`PS: ${card.ps_note}`)
  return parts.join(' · ') || 'Untitled service'
}

// A shorter one-liner for the card tile (client + type).
export function cardHeadline(card) {
  if (card.raw_title) return card.raw_title
  return (
    card.client?.name ||
    card.client_text ||
    card.building ||
    card.service_type ||
    'Service'
  )
}
