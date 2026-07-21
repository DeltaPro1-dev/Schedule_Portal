import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { initials, avatarStyle } from '../lib/present.js'
import SectionHeader, { sectionScroll, eyebrow, panel, navyBtn } from './SectionHeader.jsx'

const INVITE_ROLES = [['coordinator', 'Coordinator'], ['supervisor', 'Supervisor'], ['operator', 'Operator'], ['finance', 'Finance'], ['viewer', 'Read only'], ['admin', 'Admin']]
const INVITE_REGIONS = [['all', 'All regions'], ['north', 'North'], ['south', 'South'], ['st_george', 'St George'], ['another', 'Another State']]
const inp = { border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 9, padding: '9px 11px', fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink-2)', outline: 'none' }

const ROLE = {
  admin: { label: 'Admin', color: '#fff', bg: 'var(--navy-2, #1c1b2e)' },
  coordinator: { label: 'Coordinator', color: '#fff', bg: 'var(--navy)' },
  supervisor: { label: 'Supervisor', color: '#fff', bg: 'oklch(0.52 0.1 200)' },
  operator: { label: 'Operator', color: '#fff', bg: 'var(--green-ink)' },
  finance: { label: 'Finance', color: '#fff', bg: 'oklch(0.5 0.15 300)' },
  read: { label: 'Read only', color: '#fff', bg: 'var(--muted)' },
  viewer: { label: 'Read only', color: '#fff', bg: 'var(--muted)' },
}
const ROLE_FALLBACK = { label: 'Member', color: '#fff', bg: 'var(--muted)' }
const CELL = {
  full: { c: 'var(--green-ink)', b: 'var(--green-soft)' },
  region: { c: 'var(--navy)', b: 'var(--navy-soft)' },
  own: { c: 'oklch(0.5 0.09 200)', b: 'oklch(0.95 0.03 200)' },
  view: { c: 'var(--muted)', b: 'var(--surface-2)' },
  none: { c: 'var(--faint)', b: 'transparent' },
}
const TEAM_GRID = 'minmax(190px,1.4fr) 150px 130px 150px'

export default function Members({ onBack, canEdit }) {
  const [members, setMembers] = useState(null)
  const [matrix, setMatrix] = useState(null)
  const [search, setSearch] = useState('')
  const [inviting, setInviting] = useState(false)
  const [form, setForm] = useState({ email: '', role: 'supervisor', region: 'all' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  function loadMembers() { api.getMembers().then(setMembers) }
  useEffect(() => { loadMembers(); api.getPermMatrix().then(setMatrix) }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members || []
    return (members || []).filter((m) => `${m.name} ${m.email} ${m.role} ${m.region}`.toLowerCase().includes(q))
  }, [members, search])

  async function invite() {
    const email = form.email.trim()
    if (!email) return
    setBusy(true); setErr('')
    try {
      await api.inviteMember({ email, role: form.role, region: form.region })
      setForm({ email: '', role: 'supervisor', region: 'all' }); setInviting(false)
      loadMembers()
    } catch (e) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  return (
    <>
      <SectionHeader onBack={onBack} title="Members & Permissions" subtitle="Profiles, regions and access matrix (RBAC)"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', width: 220 }}>
              <span aria-hidden="true" style={{ color: 'var(--faint)' }}>⌕</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search member…" aria-label="Search member"
                style={{ border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink)', width: '100%' }} />
            </div>
            {canEdit && <button onClick={() => setInviting((v) => !v)} style={navyBtn} className="h-navy"><span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Invite member</button>}
          </div>
        } />
      <div className="section-scroll" style={sectionScroll}>
        {!members || !matrix ? <div style={{ color: 'var(--faint)' }}>Loading…</div> : (
          <div style={{ maxWidth: 1120 }}>
            {inviting && (
              <div style={{ ...panel, padding: '16px 18px', marginBottom: 20 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>Invite a member</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input autoFocus type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') invite() }} placeholder="email@deltaproclean.com" aria-label="Invite email"
                    style={{ ...inp, flex: 1, minWidth: 220 }} />
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} aria-label="Role" style={{ ...inp, cursor: 'pointer' }}>
                    {INVITE_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} aria-label="Region" style={{ ...inp, cursor: 'pointer' }}>
                    {INVITE_REGIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <button onClick={invite} disabled={busy} style={{ ...navyBtn, opacity: busy ? 0.6 : 1 }} className="h-navy">{busy ? 'Inviting…' : 'Send invite'}</button>
                  <button onClick={() => { setInviting(false); setErr('') }} style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 13px', fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>Cancel</button>
                </div>
                {err && <div style={{ fontSize: 12.5, color: '#dc2626', marginTop: 10 }}>{err}</div>}
                <div style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 10 }}>The person claims the invite on first login (email/password in Supabase Auth). Access level is derived from the role.</div>
              </div>
            )}
            <div style={eyebrow}>Team ({filtered.length}{filtered.length !== members.length ? ` of ${members.length}` : ''})</div>
            <div style={{ ...panel, marginBottom: 34 }}>
              <div style={{ display: 'grid', gridTemplateColumns: TEAM_GRID, gap: 16, padding: '13px 22px', borderBottom: '1px solid var(--line)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--faint)' }}>
                <span>Member</span><span>Role</span><span>Region</span><span>Status</span>
              </div>
              {filtered.map((m) => {
                const role = ROLE[m.role] || ROLE_FALLBACK
                const pending = m.status !== 'active'
                return (
                  <div key={m.id} style={{ display: 'grid', gridTemplateColumns: TEAM_GRID, gap: 16, padding: '14px 22px', borderBottom: '1px solid var(--line-2)', alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                      <span style={pending ? { ...avatarStyle('mail'), background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--line)' } : avatarStyle(m.name)}>{pending ? '✉' : initials(m.name)}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pending ? m.email : m.name}</span>
                        <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)' }}>{pending ? 'pending invite' : m.email}</span>
                      </span>
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: role.color, background: role.bg, borderRadius: 7, padding: '4px 10px' }}>{role.label}</span>
                      {m.worker && (
                        <span title={`Assigned scope: only ${m.worker}'s list`}
                          style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--faint)', marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>⛓ {m.worker}</span>
                      )}
                    </span>
                    <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{m.region}</span>
                    <span><span style={{ fontSize: 12, fontWeight: 500, color: pending ? 'oklch(0.5 0.12 90)' : 'var(--green-ink)', background: pending ? 'oklch(0.96 0.05 90)' : 'var(--green-soft)', borderRadius: 20, padding: '4px 11px' }}>{pending ? 'Pending invite' : 'Active'}</span></span>
                  </div>
                )
              })}
            </div>

            <div style={eyebrow}>Permissions matrix · role × module</div>
            <div style={panel}>
              <div style={{ display: 'grid', gridTemplateColumns: '160px repeat(5, minmax(64px,1fr))', gap: 10, padding: '13px 22px', borderBottom: '1px solid var(--line)', alignItems: 'center' }}>
                <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--faint)' }}>Module</span>
                {matrix.cols.map((c) => <span key={c} style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', textAlign: 'center' }}>{c}</span>)}
              </div>
              {matrix.rows.map((row) => (
                <div key={row.module} style={{ display: 'grid', gridTemplateColumns: '160px repeat(5, minmax(64px,1fr))', gap: 10, padding: '12px 22px', borderBottom: '1px solid var(--line-2)', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{row.module}</span>
                  {row.cells.map((cell, i) => {
                    const s = CELL[cell.kind]
                    return <span key={i} style={{ textAlign: 'center', fontSize: 12, fontWeight: 500, color: s.c, background: s.b, borderRadius: 7, padding: '6px 0' }}>{cell.label}</span>
                  })}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
              <span>Full = create/edit/delete</span><span>Region = own region only</span><span>Own = only assigned items</span><span>View = read only</span>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
