import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { initials, avatarStyle } from '../lib/present.js'
import SectionHeader, { sectionScroll, eyebrow, panel, navyBtn } from './SectionHeader.jsx'

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
const TEAM_GRID = '1.4fr 150px 130px 150px'

export default function Members({ onBack }) {
  const [members, setMembers] = useState(null)
  const [matrix, setMatrix] = useState(null)
  useEffect(() => { api.getMembers().then(setMembers); api.getPermMatrix().then(setMatrix) }, [])

  return (
    <>
      <SectionHeader onBack={onBack} title="Members & Permissions" subtitle="Profiles, regions and access matrix (RBAC)"
        right={<button style={navyBtn} className="h-navy"><span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Invite member</button>} />
      <div style={sectionScroll}>
        {!members || !matrix ? <div style={{ color: 'var(--faint)' }}>Loading…</div> : (
          <div style={{ maxWidth: 1120 }}>
            <div style={eyebrow}>Team ({members.length})</div>
            <div style={{ ...panel, marginBottom: 34 }}>
              <div style={{ display: 'grid', gridTemplateColumns: TEAM_GRID, gap: 16, padding: '13px 22px', borderBottom: '1px solid var(--line)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--faint)' }}>
                <span>Member</span><span>Role</span><span>Region</span><span>Status</span>
              </div>
              {members.map((m) => {
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
              <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(5,1fr)', gap: 10, padding: '13px 22px', borderBottom: '1px solid var(--line)', alignItems: 'center' }}>
                <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--faint)' }}>Module</span>
                {matrix.cols.map((c) => <span key={c} style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', textAlign: 'center' }}>{c}</span>)}
              </div>
              {matrix.rows.map((row) => (
                <div key={row.module} style={{ display: 'grid', gridTemplateColumns: '200px repeat(5,1fr)', gap: 10, padding: '12px 22px', borderBottom: '1px solid var(--line-2)', alignItems: 'center' }}>
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
