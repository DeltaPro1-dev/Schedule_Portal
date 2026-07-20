import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { initials, avatarStyle } from '../lib/present.js'
import SectionHeader, { sectionScroll, eyebrow, panel, navyBtn } from './SectionHeader.jsx'

// Customers (§20 screen 13) + Locations (§20 screen 14) as a sub-view.
// Customers = real CRUD on the `clients` table (RLS from 0002 — no migration).
// Locations = an honest derived view (grouped client addresses): the
// CustomerLocation entity is still future work (needs a contract decision).

const GRID = '1.3fr 1.6fr 130px 1fr 90px'

export default function Customers({ onBack, canEdit }) {
  const [tab, setTab] = useState('customers')
  const [rows, setRows] = useState(null)
  const [search, setSearch] = useState('')
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', address: '', fin_contact: '' })
  const [edit, setEdit] = useState(null)   // { id, key, value }

  async function load() {
    try { setRows(await api.getClients()) } catch (e) { setErr(String(e.message || e)); setRows([]) }
  }
  useEffect(() => { load() }, [])

  async function run(fn) {
    setErr('')
    try { await fn(); await load() } catch (e) { setErr(String(e.message || e)) }
  }
  async function submitAdd() {
    const name = draft.name.trim()
    if (!name) return
    setAdding(false); setDraft({ name: '', address: '', fin_contact: '' })
    await run(() => api.addClient({ name, address: draft.address.trim(), fin_contact: draft.fin_contact.trim() }))
  }
  async function commitEdit() {
    if (!edit) return
    const { id, key, value } = edit
    setEdit(null)
    await run(() => api.updateClient(id, { [key]: value.trim() || null }))
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows || []
    return (rows || []).filter((c) => `${c.name} ${c.address || ''} ${c.fin_contact || ''}`.toLowerCase().includes(q))
  }, [rows, search])

  const locations = useMemo(() => {
    const by = {}
    for (const c of rows || []) {
      const addr = c.address || 'No address on file'
      ;(by[addr] ||= []).push(c.name)
    }
    return Object.entries(by).map(([address, clients]) => ({ address, clients })).sort((a, b) => b.clients.length - a.clients.length)
  }, [rows])

  return (
    <>
      <SectionHeader onBack={onBack} title="Customers" subtitle="Clients served · locations derived from their addresses"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {tab === 'customers' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', width: 200 }}>
                <span aria-hidden="true" style={{ color: 'var(--faint)' }}>⌕</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer…" aria-label="Search customer"
                  style={{ border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink)', width: '100%' }} />
              </div>
            )}
            <div role="group" aria-label="Customers or locations" style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 3 }}>
              {[['customers', 'Customers'], ['locations', 'Locations']].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}
                  style={{ border: 'none', borderRadius: 8, padding: '6px 13px', fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: tab === k ? 'var(--surface)' : 'transparent', color: tab === k ? 'var(--navy)' : 'var(--muted)', boxShadow: tab === k ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}>{l}</button>
              ))}
            </div>
            {tab === 'customers' && canEdit && (
              <button onClick={() => setAdding(true)} className="h-navy" style={navyBtn}><span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Customer</button>
            )}
          </div>
        } />
      <div className="section-scroll" style={sectionScroll}>
        {err && <div style={{ fontSize: 12.5, color: '#dc2626', marginBottom: 12 }}>{err}</div>}
        {!rows ? <div style={{ color: 'var(--faint)' }}>Loading…</div> : tab === 'customers' ? (
          <div style={{ maxWidth: 1100 }}>
            <div style={eyebrow}>Customers ({filteredRows.length}{filteredRows.length !== rows.length ? ` of ${rows.length}` : ''})</div>
            <div style={panel}>
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, padding: '13px 20px', borderBottom: '1px solid var(--line)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--faint)' }}>
                <span>Customer</span><span>Address</span><span>Finance</span><span>Notes</span><span />
              </div>
              {adding && (
                <div style={{ display: 'flex', gap: 8, padding: '13px 20px', borderBottom: '1px solid var(--line-2)', flexWrap: 'wrap' }}>
                  <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Customer name *" aria-label="Customer name"
                    onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') setAdding(false) }} style={addInput} />
                  <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Address" aria-label="Address"
                    onKeyDown={(e) => { if (e.key === 'Enter') submitAdd() }} style={{ ...addInput, flex: 2 }} />
                  <input value={draft.fin_contact} onChange={(e) => setDraft({ ...draft, fin_contact: e.target.value })} placeholder="Finance contact" aria-label="Finance contact"
                    onKeyDown={(e) => { if (e.key === 'Enter') submitAdd() }} style={addInput} />
                  <button onClick={submitAdd} style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                  <button onClick={() => setAdding(false)} style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 11px', fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
                </div>
              )}
              {rows.length === 0 && !adding && <div style={{ padding: '30px 20px', textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>No customers yet{canEdit ? ' — add the first one.' : '.'}</div>}
              {rows.length > 0 && filteredRows.length === 0 && <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>No customers match “{search}”.</div>}
              {filteredRows.map((c) => (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, padding: '13px 20px', borderBottom: '1px solid var(--line-2)', alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span aria-hidden="true" style={{ ...avatarStyle(c.name), width: 26, height: 26, fontSize: 10 }}>{initials(c.name)}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                  </span>
                  <Cell c={c} k="address" edit={edit} setEdit={setEdit} commit={commitEdit} canEdit={canEdit} />
                  <Cell c={c} k="fin_contact" edit={edit} setEdit={setEdit} commit={commitEdit} canEdit={canEdit} mono />
                  <Cell c={c} k="notes" edit={edit} setEdit={setEdit} commit={commitEdit} canEdit={canEdit} />
                  <span style={{ textAlign: 'right' }}>
                    {canEdit && (
                      <button type="button" onClick={() => run(() => api.removeClient(c.id))} aria-label={`Archive ${c.name}`}
                        className="h-surface2" style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '5px 10px', fontFamily: 'var(--sans)', fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer' }}>Archive</button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 900 }}>
            <div style={eyebrow}>Locations ({locations.length}) · derived from customer addresses</div>
            <div style={panel}>
              {locations.length === 0 && <div style={{ padding: '30px 20px', textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>No locations yet — they appear as customers gain addresses.</div>}
              {locations.map((l) => (
                <div key={l.address} style={{ display: 'flex', gap: 14, padding: '14px 20px', borderBottom: '1px solid var(--line-2)', alignItems: 'flex-start' }}>
                  <span aria-hidden="true" style={{ width: 28, height: 28, flex: 'none', borderRadius: 8, background: 'var(--navy-soft)', color: 'var(--navy)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>📍</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{l.address}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{l.clients.join(' · ')}</span>
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)', flex: 'none' }}>{l.clients.length} customer{l.clients.length > 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 16 }}>
              Locations are grouped from customer addresses. A dedicated CustomerLocation entity
              (multiple sites per customer, geo data) is planned for a future phase.
            </p>
          </div>
        )}
      </div>
    </>
  )
}

// Inline-editable text cell (address / finance / notes).
function Cell({ c, k, edit, setEdit, commit, canEdit, mono }) {
  const editing = edit && edit.id === c.id && edit.key === k
  const style = { fontSize: 12.5, color: c[k] ? 'var(--ink-2)' : 'var(--faint)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: mono ? 'var(--mono)' : 'var(--sans)' }
  if (editing) {
    return (
      <input autoFocus value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} aria-label={`Edit ${k.replace('_', ' ')}`}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEdit(null) }} onBlur={commit}
        style={{ border: '1px solid var(--navy)', background: '#fff', borderRadius: 7, padding: '5px 8px', fontFamily: mono ? 'var(--mono)' : 'var(--sans)', fontSize: 12.5, outline: 'none', minWidth: 0 }} />
    )
  }
  if (!canEdit) return <span style={style}>{c[k] || '—'}</span>
  return (
    <button type="button" title="Click to edit" onClick={() => setEdit({ id: c.id, key: k, value: c[k] || '' })}
      style={{ ...style, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'text' }}>{c[k] || '—'}</button>
  )
}

const addInput = { flex: 1, minWidth: 130, border: '1px solid var(--navy)', background: '#fff', borderRadius: 8, padding: '7px 10px', fontFamily: 'var(--sans)', fontSize: 12.5, outline: 'none' }
