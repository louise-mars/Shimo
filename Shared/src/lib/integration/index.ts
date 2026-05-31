/**
 * Integration module barrel export.
 * Wiring between store, persistence, sync, and offline queue.
 */

export {
  setupPersistence,
  setupSyncWiring,
} from './persistence'

export type {
  StoreInstance,
  CleanupFn,
} from './persistence'
