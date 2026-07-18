import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const monthLabel = (m) => { const [y, mm] = m.split('-'); return `${MONTHS[+mm - 1]} ${y}` }

function cover(hue, closed) {
  return {
    position: 'relative', height: 92, borderRadius: '12px 12px 0 0',
    background: closed
      ? 'linear-gradient(135deg,#c4c4d2,#a0a0b2)'
      : `linear-gradient(135deg, oklch(0.62 0.13 ${hue}), oklch(0.45 0.12 ${hue}))`,
  }
}
const cardBox = { border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden', cursor: 'pointer' }

export default function Gallery({ onOpenBoard, onCreateBoard }) {
  const [boards, setBoards] = useState(null)
  const [creating, setCreating] = useState(false)
  const [text, setText] = useState('')
  const [openArchive, setOpenArchive] = useState(null)
  const [err, setErr] = useState('')

  const load = () => api.getBoards().then(setBoards)
  useEffect(() => { load() }, [])
  if (!boards) return <div style={{ padding: 40, color: 'var(--faint)' }}>Loading boards…</div>

  const currentMonth = boards.length ? boards.map((b) => b.month).sort().reverse()[0] : null
  const current = boards.filter((b) => b.month === currentMonth)
  const archived = {}
  for (const b of boards.filter((b) => b.month !== currentMonth)) (archived[b.month] ??= []).push(b)
  const archiveMonths = Object.keys(archived).sort().reverse()

  async function submit() {
    const t = text.trim()
    if (!t) { setCreating(false); return }
    setErr('')
    try {
      await onCreateBoard(t)
      setText(''); setCreating(false)
      load()
    } catch (e) {
      setErr(String(e?.message || e))
    }
  }

  const BoardCard = (b) => (
    <div key={b.id} onClick={() => onOpenBoard(b.id)} className="h-lift" style={cardBox}>
      <div style={cover(b.cover_hue ?? 210, b.status === 'closed')}>
        {b.starred && <span style={{ position: 'absolute', top: 9, right: 10, fontSize: 15 }}>⭐</span>}
        {b.status === 'closed' && (
          <span style={{ position: 'absolute', left: 12, bottom: 12, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'rgba(28,27,46,0.7)', color: '#fff', borderRadius: 5, padding: '3px 8px' }}>Closed board</span>
        )}
      </div>
      <div style={{ padding: '11px 13px 13px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.25 }}>{b.title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4, fontFamily: 'var(--mono)' }}>{b.workerCount ?? 0} workers</div>
      </div>
    </div>
  )

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '30px 34px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'var(--disp)', fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>{currentMonth ? monthLabel(currentMonth) : 'Boards'}</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{currentMonth ? 'current month · one board per operating day' : 'no boards yet — create your first below'}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18, maxWidth: 1180 }}>
        {current.map(BoardCard)}
        {creating ? (
          <div style={{ minHeight: 170, border: '1.5px solid var(--navy)', borderRadius: 12, background: 'var(--surface)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="e.g. JUL/19/26 · SATURDAY"
              style={{ width: '100%', border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 9, padding: '11px 12px', fontFamily: 'var(--sans)', fontSize: 13, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 7 }}>
              <button onClick={submit} style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 15px', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Create</button>
              <button onClick={() => { setCreating(false); setErr('') }} style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 13px', fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>Cancel</button>
            </div>
            {err && <div style={{ fontSize: 12, color: '#b91c1c', lineHeight: 1.4 }}>{err}</div>}
          </div>
        ) : (
          <div onClick={() => setCreating(true)} className="h-dash" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 170, border: '1.5px dashed var(--line)', borderRadius: 12, color: 'var(--muted)', fontSize: 13, cursor: 'pointer', background: 'var(--surface-2)' }}>+ Create new board</div>
        )}
      </div>

      {archiveMonths.length > 0 && (
        <div style={{ marginTop: 44, maxWidth: 1180 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'var(--disp)', fontSize: 16, fontWeight: 600, margin: 0 }}>Archived months</h2>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>closed months — click to view their boards</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {archiveMonths.map((m) => {
              const active = openArchive === m
              return (
                <button key={m} onClick={() => setOpenArchive(active ? null : m)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: active ? 'var(--navy-soft)' : 'var(--surface)', border: `1px solid ${active ? 'var(--navy)' : 'var(--line)'}`, borderRadius: 10, padding: '9px 14px', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, color: active ? 'var(--navy)' : 'var(--ink-2)', cursor: 'pointer' }}>
                  <span>{active ? '▾' : '▸'}</span>{monthLabel(m)}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)' }}>{archived[m].length}</span>
                </button>
              )
            })}
          </div>
          {openArchive && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--faint)', marginBottom: 14 }}>{monthLabel(openArchive)} · closed boards</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18 }}>
                {archived[openArchive].map(BoardCard)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
