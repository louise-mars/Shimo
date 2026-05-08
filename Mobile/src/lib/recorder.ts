/**
 * 录音模块
 * 使用 Web Audio API (MediaRecorder) 录制音频
 * 在 Capacitor WebView 中可用，不依赖 Google 服务
 */

let mediaRecorder: MediaRecorder | null = null
let audioChunks: Blob[] = []
let stream: MediaStream | null = null

export type RecorderState = 'idle' | 'recording' | 'error'

/**
 * 请求麦克风权限并开始录音
 */
export async function startRecording(): Promise<boolean> {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      }
    })

    audioChunks = []

    // 优先使用 webm/opus，兼容性好
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/mp4'

    mediaRecorder = new MediaRecorder(stream, { mimeType })

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data)
    }

    mediaRecorder.onerror = (e) => {
      console.error('[Recorder] Recording error:', e)
      // Cleanup on error
      stream?.getTracks().forEach(t => t.stop())
      stream = null
      mediaRecorder = null
      audioChunks = []
    }

    mediaRecorder.start(250) // 每 250ms 收集一次数据
    return true
  } catch (err) {
    console.error('[Recorder] Failed to start:', err)
    return false
  }
}

/**
 * 停止录音，返回音频 Blob
 */
export function stopRecording(): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      resolve(null)
      return
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: mediaRecorder!.mimeType })
      audioChunks = []

      // 释放麦克风
      stream?.getTracks().forEach(t => t.stop())
      stream = null
      mediaRecorder = null

      resolve(blob)
    }

    mediaRecorder.stop()
  })
}

/**
 * 取消录音
 */
export function cancelRecording(): void {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  stream?.getTracks().forEach(t => t.stop())
  stream = null
  mediaRecorder = null
  audioChunks = []
}

/**
 * 检查是否正在录音
 */
export function isRecording(): boolean {
  return mediaRecorder?.state === 'recording'
}

/**
 * 获取录音时长（秒）— 近似值
 */
export function getRecordingDuration(): number {
  // 每个 chunk 约 250ms
  return audioChunks.length * 0.25
}
