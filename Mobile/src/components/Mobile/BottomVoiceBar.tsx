import { useState, useRef, useCallback, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { startListening, stopListening, startWebSpeech } from '../../lib/speech'
import { structureVoiceText, isAIConfigured } from '../../lib/ai'

// 过滤语气词，自动加标点
function cleanSpeechText(raw: string): string {
  return raw
    // 过滤语气词
    .replace(/[嗯啊呢吧哦哈那个就是然后这个]/g, '')
    // 句末加句号
    .replace(/([^，。！？\s])(\s*)$/, '$1。')
    // 多余空格
    .replace(/\s+/g, '')
    .trim()
}

interface Props {
  onText: (text: string) => void
  onStructured?: (title: string, content: string, tags: string[]) => void
  disabled?: boolean
}

type Mode = 'idle' | 'pressing' | 'listening' | 'error'

export default function BottomVoiceBar({ onText, onStructured, disabled }: Props) {
  const [mode, setMode] = useState<Mode>('idle')
  const [interim, setInterim] = useState('')
  const [structuring, setStructuring] = useState(false)
  const stopWebRef = useRef<(() => void) | null>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isNative = Capacitor.isNativePlatform()
  const aiEnabled = isAIConfigured()

  useEffect(() => {
    return () => {
      if (isNative) stopListening()
      else stopWebRef.current?.()
    }
  }, [])

  const startVoice = useCallback(async () => {
    setMode('listening')
    setInterim('')

    const onResult = ({ text, isFinal }: { text: string; isFinal: boolean }) => {
      if (!text) return
      if (!isFinal) {
        setInterim(text)
        return
      }
      const cleaned = cleanSpeechText(text)
      if (!cleaned) { setInterim(''); setMode('idle'); return }

      // 有 AI 且有 onStructured 回调 → 结构化处理
      if (aiEnabled && onStructured) {
        setInterim('')
        setMode('idle')
        setStructuring(true)
        structureVoiceText(cleaned)
          .then(result => onStructured(result.title, result.content, result.tags))
          .catch(() => onText(cleaned)) // AI 失败降级为纯文字
          .finally(() => setStructuring(false))
      } else {
        onText(cleaned)
        setInterim('')
        setMode('idle')
      }
    }

    const onError = (err: string) => {
      setMode(err === 'not_available' ? 'error' : 'idle')
      setInterim('')
    }

    if (isNative) {
      await startListening(onResult, onError, 'zh-CN')
    } else {
      stopWebRef.current = startWebSpeech(onResult, onError, 'zh-CN')
      if (!stopWebRef.current) setMode('error')
    }
  }, [onText, isNative])

  const stopVoice = useCallback(async () => {
    if (isNative) await stopListening()
    else stopWebRef.current?.()
    setMode('idle')
    setInterim('')
  }, [isNative])

  // 长按触发
  const handlePressStart = () => {
    if (disabled || mode === 'error') return
    setMode('pressing')
    pressTimer.current = setTimeout(() => {
      startVoice()
    }, 150) // 150ms 防误触
  }

  const handlePressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    if (mode === 'pressing') {
      setMode('idle')
      return
    }
    if (mode === 'listening') stopVoice()
  }

  // 单击也可以触发（方便不习惯长按的用户）
  const handleClick = () => {
    if (disabled || mode === 'error') return
    if (mode === 'listening') { stopVoice(); return }
    if (mode === 'idle') startVoice()
  }

  const isActive = mode === 'listening' || mode === 'pressing'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '8px 16px',
      background: 'var(--bg-elevated)',
      borderTop: '1px solid var(--border-light)',
      gap: 12,
      flexShrink: 0,
    }}>
      {/* 实时识别文字 */}
      <div style={{
        flex: 1,
        fontSize: 14,
        color: isActive ? 'var(--text-secondary)' : 'var(--text-faint)',
        fontFamily: 'var(--font-sans)',
        fontWeight: 300,
        minHeight: 20,
        transition: 'color 0.2s',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {mode === 'error'
          ? '语音识别不可用'
          : structuring
          ? 'AI 整理中…'
          : mode === 'pressing'
          ? '松开开始说话…'
          : interim
          ? interim
          : isActive
          ? '正在听…'
          : aiEnabled
          ? '长按说话，AI 自动整理'
          : '长按说话，或点击开始'
        }
      </div>

      {/* 语音按钮 */}
      <button
        onPointerDown={handlePressStart}
        onPointerUp={handlePressEnd}
        onPointerLeave={handlePressEnd}
        onClick={handleClick}
        disabled={disabled || mode === 'error'}
        data-voice-trigger="true"
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: 'none',
          background: isActive ? 'var(--danger)' : 'var(--bg-secondary)',
          color: isActive ? 'white' : mode === 'error' ? 'var(--text-faint)' : 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled || mode === 'error' ? 'default' : 'pointer',
          transition: 'all 0.15s ease',
          position: 'relative',
          flexShrink: 0,
          touchAction: 'none', // 防止长按触发系统菜单
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {/* 录音脉冲 */}
        {isActive && (
          <>
            <span style={{
              position: 'absolute', inset: -5,
              borderRadius: '50%',
              border: '2px solid var(--danger)',
              opacity: 0.3,
              animation: 'voicePulse 1s ease-in-out infinite',
            }} />
            <span style={{
              position: 'absolute', inset: -10,
              borderRadius: '50%',
              border: '1.5px solid var(--danger)',
              opacity: 0.15,
              animation: 'voicePulse 1s ease-in-out infinite 0.3s',
            }} />
          </>
        )}
        <span style={{ fontSize: 20, lineHeight: 1, position: 'relative', zIndex: 1 }}>
          {isActive ? '⏹' : mode === 'error' ? '🚫' : '🎙'}
        </span>
      </button>

      <style>{`
        @keyframes voicePulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50%       { transform: scale(1.2); opacity: 0.1; }
        }
      `}</style>
    </div>
  )
}
