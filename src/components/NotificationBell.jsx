import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'

// In-app notification bell: unread badge + dropdown panel, mark one / all read.
// Tolerant of a missing backend (real mode before migration 0009) — shows a
// valid empty state instead of erroring.

const KIND = {
  assignment: { icon: '👤', color: 'var(--navy)' },
  status: { icon: '✓', color: 'var(--green-ink)' },
  comment: { icon: '💬', color: 'var(--navy)' },
  mention: { icon: '@', color: 'var(--navy)' },
  export: { icon: '↓', color: 'var(--green-ink)' },
  integration: { icon: '⚠', color: '#dc2626' },
}
const fallback = { icon: '•', color: 'var(--muted)' }

export default function NotificationBell() {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  async function load() {
    try { setItems(await api.getNotifications()) } catch { setItems([]) }
  }
  useEffect(() => { load() }, [])

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const unread = items.filter((n) => !n.read).length

  async function openPanel() { setOpen((v) => !v); if (!open) load() }
  async function markOne(n) {
    if (n.read) return
    setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
    try { await api.markNotificationRead(n.id) } catch { /* best-effort */ }
  }
  async function markAll() {
    setItems((xs) => xs.map((x) => ({ ...x, read: true })))
    try { await api.markAllNotificationsRead() } catch { /* best-effort */ }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button type="button" onClick={openPanel} className="h-surface2"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} aria-haspopup="true"
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 9, border: '1px solid var(--line)', background: 'none', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 16 }}>
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span aria-hidden="true" style={{ position: 'absolute', top: 3, right: 3, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 10, background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sans)' }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" style={{ position: 'absolute', right: 0, top: 46, width: 360, maxWidth: '90vw', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13, boxShadow: '0 18px 50px rgba(28,27,46,0.22)', zIndex: 60, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontFamily: 'var(--disp)', fontSize: 15, fontWeight: 600 }}>Notifications</span>
            {unread > 0 && <button type="button" onClick={markAll} style={{ background: 'none', border: 'none', color: 'var(--navy)', fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Mark all read</button>}
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {items.length === 0 && <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>You're all caught up.</div>}
            {items.map((n) => {
              const k = KIND[n.kind] || fallback
              return (
                <button key={n.id} type="button" onClick={() => markOne(n)} className="h-surface2"
                  style={{ display: 'flex', gap: 11, width: '100%', textAlign: 'left', background: n.read ? 'none' : 'var(--navy-soft)', border: 'none', borderBottom: '1px solid var(--line-2)', padding: '12px 16px', cursor: 'pointer', fontFamily: 'var(--sans)' }}>
                  <span aria-hidden="true" style={{ width: 26, height: 26, flex: 'none', borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--line)', color: k.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{k.icon}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{n.title}</span>
                      {!n.read && <span aria-label="unread" style={{ width: 7, height: 7, borderRadius: '50%', background: '#dc2626', flex: 'none' }} />}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4, marginTop: 2 }}>{n.body}</span>
                    <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--faint)', marginTop: 3 }}>{relTime(n.created_at)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function relTime(iso) {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const s = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24); if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}
