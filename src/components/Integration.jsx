import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { sectionScroll, eyebrow, panel } from './SectionHeader.jsx'
import SectionHeader from './SectionHeader.jsx'

const STATUS = {
  synced: { label: 'Synced', color: 'var(--green-ink)', bg: 'var(--green-soft)', dot: 'var(--green)' },
  retrying: { label: 'Retrying', color: '#2563eb', bg: '#eff4ff', dot: '#2563eb' },
  dlq: { label: 'DLQ · failed', color: '#dc2626', bg: '#fef2f2', dot: '#dc2626' },
  queued: { label: 'Queued', color: 'oklch(0.5 0.12 90)', bg: 'oklch(0.96 0.05 90)', dot: 'oklch(0.6 0.13 90)' },
}
const GRID = '1.4fr 170px 130px 1.1fr 120px'

export default function Integration({ onBack }) {
  const [data, setData] = useState(null)
  useEffect(() => { api.getIntegration().then(setData) }, [])

  return (
    <>
      <SectionHeader onBack={onBack} title="Integration Monitor · Field Control" subtitle="Queue with retries, DLQ and idempotency · manual reprocessing"
        right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--green-ink)', background: 'var(--green-soft)', borderRadius: 20, padding: '6px 13px', fontWeight: 500 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />Integration service active</span>} />
      <div style={sectionScroll}>
        {!data ? <Loading /> : (
          <div style={{ maxWidth: 1120 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 30 }}>
              {data.stats.map((s) => (
                <div key={s.label} style={{ ...panel, padding: '18px 20px' }}>
                  <div style={{ fontFamily: 'var(--disp)', fontSize: 30, fontWeight: 600, color: s.color, lineHeight: 1 }}>{s.v}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={eyebrow}>Sync events</div>
            <div style={panel}>
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, padding: '13px 22px', borderBottom: '1px solid var(--line)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--faint)' }}>
                <span>Event</span><span>Direction</span><span>Status</span><span>Error / reason</span><span />
              </div>
              {data.rows.map((e, i) => {
                const st = STATUS[e.status]
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, padding: '15px 22px', borderBottom: '1px solid var(--line-2)', alignItems: 'center' }}>
                    <div><div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{e.entity}</div><div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)', marginTop: 2 }}>{e.key} · {e.attempts} · {e.when}</div></div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-2)' }}>{e.direction}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: st.color, background: st.bg, borderRadius: 20, padding: '4px 10px', width: 'fit-content' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: st.dot }} />{st.label}</span>
                    <span style={{ fontSize: 12, color: e.err ? '#b91c1c' : 'var(--faint)', lineHeight: 1.35 }}>{e.err || '—'}</span>
                    <span>{(e.status === 'retrying' || e.status === 'dlq') && <button className="h-navy" style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 13px', fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Reprocess</button>}</span>
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16, lineHeight: 1.5 }}>The portal works without the integration: failures stay isolated in the queue/DLQ and can be reprocessed manually, without blocking board operations.</div>
          </div>
        )}
      </div>
    </>
  )
}
function Loading() { return <div style={{ color: 'var(--faint)' }}>Loading…</div> }
