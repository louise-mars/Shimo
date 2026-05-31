/**
 * Sync module barrel export.
 * Three-layer sync architecture: OfflineQueue, ConflictResolver, SyncTransport, SyncEngine.
 */

export { OfflineQueue } from './OfflineQueue'
export { SupabaseSyncTransport } from './SyncTransport'
export type { ISyncTransport } from './SyncTransport'
export { LWWConflictResolver, formatConflictTitle } from './ConflictResolver'
export type { IConflictResolver, ConflictResult } from './ConflictResolver'
export { SyncEngine } from './SyncEngine'
export type { SyncEngineConfig, SyncResult, SyncError, ISyncEngineStore, SyncStateListener } from './SyncEngine'
export { migrateLegacySyncQueue } from './legacySyncMigration'
export type { LegacySyncMigrationResult } from './legacySyncMigration'
