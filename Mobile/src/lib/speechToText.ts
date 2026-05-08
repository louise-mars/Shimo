/**
 * 语音转文字 — 在线 ASR 服务
 * 
 * 支持多个后端：
 * 1. 自定义 API（用户配置的 ASR 服务地址）
 * 2. 本地 Web Speech API（作为 fallback，国内可能不可用）
 * 
 * 配置存储在 localStorage: shimo-asr-config
 */

const ASR_CONFIG_KEY = 'shimo-asr-config'

export interface ASRConfig {
  /** ASR 服务类型 */
  provider: 'whisper-api' | 'custom' | 'none'
  /** API 地址（如 https://api.openai.com/v1/audio/transcriptions 或自建服务） */
  apiUrl: string
  /** API Key */
  apiKey: string
  /** 语言 */
  language: string
}

const DEFAULT_CONFIG: ASRConfig = {
  provider: 'none',
  apiUrl: '',
  apiKey: '',
  language: 'zh',
}

export function getASRConfig(): ASRConfig {
  try {
    const raw = localStorage.getItem(ASR_CONFIG_KEY)
    if (!raw) return DEFAULT_CONFIG
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function setASRConfig(config: Partial<ASRConfig>): void {
  const current = getASRConfig()
  localStorage.setItem(ASR_CONFIG_KEY, JSON.stringify({ ...current, ...config }))
}

export function isASRConfigured(): boolean {
  const config = getASRConfig()
  return config.provider !== 'none' && !!config.apiUrl && !!config.apiKey
}

/**
 * 将音频 Blob 发送到 ASR 服务，返回识别文字
 * 
 * 支持 OpenAI Whisper API 兼容格式（大多数国内 ASR 服务都提供兼容接口）：
 * POST multipart/form-data
 * - file: 音频文件
 * - model: "whisper-1"
 * - language: "zh"
 * 
 * 响应: { text: "识别结果" }
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string | null> {
  const config = getASRConfig()

  if (config.provider === 'none' || !config.apiUrl || !config.apiKey) {
    return null
  }

  const formData = new FormData()
  // 根据 MIME 类型确定文件扩展名
  const ext = audioBlob.type.includes('webm') ? 'webm'
    : audioBlob.type.includes('mp4') ? 'mp4'
    : audioBlob.type.includes('wav') ? 'wav'
    : 'webm'
  formData.append('file', audioBlob, `recording.${ext}`)

  // 根据服务商选择模型
  if (config.apiUrl.includes('siliconflow')) {
    formData.append('model', 'FunAudioLLM/SenseVoiceSmall')
  } else if (config.apiUrl.includes('dashscope')) {
    formData.append('model', 'whisper-large-v3')
  } else {
    formData.append('model', 'whisper-1')
  }

  formData.append('language', config.language || 'zh')
  formData.append('response_format', 'json')

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000) // 30s timeout

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      console.error('[ASR] HTTP error:', response.status, await response.text())
      return null
    }

    const data = await response.json()
    // OpenAI Whisper 格式: { text: "..." }
    // 某些服务可能用 { result: "..." } 或 { transcript: "..." }
    return data.text || data.result || data.transcript || null
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.error('[ASR] Request timed out (30s)')
    } else {
      console.error('[ASR] Request failed:', err)
    }
    return null
  }
}
