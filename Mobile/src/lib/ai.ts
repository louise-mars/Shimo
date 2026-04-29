import OpenAI from 'openai'
import { loadAIConfig, getProviderBaseURL } from './aiConfig'
import type { Note } from '@notepro/shared'

function getClient() {
  const config = loadAIConfig()
  if (!config?.apiKey) return null

  const headers: Record<string, string> = {}
  if (config.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://shimo.app'
    headers['X-Title'] = '拾墨'
  }

  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: getProviderBaseURL(config.provider),
    dangerouslyAllowBrowser: true,
    defaultHeaders: Object.keys(headers).length > 0 ? headers : undefined,
  })
}

function getModel(): string {
  const config = loadAIConfig()
  return config?.model || 'MiniMax-Text-01'
}

// ── 1. 语音转结构化笔记 ──────────────────────────────

export interface StructuredNote {
  title: string
  content: string   // 分句换行后的正文
  tags: string[]
}

export async function structureVoiceText(rawText: string): Promise<StructuredNote> {
  const client = getClient()
  if (!client) throw new Error('AI 未配置')

  const res = await client.chat.completions.create({
    model: getModel(),
    messages: [
      {
        role: 'system',
        content: `你是一个笔记整理助手。用户会给你一段语音转文字的原始内容，你需要：
1. 提取一个简短标题（10字以内）
2. 整理正文：去除语气词、自动分句、每句换行
3. 提取2-4个中文标签（不含#号）

严格按 JSON 格式返回，不要有任何其他内容：
{"title":"...","content":"...","tags":["...","..."]}`,
      },
      { role: 'user', content: rawText },
    ],
    temperature: 0.3,
    max_tokens: 500,
  })

  const text = res.choices[0]?.message?.content || ''
  try {
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text)
    return {
      title: json.title || '',
      content: json.content || rawText,
      tags: Array.isArray(json.tags) ? json.tags : [],
    }
  } catch {
    return { title: '', content: rawText, tags: [] }
  }
}

// ── 2. 自动给笔记打标签 ──────────────────────────────

export async function suggestTags(title: string, content: string): Promise<string[]> {
  const client = getClient()
  if (!client) return []

  const text = [title, content].filter(Boolean).join('\n').slice(0, 500)

  const res = await client.chat.completions.create({
    model: getModel(),
    messages: [
      {
        role: 'system',
        content: '根据笔记内容，提取2-4个简短中文标签。只返回 JSON 数组，如：["工作","产品"]',
      },
      { role: 'user', content: text },
    ],
    temperature: 0.2,
    max_tokens: 100,
  })

  try {
    const raw = res.choices[0]?.message?.content || '[]'
    const arr = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || '[]')
    return Array.isArray(arr) ? arr.filter((t: any) => typeof t === 'string') : []
  } catch { return [] }
}

// ── 3. 问我的笔记（RAG 简化版） ──────────────────────

function extractPlainText(content: string): string {
  try {
    const texts: string[] = []
    const walk = (n: any) => {
      if (n.text) texts.push(n.text)
      ;(n.content || []).forEach(walk)
    }
    walk(JSON.parse(content))
    return texts.join(' ')
  } catch { return content }
}

export async function askNotes(
  question: string,
  notes: Note[],
  onChunk?: (chunk: string) => void,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  const client = getClient()
  if (!client) throw new Error('AI 未配置')

  // 简单关键词匹配，找最相关的笔记（最多10条）
  const q = question.toLowerCase()
  const relevant = notes
    .map(n => ({
      note: n,
      text: [n.title, extractPlainText(n.content), n.tags.join(' ')].join(' '),
    }))
    .filter(({ text }) => {
      const words = q.split(/\s+/).filter(w => w.length > 1)
      return words.some(w => text.toLowerCase().includes(w))
    })
    .sort((a, b) => b.note.updatedAt - a.note.updatedAt)
    .slice(0, 10)

  // 如果没有匹配，取最近10条
  const context = (relevant.length > 0 ? relevant : notes.slice(0, 10).map(n => ({
    note: n,
    text: [n.title, extractPlainText(n.content)].join(' '),
  })))
    .map(({ note, text }) => {
      const date = new Date(note.updatedAt).toLocaleDateString('zh-CN')
      return `[${date}] ${note.title || '无标题'}: ${text.slice(0, 200)}`
    })
    .join('\n\n')

  // 构建消息列表（支持追问上下文）
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `你是用户的私人笔记助手。以下是用户的笔记内容：

${context}

请基于这些笔记回答用户的问题。如果笔记中没有相关信息，直接说"你的笔记中没有记录相关内容"。回答要简洁，用中文。`,
    },
  ]

  // 添加历史对话（最多保留最近 6 轮）
  if (history && history.length > 0) {
    const recentHistory = history.slice(-12) // 最近 6 轮 = 12 条消息
    messages.push(...recentHistory)
  }

  messages.push({ role: 'user', content: question })

  const stream = await client.chat.completions.create({
    model: getModel(),
    stream: true,
    messages,
    temperature: 0.5,
    max_tokens: 800,
  })

  let full = ''
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || ''
    full += delta
    onChunk?.(delta)
  }
  return full
}

// ── 4. 每日摘要 ──────────────────────────────────────

export async function generateDailySummary(notes: Note[]): Promise<string> {
  const client = getClient()
  if (!client) throw new Error('AI 未配置')

  const today = new Date().toLocaleDateString('zh-CN')
  const todayNotes = notes.filter(n => {
    const d = new Date(n.updatedAt).toLocaleDateString('zh-CN')
    return d === today
  })

  if (todayNotes.length === 0) return '今天还没有记录。'

  const content = todayNotes
    .map(n => `- ${n.title || extractPlainText(n.content).slice(0, 50)}`)
    .join('\n')

  const res = await client.chat.completions.create({
    model: getModel(),
    messages: [
      {
        role: 'system',
        content: '用一两句话总结用户今天的记录，语气轻松自然，像朋友一样。',
      },
      { role: 'user', content: `今天的记录：\n${content}` },
    ],
    temperature: 0.7,
    max_tokens: 150,
  })

  return res.choices[0]?.message?.content || ''
}

export function isAIConfigured(): boolean {
  const config = loadAIConfig()
  return !!(config?.apiKey && config?.model)
}
