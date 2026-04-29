import type { Note, TipTapNode } from '@notepro/shared'

export interface RelatedNote {
  note: Note
  score: number          // 关联强度 0-1
  reason: 'tag' | 'time' | 'coword'  // 关联原因
  sharedTags?: string[]  // 共同标签
  sharedWords?: string[] // 共现词
}

// 提取笔记纯文本
function getText(note: Note): string {
  try {
    const walk = (n: TipTapNode): string => n.text || (n.content || []).map(walk).join(' ')
    return [note.title, walk(JSON.parse(note.content))].join(' ').toLowerCase()
  } catch { return note.title.toLowerCase() }
}

// 提取高频词（过滤停用词）
const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都',
  '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会',
  '着', '没有', '看', '好', '自己', '这', '那', '但', '如果', '可以',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
])

function extractKeywords(text: string): string[] {
  // 中文分词（简单按字符切割，提取2-4字词组）
  const words: string[] = []

  // 英文单词
  const enWords = text.match(/[a-z]{3,}/g) || []
  words.push(...enWords.filter(w => !STOP_WORDS.has(w)))

  // 中文词组（2-4字）
  const cnMatches = text.match(/[\u4e00-\u9fa5]{2,4}/g) || []
  words.push(...cnMatches.filter(w => !STOP_WORDS.has(w)))

  return [...new Set(words)]
}

// 计算两个笔记的关联分数
function computeRelation(a: Note, b: Note): RelatedNote | null {
  let score = 0
  const reasons: RelatedNote['reason'][] = []
  const sharedTags: string[] = []
  const sharedWords: string[] = []

  // ── Layer A：标签强关联 ──────────────────────
  const tagsB = new Set(b.tags)
  const commonTags = a.tags.filter(t => tagsB.has(t))

  if (commonTags.length > 0) {
    // 标签交集权重：共同标签越多，分数越高
    const tagScore = Math.min(commonTags.length * 0.3, 0.6)
    score += tagScore
    sharedTags.push(...commonTags)
    reasons.push('tag')
  }

  // ── Layer B1：时间邻近关联 ───────────────────
  const timeDiff = Math.abs(a.updatedAt - b.updatedAt)
  const hours = timeDiff / (1000 * 60 * 60)

  if (hours <= 1) {
    score += 0.3  // 1小时内：强时间关联
    reasons.push('time')
  } else if (hours <= 24) {
    score += 0.15 // 24小时内：弱时间关联
    if (!reasons.includes('time')) reasons.push('time')
  }

  // ── Layer B2：共现词关联 ─────────────────────
  const textA = getText(a)
  const textB = getText(b)
  const wordsA = new Set(extractKeywords(textA))
  const wordsB = new Set(extractKeywords(textB))

  const commonWords = [...wordsA].filter(w => wordsB.has(w) && w.length >= 2)

  if (commonWords.length >= 2) {
    // 共现词越多，分数越高，但上限0.4
    const wordScore = Math.min(commonWords.length * 0.1, 0.4)
    score += wordScore
    sharedWords.push(...commonWords.slice(0, 5))
    if (!reasons.includes('coword')) reasons.push('coword')
  }

  // 分数太低，不算关联
  if (score < 0.2) return null

  // 主要关联原因（分数最高的）
  const primaryReason: RelatedNote['reason'] =
    commonTags.length > 0 ? 'tag' :
    hours <= 24 ? 'time' : 'coword'

  return {
    note: b,
    score: Math.min(score, 1),
    reason: primaryReason,
    sharedTags,
    sharedWords,
  }
}

// 找出与目标笔记相关的笔记
export function findRelatedNotes(
  target: Note,
  allNotes: Note[],
  limit = 3,
): RelatedNote[] {
  return allNotes
    .filter(n => n.id !== target.id)
    .map(n => computeRelation(target, n))
    .filter((r): r is RelatedNote => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// 生成 cognitive nudge 提示文字
export function getNudgeText(related: RelatedNote): string {
  const title = related.note.title || '一条笔记'

  switch (related.reason) {
    case 'tag':
      if (related.sharedTags && related.sharedTags.length > 0) {
        return `你之前也提到过 #${related.sharedTags[0]}`
      }
      return `相关：${title}`

    case 'time':
      return `今天早些时候：${title}`

    case 'coword':
      if (related.sharedWords && related.sharedWords.length > 0) {
        return `同样提到了「${related.sharedWords[0]}」`
      }
      return `相关：${title}`
  }
}
