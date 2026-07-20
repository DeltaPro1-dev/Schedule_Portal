import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { avatarStyle } from '../lib/present.js'
import SectionHeader, { sectionScroll, eyebrow, panel, navyBtn } from './SectionHeader.jsx'

const REGION_OPTS = [['north', 'North'], ['south', 'South'], ['st_george', 'St George'], ['another', 'Another State']]
const KIND_OPTS = [['employee', 'Employee'], ['contractor', 'Contractor'], ['company', 'Company']]
const ACCESS_OPTS = [['none', 'No access'], ['editor', 'Editor'], ['admin', 'Admin']]
const ACCESS_DOT = { none: 'var(--faint)', editor: 'var(--navy)', admin: 'var(--green)' }
const GRID = '1fr 150px 150px 170px 44px'
const sel = { border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 8, padding: '7px 9px', fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--ink-2)', outline: 'none', cursor: 'pointer', width: '100%' }

export default function Roster({ onBack }) {
  const [list, setList] = useState(null)
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [region, setRegion] = useState('north')

  useEffect(() => { api.getRoster().then(setList) }, [])
  const filtered = useMemo(() => (list || []).filter((w) => w.name.toLowerCase().includes(search.toLowerCase())), [list, search])

  async function add() {
    const n = name.trim(); if (!n) return
    const kind = /llc|services|cleaning|inc\b/i.test(n) ? 'company' : 'employee'
    setName('')
    const w = await api.addWorker({ name: n, region, kind })
    setList((l) => [w, ...l])
  }
  const patch = (id, p) => { setList((l) => l.map((w) => (w.id === id ? { ...w, ...p } : w))); api.updateWorker(id, p) }
  const remove = (id) => { setList((l) => l.filter((w) => w.id !== id)); api.removeWorker(id) }

  return (
    <>
      <SectionHeader onBack={onBack} title="Employees" subtitle="Base list · every new board starts with these columns"
        right={<div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', width: 230 }}>
          <span style={{ color: 'var(--faint)' }}>⌕</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" style={{ border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--sans)', fontSize: 13, width: '100%' }} />
        </div>} />
      <div className="section-scroll" style={sectionScroll}>
        {!list ? <div style={{ color: 'var(--faint)' }}>Loading…</div> : (
          <div style={{ maxWidth: 900 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 26, alignItems: 'center', ...panel, padding: '14px 16px' }}>
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Employee or company name…" style={{ flex: 1, border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 9, padding: '10px 12px', fontFamily: 'var(--sans)', fontSize: 13, outline: 'none' }} />
              <select value={region} onChange={(e) => setRegion(e.target.value)} style={{ ...sel, width: 150 }}>{REGION_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <button onClick={add} className="h-navy" style={{ ...navyBtn, whiteSpace: 'nowrap' }}>+ Add</button>
            </div>

            <div style={eyebrow}>Base team · {filtered.length} people</div>
            <div style={panel}>
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14, padding: '12px 20px', borderBottom: '1px solid var(--line)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--faint)' }}>
                <span>Employee</span><span>Region</span><span>Type</span><span>Access</span><span />
              </div>
              {filtered.slice(0, 120).map((w) => (
                <div key={w.id} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14, padding: '9px 20px', borderBottom: '1px solid var(--line-2)', alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 11, minWidth: 0 }}><span style={avatarStyle(w.name)}>{w.initials}</span><span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</span></span>
                  <select value={w.region} onChange={(e) => patch(w.id, { region: e.target.value })} style={sel}>{REGION_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  <select value={w.kind} onChange={(e) => patch(w.id, { kind: e.target.value })} style={sel}>{KIND_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: ACCESS_DOT[w.access], flex: 'none' }} />
                    <select value={w.access} onChange={(e) => patch(w.id, { access: e.target.value })} style={{ ...sel, flex: 1 }}>{ACCESS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  </span>
                  <button onClick={() => remove(w.id)} title="Remove" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
              ))}
              {filtered.length > 120 && <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--faint)' }}>Showing first 120 of {filtered.length} — use search to narrow.</div>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14, lineHeight: 1.5 }}>Access: <strong style={{ color: 'var(--ink-2)' }}>Admin</strong> does everything (incl. deleting). <strong style={{ color: 'var(--ink-2)' }}>Editor</strong> edits but can't delete. <strong style={{ color: 'var(--ink-2)' }}>No access</strong> can only view.</div>
          </div>
        )}
      </div>
    </>
  )
}
