import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'

const DEFAULT_REVIEW_HOUR = 21 // 默认晚上9点推送
const REVIEW_HOUR_KEY = 'shimo-review-hour'
const LAST_REVIEW_KEY = 'shimo-last-review-date'

// 获取用户设置的推送时间（小时）
export function getReviewHour(): number {
  const saved = localStorage.getItem(REVIEW_HOUR_KEY)
  return saved ? parseInt(saved, 10) : DEFAULT_REVIEW_HOUR
}

// 设置推送时间
export function setReviewHour(hour: number): void {
  if (hour >= 0 && hour <= 23) {
    localStorage.setItem(REVIEW_HOUR_KEY, hour.toString())
  }
}

export async function scheduleReviewNotification(noteCount: number, summary?: string) {
  if (!Capacitor.isNativePlatform()) return

  try {
    const perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return

    const now = new Date()
    const today = now.toDateString()
    const lastReview = localStorage.getItem(LAST_REVIEW_KEY)

    // 今天已经推送过了
    if (lastReview === today) return

    // 获取用户设置的推送时间
    const reviewHour = getReviewHour()

    // 计算推送时间
    const scheduleAt = new Date()
    scheduleAt.setHours(reviewHour, 0, 0, 0)

    // 如果已经过了推送时间，不推送
    if (now >= scheduleAt) return

    // 没有笔记不推送
    if (noteCount === 0) return

    const body = summary
      ? summary
      : noteCount === 1
      ? '你今天记录了 1 条笔记'
      : `你今天记录了 ${noteCount} 条笔记，回顾一下？`

    await LocalNotifications.schedule({
      notifications: [{
        id: 1001,
        title: '拾墨',
        body,
        schedule: { at: scheduleAt },
        smallIcon: 'ic_launcher',
        channelId: 'review',
      }]
    })

    localStorage.setItem(LAST_REVIEW_KEY, today)
  } catch (err) {
    console.warn('Failed to schedule review notification:', err)
  }
}

export async function setupNotificationChannel() {
  if (!Capacitor.isNativePlatform()) return
  try {
    await LocalNotifications.createChannel({
      id: 'review',
      name: '今日回顾',
      description: '每晚提醒回顾今天的记录',
      importance: 3,
      visibility: 1,
    })
  } catch (err) {
    console.warn('Failed to create notification channel:', err)
  }
}
