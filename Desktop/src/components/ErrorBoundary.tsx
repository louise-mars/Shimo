import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
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
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          padding: 20,
          fontFamily: 'var(--font-sans)',
          color: 'var(--text-primary)',
        }}>
          <div style={{
            fontSize: 48,
            marginBottom: 16,
          }}>
            ⚠️
          </div>
          <h1 style={{
            fontSize: 20,
            fontWeight: 600,
            marginBottom: 8,
            fontFamily: 'var(--font-serif)',
          }}>
            出现了一些问题
          </h1>
          <p style={{
            color: 'var(--text-tertiary)',
            marginBottom: 24,
            textAlign: 'center',
            maxWidth: 400,
          }}>
            应用程序遇到了意外错误。请尝试刷新页面或重新启动应用。
          </p>
          {this.state.error && (
            <pre style={{
              fontSize: 12,
              color: 'var(--text-faint)',
              background: 'var(--bg-secondary)',
              padding: 12,
              borderRadius: 8,
              maxWidth: '100%',
              overflow: 'auto',
              marginBottom: 24,
            }}>
              {this.state.error.message}
            </pre>
          )}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: '10px 20px',
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              重试
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 8,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              刷新页面
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}