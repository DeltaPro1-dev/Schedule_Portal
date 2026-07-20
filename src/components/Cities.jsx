import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import SectionHeader, { sectionScroll, eyebrow, panel, navyBtn } from './SectionHeader.jsx'

// Region options — "Out Of State" maps to the enum value `another`.
const REGION_OPTS = [['north', 'North'], ['south', 'South'], ['st_george', 'St George'], ['another', 'Out Of State']]
const REGION_DOT = { north: '#3F51B5', south: '#2196F3', st_george: '#FF9800', another: '#9E9E9E' }
const GRID = '1fr 200px 44px'
const sel = { border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 8, padding: '7px 9px', fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--ink-2)', outline: 'none', cursor: 'pointer', width: '100%' }

export default function Cities({ onBack }) {
  const [list, setList] = useState(null)
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [region, setRegion] = useState('st_george')
  const [err, setErr] = useState('')

  useEffect(() => { api.getCities().then(setList) }, [])
  const filtered = useMemo(() => (list || []).filter((c) => c.name.toLowerCase().includes(search.toLowerCase())), [list, search])

  async function add() {
    const n = name.trim(); if (!n) return
    setErr('')
    try {
      const c = await api.addCity({ name: n, region })
      setList((l) => [c, ...(l || [])]); setName('')
    } catch (e) { setErr(String(e?.message || e)) }
  }
  const patch = (id, p) => { setList((l) => l.map((c) => (c.id === id ? { ...c, ...p } : c))); api.updateCity(id, p) }
  const remove = (id) => { setList((l) => l.filter((c) => c.id !== id)); api.removeCity(id) }

  return (
    <>
      <SectionHeader onBack={onBack} title="Cities" subtitle="City → region · used to route imported cards (North / South / St George / Out Of State)"
        right={<div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', width: 220 }}>
          <span style={{ color: 'var(--faint)' }}>⌕</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search city…" style={{ border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--sans)', fontSize: 13, width: '100%' }} />
        </div>} />
      <div style={sectionScroll}>
        {!list ? <div style={{ color: 'var(--faint)' }}>Loading…</div> : (
          <div style={{ maxWidth: 720 }}>
            <div style={eyebrow}>New city</div>
            <div style={{ ...panel, padding: '14px 16px', marginBottom: 26 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
                  placeholder="City name…" style={{ flex: 1, border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 9, padding: '10px 12px', fontFamily: 'var(--sans)', fontSize: 13, outline: 'none' }} />
                <select value={region} onChange={(e) => setRegion(e.target.value)} style={{ ...sel, width: 180 }}>
                  {REGION_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button onClick={add} className="h-navy" style={{ ...navyBtn, whiteSpace: 'nowrap' }}>+ Add</button>
              </div>
              {err && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 10 }}>{err}</div>}
            </div>

            <div style={eyebrow}>Cities · {filtered.length}</div>
            <div style={panel}>
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--line)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--faint)' }}>
                <span>City</span><span>Region</span><span />
              </div>
              {filtered.length === 0 && <div style={{ padding: '14px 18px', fontSize: 12.5, color: 'var(--faint)' }}>No cities yet — add them above.</div>}
              {filtered.map((c) => (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '9px 18px', borderBottom: '1px solid var(--line-2)', alignItems: 'center' }}>
                  <input value={c.name} onChange={(e) => setList((ls) => ls.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))}
                    onBlur={(e) => patch(c.id, { name: e.target.value.trim() || c.name })}
                    style={{ border: '1px solid transparent', background: 'none', borderRadius: 7, padding: '7px 8px', fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--ink)', outline: 'none' }} className="h-line2" />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: REGION_DOT[c.region] || 'var(--faint)', flex: 'none' }} />
                    <select value={c.region} onChange={(e) => patch(c.id, { region: e.target.value })} style={{ ...sel, flex: 1 }}>
                      {REGION_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </span>
                  <button onClick={() => remove(c.id)} title="Delete" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14, lineHeight: 1.5 }}>
              When importing a client agenda, each row's city decides which staging column (North / South / St George / Out Of State) the card lands in. Cities not listed here fall back to manual assignment.
            </div>
          </div>
        )}
      </div>
    </>
  )
}
