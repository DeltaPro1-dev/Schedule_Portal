import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { cardHeadBody, initials, avatarStyle } from '../lib/present.js'
import { STATUS_META } from '../lib/stateMachine.js'

export default function Board({ boardId, boards, onBack, onOpenCard, onSelectDay, cardVersion }) {
  const [detail, setDetail] = useState(null)
  const [query, setQuery] = useState('')
  const [acting, setActing] = useState('admin')
  const [addingCol, setAddingCol] = useState(null)
  const [cardText, setCardText] = useState('')
  const [addingList, setAddingList] = useState(false)
  const [listText, setListText] = useState('')
  const canEdit = acting !== 'none'

  const load = useCallback(async () => setDetail(await api.getBoardDetail(boardId)), [boardId])
  useEffect(() => { setDetail(null); load() }, [load])              // reset only when the board changes
  useEffect(() => { if (cardVersion) load() }, [cardVersion])       // silent refresh after edits (no blank)

  // Realtime: reload (debounced) when another client changes this board.
  const refreshTimer = useRef(null)
  useEffect(() => {
    const unsub = api.subscribeBoard?.(boardId, () => {
      clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(load, 300)
    })
    return () => { clearTimeout(refreshTimer.current); unsub?.() }
  }, [boardId, load])

  if (!detail) return <div style={{ padding: 30, color: 'var(--faint)' }}>Loading board…</div>
  const { board, lists, cards, vendors = [] } = detail

  const match = (c) => {
    if (!query.trim()) return true
    const hay = `${c.client?.name || ''} ${c.raw_title || ''} ${c.building || ''}`.toLowerCase()
    return hay.includes(query.toLowerCase())
  }
  const cardsOf = (listId) => cards.filter((c) => c.list_id === listId && match(c)).sort((a, b) => a.position - b.position)
  const pool = lists.find((l) => l.is_pool)
  const cols = lists.filter((l) => !l.is_pool)

  async function move(cardId, toListId) {
    const c = cards.find((x) => x.id === cardId)
    if (!c || c.list_id === toListId) return
    try { await api.moveCard(cardId, toListId, cardsOf(toListId).length, c.version); await load() } catch (e) { /* conflict */ void e }
  }
  async function submitCard(listId) {
    const t = cardText.trim(); setCardText(''); setAddingCol(null)
    if (t) { await api.addCard({ board_id: boardId, list_id: listId, raw_title: t }); await load() }
  }
  async function submitList() {
    const t = listText.trim(); setListText(''); setAddingList(false)
    if (t) { await api.addList({ board_id: boardId, name: t }); await load() }
  }

  const daySummary = `${board.workerCount ?? cols.length} workers · ${board.jobs ?? cards.length} jobs · ${board.completed ?? 0} completed`

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <header style={{ flex: 'none', background: 'var(--surface)', borderBottom: '1px solid var(--line)', padding: '13px 30px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} className="h-navysoft" style={backBtn}>‹ Boards</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 20, margin: 0, letterSpacing: '-0.01em', whiteSpace: 'nowrap', color: 'var(--ink)' }}>{board.title}</h1>
              {board.starred && <span style={{ color: 'oklch(0.72 0.15 85)', fontSize: 16 }}>★</span>}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{daySummary}</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', width: 250 }}>
              <span style={{ color: 'var(--faint)' }}>⌕</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search worker or client…"
                style={{ border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink)', width: '100%' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '5px 6px 5px 11px' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Profile</span>
              <select value={acting} onChange={(e) => setActing(e.target.value)}
                style={{ border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, color: 'var(--navy)', cursor: 'pointer' }}>
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="none">No access</option>
              </select>
            </div>
            {canEdit && (
              <button onClick={() => setAddingList(true)} className="h-navy" style={primaryBtn}><span style={{ fontSize: 16, lineHeight: 1 }}>+</span> List</button>
            )}
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

      {/* columns */}
      <main style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden', padding: '18px 30px' }}>
        <div style={{ display: 'flex', gap: 14, height: '100%', alignItems: 'flex-start', minHeight: '100%' }}>
          {/* POOL — resource/vendor list (DELTA OFFICE / WAREHOUSE) */}
          {pool && <VendorPool name={pool.name} vendors={vendors} canEdit={canEdit} />}
          {/* WORKER COLUMNS */}
          {cols.map((col) => (
            <Column key={col.id} list={col} cards={cardsOf(col.id)} canEdit={canEdit}
              onDropCard={move} onOpenCard={onOpenCard}
              adding={addingCol === col.id} cardText={cardText} setCardText={setCardText}
              onStartAdd={() => setAddingCol(col.id)} onCancelAdd={() => setAddingCol(null)} onSubmitAdd={() => submitCard(col.id)}
              onToggle={async (c) => { await api.toggleDone(c.id, c.done); load() }} />
          ))}
          {/* add worker */}
          <div style={{ flex: 'none', width: 250 }}>
            {addingList ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--navy)', borderRadius: 13, padding: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input autoFocus value={listText} onChange={(e) => setListText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitList()}
                  placeholder="Worker name…" style={{ width: '100%', border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 9, padding: '10px 11px', fontFamily: 'var(--sans)', fontSize: 12.5, outline: 'none' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={submitList} style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 13px', fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                  <button onClick={() => setAddingList(false)} style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 11px', fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
                </div>
              </div>
            ) : canEdit && (
              <div onClick={() => setAddingList(true)} className="h-dash" style={{ border: '1.5px dashed var(--line)', borderRadius: 13, padding: '13px 15px', fontSize: 13, color: 'var(--muted)', cursor: 'pointer', background: 'var(--surface-2)' }}>+ Add worker</div>
            )}
          </div>
          <div style={{ flex: 'none', width: 16 }} />
        </div>
      </main>
    </div>
  )
}

function VendorPool({ name, vendors, canEdit }) {
  return (
    <section style={{ flex: 'none', width: 250, maxHeight: '100%', display: 'flex', flexDirection: 'column', background: 'var(--navy)', borderRadius: 13, padding: '14px 9px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 7px 12px' }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#fff', letterSpacing: '0.02em', flex: 1 }}>{name}</h2>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'rgba(255,255,255,0.75)', background: 'rgba(255,255,255,0.14)', borderRadius: 20, padding: '2px 8px' }}>{vendors.length}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '2px 5px 6px' }}>
        {vendors.map((v, i) => (
          <div key={i} className="h-poolcard" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '9px 11px', fontSize: 12.5, color: '#fff', cursor: 'pointer' }}>{v}</div>
        ))}
        {canEdit && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', padding: '7px 4px', cursor: 'pointer' }}>+ Add vendor</div>}
      </div>
    </section>
  )
}

function Column({ navy, list, cards, canEdit, onDropCard, onOpenCard, adding, cardText, setCardText, onStartAdd, onCancelAdd, onSubmitAdd, onToggle }) {
  return (
    <section onDragOver={(e) => canEdit && e.preventDefault()}
      onDrop={(e) => { const id = e.dataTransfer.getData('text/card-id'); if (id) onDropCard(id, list.id) }}
      style={{
        flex: 'none', width: navy ? 250 : 278, maxHeight: '100%', display: 'flex', flexDirection: 'column',
        borderRadius: 13, padding: navy ? '14px 9px 8px' : '12px 8px 6px',
        background: navy ? 'var(--navy)' : 'var(--surface-2)', border: navy ? 'none' : '1px solid var(--line-2)',
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: navy ? '0 7px 12px' : '0 6px 11px' }}>
        {!navy && <span style={{ ...avatarStyle(list.name), width: 26, height: 26, fontSize: 10 }}>{initials(list.name)}</span>}
        <h2 style={{ fontSize: 13, fontWeight: navy ? 700 : 600, margin: 0, color: navy ? '#fff' : 'var(--ink)', lineHeight: 1.2, flex: 1, letterSpacing: navy ? '0.02em' : 0 }}>{list.name}</h2>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: navy ? 'rgba(255,255,255,0.75)' : 'var(--muted)', background: navy ? 'rgba(255,255,255,0.14)' : 'var(--surface)', border: navy ? 'none' : '1px solid var(--line)', borderRadius: 20, padding: '1px 8px', flex: 'none' }}>{cards.length}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: navy ? 6 : 9, padding: '2px 6px 6px' }}>
        {cards.map((card) => <CardTile key={card.id} card={card} navy={navy} listName={list.name} onOpen={onOpenCard} onToggle={onToggle} canEdit={canEdit} />)}
        {adding ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '2px 2px 4px' }}>
            <input autoFocus value={cardText} onChange={(e) => setCardText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSubmitAdd()}
              placeholder="Describe the service…" style={{ width: '100%', border: '1px solid var(--navy)', background: '#fff', borderRadius: 9, padding: '10px 11px', fontFamily: 'var(--sans)', fontSize: 12.5, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onSubmitAdd} style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 13px', fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Add</button>
              <button onClick={onCancelAdd} style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 11px', fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
            </div>
          </div>
        ) : canEdit && (
          <div onClick={onStartAdd} className={navy ? '' : 'h-line2'} style={{ fontSize: 12.5, color: navy ? 'rgba(255,255,255,0.6)' : 'var(--faint)', padding: navy ? '7px 4px' : '8px 6px', cursor: 'pointer', borderRadius: 8 }}>+ Add card</div>
        )}
      </div>
    </section>
  )
}

function CardTile({ card, navy, listName, onOpen, onToggle, canEdit }) {
  const { head, body } = cardHeadBody(card)
  const meta = STATUS_META[card.status] || { label: card.status || 'unknown', color: 'var(--muted)' }
  if (navy) {
    return (
      <article draggable={canEdit} onDragStart={(e) => e.dataTransfer.setData('text/card-id', card.id)} onClick={() => onOpen(card.id)}
        className="h-poolcard" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '9px 11px', fontSize: 12.5, color: '#fff', cursor: 'pointer' }}>
        {head}{body ? <span style={{ opacity: 0.75 }}>{body}</span> : null}
      </article>
    )
  }
  return (
    <article draggable={canEdit} onDragStart={(e) => e.dataTransfer.setData('text/card-id', card.id)} onClick={() => onOpen(card.id)}
      className="h-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '11px 12px', cursor: 'pointer' }}>
      {card.labels?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 9 }}>
          {card.labels.map((l) => <span key={l.key} title={l.name} style={{ height: 6, width: 26, borderRadius: 20, background: l.color }} />)}
        </div>
      )}
      <h3 className="clamp" style={{ fontSize: 12.5, lineHeight: 1.4, margin: 0, color: 'var(--ink-2)', WebkitLineClamp: 6 }}>
        <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{head}</strong>{body}
      </h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 11 }}>
        <span onClick={(e) => { e.stopPropagation(); canEdit && onToggle(card) }}
          style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${card.done ? 'var(--green)' : 'var(--line)'}`, background: card.done ? 'var(--green)' : '#fff', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, cursor: canEdit ? 'pointer' : 'default', flex: 'none' }}>{card.done ? '✓' : ''}</span>
        {card.scheduled_time && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--navy)' }}>{card.scheduled_time}</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', background: meta.color, borderRadius: 20, padding: '2px 7px' }}>{meta.label}</span>
        <span style={{ ...avatarStyle(listName), width: 22, height: 22, fontSize: 9.5 }}>{initials(listName)}</span>
      </div>
    </article>
  )
}

const backBtn = { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '7px 13px', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', cursor: 'pointer' }
const primaryBtn = { display: 'flex', alignItems: 'center', gap: 7, background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 15px', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
