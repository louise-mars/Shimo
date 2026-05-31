import JSZip from 'jszip'
import { v4 as uuid } from 'uuid'
import type { Note, Folder } from '@notepro/shared'
import { importMarkdownToNote } from '@notepro/shared'

interface NotionImportResult {
  notes: Note[]
  folders: Folder[]
}

// Notion exports use UUIDs in filenames like "Page Name abc123def456.md"
// Strip the trailing hash to get clean titles
function cleanNotionFilename(name: string): string {
  return name
    .replace(/\.md$/, '')
    .replace(/\.csv$/, '')
    .replace(/\s+[a-f0-9]{32}$/, '') // remove Notion's 32-char hash
    .replace(/\s+[a-f0-9-]{36}$/, '') // or UUID format
    .trim()
}

function csvToMarkdownTable(csv: string): string {
  const lines = csv.split('\n').filter(l => l.trim())
  if (lines.length === 0) return ''

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
      current += ch
    }
    result.push(current.trim())
    return result
  }

  const headers = parseCSVLine(lines[0])
  const rows = lines.slice(1).map(parseCSVLine)

  let md = '| ' + headers.join(' | ') + ' |\n'
  md += '| ' + headers.map(() => '---').join(' | ') + ' |\n'
  for (const row of rows) {
    // Pad row to match header length
    while (row.length < headers.length) row.push('')
    md += '| ' + row.slice(0, headers.length).join(' | ') + ' |\n'
  }
  return md
}

export async function importNotionZip(file: File): Promise<NotionImportResult> {
  const zip = await JSZip.loadAsync(file)
  const notes: Note[] = []
  const folderMap = new Map<string, string>() // path -> folderId
  const folders: Folder[] = []

  // First pass: discover folder structure
  const paths = Object.keys(zip.files).sort()
  for (const path of paths) {
    const entry = zip.files[path]
    if (!entry.dir) continue

    const parts = path.replace(/\/$/, '').split('/')
    if (parts.length === 0) continue

    // Only create folders for top-level and second-level directories
    const folderPath = parts.slice(0, Math.min(parts.length, 2)).join('/')
    if (!folderMap.has(folderPath)) {
      const id = uuid()
      const name = cleanNotionFilename(parts[parts.length - 1])
      if (name) {
        folderMap.set(folderPath, id)
        folders.push({ id, name, emoji: '📁', parentId: null, order: folders.length, createdAt: Date.now(), updatedAt: Date.now() })
      }
    }
  }

  // Second pass: process files
  for (const path of paths) {
    const entry = zip.files[path]
    if (entry.dir) continue

    const filename = path.split('/').pop() || ''
    const ext = filename.split('.').pop()?.toLowerCase()

    // Determine which folder this file belongs to
    const parts = path.split('/')
    let folderId: string | null = null
    if (parts.length > 1) {
      // Try to match to a folder
      const folderPath = parts.slice(0, Math.min(parts.length - 1, 2)).join('/')
      folderId = folderMap.get(folderPath) ?? null
    }

    if (ext === 'md') {
      const content = await entry.async('string')
      const note = importMarkdownToNote(content, folderId)
      // Use clean filename as title if the parser didn't find one
      if (!note.title) {
        note.title = cleanNotionFilename(filename)
      }
      notes.push(note)
    } else if (ext === 'csv') {
      // Convert CSV (Notion database) to a note with a table
      const content = await entry.async('string')
      const tableMd = csvToMarkdownTable(content)
      if (tableMd) {
        const title = cleanNotionFilename(filename)
        const note = importMarkdownToNote(`# ${title}\n\n${tableMd}`, folderId)
        note.tags.push('database')
        notes.push(note)
      }
    }
    // Skip images and other binary files for now
  }

  return { notes, folders }
}

export async function importObsidianFolder(files: FileList): Promise<NotionImportResult> {
  const notes: Note[] = []
  const folderMap = new Map<string, string>()
  const folders: Folder[] = []

  for (const file of Array.from(files)) {
    const path = file.webkitRelativePath || file.name
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext !== 'md' && ext !== 'txt' && ext !== 'markdown') continue

    // Extract folder from path
    const parts = path.split('/')
    let folderId: string | null = null
    if (parts.length > 2) {
      const folderName = parts[1] // First subfolder
      if (!folderMap.has(folderName)) {
        const id = uuid()
        folderMap.set(folderName, id)
        folders.push({ id, name: folderName, emoji: '📁', parentId: null, order: folders.length, createdAt: Date.now(), updatedAt: Date.now() })
      }
      folderId = folderMap.get(folderName) ?? null
    }

    const content = await file.text()
    const note = importMarkdownToNote(content, folderId)
    if (!note.title) {
      note.title = file.name.replace(/\.(md|txt|markdown)$/, '')
    }
    notes.push(note)
  }

  return { notes, folders }
}
