import { Capacitor } from '@capacitor/core'

let SpeechPlugin: any = null

async function getSpeech() {
  if (SpeechPlugin) return SpeechPlugin
  if (!Capacitor.isNativePlatform()) return null
  try {
    const mod = await import('@capacitor-community/speech-recognition')
    SpeechPlugin = mod.SpeechRecognition
    return SpeechPlugin
  } catch { return null }
}

export async function checkSpeechAvailable(): Promise<boolean> {
  const sp = await getSpeech()
  if (!sp) return false
  try {
    const { available } = await sp.available()
    return available
  } catch { return false }
}

export async function requestSpeechPermission(): Promise<boolean> {
  const sp = await getSpeech()
  if (!sp) return false
  try {
    const { speechRecognition } = await sp.requestPermissions()
    return speechRecognition === 'granted'
  } catch { return false }
}

export interface SpeechResult {
  text: string
  isFinal: boolean
}

export async function startListening(
  onResult: (result: SpeechResult) => void,
  onError: (error: string) => void,
  language = 'zh-CN',
): Promise<void> {
  const sp = await getSpeech()
  if (!sp) { onError('not_available'); return }

  // 先请求权限
  const granted = await requestSpeechPermission()
  if (!granted) { onError('permission_denied'); return }

  try {
    await sp.start({
      language,
      maxResults: 1,
      prompt: '请说话…',
      partialResults: true,
      popup: false,
    })

    // 监听实时结果
    await sp.addListener('partialResults', (data: { matches: string[] }) => {
      if (data.matches?.length > 0) {
        onResult({ text: data.matches[0], isFinal: false })
      }
    })

    // 监听最终结果
    await sp.addListener('listeningState', (data: { status: string }) => {
      if (data.status === 'stopped') {
        onResult({ text: '', isFinal: true })
      }
    })
  } catch (e: any) {
    onError(e?.message || 'unknown')
  }
}

export async function stopListening(): Promise<void> {
  const sp = await getSpeech()
  if (!sp) return
  try {
    await sp.stop()
    await sp.removeAllListeners()
  } catch (err) {
    // Ignore stop errors
  }
}

// Web 环境降级：使用浏览器原生 Web Speech API
export function startWebSpeech(
  onResult: (result: SpeechResult) => void,
  onError: (error: string) => void,
  language = 'zh-CN',
): (() => void) | null {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SpeechRecognition) { onError('not_available'); return null }

  const recognition = new SpeechRecognition()
  recognition.lang = language
  recognition.continuous = true
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  recognition.onresult = (event: any) => {
    const result = event.results[event.results.length - 1]
    onResult({
      text: result[0].transcript,
      isFinal: result.isFinal,
    })
  }

  recognition.onerror = (event: any) => {
    onError(event.error || 'unknown')
  }

  recognition.start()
  return () => recognition.stop()
}
