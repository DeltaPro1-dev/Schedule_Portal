// Field Control "Ordens" export — the CSV must match the import template exactly
// (reference: "Agenda_YYYY-MM-DD.xlsx", sheet "Ordens").
//
// 13 columns, in this order. UTF-8 with BOM, comma-separated, CRLF line endings.
// A/C/F/H/J/L are always blank (present but empty). Date is mm/dd/yyyy. Labels are
// the label NAMES, alphabetical, joined by " ; " with a trailing space.

const HEADERS = [
  'Identificador',
  'Tipo de OS',
  'Documento do cliente',
  'Nome do cliente',
  'Nome da localização',
  'Número de série',
  'Nome do colaborador',
  'Nomes dos colaboradores secundarios',
  'Data de agendamento',
  'Hora de agendamento',
  'Descrição',
  'Descrição da tarefa',
  'Etiquetas',
]

function csvCell(v) {
  const s = v == null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// "2026-07-20" -> "07/20/2026"
function mmddyyyy(isoDate) {
  const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[2]}/${m[3]}/${m[1]}` : String(isoDate || '')
}

// "building - plan - lot" (defaults: No Plan / No Lot), matching the template.
function location(c) {
  if (!c.building && !c.plan && !c.lot) return ''
  return `${c.building || ''} - ${c.plan || 'No Plan'} - ${c.lot || 'No Lot'}`
}

// [& **SCHEDULED AT {time}** ] PS: {ps_note}
function description(c) {
  const sched = c.scheduled_time ? `& **SCHEDULED AT ${c.scheduled_time}** ` : ''
  return `${sched}PS: ${c.ps_note || ''}`
}

// label names, alphabetical, joined by " ; " + trailing space (e.g. "Residential ; St George ")
function labels(c) {
  const names = (c.labels || []).map((l) => l.name).filter(Boolean).sort((a, b) => a.localeCompare(b))
  return names.length ? names.join(' ; ') + ' ' : ''
}

// The card rows that get exported: everything except the resource pool list,
// ordered by column (list position) then card position — matches the template's
// worker-grouped layout.
export function exportableRows({ lists, cards }) {
  const listById = Object.fromEntries((lists || []).map((l) => [l.id, l]))
  return [...(cards || [])]
    .filter((c) => !listById[c.list_id]?.is_pool)
    .sort((a, b) => {
      const pa = listById[a.list_id]?.position ?? 0
      const pb = listById[b.list_id]?.position ?? 0
      return pa !== pb ? pa - pb : a.position - b.position
    })
    .map((c) => ({ card: c, list: listById[c.list_id] }))
}

export function buildFieldControlCsv({ board, lists, cards }) {
  const date = mmddyyyy(board.date)
  const dataRows = exportableRows({ lists, cards }).map(({ card, list }) => [
    '',                                       // A Identificador
    card.service_type || '',                  // B Tipo de OS
    '',                                       // C Documento do cliente
    card.client?.name || card.client_text || '', // D Nome do cliente
    location(card),                           // E Nome da localização
    '',                                       // F Número de série
    list?.name || '',                         // G Nome do colaborador
    '',                                       // H Nomes dos colaboradores secundarios
    date,                                     // I Data de agendamento
    '',                                       // J Hora de agendamento
    description(card),                        // K Descrição
    '',                                       // L Descrição da tarefa
    labels(card),                             // M Etiquetas
  ])
  const lines = [HEADERS, ...dataRows].map((r) => r.map(csvCell).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n'   // BOM so Excel opens UTF-8 correctly
}

export function csvFilename(board) {
  return `Agenda_${board.date}.csv`
}

export function downloadCsv(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
