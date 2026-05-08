import { Capacitor } from '@capacitor/core'

let SpeechPlugin: any = null

async function getSpeech() {
  if (SpeechPlugin) return SpeechPlugin
  if (!Capacitor.isNativePlatform()) return null
  try {
    const mod = await import('@capacitor-community/speech-recognition')
    SpeechPlugin = mod.SpeechRecognition
    return SpeechPlugin
  } catch (e) {
    console.error('[Speech] Plugin load failed:', e)
    return null
  }
}

export interface SpeechResult {
  text: string
  isFinal: boolean
}

/**
 * 原生语音识别 — 阻塞模式
 * 
 * 使用 partialResults: false，start() 会等待用户说完后返回结果。
 * 这是最可靠的模式，不依赖事件。
 * 
 * 返回一个 Promise<string | null>
 */
export async function listenOnce(language = 'zh-CN'): Promise<string | null> {
  const sp = await getSpeech()
  if (!sp) return null

  try {
    const { available } = await sp.available()
    if (!available) return null
  } catch { return null }

  try {
    const perm = await sp.requestPermissions()
    if (perm?.speechRecognition !== 'granted') return null
  } catch { return null }

  try {
    // partialResults: false → start() 阻塞直到识别完成
    const result = await sp.start({
      language,
      maxResults: 5,
      partialResults: false,
      popup: false,
    })
    return result?.matches?.[0] || null
  } catch (e) {
    console.error('[Speech] listenOnce failed:', e)
    return null
  }
}

/**
 * 原生语音识别 — 事件模式（带 partialResults）
 * 用于实时显示中间结果
 */
export async function startListening(
  onResult: (result: SpeechResult) => void,
  onError: (error: string) => void,
  language = 'zh-CN',
): Promise<void> {
  const sp = await getSpeech()
  if (!sp) { onError('not_available'); return }

  try {
    const { available } = await sp.available()
    if (!available) { onError('not_available'); return }
  } catch { onError('not_available'); return }

  try {
    const perm = await sp.requestPermissions()
    if (perm?.speechRecognition !== 'granted') { onError('permission_denied'); return }
  } catch { onError('permission_denied'); return }

  try {
    await sp.addListener('partialResults', (data: { matches?: string[] }) => {
      const text = data?.matches?.[0]
      if (text) onResult({ text, isFinal: false })
    })

    await sp.addListener('listeningState', (data: { status: string }) => {
      if (data.status === 'stopped') {
        onResult({ text: '', isFinal: true })
        sp.removeAllListeners().catch(() => {})
      }
    })

    const result = await sp.start({
      language,
      maxResults: 5,
      partialResults: true,
      popup: false,
    })

    // 某些设备直接从 start() 返回结果
    if (result?.matches?.[0]) {
      onResult({ text: result.matches[0], isFinal: true })
      await sp.removeAllListeners().catch(() => {})
    }
  } catch (e: any) {
    await sp.removeAllListeners().catch(() => {})
    onError(e?.message || 'start_failed')
  }
}

export async function stopListening(): Promise<void> {
  const sp = await getSpeech()
  if (!sp) return
  try { await sp.stop() } catch {}
  try { await sp.removeAllListeners() } catch {}
}

/**
 * Web Speech API fallback
 */
export function startWebSpeech(
  onResult: (result: SpeechResult) => void,
  onError: (error: string) => void,
  language = 'zh-CN',
): (() => void) | null {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SR) { onError('not_available'); return null }

  const rec = new SR()
  rec.lang = language
  rec.continuous = false
  rec.interimResults = true

  let lastText = ''
  let done = false

  rec.onresult = (e: any) => {
    const r = e.results[e.results.length - 1]
    lastText = r[0].transcript
    onResult({ text: lastText, isFinal: r.isFinal })
  }
  rec.onerror = (e: any) => { done = true; onError(e.error || 'unknown') }
  rec.onend = () => {
    if (!done) {
      if (lastText) onResult({ text: lastText, isFinal: true })
      else onError('no-speech')
    }
    done = true
  }

  try { rec.start() } catch { onError('not_available'); return null }
  return () => { done = true; try { rec.stop() } catch {} }
}
