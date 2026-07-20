import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { STATUS_META, STATUSES } from '../lib/stateMachine.js'
import { cardTitle } from '../lib/title.js'
import { toCsv, downloadText } from '../lib/csv.js'

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

export default function TableView({ boardId, boards, onBack, onOpenCard, onSelectDay, onSwitchView, cardVersion }) {
  const [detail, setDetail] = useState(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState({ key: 'worker', dir: 1 })

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

  if (!detail) return <div style={{ padding: 30, color: 'var(--faint)' }}>Loading…</div>
  const { board } = detail

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <header style={{ flex: 'none', background: 'var(--surface)', borderBottom: '1px solid var(--line)', padding: '13px 30px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} className="h-navysoft" style={backBtn}>‹ Boards</button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 20, margin: 0, letterSpacing: '-0.01em', whiteSpace: 'nowrap', color: 'var(--ink)' }}>{board.title}</h1>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{filtered.length} of {rows.length} jobs</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ViewToggle view="table" onSwitchView={onSwitchView} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', width: 220 }}>
              <span style={{ color: 'var(--faint)' }}>⌕</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…"
                style={{ border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink)', width: '100%' }} />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
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
      <main style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '18px 30px 40px' }}>
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
                      <th key={c.key} onClick={() => toggleSort(c.key)}
                        style={{ textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid var(--line)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: active ? 'var(--navy)' : 'var(--faint)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                        {c.label}{active ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const meta = STATUS_META[r.status] || { label: r.status, color: 'var(--muted)' }
                  return (
                    <tr key={r.id} className="h-surface2" onClick={() => onOpenCard(r.id)}
                      style={{ cursor: 'pointer', borderBottom: '1px solid var(--line-2)' }}>
                      <td style={{ ...td, fontWeight: 500, color: 'var(--ink)' }}>{r.worker}</td>
                      <td style={td}>
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: '#fff', background: meta.color, borderRadius: 20, padding: '2px 8px' }}>{meta.label}</span>
                      </td>
                      <td style={td}>{r.client || '—'}</td>
                      <td style={td}>{r.building || '—'}</td>
                      <td style={td}>{r.service_type || '—'}</td>
                      <td style={{ ...td, fontFamily: 'var(--mono)', color: 'var(--navy)' }}>{r.scheduled_time || '—'}</td>
                      <td style={{ ...td, color: r.done === 'Yes' ? 'var(--green-ink)' : 'var(--faint)', fontWeight: 500 }}>{r.done}</td>
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
      <button key={key} onClick={() => !active && onSwitchView(key)}
        style={{ border: 'none', borderRadius: 8, padding: '6px 12px', fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, cursor: active ? 'default' : 'pointer', background: active ? 'var(--surface)' : 'transparent', color: active ? 'var(--navy)' : 'var(--muted)', boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}>
        {label}
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 3 }}>
      {opt('board', 'Board')}
      {opt('table', 'Table')}
    </div>
  )
}

const td = { padding: '12px 16px', fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'nowrap' }
const backBtn = { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '7px 13px', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', cursor: 'pointer' }
const primaryBtn = { display: 'flex', alignItems: 'center', gap: 7, background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 15px', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
