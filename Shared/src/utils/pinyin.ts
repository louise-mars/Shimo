/**
 * 简易拼音首字母匹配
 * 不依赖外部库，覆盖常用汉字
 */

// 拼音首字母映射表（Unicode 区间 → 首字母）
const PINYIN_MAP: Array<[number, string]> = [
  [0xB0A1, 'a'], [0xB0C5, 'b'], [0xB2C1, 'c'], [0xB4EE, 'd'],
  [0xB6EA, 'e'], [0xB7A2, 'f'], [0xB8C1, 'g'], [0xB9FE, 'h'],
  [0xBBF7, 'j'], [0xBFA6, 'k'], [0xC0AC, 'l'], [0xC2E8, 'm'],
  [0xC4C3, 'n'], [0xC5B6, 'o'], [0xC5BE, 'p'], [0xC6DA, 'q'],
  [0xC8BB, 'r'], [0xC8F6, 's'], [0xCBFA, 't'], [0xCDDA, 'w'],
  [0xCEF4, 'x'], [0xD1B9, 'y'], [0xD4D1, 'z'],
]

function getFirstLetter(char: string): string {
  const code = char.charCodeAt(0)
  // ASCII
  if (code < 128) return char.toLowerCase()
  // 非汉字
  if (code < 0x4E00 || code > 0x9FFF) return ''

  // GB2312 编码查表
  const buf = new TextEncoder().encode(char)
  if (buf.length < 2) return ''
  const gbCode = buf[0] * 256 + buf[1]

  for (let i = PINYIN_MAP.length - 1; i >= 0; i--) {
    if (gbCode >= PINYIN_MAP[i][0]) return PINYIN_MAP[i][1]
  }
  return ''
}

/**
 * 获取字符串的拼音首字母序列
 */
export function getPinyinInitials(text: string): string {
  return Array.from(text).map(getFirstLetter).join('')
}

/**
 * 拼音模糊搜索：支持中文直接匹配 + 拼音首字母匹配
 */
export function pinyinMatch(text: string, query: string): boolean {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  // 直接匹配
  if (lowerText.includes(lowerQuery)) return true

  // 拼音首字母匹配（仅当 query 是纯英文时）
  if (/^[a-z]+$/.test(lowerQuery)) {
    const initials = getPinyinInitials(text)
    if (initials.includes(lowerQuery)) return true
  }

  return false
}