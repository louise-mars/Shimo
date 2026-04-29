import { createClient } from '@supabase/supabase-js'

// 优先级：.env 环境变量 > localStorage 运行时配置
const getUrl = (): string => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) {
    return (import.meta as any).env.VITE_SUPABASE_URL as string
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('shimo-sb-url') || ''
  }
  return ''
}

const getKey = (): string => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) {
    return (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('shimo-sb-key') || ''
  }
  return ''
}

const url = getUrl()
const key = getKey()

export const supabase = url && key
  ? createClient(url, key)
  : null

export const isSupabaseConfigured = () => !!supabase
