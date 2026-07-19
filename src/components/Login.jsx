import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { demoMode } from '../lib/api.js'

const inputStyle = {
  width: '100%', border: '1px solid var(--line)', background: 'var(--surface-2)',
  borderRadius: 10, padding: '12px 14px', fontFamily: 'var(--sans)', fontSize: 14,
  outline: 'none', marginBottom: 16,
}
const primaryBtn = {
  width: '100%', background: 'var(--navy)', color: '#fff', border: 'none',
  borderRadius: 10, padding: 13, fontFamily: 'var(--sans)', fontSize: 14,
  fontWeight: 600, cursor: 'pointer', marginBottom: 16,
}

export default function Login({ onEnter }) {
  const [mode, setMode] = useState('login') // login | recover | sent
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')

  async function doLogin() {
    setError('')
    if (demoMode) return onEnter({ email: email || 'demo@deltaproclean.com' })
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
    if (error) setError(error.message)
    else supabase.rpc('audit_login')   // fire-and-forget LOGIN audit (real mode)
  }
  async function doRecover() {
    setError('')
    if (!demoMode) await supabase.auth.resetPasswordForEmail(email)
    setMode('sent')
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      {/* brand panel */}
      <div style={{
        flex: 'none', width: '44%', maxWidth: 620,
        background: 'linear-gradient(150deg,var(--navy),var(--navy-2))', color: '#fff',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '52px 56px',
      }}>
        <img src="/logo-horizontal-white.png" alt="Delta Pro Clean — With Us You Shine!"
          style={{ height: 64, width: 'auto', maxWidth: '100%', objectFit: 'contain', alignSelf: 'flex-start' }} />
        <div>
          <h1 style={{ fontFamily: 'var(--disp)', fontSize: 40, fontWeight: 600, lineHeight: 1.1, margin: '0 0 20px', letterSpacing: '-0.02em' }}>Operational Portal</h1>
          <p style={{ fontSize: 16, lineHeight: 1.55, opacity: 0.82, maxWidth: '38ch', margin: 0 }}>
            Daily scheduling, team allocation and work orders — all in one board, with a complete audit trail.
          </p>
          <div style={{ display: 'flex', gap: 26, marginTop: 38 }}>
            {[['200+', 'workers/day'], ['3', 'regions'], ['14', 'active boards']].map(([v, l]) => (
              <div key={l}>
                <div style={{ fontFamily: 'var(--disp)', fontSize: 28, fontWeight: 600 }}>{v}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.55 }}>© 2026 Delta Pro Clean · Secure environment</div>
      </div>

      {/* form panel */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ width: 380, maxWidth: '100%' }}>
          {mode === 'login' && (
            <>
              <h2 style={{ fontFamily: 'var(--disp)', fontSize: 26, fontWeight: 600, margin: '0 0 6px', letterSpacing: '-0.01em' }}>Sign in</h2>
              <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 28px' }}>
                {demoMode ? 'Demo mode — click sign in to explore with mock data.' : 'Use your Delta credentials to access the portal.'}
              </p>
              <label style={labelStyle}>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@deltaproclean.com" style={inputStyle} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-2)' }}>Password</label>
                <span onClick={() => setMode('recover')} style={{ fontSize: 12, color: 'var(--navy)', cursor: 'pointer', fontWeight: 500 }}>Forgot my password</span>
              </div>
              <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
              {error && <div style={errorBox}>{error}</div>}
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink-2)', margin: '6px 0 22px', cursor: 'pointer' }}>
                <input type="checkbox" checked={remember} onChange={() => setRemember(!remember)} />
                Keep me signed in on this device
              </label>
              <button onClick={doLogin} className="h-navy" style={primaryBtn}>Sign in to the portal</button>
              <div style={{ fontSize: 11.5, color: 'var(--faint)', textAlign: 'center', lineHeight: 1.5 }}>
                Protected by two-factor authentication.<br />Access recorded in the audit log.
              </div>
            </>
          )}
          {mode === 'recover' && (
            <>
              <h2 style={{ fontFamily: 'var(--disp)', fontSize: 26, fontWeight: 600, margin: '0 0 6px', letterSpacing: '-0.01em' }}>Recover access</h2>
              <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 28px' }}>We'll send a reset link to your corporate email.</p>
              <label style={labelStyle}>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@deltaproclean.com" style={{ ...inputStyle, marginBottom: 18 }} />
              <button onClick={doRecover} className="h-navy" style={primaryBtn}>Send reset link</button>
              <button onClick={() => setMode('login')} style={{ width: '100%', background: 'none', color: 'var(--ink-2)', border: 'none', padding: 6, fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>‹ Back to sign in</button>
            </>
          )}
          {mode === 'sent' && (
            <>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--green-soft)', color: 'var(--green-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, fontSize: 22 }}>✉</div>
              <h2 style={{ fontFamily: 'var(--disp)', fontSize: 24, fontWeight: 600, margin: '0 0 8px', letterSpacing: '-0.01em' }}>Link sent</h2>
              <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 26px', lineHeight: 1.5 }}>If {email || 'your email'} is registered, you'll receive a reset link shortly.</p>
              <button onClick={() => setMode('login')} className="h-navy" style={{ ...primaryBtn, marginBottom: 0 }}>Back to sign in</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 6 }
const errorBox = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'oklch(0.55 0.19 25)', background: 'oklch(0.96 0.04 25)', border: '1px solid oklch(0.88 0.07 25)', borderRadius: 9, padding: '9px 12px', marginBottom: 16 }
