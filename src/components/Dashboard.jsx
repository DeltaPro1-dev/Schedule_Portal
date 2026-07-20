import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import SectionHeader, { sectionScroll, eyebrow, panel } from './SectionHeader.jsx'
import { STATUS_META, STATUSES } from '../lib/stateMachine.js'
import { REGION_LABEL } from '../lib/present.js'

// Operational dashboard (§9.7). Aggregates the current month's boards from the
// existing api (getBoards + getBoardDetail + getIntegration) — no new endpoint,
// so it works in mock and real mode. Scope is capped to keep it cheap in real
// mode; the scope is shown in the header. Hours prev×real is not yet a tracked
// field on cards (roadmap G5) and is intentionally not fabricated here.

const MAX_BOARDS = 12
const REGION_KEYS = { north: 'north', south: 'south', st_george: 'st_george', another: 'another' }

export default function Dashboard({ onBack }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const boards = await api.getBoards()
        const month = boards[0]?.month
        const scope = boards.filter((b) => b.month === month).slice(0, MAX_BOARDS)
        const details = await Promise.all(scope.map((b) => api.getBoardDetail(b.id).catch(() => null)))
        const cards = details.filter(Boolean).flatMap((d) => d.cards)
        let integ = null
        try { integ = await api.getIntegration() } catch { integ = null }
        if (alive) setData(agg(boards, month, scope, cards, integ))
      } catch (e) { if (alive) setErr(e.message || 'Failed to load') }
    })()
    return () => { alive = false }
  }, [])

  return (
    <>
      <SectionHeader onBack={onBack} title="Dashboard" subtitle={data ? `${data.monthLabel} · ${data.boardsInScope} boards in scope` : 'Operational overview'} />
      <div className="section-scroll" style={sectionScroll}>
        {err ? <div style={{ color: '#dc2626' }}>{err}</div>
          : !data ? <div style={{ color: 'var(--faint)' }}>Loading…</div>
          : <Body data={data} />}
      </div>
    </>
  )
}

function Body({ data }) {
  return (
    <div style={{ maxWidth: 1100 }}>
      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 34 }}>
        <Kpi label="Jobs" value={data.total} hint="in scope" />
        <Kpi label="Completed" value={data.completed} hint={`${data.completionPct}% of jobs`} color="var(--green-ink)" />
        <Kpi label="In progress" value={data.byStatus.in_progress || 0} color="#f59e0b" />
        <Kpi label="Rework" value={data.byStatus.rework || 0} color="#ef4444" />
        <Kpi label="Ready to invoice" value={data.byStatus.completed || 0} hint="completed, not invoiced" />
        <Kpi label="Integration errors" value={data.integrationErrors} hint="DLQ + retrying" color={data.integrationErrors ? '#dc2626' : 'var(--muted)'} />
      </div>

      {/* status breakdown */}
      <div style={eyebrow}>Jobs by status</div>
      <div style={{ ...panel, padding: '18px 20px', marginBottom: 30 }}>
        {data.total === 0 ? <Empty text="No jobs in scope yet." /> : (
          <>
            <div style={{ display: 'flex', height: 14, borderRadius: 20, overflow: 'hidden', marginBottom: 16 }}>
              {STATUSES.filter((s) => data.byStatus[s]).map((s) => (
                <div key={s} title={`${STATUS_META[s]?.label}: ${data.byStatus[s]}`}
                  style={{ width: `${(data.byStatus[s] / data.total) * 100}%`, background: STATUS_META[s]?.color || 'var(--muted)' }} />
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
              {STATUSES.filter((s) => data.byStatus[s]).map((s) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--ink-2)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS_META[s]?.color }} />
                  {STATUS_META[s]?.label || s}
                  <strong style={{ color: 'var(--ink)' }}>{data.byStatus[s]}</strong>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {/* by region */}
        <div>
          <div style={eyebrow}>Jobs by region</div>
          <div style={{ ...panel, padding: '8px 4px' }}>
            {data.byRegion.length === 0 ? <Empty text="No region data." /> :
              data.byRegion.map(([region, n]) => (
                <BarRow key={region} label={REGION_LABEL[region] || region} value={n} max={data.regionMax} color="var(--navy)" />
              ))}
          </div>
        </div>
        {/* top clients */}
        <div>
          <div style={eyebrow}>Top clients</div>
          <div style={{ ...panel, padding: '8px 4px' }}>
            {data.topClients.length === 0 ? <Empty text="No client data." /> :
              data.topClients.map(([client, n]) => (
                <BarRow key={client} label={client} value={n} max={data.clientMax} color="var(--green-ink)" />
              ))}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 24 }}>
        Scope: most recent {MAX_BOARDS} boards of the current month. Hours planned vs. actual is
        not yet tracked on cards (planned for roadmap G5) and is intentionally omitted.
      </p>
    </div>
  )
}

function agg(boards, month, scope, cards, integ) {
  const byStatus = {}
  for (const c of cards) byStatus[c.status || 'unscheduled'] = (byStatus[c.status || 'unscheduled'] || 0) + 1
  const total = cards.length
  const completed = cards.filter((c) => c.done || c.status === 'completed' || c.status === 'invoiced' || c.status === 'paid').length

  // region: from the card's region label (kind === 'region'), best-effort
  const regionCount = {}
  for (const c of cards) {
    const keys = c.labelKeys || (c.labels || []).map((l) => l.key)
    for (const k of keys) if (REGION_KEYS[k]) regionCount[k] = (regionCount[k] || 0) + 1
  }
  const byRegion = Object.entries(regionCount).sort((a, b) => b[1] - a[1])
  const regionMax = Math.max(1, ...byRegion.map(([, n]) => n))

  const clientCount = {}
  for (const c of cards) {
    const name = c.client?.name || c.client_text
    if (name) clientCount[name] = (clientCount[name] || 0) + 1
  }
  const topClients = Object.entries(clientCount).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const clientMax = Math.max(1, ...topClients.map(([, n]) => n))

  const integrationErrors = (integ?.rows || []).filter((r) => r.status === 'dlq' || r.status === 'retrying').length

  const monthLabel = month
    ? new Date(month + '-01T00:00:00').toLocaleDateString('en', { month: 'long', year: 'numeric' })
    : 'Current month'

  return {
    monthLabel, boardsInScope: scope.length,
    total, completed, completionPct: total ? Math.round((completed / total) * 100) : 0,
    byStatus, byRegion, regionMax, topClients, clientMax, integrationErrors,
  }
}

function Kpi({ label, value, hint, color }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13, padding: '16px 18px' }}>
      <div style={{ fontFamily: 'var(--disp)', fontSize: 30, fontWeight: 600, lineHeight: 1, color: color || 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginTop: 8 }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

function BarRow({ label, value, max, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px' }}>
      <span style={{ fontSize: 12.5, color: 'var(--ink-2)', width: 130, flex: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={label}>{label}</span>
      <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 20, overflow: 'hidden' }}>
        <div style={{ width: `${(value / max) * 100}%`, height: '100%', background: color, borderRadius: 20 }} />
      </div>
      <strong style={{ fontSize: 12.5, color: 'var(--ink)', width: 30, textAlign: 'right', flex: 'none' }}>{value}</strong>
    </div>
  )
}

function Empty({ text }) {
  return <div style={{ fontSize: 12.5, color: 'var(--faint)', padding: '18px 14px', textAlign: 'center' }}>{text}</div>
}
