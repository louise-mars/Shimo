import { useEffect } from 'react'

interface Props {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ title, message, confirmLabel = '确定', cancelLabel = '取消', danger, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onConfirm, onCancel])

  return (
    <div onClick={onCancel} role="dialog" aria-modal="true" aria-label={title} style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 120ms ease-out',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-elevated)', borderRadius: 12,
        padding: '24px 28px', minWidth: 300, maxWidth: 400,
        boxShadow: 'var(--shadow-lg)', textAlign: 'center',
      }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', marginBottom: 6 }}>
          {title}
        </p>
        {message && (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 20, lineHeight: 1.5 }}>
            {message}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onCancel} aria-label={cancelLabel} style={{
            flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid var(--border-light)',
            background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
            fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}>{cancelLabel}</button>
          <button onClick={onConfirm} aria-label={confirmLabel} style={{
            flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
            background: danger ? 'var(--danger)' : 'var(--accent)', color: 'white',
            fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}