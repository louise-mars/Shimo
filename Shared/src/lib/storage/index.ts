/**
 * Storage module barrel export.
 * Re-exports all IndexedDB storage helpers, trash cleanup scheduler, and state loader.
 */
export {
  idbGet,
  idbSet,
  idbDelete,
  debouncedPersist,
  cancelDebouncedPersist,
  flushDebouncedPersist,
  isStorageAvailable,
  migrateFromLocalStorage,
  _resetStorageState,
} from './indexedDB'

export {
  cleanupExpiredTrash,
  startTrashCleanup,
  stopTrashCleanup,
} from './trashCleanup'

export {
  loadPersistedState,
  injectNoteDefaults,
  createWelcomeNote,
} from './stateLoader'

export type { PersistedState } from './stateLoader'
