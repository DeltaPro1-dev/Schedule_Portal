import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { STATUS_META, STATUSES } from '../lib/stateMachine.js'
import { cardTitle } from '../lib/title.js'
import { toCsv, downloadText } from '../lib/csv.js'
import { listViews, saveView, removeView } from '../lib/savedViews.js'

// Editable inline: the free-text card fields (building, service_type, scheduled_time).
// Status stays in the card modal (FSM-constrained); client is a relation (also modal).

// Spreadsheet-style view of one board's cards (§9.2). Sortable columns, text +
// status filter, row → card modal, client-side CSV export of the filtered rows.
// Uses the same api.getBoardDetail as the Board, so it works in mock and real.

const COLUMNS = [
  { key: 'worker', label: 'Worker' },
  { key: 'status', label: 'Status' },
  { key: 'client', label: 'Client' },
  { key: 'building', label: 'Building' },
  { key: 'service_type', label: 'Service' },
  { key: 'scheduled_time', label: 'Scheduled' },
  { key: 'done', label: 'Done' },
]

export default function TableView({ boardId, boards, canEdit, onBack, onOpenCard, onSelectDay, onSwitchView, cardVersion }) {
  const [detail, setDetail] = useState(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState({ key: 'worker', dir: 1 })
  const [views, setViews] = useState(() => listViews())
  const [naming, setNaming] = useState(false)
  const [viewName, setViewName] = useState('')
  const [edit, setEdit] = useState(null)   // { id, key }
  const [draft, setDraft] = useState('')
  const [saveErr, setSaveErr] = useState('')

  const load = useCallback(async () => setDetail(await api.getBoardDetail(boardId)), [boardId])
  useEffect(() => { setDetail(null); load() }, [load])
  useEffect(() => { if (cardVersion) load() }, [cardVersion])

  // Realtime: reload (debounced) when another client changes this board.
  const timer = useRef(null)
  useEffect(() => {
    const unsub = api.subscribeBoard?.(boardId, () => {
      clearTimeout(timer.current); timer.current = setTimeout(load, 300)
    })
    return () => { clearTimeout(timer.current); unsub?.() }
  }, [boardId, load])

  const rows = useMemo(() => {
    if (!detail) return []
    const listName = Object.fromEntries(detail.lists.map((l) => [l.id, l.name]))
    return detail.cards.map((c) => ({
      id: c.id,
      worker: listName[c.list_id] || '—',
      status: c.status || 'unscheduled',
      client: c.client?.name || c.client_text || '',
      building: c.building || '',
      service_type: c.service_type || '',
      scheduled_time: c.scheduled_time || '',
      done: c.done ? 'Yes' : 'No',
      _done: c.done,
      _title: cardTitle(c),
    }))
  }, [detail])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let r = rows
    if (status !== 'all') r = r.filter((x) => x.status === status)
    if (q) r = r.filter((x) => `${x.worker} ${x.client} ${x.building} ${x.service_type} ${x._title}`.toLowerCase().includes(q))
    const { key, dir } = sort
    return [...r].sort((a, b) => String(a[key]).localeCompare(String(b[key]), undefined, { numeric: true }) * dir)
  }, [rows, query, status, sort])

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }))
  }
  function exportCsv() {
    const title = detail?.board?.title || 'board'
    const safe = title.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')
    downloadText(`schedule-${safe}.csv`, toCsv(filtered, COLUMNS))
  }

  // ── saved views (localStorage) ──────────────────────────────────────────────
  function applyView(v) {
    setQuery(v.query || ''); setStatus(v.status || 'all')
    setSort(v.sort || { key: 'worker', dir: 1 })
  }
  function saveCurrentView() {
    const name = viewName.trim(); if (!name) return
    setViews(saveView(name, { query, status, sort }))
    setViewName(''); setNaming(false)
  }
  function deleteView(id) { setViews(removeView(id)) }

  // ── inline editing ──────────────────────────────────────────────────────────
  function beginEdit(id, key, value) { setSaveErr(''); setEdit({ id, key }); setDraft(value || '') }
  function cancelEdit() { setEdit(null); setDraft('') }
  async function commitEdit(id, key, original) {
    const value = draft.trim()
    setEdit(null)
    if (value === (original || '')) return
    try { await api.updateCard(id, { [key]: value || null }); await load() }
    catch (e) { setSaveErr(String(e.message || e)) }
  }
  async function toggleDone(row) {
    setSaveErr('')
    try { await api.toggleDone(row.id, row._done); await load() }
    catch (e) { setSaveErr(String(e.message || e)) }
  }

  if (!detail) return <div style={{ padding: 30, color: 'var(--faint)' }}>Loading…</div>
  const { board } = detail

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <header className="board-head" style={{ flex: 'none', background: 'var(--surface)', borderBottom: '1px solid var(--line)', padding: '13px 30px 0' }}>
        <div className="resp-header" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} className="h-navysoft" style={backBtn}>‹ Boards</button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 20, margin: 0, letterSpacing: '-0.01em', whiteSpace: 'nowrap', color: 'var(--ink)' }}>{board.title}</h1>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{filtered.length} of {rows.length} jobs</div>
          </div>
          <div style={{ flex: 1 }} />
          <div className="resp-grow" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <ViewToggle view="table" onSwitchView={onSwitchView} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', width: 220 }}>
              <span aria-hidden="true" style={{ color: 'var(--faint)' }}>⌕</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label="Search jobs"
                style={{ border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink)', width: '100%' }} />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"
              style={{ border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 10, padding: '8px 11px', fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer', outline: 'none' }}>
              <option value="all">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>)}
            </select>
            <button onClick={exportCsv} className="h-navy" style={primaryBtn} title="Export the filtered rows as CSV">↓ CSV</button>
          </div>
        </div>
        {/* day tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 14, paddingBottom: 11, overflowX: 'auto' }}>
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--faint)', marginRight: 5, flex: 'none' }}>Boards by day</span>
          {boards.filter((b) => b.month === board.month).map((d) => {
            const active = d.id === boardId
            const dayNum = d.date.slice(-2)
            const wd = new Date(d.date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short' }).toUpperCase()
            return (
              <button key={d.id} onClick={() => onSelectDay(d.id)}
                style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 52, borderRadius: 10, padding: '7px 10px', cursor: 'pointer', border: `1px solid ${active ? 'var(--navy)' : 'var(--line)'}`, background: active ? 'var(--navy)' : 'var(--surface)', color: active ? '#fff' : 'var(--ink-2)' }}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.75 }}>{wd}</span>
                <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 16, lineHeight: 1 }}>{dayNum}</span>
              </button>
            )
          })}
        </div>
      </header>

      {/* table */}
      <main className="board-main" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '18px 30px 40px' }}>
        {/* saved views */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--faint)' }}>Saved views</span>
          {views.length === 0 && !naming && <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>none yet</span>}
          {views.map((v) => (
            <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: '4px 6px 4px 12px' }}>
              <button type="button" onClick={() => applyView(v)} style={{ background: 'none', border: 'none', fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 500, color: 'var(--navy)', cursor: 'pointer', padding: 0 }}>{v.name}</button>
              <button type="button" onClick={() => deleteView(v.id)} aria-label={`Delete view ${v.name}`} className="h-surface2" style={{ width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'var(--surface-2)', color: 'var(--faint)', cursor: 'pointer', fontSize: 11, lineHeight: 1 }}>✕</button>
            </span>
          ))}
          {naming ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input autoFocus value={viewName} onChange={(e) => setViewName(e.target.value)} aria-label="View name"
                onKeyDown={(e) => { if (e.key === 'Enter') saveCurrentView(); if (e.key === 'Escape') { setNaming(false); setViewName('') } }}
                placeholder="View name…" style={{ border: '1px solid var(--navy)', background: '#fff', borderRadius: 8, padding: '5px 10px', fontFamily: 'var(--sans)', fontSize: 12.5, outline: 'none', width: 150 }} />
              <button type="button" onClick={saveCurrentView} style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 11px', fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Save</button>
              <button type="button" onClick={() => { setNaming(false); setViewName('') }} style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 9px', fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
            </span>
          ) : (
            <button type="button" onClick={() => setNaming(true)} className="h-surface2" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 20, padding: '5px 12px', fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 500, color: 'var(--ink-2)', cursor: 'pointer' }}>＋ Save current view</button>
          )}
        </div>
        {saveErr && <div style={{ fontSize: 12.5, color: '#dc2626', marginBottom: 12 }}>{saveErr}</div>}
        {filtered.length === 0 ? (
          <div style={{ color: 'var(--faint)', fontSize: 13.5, padding: '40px 0', textAlign: 'center' }}>
            {rows.length === 0 ? 'No jobs on this board yet.' : 'No jobs match your filters.'}
          </div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden', minWidth: 720 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: 'var(--sans)' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {COLUMNS.map((c) => {
                    const active = sort.key === c.key
                    return (
                      <th key={c.key} scope="col" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                        style={{ textAlign: 'left', borderBottom: '1px solid var(--line)', padding: 0 }}>
                        <button type="button" onClick={() => toggleSort(c.key)}
                          style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '12px 16px', fontFamily: 'var(--sans)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: active ? 'var(--navy)' : 'var(--faint)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {c.label}{active ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const meta = STATUS_META[r.status] || { label: r.status, color: 'var(--muted)' }
                  const cellProps = {
                    edit, draft, setDraft, canEdit, rowId: r.id,
                    onBegin: beginEdit, onCommit: commitEdit, onCancel: cancelEdit,
                  }
                  return (
                    <tr key={r.id} className="h-surface2" onClick={() => onOpenCard(r.id)}
                      tabIndex={0} aria-label={`Open card: ${r.worker} — ${r.client || r.service_type || 'service'}`}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpenCard(r.id) } }}
                      style={{ cursor: 'pointer', borderBottom: '1px solid var(--line-2)' }}>
                      <td style={{ ...td, fontWeight: 500, color: 'var(--ink)' }}>{r.worker}</td>
                      <td style={td}>
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: '#fff', background: meta.color, borderRadius: 20, padding: '2px 8px' }}>{meta.label}</span>
                      </td>
                      <td style={td}>{r.client || '—'}</td>
                      <EditCell {...cellProps} colKey="building" value={r.building} />
                      <EditCell {...cellProps} colKey="service_type" value={r.service_type} />
                      <EditCell {...cellProps} colKey="scheduled_time" value={r.scheduled_time} mono />
                      <td style={td}>
                        <button type="button" role="checkbox" aria-checked={r._done} aria-label="Mark service completed"
                          disabled={!canEdit} onClick={(e) => { e.stopPropagation(); toggleDone(r) }} onKeyDown={(e) => e.stopPropagation()}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: canEdit ? 'pointer' : 'default', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, color: r._done ? 'var(--green-ink)' : 'var(--faint)', padding: 0 }}>
                          <span aria-hidden="true" style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${r._done ? 'var(--green)' : 'var(--line)'}`, background: r._done ? 'var(--green)' : '#fff', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>{r._done ? '✓' : ''}</span>
                          {r.done}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

// Board / Table segmented control — shared shape with the one added to Board.jsx.
export function ViewToggle({ view, onSwitchView }) {
  const opt = (key, label) => {
    const active = view === key
    return (
      <button key={key} type="button" aria-pressed={active} aria-label={`${label} view`} onClick={() => !active && onSwitchView(key)}
        style={{ border: 'none', borderRadius: 8, padding: '6px 12px', fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, cursor: active ? 'default' : 'pointer', background: active ? 'var(--surface)' : 'transparent', color: active ? 'var(--navy)' : 'var(--muted)', boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}>
        {label}
      </button>
    )
  }
  return (
    <div role="group" aria-label="Switch view" style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 3 }}>
      {opt('board', 'Board')}
      {opt('table', 'Table')}
    </div>
  )
}

// A table cell that edits a free-text card field in place. Editing stops event
// propagation so it never opens the card modal; non-editable mode is plain text.
function EditCell({ colKey, value, mono, edit, draft, setDraft, canEdit, rowId, onBegin, onCommit, onCancel }) {
  const editing = edit && edit.id === rowId && edit.key === colKey
  const base = { ...td, ...(mono ? { fontFamily: 'var(--mono)', color: 'var(--navy)' } : {}) }
  if (editing) {
    return (
      <td style={base} onClick={(e) => e.stopPropagation()}>
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') onCommit(rowId, colKey, value)
            else if (e.key === 'Escape') onCancel()
          }}
          onBlur={() => onCommit(rowId, colKey, value)} aria-label={`Edit ${colKey.replace('_', ' ')}`}
          style={{ width: 130, border: '1px solid var(--navy)', background: '#fff', borderRadius: 7, padding: '5px 8px', fontFamily: mono ? 'var(--mono)' : 'var(--sans)', fontSize: 12.5, outline: 'none' }} />
      </td>
    )
  }
  if (!canEdit) return <td style={base}>{value || '—'}</td>
  return (
    <td style={{ ...base, padding: 0 }}>
      <button type="button" title="Click to edit"
        onClick={(e) => { e.stopPropagation(); onBegin(rowId, colKey, value) }}
        onKeyDown={(e) => e.stopPropagation()}
        style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'text', padding: '12px 16px', fontFamily: mono ? 'var(--mono)' : 'var(--sans)', fontSize: 13, color: value ? (mono ? 'var(--navy)' : 'var(--ink-2)') : 'var(--faint)', whiteSpace: 'nowrap' }}>
        {value || '—'}
      </button>
    </td>
  )
}

const td = { padding: '12px 16px', fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'nowrap' }
const backBtn = { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '7px 13px', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', cursor: 'pointer' }
const primaryBtn = { display: 'flex', alignItems: 'center', gap: 7, background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 15px', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
