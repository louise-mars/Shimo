import type { Note } from '@notepro/shared'
import { findRelatedNotes } from './relations'
import { getPreview } from '@notepro/shared'

export interface NoteNode {
  id: string
  title: string
  preview: string
  tags: string[]
  updatedAt: number
  // 节点权重：越近越大
  weight: number
}

export interface NoteEdge {
  source: string
  target: string
  type: 'tag' | 'time' | 'coword'
  strength: number  // 0-1
  label: string     // 关系描述
}

export interface NoteGraph {
  nodes: NoteNode[]
  edges: NoteEdge[]
}

// 节点权重：越近的笔记越大，最近7天内的笔记权重更高
function nodeWeight(note: Note): number {
  const daysSince = (Date.now() - note.updatedAt) / (1000 * 60 * 60 * 24)
  if (daysSince < 1)  return 1.0
  if (daysSince < 7)  return 0.8
  if (daysSince < 30) return 0.6
  return 0.4
}

export function buildNoteGraph(
  notes: Note[],
  options: {
    maxNodes?: number   // 最多显示多少节点（防止爆炸）
    centerNoteId?: string // 以某条笔记为中心展开
  } = {}
): NoteGraph {
  const { maxNodes = 30, centerNoteId } = options

  // 选取节点：优先最近的笔记，或以中心笔记为起点
  let selectedNotes: Note[]

  if (centerNoteId) {
    const center = notes.find(n => n.id === centerNoteId)
    if (center) {
      // 中心笔记 + 最相关的笔记
      const related = findRelatedNotes(center, notes, maxNodes - 1)
      selectedNotes = [center, ...related.map(r => r.note)]
    } else {
      selectedNotes = [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, maxNodes)
    }
  } else {
    // 默认：最近的笔记，但要有标签（无标签的笔记孤立，图谱意义不大）
    const withTags = notes.filter(n => n.tags.length > 0)
    const withoutTags = notes.filter(n => n.tags.length === 0)
    selectedNotes = [
      ...withTags.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, Math.min(maxNodes, withTags.length)),
      ...withoutTags.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, Math.max(0, maxNodes - withTags.length)),
    ].slice(0, maxNodes)
  }

  // 构建节点
  const nodes: NoteNode[] = selectedNotes.map(note => ({
    id: note.id,
    title: note.title || getPreview(note.content, 40) || '无标题',
    preview: getPreview(note.content, 40),
    tags: note.tags,
    updatedAt: note.updatedAt,
    weight: nodeWeight(note),
  }))

  const nodeIds = new Set(nodes.map(n => n.id))

  // 构建边：对每对节点计算关联
  const edges: NoteEdge[] = []
  const edgeSet = new Set<string>()

  for (let i = 0; i < selectedNotes.length; i++) {
    const related = findRelatedNotes(selectedNotes[i], selectedNotes, 5)
    for (const r of related) {
      if (!nodeIds.has(r.note.id)) continue
      const key = [selectedNotes[i].id, r.note.id].sort().join('__')
      if (edgeSet.has(key)) continue
      edgeSet.add(key)

      const label = r.reason === 'tag' && r.sharedTags?.length
        ? `#${r.sharedTags[0]}`
        : r.reason === 'time'
        ? '同时期'
        : r.sharedWords?.length
        ? r.sharedWords[0]
        : ''

      edges.push({
        source: selectedNotes[i].id,
        target: r.note.id,
        type: r.reason,
        strength: r.score,
        label,
      })
    }
  }

  return { nodes, edges }
}
