import { useState } from 'react'
import { CloudOff, RefreshCw, AlertCircle, LogOut, X, CheckCircle, Save } from 'lucide-react'
import type { SyncStatus } from '../../lib/useSync'
import type { User } from '@supabase/supabase-js'

interface Props {
  user: User | null
  syncStatus: SyncStatus
  isConfigured: boolean
  onSignIn: () => void
  onSignOut: () => void
  onSync: () => void
}

export default function SyncPanel({ user, syncStatus, isConfigured, onSignIn, onSignOut, onSync }: Props) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(localStorage.getItem('shimo-sb-url') || '')
  const [key, setKey] = useState(localStorage.getItem('shimo-sb-key') || '')
  const [saved, setSaved] = useState(false)

  const statusColor = {
    offline: 'var(--text-tertiary)',
    syncing: 'var(--accent)',
    synced: 'var(--success)',
    error: 'var(--danger)',
  }[syncStatus]

  const StatusDot = () => (
    <span style={{
      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
      background: !isConfigured || !user ? 'var(--text-tertiary)' : statusColor,
      animation: syncStatus === 'syncing' ? 'pulse 1s infinite' : 'none',
    }} />
  )

  const label = user
    ? user.email?.split('@')[0]
    : 'Sync'

  const sublabel = !isConfigured
    ? 'Setup required'
    : !user
    ? 'Not signed in'
    : { offline: 'Offline', syncing: 'Syncing…', synced: 'Synced ✓', error: 'Error' }[syncStatus]

  const handleSaveCredentials = () => {
    localStorage.setItem('shimo-sb-url', url.trim())
    localStorage.setItem('shimo-sb-key', key.trim())
    setSaved(true)
    setTimeout(() => {
      sessionStorage.setItem('shimo-open-auth', '1')
      window.location.reload()
    }, 600)
  }

  // Read from localStorage as fallback (for runtime config without .env)
  const runtimeUrl = localStorage.getItem('shimo-sb-url')
  const runtimeKey = localStorage.getItem('shimo-sb-key')
  const hasRuntimeConfig = !!(runtimeUrl && runtimeKey)

  return (
    <div style={{ position: 'relative' }}>
      {/* Compact trigger — same height as icon buttons */}
      <button onClick={() => setOpen(v => !v)} style={{
        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
        padding: '4px 8px', borderRadius: 7, border: 'none',
        background: open ? 'var(--bg-active)' : 'transparent',
        cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'background 150ms',
      }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = open ? 'var(--bg-active)' : 'transparent' }}
      >
        <StatusDot />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {sublabel}
        </span>
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
            borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 100,
            animation: 'fadeIn 150ms ease-out', overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Cloud Sync</span>
              <button className="icon-btn" onClick={() => setOpen(false)} style={{ width: 22, height: 22 }}><X size={13} /></button>
            </div>

            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* ── Not configured ── */}
              {!isConfigured && !hasRuntimeConfig && (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Enter your Supabase credentials to enable sync:
                  </p>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>
                      Project URL
                    </label>
                    <input
                      value={url} onChange={e => setUrl(e.target.value)}
                      placeholder="https://xxxxxxxxxxxx.supabase.co"
                      style={inputStyle}
                    />
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>
                      Settings → API → Project URL
                    </p>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>
                      Anon Key <span style={{ color: 'var(--success)', fontWeight: 500 }}>(public)</span>
                    </label>
                    <input
                      value={key} onChange={e => setKey(e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                      style={inputStyle}
                    />
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>
                      Settings → API → Project API Keys → <b>anon public</b>
                    </p>
                  </div>
                  <button
                    onClick={handleSaveCredentials}
                    disabled={!url.trim() || !key.trim()}
                    className="new-note-btn"
                    style={{ width: '100%', justifyContent: 'center', padding: '7px', opacity: (!url.trim() || !key.trim()) ? 0.5 : 1 }}
                  >
                    {saved ? <><CheckCircle size={14} /> Saved!</> : <><Save size={14} /> Save & Connect</>}
                  </button>
                </>
              )}

              {/* ── Configured but not signed in ── */}
              {(isConfigured || hasRuntimeConfig) && !user && (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Notes are saved locally. Sign in to sync across devices.
                  </p>
                  <button className="new-note-btn" onClick={() => { onSignIn(); setOpen(false) }}
                    style={{ width: '100%', justifyContent: 'center', padding: '7px' }}>
                    Sign In / Create Account
                  </button>
                  <button onClick={() => {
                    localStorage.removeItem('shimo-sb-url')
                    localStorage.removeItem('shimo-sb-key')
                    setUrl(''); setKey('')
                    window.location.reload()
                  }} style={{ ...linkBtnStyle }}>
                    Change credentials
                  </button>
                </>
              )}

              {/* ── Signed in ── */}
              {user && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{user.email?.[0].toUpperCase()}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</p>
                      <p style={{ fontSize: 11, color: statusColor, display: 'flex', alignItems: 'center', gap: 3 }}>
                        {syncStatus === 'syncing' && <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} />}
                        {syncStatus === 'synced' && <CheckCircle size={10} />}
                        {syncStatus === 'error' && <AlertCircle size={10} />}
                        {syncStatus === 'offline' && <CloudOff size={10} />}
                        {sublabel}
                      </p>
                    </div>
                  </div>

                  {syncStatus === 'error' && (
                    <p style={{ fontSize: 11, color: 'var(--danger)', background: 'rgba(224,122,95,0.08)', padding: '5px 8px', borderRadius: 6 }}>
                      Sync failed. Check your connection.
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { onSync(); setOpen(false) }} style={actionBtnStyle}>
                      <RefreshCw size={12} /> Sync now
                    </button>
                    <button onClick={() => { onSignOut(); setOpen(false) }} style={actionBtnStyle}>
                      <LogOut size={12} /> Sign out
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>
        </>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 9px', border: '1px solid var(--border-medium)',
  borderRadius: 6, fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-primary)',
  outline: 'none', fontFamily: 'var(--font-sans)',
}

const actionBtnStyle: React.CSSProperties = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
  padding: '6px', border: '1px solid var(--border-medium)', borderRadius: 6,
  background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)',
  fontFamily: 'var(--font-sans)',
}

const linkBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer',
  fontSize: 11, fontFamily: 'var(--font-sans)', textAlign: 'left', padding: 0,
}
