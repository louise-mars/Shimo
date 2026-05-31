import { useState, useRef, useCallback, useEffect } from 'react'

interface Props {
  onText: (text: string) => void
  disabled?: boolean
}

type VoiceState = 'idle' | 'listening' | 'permission_denied' | 'network_error' | 'timeout_error' | 'unavailable'

/**
 * 桌面版语音输入按钮
 * 使用 Web Speech API（浏览器内置，zh-CN 连续识别）
 *
 * 功能：
 * - 麦克风按钮 + 录音状态指示器（脉冲动画）
 * - 连续中文语音识别 (lang='zh-CN', continuous=true)
 * - 实时中间结果显示（灰色气泡）
 * - 最终文本通过 onText 回调插入编辑器光标位置
 * - 10 秒静默超时自动停止
 * - 网络错误友好提示
 * - 麦克风权限检查 (navigator.permissions.query + try-catch on start)
 *
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7
 */
export default function VoiceInput({ onText, disabled }: Props) {
  const [state, setState] = useState<VoiceState>('idle')
  const [interim, setInterim] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const recRef = useRef<any>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const stateRef = useRef<VoiceState>('idle')

  // Keep stateRef in sync for use in callbacks
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Silence timeout duration (10 seconds) — Requirement 20.6
  const SILENCE_TIMEOUT_MS = 10_000

  // Check if Web Speech API is available — Requirement 20.1, 20.5
  const SpeechRecognitionClass = (window as globalThis.Window & { SpeechRecognition?: any; webkitSpeechRecognition?: any }).SpeechRecognition
    || (window as globalThis.Window & { webkitSpeechRecognition?: any }).webkitSpeechRecognition
  const hasWebSpeech = !!SpeechRecognitionClass

  // Check microphone permission on mount — Requirement 20.5
  useEffect(() => {
    if (!hasWebSpeech) {
      setState('unavailable')
      return
    }

    // Use Permissions API to check microphone state proactively
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'microphone' as PermissionName }).then((result) => {
        if (result.state === 'denied') {
          setState('permission_denied')
          setErrorMessage('麦克风权限被拒绝，请在浏览器设置中允许麦克风访问')
        }
        // Listen for permission state changes
        const handleChange = () => {
          if (result.state === 'denied') {
            setState('permission_denied')
            setErrorMessage('麦克风权限被拒绝，请在浏览器设置中允许麦克风访问')
            stopListening()
          } else if (result.state === 'granted' && stateRef.current === 'permission_denied') {
            setState('idle')
            setErrorMessage('')
          }
        }
        result.addEventListener('change', handleChange)
      }).catch(() => {
        // Permissions API not supported for microphone — will check on first use via try-catch
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recRef.current) {
        try { recRef.current.abort() } catch { /* ignore */ }
        recRef.current = null
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
      }
    }
  }, [])

  /** Reset the 10s silence timeout — Requirement 20.6 */
  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
    }
    silenceTimerRef.current = setTimeout(() => {
      // 10 seconds of silence — auto-stop and show timeout message
      if (recRef.current) {
        try { recRef.current.stop() } catch { /* ignore */ }
        recRef.current = null
      }
      setState('timeout_error')
      setErrorMessage('语音服务无响应，请检查网络连接后重试')
      setInterim('')
    }, SILENCE_TIMEOUT_MS)
  }, [])

  /** Clear the silence timer */
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = undefined
    }
  }, [])

  /** Start continuous speech recognition — Requirements 20.2, 20.3 */
  const startListening = useCallback(() => {
    if (!SpeechRecognitionClass) {
      setState('unavailable')
      return
    }

    const rec = new SpeechRecognitionClass() as any
    rec.lang = 'zh-CN'          // Chinese recognition — Requirement 20.2
    rec.continuous = true        // Continuous mode — Requirement 20.2
    rec.interimResults = true    // Show interim results — Requirement 20.2
    recRef.current = rec

    // Handle recognition results — Requirements 20.2, 20.3
    rec.onresult = (e: SpeechRecognitionEvent) => {
      // We received a result — reset the silence timer
      resetSilenceTimer()

      let interimTranscript = ''
      let finalTranscript = ''

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          finalTranscript += transcript
        } else {
          interimTranscript += transcript
        }
      }

      // Insert final text at cursor position — Requirement 20.3
      if (finalTranscript) {
        onText(finalTranscript)
        setInterim('')
      } else {
        // Display interim results in real-time — Requirement 20.2
        setInterim(interimTranscript)
      }
    }

    // Handle errors — Requirements 20.5, 20.6, 20.7
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      console.warn('[VoiceInput] error:', e.error)
      clearSilenceTimer()
      recRef.current = null
      setInterim('')

      switch (e.error) {
        case 'not-allowed':
          // Microphone permission denied — Requirement 20.5
          setState('permission_denied')
          setErrorMessage('麦克风权限被拒绝，请在浏览器设置中允许麦克风访问')
          break
        case 'network':
          // Network error — Requirement 20.7
          setState('network_error')
          setErrorMessage('语音识别需要网络连接，请检查网络后重试')
          break
        case 'no-speech':
          // No speech detected — browser's own silence detection
          setState('timeout_error')
          setErrorMessage('未检测到语音输入，请靠近麦克风重试')
          break
        case 'audio-capture':
          // No microphone device — Requirement 20.5
          setState('permission_denied')
          setErrorMessage('未检测到麦克风设备，请确认麦克风已连接')
          break
        case 'service-not-allowed':
          // Speech service unavailable (network-related) — Requirement 20.7
          setState('network_error')
          setErrorMessage('语音识别服务不可用，请检查网络连接')
          break
        default:
          setState('idle')
          break
      }
    }

    // Handle recognition end — Requirement 20.4
    rec.onend = () => {
      clearSilenceTimer()
      // Only reset to idle if we haven't already set an error state in onerror
      // (onerror sets recRef.current = null before onend fires)
      if (recRef.current) {
        recRef.current = null
        setState('idle')
        setInterim('')
      }
    }

    // Try to start — permission check via try-catch — Requirement 20.5
    try {
      rec.start()
      setState('listening')
      setErrorMessage('')
      // Start the silence timer — if no result within 10s, timeout — Requirement 20.6
      resetSilenceTimer()
    } catch (err) {
      console.warn('[VoiceInput] start failed:', err)
      recRef.current = null
      setState('permission_denied')
      setErrorMessage('无法启动语音识别，请检查麦克风权限')
    }
  }, [onText, SpeechRecognitionClass, resetSilenceTimer, clearSilenceTimer])

  /** Stop listening — Requirement 20.4 */
  const stopListening = useCallback(() => {
    clearSilenceTimer()
    if (recRef.current) {
      try { recRef.current.stop() } catch { /* ignore */ }
      recRef.current = null
    }
    setState('idle')
    setInterim('')
  }, [clearSilenceTimer])

  /** Toggle recording on/off */
  const toggle = () => {
    if (state === 'listening') {
      stopListening()
    } else if (state === 'permission_denied' || state === 'network_error' || state === 'timeout_error') {
      // Clear error and retry
      setErrorMessage('')
      setState('idle')
      startListening()
    } else {
      startListening()
    }
  }

  // Hide the button entirely if Web Speech API is not available — Requirement 20.5
  if (!hasWebSpeech || state === 'unavailable') return null

  const isError = state === 'permission_denied' || state === 'network_error' || state === 'timeout_error'
  const isListening = state === 'listening'

  const getTitle = (): string => {
    switch (state) {
      case 'listening': return '点击停止语音输入'
      case 'permission_denied': return '麦克风权限被拒绝，点击重试'
      case 'network_error': return '网络不可用，点击重试'
      case 'timeout_error': return '语音服务超时，点击重试'
      default: return '语音输入 (zh-CN)'
    }
  }

  const getIcon = (): string => {
    if (isListening) return '⏹'
    if (state === 'permission_denied') return '🚫'
    if (state === 'network_error' || state === 'timeout_error') return '⚠'
    return '🎙'
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      {/* 实时识别文字气泡 — interim results in real-time (Requirement 20.2) */}
      {interim && (
        <div
          role="status"
          aria-live="polite"
          aria-label="语音识别中间结果"
          style={{
            position: 'absolute',
            bottom: '110%',
            right: 0,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-light)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12,
            color: 'var(--text-secondary)',
            fontStyle: 'italic',
            fontFamily: 'var(--font-sans)',
            whiteSpace: 'nowrap',
            maxWidth: 240,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            boxShadow: 'var(--shadow-md)',
            pointerEvents: 'none',
            zIndex: 100,
          }}
        >
          {interim}
        </div>
      )}

      {/* 错误提示气泡 — error messages (Requirements 20.5, 20.6, 20.7) */}
      {isError && errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: 'absolute',
            bottom: '110%',
            right: 0,
            background: 'var(--danger-bg, #fff0f0)',
            border: '1px solid var(--danger, #e53e3e)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 11,
            color: 'var(--danger, #e53e3e)',
            fontFamily: 'var(--font-sans)',
            whiteSpace: 'nowrap',
            maxWidth: 280,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            boxShadow: 'var(--shadow-md)',
            zIndex: 100,
            animation: 'voiceFadeIn 0.2s ease-out',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Microphone button with recording state indicator — Requirement 20.1 */}
      <button
        onClick={toggle}
        disabled={disabled}
        title={getTitle()}
        aria-label={getTitle()}
        aria-pressed={isListening}
        style={{
          width: 32, height: 30, border: 'none', borderRadius: 5,
          background: isListening ? 'var(--danger)' : 'transparent',
          color: isListening ? 'white' :
                 isError ? 'var(--danger, #e53e3e)' : 'var(--text-secondary)',
          cursor: disabled ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, transition: 'all 0.15s',
          position: 'relative',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {/* Recording pulse animation — state indicator */}
        {isListening && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', inset: -2, borderRadius: 7,
              border: '1.5px solid var(--danger)', opacity: 0.4,
              animation: 'voicePulse 1.2s ease-in-out infinite',
            }}
          />
        )}
        <span style={{ position: 'relative', zIndex: 1 }}>
          {getIcon()}
        </span>
      </button>

      <style>{`
        @keyframes voicePulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.15); opacity: 0.1; }
        }
        @keyframes voiceFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

