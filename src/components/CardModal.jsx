import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { cardHeadBody, cardFields, initials, avatarStyle } from '../lib/present.js'
import { allowedTransitions, STATUS_META } from '../lib/stateMachine.js'

export default function CardModal({ card, listName, lists, canEdit, onChanged, onClose }) {
  const [comment, setComment] = useState('')
  const [item, setItem] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [dupMsg, setDupMsg] = useState('')
  const dialogRef = useRef(null)
  const titleId = `card-${card.id}-title`

  // Dialog a11y: close on Escape, move focus into the dialog on open, and
  // restore focus to the trigger on close.
  useEffect(() => {
    const prev = document.activeElement
    dialogRef.current?.focus()
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus() }
  }, [onClose])

  const { head, body } = cardHeadBody(card)
  const meta = STATUS_META[card.status] || { label: card.status || 'unknown', color: 'var(--muted)' }
  const fields = cardFields(card)
  const checklist = (card.checklist || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const doneCount = checklist.filter((c) => c.done).length
  const pct = checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0
  const attachments = card.attachments || []

  async function openAttachment(a) {
    setErr('')
    try { const url = await api.attachmentUrl(a.s3_key); if (url) window.open(url, '_blank', 'noopener') }
    catch (e) { setErr(String(e.message || e)) }
  }

  async function run(fn) {
    setBusy(true); setErr('')
    try { await fn(); await onChanged() } catch (e) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  // Duplicate the whole card (same job → a second worker). Copies the briefing,
  // labels and checklist into a new card in the same list; assign the copy with
  // the "Move to" selector or drag-and-drop.
  async function duplicate() {
    setBusy(true); setErr(''); setDupMsg('')
    try {
      await api.duplicateCard(card.id)
      await onChanged()
      setDupMsg('Copy created in this list — use “Move to” or drag it to the second worker.')
    } catch (e) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,46,0.4)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        onClick={(e) => e.stopPropagation()} style={{ width: 820, maxWidth: '100%', background: 'var(--surface)', borderRadius: 16, boxShadow: '0 24px 70px rgba(28,27,46,0.28)', overflow: 'hidden', outline: 'none' }}>
        {/* navy header */}
        <div style={{ height: 64, background: 'linear-gradient(120deg,var(--navy),var(--navy-2))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.16)', borderRadius: 8, padding: '5px 12px', fontSize: 12.5, color: '#fff', fontWeight: 500 }}>{listName}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: meta.color, borderRadius: 20, padding: '3px 10px' }}>{meta.label}</span>
            <button onClick={onClose} className="on-navy" aria-label="Close card" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.16)', color: '#fff', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>✕</button>
          </div>
        </div>

        <div className="card-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px' }}>
          {/* left */}
          <div style={{ padding: '24px 26px', borderRight: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', gap: 13, marginBottom: 22 }}>
              <button type="button" role="checkbox" aria-checked={card.done} aria-label="Mark service completed"
                disabled={!canEdit || busy} onClick={() => run(() => api.toggleDone(card.id, card.done))}
                style={{ marginTop: 2, width: 22, height: 22, flex: 'none', borderRadius: 6, border: `2px solid ${card.done ? 'var(--green)' : 'var(--line)'}`, background: card.done ? 'var(--green)' : '#fff', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, cursor: canEdit ? 'pointer' : 'default', padding: 0 }}>{card.done ? '✓' : ''}</button>
              <h2 id={titleId} style={{ fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 19, lineHeight: 1.35, margin: '2px 0 0', color: 'var(--ink)' }}>
                <strong style={{ fontWeight: 700 }}>{head}</strong>{body}
              </h2>
            </div>

            {/* duplicate (same job → a second worker) */}
            {canEdit && (
              <div style={{ marginBottom: 16 }}>
                <button type="button" onClick={duplicate} disabled={busy} className="h-surface2"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 13px', fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                  <span aria-hidden="true" style={{ fontSize: 14 }}>⧉</span> Duplicate card
                </button>
                {dupMsg && <div style={{ fontSize: 12, color: 'var(--green-ink)', marginTop: 8 }}>{dupMsg}</div>}
              </div>
            )}

            {/* move (keyboard-accessible alternative to drag-and-drop) */}
            {canEdit && Array.isArray(lists) && lists.filter((l) => l.id !== card.list_id).length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <label htmlFor={`move-${card.id}`} style={{ fontSize: 12, color: 'var(--muted)' }}>Move to</label>
                <select id={`move-${card.id}`} value={card.list_id} disabled={busy}
                  onChange={(e) => { const to = e.target.value; if (to !== card.list_id) run(() => api.moveCard(card.id, to, 1_000_000, card.version)) }}
                  style={{ border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 9, padding: '7px 10px', fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer', outline: 'none', maxWidth: 240 }}>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}

            {/* transition actions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
              {allowedTransitions(card.status).length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--faint)' }}>Terminal state.</span>
              ) : allowedTransitions(card.status).map((to) => (
                <button key={to} disabled={busy || !canEdit} onClick={() => run(() => api.transitionCard(card.id, to, card.version))}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: `1px solid ${STATUS_META[to].color}`, color: STATUS_META[to].color, borderRadius: 9, padding: '7px 12px', fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: busy || !canEdit ? 0.5 : 1 }}>
                  → {STATUS_META[to].label}
                </button>
              ))}
            </div>

            {card.labels?.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--faint)', marginBottom: 9 }}>Labels</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {card.labels.map((l) => (
                    <span key={l.key} style={{ fontSize: 12, fontWeight: 500, color: '#fff', background: l.color, borderRadius: 7, padding: '4px 10px' }}>{l.name}</span>
                  ))}
                </div>
              </div>
            )}

            {fields.length > 0 && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 9 }}>Structured description</div>
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '16px 18px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '9px 16px' }}>
                  {fields.map((f) => (
                    <div key={f.k} style={{ display: 'contents' }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--faint)', whiteSpace: 'nowrap', paddingTop: 1 }}>{f.k}</div>
                      <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.35 }}>{f.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* checklist */}
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Checklist</div>
                {checklist.length > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--faint)' }}>{doneCount}/{checklist.length}</span>}
              </div>
              {checklist.length > 0 && (
                <div style={{ height: 6, borderRadius: 20, background: 'var(--surface-2)', overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--green)', borderRadius: 20, transition: 'width 0.2s' }} />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {checklist.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>No checklist items yet.</div>}
                {checklist.map((it) => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13 }}>
                    <button type="button" role="checkbox" aria-checked={it.done} aria-label={`${it.done ? 'Uncheck' : 'Check'}: ${it.text}`}
                      disabled={!canEdit || busy} onClick={() => run(() => api.toggleChecklistItem(card.id, it.id, it.done))}
                      style={{ width: 17, height: 17, flex: 'none', borderRadius: 5, border: `1.5px solid ${it.done ? 'var(--green)' : 'var(--line)'}`, background: it.done ? 'var(--green)' : '#fff', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, cursor: canEdit ? 'pointer' : 'default', padding: 0 }}>{it.done ? '✓' : ''}</button>
                    <span style={{ textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--faint)' : 'var(--ink-2)' }}>{it.text}</span>
                  </div>
                ))}
              </div>
              {canEdit && (
                <input value={item} onChange={(e) => setItem(e.target.value)} aria-label="Add a checklist item"
                  onKeyDown={(e) => { if (e.key === 'Enter' && item.trim()) { const t = item; setItem(''); run(() => api.addChecklistItem(card.id, t)) } }}
                  placeholder="Add an item…" style={{ marginTop: 10, width: '100%', border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 9, padding: '9px 12px', fontFamily: 'var(--sans)', fontSize: 12.5, outline: 'none' }} />
              )}
            </div>

            {/* attachments */}
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Attachments</div>
                {canEdit && (
                  <label style={{ fontSize: 12, color: busy ? 'var(--faint)' : 'var(--navy)', cursor: busy ? 'default' : 'pointer', fontWeight: 600 }}>
                    + Add
                    <input type="file" disabled={busy} style={{ display: 'none' }}
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run(() => api.addAttachment(card.id, f)) }} />
                  </label>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {attachments.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>No attachments.</div>}
                {attachments.map((a) => (
                  <button key={a.id} onClick={() => openAttachment(a)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 11px', cursor: 'pointer', fontFamily: 'var(--sans)' }}>
                    <span style={{ fontSize: 15, flex: 'none' }}>📎</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.filename}</span>
                      <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--faint)' }}>{formatBytes(a.size)}</span>
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--navy)', flex: 'none' }}>Open ↗</span>
                  </button>
                ))}
              </div>
            </div>
            {err && <p style={{ marginTop: 16, fontSize: 12.5, color: 'oklch(0.55 0.19 25)' }}>{err}</p>}
          </div>

          {/* right — comments */}
          <div className="card-modal-right" style={{ padding: '24px 22px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Comments and activity</div>
            <div style={{ display: 'flex', gap: 9, marginBottom: 20 }}>
              <span aria-hidden="true" style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: 'var(--navy)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>ME</span>
              <input value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Write a comment"
                onKeyDown={(e) => { if (e.key === 'Enter' && comment.trim()) { const b = comment; setComment(''); run(() => api.addComment(card.id, b)) } }}
                placeholder="Write a comment…" style={{ flex: 1, minWidth: 0, border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 9, padding: '9px 12px', fontFamily: 'var(--sans)', fontSize: 12.5, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {(card.comments || []).length === 0 && <div style={{ fontSize: 12, color: 'var(--faint)' }}>No activity yet.</div>}
              {(card.comments || []).map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 9 }}>
                  <span style={{ ...avatarStyle(c.author || 'User') }}>{initials(c.author || 'User')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.4 }}><strong style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.author || 'User'}</strong> {c.body}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--faint)', marginTop: 2 }}>{new Date(c.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatBytes(n) {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
