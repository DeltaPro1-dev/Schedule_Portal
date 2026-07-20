// Schedule_Portal — async export worker (G2)
//
// Processes queued rows in schedule_portal.exports: builds the file, uploads it to
// the private `schedule-exports` bucket, and marks the row done. Runs with the
// service-role key (bypasses RLS). Intended to be invoked on a schedule
// (pg_cron / Supabase scheduled function) or on demand.
//
// STATUS: ready to deploy — NOT yet deployed to the shared Supabase project (no
// access from the build environment). Deploy steps are in DEPLOY.md.
//
// Supported now: csv, json. xlsx/pdf need a generator library and are marked
// 'failed' with a note until that's added (tracked in DECISIONS.md / PLANO_MESTRE).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = 'schedule-exports'
const BATCH = 10

const db = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: 'schedule_portal' } })
const storage = createClient(SUPABASE_URL, SERVICE_KEY)

const SCHEDULE_COLUMNS = [
  ['worker', 'Worker'], ['status', 'Status'], ['client', 'Client'], ['building', 'Building'],
  ['service_type', 'Service'], ['scheduled_time', 'Scheduled'], ['done', 'Done'],
] as const

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function boardRows(boardId: string) {
  const [{ data: lists }, { data: cards }] = await Promise.all([
    db.from('lists').select('id,name').eq('board_id', boardId),
    db.from('cards').select('*, client:clients(name)').eq('board_id', boardId).is('deleted_at', null).order('position'),
  ])
  const listName = Object.fromEntries((lists ?? []).map((l) => [l.id, l.name]))
  return (cards ?? []).map((c) => ({
    worker: listName[c.list_id] ?? '',
    status: c.status ?? '',
    client: c.client?.name ?? c.client_text ?? '',
    building: c.building ?? '',
    service_type: c.service_type ?? '',
    scheduled_time: c.scheduled_time ?? '',
    done: c.done ? 'Yes' : 'No',
  }))
}

async function build(job: Record<string, unknown>): Promise<{ body: string; mime: string; ext: string; rows: number }> {
  const params = (job.params_json ?? {}) as Record<string, unknown>
  // resolve the target board(s): explicit board_id, else the org's newest board
  let boardIds: string[] = []
  if (params.board_id) boardIds = [params.board_id as string]
  else {
    const { data } = await db.from('boards').select('id').eq('organization_id', job.organization_id).order('date', { ascending: false }).limit(params.month ? 12 : 1)
    boardIds = (data ?? []).map((b) => b.id)
  }
  const perBoard = await Promise.all(boardIds.map(boardRows))
  const rows = perBoard.flat()

  if (job.format === 'json') {
    return { body: JSON.stringify({ report: job.report_type, boards: boardIds.length, rows }, null, 2), mime: 'application/json', ext: 'json', rows: rows.length }
  }
  // csv
  const header = SCHEDULE_COLUMNS.map(([, l]) => csvCell(l)).join(',')
  const body = rows.map((r) => SCHEDULE_COLUMNS.map(([k]) => csvCell((r as Record<string, unknown>)[k])).join(',')).join('\n')
  return { body: `${header}\n${body}`, mime: 'text/csv', ext: 'csv', rows: rows.length }
}

async function processOne(job: Record<string, unknown>) {
  await db.from('exports').update({ status: 'processing' }).eq('id', job.id)
  if (job.format === 'xlsx' || job.format === 'pdf') {
    await db.from('exports').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', job.id)
    return { id: job.id, status: 'failed', reason: `${job.format} not supported yet` }
  }
  const { body, mime, ext, rows } = await build(job)
  const key = `${job.organization_id}/${job.id}.${ext}`
  const up = await storage.storage.from(BUCKET).upload(key, new Blob([body], { type: mime }), { contentType: mime, upsert: true })
  if (up.error) {
    await db.from('exports').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', job.id)
    return { id: job.id, status: 'failed', reason: up.error.message }
  }
  await db.from('exports').update({ status: 'done', file_key: key, row_count: rows, finished_at: new Date().toISOString() }).eq('id', job.id)
  return { id: job.id, status: 'done', rows }
}

Deno.serve(async () => {
  const { data: jobs, error } = await db.from('exports').select('*').eq('status', 'queued').order('created_at').limit(BATCH)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'content-type': 'application/json' } })
  const results = []
  for (const job of jobs ?? []) {
    try { results.push(await processOne(job)) }
    catch (e) {
      await db.from('exports').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', job.id)
      results.push({ id: job.id, status: 'failed', reason: String(e) })
    }
  }
  return new Response(JSON.stringify({ processed: results.length, results }), { headers: { 'content-type': 'application/json' } })
})
