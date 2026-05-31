# Implementation Plan: Shimo Core

## Overview

This plan implements the Shimo (拾墨) cross-platform note-taking application's shared library (`@notepro/shared`) and platform frontends. The implementation follows an incremental approach: core types and store first, then business logic modules (sync, images, AI, security), then UI components, and finally integration wiring. All code is TypeScript with React 19 frontends.

## Tasks

- [x] 1. Set up Shared package structure and core types
  - [x] 1.1 Create Shared package with TypeScript configuration and build scripts
    - Initialize `Shared/` package with `package.json`, `tsconfig.json`, and barrel export `src/index.ts`
    - Configure build to output to `dist/` for consumption by Desktop and Mobile via `file:` reference
    - _Requirements: 29.1, 29.2_

  - [x] 1.2 Define core data model interfaces and types
    - Create `Shared/src/types/index.ts` with `Note`, `Folder`, `NoteSnapshot`, `ThemeMode`, `TipTapNode` interfaces
    - Include all fields: id, title, content, tags, folderId, pinned, favorited, locked, hidden, deletedAt, createdAt, updatedAt, conflictSourceId
    - _Requirements: 1.1, 2.8, 8.1, 8.2, 8.3, 8.4, 9.1_

  - [x] 1.3 Define store slice interfaces and action types
    - Create `Shared/src/lib/store/types.ts` with `NoteSlice`, `FolderSlice`, `SyncSlice`, `UISlice`, and `AppStore` type
    - Define `SyncStatus`, `SyncState`, `SyncOp`, `SyncOpType` types
    - _Requirements: 1.1, 6.2, 10.1, 13.1_

  - [x] 1.4 Configure native platform permissions
    - Configure Tauri's `tauri.conf.json` (or `capabilities/default.json`) with explicit `fs` scope path whitelist restricting file system access to the app data directory and user-selected paths only
    - Configure Capacitor's `AndroidManifest.xml` with `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` (or scoped storage for API 30+), and `RECORD_AUDIO` permissions
    - Configure iOS `Info.plist` with `NSMicrophoneUsageDescription` (privacy description for Web Speech API microphone access) and any required file access entitlements
    - These permissions must be in place before image store (8.1) and voice input (16.2) tasks
    - _Requirements: 2.2, 20.1, 20.5, 28.3_

- [x] 2. Implement Zustand store with Immer middleware
  - [x] 2.1 Implement noteSlice with all note actions
    - Create `Shared/src/lib/store/noteSlice.ts` with createNote, updateNote, deleteNote, restoreNote, permanentDelete, emptyTrash, setActiveNote, togglePin, toggleFavorite, toggleHidden, toggleLocked, importNotes, renameTag, mergeRemoteNotes
    - Implement soft-delete pattern (set deletedAt timestamp)
    - Implement tag extraction from content on updateNote
    - _Requirements: 1.1, 2.8, 2.10, 5.4, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4_

  - [ ]* 2.2 Write property test for tag extraction
    - **Property 2: Tag Extraction Correctness**
    - **Validates: Requirements 2.10, 5.1**

  - [ ]* 2.3 Write property test for tag rename propagation
    - **Property 3: Tag Rename Propagation**
    - **Validates: Requirements 5.4**

  - [ ]* 2.4 Write property test for soft delete
    - **Property 8: Soft Delete Preserves Note**
    - **Validates: Requirements 9.1**

  - [x] 2.5 Implement folderSlice with folder actions
    - Create `Shared/src/lib/store/folderSlice.ts` with createFolder, updateFolder, deleteFolder, setActiveFolder, reorderFolders, moveNoteToFolder, mergeRemoteFolders
    - Enforce max 3 levels of nesting and single-folder assignment
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8_

  - [ ]* 2.6 Write property test for folder deletion
    - **Property 11: Folder Deletion Unassigns Notes**
    - **Validates: Requirements 6.5**

  - [x] 2.7 Implement syncSlice and uiSlice
    - Create `Shared/src/lib/store/syncSlice.ts` with triggerSync, setSyncStatus, setSyncError
    - Create `Shared/src/lib/store/uiSlice.ts` with toggleTheme, setActiveTag, setSearch, toggleSidebar, toggleNoteList, setImmersiveMode
    - _Requirements: 10.1, 13.1, 13.2, 13.3, 23.1, 23.2, 23.3_

  - [x] 2.8 Create Zustand store with subscribeWithSelector and atomic selectors
    - Create `Shared/src/lib/store/createStore.ts` combining all slices with `immer` and `subscribeWithSelector` middleware
    - Implement atomic selectors: useActiveNote, useNoteCount, useFilteredNotes, useSyncStatus, useTheme
    - _Requirements: 7.3, 7.7, 29.9_

  - [ ]* 2.9 Write property test for note list filtering invariants
    - **Property 10: Note List Filtering Invariants**
    - **Validates: Requirements 7.3, 7.7**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement IndexedDB storage and persistence layer
  - [x] 4.1 Implement IndexedDB storage with debounced persistence
    - Create `Shared/src/lib/storage/indexedDB.ts` with idbGet, idbSet helpers
    - Implement 500ms debounced state persistence
    - Implement degraded read-only mode when IndexedDB is unavailable
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 4.2 Implement state loading and localStorage migration
    - Create migration logic to load from IndexedDB on startup, falling back to localStorage migration
    - Implement welcome note creation on first launch
    - Inject default values for missing schema fields (locked, hidden, deletedAt, folderId)
    - _Requirements: 3.5, 3.6, 27.1, 27.2_

  - [ ]* 4.3 Write property test for schema migration defaults
    - **Property 16: Schema Migration Injects Defaults**
    - **Validates: Requirements 27.2**

  - [x] 4.4 Implement migration runner with backup and rollback
    - Create `Shared/src/lib/migrations/runner.ts` with sequential migration execution, backup table creation, and rollback on failure
    - Implement Safe Mode UI trigger on migration failure
    - _Requirements: 27.4, 27.5_

  - [x] 4.5 Implement trash auto-cleanup (30-day expiry)
    - Add startup cleanup and 24-hour periodic check for expired soft-deleted notes
    - _Requirements: 9.5, 9.6_

  - [ ]* 4.6 Write property test for trash cleanup by age
    - **Property 9: Trash Cleanup by Age**
    - **Validates: Requirements 9.5, 9.6**

- [ ] 5. Implement sync engine (three-layer architecture)
  - [x] 5.1 Implement OfflineQueue with FIFO ordering and dedup
    - Create `Shared/src/lib/sync/OfflineQueue.ts` with enqueue (dedup by entityId + type), drain with per-op retry, localStorage persistence
    - Support all mutation types: upsert_note, delete_note, upsert_folder, delete_folder
    - _Requirements: 10.8, 10.11, 10.13_

  - [ ]* 5.2 Write property test for offline queue FIFO with dedup
    - **Property 5: Offline Queue FIFO with Dedup**
    - **Validates: Requirements 10.8, 10.11**

  - [x] 5.3 Implement SyncTransport (Supabase I/O layer)
    - Create `Shared/src/lib/sync/SyncTransport.ts` with ISyncTransport interface and SupabaseSyncTransport implementation
    - Implement pullNotes, pullFolders, pushNotes, pushFolders, deleteNote, deleteFolder, subscribe, updateSyncMeta
    - _Requirements: 10.1, 10.9, 10.10_

  - [x] 5.4 Implement ConflictResolver (LWW strategy)
    - Create `Shared/src/lib/sync/ConflictResolver.ts` with IConflictResolver interface and LWWConflictResolver
    - Implement last-write-wins with conflict copy creation, preserving local pin/favorite metadata
    - Generate conflict copy title with `{title}_冲突副本_{YYYYMMDD}` format
    - _Requirements: 10.3, 10.4, 10.5, 10.12_

  - [ ]* 5.5 Write property test for LWW merge
    - **Property 6: Last-Write-Wins Merge**
    - **Validates: Requirements 10.3**

  - [ ]* 5.6 Write property test for conflict copy title format
    - **Property 7: Conflict Copy Title Format**
    - **Validates: Requirements 10.5**

  - [x] 5.7 Implement SyncEngine orchestration with state machine
    - Create `Shared/src/lib/sync/SyncEngine.ts` with full state machine (Idle → Syncing → Pull → Merge → Push → ProcessQueue → Synced)
    - Implement exponential backoff retry (5s, 10s, 20s, 40s, 80s, max 5 retries)
    - Implement active-editing buffering for real-time updates
    - Implement 10s debounced sync trigger on local changes
    - _Requirements: 10.1, 10.2, 10.4, 10.6, 10.7, 10.9_

  - [x] 5.8 Implement legacy sync queue migration
    - Parse and convert existing offline delete operations into unified queue format
    - _Requirements: 27.6_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement editor utilities and debounce logic
  - [x] 7.1 Implement adaptive debounce computation
    - Create `Shared/src/lib/editor/debounce.ts` with computeDebounceMs function
    - Implement complexity detection (char count, images, tables) and adaptive scaling (1.5x, capped at 3000ms)
    - _Requirements: 2.6, 2.7_

  - [ ]* 7.2 Write property test for debounce interval computation
    - **Property 4: Debounce Interval Computation**
    - **Validates: Requirements 2.6, 2.7**

  - [x] 7.3 Implement incremental/chunked serialization for large notes
    - Use TipTap/ProseMirror incremental update mechanism to serialize only diffs/deltas when editor state changes, avoiding full document re-serialization on every save
    - For notes > 100KB where full serialization is unavoidable (e.g., initial load, export), chunk the TipTap JSON into smaller pieces (per top-level node) and serialize incrementally to avoid blocking the main thread
    - Implement a content-hash cache so unchanged document sections are not re-stringified
    - Fallback: if incremental tracking is unavailable (e.g., paste of large content), use requestIdleCallback to serialize in idle frames
    - _Requirements: 2.6, 29.1, 29.10_

- [ ] 8. Implement image store with reference counting
  - [x] 8.1 Implement IImageStore interface and platform implementations
    - Create `Shared/src/lib/imageStore/imageStore.ts` with save, load, addRef, removeRef, cleanOrphans, getUsage
    - Implement Tauri FS, Capacitor Filesystem, and IndexedDB fallback implementations
    - Implement asset URI format: `asset://local/{id}.{ext}`
    - _Requirements: 2.2, 9.7_

  - [x] 8.2 Implement image compression pipeline
    - Create compression function: 5MB → 2MB at 80% quality with iterative quality reduction
    - Implement threshold detection (>100KB → native storage, >5MB → compress first)
    - _Requirements: 2.3, 14.3_

  - [ ]* 8.3 Write property test for image storage threshold
    - **Property 17: Image Storage Threshold**
    - **Validates: Requirements 2.2, 2.3**

- [ ] 9. Implement note history (snapshots)
  - [x] 9.1 Implement NoteHistory module with snapshot management
    - Create `Shared/src/lib/noteHistory/noteHistory.ts` with createSnapshot, getSnapshots, clearSnapshots
    - Enforce 5-minute minimum interval between snapshots, content-change requirement, and 50-snapshot cap per note
    - Store snapshots in IndexedDB 'snapshots' object store
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 9.2 Write property test for note history snapshot invariants
    - **Property 15: Note History Snapshot Invariants**
    - **Validates: Requirements 4.1, 4.2**

- [ ] 10. Implement PIN security module
  - [x] 10.1 Implement PBKDF2 PIN hashing and verification
    - Create `Shared/src/lib/security/pinSecurity.ts` with hashPin, verifyPin, getLockoutDuration, signCounter
    - Implement 100K iterations, SHA-256, 16-byte random salt, hex-encoded derived key
    - Implement lockout escalation: 3→60s, 6→5min, 10→30min
    - Implement HMAC-signed attempt counter
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ]* 10.2 Write property test for PIN hash verification round-trip
    - **Property 12: PIN Hash Verification Round-Trip**
    - **Validates: Requirements 11.1, 11.2**

  - [ ]* 10.3 Write property test for PIN lockout escalation
    - **Property 13: PIN Lockout Escalation**
    - **Validates: Requirements 11.3**

  - [x] 10.4 Implement legacy PIN migration
    - Detect legacy plaintext PIN or SHA-256 hash, verify against legacy format, migrate to PBKDF2 on success
    - _Requirements: 11.6, 27.3_

- [ ] 11. Implement Markdown parser and printer
  - [x] 11.1 Implement Markdown-to-TipTap JSON parser
    - Create `Shared/src/utils/markdown.ts` with importMarkdownToNote function
    - Support headings, lists, task lists, blockquotes, code blocks, horizontal rules, images, inline marks (bold, italic, code, strikethrough)
    - Extract title from first heading, tags from `Tags:` line
    - _Requirements: 14.1, 26.1_

  - [x] 11.2 Implement TipTap JSON-to-Markdown printer
    - Create noteToMarkdown function converting TipTap JSON nodes back to Markdown syntax
    - Preserve all supported node types and inline marks
    - _Requirements: 15.2, 15.4, 26.2_

  - [ ]* 11.3 Write property test for Markdown round-trip
    - **Property 1: Markdown Round-Trip**
    - **Validates: Requirements 26.1, 26.2, 26.3**

- [ ] 12. Implement AI context assembly
  - [x] 12.1 Implement AI context assembly with keyword scoring and budget truncation
    - Create `Shared/src/lib/ai/contextAssembly.ts` with assembleContext function
    - Implement keyword overlap scoring with recency fallback (< 3 matches)
    - Implement 8000-token budget with truncation preserving title + first paragraph
    - Limit to 10 notes maximum
    - _Requirements: 16.3, 16.4_

  - [ ]* 12.2 Write property test for AI context budget constraint
    - **Property 14: AI Context Budget Constraint**
    - **Validates: Requirements 16.3, 16.4**

- [ ] 13. Implement tag graph builder
  - [x] 13.1 Implement tag graph data builder for D3 visualization
    - Create `Shared/src/lib/tagGraph/tagGraph.ts` with buildTagGraph function
    - Implement node selection (max 30, centered on active note), edge computation (shared tags, temporal proximity, semantic similarity)
    - Implement async embedding fetch with graceful degradation
    - _Requirements: 19.1, 19.2, 19.3, 19.7_

  - [ ]* 13.2 Write property test for tag graph node limit
    - **Property 18: Tag Graph Node Limit**
    - **Validates: Requirements 19.2**

- [x] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Implement Desktop UI components
  - [x] 15.1 Implement LeftSidebar with tags, folders, navigation views, and On This Day
    - Create `Desktop/src/components/LeftSidebar.tsx` (or refactor existing) with tag list (sorted by frequency), folder tree, navigation views (最近, 收藏, 回收站), On This Day section
    - Implement tag click filtering, double-click rename, folder click filtering
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 6.1, 6.3, 24.1, 24.2_

  - [x] 15.2 Implement NoteList with search, sort, date grouping, and pinned notes
    - Create `Desktop/src/components/NoteList.tsx` (or refactor existing) with date grouping (今天, 昨天, 本周, monthly), pinned-first ordering, search with pinyin matching, sort modes
    - Implement conflict badge display, trash view with restore/delete buttons
    - Implement windowed rendering for 500+ notes performance
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7, 7.8, 7.10, 10.6_

  - [x] 15.3 Implement NoteEditor with TipTap 3 and all extensions
    - Create `Desktop/src/components/NoteEditor.tsx` (or refactor existing) with TipTap 3 editor, all block types, inline marks, text alignment
    - Implement adaptive debounce save, immersive mode (15s idle), tag highlighting
    - Implement image paste/drop with compression and asset URI storage
    - Implement large note incremental/chunked serialization
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13_

  - [x] 15.4 Implement SlashMenu command palette
    - Create `Desktop/src/components/SlashMenu.tsx` (or refactor existing) with commands for heading 1-3, bullet list, numbered list, task list, blockquote, code block, horizontal rule, image
    - Trigger on `/` at line start or after space
    - _Requirements: 21.1, 21.2, 21.3_

  - [x] 15.5 Implement AppLock and PIN verification UI
    - Create `Desktop/src/components/AppLock.tsx` (or refactor existing) with full-screen PIN entry, lockout display, PIN creation flow
    - Implement 5-minute inactivity auto-lock
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 29.8_

  - [x] 15.6 Implement SettingsPanel
    - Create `Desktop/src/components/SettingsPanel.tsx` (or refactor existing) with theme toggle, sync config, AI provider config, app lock toggle, PIN reset, stats display
    - _Requirements: 25.1, 25.2, 25.3, 25.4_

  - [x] 15.7 Implement ImportWizard with Markdown, text, and JSON support
    - Create `Desktop/src/components/ImportWizard.tsx` (or refactor existing) with multi-file selection, Markdown parsing with image resolution, text import, JSON backup import
    - Implement image compression for imports > 5MB, error handling for failed imports
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_

  - [x] 15.8 Implement Export system (JSON, Markdown, PDF, clipboard, share)
    - Create `Desktop/src/lib/exportData.ts` (or refactor existing) with JSON export, Markdown export, PDF via print dialog, clipboard copy, Web Share API
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ] 16. Implement AI Assistant and Voice Input
  - [x] 16.1 Implement AI Assistant panel with provider setup and streaming
    - Create `Desktop/src/components/AskAI.tsx` (or refactor existing) with setup wizard, provider selection (MiniMax, Kimi, GLM, Qwen, OpenRouter), SSE streaming, conversation history (20 messages in sessionStorage)
    - Implement Chinese system prompt for personal note assistant
    - _Requirements: 16.1, 16.2, 16.5, 16.6, 16.7_

  - [x] 16.2 Implement Voice Input with Web Speech API
    - Create `Desktop/src/components/VoiceInput.tsx` (or refactor existing) with microphone button, continuous zh-CN recognition, interim results display, text insertion at cursor
    - Implement 10s timeout, network error handling, permission check
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_

- [ ] 17. Implement Daily Review and Weekly Report
  - [x] 17.1 Implement DailyReview panel
    - Create `Desktop/src/components/DailyReview.tsx` (or refactor existing) with today's stats (notes edited, word count, tags used), today's notes list, random historical note
    - Implement 21:00 toast notification suggestion
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

  - [x] 17.2 Implement WeeklyReport panel
    - Create `Desktop/src/components/WeeklyReport.tsx` (or refactor existing) with aggregate stats, daily distribution bar chart, most active day, top 5 tags, week/month toggle
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

- [ ] 18. Implement Tag Graph visualization
  - [x] 18.1 Implement TagGraph component with D3 force-directed layout
    - Create `Desktop/src/components/TagGraph.tsx` (or refactor existing) with D3 force simulation, zoom (0.2x-4x), pan, node dragging, hover highlighting, click detail panel
    - Implement color-coded edges (tag=dark, time=medium, semantic=light), loading indicator for async embeddings
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7_

- [ ] 19. Implement keyboard shortcuts and layout
  - [x] 19.1 Implement global keyboard shortcuts
    - Wire Ctrl+N (new note), Ctrl+T (template picker), Ctrl+D (toggle theme), Ctrl+/ (shortcuts panel), Ctrl+B (toggle sidebar), Ctrl+\\ (toggle note list), Escape (close editor), Ctrl+K (insert link)
    - Create `Desktop/src/components/ShortcutsPanel.tsx` (or refactor existing) for shortcuts reference
    - _Requirements: 22.1, 22.2, 22.3_

  - [x] 19.2 Implement three-panel resizable layout
    - Implement left sidebar (220px, collapsible), note list (200-400px, resizable, collapsible), editor (flex)
    - Implement drag handle for note list width, expand buttons when collapsed
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5_

- [ ] 20. Implement template system and note creation flow
  - [x] 20.1 Implement TemplatePicker with template options
    - Create `Desktop/src/components/TemplatePicker.tsx` (or refactor existing) with blank note, daily diary, meeting notes, todo list templates
    - Implement first-3-notes detection (show template picker for new users)
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

- [x] 21. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 22. Implement Mobile platform adaptations
  - [x] 22.1 Implement mobile single-panel stack navigation
    - Create `Mobile/src/lib/mobileLayout.ts` with panel stack navigation and swipe gestures for screens < 768px
    - Implement immediate persist on app background (visibilitychange)
    - _Requirements: 28.1, 28.5_

  - [x] 22.2 Implement mobile-specific UI adaptations
    - Handle virtual keyboard viewport adjustment
    - Implement native microphone permission request
    - Implement persistent offline indicator
    - _Requirements: 28.2, 28.3, 28.4_

- [ ] 23. Implement error handling and monitoring
  - [x] 23.1 Implement ErrorBoundary with three-tier architecture
    - Create app-level, panel-level, and component-level error boundaries
    - Implement Safe Mode UI for fatal errors (export-only)
    - _Requirements: 29.7_

  - [x] 23.2 Implement Sentry integration
    - Initialize Sentry with platform context, breadcrumbs for key actions, PII scrubbing
    - _Requirements: 29.7_

- [ ] 24. Implement semantic search fallback and note list enhancements
  - [x] 24.1 Implement semantic search with vector embeddings and full-text fallback
    - Implement Supabase vector embedding search when keyword results < 3
    - Implement full-text content search fallback when embeddings unavailable
    - Implement search result highlighting
    - _Requirements: 7.5, 7.9, 7.10_

- [ ] 25. Wire all components together and integration
  - [x] 25.1 Wire store to IndexedDB persistence with subscription
    - Connect Zustand store changes to debounced IndexedDB persistence
    - Connect store mutations to offline queue enqueue
    - Wire sync engine real-time subscription to store mergeRemoteNotes
    - _Requirements: 3.1, 3.2, 10.2, 10.9_

  - [x] 25.2 Wire editor saves to note history snapshots
    - Connect editor save events to NoteHistory snapshot creation (5-min interval check)
    - Wire permanent delete to snapshot cleanup
    - _Requirements: 4.1, 4.5_

  - [x] 25.3 Wire image store to editor and note deletion
    - Connect editor image insertion to ImageStore.save with ref counting
    - Connect permanent note deletion to ImageStore orphan cleanup
    - _Requirements: 2.2, 9.7_

  - [x] 25.4 Write integration tests for sync flow
    - Test full sync cycle: pull → merge → push → queue drain
    - Test real-time subscription handling
    - Test conflict detection and copy creation
    - _Requirements: 10.1, 10.4, 10.5, 10.9_

  - [x] 25.5 Write integration tests for persistence round-trip
    - Test IndexedDB persist and reload
    - Test localStorage migration path
    - Test migration runner with rollback
    - _Requirements: 3.1, 3.5, 27.1, 27.4_

- [x] 26. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Property test tasks marked with `*` (2.2–2.9, 4.3, 4.6, 5.2, 5.5, 5.6, 7.2, 8.3, 9.2, 10.2, 10.3, 11.3, 12.2, 13.2) are optional and can be skipped for faster MVP
- Integration tests (25.4, 25.5) are NOT optional — sync flow and persistence round-trip tests are critical for a local-first architecture and must be implemented
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using `fast-check`
- Unit tests validate specific examples and edge cases
- The Shared package must be built before Desktop/Mobile can consume it
- All UI text is in Chinese (Simplified); code identifiers are English
- Testing uses Vitest with jsdom environment and `fast-check` for property-based tests
- Native platform permissions (1.4) must be configured before image store (8.1) and voice input (16.2) tasks

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1", "2.5", "2.7", "10.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.6", "2.8", "10.2", "10.3"] },
    { "id": 4, "tasks": ["2.9", "4.1", "5.1", "7.1", "11.1"] },
    { "id": 5, "tasks": ["4.2", "4.4", "4.5", "5.2", "5.3", "5.4", "7.2", "7.3", "8.1", "9.1", "10.4", "11.2"] },
    { "id": 6, "tasks": ["4.3", "4.6", "5.5", "5.6", "5.7", "8.2", "9.2", "11.3", "12.1", "13.1"] },
    { "id": 7, "tasks": ["5.8", "8.3", "12.2", "13.2"] },
    { "id": 8, "tasks": ["15.1", "15.2", "15.4", "15.5", "15.6", "15.7", "15.8", "16.1", "16.2", "17.1", "17.2", "18.1", "19.1", "19.2", "20.1", "22.1", "22.2", "23.1", "23.2"] },
    { "id": 9, "tasks": ["15.3", "24.1"] },
    { "id": 10, "tasks": ["25.1", "25.2", "25.3"] },
    { "id": 11, "tasks": ["25.4", "25.5"] }
  ]
}
```









