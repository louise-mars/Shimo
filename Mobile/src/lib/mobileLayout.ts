/**
 * Mobile Layout — Single-Panel Stack Navigation
 *
 * Provides panel stack navigation and swipe gestures for screens < 768px.
 * Also handles immediate state persistence on app background (visibilitychange)
 * to prevent data loss from OS-initiated process termination.
 *
 * Requirements: 28.1, 28.5
 */

import { flushDebouncedPersist } from '@notepro/shared'

// === Types ===

export type PanelId = 'list' | 'editor' | 'search' | 'settings' | 'graph' | 'ask' | 'ai-settings'

export interface PanelStackEntry {
  panel: PanelId
  timestamp: number
}

export interface MobileLayoutState {
  stack: PanelStackEntry[]
  isMobile: boolean
}

export type PanelChangeListener = (current: PanelId, stack: PanelStackEntry[]) => void

// === Constants ===

const MOBILE_BREAKPOINT = 768
const SWIPE_THRESHOLD = 80 // minimum px to trigger back gesture
const SWIPE_EDGE_ZONE = 40 // swipe must start within this many px from left edge
const SWIPE_MAX_Y_DRIFT = 100 // max vertical drift before gesture is cancelled
const STORAGE_KEY = 'shimo-state'

// === Panel Stack Navigation ===

let panelStack: PanelStackEntry[] = [{ panel: 'list', timestamp: Date.now() }]
let listeners: PanelChangeListener[] = []

/**
 * Get the current (topmost) panel in the stack.
 */
export function getCurrentPanel(): PanelId {
  return panelStack[panelStack.length - 1]?.panel ?? 'list'
}

/**
 * Get the full panel stack (read-only copy).
 */
export function getPanelStack(): readonly PanelStackEntry[] {
  return [...panelStack]
}

/**
 * Push a new panel onto the stack.
 * If the panel is already on top, this is a no-op.
 */
export function pushPanel(panel: PanelId): void {
  const current = getCurrentPanel()
  if (current === panel) return

  panelStack.push({ panel, timestamp: Date.now() })
  notifyListeners()
}

/**
 * Pop the top panel from the stack, returning to the previous panel.
 * If only one panel remains (root), this is a no-op and returns false.
 * Returns true if a panel was popped.
 */
export function popPanel(): boolean {
  if (panelStack.length <= 1) return false

  panelStack.pop()
  notifyListeners()
  return true
}

/**
 * Replace the entire stack with a single panel (e.g., for bottom nav tab switches).
 */
export function resetToPanel(panel: PanelId): void {
  panelStack = [{ panel, timestamp: Date.now() }]
  notifyListeners()
}

/**
 * Check if back navigation is possible (stack has more than one entry).
 */
export function canGoBack(): boolean {
  return panelStack.length > 1
}

/**
 * Subscribe to panel changes. Returns an unsubscribe function.
 */
export function onPanelChange(listener: PanelChangeListener): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter(l => l !== listener)
  }
}

function notifyListeners(): void {
  const current = getCurrentPanel()
  const stackCopy = [...panelStack]
  for (const listener of listeners) {
    listener(current, stackCopy)
  }
}

// === Swipe Gesture Detection ===

interface SwipeState {
  startX: number
  startY: number
  tracking: boolean
}

let swipeState: SwipeState | null = null
let swipeCleanup: (() => void) | null = null

/**
 * Attach swipe-right-to-go-back gesture detection to a target element.
 * The swipe must start within the left edge zone (40px) and travel at least 80px
 * horizontally without drifting more than 100px vertically.
 *
 * Returns a cleanup function to remove event listeners.
 */
export function attachSwipeBackGesture(target: HTMLElement): () => void {
  // Clean up any previous gesture listeners
  if (swipeCleanup) {
    swipeCleanup()
    swipeCleanup = null
  }

  function handleTouchStart(e: TouchEvent): void {
    const touch = e.touches[0]
    if (!touch) return

    // Only track swipes starting from the left edge
    if (touch.clientX <= SWIPE_EDGE_ZONE) {
      swipeState = {
        startX: touch.clientX,
        startY: touch.clientY,
        tracking: true,
      }
    }
  }

  function handleTouchMove(e: TouchEvent): void {
    if (!swipeState?.tracking) return

    const touch = e.touches[0]
    if (!touch) return

    const deltaY = Math.abs(touch.clientY - swipeState.startY)

    // Cancel if vertical drift is too large (user is scrolling)
    if (deltaY > SWIPE_MAX_Y_DRIFT) {
      swipeState.tracking = false
    }
  }

  function handleTouchEnd(e: TouchEvent): void {
    if (!swipeState?.tracking) {
      swipeState = null
      return
    }

    const touch = e.changedTouches[0]
    if (!touch) {
      swipeState = null
      return
    }

    const deltaX = touch.clientX - swipeState.startX
    const deltaY = Math.abs(touch.clientY - swipeState.startY)

    // Trigger back navigation if swipe is valid
    if (deltaX >= SWIPE_THRESHOLD && deltaY <= SWIPE_MAX_Y_DRIFT) {
      popPanel()
    }

    swipeState = null
  }

  target.addEventListener('touchstart', handleTouchStart, { passive: true })
  target.addEventListener('touchmove', handleTouchMove, { passive: true })
  target.addEventListener('touchend', handleTouchEnd, { passive: true })

  const cleanup = () => {
    target.removeEventListener('touchstart', handleTouchStart)
    target.removeEventListener('touchmove', handleTouchMove)
    target.removeEventListener('touchend', handleTouchEnd)
    swipeState = null
  }

  swipeCleanup = cleanup
  return cleanup
}

// === Screen Size Detection ===

/**
 * Check if the current viewport is mobile-sized (< 768px).
 */
export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
}

/**
 * Listen for viewport size changes and invoke callback when crossing the mobile breakpoint.
 * Returns a cleanup function.
 */
export function onViewportChange(callback: (isMobile: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)

  const handler = (e: MediaQueryListEvent) => {
    callback(e.matches)
  }

  mql.addEventListener('change', handler)
  return () => mql.removeEventListener('change', handler)
}

// === Immediate Persist on App Background ===

let visibilityCleanup: (() => void) | null = null

/**
 * Set up a visibilitychange listener that immediately persists the current state
 * to IndexedDB when the app goes to background. This prevents data loss from
 * OS-initiated process termination on mobile.
 *
 * @param getState - Function that returns the current state to persist
 * @returns Cleanup function to remove the listener
 */
export function setupBackgroundPersist(getState: () => unknown): () => void {
  // Clean up any previous listener
  if (visibilityCleanup) {
    visibilityCleanup()
    visibilityCleanup = null
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      // Immediately flush to IndexedDB — no debounce
      const state = getState()
      flushDebouncedPersist(STORAGE_KEY, state).catch((err) => {
        console.error('[Shimo Mobile] Failed to persist state on background:', err)
      })
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)

  const cleanup = () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }

  visibilityCleanup = cleanup
  return cleanup
}
