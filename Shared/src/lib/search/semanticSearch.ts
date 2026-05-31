/**
 * 语义搜索模块
 * 
 * 提供统一的搜索接口：
 * 1. 优先使用 Supabase vector embedding 相似度搜索
 * 2. 当 embedding 不可用时，回退到全文内容搜索
 */

import { supabase } from '../supabase'
import { generateEmbedding, getEmbeddingConfig } from '../embedding'
import { extractText } from '../../utils/tiptap'
import type { Note } from '../../types'

export interface SemanticSearchResult {
  noteId: string
  similarity: number
}

/**
 * 检查 embedding 搜索是否可用
 * 需要 Supabase 已配置且 embedding 配置存在
 */
export function isEmbeddingAvailable(): boolean {
  return !!supabase && !!getEmbeddingConfig()
}

/**
 * 使用 Supabase vector embedding 进行语义搜索
 * 调用 match_notes RPC 函数进行向量相似度匹配
 */
export async function vectorSearch(
  query: string,
  userId: string,
  limit = 10
): Promise<SemanticSearchResult[]> {
  if (!supabase) return []

  const embedding = await generateEmbedding(query)
  if (!embedding) return []

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
 * 全文内容搜索回退
 * 当 embedding 不可用时，在所有笔记正文中进行 ILIKE 风格的模糊匹配
 * 返回匹配的笔记 ID 和相关度分数（基于匹配位置和频率）
 */
export function fullTextSearch(
  query: string,
  notes: Note[],
  limit = 10
): SemanticSearchResult[] {
  if (!query.trim()) return []

  const lowerQuery = query.toLowerCase()
  const results: SemanticSearchResult[] = []

  for (const note of notes) {
    // Skip deleted or hidden notes
    if (note.deletedAt || note.hidden) continue

    const title = (note.title || '').toLowerCase()
    const content = extractText(note.content).toLowerCase()
    const fullText = title + ' ' + content

    // Check if query appears in the full text
    const index = fullText.indexOf(lowerQuery)
    if (index === -1) continue

    // Compute a relevance score:
    // - Title match scores higher (0.9 base)
    // - Earlier position in content scores higher
    // - Multiple occurrences boost score
    let similarity = 0

    if (title.includes(lowerQuery)) {
      similarity = 0.9
    } else {
      // Score based on position (earlier = more relevant)
      const positionScore = Math.max(0.3, 0.8 - (index / fullText.length) * 0.5)
      similarity = positionScore
    }

    // Boost for multiple occurrences
    const occurrences = fullText.split(lowerQuery).length - 1
    if (occurrences > 1) {
      similarity = Math.min(1.0, similarity + occurrences * 0.05)
    }

    results.push({ noteId: note.id, similarity })
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity)
  return results.slice(0, limit)
}

/**
 * 统一语义搜索入口
 * 
 * 策略：
 * 1. 如果 embedding 可用，使用 vector 相似度搜索
 * 2. 如果 embedding 不可用（Supabase 未配置或 embedding 生成中），
 *    回退到全文内容搜索
 * 
 * @param query - 搜索查询
 * @param userId - 用户 ID（用于 vector 搜索）
 * @param notes - 本地笔记列表（用于全文回退）
 * @param limit - 最大返回结果数
 */
export async function semanticSearch(
  query: string,
  userId: string | null,
  notes: Note[],
  limit = 10
): Promise<SemanticSearchResult[]> {
  // Try vector search first if available
  if (isEmbeddingAvailable() && userId) {
    try {
      const results = await vectorSearch(query, userId, limit)
      if (results.length > 0) return results
    } catch {
      // Fall through to full-text search on error
    }
  }

  // Fallback: full-text content search
  return fullTextSearch(query, notes, limit)
}
