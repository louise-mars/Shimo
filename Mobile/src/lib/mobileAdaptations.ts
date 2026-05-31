import { useEffect, useState, useCallback, useRef } from 'react'
import { Capacitor } from '@capacitor/core'

// ============================================================
// useVirtualKeyboard
// Listens to visualViewport resize events and computes the
// available height so the editor can avoid being hidden behind
// the virtual keyboard.
// ============================================================

export interface VirtualKeyboardState {
  /** Whether the virtual keyboard is currently visible */
  isKeyboardVisible: boolean
  /** Height of the viewport available above the keyboard (px) */
  viewportHeight: number
  /** Offset to apply to scroll or container height (px) */
  keyboardOffset: number
}

/**
 * Hook that tracks the virtual keyboard via the Visual Viewport API.
 * Falls back gracefully on platforms without visualViewport support.
 */
export function useVirtualKeyboard(): VirtualKeyboardState {
  const [state, setState] = useState<VirtualKeyboardState>({
    isKeyboardVisible: false,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    keyboardOffset: 0,
  })

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const initialHeight = window.innerHeight

    const handleResize = () => {
      const currentHeight = viewport.height
      const offset = initialHeight - currentHeight
      // Consider keyboard visible if offset > 100px (avoids false positives from address bar)
      const isVisible = offset > 100

      setState({
        isKeyboardVisible: isVisible,
        viewportHeight: currentHeight,
        keyboardOffset: isVisible ? offset : 0,
      })
    }

    viewport.addEventListener('resize', handleResize)
    viewport.addEventListener('scroll', handleResize)

    // Initial check
    handleResize()

    return () => {
      viewport.removeEventListener('resize', handleResize)
      viewport.removeEventListener('scroll', handleResize)
    }
  }, [])

  return state
}

// ============================================================
// useMicrophonePermission
// Requests microphone permission via Capacitor's native
// permission dialog before activating voice input on mobile.
// ============================================================

export type MicPermissionStatus = 'prompt' | 'granted' | 'denied' | 'unavailable'

export interface MicrophonePermissionState {
  /** Current permission status */
  status: MicPermissionStatus
  /** Whether a permission request is in progress */
  requesting: boolean
  /** Request microphone permission. Returns the resulting status. */
  requestPermission: () => Promise<MicPermissionStatus>
}

/**
 * Hook that manages native microphone permission via Capacitor.
 * On web (non-native), falls back to the browser Permissions API.
 */
export function useMicrophonePermission(): MicrophonePermissionState {
  const [status, setStatus] = useState<MicPermissionStatus>('prompt')
  const [requesting, setRequesting] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    // Check initial permission status
    checkPermission().then((s) => {
      if (mountedRef.current) setStatus(s)
    })
    return () => { mountedRef.current = false }
  }, [])

  const requestPermission = useCallback(async (): Promise<MicPermissionStatus> => {
    setRequesting(true)
    try {
      const result = await doRequestPermission()
      if (mountedRef.current) {
        setStatus(result)
        setRequesting(false)
      }
      return result
    } catch {
      if (mountedRef.current) {
        setStatus('unavailable')
        setRequesting(false)
      }
      return 'unavailable'
    }
  }, [])

  return { status, requesting, requestPermission }
}

async function checkPermission(): Promise<MicPermissionStatus> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { SpeechRecognition } = await import('@capacitor-community/speech-recognition')
      const result = await SpeechRecognition.checkPermissions()
      return mapCapacitorPermission(result?.speechRecognition)
    } catch {
      return 'unavailable'
    }
  }

  // Web fallback: use browser Permissions API
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return mapWebPermission(result.state)
  } catch {
    return 'prompt'
  }
}

async function doRequestPermission(): Promise<MicPermissionStatus> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { SpeechRecognition } = await import('@capacitor-community/speech-recognition')
      const result = await SpeechRecognition.requestPermissions()
      return mapCapacitorPermission(result?.speechRecognition)
    } catch {
      return 'unavailable'
    }
  }

  // Web fallback: request via getUserMedia to trigger the permission prompt
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // Stop all tracks immediately — we only needed the permission
    stream.getTracks().forEach((track) => track.stop())
    return 'granted'
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      return 'denied'
    }
    return 'unavailable'
  }
}

function mapCapacitorPermission(value: string | undefined): MicPermissionStatus {
  switch (value) {
    case 'granted': return 'granted'
    case 'denied': return 'denied'
    case 'prompt': return 'prompt'
    case 'prompt-with-rationale': return 'prompt'
    default: return 'prompt'
  }
}

function mapWebPermission(state: PermissionState): MicPermissionStatus {
  switch (state) {
    case 'granted': return 'granted'
    case 'denied': return 'denied'
    case 'prompt': return 'prompt'
    default: return 'prompt'
  }
}

// ============================================================
// useOfflineIndicator
// Listens to navigator.onLine and online/offline events to
// provide a persistent offline indicator state.
// ============================================================

export interface OfflineIndicatorState {
  /** Whether the device is currently offline */
  isOffline: boolean
  /** Timestamp when the device went offline (null if online) */
  offlineSince: number | null
}

/**
 * Hook that tracks network connectivity status.
 * Returns isOffline=true when the device loses connectivity,
 * suitable for rendering a persistent offline banner.
 */
export function useOfflineIndicator(): OfflineIndicatorState {
  const [state, setState] = useState<OfflineIndicatorState>(() => {
    const offline = typeof navigator !== 'undefined' ? !navigator.onLine : false
    return {
      isOffline: offline,
      offlineSince: offline ? Date.now() : null,
    }
  })

  useEffect(() => {
    const handleOnline = () => {
      setState({ isOffline: false, offlineSince: null })
    }

    const handleOffline = () => {
      setState({ isOffline: true, offlineSince: Date.now() })
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return state
}
