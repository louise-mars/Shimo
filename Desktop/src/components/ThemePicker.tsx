/**
 * ThemePicker — allows users to select from preset color palettes
 * beyond the default light/dark toggle.
 *
 * Palettes are inspired by Chinese aesthetic traditions:
 * - 默认 (宣纸): The current ink-and-paper look
 * - 青瓷 (Celadon): Cool jade-green tones
 * - 竹青 (Bamboo): Warm green natural tones
 * - 石青 (Mineral Blue): Deep blue scholarly feel
 * - 素月 (Moonlight): Soft warm neutral
 */

import { useState, useEffect } from 'react'
import { useAppStore } from '@notepro/shared'

interface Palette {
  id: string
  name: string
  description: string
  preview: { bg: string; accent: string; text: string }
  vars: Record<string, string>
}

const PALETTE_KEY = 'shimo-palette'

const PALETTES: Palette[] = [
  {
    id: 'default',
    name: '宣纸',
    description: '默认·墨与朱砂',
    preview: { bg: '#F7F3EC', accent: '#B5341A', text: '#1A1208' },
    vars: {},
  },
  {
    id: 'celadon',
    name: '青瓷',
    description: '温润如玉的青绿',
    preview: { bg: '#F4F8F5', accent: '#4A8C7A', text: '#1A2E28' },
    vars: {
      '--bg-primary': '#F4F8F5',
      '--bg-secondary': '#E8F0EA',
      '--bg-elevated': '#FBFDFB',
      '--bg-hover': 'rgba(74, 140, 122, 0.05)',
      '--bg-active': 'rgba(74, 140, 122, 0.08)',
      '--text-primary': '#1A2E28',
      '--text-secondary': '#2E4A42',
      '--text-tertiary': '#5A7A70',
      '--text-faint': '#8AA89E',
      '--accent': '#4A8C7A',
      '--accent-hover': '#3A7A68',
      '--accent-light': 'rgba(74, 140, 122, 0.1)',
      '--accent-deep': '#3A7A68',
      '--accent-bg': 'rgba(74, 140, 122, 0.07)',
      '--border-light': 'rgba(74, 140, 122, 0.1)',
      '--border-medium': 'rgba(74, 140, 122, 0.18)',
      '--success': '#4A7C6F',
      '--danger': '#C45040',
    },
  },
  {
    id: 'bamboo',
    name: '竹青',
    description: '自然清新的翠绿',
    preview: { bg: '#F6F5F0', accent: '#5C8A4A', text: '#1E2A18' },
    vars: {
      '--bg-primary': '#F6F5F0',
      '--bg-secondary': '#EEECE4',
      '--bg-elevated': '#FCFBF8',
      '--bg-hover': 'rgba(92, 138, 74, 0.05)',
      '--bg-active': 'rgba(92, 138, 74, 0.08)',
      '--text-primary': '#1E2A18',
      '--text-secondary': '#3A4E30',
      '--text-tertiary': '#6A8058',
      '--text-faint': '#98AE88',
      '--accent': '#5C8A4A',
      '--accent-hover': '#4A7838',
      '--accent-light': 'rgba(92, 138, 74, 0.1)',
      '--accent-deep': '#4A7838',
      '--accent-bg': 'rgba(92, 138, 74, 0.07)',
      '--border-light': 'rgba(92, 138, 74, 0.1)',
      '--border-medium': 'rgba(92, 138, 74, 0.18)',
      '--success': '#4A8C5A',
      '--danger': '#B54A3A',
    },
  },
  {
    id: 'mineral',
    name: '石青',
    description: '沉静的矿石蓝',
    preview: { bg: '#F3F5F8', accent: '#3A6A9A', text: '#1A2030' },
    vars: {
      '--bg-primary': '#F3F5F8',
      '--bg-secondary': '#E8ECF2',
      '--bg-elevated': '#FAFBFD',
      '--bg-hover': 'rgba(58, 106, 154, 0.05)',
      '--bg-active': 'rgba(58, 106, 154, 0.08)',
      '--text-primary': '#1A2030',
      '--text-secondary': '#2E3E58',
      '--text-tertiary': '#5A6E88',
      '--text-faint': '#8A9AB0',
      '--accent': '#3A6A9A',
      '--accent-hover': '#2A5A88',
      '--accent-light': 'rgba(58, 106, 154, 0.1)',
      '--accent-deep': '#2A5A88',
      '--accent-bg': 'rgba(58, 106, 154, 0.07)',
      '--border-light': 'rgba(58, 106, 154, 0.1)',
      '--border-medium': 'rgba(58, 106, 154, 0.18)',
      '--success': '#4A7C6F',
      '--danger': '#B5341A',
    },
  },
  {
    id: 'moonlight',
    name: '素月',
    description: '柔和温暖的月光',
    preview: { bg: '#FAF8F4', accent: '#9A7A4A', text: '#2A2018' },
    vars: {
      '--bg-primary': '#FAF8F4',
      '--bg-secondary': '#F2EEE6',
      '--bg-elevated': '#FDFCF9',
      '--bg-hover': 'rgba(154, 122, 74, 0.05)',
      '--bg-active': 'rgba(154, 122, 74, 0.08)',
      '--text-primary': '#2A2018',
      '--text-secondary': '#4A3828',
      '--text-tertiary': '#7A6248',
      '--text-faint': '#AA9878',
      '--accent': '#9A7A4A',
      '--accent-hover': '#886838',
      '--accent-light': 'rgba(154, 122, 74, 0.1)',
      '--accent-deep': '#886838',
      '--accent-bg': 'rgba(154, 122, 74, 0.07)',
      '--border-light': 'rgba(154, 122, 74, 0.1)',
      '--border-medium': 'rgba(154, 122, 74, 0.18)',
      '--success': '#6A8A4A',
      '--danger': '#B5341A',
    },
  },
]

function loadPalette(): string {
  try { return localStorage.getItem(PALETTE_KEY) || 'default' } catch { return 'default' }
}

function savePalette(id: string) {
  localStorage.setItem(PALETTE_KEY, id)
}

/** Apply palette CSS vars to document root */
export function applyPalette(paletteId?: string) {
  const id = paletteId || loadPalette()
  const palette = PALETTES.find(p => p.id === id)
  if (!palette) return

  const root = document.documentElement
  // Only apply if in light mode (palettes are for light mode; dark mode overrides everything)
  const theme = root.getAttribute('data-theme')
  if (theme === 'dark') return

  // Clear previous palette vars
  PALETTES.forEach(p => {
    Object.keys(p.vars).forEach(key => {
      root.style.removeProperty(key)
    })
  })

  // Apply new palette
  Object.entries(palette.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
}

interface Props {
  onClose: () => void
}

export default function ThemePicker({ onClose }: Props) {
  const [active, setActive] = useState(loadPalette)
  const theme = useAppStore((s) => s.theme)

  // Apply palette on selection
  const handleSelect = (id: string) => {
    setActive(id)
    savePalette(id)
    applyPalette(id)
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const isDark = theme === 'dark'

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      role="dialog"
      aria-label="选择配色"
      aria-modal="true"
    >
      <div style={{
        width: 400, background: 'var(--bg-elevated)',
        borderRadius: 14, border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
        animation: 'fadeIn 150ms ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{
            fontSize: 15, fontWeight: 600,
            fontFamily: 'var(--font-serif)',
            color: 'var(--text-primary)',
          }}>
            配色方案
          </span>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', fontSize: 18, color: 'var(--text-faint)', cursor: 'pointer' }}
          >✕</button>
        </div>

        {/* Palette grid */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isDark && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'var(--bg-secondary)',
              fontSize: 12, color: 'var(--text-faint)',
              fontFamily: 'var(--font-sans)',
              textAlign: 'center',
            }}>
              配色方案仅在浅色模式下生效
            </div>
          )}

          {PALETTES.map(palette => (
            <button
              key={palette.id}
              onClick={() => handleSelect(palette.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 14px',
                border: active === palette.id ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                borderRadius: 10,
                background: active === palette.id ? 'var(--accent-light)' : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
                width: '100%',
                textAlign: 'left',
                opacity: isDark ? 0.5 : 1,
              }}
            >
              {/* Color preview swatches */}
              <div style={{
                display: 'flex', gap: 3, flexShrink: 0,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: palette.preview.bg,
                  border: '1px solid rgba(0,0,0,0.08)',
                }} />
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: palette.preview.accent,
                }} />
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: palette.preview.text,
                }} />
              </div>

              {/* Text */}
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 14, fontWeight: 500,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-serif)',
                }}>
                  {palette.name}
                </div>
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-faint)',
                  fontFamily: 'var(--font-sans)',
                }}>
                  {palette.description}
                </div>
              </div>

              {/* Active indicator */}
              {active === palette.id && (
                <span style={{
                  fontSize: 14, color: 'var(--accent)',
                  flexShrink: 0,
                }}>✓</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
