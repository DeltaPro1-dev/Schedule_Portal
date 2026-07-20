import { useEffect, useState } from 'react'
import { api, demoMode } from '../lib/api.js'
import { REGION_LABEL } from '../lib/present.js'
import { NOTIFICATION_KINDS, getMutedKinds, setKindMuted } from '../lib/prefs.js'
import SectionHeader, { sectionScroll, eyebrow, panel } from './SectionHeader.jsx'

// Settings (§20 screen 16 — the last of the 16). Honest surfaces only:
// session profile, organization (read-only — no org-update policy exists),
// WORKING in-app notification preferences (localStorage, consumed by the bell),
// the label catalog (read-only; label editing is backlog) and the governance/
// retention policies that actually ship in the migrations.

export default function Settings({ onBack, membership }) {
  const [org, setOrg] = useState(null)
  const [labels, setLabels] = useState([])
  const [muted, setMuted] = useState(() => getMutedKinds())

  useEffect(() => {
    api.getOrganization().then(setOrg).catch(() => setOrg({ name: '—' }))
    api.getLabels().then(setLabels).catch(() => setLabels([]))
  }, [])

  const me = demoMode
    ? { email: 'demo@deltaproclean.com', role: 'admin', region: 'all', access: 'admin', worker: null }
    : membership || {}

  function toggle(kind) {
    const isMuted = muted.has(kind)
    setMuted(new Set(setKindMuted(kind, !isMuted)))
  }

  return (
    <>
      <SectionHeader onBack={onBack} title="Settings" subtitle="Session, organization, notification preferences and governance" />
      <div className="section-scroll" style={sectionScroll}>
        <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 30 }}>

          {/* profile */}
          <section>
            <div style={eyebrow}>My session</div>
            <div style={{ ...panel, padding: '16px 20px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 18px' }}>
              <Field k="Email" v={me.email || me.invited_email || '—'} />
              <Field k="Role" v={me.role || '—'} cap />
              <Field k="Region" v={REGION_LABEL[me.region] || me.region || '—'} />
              <Field k="Access level" v={me.access || '—'} cap />
              {me.worker && <Field k="Linked worker" v={me.worker} mono />}
              <Field k="Mode" v={demoMode ? 'Demo (mock data, nothing persisted)' : 'Live (Supabase)'} />
            </div>
          </section>

          {/* organization */}
          <section>
            <div style={eyebrow}>Organization</div>
            <div style={{ ...panel, padding: '16px 20px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 18px' }}>
              <Field k="Name" v={org ? org.name : 'Loading…'} />
              {org?.slug && <Field k="Slug" v={org.slug} mono />}
              <Field k="Data isolation" v="Schema schedule_portal — shared Supabase project, never touches public.*" />
            </div>
            <p style={note}>Organization details are read-only here — renaming requires a database change by an admin.</p>
          </section>

          {/* notification prefs */}
          <section>
            <div style={eyebrow}>In-app notifications</div>
            <div style={panel}>
              {NOTIFICATION_KINDS.map((n, i) => {
                const on = !muted.has(n.kind)
                return (
                  <div key={n.kind} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < NOTIFICATION_KINDS.length - 1 ? '1px solid var(--line-2)' : 'none' }}>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{n.label}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{n.hint}</span>
                    </span>
                    <button type="button" role="switch" aria-checked={on} aria-label={`${n.label} notifications`}
                      onClick={() => toggle(n.kind)}
                      style={{ position: 'relative', width: 40, height: 22, flex: 'none', borderRadius: 20, border: 'none', cursor: 'pointer', background: on ? 'var(--green)' : 'var(--line)', transition: 'background .15s' }}>
                      <span aria-hidden="true" style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left .15s' }} />
                    </button>
                  </div>
                )
              })}
            </div>
            <p style={note}>
              Muted kinds are hidden from your notification bell. Preferences are stored in this
              browser (per-device MVP); e-mail, push and Teams/Slack channels are future phases.
            </p>
          </section>

          {/* labels */}
          <section>
            <div style={eyebrow}>Label catalog ({labels.length})</div>
            <div style={{ ...panel, padding: '14px 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {labels.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>No labels found.</span>}
              {labels.map((l) => (
                <span key={l.key} title={`${l.kind}`} style={{ fontSize: 12, fontWeight: 500, color: '#fff', background: l.color, borderRadius: 7, padding: '4px 10px' }}>{l.name}</span>
              ))}
            </div>
            <p style={note}>Labels are seeded by the contract (15) and used on cards. Editing the catalog from here is backlog.</p>
          </section>

          {/* governance */}
          <section>
            <div style={eyebrow}>Data & governance</div>
            <div style={{ ...panel, padding: '16px 20px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 18px' }}>
              <Field k="Audit log" v="Immutable, RPC-only writes · retention ≥ 2 years (prune_audit enforces a 730-day floor)" />
              <Field k="Notifications" v="Produced server-side only (triggers) · read notifications pruned after 90 days by default" />
              <Field k="Deletes" v="Soft delete (deleted_at) on workers, clients, cards, boards, teams · hard delete is admin-only" />
              <Field k="Attachments" v="Private bucket, 1-hour signed URLs · read = member, upload = editor, delete = admin" />
              <Field k="Exports" v="Every export is logged (who, what, format, row count) · large exports via async worker" />
            </div>
            <p style={note}>These policies live in the migrations (see SETUP.md / DEPLOY.md) — this panel documents them, it does not toggle them.</p>
          </section>

        </div>
      </div>
    </>
  )
}

function Field({ k, v, mono, cap }) {
  return (
    <>
      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--faint)', whiteSpace: 'nowrap', paddingTop: 2 }}>{k}</span>
      <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45, fontFamily: mono ? 'var(--mono)' : 'var(--sans)', textTransform: cap ? 'capitalize' : 'none', minWidth: 0, overflowWrap: 'anywhere' }}>{v}</span>
    </>
  )
}

const note = { fontSize: 11.5, color: 'var(--faint)', marginTop: 10, lineHeight: 1.5 }
