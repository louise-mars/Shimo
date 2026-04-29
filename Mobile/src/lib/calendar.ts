import { Capacitor } from '@capacitor/core'
import type { ParsedEvent } from './dateParser'

let CalendarPlugin: any = null

async function getCalendar() {
  if (CalendarPlugin) return CalendarPlugin
  if (!Capacitor.isNativePlatform()) return null
  try {
    const mod = await import('@ebarooni/capacitor-calendar')
    CalendarPlugin = mod.CapacitorCalendar
    return CalendarPlugin
  } catch {
    return null
  }
}

export interface CalendarResult {
  success: boolean
  error?: string
}

export async function addEventToCalendar(event: ParsedEvent): Promise<CalendarResult> {
  if (!Capacitor.isNativePlatform()) {
    return { success: false, error: 'web_env' }
  }

  const cal = await getCalendar()
  if (!cal) return { success: false, error: 'plugin_unavailable' }

  try {
    // 请求权限
    const perm = await cal.requestWriteOnlyCalendarAccess()
    if (perm?.result !== 'authorized' && perm?.result !== 'granted') {
      return { success: false, error: 'permission_denied' }
    }

    const startDate = event.date.getTime()
    const endDate = event.hasTime
      ? startDate + 60 * 60 * 1000       // 有时间：持续1小时
      : startDate + 24 * 60 * 60 * 1000  // 全天事件

    await cal.createEvent({
      title: event.title || '拾墨笔记',
      startDate,
      endDate,
      isAllDay: !event.hasTime,
      notes: `来自拾墨：${event.originalText}`,
    })

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'unknown' }
  }
}
