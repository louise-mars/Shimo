// Types
export * from './types'

// Store (shared reducer + helpers)
export * from './lib/store'
export { useAppStore, appStore, useActiveNote, useNoteCount, useFilteredNotes, useSyncStatus, useTheme } from './lib/store/createStore'

// Store slice types (Zustand architecture)
export * from './lib/store/types'

// Supabase
export * from './lib/supabase'
export * from './lib/syncEngine'
export * from './lib/embedding'

// Utils
export * from './utils/markdown'
export * from './utils/tiptap'
export * from './utils/pinyin'

// Storage
export * from './lib/storage/index'
export * from './lib/imageStore'
export * from './lib/imageStore/index'
export * from './lib/noteHistory'

// AI Config
export * from './lib/aiConfig'

// AI Context Assembly
export * from './lib/ai'

// Editor utilities
export * from './lib/editor'

// Security
export * from './lib/security'

// Sync
export * from './lib/sync'

// Search
export * from './lib/search'

// Tag Graph
export * from './lib/tagGraph'

// Migrations
export * from './lib/migrations'

// Integration wiring
export * from './lib/integration'

// Integration wiring
export * from './lib/integration'

// Integration wiring
export * from './lib/integration'