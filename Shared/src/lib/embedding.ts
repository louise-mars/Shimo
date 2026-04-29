/**
 * 笔记 Embedding 模块
 * 使用 AI 提供商生成文本向量，存入 Supabase pgvector
 */

import { supabase } from './supabase'
import type { Note } from '../types'

// Embedding 配置
const EMBEDDING_KEY = 'shimo-embedding-config'

interface EmbeddingConfig {
  provider: 'openai' | 'minimax' | 'local'
  apiKey: string
  baseURL: string
  model: string
}

export function getEmbeddingConfig(): EmbeddingConfig | null {
  // 复用 AI 配置
  try {
    const raw = localStorage.getItem('shimo-ai-config')
    if (!raw) return null
    const config = JSON.parse(raw)
    if (!config.apiKey) return null

    // 根据 provider 选择 embedding 模型
    const providerMap: Record<string, { baseURL: string; model: string }> = {
      minimax: { baseURL: 'https://api.minimaxi.chat/v1', model: 'embo-01' },
      kimi: { baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
      glm: { baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'embedding-3' },
      qwen: { baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'text-embedding-v3' },
      openrouter: { baseURL: 'https://openrouter.ai/api/v1', model: 'openai/text-embedding-3-small' },
    }

    const p = providerMap[config.provider] || providerMap.openrouter
    return {
      provider: config.provider === 'minimax' || config.provider === 'glm' || config.provider === 'qwen' ? config.provider : 'openai',
      apiKey: config.apiKey,
      baseURL: p.baseURL,
      model: p.model,
    }
  } catch { return null }
}

/**
 * 生成文本的 embedding 向量
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const config = getEmbeddingConfig()
  if (!config) return null

  try {
    const res = await fetch(`${config.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: text.slice(0, 2000), // 限制长度
      }),
    })

    if (!res.ok) return null
    const data = await res.json()
    return data.data?.[0]?.embedding || null
  } catch {
    return null
  }
}

/**
 * 提取笔记的可嵌入文本
 */
function noteToEmbeddingText(note: Note): string {
  let text = note.title || ''
  try {
    const walk = (n: { text?: string; content?: any[] }): string =>
      n.text || (n.content || []).map(walk).join(' ')
    text += ' ' + walk(JSON.parse(note.content))
  } catch { /* ignore */ }
  if (note.tags.length) text += ' ' + note.tags.join(' ')
  return text.trim().slice(0, 2000)
}

/**
 * 为笔记生成并存储 embedding
 */
export async function embedNote(note: Note, userId: string): Promise<boolean> {
  if (!supabase) return false

  const text = noteToEmbeddingText(note)
  if (!text || text.length < 10) return false

  const embedding = await generateEmbedding(text)
  if (!embedding) return false

  const { error } = await supabase
    .from('note_embeddings')
    .upsert({
      note_id: note.id,
      user_id: userId,
      embedding,
      content_hash: simpleHash(text),
      updated_at: Date.now(),
    }, { onConflict: 'note_id' })

  return !error
}

/**
 * 语义搜索：找到与 query 最相似的笔记
 */
export async function semanticSearch(
  query: string,
  userId: string,
  limit = 10
): Promise<Array<{ noteId: string; similarity: number }>> {
  if (!supabase) return []

  const embedding = await generateEmbedding(query)
  if (!embedding) return []

  // 使用 Supabase RPC 调用 pgvector 相似度搜索
  const { data, error } = await supabase.rpc('match_notes', {
    query_embedding: embedding,
    match_user_id: userId,
    match_count: limit,
  })

  if (error || !data) return []
  return data.map((row: { note_id: string; similarity: number }) => ({
    noteId: row.note_id,
    similarity: row.similarity,
  }))
}

/**
 * 找到与目标笔记语义最相似的笔记
 */
export async function findSimilarNotes(
  noteId: string,
  userId: string,
  limit = 5
): Promise<Array<{ noteId: string; similarity: number }>> {
  if (!supabase) return []

  const { data, error } = await supabase.rpc('find_similar_notes', {
    target_note_id: noteId,
    match_user_id: userId,
    match_count: limit,
  })

  if (error || !data) return []
  return data.map((row: { note_id: string; similarity: number }) => ({
    noteId: row.note_id,
    similarity: row.similarity,
  }))
}

/**
 * 批量为所有笔记生成 embedding（后台任务）
 */
export async function embedAllNotes(
  notes: Note[],
  userId: string,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  let embedded = 0
  const total = notes.length

  for (const note of notes) {
    if (note.deletedAt) continue
    const text = noteToEmbeddingText(note)
    if (text.length < 10) continue

    // 检查是否已有最新 embedding
    if (supabase) {
      const { data } = await supabase
        .from('note_embeddings')
        .select('content_hash')
        .eq('note_id', note.id)
        .single()

      if (data?.content_hash === simpleHash(text)) {
        embedded++
        onProgress?.(embedded, total)
        continue // 内容未变，跳过
      }
    }

    const success = await embedNote(note, userId)
    if (success) embedded++
    onProgress?.(embedded, total)

    // 限速：每秒最多 5 个请求
    await new Promise(r => setTimeout(r, 200))
  }

  return embedded
}

function simpleHash(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString(36)
}

/**
 * 检查 embedding 功能是否可用
 */
export function isEmbeddingAvailable(): boolean {
  return !!supabase && !!getEmbeddingConfig()
}
