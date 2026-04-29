import { useState, useRef } from 'react'
import { useStore } from '../../store'
import { importNotionZip, importObsidianFolder } from '../../utils/notionImport'
import { importMarkdownToNote, readFileAsText } from '@notepro/shared'
import { FileArchive, FolderOpen, FileText, X, CheckCircle, Loader, AlertCircle } from 'lucide-react'

type Step = 'choose' | 'importing' | 'done' | 'error'

interface ImportResult { noteCount: number; folderCount: number }

export default function ImportWizard({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [step, setStep] = useState<Step>('choose')
  const [result, setResult] = useState<ImportResult>({ noteCount: 0, folderCount: 0 })
  const [errorMsg, setErrorMsg] = useState('')
  const zipRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const mdRef = useRef<HTMLInputElement>(null)

  const handleNotionZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setStep('importing')
    try {
      const { notes, folders } = await importNotionZip(file)
      dispatch({ type: 'IMPORT_BULK', notes, folders })
      setResult({ noteCount: notes.length, folderCount: folders.length })
      setStep('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse zip file')
      setStep('error')
    }
  }

  const handleObsidianFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setStep('importing')
    try {
      const { notes, folders } = await importObsidianFolder(files)
      dispatch({ type: 'IMPORT_BULK', notes, folders })
      setResult({ noteCount: notes.length, folderCount: folders.length })
      setStep('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to import folder')
      setStep('error')
    }
  }

  const handleMarkdownFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    setStep('importing')
    try {
      const notes = []
      for (const file of Array.from(files)) {
        const text = await readFileAsText(file)
        notes.push(importMarkdownToNote(text, state.activeFolderId))
      }
      if (notes.length) dispatch({ type: 'IMPORT_NOTES', notes })
      setResult({ noteCount: notes.length, folderCount: 0 })
      setStep('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to import files')
      setStep('error')
    }
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh',
      }}>
      <div style={{
        width: 460, background: 'var(--bg-elevated)', borderRadius: 14,
        border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden', animation: 'fadeIn 150ms ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-light)',
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Import Notes</span>
          <button className="icon-btn" onClick={onClose} style={{ width: 28, height: 28 }}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px' }}>
          {step === 'choose' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Where are your notes coming from?
              </p>

              {/* Notion */}
              <button onClick={() => zipRef.current?.click()} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                background: 'var(--bg-secondary)', border: '1.5px solid var(--border-light)',
                borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'all 150ms', fontFamily: 'var(--font-sans)',
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileArchive size={20} style={{ color: 'var(--accent)' }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Notion</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Import from exported .zip file</div>
                </div>
              </button>

              {/* Obsidian / Folder */}
              <button onClick={() => folderRef.current?.click()} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                background: 'var(--bg-secondary)', border: '1.5px solid var(--border-light)',
                borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'all 150ms', fontFamily: 'var(--font-sans)',
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FolderOpen size={20} style={{ color: 'var(--tag-purple)' }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Obsidian / Folder</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Import a vault or markdown folder</div>
                </div>
              </button>

              {/* Markdown files */}
              <button onClick={() => mdRef.current?.click()} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                background: 'var(--bg-secondary)', border: '1.5px solid var(--border-light)',
                borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'all 150ms', fontFamily: 'var(--font-sans)',
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={20} style={{ color: 'var(--success)' }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Markdown Files</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Import .md or .txt files</div>
                </div>
              </button>

              {/* Hidden inputs */}
              <input ref={zipRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={handleNotionZip} />
              <input ref={folderRef} type="file" accept=".md,.txt,.markdown" multiple
                {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
                style={{ display: 'none' }} onChange={handleObsidianFolder} />
              <input ref={mdRef} type="file" accept=".md,.txt,.markdown" multiple style={{ display: 'none' }} onChange={handleMarkdownFiles} />
            </div>
          )}

          {step === 'importing' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: 12 }}>
              <Loader size={32} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Importing your notes...</p>
            </div>
          )}

          {step === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: 12 }}>
              <CheckCircle size={36} style={{ color: 'var(--success)' }} />
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Import complete!</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
                {result.noteCount} note{result.noteCount !== 1 ? 's' : ''}
                {result.folderCount > 0 && ` and ${result.folderCount} folder${result.folderCount !== 1 ? 's' : ''}`}
                {' '}imported successfully.
              </p>
              <button className="new-note-btn" onClick={onClose} style={{ marginTop: 8 }}>Done</button>
            </div>
          )}

          {step === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: 12 }}>
              <AlertCircle size={36} style={{ color: 'var(--danger)' }} />
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Import failed</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>{errorMsg}</p>
              <button className="new-note-btn" onClick={() => setStep('choose')} style={{ marginTop: 8 }}>Try again</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
