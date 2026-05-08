import { useState, useRef, useCallback, useEffect } from 'react'
import { startRecording, stopRecording, cancelRecording } from '../../lib/recorder'
import { transcribeAudio, isASRConfigured } from '../../lib/speechToText'
import { structureVoiceText, isAIConfigured } from '../../lib/ai'

interface Props {
  onText: (text: string) => void
  onStructured?: (title: string, content: string, tags: string[]) => void
  onGoToSettings?: () => void
  disabled?: boolean
}

type Mode = 'idle' | 'recording' | 'transcribing' | 'processing' | 'error'

export default function BottomVoiceBar({ onText, onStructured, onGoToSettings, disabled }: Props) {
  const [mode, setMode] = useState<Mode>('idle')
  const [displayText, setDisplayText] = useState('')
  const [duration, setDuration] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const aiEnabled = isAIConfigured()
  const asrReady = isASRConfigured()

  useEffect(() => {
    return () => {
      cancelRecording()
      if (timerRef.current) clearInterval(timerRef.current)
      if (msgTimer.current) clearTimeout(msgTimer.current)
    }
  }, [])

  const msgTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showMsg = (msg: string, ms = 2500) => {
    setDisplayText(msg)
    if (msgTimer.current) clearTimeout(msgTimer.current)
    if (ms > 0) msgTimer.current = setTimeout(() => setDisplayText(''), ms)
  }

  const finalize = useCallback((text: string) => {
    const cleaned = text.trim()
    if (!cleaned) { showMsg('未识别到内容'); return }

    if (aiEnabled && onStructured) {
      setMode('processing')
      setDisplayText('AI 整理中…')
      structureVoiceText(cleaned)
        .then(r => { onStructured(r.title, r.content, r.tags); showMsg('✓ 已插入') })
        .catch(() => { onText(cleaned); showMsg('✓ 已插入') })
        .finally(() => setMode('idle'))
    } else {
      onText(cleaned)
      showMsg('✓ 已插入')
      setMode('idle')
    }
  }, [onText, onStructured, aiEnabled])

  // 开始录音
  const start = useCallback(async () => {
    if (!asrReady) {
      if (onGoToSettings) {
        onGoToSettings()
      } else {
        setMode('error')
        setDisplayText('请先在设置中配置语音识别服务')
      }
      return
    }

    const ok = await startRecording()
    if (!ok) {
      setMode('error')
      showMsg('无法访问麦克风')
      return
    }

    setMode('recording')
    setDuration(0)
    setDisplayText('录音中… 点击停止')

    // 计时器
    timerRef.current = setInterval(() => {
      setDuration(d => d + 1)
    }, 1000)
  }, [asrReady])

  // 停止录音并转写
  const stop = useCallback(async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = undefined }

    setMode('transcribing')
    setDisplayText('识别中…')

    const blob = await stopRecording()
    if (!blob || blob.size < 1000) {
      // 录音太短
      setMode('idle')
      showMsg('录音太短，请重试')
      return
    }

    const text = await transcribeAudio(blob)
    if (text) {
      finalize(text)
    } else {
      setMode('idle')
      showMsg('识别失败，请重试')
    }
  }, [finalize])

  // 取消
  const cancel = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = undefined }
    cancelRecording()
    setMode('idle')
    setDisplayText('')
    setDuration(0)
  }, [])

  const toggle = () => {
    if (disabled || mode === 'transcribing' || mode === 'processing') return
    if (mode === 'error') { setMode('idle'); setDisplayText(''); return }
    if (mode === 'recording') stop()
    else start()
  }

  const isActive = mode === 'recording'
  const isBusy = mode === 'transcribing' || mode === 'processing'

  // 格式化时长
  const formatDur = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}s`
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '8px 16px', gap: 10,
      background: 'var(--bg-elevated)',
      borderTop: '1px solid var(--border-light)',
      flexShrink: 0,
    }}>
      {/* 状态文字 */}
      <div style={{
        flex: 1, fontSize: 13, minHeight: 20, lineHeight: '20px',
        fontFamily: 'var(--font-sans)', fontWeight: 300,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: displayText.startsWith('✓') ? 'var(--success)'
          : mode === 'error' ? 'var(--danger)'
          : isActive ? 'var(--accent)'
          : isBusy ? 'var(--text-secondary)'
          : 'var(--text-faint)',
      }}>
        {displayText
          || (isActive ? `录音中 ${formatDur(duration)}… 点击停止` : '')
          || (isBusy ? '处理中…' : '')
          || (asrReady ? '点击开始语音输入' : '点击配置语音识别 →')
        }
      </div>

      {/* 取消按钮（录音中显示） */}
      {isActive && (
        <button
          onClick={cancel}
          style={{
            border: 'none', background: 'none',
            color: 'var(--text-faint)', fontSize: 12,
            cursor: 'pointer', padding: '4px 8px',
            fontFamily: 'var(--font-sans)',
          }}
        >
          取消
        </button>
      )}

      {/* 主按钮 */}
      <button
        onClick={toggle}
        disabled={disabled || isBusy}
        data-voice-trigger="true"
        style={{
          width: 44, height: 44, borderRadius: '50%', border: 'none',
          background: isActive ? 'var(--danger)' : isBusy ? 'var(--accent-light)' : 'var(--bg-secondary)',
          color: isActive ? 'white' : 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: disabled || isBusy ? 'default' : 'pointer',
          transition: 'all 0.15s', position: 'relative', flexShrink: 0,
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
        }}
      >
        {isActive && (
          <span style={{
            position: 'absolute', inset: -6, borderRadius: '50%',
            border: '2px solid var(--danger)', opacity: 0.3,
            animation: 'voicePulse 1s ease-in-out infinite',
          }} />
        )}
        <span style={{ fontSize: 20, lineHeight: 1, position: 'relative', zIndex: 1 }}>
          {isActive ? '⏹' : isBusy ? '⏳' : mode === 'error' ? '⚠' : '🎙'}
        </span>
      </button>

      <style>{`@keyframes voicePulse{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.1}}`}</style>
    </div>
  )
}
