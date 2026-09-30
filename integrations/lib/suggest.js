// Jev (TypeSafe) suggestions for client tasks without a rule — "suggestion only" mode (owner,
// 2026-09-29). After a portal run: every (portal name, client task) pair that has neither a task rule
// nor a suggestion yet is asked once; the answer (one of our Field Control services + confidence) goes
// to schedule_portal.task_suggestions and, as a note, to the cards of that task. The card's service is
// not changed and nothing becomes a rule: a person creates the rule in Dictionary → Client tasks.
import { supabase, getOrgId } from './supabase.js'

export const normKey = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase() || null
const pairKey = (portal, task) => `${normKey(portal)}|${normKey(task)}`

async function all(query) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if ((data?.length ?? 0) < 1000) return rows
  }
}

// Distinct (portal name, client task) pairs of the imports, most frequent first.
export function candidatePairs(imports, known) {
  const pairs = new Map()
  for (const row of imports) {
    const portal = String(row.builder || row.community || '').trim()
    const task = String(row.client_task || row.activity || '').trim()
    if (!portal || !task) continue
    const key = pairKey(portal, task)
    if (known.has(key)) continue
    const pair = pairs.get(key) || { portal, task, source: row.source, count: 0 }
    pair.count += 1
    pairs.set(key, pair)
  }
  return [...pairs.values()].sort((a, b) => b.count - a.count)
}

// The note on the card: "JEV: Final Clean (92%)".
export const cardNote = (service, confidence) => `JEV: ${service}${confidence != null ? ` (${Math.round(confidence * 100)}%)` : ''}`

async function askJev(client, services, pair) {
  const { choice } = await import('@typesafe-ai/sdk')
  const options = Object.fromEntries(services.map((s) => [`s${s.field_control_id}`, `${s.description}${s.department ? ` — ${s.department}` : ''}`]))
  const call = client.systemOne({
    state: {
      company: 'Delta Pro Clean — construction, model home, window, power washing, carpet and janitorial cleaning in Utah',
      customer: pair.portal,
      portal: pair.source,
      customer_task_name: pair.task,
    },
    questions: {
      service: choice('Which Delta Pro Clean service does this customer task correspond to? Residential new-home builders use the Residential services unless the task says model home (MH), spec home (SPEC), parade home (PH) or commercial (CML).', options),
    },
  })
  const answer = await Promise.race([call, new Promise((resolve) => setTimeout(() => resolve(null), 8000))])
  if (!answer) return null
  const pick = answer.answers.service
  const id = Number(String(pick.choice).slice(1))
  return Number.isFinite(id) ? { service_type_id: id, confidence: typeof pick.confidence === 'number' ? pick.confidence : null } : null
}

export async function suggestServices({ max = 150, log = console.log } = {}) {
  if (!process.env.TYPESAFE_API_KEY) return { asked: 0, skipped: 'TYPESAFE_API_KEY not set' }
  const org = await getOrgId()
  const [services, imports, existing] = await Promise.all([
    all(() => supabase.from('service_types').select('field_control_id,description,department').eq('organization_id', org).eq('active', true).order('field_control_id')),
    all(() => supabase.from('imported_schedules').select('builder,community,client_task,activity,source').eq('organization_id', org).order('id')),
    all(() => supabase.from('task_suggestions').select('portal_name,client_task').eq('organization_id', org).order('id')),
  ])
  const known = new Set(existing.map((s) => pairKey(s.portal_name, s.client_task)))
  const byId = new Map(services.map((s) => [Number(s.field_control_id), s.description]))
  const { TypeSafeClient } = await import('@typesafe-ai/sdk')
  const client = new TypeSafeClient()
  let asked = 0, saved = 0, withRule = 0
  for (const pair of candidatePairs(imports, known).slice(0, max)) {
    const { data: clientId } = await supabase.rpc('resolve_client', { p_org: org, p_name: pair.portal })
    const { data: rule } = await supabase.rpc('task_rule_service', { p_org: org, p_client: clientId ?? null, p_task: pair.task })
    if (rule) { withRule += 1; continue }
    asked += 1
    let answer = null
    try { answer = await askJev(client, services, pair) } catch (e) { log(`[jev] ${pair.task}: ${e.message}`) }
    if (!answer || !byId.has(answer.service_type_id)) continue
    const { error } = await supabase.from('task_suggestions').insert({ organization_id: org, portal_name: pair.portal, client_task: pair.task, service_type_id: answer.service_type_id, confidence: answer.confidence })
    if (error && !/duplicate key/i.test(error.message)) throw error
    saved += 1
  }
  const noted = await noteCards(org, byId)
  log(`[jev] asked ${asked} new client task(s), saved ${saved} suggestion(s), ${withRule} already had a rule; noted ${noted} card(s)`)
  return { asked, saved, withRule, noted }
}

// Only confident suggestions go on the card note (a live test on 15 real tasks: 78–99% were right, the
// low ones were the coded Lennar names); the Dictionary shows every suggestion with its confidence.
export const CARD_NOTE_MIN_CONFIDENCE = 0.7

// Adds the suggestion to the note of imported cards of that task that have no rule yet (once per card).
async function noteCards(org, byId) {
  const suggestions = await all(() => supabase.from('task_suggestions').select('portal_name,client_task,service_type_id,confidence').eq('organization_id', org).order('id'))
  if (!suggestions.length) return 0
  const bySuggestion = new Map(suggestions.map((s) => [pairKey(s.portal_name, s.client_task), s]))
  const imports = await all(() => supabase.from('imported_schedules').select('builder,community,client_task,activity,mapped_card_id').eq('organization_id', org).not('mapped_card_id', 'is', null).order('id'))
  let noted = 0
  for (const row of imports) {
    const suggestion = bySuggestion.get(pairKey(row.builder || row.community, row.client_task || row.activity))
    if (!suggestion || suggestion.confidence == null || Number(suggestion.confidence) < CARD_NOTE_MIN_CONFIDENCE) continue
    const { data: card } = await supabase.from('cards').select('id,ps_note,client_id,client_task').eq('id', row.mapped_card_id).maybeSingle()
    if (!card || /JEV:/.test(card.ps_note || '')) continue
    const { data: rule } = await supabase.rpc('task_rule_service', { p_org: org, p_client: card.client_id ?? null, p_task: card.client_task || row.client_task || row.activity })
    if (rule) continue
    const note = cardNote(byId.get(Number(suggestion.service_type_id)) || `#${suggestion.service_type_id}`, suggestion.confidence == null ? null : Number(suggestion.confidence))
    const { error } = await supabase.from('cards').update({ ps_note: card.ps_note ? `${card.ps_note} · ${note}` : note }).eq('id', card.id)
    if (error) throw error
    noted += 1
  }
  return noted
}
