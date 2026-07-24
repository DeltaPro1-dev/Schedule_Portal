import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import SectionHeader, { sectionScroll, eyebrow, panel, navyBtn } from './SectionHeader.jsx'
import { cardTitle } from '../lib/title.js'
import {
  FILL_FIELDS, MATCH_FIELDS,
  missingFields, isIncomplete, matchingEntries, computeFills, referenceFromCard,
} from '../lib/dictionary.js'

const MAX_BOARDS = 10
const FILL_LABELS = {
  client_text: 'Client / builder', address: 'Address', subdivision: 'Subdivision',
  plan: 'Floor plan', lot: 'Lot', service_type: 'Service type', fin_contact: 'Finance', ps_note: 'PS note',
}
const blankEntry = () => ({ match_field: 'building', match_value: '', client_text: '', address: '', subdivision: '', plan: '', lot: '', service_type: '', fin_contact: '', ps_note: '', notes: '' })

export default function Dictionary({ onBack, canEdit }) {
  const [entries, setEntries] = useState(null)
  const [cards, setCards] = useState([])
  const [missingTable, setMissingTable] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(null)   // entry being added/edited (or null)

  async function load() {
    setErr('')
    // dictionary (tolerate missing table = migration 0013 not applied yet)
    try { setEntries(await api.getDictionary()); setMissingTable(false) }
    catch { setEntries([]); setMissingTable(true) }
    // cards from the newest month's boards (capped)
    try {
      const boards = await api.getBoards()
      const month = boards[0]?.month
      const scope = boards.filter((b) => b.month === month).slice(0, MAX_BOARDS)
      const details = await Promise.all(scope.map((b) => api.getBoardDetail(b.id).catch(() => null)))
      setCards(details.filter(Boolean).flatMap((d) => d.cards))
    } catch (e) { setErr(String(e.message || e)) }
  }
  useEffect(() => { load() }, [])

  const incomplete = useMemo(() => cards.filter(isIncomplete), [cards])

  async function run(fn, okMsg) {
    setBusy(true); setErr(''); setMsg('')
    try { await fn(); await load(); if (okMsg) setMsg(okMsg) }
    catch (e) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }
  async function applyOne(card) {
    const patch = computeFills(card, entries)
    if (!Object.keys(patch).length) { setMsg('No matching reference for this card yet.'); return }
    await run(() => api.updateCard(card.id, patch), 'Card completed from reference.')
  }
  async function applyAll() {
    const targets = incomplete.map((c) => ({ id: c.id, patch: computeFills(c, entries) })).filter((t) => Object.keys(t.patch).length)
    if (!targets.length) { setMsg('No incomplete card matches a reference right now.'); return }
    await run(async () => { for (const t of targets) await api.updateCard(t.id, t.patch) }, `Applied references to ${targets.length} card(s).`)
  }
  async function saveForm() {
    const f = { ...form }
    if (!f.match_value?.trim()) { setErr('The reference needs a match value.'); return }
    const id = f.id; delete f.id
    await run(() => (id ? api.updateDictionaryEntry(id, f) : api.addDictionaryEntry(f)), id ? 'Reference updated.' : 'Reference created.')
    setForm(null)
  }

  return (
    <>
      <SectionHeader onBack={onBack} title="Dictionary" subtitle="Place references that auto-complete incomplete cards"
        right={canEdit && !missingTable ? <button onClick={() => setForm(blankEntry())} style={navyBtn} className="h-navy"><span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Reference</button> : null} />
      <div className="section-scroll" style={sectionScroll}>
        {missingTable && (
          <div style={banner}>The dictionary table isn't deployed yet — apply <code style={{ fontFamily: 'var(--mono)' }}>supabase/migrations/0013_dictionary.sql</code> to enable this screen (see SETUP.md).</div>
        )}
        {err && <div style={{ fontSize: 12.5, color: '#dc2626', marginBottom: 12 }}>{err}</div>}
        {msg && <div style={{ fontSize: 12.5, color: 'var(--green-ink)', marginBottom: 12 }}>{msg}</div>}
        {!entries ? <div style={{ color: 'var(--faint)' }}>Loading…</div> : (
          <div style={{ maxWidth: 1100 }}>

            {/* add / edit form */}
            {form && (
              <div style={{ ...panel, padding: '16px 18px', marginBottom: 24 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>{form.id ? 'Edit reference' : 'New reference'}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>When</span>
                  <select value={form.match_field} onChange={(e) => setForm({ ...form, match_field: e.target.value })} aria-label="Match field" style={inp}>
                    {MATCH_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>=</span>
                  <input value={form.match_value} onChange={(e) => setForm({ ...form, match_value: e.target.value })} placeholder="e.g. St. George Hospital Bldg 1" aria-label="Match value" style={{ ...inp, flex: 1, minWidth: 220 }} />
                </div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--faint)', marginBottom: 8 }}>Fill these values</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8, marginBottom: 12 }}>
                  {FILL_FIELDS.map((k) => (
                    <input key={k} value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                      placeholder={FILL_LABELS[k]} aria-label={FILL_LABELS[k]} style={inp} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={saveForm} disabled={busy} style={{ ...navyBtn, opacity: busy ? 0.6 : 1 }} className="h-navy">{form.id ? 'Save' : 'Create reference'}</button>
                  <button onClick={() => { setForm(null); setErr('') }} style={ghostBtn}>Cancel</button>
                </div>
              </div>
            )}

            {/* incomplete cards */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...eyebrow, marginBottom: 12 }}>
              <span>Incomplete cards ({incomplete.length})</span>
              {canEdit && incomplete.length > 0 && <button onClick={applyAll} disabled={busy} className="h-surface2" style={smallBtn}>Apply references to all</button>}
            </div>
            <div style={{ ...panel, marginBottom: 30 }}>
              {incomplete.length === 0 && <div style={empty}>No incomplete cards in the current month 🎉</div>}
              {incomplete.slice(0, 100).map((c) => {
                const miss = missingFields(c)
                const hasMatch = matchingEntries(c, entries).length > 0 && Object.keys(computeFills(c, entries)).length > 0
                return (
                  <div key={c.id} style={{ display: 'flex', gap: 12, padding: '13px 18px', borderBottom: '1px solid var(--line-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 220 }}>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cardTitle(c)}</span>
                      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
                        {miss.map((f) => <span key={f.key} style={missBadge}>missing: {f.label}</span>)}
                      </span>
                    </span>
                    {canEdit && (hasMatch
                      ? <button onClick={() => applyOne(c)} disabled={busy} className="h-navy" style={{ ...smallBtn, background: 'var(--navy)', color: '#fff', border: 'none' }}>Complete from reference</button>
                      : <button onClick={() => setForm({ ...blankEntry(), ...referenceFromCard(c) })} disabled={busy} className="h-surface2" style={smallBtn}>Create reference…</button>
                    )}
                  </div>
                )
              })}
              {incomplete.length > 100 && <div style={{ padding: '12px 18px', fontSize: 12, color: 'var(--faint)' }}>Showing first 100 of {incomplete.length}.</div>}
            </div>

            {/* references */}
            <div style={eyebrow}>References ({entries.length})</div>
            <div style={panel}>
              {entries.length === 0 && <div style={empty}>No references yet{canEdit ? ' — add one, or create from an incomplete card above.' : '.'}</div>}
              {entries.map((e) => {
                const fills = FILL_FIELDS.filter((k) => e[k]).map((k) => `${FILL_LABELS[k]}: ${e[k]}`)
                return (
                  <div key={e.id} style={{ display: 'flex', gap: 12, padding: '13px 18px', borderBottom: '1px solid var(--line-2)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 220 }}>
                      <span style={{ fontSize: 12.5 }}>
                        <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{MATCH_FIELDS.find((m) => m.key === e.match_field)?.label || e.match_field}</span>
                        <span style={{ color: 'var(--muted)' }}> = </span>
                        <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{e.match_value}</span>
                      </span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>{fills.length ? fills.join(' · ') : 'no fill values yet'}</span>
                    </span>
                    {canEdit && (
                      <span style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setForm({ ...blankEntry(), ...e })} className="h-surface2" style={smallBtn}>Edit</button>
                        <button onClick={() => run(() => api.removeDictionaryEntry(e.id), 'Reference removed.')} className="h-surface2" style={smallBtn} aria-label="Remove reference">✕</button>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 16, lineHeight: 1.5 }}>
              A reference completes only the <strong>empty</strong> fields of a matching card (the most specific
              match wins). Once the Field Control sync is live, incoming cards will be auto-completed on import.
            </p>
          </div>
        )}
      </div>
    </>
  )
}

const inp = { border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 9, padding: '9px 11px', fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink-2)', outline: 'none' }
const ghostBtn = { background: 'none', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 13px', fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }
const smallBtn = { background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 11px', fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', cursor: 'pointer' }
const missBadge = { fontSize: 10.5, fontWeight: 600, color: '#b45309', background: 'oklch(0.95 0.06 75)', borderRadius: 20, padding: '2px 8px' }
const empty = { padding: '28px 18px', textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }
const banner = { maxWidth: 760, background: 'oklch(0.96 0.05 90)', border: '1px solid oklch(0.88 0.08 90)', borderRadius: 12, padding: '13px 16px', fontSize: 12.5, color: 'oklch(0.42 0.1 90)', marginBottom: 20 }
