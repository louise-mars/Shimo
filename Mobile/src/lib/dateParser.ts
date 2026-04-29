/**
 * 中文自然语言日期/时间解析器
 * 识别笔记中的日程信息，如：
 * - "明天下午3点开会"
 * - "下周一 10:30 产品评审"
 * - "2026-05-01 出发"
 * - "5月1日 上午9点 面试"
 */

export interface ParsedEvent {
  title: string
  date: Date
  hasTime: boolean
  originalText: string  // 匹配到的原始文本片段
}

// 数字汉字转换
const CN_NUM: Record<string, number> = {
  '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '十一': 11, '十二': 12,
}

function parseCnNum(s: string): number {
  if (/^\d+$/.test(s)) return parseInt(s)
  return CN_NUM[s] ?? 0
}

function parseHour(hourStr: string, period: string): number {
  let h = parseCnNum(hourStr)
  if (period === '下午' || period === '晚上' || period === '傍晚') {
    if (h < 12) h += 12
  } else if (period === '中午') {
    if (h < 12) h = 12
  }
  return h
}

export function parseDateTimeFromText(text: string): ParsedEvent[] {
  const results: ParsedEvent[] = []
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // 已处理的位置，避免重复匹配
  const usedRanges: [number, number][] = []

  const addResult = (start: number, end: number, date: Date, hasTime: boolean, title: string, original: string) => {
    // 检查是否与已有范围重叠
    if (usedRanges.some(([s, e]) => start < e && end > s)) return
    usedRanges.push([start, end])
    results.push({ title: title.trim(), date, hasTime, originalText: original })
  }

  // ── 模式1：ISO 日期 2026-05-01 或 2026/05/01 ──
  const isoRe = /(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})\s*([上下中晚傍]午|早上|凌晨)?\s*(\d{1,2}[:：]\d{2}|\d{1,2}点(?:\d{1,2}分)?)?/g
  let m: RegExpExecArray | null
  while ((m = isoRe.exec(text)) !== null) {
    const [full, datePart, period, timePart] = m
    const [y, mo, d] = datePart.split(/[-\/]/).map(Number)
    const date = new Date(y, mo - 1, d)
    let hasTime = false
    if (timePart) {
      hasTime = true
      const { h, min } = parseTimePart(timePart, period || '')
      date.setHours(h, min)
    }
    const title = extractTitle(text, m.index + full.length)
    addResult(m.index, m.index + full.length, date, hasTime, title, full)
  }

  // ── 模式2：月日 "5月1日" 或 "5月1号" ──
  const mdRe = /(\d{1,2})月(\d{1,2})[日号]\s*([上下中晚傍]午|早上|凌晨)?\s*(\d{1,2}[:：]\d{2}|\d{1,2}点(?:\d{1,2}分)?)?/g
  while ((m = mdRe.exec(text)) !== null) {
    const [full, mo, d, period, timePart] = m
    const date = new Date(now.getFullYear(), parseInt(mo) - 1, parseInt(d))
    // 如果日期已过，推到明年
    if (date < today) date.setFullYear(date.getFullYear() + 1)
    let hasTime = false
    if (timePart) {
      hasTime = true
      const { h, min } = parseTimePart(timePart, period || '')
      date.setHours(h, min)
    }
    const title = extractTitle(text, m.index + full.length)
    addResult(m.index, m.index + full.length, date, hasTime, title, full)
  }

  // ── 模式3：相对日期 今天/明天/后天/大后天 ──
  const relDayRe = /(今天|今日|明天|明日|后天|大后天|昨天)\s*([上下中晚傍]午|早上|凌晨)?\s*(\d{1,2}[:：]\d{2}|\d{1,2}点(?:\d{1,2}分)?)?/g
  while ((m = relDayRe.exec(text)) !== null) {
    const [full, dayWord, period, timePart] = m
    const offset = { '今天': 0, '今日': 0, '明天': 1, '明日': 1, '后天': 2, '大后天': 3, '昨天': -1 }[dayWord] ?? 0
    const date = new Date(today)
    date.setDate(date.getDate() + offset)
    let hasTime = false
    if (timePart) {
      hasTime = true
      const { h, min } = parseTimePart(timePart, period || '')
      date.setHours(h, min)
    }
    const title = extractTitle(text, m.index + full.length)
    addResult(m.index, m.index + full.length, date, hasTime, title, full)
  }

  // ── 模式4：下周/本周 + 星期几 ──
  const weekRe = /(下周|下下周|本周|这周|下个星期)\s*([一二三四五六日天])/g
  while ((m = weekRe.exec(text)) !== null) {
    const [full, weekWord, dayWord] = m
    const targetDay = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 }[dayWord] ?? 1
    const weeksAhead = weekWord === '下下周' ? 2 : weekWord === '下周' || weekWord === '下个星期' ? 1 : 0
    const date = getWeekday(today, targetDay, weeksAhead)

    // 看后面有没有时间
    const afterFull = text.slice(m.index + full.length)
    const timeM = afterFull.match(/^([上下中晚傍]午|早上|凌晨)?\s*(\d{1,2}[:：]\d{2}|\d{1,2}点(?:\d{1,2}分)?)/)
    let hasTime = false
    let extraLen = 0
    if (timeM) {
      hasTime = true
      const { h, min } = parseTimePart(timeM[2], timeM[1] || '')
      date.setHours(h, min)
      extraLen = timeM[0].length
    }
    const title = extractTitle(text, m.index + full.length + extraLen)
    addResult(m.index, m.index + full.length + extraLen, date, hasTime, title, full + (timeM?.[0] || ''))
  }

  // ── 模式5：星期几（本周内）──
  const weekdayRe = /(?<!下周|下下周|本周|这周)星期([一二三四五六日天])|周([一二三四五六日天])/g
  while ((m = weekdayRe.exec(text)) !== null) {
    const dayChar = m[1] || m[2]
    const targetDay = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 }[dayChar] ?? 1
    const date = getWeekday(today, targetDay, 0)

    const afterFull = text.slice(m.index + m[0].length)
    const timeM = afterFull.match(/^([上下中晚傍]午|早上|凌晨)?\s*(\d{1,2}[:：]\d{2}|\d{1,2}点(?:\d{1,2}分)?)/)
    let hasTime = false
    let extraLen = 0
    if (timeM) {
      hasTime = true
      const { h, min } = parseTimePart(timeM[2], timeM[1] || '')
      date.setHours(h, min)
      extraLen = timeM[0].length
    }
    const title = extractTitle(text, m.index + m[0].length + extraLen)
    addResult(m.index, m.index + m[0].length + extraLen, date, hasTime, title, m[0] + (timeM?.[0] || ''))
  }

  return results
}

function parseTimePart(timePart: string, period: string): { h: number; min: number } {
  let h = 0, min = 0
  if (timePart.includes(':') || timePart.includes('：')) {
    const parts = timePart.split(/[:：]/)
    h = parseInt(parts[0])
    min = parseInt(parts[1])
  } else {
    const pointMatch = timePart.match(/(\d+|[零一二三四五六七八九十两]+)点(?:(\d+|[零一二三四五六七八九十两]+)分)?/)
    if (pointMatch) {
      h = parseCnNum(pointMatch[1])
      min = pointMatch[2] ? parseCnNum(pointMatch[2]) : 0
    }
  }
  h = parseHour(String(h), period)
  return { h, min }
}

function extractTitle(text: string, fromIndex: number): string {
  // 取后面最多20个字作为标题，遇到换行或句号停止
  const after = text.slice(fromIndex).replace(/^[\s，,、：:]+/, '')
  const match = after.match(/^([^\n。！？.!?]{1,20})/)
  return match ? match[1].trim() : ''
}

function getWeekday(from: Date, targetDay: number, weeksAhead: number): Date {
  const date = new Date(from)
  const currentDay = date.getDay()
  let diff = targetDay - currentDay
  if (weeksAhead === 0 && diff <= 0) diff += 7  // 本周已过则取下周
  diff += weeksAhead * 7
  date.setDate(date.getDate() + diff)
  return date
}

export function formatEventDate(date: Date, hasTime: boolean): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const eventDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  let dateStr: string
  if (eventDay.getTime() === today.getTime()) {
    dateStr = '今天'
  } else if (eventDay.getTime() === tomorrow.getTime()) {
    dateStr = '明天'
  } else {
    dateStr = `${date.getMonth() + 1}月${date.getDate()}日`
  }

  if (!hasTime) return dateStr

  const h = date.getHours()
  const min = date.getMinutes()
  const period = h < 6 ? '凌晨' : h < 12 ? '上午' : h < 14 ? '中午' : h < 18 ? '下午' : '晚上'
  const timeStr = `${period}${h > 12 ? h - 12 : h}:${String(min).padStart(2, '0')}`
  return `${dateStr} · ${timeStr}`
}
