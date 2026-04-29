import { useState, useEffect } from 'react'
import {
  playAmbience, stopAmbience, setAmbienceVolume,
  getAmbienceForTime,
  type AmbienceType,
} from '../../lib/ambience'

const ICONS: Record<AmbienceType | 'none', string> = {
  rain:  '🌧',
  wind:  '🍃',
  white: '〰',
  none:  '♪',
}

const LABELS: Record<AmbienceType | 'none', string> = {
  rain:  '雨声',
  wind:  '风声',
  white: '白噪音',
  none:  '环境音',
}

// 从 localStorage 读取用户偏好
const PREF_KEY = 'shimo-ambience-enabled'
const VOL_KEY  = 'shimo-ambience-volume'

export default function AmbienceControl() {
  const [enabled, setEnabled] = useState(() =>
    localStorage.getItem(PREF_KEY) === 'true'
  )
  const [volume, setVolume] = useState(() =>
    parseFloat(localStorage.getItem(VOL_KEY) || '0.35')
  )
  const [showPanel, setShowPanel] = useState(false)
  const [activeType, setActiveType] = useState<AmbienceType | 'none'>('none')

  // 初始化：如果用户之前开启过，自动播放
  useEffect(() => {
    if (enabled) {
      const type = getAmbienceForTime()
      playAmbience(type, volume)
      setActiveType(type)
    }
    return () => { stopAmbience() }
  }, [])

  const toggle = () => {
    if (enabled) {
      stopAmbience()
      setEnabled(false)
      setActiveType('none')
      localStorage.setItem(PREF_KEY, 'false')
    } else {
      const type = getAmbienceForTime()
      playAmbience(type, volume)
      setEnabled(true)
      setActiveType(type)
      localStorage.setItem(PREF_KEY, 'true')
    }
  }

  const selectType = (type: AmbienceType) => {
    playAmbience(type, volume)
    setActiveType(type)
    setEnabled(true)
    localStorage.setItem(PREF_KEY, 'true')
    setShowPanel(false)
  }

  const handleVolume = (v: number) => {
    setVolume(v)
    setAmbienceVolume(v)
    localStorage.setItem(VOL_KEY, String(v))
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* 主按钮 */}
      <button
        onClick={() => setShowPanel(v => !v)}
        title={enabled ? `${LABELS[activeType]} · 点击调整` : '开启环境音'}
        style={{
          width: 36, height: 36,
          border: 'none', background: 'none',
          borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          fontSize: 16,
          color: enabled ? 'var(--accent)' : 'var(--text-faint)',
          transition: 'color 0.2s',
          position: 'relative',
        }}
      >
        {ICONS[activeType]}
        {/* 播放中的脉冲指示 */}
        {enabled && (
          <span style={{
            position: 'absolute',
            top: 4, right: 4,
            width: 5, height: 5,
            borderRadius: '50%',
            background: 'var(--accent)',
            animation: 'pulse 2s ease-in-out infinite',
          }} />
        )}
      </button>

      {/* 控制面板 */}
      {showPanel && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setShowPanel(false)}
          />
          <div style={{
            position: 'absolute',
            top: '110%', right: 0,
            zIndex: 100,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-light)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-lg)',
            padding: '12px',
            width: 180,
            animation: 'fadeIn 150ms ease-out',
          }}>
            {/* 声音类型选择 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {(['rain', 'wind', 'white'] as AmbienceType[]).map(type => (
                <button
                  key={type}
                  onClick={() => selectType(type)}
                  style={{
                    flex: 1, padding: '6px 0',
                    border: `1px solid ${activeType === type ? 'var(--accent)' : 'var(--border-light)'}`,
                    borderRadius: 6,
                    background: activeType === type ? 'var(--accent-bg)' : 'var(--bg-primary)',
                    color: activeType === type ? 'var(--accent)' : 'var(--text-faint)',
                    cursor: 'pointer', fontSize: 18,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 2,
                    transition: 'all 0.15s',
                  }}
                  title={LABELS[type]}
                >
                  <span>{ICONS[type]}</span>
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-sans)' }}>
                    {LABELS[type]}
                  </span>
                </button>
              ))}
            </div>

            {/* 音量滑块 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>🔈</span>
              <input
                type="range"
                min={0} max={1} step={0.05}
                value={volume}
                onChange={e => handleVolume(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent)', height: 3 }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>🔊</span>
            </div>

            {/* 关闭按钮 */}
            {enabled && (
              <button
                onClick={() => { toggle(); setShowPanel(false) }}
                style={{
                  width: '100%', marginTop: 10, padding: '6px 0',
                  border: '1px solid var(--border-light)',
                  borderRadius: 6, background: 'none',
                  color: 'var(--text-faint)', fontSize: 12,
                  fontFamily: 'var(--font-sans)', cursor: 'pointer',
                }}
              >
                关闭环境音
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
