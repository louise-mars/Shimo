import * as Sentry from '@sentry/react'

// Initialize Sentry for error tracking
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN

/**
 * Detect platform context for Sentry tags.
 * Desktop app runs in Tauri (window.__TAURI__ is defined).
 */
function getPlatformContext(): { platform: string; version: string } {
  const version = import.meta.env.VITE_APP_VERSION || '1.0.0'
  // Tauri injects __TAURI__ on the window object
  const isTauri = typeof window !== 'undefined' && '__TAURI__' in window
  return {
    platform: isTauri ? 'desktop' : 'web',
    version,
  }
}

/**
 * Scrub PII from event data before sending to Sentry.
 * Strips note content and titles — only sends note IDs.
 */
function scrubPII(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  // Scrub breadcrumb data
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
      if (breadcrumb.data) {
        const scrubbed = { ...breadcrumb.data }
        // Remove note content and titles, keep only IDs
        if ('noteTitle' in scrubbed) delete scrubbed.noteTitle
        if ('noteContent' in scrubbed) delete scrubbed.noteContent
        if ('title' in scrubbed && scrubbed.category === 'note') delete scrubbed.title
        if ('content' in scrubbed) delete scrubbed.content
        return { ...breadcrumb, data: scrubbed }
      }
      return breadcrumb
    })
  }

  // Scrub extra context
  if (event.extra) {
    const extra = { ...event.extra }
    if ('noteTitle' in extra) delete extra.noteTitle
    if ('noteContent' in extra) delete extra.noteContent
    if ('title' in extra) delete extra.title
    if ('content' in extra) delete extra.content
    event.extra = extra
  }

  // Scrub contexts
  if (event.contexts) {
    for (const key of Object.keys(event.contexts)) {
      const ctx = event.contexts[key]
      if (ctx && typeof ctx === 'object') {
        const scrubbed = { ...ctx } as Record<string, unknown>
        if ('noteTitle' in scrubbed) delete scrubbed.noteTitle
        if ('noteContent' in scrubbed) delete scrubbed.noteContent
        if ('title' in scrubbed && key === 'note') delete scrubbed.title
        if ('content' in scrubbed) delete scrubbed.content
        event.contexts[key] = scrubbed
      }
    }
  }

  return event
}

export function initSentry() {
  if (!SENTRY_DSN) {
    console.warn('Sentry DSN not configured. Error tracking disabled.')
    return
  }

  const { platform, version } = getPlatformContext()

  Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    // Performance monitoring
    tracesSampleRate: 1.0,
    // Environment
    environment: import.meta.env.MODE,
    // Release tracking
    release: `shimo-${platform}@${version}`,
    // PII scrubbing — strip note content/titles before sending
    beforeSend(event) {
      return scrubPII(event)
    },
    // Set initial tags for platform context
    initialScope: {
      tags: {
        platform,
        version,
      },
    },
  })
}

// --- Breadcrumb helpers for key user actions ---

/**
 * Add a breadcrumb when a note is created.
 * Only records the note ID, never the content or title.
 */
export function addNoteCreateBreadcrumb(noteId: string) {
  Sentry.addBreadcrumb({
    category: 'note',
    message: 'Note created',
    data: { noteId },
    level: 'info',
  })
}

/**
 * Add a breadcrumb when a note is deleted (soft or permanent).
 * Only records the note ID.
 */
export function addNoteDeleteBreadcrumb(noteId: string, permanent: boolean = false) {
  Sentry.addBreadcrumb({
    category: 'note',
    message: permanent ? 'Note permanently deleted' : 'Note soft-deleted',
    data: { noteId, permanent },
    level: 'info',
  })
}

/**
 * Add a breadcrumb when sync is triggered.
 */
export function addSyncTriggerBreadcrumb(reason: string = 'manual') {
  Sentry.addBreadcrumb({
    category: 'sync',
    message: 'Sync triggered',
    data: { reason },
    level: 'info',
  })
}

/**
 * Add a breadcrumb when theme is toggled.
 */
export function addThemeToggleBreadcrumb(newTheme: string) {
  Sentry.addBreadcrumb({
    category: 'ui',
    message: 'Theme toggled',
    data: { theme: newTheme },
    level: 'info',
  })
}

// --- Error capture helpers ---

/**
 * Capture an exception with optional context.
 * Used by ErrorBoundary componentDidCatch and other error handlers.
 */
export function captureException(error: Error, context?: Record<string, unknown>) {
  if (context) {
    // Scrub any note content/titles from context before setting
    const safeContext = { ...context }
    delete safeContext.noteTitle
    delete safeContext.noteContent
    delete safeContext.content
    delete safeContext.title
    Sentry.setContext('error_context', safeContext)
  }
  Sentry.captureException(error)
}

/**
 * Capture an error with optional context.
 * Alias for captureException — used by ErrorBoundary components.
 */
export function captureError(error: Error, context?: Record<string, unknown>) {
  captureException(error, context)
}

/**
 * Capture a message with severity level.
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  Sentry.captureMessage(message, level)
}
