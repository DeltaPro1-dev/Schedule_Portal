import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import SectionHeader, { sectionScroll, eyebrow, panel, navyBtn } from './SectionHeader.jsx'

const KIND_OPTS = [['type', 'Type'], ['region', 'Region'], ['schedule', 'Schedule']]
const PALETTE = ['#4CAF50', '#607D8B', '#8BC34A', '#FF9800', '#795548', '#2196F3', '#9C27B0', '#3F51B5', '#9E9E9E', '#00BCD4', '#03A9F4', '#F44336', '#009688', '#673AB7', '#E91E63']
const GRID = '40px 1fr 150px 44px'
const sel = { border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 8, padding: '7px 9px', fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--ink-2)', outline: 'none', cursor: 'pointer', width: '100%' }

export default function Labels({ onBack }) {
  const [list, setList] = useState(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState('type')
  const [color, setColor] = useState(PALETTE[0])
  const [err, setErr] = useState('')

  useEffect(() => { api.getLabels().then(setList) }, [])

  async function add() {
    const n = name.trim(); if (!n) return
    setErr('')
    try {
      const lb = await api.addLabel({ name: n, kind, color })
      setList((l) => [lb, ...(l || [])]); setName('')
    } catch (e) { setErr(String(e?.message || e)) }
  }
  const patch = (id, p) => { setList((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x))); api.updateLabel(id, p) }
  const remove = (id) => { setList((l) => l.filter((x) => x.id !== id)); api.removeLabel(id) }

  return (
    <>
      <SectionHeader onBack={onBack} title="Labels" subtitle="Card tags · region / type / schedule" />
      <div style={sectionScroll}>
        {!list ? <div style={{ color: 'var(--faint)' }}>Loading…</div> : (
          <div style={{ maxWidth: 720 }}>
            {/* create */}
            <div style={eyebrow}>New label</div>
            <div style={{ ...panel, padding: '14px 16px', marginBottom: 26 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
                  placeholder="Label name…" style={{ flex: 1, border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 9, padding: '10px 12px', fontFamily: 'var(--sans)', fontSize: 13, outline: 'none' }} />
                <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ ...sel, width: 140 }}>
                  {KIND_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button onClick={add} className="h-navy" style={{ ...navyBtn, whiteSpace: 'nowrap' }}>+ Add</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--faint)', marginRight: 2 }}>Color</span>
                {PALETTE.map((c) => (
                  <button key={c} onClick={() => setColor(c)} title={c}
                    style={{ width: 22, height: 22, borderRadius: 6, background: c, border: color === c ? '2px solid var(--ink)' : '1px solid var(--line)', cursor: 'pointer' }} />
                ))}
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                  title="Custom color" style={{ width: 26, height: 26, padding: 0, border: '1px solid var(--line)', borderRadius: 6, background: 'none', cursor: 'pointer' }} />
              </div>
              {err && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 10 }}>{err}</div>}
            </div>

            {/* list */}
            <div style={eyebrow}>All labels · {list.length}</div>
            <div style={panel}>
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--line)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--faint)' }}>
                <span>Color</span><span>Name</span><span>Kind</span><span />
              </div>
              {list.length === 0 && <div style={{ padding: '14px 18px', fontSize: 12.5, color: 'var(--faint)' }}>No labels yet.</div>}
              {list.map((l) => (
                <div key={l.id} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '9px 18px', borderBottom: '1px solid var(--line-2)', alignItems: 'center' }}>
                  <input type="color" value={l.color || '#999999'} onChange={(e) => patch(l.id, { color: e.target.value })}
                    title="Change color" style={{ width: 26, height: 26, padding: 0, border: '1px solid var(--line)', borderRadius: 6, background: 'none', cursor: 'pointer' }} />
                  <input value={l.name} onChange={(e) => setList((ls) => ls.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)))}
                    onBlur={(e) => patch(l.id, { name: e.target.value.trim() || l.name })}
                    style={{ border: '1px solid transparent', background: 'none', borderRadius: 7, padding: '7px 8px', fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--ink)', outline: 'none' }} className="h-line2" />
                  <select value={l.kind} onChange={(e) => patch(l.id, { kind: e.target.value })} style={sel}>
                    {KIND_OPTS.map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
                  </select>
                  <button onClick={() => remove(l.id)} title="Delete" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14, lineHeight: 1.5 }}>
              Labels appear as color chips on cards. <strong style={{ color: 'var(--ink-2)' }}>Region</strong> tags map to North/South/St George/Another; <strong style={{ color: 'var(--ink-2)' }}>Type</strong> to the service kind; <strong style={{ color: 'var(--ink-2)' }}>Schedule</strong> for timing. Deleting a label removes it from all cards.
            </div>
          </div>
        )}
      </div>
    </>
  )
}
