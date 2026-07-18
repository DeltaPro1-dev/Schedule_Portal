export default function SectionHeader({ title, subtitle, onBack, right }) {
  return (
    <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 34px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
      <button onClick={onBack} className="h-navysoft" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '7px 13px', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', cursor: 'pointer' }}>‹ Boards</button>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{subtitle}</div>}
      </div>
      <div style={{ flex: 1 }} />
      {right}
    </header>
  )
}

export const navyBtn = { display: 'flex', alignItems: 'center', gap: 7, background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 15px', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
export const sectionScroll = { flex: 1, minHeight: 0, overflowY: 'auto', padding: '26px 34px 60px' }
export const eyebrow = { fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--faint)', marginBottom: 12 }
export const panel = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }
export const th = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--faint)' }
