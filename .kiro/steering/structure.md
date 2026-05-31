---
inclusion: always
---

# Project Structure & Architecture

## Monorepo Layout

```
Shimo/
├── Shared/          # @notepro/shared — shared TypeScript library (build first)
├── Desktop/         # Tauri 2 desktop app (React + Vite)
├── Mobile/          # Capacitor 8 mobile app (React + Vite)
└── docs/            # Project documentation
```

## Shared Package (`Shared/src/`)

The single source of truth for business logic, types, and utilities consumed by both apps via `file:` reference.

| Directory | Purpose |
|-----------|---------|
| `types/` | Core data models: `Note`, `Folder`, `StoreState`, `StoreAction` |
| `lib/` | Business logic: reducer (`store.ts`), sync engine, storage (IndexedDB), AI config, image store, note history |
| `lib/migrations/` | SQL migration files for schema versioning |
| `utils/` | Pure helpers: markdown import/export, TipTap JSON utilities, pinyin |
| `styles/` | Shared design tokens (`tokens.css`) |
| `index.ts` | Barrel export — all public API surfaces |

## App Packages (`Desktop/src/`, `Mobile/src/`)

Both apps mirror the same internal structure:

| Directory | Purpose |
|-----------|---------|
| `components/` | UI components (PascalCase, one per file or subfolder for complex ones) |
| `store/` | Platform `StoreProvider` wrapping the shared reducer via Context + `useReducer` |
| `lib/` | Platform-specific logic (sync hooks, security, export, error tracking) |
| `styles/` | Platform CSS (`theme.css` for custom properties, `desktop.css`/`mobile.css` for layout) |
| `types/` | Platform-specific type extensions (if needed) |
| `utils/` | Platform-specific utility functions (if needed) |
| `test/` | Vitest test files |
| `assets/` | Images and static resources bundled by Vite |

Desktop additionally has:
- `src-tauri/` — Rust backend (Tauri commands, capabilities, icons)
- `public/` — Static assets served at root (favicon, SVG sprite)

Mobile additionally has:
- `android/` — Native Android project
- `ios/` — Native iOS project

## Architecture Rules

### Code Placement
- **Shared business logic** (reducer, sync, storage, types) → `Shared/src/`
- **Platform-specific code** (Tauri commands, Capacitor plugins, platform UI tweaks) → respective app's `src/lib/`
- **Never import Desktop code from Mobile or vice versa.** Both import only from `@notepro/shared`.

### State Management
- `StoreState` and `StoreAction` are defined in `Shared/src/types/`
- The reducer (`storeReducer`) lives in `Shared/src/lib/store.ts`
- Each platform wraps it in a `StoreProvider` using `createContext` + `useReducer`
- Access state via `useStore()` hook — never prop-drill the full state
- Persistence: IndexedDB via `idbGet`/`idbSet` with debounced auto-save

### Component Conventions
- One component per file, named in PascalCase (e.g., `NoteEditor.tsx`)
- Complex components with multiple sub-files use a subfolder (e.g., `Editor/`, `Sidebar/`)
- No router — single-view layout with modal overlays toggled via state booleans
- UI text is in Chinese (Simplified); code identifiers are always English

### Styling
- CSS custom properties defined in `theme.css` — use `var(--token-name)` everywhere
- No CSS-in-JS libraries — plain CSS files and inline styles only
- Theme switching via `data-theme` attribute on `<html>`
- Shared design tokens in `Shared/src/styles/tokens.css`

### Data Model
- `Note.content` stores TipTap JSON as a stringified JSON blob
- Soft-delete pattern: `deletedAt: number | null` (null = active, timestamp = trashed)
- Notes auto-purge from trash after 30 days
- IDs are UUIDs generated via `uuid` package

### Import/Export Pattern
- `Shared/src/index.ts` is the barrel — export everything public from here
- Apps import from `@notepro/shared` (the package name), never from relative paths into `Shared/`

### Testing
- Tests live in `src/test/` within each app package
- Use Vitest with jsdom environment and Testing Library
- Test files named `*.test.ts` or `*.test.tsx`
