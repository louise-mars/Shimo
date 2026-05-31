---
inclusion: always
---

# Product: Shimo (拾墨) — NotePro

Shimo is a cross-platform note-taking application with Desktop and Mobile clients sharing a common codebase via a `Shared` package.

## Core Capabilities

- Rich-text note editing (TipTap/ProseMirror block editor)
- Tag-based organization with D3 graph visualization
- Cloud sync via Supabase (real-time + offline-first)
- Dark/light theming via CSS custom properties and `data-theme` attribute
- Import/export (Markdown, ZIP archive)
- Daily review and weekly report generation
- AI-assisted writing (OpenAI integration, "Ask AI" panel)
- App lock with PIN security
- Template system for new notes
- Keyboard shortcuts and command palette (modal overlays, no router)
- Voice input
- Note history and versioning
- Drag-and-drop note reordering (dnd-kit)

## Target Platforms

| Platform | Shell | Distribution |
|----------|-------|--------------|
| Desktop (Windows, macOS, Linux) | Tauri 2 (Rust) | Native binary |
| Mobile (iOS, Android) | Capacitor 8 | Native app |

## Product Conventions

- **UI language**: Chinese (Simplified). All user-facing text, labels, and messages are in Chinese.
- **Code language**: Variable names, function names, file names, and identifiers are always in English. Code comments may mix Chinese and English.
- **No routing**: The app is a single-view layout. Navigation is handled via state booleans toggling modal overlays and panels.
- **Soft-delete pattern**: Notes use `deletedAt` (null = active, timestamp = trashed). Trash auto-purges after 30 days.
- **IDs**: UUIDs generated via the `uuid` package.
- **Note content**: Stored as stringified TipTap JSON in `Note.content`.
- **Offline-first**: All data persists to IndexedDB locally; sync to Supabase is eventual and conflict-tolerant.
- **Feature parity**: Desktop and Mobile should maintain equivalent functionality unless a feature is inherently platform-specific (e.g., Tauri window controls).
