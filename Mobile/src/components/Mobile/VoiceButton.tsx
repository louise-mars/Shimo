import { useState, useRef, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { startListening, stopListening, startWebSpeech } from '../../lib/speech'

interface Props {
  onText: (text: string, isFinal: boolean) => void
  disabled?: boolean
}

type State = 'idle' | 'listening' | 'error'

export default function VoiceButton({ onText, disabled }: Props) {
  const [state, setState] = useState<State>('idle')
  const [interim, setInterim] = useState('')
  const stopWebRef = useRef<(() => void) | null>(null)
  const isNative = Capacitor.isNativePlatform()

  // 组件卸载时停止
  useEffect(() => {
    return () => {
      if (isNative) stopListening()
      else stopWebRef.current?.()
    }
  }, [])

  const handlePress = async () => {
    if (state === 'listening') {
      // 停止
      if (isNative) await stopListening()
      else stopWebRef.current?.()
      setState('idle')
      setInterim('')
      return
    }

    setState('listening')
    setInterim('')

    const onResult = ({ text, isFinal }: { text: string; isFinal: boolean }) => {
      if (!text) return
      setInterim(isFinal ? '' : text)
      onText(text, isFinal)
      if (isFinal) setState('idle')
    }

    const onError = (err: string) => {
      console.warn('Speech error:', err)
      setState(err === 'not_available' || err === 'permission_denied' ? 'error' : 'idle')
      setInterim('')
    }

    if (isNative) {
      await startListening(onResult, onError, 'zh-CN')
    } else {
      stopWebRef.current = startWebSpeech(onResult, onError, 'zh-CN')
      if (!stopWebRef.current) setState('error')
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      {/* 实时识别文字气泡 */}
      {interim && (
        <div style={{
          position: 'absolute',
          bottom: '110%',
          right: 0,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-light)',
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 13,
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-sans)',
          whiteSpace: 'nowrap',
          maxWidth: 200,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          boxShadow: 'var(--shadow-md)',
          pointerEvents: 'none',
        }}>
          {interim}
        </div>
      )}

      {/* 语音按钮 */}
      <button
        onClick={handlePress}
        disabled={disabled || state === 'error'}
        title={
          state === 'error' ? '语音识别不可用' :
          state === 'listening' ? '点击停止' : '语音输入'
        }
        style={{
          width: 44,
          height: 44,
          border: 'none',
          borderRadius: '50%',
          background: state === 'listening' ? 'var(--danger)' : 'var(--bg-secondary)',
          color: state === 'listening' ? 'white' : state === 'error' ? 'var(--text-faint)' : 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled || state === 'error' ? 'default' : 'pointer',
          transition: 'all 0.2s ease',
          position: 'relative',
          flexShrink: 0,
        }}
      >
        {/* 录音动画圆圈 */}
        {state === 'listening' && (
          <span style={{
            position: 'absolute',
            inset: -4,
            borderRadius: '50%',
            border: '2px solid var(--danger)',
            opacity: 0.4,
            animation: 'voicePulse 1.2s ease-in-out infinite',
          }} />
        )}

        {/* 图标 */}
        <span style={{ fontSize: 18, lineHeight: 1, position: 'relative', zIndex: 1 }}>
          {state === 'listening' ? '⏹' : state === 'error' ? '🚫' : '🎙'}
        </span>
      </button>

      <style>{`
        @keyframes voicePulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50%       { transform: scale(1.3); opacity: 0.1; }
        }
      `}</style>
    </div>
  )
}
