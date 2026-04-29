import { useState, useRef } from 'react'
import { useStore } from '../store'
import { importMarkdownToNote, readFileAsText } from '@notepro/shared'
import type { Note } from '@notepro/shared'

type Step = 'choose' | 'importing' | 'done' | 'error'

export default function ImportWizard({ onClose }: { onClose: () => void }) {
  const { dispatch } = useStore()
  const [step, setStep] = useState<Step>('choose')
  const [result, setResult] = useState({ noteCount: 0 })
  const [errorMsg, setErrorMsg] = useState('')
  const mdRef = useRef<HTMLInputElement>(null)
  const txtRef = useRef<HTMLInputElement>(null)
  const jsonRef = useRef<HTMLInputElement>(null)

  const handleMarkdownFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    setStep('importing')
    try {
      const notes: Note[] = []
      for (const file of Array.from(files)) {
        const text = await readFileAsText(file)
        notes.push(importMarkdownToNote(text, null))
      }
      if (notes.length) dispatch({ type: 'IMPORT_NOTES', notes })
      setResult({ noteCount: notes.length })
      setStep('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '导入失败')
      setStep('error')
    }
  }

  const handleTxtFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    setStep('importing')
    try {
      const notes: Note[] = []
      for (const file of Array.from(files)) {
        const text = await readFileAsText(file)
        const title = file.name.replace(/\.(txt|text)$/, '')
        notes.push(importMarkdownToNote(`# ${title}\n\n${text}`, null))
      }
      if (notes.length) dispatch({ type: 'IMPORT_NOTES', notes })
      setResult({ noteCount: notes.length })
      setStep('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '导入失败')
      setStep('error')
    }
  }

  const handleJsonImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setStep('importing')
    try {
      const text = await readFileAsText(file)
      const data = JSON.parse(text)
      const notes: Note[] = Array.isArray(data) ? data : data.notes || []
      if (notes.length) dispatch({ type: 'IMPORT_NOTES', notes })
      setResult({ noteCount: notes.length })
      setStep('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'JSON 格式错误')
      setStep('error')
    }
  }

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
    background: 'var(--bg-secondary)', border: '1.5px solid var(--border-light)',
    borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%',
    transition: 'all 150ms', fontFamily: 'var(--font-sans)',
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <div style={{
        width: 440, background: 'var(--bg-elevated)', borderRadius: 14,
        border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden', animation: 'fadeIn 150ms ease-out',
      }}>
        <div style={{
          padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-light)',
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}>导入笔记</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, color: 'var(--text-faint)', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {step === 'choose' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>选择导入来源</p>

              <button onClick={() => mdRef.current?.click()} style={btnStyle}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}>
                <span style={{ fontSize: 24 }}>📝</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Markdown 文件</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>导入 .md 文件（支持多选）</div>
                </div>
              </button>

              <button onClick={() => txtRef.current?.click()} style={btnStyle}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}>
                <span style={{ fontSize: 24 }}>📄</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>纯文本文件</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>导入 .txt 文件（支持多选）</div>
                </div>
              </button>

              <button onClick={() => jsonRef.current?.click()} style={btnStyle}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}>
                <span style={{ fontSize: 24 }}>📦</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>JSON 备份</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>导入拾墨导出的 JSON 文件</div>
                </div>
              </button>

              <input ref={mdRef} type="file" accept=".md,.markdown" multiple style={{ display: 'none' }} onChange={handleMarkdownFiles} />
              <input ref={txtRef} type="file" accept=".txt,.text" multiple style={{ display: 'none' }} onChange={handleTxtFiles} />
              <input ref={jsonRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleJsonImport} />
            </div>
          )}

          {step === 'importing' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: 12 }}>
              <div style={{ fontSize: 32, animation: 'spin 1s linear infinite' }}>⏳</div>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>正在导入...</p>
            </div>
          )}

          {step === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: 12 }}>
              <div style={{ fontSize: 36 }}>✅</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>导入完成</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                成功导入 {result.noteCount} 条笔记
              </p>
              <button onClick={onClose} style={{
                marginTop: 8, padding: '8px 24px', background: 'var(--accent)', color: 'white',
                border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              }}>完成</button>
            </div>
          )}

          {step === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: 12 }}>
              <div style={{ fontSize: 36 }}>❌</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>导入失败</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{errorMsg}</p>
              <button onClick={() => setStep('choose')} style={{
                marginTop: 8, padding: '8px 24px', background: 'var(--accent)', color: 'white',
                border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              }}>重试</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}