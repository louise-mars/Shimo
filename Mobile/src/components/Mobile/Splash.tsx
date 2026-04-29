import { useEffect, useState } from 'react'

interface SplashProps {
  onDone: () => void
}

export default function Splash({ onDone }: SplashProps) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 400)
    const t2 = setTimeout(() => setPhase('out'), 1800)
    const t3 = setTimeout(() => onDone(), 2200)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [onDone])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#F7F6F3',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 0,
      opacity: phase === 'out' ? 0 : 1,
      transition: phase === 'out' ? 'opacity 400ms ease-in' : 'none',
    }}>

      {/* 品牌名 */}
      <div style={{
        fontFamily: "'Noto Serif SC', serif",
        fontSize: 42,
        fontWeight: 700,
        color: '#1C1C1E',
        letterSpacing: 12,
        opacity: phase === 'in' ? 0 : 1,
        transform: phase === 'in' ? 'translateY(6px)' : 'translateY(0)',
        transition: 'opacity 500ms ease-out, transform 500ms ease-out',
        marginBottom: 16,
      }}>
        拾墨
      </div>

      {/* 分隔点 */}
      <div style={{
        width: 4, height: 4,
        borderRadius: '50%',
        background: '#8FA3A6',
        marginBottom: 16,
        opacity: phase === 'in' ? 0 : 0.6,
        transition: 'opacity 600ms ease-out 100ms',
      }}/>

      {/* Slogan */}
      <div style={{
        fontFamily: "'Noto Sans SC', sans-serif",
        fontSize: 13,
        fontWeight: 300,
        color: '#6E6E73',
        letterSpacing: 3,
        opacity: phase === 'in' ? 0 : 1,
        transition: 'opacity 600ms ease-out 200ms',
      }}>
        记录此刻
      </div>

    </div>
  )
}