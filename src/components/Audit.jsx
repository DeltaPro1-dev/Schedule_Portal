import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { avatarStyle } from '../lib/present.js'
import SectionHeader, { sectionScroll, panel } from './SectionHeader.jsx'

const VERB = {
  LOGIN: '#2563eb', CREATE: 'var(--green-ink)', UPDATE: 'var(--navy)', MOVE: 'oklch(0.5 0.12 90)',
  COMPLETE: 'var(--green-ink)', EXPORT: 'oklch(0.5 0.1 200)', DELETE: '#dc2626', REPROCESS: 'var(--navy)',
}
const GRID = '170px 190px 1fr 150px 130px'

export default function Audit({ onBack }) {
  const [rows, setRows] = useState(null)
  useEffect(() => { api.getAudit().then(setRows) }, [])

  return (
    <>
      <SectionHeader onBack={onBack} title="Audit" subtitle="Immutable record of every action · since day one"
        right={<div style={{ display: 'flex', gap: 7 }}>{['User', 'Action', 'Period'].map((c) => <span key={c} style={{ fontSize: 12, color: 'var(--ink-2)', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 20, padding: '5px 13px', cursor: 'pointer' }}>{c}</span>)}</div>} />
      <div style={sectionScroll}>
        {!rows ? <div style={{ color: 'var(--faint)' }}>Loading…</div> : (
          <div style={{ maxWidth: 1120, ...panel }}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, padding: '13px 22px', borderBottom: '1px solid var(--line)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--faint)' }}>
              <span>Timestamp</span><span>User</span><span>Action</span><span>Board / Region</span><span>Source</span>
            </div>
            {rows.map((e) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, padding: '13px 22px', borderBottom: '1px solid var(--line-2)', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-2)' }}>{e.ts}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink)', minWidth: 0 }}><span style={{ ...avatarStyle(e.user), width: 24, height: 24, fontSize: 9.5 }}>{e.initials}</span><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.user}</span></span>
                <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: '#fff', background: VERB[e.verb], borderRadius: 5, padding: '2px 7px', marginRight: 8 }}>{e.verb}</span>{e.detail}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{e.scope}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)' }}>{e.ip}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
