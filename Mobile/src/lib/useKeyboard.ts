import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

export function useKeyboard() {
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let showListener: any
    let hideListener: any

    const setup = async () => {
      try {
        const { Keyboard } = await import('@capacitor/keyboard')
        showListener = await Keyboard.addListener('keyboardWillShow', info => {
          setKeyboardHeight(info.keyboardHeight)
        })
        hideListener = await Keyboard.addListener('keyboardWillHide', () => {
          setKeyboardHeight(0)
        })
      } catch {
        // 忽略错误，键盘适配降级
      }
    }

    setup()

    return () => {
      showListener?.remove()
      hideListener?.remove()
    }
  }, [])

  return keyboardHeight
}
