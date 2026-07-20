import NotificationBell from './NotificationBell.jsx'

const NAV = [
  { key: 'gallery', label: 'Boards' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'roster', label: 'Employees' },
  { key: 'members', label: 'Members' },
  { key: 'exports', label: 'Exports' },
  { key: 'audit', label: 'Audit' },
  { key: 'integration', label: 'Integration' },
]

export default function TopNav({ view, onNavigate, onLogout, demo }) {
  return (
    <header className="topnav" style={{
      flex: 'none', display: 'flex', alignItems: 'center', gap: 14,
      padding: '16px 34px', background: 'var(--surface)', borderBottom: '1px solid var(--line)',
    }}>
      <img src="/logo-horizontal.png" alt="Delta Pro Clean" style={{ height: 34, width: 'auto', objectFit: 'contain' }} />
      {demo && <span style={{ marginLeft: 6, background: 'var(--green-soft)', color: 'var(--green-ink)', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>demo · mock data</span>}
      <div style={{ flex: 1 }} />
      <nav aria-label="Primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {NAV.map((t) => {
          const active = view === t.key || (t.key === 'gallery' && view === 'board')
          return (
            <button key={t.key} onClick={() => onNavigate(t.key)} className="h-surface2" aria-current={active ? 'page' : undefined}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 9,
                padding: '8px 14px', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', border: '1px solid transparent',
                background: active ? 'var(--navy-soft)' : 'none',
                color: active ? 'var(--navy)' : 'var(--muted)',
              }}>
              {t.label}
            </button>
          )
        })}
        <NotificationBell />
        <button onClick={onLogout} className="h-surface2"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 14px', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, color: 'var(--muted)', cursor: 'pointer', marginLeft: 4 }}>
          Sign out
        </button>
      </nav>
    </header>
  )
}
