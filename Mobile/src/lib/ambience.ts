/**
 * 程序化环境音生成器
 * 用 Web Audio API 生成雨声、风声、白噪音等
 * 零体积，无版权问题
 */

export type AmbienceType = 'rain' | 'wind' | 'white' | 'none'

let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null
let currentNodes: AudioNode[] = []
let currentType: AmbienceType = 'none'
let fadeTimer: ReturnType<typeof setTimeout> | undefined

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    masterGain = audioCtx.createGain()
    masterGain.gain.value = 0
    masterGain.connect(audioCtx.destination)
  }
  return audioCtx
}

// 生成白噪音 buffer
function createNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const bufferSize = ctx.sampleRate * seconds
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

// 雨声：白噪音 + 低通滤波 + 轻微调制
function startRain(ctx: AudioContext, gain: GainNode) {
  const nodes: AudioNode[] = []

  // 主雨声（白噪音 + 低通）
  const noiseBuffer = createNoiseBuffer(ctx, 3)
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer
  noise.loop = true

  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 1200
  lowpass.Q.value = 0.5

  // 轻微的音量调制（模拟雨势变化）
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.08
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 0.08

  const rainGain = ctx.createGain()
  rainGain.gain.value = 0.35

  lfo.connect(lfoGain)
  lfoGain.connect(rainGain.gain)
  noise.connect(lowpass)
  lowpass.connect(rainGain)
  rainGain.connect(gain)

  noise.start()
  lfo.start()

  // 偶尔的雨滴声（高频短脉冲）
  const dropInterval = setInterval(() => {
    if (!audioCtx) return
    const dropNoise = ctx.createBufferSource()
    dropNoise.buffer = createNoiseBuffer(ctx, 0.05)
    const dropFilter = ctx.createBiquadFilter()
    dropFilter.type = 'bandpass'
    dropFilter.frequency.value = 3000 + Math.random() * 2000
    dropFilter.Q.value = 8
    const dropGain = ctx.createGain()
    dropGain.gain.setValueAtTime(0.06 + Math.random() * 0.04, ctx.currentTime)
    dropGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
    dropNoise.connect(dropFilter)
    dropFilter.connect(dropGain)
    dropGain.connect(gain)
    dropNoise.start()
    dropNoise.stop(ctx.currentTime + 0.1)
  }, 80 + Math.random() * 120)

  nodes.push(noise, lfo)
  ;(nodes as any)._dropInterval = dropInterval
  return nodes
}

// 风声：粉噪音 + 缓慢调制
function startWind(ctx: AudioContext, gain: GainNode) {
  const nodes: AudioNode[] = []

  const noiseBuffer = createNoiseBuffer(ctx, 4)
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer
  noise.loop = true

  // 带通滤波模拟风的音色
  const bandpass = ctx.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.value = 400
  bandpass.Q.value = 0.3

  // 缓慢的频率调制（风声起伏）
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.05
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 200

  const windGain = ctx.createGain()
  windGain.gain.value = 0.4

  // 音量调制（风忽强忽弱）
  const volLfo = ctx.createOscillator()
  volLfo.frequency.value = 0.03
  const volLfoGain = ctx.createGain()
  volLfoGain.gain.value = 0.12

  lfo.connect(lfoGain)
  lfoGain.connect(bandpass.frequency)
  volLfo.connect(volLfoGain)
  volLfoGain.connect(windGain.gain)
  noise.connect(bandpass)
  bandpass.connect(windGain)
  windGain.connect(gain)

  noise.start()
  lfo.start()
  volLfo.start()

  nodes.push(noise, lfo, volLfo)
  return nodes
}

// 白噪音：纯净，适合专注
function startWhite(ctx: AudioContext, gain: GainNode) {
  const noiseBuffer = createNoiseBuffer(ctx, 2)
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer
  noise.loop = true

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 2000

  const noiseGain = ctx.createGain()
  noiseGain.gain.value = 0.15

  noise.connect(filter)
  filter.connect(noiseGain)
  noiseGain.connect(gain)
  noise.start()

  return [noise]
}

// 鸟鸣（晨间）：随机正弦波短音 — 保留备用
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function startBirds(ctx: AudioContext, gain: GainNode) {
  const nodes: AudioNode[] = []

  // 底层轻风
  const windNodes = startWind(ctx, gain)
  nodes.push(...windNodes)

  // 随机鸟鸣
  const birdInterval = setInterval(() => {
    if (!audioCtx) return
    const freq = 2000 + Math.random() * 2000
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq

    const birdGain = ctx.createGain()
    birdGain.gain.setValueAtTime(0, ctx.currentTime)
    birdGain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.05)
    birdGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3 + Math.random() * 0.3)

    osc.connect(birdGain)
    birdGain.connect(gain)
    osc.start()
    osc.stop(ctx.currentTime + 0.7)
  }, 1500 + Math.random() * 3000)

  ;(nodes as any)._birdInterval = birdInterval
  return nodes
}

// 根据时间自动选择环境音
export function getAmbienceForTime(): AmbienceType {
  const h = new Date().getHours()
  if (h >= 5  && h < 9)  return 'wind'   // 晨：轻风鸟鸣
  if (h >= 9  && h < 17) return 'white'  // 昼：白噪音
  if (h >= 17 && h < 20) return 'rain'   // 暮：雨声
  return 'rain'                           // 夜：雨声
}

// 停止当前环境音
function stopCurrent() {
  if ((currentNodes as any)._dropInterval) {
    clearInterval((currentNodes as any)._dropInterval)
  }
  if ((currentNodes as any)._birdInterval) {
    clearInterval((currentNodes as any)._birdInterval)
  }
  currentNodes.forEach(node => {
    try {
      if (node instanceof AudioBufferSourceNode || node instanceof OscillatorNode) {
        node.stop()
      }
    } catch (err) {
      // Node already stopped, ignore
    }
  })
  currentNodes = []
}

// 淡入播放
export function playAmbience(type: AmbienceType, volume = 0.4) {
  if (type === 'none') {
    stopAmbience()
    return
  }
  if (type === currentType) return

  const ctx = getCtx()
  if (!masterGain) return

  // 恢复 AudioContext（移动端需要用户交互后才能播放）
  if (ctx.state === 'suspended') {
    ctx.resume()
  }

  stopCurrent()
  currentType = type

  switch (type) {
    case 'rain':  currentNodes = startRain(ctx, masterGain); break
    case 'wind':  currentNodes = startWind(ctx, masterGain); break
    case 'white': currentNodes = startWhite(ctx, masterGain); break
  }

  // 淡入
  masterGain.gain.cancelScheduledValues(ctx.currentTime)
  masterGain.gain.setValueAtTime(0, ctx.currentTime)
  masterGain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 2)
}

// 淡出停止
export function stopAmbience() {
  if (!masterGain || !audioCtx) return
  currentType = 'none'

  masterGain.gain.cancelScheduledValues(audioCtx.currentTime)
  masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime)
  masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.5)

  if (fadeTimer) clearTimeout(fadeTimer)
  fadeTimer = setTimeout(() => {
    stopCurrent()
  }, 2000)
}

// 调整音量
export function setAmbienceVolume(volume: number) {
  if (!masterGain || !audioCtx) return
  masterGain.gain.cancelScheduledValues(audioCtx.currentTime)
  masterGain.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + 0.3)
}

export function getCurrentType() { return currentType }
// startBirds 备用函数，未来可用于晨间模式
export { startBirds }
