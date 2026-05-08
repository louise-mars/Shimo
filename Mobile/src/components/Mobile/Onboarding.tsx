import { useState } from 'react'

const ONBOARDING_KEY = 'shimo-onboarding-done'

export function shouldShowOnboarding(): boolean {
  return !localStorage.getItem(ONBOARDING_KEY)
}

export function markOnboardingDone(): void {
  localStorage.setItem(ONBOARDING_KEY, '1')
}

const steps = [
  {
    emoji: '✍',
    title: '随时记录',
    desc: '直接打字，内容自动保存。\n输入 #标签 自动归类。',
  },
  {
    emoji: '🎙',
    title: '语音输入',
    desc: '点击底部麦克风按钮录音，\n自动转为文字插入笔记。',
    note: '需在设置中配置语音识别服务',
  },
  {
    emoji: '✦',
    title: '智能辅助',
    desc: '输入 / 唤出命令菜单。\n格式栏支持加粗、颜色、字体等。',
  },
]

interface Props {
  onDone: () => void
}

export default function Onboarding({ onDone }: Props) {
  const [step, setStep] = useState(0)

  const finish = () => {
    markOnboardingDone()
    onDone()
  }

  const current = steps[step]
  const isLast = step === steps.length - 1

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 32px',
      animation: 'fadeIn 200ms ease-out',
    }}>
      {/* 跳过 */}
      <button onClick={finish} style={{
        position: 'absolute', top: 20, right: 20,
        border: 'none', background: 'none',
        color: 'var(--text-faint)', fontSize: 13,
        cursor: 'pointer', fontFamily: 'var(--font-sans)',
      }}>跳过</button>

      {/* 内容 */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 20, textAlign: 'center',
        maxWidth: 280,
      }}>
        <span style={{ fontSize: 56 }}>{current.emoji}</span>
        <h2 style={{
          fontSize: 22, fontWeight: 600,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-serif)',
          letterSpacing: 2,
        }}>{current.title}</h2>
        <p style={{
          fontSize: 15, color: 'var(--text-secondary)',
          fontFamily: 'var(--font-sans)',
          lineHeight: 1.8, whiteSpace: 'pre-line',
        }}>{current.desc}</p>
        {current.note && (
          <p style={{
            fontSize: 12, color: 'var(--text-faint)',
            fontFamily: 'var(--font-sans)',
          }}>{current.note}</p>
        )}
      </div>

      {/* 进度点 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 40 }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            width: i === step ? 20 : 8, height: 8,
            borderRadius: 4,
            background: i === step ? 'var(--accent)' : 'var(--border-medium)',
            transition: 'all 0.2s',
          }} />
        ))}
      </div>

      {/* 按钮 */}
      <button
        onClick={isLast ? finish : () => setStep(s => s + 1)}
        style={{
          marginTop: 32, padding: '14px 48px',
          background: 'var(--accent)', color: 'white',
          border: 'none', borderRadius: 10,
          fontSize: 16, fontWeight: 500,
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer', letterSpacing: 0.5,
          boxShadow: '0 3px 12px rgba(181, 52, 26, 0.25)',
        }}
      >
        {isLast ? '开始使用' : '下一步'}
      </button>
    </div>
  )
}
