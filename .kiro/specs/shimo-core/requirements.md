# Requirements Document

## Introduction

This document captures the current implementation of Shimo (拾墨), a cross-platform note-taking application. Shimo provides rich-text editing, tag-based organization, cloud sync, AI-assisted writing, and security features. The application runs on Desktop (Tauri 2) and Mobile (Capacitor 8) platforms sharing a common TypeScript library (`@notepro/shared`). This requirements document describes the system as-is, serving as a baseline for future evolution.

## Glossary

- **Editor**: The TipTap 3 (ProseMirror) rich-text editing component that handles note content creation and modification
- **Store**: The centralized state management system using Zustand with Immer middleware for immutable updates, providing atomic selectors to prevent unnecessary re-renders across platforms
- **Note**: The primary data entity containing title, content (TipTap JSON), tags, and metadata
- **Folder**: An organizational container for notes with name, emoji, and optional parent hierarchy
- **Tag**: A text label embedded in note content using `#tag` syntax, automatically extracted for organization
- **Sync_Engine**: The module responsible for bidirectional data synchronization between local IndexedDB and remote Supabase
- **PIN_Security**: The client-side authentication module using PBKDF2-hashed PINs (minimum 100,000 iterations) with per-device salt
- **Template_System**: The predefined note structures (blank, daily diary, meeting notes, todo list) offered during note creation
- **Tag_Graph**: The D3-powered force-directed visualization showing relationships between notes based on shared tags, temporal proximity, and semantic similarity
- **Daily_Review**: The modal panel showing today's writing statistics, note list, and a random historical note
- **Weekly_Report**: The modal panel showing aggregated writing statistics over a week or month period
- **AI_Assistant**: The chat-based interface that answers questions about the user's notes using configured LLM providers
- **Import_Wizard**: The modal interface for importing notes from Markdown, plain text, or JSON backup files
- **Note_History**: The versioning system that automatically snapshots note content at intervals
- **Voice_Input**: The Web Speech API integration for speech-to-text input in the editor
- **Soft_Delete**: The deletion pattern where notes are marked with a `deletedAt` timestamp rather than immediately removed
- **IndexedDB_Storage**: The browser-based persistent storage layer with degraded read-only fallback when IndexedDB is unavailable
- **Supabase**: The backend-as-a-service platform providing authentication, database, and real-time subscriptions
- **Left_Sidebar**: The collapsible left navigation panel (220px) displaying tags, navigation views (最近, 收藏, 回收站), On This Day section, and folder hierarchy
- **Note_List**: The resizable middle panel (200-400px) displaying notes filtered by active tag/folder, with search, sort, and date grouping
- **App_Lock**: The full-screen PIN entry gate displayed on application startup when app lock is enabled
- **Export_System**: The module responsible for converting notes to JSON, Markdown, or PDF formats and triggering downloads or clipboard operations
- **Slash_Menu**: The contextual command palette triggered by typing `/` that offers block-type insertion commands
- **Settings_Panel**: The modal overlay providing application configuration controls (theme, sync, AI, security)
- **Folder_System**: The hierarchical organizational structure allowing notes to be grouped into named folders with emoji identifiers
- **Image_Store**: The platform-native file storage layer (Tauri FS on desktop, Capacitor Filesystem on mobile) that persists image assets outside of IndexedDB, referenced in TipTap JSON via local asset URIs (asset://local/{id}.{ext})

## Assumptions and Dependencies

- The application assumes IndexedDB is available in the runtime environment; degraded read-only mode is the fallback (see Requirement 3)
- Cloud sync requires a configured Supabase instance; the application is fully functional offline without it
- AI features require user-configured API keys for supported LLM providers; no built-in API keys are shipped
- Mobile builds target iOS 16+ and Android 10+ via Capacitor 8
- Desktop builds target Windows 10+, macOS 12+, and Linux (Ubuntu 22.04+) via Tauri 2
- The Web Speech API for voice input requires network access on Chromium-based browsers (Google speech services)

## Requirements

### Requirement 1: Note Creation

**User Story:** As a user, I want to create new notes quickly, so that I can capture thoughts without friction.

#### Acceptance Criteria

1. WHEN the user presses Ctrl+N or clicks the "新建笔记" button, THE Store SHALL create a new Note with a UUID identifier, empty title, empty content, no tags, current timestamp for createdAt and updatedAt, and set it as the active note
2. WHEN a new note is created, THE Editor SHALL focus the title input field
3. WHEN the user has created fewer than 3 notes (tracked in localStorage), THE Template_System SHALL display the template picker modal instead of creating a blank note on Ctrl+N
4. WHEN the user presses Ctrl+T, THE Template_System SHALL display the template picker modal with options: blank note, daily diary, meeting notes, and todo list
5. WHEN the user selects a template, THE Store SHALL create a Note pre-populated with the template's title, structured TipTap JSON content, and default tags

### Requirement 2: Note Editing

**User Story:** As a user, I want to edit notes with rich-text formatting, so that I can structure my thoughts clearly.

#### Acceptance Criteria

1. THE Editor SHALL support the following block types: paragraphs, headings (levels 1-3), bullet lists, ordered lists, task lists with checkboxes, blockquotes, code blocks with syntax highlighting, horizontal rules, tables (resizable), and images (inline and base64)
2. WHEN the user inserts an image into the editor (via paste, drag-drop, or slash command), THE Editor SHALL store images larger than 100KB using the platform's native file storage and reference them via local asset URI in the TipTap JSON, rather than embedding as inline Base64
3. WHEN the user pastes or drops an image exceeding 5MB into the editor, THE Editor SHALL compress the image to a maximum of 2MB (lossy compression at 80% quality) before storing it in the Image_Store, and SHALL display a brief notification indicating the image was compressed
4. THE Editor SHALL support the following inline marks: bold, italic, underline, strikethrough, code, text color, font family, font size, and hyperlinks
5. THE Editor SHALL support text alignment (left, center, right) for paragraphs and headings
6. WHEN the user types content, THE Editor SHALL debounce saves at 300ms for notes with low serialization complexity (under 3000 characters and no embedded images or tables) and 1000ms for notes with higher complexity
7. WHEN a save operation exceeds 200ms duration, THE Editor SHALL increase the debounce interval for subsequent saves to 1.5x the measured save duration, capped at 3000ms
8. WHEN a save completes, THE Store SHALL update the note's content field with stringified TipTap JSON and update the updatedAt timestamp
9. WHEN the user types `#` followed by Chinese or alphanumeric characters, THE Editor SHALL visually highlight the tag with an inline decoration
10. WHEN content is saved, THE Store SHALL extract all `#tag` patterns from the content and update the note's tags array
11. WHEN the user stops typing for 15 seconds, THE Editor SHALL enter immersive mode with reduced UI chrome and ambient falling petals animation
12. WHEN the user presses Escape while editing, THE Store SHALL deselect the active note and return to the note list view
13. WHEN immersive mode is active, THE Editor SHALL display a subtle exit control, and THE Settings_Panel SHALL provide an option to disable immersive mode and falling petals animation entirely

### Requirement 3: Note Content Persistence

**User Story:** As a user, I want my notes to be automatically saved, so that I never lose my work.

#### Acceptance Criteria

1. THE IndexedDB_Storage SHALL persist the full application state (notes, theme, activeTag) to IndexedDB using a key-value store
2. WHEN the application state changes, THE IndexedDB_Storage SHALL debounce persistence writes by 500ms
3. IF IndexedDB is unavailable, THEN THE IndexedDB_Storage SHALL enter a degraded read-only mode, display a persistent notification informing the user that data cannot be saved, and prevent write operations that would exceed localStorage capacity
4. IF IndexedDB is unavailable and the application has previously persisted data to localStorage (pre-migration), THEN THE IndexedDB_Storage SHALL load existing localStorage data as read-only and display a warning that new changes will not be persisted until IndexedDB becomes available
5. WHEN the application starts, THE Store SHALL load persisted state from IndexedDB, migrating from localStorage if no IndexedDB data exists
6. WHEN the application starts for the first time (no persisted data and no welcome flag), THE Store SHALL create a welcome note with usage tips appropriate to the platform

### Requirement 4: Note Version History

**User Story:** As a user, I want to access previous versions of my notes, so that I can recover from unwanted changes.

#### Acceptance Criteria

1. WHEN a note is saved and at least 5 minutes have elapsed since the last snapshot and the content has changed, THE Note_History SHALL create a new snapshot containing timestamp, title, content, and word count
2. THE Note_History SHALL retain a maximum of 50 snapshots per note, discarding the oldest when the limit is exceeded
3. WHEN the user clicks the version history button, THE Editor SHALL display a list of available snapshots in reverse chronological order
4. WHEN the user selects a historical snapshot, THE Editor SHALL display the snapshot content for review
5. WHEN a note is permanently deleted, THE Note_History SHALL clear all associated snapshots

### Requirement 5: Note Organization with Tags

**User Story:** As a user, I want to organize notes with tags, so that I can find related content easily.

#### Acceptance Criteria

1. THE Left_Sidebar SHALL display all tags extracted from active notes, sorted by frequency (most used first), with note counts
2. WHEN the user clicks a tag in the sidebar, THE Store SHALL filter the note list to show only notes containing that tag
3. WHEN the user double-clicks a tag in the sidebar, THE Left_Sidebar SHALL enable inline renaming of the tag
4. WHEN a tag is renamed, THE Store SHALL update the tag in all notes' tags arrays and replace `#oldTag` references within TipTap JSON content
5. THE Left_Sidebar SHALL display navigation views: "最近" (all active notes), "收藏" (favorited notes), and "回收站" (soft-deleted notes)

### Requirement 6: Folder Organization

**User Story:** As a user, I want to organize notes into folders, so that I can group related notes hierarchically.

#### Acceptance Criteria

1. THE Left_Sidebar SHALL display a folder tree showing all user-created folders with their emoji and name
2. WHEN the user creates a folder, THE Store SHALL create a Folder with a UUID, user-provided name, optional emoji, optional parentId for nesting, and current timestamp
3. WHEN the user clicks a folder in the sidebar, THE Note_List SHALL filter to show only notes assigned to that folder
4. WHEN the user drags a note onto a folder, THE Store SHALL update the note's folderId field to the target folder's ID
5. WHEN the user deletes a folder, THE Store SHALL unassign all notes from that folder (set folderId to null) but SHALL NOT delete the notes themselves
6. THE Folder_System SHALL support up to 3 levels of nesting (root → child → grandchild)
7. WHEN a folder is selected in the sidebar and a tag filter is also active, THE Note_List SHALL display only notes that belong to the selected folder AND contain the active tag (intersection filter)
8. THE Folder_System SHALL restrict notes to a single folder assignment (a note's folderId references exactly one folder or null); notes are not assignable to multiple folders simultaneously

### Requirement 7: Note List and Search

**User Story:** As a user, I want to browse and search my notes, so that I can quickly find what I need.

#### Acceptance Criteria

1. THE Note_List SHALL display notes grouped by date (今天, 昨天, 本周, and monthly groups) sorted by updatedAt descending
2. THE Note_List SHALL show for each note: title (or content preview if untitled), content preview (first 60 characters), up to 3 tags, and formatted timestamp
3. THE Note_List SHALL always display pinned notes at the top regardless of date grouping
4. WHEN the user types in the search input, THE Note_List SHALL filter notes by matching the query against title, content preview, and tags using pinyin-aware matching
5. WHEN keyword search returns fewer than 3 results and embedding is available, THE Note_List SHALL perform semantic search via Supabase vector embeddings and append additional results
6. THE Note_List SHALL support sort modes: by update time (default), by creation time, and by title (Chinese locale-aware)
7. THE Note_List SHALL exclude hidden notes and soft-deleted notes from the default view
8. WHEN viewing the trash (activeTag === '__trash'), THE Note_List SHALL show restore and permanent delete buttons for each note
9. WHEN semantic search is triggered but embeddings are not available (Supabase not configured or embedding generation pending), THE Note_List SHALL fall back to full-text content search across all note bodies
10. WHEN search results are displayed, THE Note_List SHALL highlight matching text fragments in the title and content preview using a visually distinct background color

### Requirement 8: Note Metadata Operations

**User Story:** As a user, I want to pin, favorite, hide, and lock notes, so that I can manage note visibility and importance.

#### Acceptance Criteria

1. WHEN the user toggles pin on a note, THE Store SHALL set the note's `pinned` field to the opposite boolean value
2. WHEN the user toggles favorite on a note, THE Store SHALL set the note's `favorited` field to the opposite boolean value
3. WHEN the user toggles hidden on a note, THE Store SHALL set the note's `hidden` field to the opposite boolean value, removing it from the default note list
4. WHEN the user toggles lock on a note, THE Store SHALL set the note's `locked` field to the opposite boolean value
5. WHEN a locked note is selected and the user has not verified the PIN in the current session, THE Editor SHALL display a PIN verification prompt instead of the note content

### Requirement 9: Soft Delete and Trash

**User Story:** As a user, I want deleted notes to be recoverable for a period, so that I can undo accidental deletions.

#### Acceptance Criteria

1. WHEN the user deletes a note, THE Store SHALL set the note's `deletedAt` field to the current timestamp (soft delete) and deselect it if active
2. WHEN the user restores a note from trash, THE Store SHALL set the note's `deletedAt` field to null
3. WHEN the user permanently deletes a note, THE Store SHALL remove the note from the notes array entirely
4. WHEN the user empties the trash, THE Store SHALL remove all notes with non-null `deletedAt` from the notes array
5. WHEN the application starts, THE Store SHALL permanently delete all notes whose `deletedAt` timestamp is older than 30 days
6. WHILE the application is running, THE Store SHALL perform a periodic trash cleanup check every 24 hours, permanently deleting all notes whose `deletedAt` timestamp is older than 30 days
7. WHEN a note is permanently deleted, THE Image_Store SHALL identify and remove all image assets referenced exclusively by that note (not shared with other notes) to prevent orphaned files from accumulating on the filesystem

### Requirement 10: Cloud Sync via Supabase

**User Story:** As a user, I want my notes synchronized across devices, so that I can access them anywhere.

#### Acceptance Criteria

1. WHEN the user is authenticated and Supabase is configured, THE Sync_Engine SHALL perform a full sync on login (pull remote changes, then push local changes)
2. WHEN local notes change and the user is authenticated, THE Sync_Engine SHALL trigger a debounced sync after 10 seconds of inactivity
3. THE Sync_Engine SHALL use last-write-wins conflict resolution based on the `updatedAt` timestamp as the current baseline, preserving local pin/favorite metadata when remote content is newer
4. WHEN both local and remote versions of a note have been modified since the last sync (both have different content and updatedAt timestamps diverge from the last-known common ancestor), THE Sync_Engine SHALL detect the conflict, apply last-write-wins for automatic resolution, and display a notification to the user indicating which note was overwritten and offering an option to view the discarded version
5. WHEN a conflict is detected, THE Sync_Engine SHALL create an explicit conflict copy note in the user's note list with the title format `{original_title}_冲突副本_{YYYYMMDD}`, containing the overwritten version's content, tags, and a metadata field linking back to the original note's ID, ensuring the user can immediately see and resolve the conflict without navigating to version history
6. WHEN a conflict copy note exists, THE Note_List SHALL display a visual conflict indicator (badge) on both the original note and the conflict copy, and THE Editor SHALL display a banner on the conflict copy offering options to: merge into original (replacing content), keep as separate note (removing conflict metadata), or discard the conflict copy
7. IF a sync operation fails due to network error, THEN THE Sync_Engine SHALL retry with exponential backoff (5s, 10s, 20s, 40s, 80s) up to 5 retries
8. THE Sync_Engine SHALL maintain an offline operation queue in localStorage for delete operations, processing them on the next successful sync
9. WHEN the user is authenticated, THE Sync_Engine SHALL subscribe to Supabase real-time changes and merge incoming note updates using last-write-wins
10. IF Supabase is not configured, THEN THE Sync_Engine SHALL operate in offline-only mode with all data persisted locally
11. THE Sync_Engine SHALL maintain an offline operation queue for ALL mutation operations (create, update, delete), not only deletes, processing them in order on the next successful sync
12. THE Sync_Engine architecture SHALL maintain a clear abstraction boundary between the conflict resolution strategy and the sync transport layer, enabling future migration from LWW to CRDT-based (e.g., Yjs) merge without requiring changes to the sync protocol or storage schema
13. THE Sync_Engine SHALL synchronize Folder entities (create, rename, delete, re-parent) using the same offline queue and conflict detection mechanisms as Note entities

### Requirement 11: PIN Security

**User Story:** As a user, I want to protect my notes with a PIN, so that others cannot access my private content.

#### Acceptance Criteria

1. WHEN the user sets a PIN, THE PIN_Security SHALL hash the PIN using PBKDF2 with a minimum of 100,000 iterations, SHA-256 digest, and a per-device random salt, storing only the derived key in localStorage
2. WHEN the user verifies a PIN, THE PIN_Security SHALL derive the key from the input using PBKDF2 with the same iteration count and device salt, then compare against the stored derived key
3. WHEN PIN verification fails 3 times, THE PIN_Security SHALL lock the input for 60 seconds; after 6 failures, lock for 5 minutes; after 10 failures, lock for 30 minutes
4. THE PIN_Security SHALL sign the attempt counter with the device secret to prevent tampering via localStorage manipulation
5. WHEN the user resets the PIN, THE PIN_Security SHALL clear the stored hash and unlock all encrypted notes
6. IF a legacy plaintext PIN or legacy SHA-256 hash exists from a previous version, THEN THE PIN_Security SHALL verify against the legacy format and migrate to PBKDF2 hashed format on success

### Requirement 12: App Lock

**User Story:** As a user, I want to lock the entire app on startup, so that no one can access my notes without the PIN.

#### Acceptance Criteria

1. WHEN app lock is enabled and a PIN is set, THE App_Lock SHALL display a full-screen PIN entry on application startup
2. WHEN the correct PIN is entered, THE App_Lock SHALL dismiss and render the main application
3. WHEN app lock is enabled but no PIN has been set, THE App_Lock SHALL prompt the user to create a 4-digit PIN
4. THE App_Lock SHALL only be enableable if a PIN has been previously configured (via encrypting a note)

### Requirement 13: Dark/Light Theme

**User Story:** As a user, I want to switch between dark and light themes, so that I can use the app comfortably in different lighting conditions.

#### Acceptance Criteria

1. WHEN the user presses Ctrl+D or toggles the theme in settings, THE Store SHALL switch the theme between 'light' and 'dark'
2. WHEN the theme changes, THE Store SHALL set the `data-theme` attribute on the document root element
3. THE Store SHALL persist the theme preference and restore it on application startup

### Requirement 14: Import

**User Story:** As a user, I want to import notes from other formats, so that I can migrate my existing content to Shimo.

#### Acceptance Criteria

1. WHEN the user selects Markdown files (.md), THE Import_Wizard SHALL parse each file into a Note with extracted title (from first heading), tags (from Tags: line), and TipTap JSON content
2. WHEN a Markdown file contains relative image references (e.g., `![alt](./path/to/image.png)`), THE Import_Wizard SHALL resolve the image path relative to the source file and store accessible images using the platform's native file storage (Tauri filesystem API on desktop, Capacitor Filesystem on mobile), replacing the reference in TipTap JSON with a local asset URI (e.g., `asset://local/{image-id}.{ext}`)
3. WHEN an imported image exceeds 5MB in size, THE Import_Wizard SHALL compress the image to a maximum of 2MB (using lossy compression at 80% quality) before storing it locally, and SHALL display a notification listing which images were compressed
4. IF image resolution fails for any reference (file not found, permission denied, or unsupported format), THEN THE Import_Wizard SHALL strip the broken reference from the imported content and display a warning listing all unresolvable image paths
5. WHEN the user selects plain text files (.txt), THE Import_Wizard SHALL create a Note using the filename as title and file content as body
6. WHEN the user selects a JSON file, THE Import_Wizard SHALL parse it as a Shimo backup (array of Note objects or `{ notes: Note[] }`) and import all notes
7. THE Import_Wizard SHALL support multi-file selection for Markdown and text imports
8. IF import parsing fails, THEN THE Import_Wizard SHALL display an error message and allow the user to retry

### Requirement 15: Export

**User Story:** As a user, I want to export my notes, so that I can back up my data or use it in other applications.

#### Acceptance Criteria

1. WHEN the user chooses JSON export, THE Export_System SHALL generate a JSON file containing all notes with metadata (exportedAt, app name, version) and trigger a browser download
2. WHEN the user chooses Markdown export, THE Export_System SHALL convert all notes to Markdown format (title as H1, tags line, content converted from TipTap JSON) and trigger a download of a combined .md file
3. WHEN the user clicks "导出 PDF" on a single note, THE Export_System SHALL generate an HTML representation of the note and open it in a print dialog
4. WHEN the user clicks "复制为 Markdown" on a single note, THE Export_System SHALL convert the note to Markdown and copy it to the clipboard
5. WHEN the user clicks "分享笔记", THE Export_System SHALL use the Web Share API if available, otherwise copy the Markdown to clipboard

### Requirement 16: AI-Assisted Writing

**User Story:** As a user, I want to ask questions about my notes using AI, so that I can discover insights and connections.

#### Acceptance Criteria

1. WHEN the user opens the AI panel without a configured provider, THE AI_Assistant SHALL display a setup wizard for selecting and configuring an AI provider
2. THE AI_Assistant SHALL support the following providers: MiniMax, Kimi (月之暗面), 智谱 GLM, 通义千问, and OpenRouter — all using OpenAI-compatible API format
3. WHEN the user submits a question, THE AI_Assistant SHALL build context from up to 10 relevant notes (matched by keyword overlap with the question) or the 10 most recent notes if no keyword match, subject to a maximum total context budget of 8000 tokens
4. WHEN the assembled note context exceeds 8000 tokens, THE AI_Assistant SHALL truncate individual notes (preserving title and first paragraph) and reduce the number of included notes until the context fits within budget
5. THE AI_Assistant SHALL stream the response using SSE (Server-Sent Events) and display tokens incrementally
6. THE AI_Assistant SHALL maintain conversation history within the session (up to 20 messages stored in sessionStorage)
7. THE AI_Assistant SHALL use a system prompt instructing the model to act as a personal note assistant, responding in Chinese

### Requirement 17: Daily Review

**User Story:** As a user, I want to review my daily writing activity, so that I can reflect on my progress.

#### Acceptance Criteria

1. WHEN the user opens the daily review panel, THE Daily_Review SHALL display today's statistics: number of notes edited, total word count, and number of unique tags used
2. THE Daily_Review SHALL list all notes updated today in reverse chronological order with title, time, and tags
3. THE Daily_Review SHALL display one randomly selected historical note as a "随机回忆" (random memory) section
4. WHEN the time is 21:00 or later and the user has notes from today, THE application SHALL display a toast notification suggesting daily review (once per day per session)

### Requirement 18: Weekly/Monthly Report

**User Story:** As a user, I want to see my writing statistics over time, so that I can track my habits.

#### Acceptance Criteria

1. THE Weekly_Report SHALL display aggregate statistics for the selected period (week or month): total notes, total word count, and number of tags used
2. THE Weekly_Report SHALL display a daily distribution bar chart showing note counts per day
3. THE Weekly_Report SHALL identify and display the most active day within the period
4. THE Weekly_Report SHALL display the top 5 most frequently used tags with their counts
5. THE Weekly_Report SHALL allow switching between week (7 days) and month (30 days) views

### Requirement 19: Tag Graph Visualization

**User Story:** As a user, I want to visualize relationships between my notes, so that I can discover connections in my thinking.

#### Acceptance Criteria

1. THE Tag_Graph SHALL render a force-directed graph using D3 with nodes representing notes and edges representing relationships (shared tags, temporal proximity, semantic similarity)
2. THE Tag_Graph SHALL display up to 30 nodes, centered on the currently active note if one is selected, using pre-computed and locally cached semantic embeddings for similarity edges
3. WHEN semantic embeddings are not yet cached locally, THE Tag_Graph SHALL render the graph using only tag-based and temporal edges, display a loading indicator for semantic edges, and fetch embeddings asynchronously without blocking graph interaction
4. THE Tag_Graph SHALL support zoom (0.2x to 4x), pan, and node dragging interactions
5. WHEN the user hovers over a node, THE Tag_Graph SHALL highlight connected edges and show edge labels
6. WHEN the user clicks a node, THE Tag_Graph SHALL display a detail panel showing the note's title, tags, content preview, and connected notes
7. THE Tag_Graph SHALL color-code edges by relationship type: tag (dark), time (medium), and semantic (light)

### Requirement 20: Voice Input

**User Story:** As a user, I want to dictate notes using my voice, so that I can capture thoughts hands-free.

#### Acceptance Criteria

1. WHEN the Web Speech API is available, THE Voice_Input SHALL display a microphone button in the editor toolbar
2. WHEN the user clicks the microphone button, THE Voice_Input SHALL start continuous speech recognition in Chinese (zh-CN) and display interim transcription results
3. WHEN a final transcription result is received, THE Voice_Input SHALL insert the recognized text into the editor at the current cursor position
4. WHEN the user clicks the stop button or speech recognition ends, THE Voice_Input SHALL stop recording and return to idle state
5. IF the Web Speech API is not available or microphone permission is denied, THEN THE Voice_Input SHALL hide the microphone button or display an error state
6. IF the speech recognition service does not return a result within 10 seconds of starting, THEN THE Voice_Input SHALL display a timeout error message indicating the speech service is unavailable and return to idle state
7. IF the speech recognition service requires network access and the network is unavailable, THEN THE Voice_Input SHALL display an error state indicating that an internet connection is required for voice input

### Requirement 21: Slash Command Menu

**User Story:** As a user, I want to quickly insert block types using a slash command, so that I can format content without leaving the keyboard.

#### Acceptance Criteria

1. WHEN the user types `/` at the beginning of a line or after a space, THE Editor SHALL display the slash command menu
2. THE Slash_Menu SHALL offer commands for: heading levels 1-3, bullet list, numbered list, task list, blockquote, code block, horizontal rule, and image insertion
3. WHEN the user selects a command, THE Editor SHALL insert the corresponding block type and close the menu

### Requirement 22: Keyboard Shortcuts

**User Story:** As a user, I want keyboard shortcuts for common actions, so that I can work efficiently.

#### Acceptance Criteria

1. THE application SHALL support the following global shortcuts: Ctrl+N (new note), Ctrl+T (template picker), Ctrl+D (toggle theme), Ctrl+/ or ? (shortcuts panel), Ctrl+B (toggle sidebar), Ctrl+\\ (toggle note list), Escape (close editor)
2. THE application SHALL support the following editor shortcuts: Ctrl+K (insert/edit link), / (slash command menu)
3. WHEN the user presses Ctrl+/ or ?, THE application SHALL display a shortcuts reference panel (unless the user is typing in an input or editor without Ctrl)

### Requirement 23: Layout and Navigation

**User Story:** As a user, I want a flexible layout, so that I can focus on writing or browsing as needed.

#### Acceptance Criteria

1. THE application SHALL use a three-panel layout: left sidebar (220px, collapsible), note list (resizable 200-400px, collapsible), and editor (flex)
2. WHEN the sidebar is collapsed via Ctrl+B or the collapse button, THE application SHALL hide the sidebar and show an expand button
3. WHEN the note list is collapsed via Ctrl+\\ or the collapse button, THE application SHALL hide the note list and show an expand button
4. THE note list panel width SHALL be resizable via a drag handle between the list and editor panels
5. THE application SHALL use modal overlays for: settings, tag graph, shortcuts, import wizard, weekly report, daily review, AI assistant, and template picker — no URL-based routing

### Requirement 24: On This Day

**User Story:** As a user, I want to see notes from the same date in previous years, so that I can revisit past thoughts.

#### Acceptance Criteria

1. THE Left_Sidebar SHALL display an "On This Day" section showing notes created on the same month and day in previous years
2. WHEN the user clicks a note in the "On This Day" section, THE Store SHALL set it as the active note

### Requirement 25: Settings Management

**User Story:** As a user, I want to configure application settings, so that I can customize my experience.

#### Acceptance Criteria

1. THE Settings_Panel SHALL provide controls for: dark mode toggle, sync account login/logout, Supabase configuration (URL and key), AI provider selection and API key, app lock toggle, and PIN reset
2. THE Settings_Panel SHALL display informational data: total note count, total tag count, version number, and sync status
3. THE Settings_Panel SHALL display a keyboard shortcuts reference section
4. WHEN the user saves Supabase configuration, THE application SHALL reload to initialize the Supabase client with the new credentials

### Requirement 26: Markdown Parsing and Printing

**User Story:** As a user, I want to import Markdown and export notes as Markdown, so that I can interoperate with other tools.

#### Acceptance Criteria

1. WHEN importing Markdown, THE Parser SHALL convert headings, bullet lists, task lists, blockquotes, code blocks, horizontal rules, images, and inline marks (bold, italic, code, strikethrough) into TipTap JSON
2. WHEN exporting to Markdown, THE Printer SHALL convert TipTap JSON nodes back to Markdown syntax preserving headings, lists, task items, blockquotes, code blocks, horizontal rules, images, and inline marks
3. FOR ALL valid TipTap JSON documents that use supported node types, parsing the printed Markdown output SHALL produce a structurally equivalent TipTap JSON document (round-trip property)

### Requirement 27: Data Migration

**User Story:** As a user upgrading from an older version, I want my data to be automatically and securely migrated, so that I experience zero data loss and benefit from the latest security and structural improvements without manual intervention.

#### Acceptance Criteria

1. WHEN the application starts and IndexedDB is empty but legacy note data exists in localStorage, THE IndexedDB_Storage SHALL migrate all data to IndexedDB, verify structural integrity, and only upon successful verification, clear the migrated records from localStorage to prevent quota exhaustion
2. WHEN notes are loaded from storage, THE Store SHALL automatically inject default values for newly introduced schema fields (e.g., locked: false, hidden: false, deletedAt: null, folderId: null) to ensure runtime stability and backward compatibility for legacy records
3. WHEN a user successfully unlocks the application using a legacy plaintext PIN or single-iteration SHA-256 hash, THE PIN_Security SHALL transparently re-key the authentication material using the defined PBKDF2 standard (minimum 100,000 iterations with device salt) and overwrite the legacy credential in storage
4. WHEN the application detects a schema version change requiring content or structural transformation, THE Store SHALL execute predefined sequential migration scripts while maintaining a temporary migration_backup table in IndexedDB
5. IF any step of a schema migration fails, THEN THE Store SHALL completely roll back to the pre-migration state, halt standard application startup, and display a "Safe Mode" UI that only allows the user to export their raw data as a JSON backup
6. WHEN migrating legacy sync queues, THE Sync_Engine SHALL parse and convert any existing offline delete operations into the unified offline operation queue format specified in the current requirements

### Requirement 28: Mobile Platform Considerations

**User Story:** As a mobile user, I want the application to respect platform conventions, so that the experience feels native on my device.

#### Acceptance Criteria

1. THE application SHALL adapt the three-panel layout to a single-panel stack navigation on screens narrower than 768px, with swipe gestures for panel transitions
2. THE application SHALL handle virtual keyboard appearance by adjusting the editor viewport to prevent content from being obscured
3. THE application SHALL request microphone permission via the platform's native permission dialog before activating Voice_Input on mobile
4. THE application SHALL display a persistent offline indicator when network connectivity is lost on mobile
5. WHEN the user switches away from the application on mobile, THE Store SHALL immediately persist the current state to IndexedDB (no debounce) to prevent data loss from OS-initiated process termination

### Requirement 29: Non-Functional Requirements

**User Story:** As a developer and user, I want the application to meet performance, accessibility, and platform standards, so that the experience is reliable across all supported environments.

#### Acceptance Criteria

1. THE Editor SHALL render initial content and become interactive within 500ms for notes under 50KB of serialized TipTap JSON
2. THE application SHALL maintain a frame rate of at least 30fps during normal editing operations on supported devices
3. THE application SHALL support keyboard navigation for all interactive elements, with visible focus indicators conforming to WCAG 2.1 Level AA contrast requirements
4. THE application SHALL provide ARIA labels for all interactive controls, modal dialogs, and dynamic content regions
5. THE application SHALL function on: Chromium 120+, Safari 17+, Firefox 120+ (desktop); iOS 16+ Safari/WKWebView, Android 10+ Chrome/WebView (mobile)
6. THE application SHALL not exceed 200MB of IndexedDB storage per user before displaying a storage warning
7. WHEN the application detects a crash or unhandled exception, THE application SHALL report the error to Sentry with context (platform, version, action) and display a user-friendly error boundary
8. THE App_Lock SHALL automatically engage after 5 minutes of user inactivity when app lock is enabled, requiring PIN re-entry
9. THE Store SHALL implement selective subscription patterns to prevent full component tree re-renders when individual note content changes; only components consuming the changed data slice SHALL re-render
10. THE application SHALL maintain editor input latency below 50ms (time from keypress to character render) on devices with 4GB RAM or more, even when the note store contains over 500 notes