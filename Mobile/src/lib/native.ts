import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Share } from '@capacitor/share'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { App } from '@capacitor/app'
import { Keyboard } from '@capacitor/keyboard'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Capacitor } from '@capacitor/core'

export const isNative = Capacitor.isNativePlatform()

// === 相机 ===
export async function takePhoto(): Promise<string | null> {
  try {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      quality: 80,
    })
    return photo.dataUrl ?? null
  } catch {
    return null
  }
}

export async function pickPhoto(): Promise<string | null> {
  try {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos,
      quality: 80,
    })
    return photo.dataUrl ?? null
  } catch {
    return null
  }
}

// === 分享 ===
export async function shareNote(title: string, text: string): Promise<void> {
  if (!isNative) {
    // Web fallback
    if (navigator.share) {
      await navigator.share({ title, text })
    } else {
      await navigator.clipboard.writeText(text)
      alert('已复制到剪贴板')
    }
    return
  }
  await Share.share({ title, text, dialogTitle: '分享笔记' })
}

// === 触感反馈 ===
export async function hapticLight(): Promise<void> {
  if (!isNative) return
  await Haptics.impact({ style: ImpactStyle.Light })
}

export async function hapticMedium(): Promise<void> {
  if (!isNative) return
  await Haptics.impact({ style: ImpactStyle.Medium })
}

export async function hapticSuccess(): Promise<void> {
  if (!isNative) return
  await Haptics.notification({ type: 'SUCCESS' } as any)
}

// === 文件系统 ===
export async function saveNoteToFile(filename: string, content: string): Promise<void> {
  if (!isNative) {
    // Web fallback: 下载文件
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return
  }
  await Filesystem.writeFile({
    path: `Shimo/${filename}`,
    data: content,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  })
}

// === 状态栏 ===
export async function setStatusBarStyle(isDark: boolean): Promise<void> {
  if (!isNative) return
  try {
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
  } catch (err) {
    // Ignore on platforms that don't support StatusBar
  }
}

// === 键盘 ===
export function setupKeyboardListeners(
  onShow: (height: number) => void,
  onHide: () => void,
): () => void {
  if (!isNative) return () => {}

  const showListener = Keyboard.addListener('keyboardWillShow', (info) => {
    onShow(info.keyboardHeight)
  })
  const hideListener = Keyboard.addListener('keyboardWillHide', () => {
    onHide()
  })

  return () => {
    showListener.then(l => l.remove())
    hideListener.then(l => l.remove())
  }
}

// === 应用生命周期 ===
export function setupAppListeners(
  onResume: () => void,
  onPause: () => void,
): () => void {
  const resumeListener = App.addListener('resume', onResume)
  const pauseListener = App.addListener('pause', onPause)

  return () => {
    resumeListener.then(l => l.remove())
    pauseListener.then(l => l.remove())
  }
}

export async function getAppInfo() {
  if (!isNative) return { version: '1.0.0', build: '1' }
  const info = await App.getInfo()
  return { version: info.version, build: info.build }
}