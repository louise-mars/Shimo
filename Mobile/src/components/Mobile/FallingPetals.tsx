import { useEffect, useRef } from 'react'

interface Petal {
  x: number
  y: number
  size: number
  opacity: number
  speedX: number
  speedY: number
  rotation: number
  rotationSpeed: number
  wobble: number
  wobbleSpeed: number
  wobbleOffset: number
  type: 'sakura' | 'maple' | 'ginkgo'
  color: string
}

interface FallingPetalsProps {
  active: boolean
  season?: 'spring' | 'autumn'
  density?: number // 1-10
}

const COLORS = {
  spring: ['#F4B8C1', '#F9D0D8', '#FADADD', '#F7C5CC', '#EFA8B4'],
  autumn: ['#C0392B', '#E67E22', '#D4A843', '#8B5E3C', '#C8A87A'],
}

function createPetal(canvas: HTMLCanvasElement, season: 'spring' | 'autumn'): Petal {
  const colors = COLORS[season]
  return {
    x: Math.random() * canvas.width,
    y: -20,
    size: Math.random() * 8 + 4,
    opacity: Math.random() * 0.4 + 0.1,
    speedX: (Math.random() - 0.5) * 1.2,
    speedY: Math.random() * 1.5 + 0.5,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.05,
    wobble: 0,
    wobbleSpeed: Math.random() * 0.03 + 0.01,
    wobbleOffset: Math.random() * Math.PI * 2,
    type: season === 'spring' ? 'sakura' : 'maple',
    color: colors[Math.floor(Math.random() * colors.length)],
  }
}

function drawSakura(ctx: CanvasRenderingContext2D, petal: Petal) {
  ctx.save()
  ctx.translate(petal.x, petal.y)
  ctx.rotate(petal.rotation)
  ctx.globalAlpha = petal.opacity
  ctx.fillStyle = petal.color

  // 樱花花瓣形状
  for (let i = 0; i < 5; i++) {
    ctx.save()
    ctx.rotate((i * Math.PI * 2) / 5)
    ctx.beginPath()
    ctx.ellipse(0, -petal.size * 0.6, petal.size * 0.3, petal.size * 0.6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  ctx.restore()
}

function drawMaple(ctx: CanvasRenderingContext2D, petal: Petal) {
  ctx.save()
  ctx.translate(petal.x, petal.y)
  ctx.rotate(petal.rotation)
  ctx.globalAlpha = petal.opacity
  ctx.fillStyle = petal.color

  // 枫叶简化形状
  const s = petal.size
  ctx.beginPath()
  ctx.moveTo(0, -s)
  ctx.bezierCurveTo(s * 0.3, -s * 0.7, s * 0.8, -s * 0.3, s * 0.5, 0)
  ctx.bezierCurveTo(s * 0.8, s * 0.2, s * 0.3, s * 0.6, 0, s * 0.4)
  ctx.bezierCurveTo(-s * 0.3, s * 0.6, -s * 0.8, s * 0.2, -s * 0.5, 0)
  ctx.bezierCurveTo(-s * 0.8, -s * 0.3, -s * 0.3, -s * 0.7, 0, -s)
  ctx.fill()

  ctx.restore()
}

export default function FallingPetals({ active, season = 'spring', density = 5 }: FallingPetalsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const petalsRef = useRef<Petal[]>([])
  const animFrameRef = useRef<number>(0)
  const lastSpawnRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const maxPetals = density * 3
    const spawnInterval = 2000 / density

    const animate = (timestamp: number) => {
      if (!active) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        petalsRef.current = []
        return
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // 生成新花瓣
      if (timestamp - lastSpawnRef.current > spawnInterval && petalsRef.current.length < maxPetals) {
        petalsRef.current.push(createPetal(canvas, season))
        lastSpawnRef.current = timestamp
      }

      // 更新和绘制
      petalsRef.current = petalsRef.current.filter(p => {
        p.wobble += p.wobbleSpeed
        p.x += p.speedX + Math.sin(p.wobble + p.wobbleOffset) * 0.8
        p.y += p.speedY
        p.rotation += p.rotationSpeed

        if (season === 'spring') {
          drawSakura(ctx, p)
        } else {
          drawMaple(ctx, p)
        }

        return p.y < canvas.height + 30
      })

      animFrameRef.current = requestAnimationFrame(animate)
    }

    if (active) {
      animFrameRef.current = requestAnimationFrame(animate)
    }

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [active, season, density])

  if (!active) return null

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    />
  )
}