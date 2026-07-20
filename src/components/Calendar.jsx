import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import SectionHeader, { eyebrow } from './SectionHeader.jsx'

// Calendar view (§9.3). Board = one operating day, so the calendar is a
// month/week grid over the day-boards: each populated cell opens that board.
// Cards carry `scheduled_time` as free text (not a comparable timestamp), so a
// true per-event calendar isn't meaningful yet — cells summarize the board
// (workers, open/closed, starred). Uses api.getBoards only (cheap, no detail
// fetch), so it works in mock and real mode.

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function Calendar({ onBack, onOpenBoard }) {
  const [boards, setBoards] = useState(null)
  const [mode, setMode] = useState('month')
  const [cursor, setCursor] = useState(null) // {y, m} for month; anchor date for week

  useEffect(() => { api.getBoards().then(setBoards) }, [])

  // default the cursor to the newest board's month once boards load
  useEffect(() => {
    if (boards && !cursor) {
      const newest = boards[0]?.date
      const d = newest ? new Date(newest + 'T00:00:00') : new Date(2026, 6, 1)
      setCursor({ y: d.getFullYear(), m: d.getMonth(), anchor: newest || '2026-07-01' })
    }
  }, [boards, cursor])

  const byDate = useMemo(() => Object.fromEntries((boards || []).map((b) => [b.date, b])), [boards])

  if (!boards || !cursor) {
    return <><SectionHeader onBack={onBack} title="Calendar" subtitle="Boards by day" /><div style={{ padding: 30, color: 'var(--faint)' }}>Loading…</div></>
  }

  const shift = (dir) => {
    if (mode === 'month') {
      const m = cursor.m + dir
      const y = cursor.y + Math.floor(m / 12)
      const mm = ((m % 12) + 12) % 12
      setCursor({ ...cursor, y, m: mm })
    } else {
      const a = new Date(cursor.anchor + 'T00:00:00'); a.setDate(a.getDate() + dir * 7)
      setCursor({ ...cursor, anchor: iso(a), y: a.getFullYear(), m: a.getMonth() })
    }
  }
  const title = mode === 'month'
    ? `${MONTHS[cursor.m]} ${cursor.y}`
    : weekLabel(cursor.anchor)

  return (
    <>
      <SectionHeader onBack={onBack} title="Calendar" subtitle="Boards by day"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 3 }}>
              {['month', 'week'].map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                  style={{ border: 'none', borderRadius: 8, padding: '6px 14px', fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', background: mode === m ? 'var(--surface)' : 'transparent', color: mode === m ? 'var(--navy)' : 'var(--muted)', boxShadow: mode === m ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}>{m}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => shift(-1)} className="h-surface2" style={navBtn} aria-label={`Previous ${mode}`}>‹</button>
              <span aria-live="polite" style={{ fontFamily: 'var(--disp)', fontSize: 15, fontWeight: 600, minWidth: 150, textAlign: 'center' }}>{title}</span>
              <button onClick={() => shift(1)} className="h-surface2" style={navBtn} aria-label={`Next ${mode}`}>›</button>
            </div>
          </div>
        } />
      <div className="section-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '22px 34px 50px' }}>
        {mode === 'month'
          ? <MonthGrid y={cursor.y} m={cursor.m} byDate={byDate} onOpenBoard={onOpenBoard} />
          : <WeekGrid anchor={cursor.anchor} byDate={byDate} onOpenBoard={onOpenBoard} />}
        <Legend />
      </div>
    </>
  )
}

function MonthGrid({ y, m, byDate, onOpenBoard }) {
  const dim = new Date(y, m + 1, 0).getDate()
  const lead = new Date(y, m, 1).getDay()
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= dim; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 8 }}>
        {WD.map((w) => <div key={w} style={{ ...eyebrow, marginBottom: 0, textAlign: 'center' }}>{w}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} style={{ minHeight: 96, borderRadius: 12, background: 'var(--surface-2)', opacity: 0.4 }} />
          const date = iso(new Date(y, m, d))
          return <DayCell key={i} day={d} board={byDate[date]} onOpenBoard={onOpenBoard} />
        })}
      </div>
    </>
  )
}

function WeekGrid({ anchor, byDate, onOpenBoard }) {
  const a = new Date(anchor + 'T00:00:00')
  a.setDate(a.getDate() - a.getDay()) // back to Sunday
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(a); d.setDate(a.getDate() + i); return d })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
      {days.map((d, i) => (
        <div key={i}>
          <div style={{ ...eyebrow, marginBottom: 6, textAlign: 'center' }}>{WD[d.getDay()]} {d.getDate()}</div>
          <DayCell day={d.getDate()} board={byDate[iso(d)]} onOpenBoard={onOpenBoard} tall />
        </div>
      ))}
    </div>
  )
}

function DayCell({ day, board, onOpenBoard, tall }) {
  const minHeight = tall ? 150 : 96
  if (!board) {
    return (
      <div style={{ minHeight, borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)', padding: '8px 10px', color: 'var(--faint)' }}>
        <div style={{ fontFamily: 'var(--disp)', fontSize: 15, fontWeight: 600 }}>{day}</div>
      </div>
    )
  }
  const closed = board.status === 'closed'
  const label = `Open board ${board.title || ''} — ${board.workerCount != null ? board.workerCount + ' workers, ' : ''}${closed ? 'closed' : 'open'}`
  return (
    <button onClick={() => onOpenBoard(board.id)} className="h-card" aria-label={label}
      style={{ minHeight, width: '100%', textAlign: 'left', borderRadius: 12, border: `1px solid ${closed ? 'var(--line-2)' : 'var(--navy-soft)'}`, background: closed ? 'var(--surface-2)' : 'var(--surface)', padding: '8px 10px', cursor: 'pointer', fontFamily: 'var(--sans)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'var(--disp)', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{day}</span>
        {board.starred && <span style={{ color: 'oklch(0.72 0.15 85)', fontSize: 12 }}>★</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: closed ? 'var(--faint)' : 'var(--green-ink)', background: closed ? 'var(--surface)' : 'var(--green-soft)', borderRadius: 20, padding: '1px 7px' }}>{closed ? 'Closed' : 'Open'}</span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.35 }}>
        {board.workerCount != null ? `${board.workerCount} workers` : ''}
        {board.jobs != null ? ` · ${board.jobs} jobs` : ''}
      </div>
    </button>
  )
}

function Legend() {
  const item = (bg, border, label) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--muted)' }}>
      <span style={{ width: 14, height: 14, borderRadius: 4, background: bg, border: `1px solid ${border}` }} />{label}
    </span>
  )
  return (
    <div style={{ display: 'flex', gap: 20, marginTop: 22, flexWrap: 'wrap' }}>
      {item('var(--surface)', 'var(--navy-soft)', 'Open board — click to open')}
      {item('var(--surface-2)', 'var(--line-2)', 'Closed / archived')}
      {item('var(--surface)', 'var(--line-2)', 'No board that day')}
    </div>
  )
}

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function weekLabel(anchor) {
  const a = new Date(anchor + 'T00:00:00'); a.setDate(a.getDate() - a.getDay())
  const b = new Date(a); b.setDate(a.getDate() + 6)
  const f = (d) => `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`
  return `${f(a)} – ${f(b)}`
}

const navBtn = { background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '6px 12px', fontFamily: 'var(--sans)', fontSize: 15, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }
