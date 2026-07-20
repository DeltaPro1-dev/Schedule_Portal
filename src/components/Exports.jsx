import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { exportDailyScheduleCsv, exportFullBackupJson } from '../lib/exporters.js'
import SectionHeader, { sectionScroll, eyebrow, panel } from './SectionHeader.jsx'

const JOB_STATUS = {
  completed: { label: 'Completed', color: 'var(--green-ink)', bg: 'var(--green-soft)', dot: 'var(--green)' },
  processing: { label: 'Processing', color: '#2563eb', bg: '#eff4ff', dot: '#2563eb' },
  queued: { label: 'Queued', color: 'oklch(0.5 0.12 90)', bg: 'oklch(0.96 0.05 90)', dot: 'oklch(0.6 0.13 90)' },
  failed: { label: 'Failed', color: '#dc2626', bg: '#fef2f2', dot: '#dc2626' },
}
const JOB_FALLBACK = { label: 'Unknown', color: 'var(--muted)', bg: 'var(--surface-2)', dot: 'var(--faint)' }
const FMT_COLOR = { CSV: 'var(--green-ink)', XLSX: 'var(--green-ink)', PDF: '#dc2626', JSON: 'var(--navy)' }
const GRID = '1fr 120px 150px 130px 90px'

// Instant client-side exports; XLSX/PDF wait on the async export worker.
const RUNNERS = { CSV: exportDailyScheduleCsv, JSON: exportFullBackupJson }

export default function Exports({ onBack }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  function load() { api.getExports().then(setData) }
  useEffect(() => { load() }, [])

  async function runExport(ext) {
    const runner = RUNNERS[ext]
    if (!runner) return
    setBusy(ext); setErr(''); setMsg('')
    try {
      const job = await runner(api)                     // builds + downloads the file
      try { await api.logExport(job) } catch { /* logging is best-effort */ }
      setMsg(`${ext} export downloaded${job.row_count != null ? ` · ${job.row_count} rows` : ''}.`)
      load()
    } catch (e) { setErr(String(e.message || e)) } finally { setBusy('') }
  }

  return (
    <>
      <SectionHeader onBack={onBack} title="Export Center" subtitle="CSV/JSON download now · XLSX/PDF via worker · fully audited" />
      <div className="section-scroll" style={sectionScroll}>
        {!data ? <div style={{ color: 'var(--faint)' }}>Loading…</div> : (
          <div style={{ maxWidth: 1000 }}>
            <div style={eyebrow}>New export</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              {data.formats.map((f) => {
                const ready = !!RUNNERS[f.ext]
                const running = busy === f.ext
                return (
                  <button key={f.ext} className="h-card" disabled={!ready || running} onClick={() => runExport(f.ext)}
                    title={ready ? `Download ${f.name} as ${f.ext}` : 'Available once the export worker is deployed'}
                    style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '15px 18px', cursor: ready ? 'pointer' : 'not-allowed', opacity: ready ? 1 : 0.55, fontFamily: 'var(--sans)', minWidth: 190, textAlign: 'left' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: f.color, borderRadius: 6, padding: '4px 8px', fontFamily: 'var(--mono)' }}>{f.ext}</span>
                    <span><span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{f.name}</span><span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{running ? 'Generating…' : ready ? f.hint : 'via worker (deploy pending)'}</span></span>
                  </button>
                )
              })}
            </div>
            {msg && <div style={{ fontSize: 12.5, color: 'var(--green-ink)', marginBottom: 22 }}>{msg}</div>}
            {err && <div style={{ fontSize: 12.5, color: '#dc2626', marginBottom: 22 }}>{err}</div>}
            {!msg && !err && <div style={{ marginBottom: 22 }} />}
            <div style={eyebrow}>Recent exports</div>
            <div style={panel}>
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, padding: '13px 20px', borderBottom: '1px solid var(--line)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--faint)' }}>
                <span>Report</span><span>Format</span><span>Requested by</span><span>Status</span><span />
              </div>
              {data.jobs.map((j, i) => {
                const st = JOB_STATUS[j.status] || JOB_FALLBACK
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, padding: '15px 20px', borderBottom: '1px solid var(--line-2)', alignItems: 'center' }}>
                    <div><div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{j.name}</div><div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)', marginTop: 2 }}>{j.when} · {j.rows}</div></div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: FMT_COLOR[j.fmt], borderRadius: 6, padding: '3px 8px', fontFamily: 'var(--mono)', width: 'fit-content' }}>{j.fmt}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{j.by}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: st.color, background: st.bg, borderRadius: 20, padding: '4px 10px', width: 'fit-content' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: st.dot }} />{st.label}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 500, color: j.status === 'completed' ? 'var(--navy)' : 'var(--faint)', cursor: j.status === 'completed' ? 'pointer' : 'default' }}>{j.status === 'completed' ? 'Download' : '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
