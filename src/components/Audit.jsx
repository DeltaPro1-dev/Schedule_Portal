import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { avatarStyle } from '../lib/present.js'
import SectionHeader, { sectionScroll, panel } from './SectionHeader.jsx'
import { toCsv, downloadText } from '../lib/csv.js'

const VERB = {
  LOGIN: '#2563eb', CREATE: 'var(--green-ink)', UPDATE: 'var(--navy)', MOVE: 'oklch(0.5 0.12 90)',
  COMPLETE: 'var(--green-ink)', EXPORT: 'oklch(0.5 0.1 200)', DELETE: '#dc2626', REPROCESS: 'var(--navy)',
}
const VERBS = ['LOGIN', 'CREATE', 'UPDATE', 'MOVE', 'COMPLETE', 'EXPORT', 'DELETE', 'REPROCESS']
const GRID = '160px 180px 1fr 120px 150px'

export default function Audit({ onBack }) {
  const [rows, setRows] = useState(null)
  const [verb, setVerb] = useState('all')
  const [query, setQuery] = useState('')

  useEffect(() => { api.getAudit().then(setRows) }, [])

  const filtered = useMemo(() => {
    if (!rows) return []
    const q = query.trim().toLowerCase()
    return rows.filter((e) => {
      if (verb !== 'all' && e.verb !== verb) return false
      if (!q) return true
      const diff = e.diff ? `${e.diff.from} ${e.diff.to}` : ''
      return `${e.user} ${e.detail} ${e.scope} ${e.entity || ''} ${diff}`.toLowerCase().includes(q)
    })
  }, [rows, verb, query])

  function exportCsv() {
    const flat = filtered.map((e) => ({
      timestamp: e.ts, user: e.user, verb: e.verb, entity: e.entity || '',
      detail: e.detail, from: e.diff?.from || '', to: e.diff?.to || '',
      scope: e.scope, ip: e.ip, correlation: e.correlation || '',
    }))
    const cols = [
      { key: 'timestamp', label: 'Timestamp' }, { key: 'user', label: 'User' },
      { key: 'verb', label: 'Action' }, { key: 'entity', label: 'Entity' },
      { key: 'detail', label: 'Detail' }, { key: 'from', label: 'From' }, { key: 'to', label: 'To' },
      { key: 'scope', label: 'Scope' }, { key: 'ip', label: 'Source' }, { key: 'correlation', label: 'Correlation' },
    ]
    downloadText('audit-log.csv', toCsv(flat, cols))
  }

  return (
    <>
      <SectionHeader onBack={onBack} title="Audit" subtitle="Immutable record of every action · since day one"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '7px 11px' }}>
              <span aria-hidden="true" style={{ color: 'var(--faint)' }}>⌕</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label="Search audit log"
                style={{ border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink)', width: 150 }} />
            </div>
            <select value={verb} onChange={(e) => setVerb(e.target.value)} aria-label="Filter by action"
              style={{ border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 10, padding: '8px 11px', fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer', outline: 'none' }}>
              <option value="all">All actions</option>
              {VERBS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <button type="button" onClick={exportCsv} className="h-navy"
              style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 14px', fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>↓ CSV</button>
          </div>
        } />
      <div className="section-scroll" style={sectionScroll}>
        {!rows ? <div style={{ color: 'var(--faint)' }}>Loading…</div> : (
          <>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>{filtered.length} of {rows.length} events</div>
            <div style={{ maxWidth: 1180, ...panel }}>
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, padding: '13px 22px', borderBottom: '1px solid var(--line)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--faint)' }}>
                <span>Timestamp</span><span>User</span><span>Action</span><span>Region</span><span>Source</span>
              </div>
              {filtered.length === 0 && <div style={{ padding: '28px 22px', textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>No events match your filters.</div>}
              {filtered.map((e) => (
                <div key={e.id} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, padding: '13px 22px', borderBottom: '1px solid var(--line-2)', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-2)' }}>{e.ts}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink)', minWidth: 0 }}>
                    <span style={{ ...avatarStyle(e.user), width: 24, height: 24, fontSize: 9.5 }}>{e.initials}</span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.user}</span>
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-2)', minWidth: 0 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: '#fff', background: VERB[e.verb] || 'var(--muted)', borderRadius: 5, padding: '2px 7px', marginRight: 8 }}>{e.verb}</span>
                    {e.detail}
                    {e.diff && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                        <Chip>{e.diff.from}</Chip><span style={{ color: 'var(--faint)' }}>→</span><Chip strong>{e.diff.to}</Chip>
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{e.scope}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)' }}>{e.ip}</span>
                    {e.correlation && <span title="Correlation ID" style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.correlation}</span>}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function Chip({ children, strong }) {
  return (
    <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: strong ? 'var(--navy)' : 'var(--muted)', background: strong ? 'var(--navy-soft)' : 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 5, padding: '1px 6px' }}>{children}</span>
  )
}
