/**
 * ImageGallery — shows all images across notes in a grid view.
 * Clicking an image navigates to the note containing it.
 * Supports lightbox preview.
 */

import { useMemo, useState } from 'react'
import { useAppStore } from '@notepro/shared'
import type { Note } from '@notepro/shared'

interface Props {
  onClose: () => void
}

interface ImageEntry {
  src: string
  noteId: string
  noteTitle: string
  noteUpdatedAt: number
}

function extractImages(note: Note): ImageEntry[] {
  if (!note.content) return []
  try {
    const images: ImageEntry[] = []
    const walk = (node: any) => {
      if (node.type === 'image' && node.attrs?.src) {
        images.push({
          src: node.attrs.src,
          noteId: note.id,
          noteTitle: note.title || '无标题',
          noteUpdatedAt: note.updatedAt,
        })
      }
      ;(node.content || []).forEach(walk)
    }
    walk(JSON.parse(note.content))
    return images
  } catch { return [] }
}

export default function ImageGallery({ onClose }: Props) {
  const notes = useAppStore((s) => s.notes)
  const setActiveNote = useAppStore((s) => s.setActiveNote)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [lightboxNote, setLightboxNote] = useState<string | null>(null)

  const images = useMemo(() => {
    const all: ImageEntry[] = []
    for (const note of notes) {
      if (note.deletedAt || note.hidden) continue
      all.push(...extractImages(note))
    }
    return all.sort((a, b) => b.noteUpdatedAt - a.noteUpdatedAt)
  }, [notes])

  const handleImageClick = (img: ImageEntry) => {
    setLightboxSrc(img.src)
    setLightboxNote(img.noteId)
  }

  const handleGoToNote = () => {
    if (lightboxNote) {
      setActiveNote(lightboxNote)
      onClose()
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      role="dialog"
      aria-label="图片库"
    >
      <div style={{
        width: 'min(800px, 92vw)', height: 'min(600px, 85vh)',
        background: 'var(--bg-primary)',
        borderRadius: 14, border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeIn 200ms ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>
              图片库
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-num)' }}>
              {images.length} 张图片
            </span>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, color: 'var(--text-faint)', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Grid */}
        <div style={{
          flex: 1, overflow: 'auto', padding: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 12,
          alignContent: 'start',
        }}>
          {images.length === 0 && (
            <div style={{
              gridColumn: '1 / -1',
              textAlign: 'center', padding: '48px 0',
              color: 'var(--text-faint)', fontSize: 13,
            }}>
              笔记中还没有图片
            </div>
          )}
          {images.map((img, idx) => (
            <div
              key={`${img.noteId}-${idx}`}
              onClick={() => handleImageClick(img)}
              style={{
                borderRadius: 8,
                overflow: 'hidden',
                border: '1px solid var(--border-light)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                position: 'relative',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = 'var(--shadow-md)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <img
                src={img.src}
                alt=""
                loading="lazy"
                style={{
                  width: '100%', height: 120,
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
              <div style={{
                padding: '6px 8px',
                background: 'var(--bg-secondary)',
                fontSize: 10, color: 'var(--text-faint)',
                fontFamily: 'var(--font-sans)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {img.noteTitle}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 16,
            animation: 'fadeIn 150ms ease-out',
          }}
        >
          <img
            src={lightboxSrc}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '90vw', maxHeight: '75vh',
              borderRadius: 8,
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}
          />
          <div style={{ display: 'flex', gap: 12 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={handleGoToNote}
              style={{
                padding: '8px 16px', border: 'none', borderRadius: 6,
                background: 'var(--accent)', color: 'white',
                fontSize: 13, cursor: 'pointer',
              }}
            >
              跳转到笔记
            </button>
            <button
              onClick={() => setLightboxSrc(null)}
              style={{
                padding: '8px 16px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6,
                background: 'transparent', color: 'white',
                fontSize: 13, cursor: 'pointer',
              }}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
