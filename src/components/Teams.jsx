import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { initials, avatarStyle, REGION_LABEL } from '../lib/present.js'
import SectionHeader, { sectionScroll, eyebrow, panel, navyBtn } from './SectionHeader.jsx'

// Teams (§20 screen 12). CRUD on teams/team_members (migration 0011). In real
// mode before 0011 is applied the API errors → we show an honest banner +
// empty state instead of breaking.

export default function Teams({ onBack, canEdit }) {
  const [teams, setTeams] = useState(null)
  const [roster, setRoster] = useState([])
  const [missing, setMissing] = useState(false)
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', region: '' })
  const [pickFor, setPickFor] = useState(null)   // team id whose member-picker is open

  async function load() {
    try { setTeams(await api.getTeams()); setMissing(false) }
    catch { setTeams([]); setMissing(true) }
  }
  useEffect(() => { load(); api.getRoster().then((r) => setRoster(r.filter((w) => w.kind === 'employee'))).catch(() => {}) }, [])

  async function run(fn) {
    setErr('')
    try { await fn(); await load() } catch (e) { setErr(String(e.message || e)) }
  }
  async function submitAdd() {
    const name = draft.name.trim()
    if (!name) return
    setAdding(false); setDraft({ name: '', region: '' })
    await run(() => api.addTeam({ name, region: draft.region || null }))
  }

  return (
    <>
      <SectionHeader onBack={onBack} title="Teams" subtitle="Crews of workers · used for allocation and workload"
        right={canEdit && !missing ? <button onClick={() => setAdding(true)} className="h-navy" style={navyBtn}><span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Team</button> : null} />
      <div className="section-scroll" style={sectionScroll}>
        {missing && (
          <div style={{ maxWidth: 760, background: 'oklch(0.96 0.05 90)', border: '1px solid oklch(0.88 0.08 90)', borderRadius: 12, padding: '13px 16px', fontSize: 12.5, color: 'oklch(0.42 0.1 90)', marginBottom: 20 }}>
            The teams tables are not deployed yet — apply <code style={{ fontFamily: 'var(--mono)' }}>supabase/migrations/0011_teams.sql</code> to enable this screen (see SETUP.md).
          </div>
        )}
        {err && <div style={{ fontSize: 12.5, color: '#dc2626', marginBottom: 12 }}>{err}</div>}
        {!teams ? <div style={{ color: 'var(--faint)' }}>Loading…</div> : (
          <div style={{ maxWidth: 900 }}>
            {adding && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Team name *" aria-label="Team name"
                  onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') setAdding(false) }}
                  style={{ flex: 1, minWidth: 180, border: '1px solid var(--navy)', background: '#fff', borderRadius: 9, padding: '9px 12px', fontFamily: 'var(--sans)', fontSize: 13, outline: 'none' }} />
                <select value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })} aria-label="Team region"
                  style={{ border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 9, padding: '9px 11px', fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer', outline: 'none' }}>
                  <option value="">No region</option>
                  {Object.entries(REGION_LABEL).filter(([k]) => k !== 'all').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <button onClick={submitAdd} style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 15px', fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Add team</button>
                <button onClick={() => setAdding(false)} style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 12px', fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
              </div>
            )}
            <div style={eyebrow}>Teams ({teams.length})</div>
            {teams.length === 0 && !missing && (
              <div style={{ ...panel, padding: '32px 20px', textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>No teams yet{canEdit ? ' — create the first crew.' : '.'}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {teams.map((t) => (
                <div key={t.id} style={{ ...panel, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span style={{ fontFamily: 'var(--disp)', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{t.name}</span>
                    {t.region && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--navy)', background: 'var(--navy-soft)', borderRadius: 20, padding: '2px 9px' }}>{REGION_LABEL[t.region] || t.region}</span>}
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)' }}>{t.members.length} member{t.members.length === 1 ? '' : 's'}</span>
                    <span style={{ flex: 1 }} />
                    {canEdit && (
                      <button type="button" onClick={() => run(() => api.removeTeam(t.id))} aria-label={`Archive team ${t.name}`}
                        className="h-surface2" style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '5px 10px', fontFamily: 'var(--sans)', fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer' }}>Archive</button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    {t.members.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>No members yet.</span>}
                    {t.members.map((m) => (
                      <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 20, padding: '4px 6px 4px 5px' }}>
                        <span aria-hidden="true" style={{ ...avatarStyle(m.worker.name), width: 22, height: 22, fontSize: 9 }}>{initials(m.worker.name)}</span>
                        <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{m.worker.name}</span>
                        {canEdit && (
                          <button type="button" onClick={() => run(() => api.removeTeamMember(m.id))} aria-label={`Remove ${m.worker.name} from ${t.name}`}
                            className="h-surface2" style={{ width: 17, height: 17, borderRadius: '50%', border: 'none', background: 'var(--surface)', color: 'var(--faint)', cursor: 'pointer', fontSize: 10, lineHeight: 1 }}>✕</button>
                        )}
                      </span>
                    ))}
                    {canEdit && (
                      pickFor === t.id ? (
                        <select autoFocus aria-label={`Add member to ${t.name}`} defaultValue=""
                          onChange={(e) => { const wid = e.target.value; setPickFor(null); if (wid) run(() => api.addTeamMember(t.id, wid)) }}
                          onBlur={() => setPickFor(null)}
                          style={{ border: '1px solid var(--navy)', background: '#fff', borderRadius: 20, padding: '5px 10px', fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--ink-2)', outline: 'none', maxWidth: 220 }}>
                          <option value="" disabled>Pick a worker…</option>
                          {roster.filter((w) => !t.members.some((m) => m.worker.id === w.id)).slice(0, 60).map((w) => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                      ) : (
                        <button type="button" onClick={() => setPickFor(t.id)}
                          className="h-line2" style={{ background: 'none', border: '1.5px dashed var(--line)', borderRadius: 20, padding: '4px 12px', fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>+ Add member</button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
