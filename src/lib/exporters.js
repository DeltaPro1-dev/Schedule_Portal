// Client-side export engine — the "small/medium export" path (§13). Generates
// real CSV/JSON from live data and downloads it immediately, then records an
// `exports` row (audit trail). Large / scheduled / XLSX / PDF exports go through
// the async export worker (supabase/functions/export-worker) once deployed.

import { toCsv, downloadText } from './csv.js'

const SCHEDULE_COLUMNS = [
  { key: 'worker', label: 'Worker' },
  { key: 'status', label: 'Status' },
  { key: 'client', label: 'Client' },
  { key: 'building', label: 'Building' },
  { key: 'service_type', label: 'Service' },
  { key: 'scheduled_time', label: 'Scheduled' },
  { key: 'done', label: 'Done' },
]

const MAX_BACKUP_BOARDS = 12

function boardRows(detail) {
  const listName = Object.fromEntries(detail.lists.map((l) => [l.id, l.name]))
  return detail.cards.map((c) => ({
    worker: listName[c.list_id] || '',
    status: c.status || '',
    client: c.client?.name || c.client_text || '',
    building: c.building || '',
    service_type: c.service_type || '',
    scheduled_time: c.scheduled_time || '',
    done: c.done ? 'Yes' : 'No',
  }))
}

const safe = (s) => String(s || 'export').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')

// Daily schedule (newest board) → CSV. Returns a job descriptor for logging.
export async function exportDailyScheduleCsv(api) {
  const boards = await api.getBoards()
  if (!boards.length) throw new Error('No boards to export.')
  const board = boards[0]
  const detail = await api.getBoardDetail(board.id)
  const rows = boardRows(detail)
  downloadText(`daily-schedule-${safe(board.title)}.csv`, toCsv(rows, SCHEDULE_COLUMNS))
  return { report_type: `Daily schedule — ${board.title}`, format: 'csv', row_count: rows.length, params_json: { board_id: board.id } }
}

// Full backup (current month, capped) → JSON. Returns a job descriptor.
export async function exportFullBackupJson(api) {
  const boards = await api.getBoards()
  const month = boards[0]?.month
  const scope = boards.filter((b) => b.month === month).slice(0, MAX_BACKUP_BOARDS)
  const details = await Promise.all(scope.map((b) => api.getBoardDetail(b.id).catch(() => null)))
  const payload = {
    generated_scope: `${month || 'current month'} · ${scope.length} boards (capped at ${MAX_BACKUP_BOARDS})`,
    boards: details.filter(Boolean).map((d) => ({
      board: { id: d.board.id, title: d.board.title, date: d.board.date, status: d.board.status },
      lists: d.lists.map((l) => ({ id: l.id, name: l.name, is_pool: l.is_pool })),
      cards: boardRows(d),
    })),
  }
  const rowCount = payload.boards.reduce((n, b) => n + b.cards.length, 0)
  downloadText(`full-backup-${safe(month)}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8')
  return { report_type: `Full backup — ${month || 'current'}`, format: 'json', row_count: rowCount, params_json: { month, boards: scope.length } }
}
