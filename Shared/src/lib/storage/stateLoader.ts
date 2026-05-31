/**
 * State Loader for Shimo (拾墨)
 *
 * Handles loading persisted state on application startup:
 * 1. Attempts to load from IndexedDB
 * 2. Falls back to localStorage migration if IndexedDB is empty
 * 3. Creates a welcome note on first launch (no persisted data)
 * 4. Injects default values for missing schema fields in loaded notes
 *
 * Requirements: 3.5, 3.6, 27.1, 27.2
 */

import { v4 as uuidv4 } from 'uuid'
import { idbGet, migrateFromLocalStorage } from './indexedDB'
import type { Note } from '../../types'

/** The key used to persist application state in IndexedDB / localStorage */
const STATE_KEY = 'shimo-state'

/** localStorage key used to track whether the welcome note has been shown */
const WELCOME_FLAG_KEY = 'shimo-welcome-shown'

/**
 * Persisted state shape — the subset of AppStore that gets persisted.
 * This matches what debouncedPersist writes to IndexedDB.
 */
export interface PersistedState {
  notes: Note[]
  theme: 'light' | 'dark' | 'system'
  activeTag: string | null
}

/**
 * Default values for Note fields that may be missing in legacy data.
 * Used to ensure runtime stability when loading notes from older schema versions.
 * (Requirement 27.2)
 */
const NOTE_FIELD_DEFAULTS: Partial<Note> = {
  locked: false,
  hidden: false,
  deletedAt: null,
  folderId: null,
}

/**
 * Inject default values for any missing schema fields on a note.
 * Ensures backward compatibility for legacy records that predate
 * the introduction of locked, hidden, deletedAt, and folderId fields.
 * (Requirement 27.2)
 */
export function injectNoteDefaults(note: Record<string, unknown>): Note {
  const result = { ...note }

  for (const [key, defaultValue] of Object.entries(NOTE_FIELD_DEFAULTS)) {
    if (!(key in result) || result[key] === undefined) {
      result[key] = defaultValue
    }
  }

  // Ensure tags is always an array
  if (!Array.isArray(result.tags)) {
    result.tags = []
  }

  // Ensure pinned and favorited are booleans
  if (typeof result.pinned !== 'boolean') {
    result.pinned = false
  }
  if (typeof result.favorited !== 'boolean') {
    result.favorited = false
  }

  return result as unknown as Note
}

/**
 * Create a welcome note with usage tips for first-time users.
 * (Requirement 3.6)
 */
export function createWelcomeNote(): Note {
  const now = Date.now()
  const welcomeContent = JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: '欢迎使用拾墨 ✨' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '拾墨是一款简洁高效的笔记应用，帮助你记录灵感、整理思绪。' },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: '快速上手' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Ctrl+N' },
                  { type: 'text', text: ' — 新建笔记' },
                ],
              },
            ],
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: '#标签' },
                  { type: 'text', text: ' — 输入 # 加文字创建标签，自动归类' },
                ],
              },
            ],
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: '/' },
                  { type: 'text', text: ' — 输入斜杠打开命令菜单，快速插入各种内容块' },
                ],
              },
            ],
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Ctrl+D' },
                  { type: 'text', text: ' — 切换深色/浅色主题' },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '开始记录你的第一条笔记吧！' },
        ],
      },
    ],
  })

  return {
    id: uuidv4(),
    title: '欢迎使用拾墨 ✨',
    content: welcomeContent,
    tags: [],
    folderId: null,
    pinned: false,
    favorited: false,
    locked: false,
    hidden: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Load persisted state on application startup.
 *
 * Strategy:
 * 1. Try loading from IndexedDB (primary storage)
 * 2. If IndexedDB is empty, attempt localStorage migration (Requirement 3.5, 27.1)
 * 3. If no data exists anywhere and no welcome flag, create a welcome note (Requirement 3.6)
 * 4. Inject defaults for any missing schema fields on all loaded notes (Requirement 27.2)
 *
 * Returns the loaded/migrated state, or a fresh state with a welcome note.
 */
export async function loadPersistedState(): Promise<PersistedState> {
  // Step 1: Try IndexedDB
  let data = await idbGet<PersistedState>(STATE_KEY)

  // Step 2: Fall back to localStorage migration
  if (!data) {
    const migrated = await migrateFromLocalStorage(STATE_KEY)
    if (migrated && typeof migrated === 'object') {
      data = migrated as PersistedState
    }
  }

  // Step 3: If we have data, inject defaults and return
  if (data && Array.isArray(data.notes) && data.notes.length > 0) {
    return {
      notes: data.notes.map((note) => injectNoteDefaults(note as unknown as Record<string, unknown>)),
      theme: data.theme ?? 'light',
      activeTag: data.activeTag ?? null,
    }
  }

  // Step 4: First launch — create welcome note if no welcome flag exists
  const welcomeShown = getWelcomeFlag()
  if (!welcomeShown) {
    setWelcomeFlag()
    const welcomeNote = createWelcomeNote()
    return {
      notes: [welcomeNote],
      theme: 'light',
      activeTag: null,
    }
  }

  // Edge case: welcome was shown before but no data (user deleted everything)
  return {
    notes: [],
    theme: data?.theme ?? 'light',
    activeTag: data?.activeTag ?? null,
  }
}

/**
 * Check if the welcome flag has been set in localStorage.
 */
function getWelcomeFlag(): boolean {
  try {
    return localStorage.getItem(WELCOME_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Set the welcome flag in localStorage to prevent showing welcome note again.
 */
function setWelcomeFlag(): void {
  try {
    localStorage.setItem(WELCOME_FLAG_KEY, '1')
  } catch {
    // Silently fail if localStorage is unavailable
  }
}
