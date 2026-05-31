# Tech Stack

## Monorepo Layout
Three packages at the workspace root, no monorepo tool (Lerna/Turborepo) — each is managed independently with `file:` references to Shared.

| Package | Framework | Native Shell |
|---------|-----------|--------------|
| Desktop | React 19 + Vite 8 | Tauri 2 (Rust) |
| Mobile | React 19 + Vite 8 | Capacitor 8 (Android/iOS) |
| Shared | TypeScript library | N/A |

## Key Libraries
- **Editor**: TipTap 3 (ProseMirror) with many extensions (tables, code blocks, task lists, images, etc.)
- **State**: React Context + `useReducer` (shared reducer in `@notepro/shared`)
- **Storage**: IndexedDB (via custom `idbGet`/`idbSet` helpers), with localStorage migration
- **Sync**: Supabase JS SDK v2
- **Icons**: Lucide React
- **Visualization**: D3 v7 (tag graph)
- **Drag & Drop**: dnd-kit
- **Error Tracking**: Sentry
- **Testing**: Vitest + Testing Library + jsdom
- **Linting**: ESLint 9 (flat config) with react-hooks and react-refresh plugins
- **Language**: TypeScript 6, strict mode

## Common Commands

All commands run from within the respective package directory.

### Shared (must build first for Desktop/Mobile to consume)
```bash
cd Shared
npm run build        # Compile TypeScript → dist/
npm run dev          # Watch mode
```

### Desktop
```bash
cd Desktop
npm run dev          # Vite dev server (frontend only)
npm run build        # tsc + vite build
npm run lint         # ESLint
npm run test         # Vitest (single run)
npm run test:watch   # Vitest watch mode
```

### Mobile
```bash
cd Mobile
npm run dev          # Vite dev server
npm run build        # tsc + vite build
npm run lint         # ESLint
```

### Tauri (Desktop native shell)
```bash
cd Desktop
npx tauri dev        # Run desktop app in dev mode
npx tauri build      # Produce distributable
```

## Environment Variables
Both Desktop and Mobile use `.env` files (not committed). See `.env.example` for required keys (Supabase URL/key, Sentry DSN, OpenAI key).
