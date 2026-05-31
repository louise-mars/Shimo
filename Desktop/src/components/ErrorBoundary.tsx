import { Component, type ReactNode, type ErrorInfo } from 'react'
import { isSafeModeActive, getSafeModeError } from '@notepro/shared'
import { captureError } from '../lib/sentry'
import { exportAsJSON } from '../lib/exportData'

// ============================================================
// Three-Tier Error Boundary Architecture
// ============================================================
// 1. AppErrorBoundary — wraps entire app, shows Safe Mode UI on fatal error
// 2. PanelErrorBoundary — wraps each panel (sidebar, note list, editor)
// 3. ComponentErrorBoundary — wraps individual components (TagGraph, DailyReview)
//
// Requirements: 29.7
// ============================================================

// === Shared Types ===

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

// === 1. AppErrorBoundary (Top-Level) ===

interface AppErrorBoundaryProps {
  children: ReactNode
}

/**
 * App-level error boundary. Catches unrecoverable errors and displays
 * a Safe Mode UI that only allows JSON data export.
 *
 * Also activates when isSafeModeActive() returns true (e.g., migration failure).
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AppErrorBoundary] Fatal error:', error, errorInfo)
    captureError(error, {
      level: 'fatal',
      boundary: 'app',
      componentStack: errorInfo.componentStack ?? undefined,
    })
  }

  render() {
    // Show Safe Mode if either: a crash occurred OR migration triggered safe mode
    if (this.state.hasError || isSafeModeActive()) {
      const migrationError = getSafeModeError()
      const errorMessage = migrationError || this.state.error?.message || '未知错误'
      return <SafeModeUI errorMessage={errorMessage} />
    }

    return this.props.children
  }
}

// === Safe Mode UI ===

interface SafeModeUIProps {
  errorMessage: string
}

/**
 * Safe Mode UI — displayed when the app encounters a fatal error.
 * Only allows JSON export of user data to prevent data loss.
 */
function SafeModeUI({ errorMessage }: SafeModeUIProps) {
  const handleExport = async () => {
    try {
      // Attempt to load notes directly from IndexedDB for export
      const { idbGet } = await import('@notepro/shared')
      const notes = await idbGet<any[]>('notes')
      if (notes && notes.length > 0) {
        exportAsJSON(notes)
      } else {
        // Try localStorage fallback
        const lsData = localStorage.getItem('shimo-notes')
        if (lsData) {
          const parsed = JSON.parse(lsData)
          const noteArray = Array.isArray(parsed) ? parsed : parsed.notes || []
          exportAsJSON(noteArray)
        } else {
          alert('未找到可导出的笔记数据。')
        }
      }
    } catch (err) {
      console.error('[SafeMode] Export failed:', err)
      alert('导出失败，请尝试手动备份数据。')
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        padding: 40,
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        color: 'var(--text-primary, #1A1208)',
        background: 'var(--bg-primary, #FFFDF8)',
      }}
      role="alert"
      aria-live="assertive"
    >
      <div style={{ fontSize: 56, marginBottom: 20 }}>🛡️</div>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 600,
          marginBottom: 12,
          fontFamily: 'var(--font-serif, serif)',
        }}
      >
        安全模式
      </h1>
      <p
        style={{
          color: 'var(--text-secondary, #7A6248)',
          marginBottom: 8,
          textAlign: 'center',
          maxWidth: 480,
          lineHeight: 1.6,
          fontSize: 14,
        }}
      >
        应用遇到了严重错误，已进入安全模式。为保护您的数据安全，当前仅支持导出笔记。
      </p>
      <p
        style={{
          color: 'var(--text-tertiary, #A89880)',
          marginBottom: 24,
          textAlign: 'center',
          maxWidth: 480,
          fontSize: 13,
        }}
      >
        请导出数据后重新启动应用。如果问题持续存在，请联系支持。
      </p>

      {/* Error details (collapsed by default) */}
      <details
        style={{
          marginBottom: 24,
          maxWidth: 480,
          width: '100%',
        }}
      >
        <summary
          style={{
            fontSize: 12,
            color: 'var(--text-faint, #C4B8A8)',
            cursor: 'pointer',
            marginBottom: 8,
          }}
        >
          查看错误详情
        </summary>
        <pre
          style={{
            fontSize: 11,
            color: 'var(--text-faint, #C4B8A8)',
            background: 'var(--bg-secondary, #F5F0E8)',
            padding: 12,
            borderRadius: 8,
            overflow: 'auto',
            maxHeight: 120,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {errorMessage}
        </pre>
      </details>

      {/* Export button — primary action in Safe Mode */}
      <button
        onClick={handleExport}
        style={{
          padding: '12px 28px',
          background: 'var(--accent, #B5341A)',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 500,
          cursor: 'pointer',
          marginBottom: 12,
        }}
        aria-label="导出所有笔记为 JSON 文件"
      >
        导出笔记数据 (JSON)
      </button>

      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '8px 20px',
          background: 'transparent',
          color: 'var(--text-secondary, #7A6248)',
          border: '1px solid var(--border-medium, #D4C8B8)',
          borderRadius: 8,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        重新启动应用
      </button>
    </div>
  )
}

// === 2. PanelErrorBoundary (Mid-Level) ===

interface PanelErrorBoundaryProps {
  children: ReactNode
  /** Panel name for display and error reporting */
  panelName: string
  /** Optional custom fallback */
  fallback?: ReactNode
}

interface PanelErrorBoundaryState extends ErrorBoundaryState {
  retryCount: number
}

/**
 * Panel-level error boundary. Wraps major UI panels (sidebar, note list, editor).
 * Shows a "panel crashed" message with a retry button.
 * Does not bring down the entire app — other panels remain functional.
 */
export class PanelErrorBoundary extends Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, retryCount: 0 }
  }

  static getDerivedStateFromError(error: Error): Partial<PanelErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[PanelErrorBoundary:${this.props.panelName}] Error:`, error, errorInfo)
    captureError(error, {
      level: 'error',
      boundary: 'panel',
      panel: this.props.panelName,
      componentStack: errorInfo.componentStack ?? undefined,
    })
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      retryCount: prev.retryCount + 1,
    }))
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: 24,
            fontFamily: 'var(--font-sans)',
            color: 'var(--text-primary)',
            background: 'var(--bg-primary)',
          }}
          role="alert"
          aria-live="polite"
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <p
            style={{
              fontSize: 14,
              fontWeight: 500,
              marginBottom: 6,
              textAlign: 'center',
            }}
          >
            {this.props.panelName}面板出现问题
          </p>
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-tertiary)',
              marginBottom: 16,
              textAlign: 'center',
              maxWidth: 240,
            }}
          >
            该面板遇到了错误，其他功能不受影响。
          </p>
          {this.state.error && (
            <pre
              style={{
                fontSize: 11,
                color: 'var(--text-faint)',
                background: 'var(--bg-secondary)',
                padding: 8,
                borderRadius: 6,
                maxWidth: '100%',
                overflow: 'auto',
                marginBottom: 16,
                maxHeight: 60,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleRetry}
            style={{
              padding: '8px 16px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
            }}
            aria-label={`重试加载${this.props.panelName}面板`}
          >
            重试
          </button>
          {this.state.retryCount > 0 && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-faint)',
                marginTop: 8,
              }}
            >
              已重试 {this.state.retryCount} 次
            </span>
          )}
        </div>
      )
    }

    return this.props.children
  }
}

// === 3. ComponentErrorBoundary (Leaf-Level) ===

interface ComponentErrorBoundaryProps {
  children: ReactNode
  /** Component name for display and error reporting */
  componentName: string
  /** Optional custom fallback */
  fallback?: ReactNode
  /** Whether to show error details inline (default: false) */
  showDetails?: boolean
}

/**
 * Component-level error boundary. Wraps individual components like TagGraph,
 * DailyReview, WeeklyReport, etc. Shows a compact inline error with retry.
 * Minimal visual footprint — does not disrupt surrounding layout.
 */
export class ComponentErrorBoundary extends Component<ComponentErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ComponentErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ComponentErrorBoundary:${this.props.componentName}] Error:`, error, errorInfo)
    captureError(error, {
      level: 'warning',
      boundary: 'component',
      component: this.props.componentName,
      componentStack: errorInfo.componentStack ?? undefined,
    })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'var(--bg-secondary)',
            borderRadius: 6,
            border: '1px solid var(--border-light)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-sans)',
          }}
          role="alert"
          aria-live="polite"
        >
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
          <span style={{ flex: 1 }}>
            {this.props.componentName}加载失败
            {this.props.showDetails && this.state.error && (
              <span
                style={{
                  display: 'block',
                  fontSize: 11,
                  color: 'var(--text-faint)',
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 200,
                }}
              >
                {this.state.error.message}
              </span>
            )}
          </span>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '4px 10px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontSize: 11,
              cursor: 'pointer',
              flexShrink: 0,
            }}
            aria-label={`重试加载${this.props.componentName}`}
          >
            重试
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// === Legacy Default Export (backward compatibility) ===

/**
 * @deprecated Use AppErrorBoundary, PanelErrorBoundary, or ComponentErrorBoundary instead.
 * Kept for backward compatibility — behaves as AppErrorBoundary.
 */
interface LegacyProps {
  children: ReactNode
  fallback?: ReactNode
}

export default class ErrorBoundary extends Component<LegacyProps, ErrorBoundaryState> {
  constructor(props: LegacyProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    captureError(error, {
      level: 'fatal',
      boundary: 'legacy',
      componentStack: errorInfo.componentStack ?? undefined,
    })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError || isSafeModeActive()) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const migrationError = getSafeModeError()
      const errorMessage = migrationError || this.state.error?.message || '未知错误'
      return <SafeModeUI errorMessage={errorMessage} />
    }

    return this.props.children
  }
}
