import type { Note } from '@notepro/shared'

export interface TagNode {
  id: string        // 标签名
  count: number     // 笔记数量
  noteIds: string[] // 关联的笔记 ID
}

export interface TagEdge {
  source: string    // 标签A
  target: string    // 标签B
  weight: number    // 共现次数
  noteIds: string[] // 共同出现的笔记 ID
}

export interface TagGraph {
  nodes: TagNode[]
  edges: TagEdge[]
}

export function buildTagGraph(notes: Note[]): TagGraph {
  const nodeMap = new Map<string, TagNode>()
  const edgeMap = new Map<string, TagEdge>()

  for (const note of notes) {
    if (note.tags.length === 0) continue

    // 构建节点
    for (const tag of note.tags) {
      if (!nodeMap.has(tag)) {
        nodeMap.set(tag, { id: tag, count: 0, noteIds: [] })
      }
      const node = nodeMap.get(tag)!
      node.count++
      node.noteIds.push(note.id)
    }

    // 构建边（标签两两共现）
    for (let i = 0; i < note.tags.length; i++) {
      for (let j = i + 1; j < note.tags.length; j++) {
        const a = note.tags[i]
        const b = note.tags[j]
        const key = [a, b].sort().join('__')

        if (!edgeMap.has(key)) {
          edgeMap.set(key, {
            source: a, target: b,
            weight: 0, noteIds: [],
          })
        }
        const edge = edgeMap.get(key)!
        edge.weight++
        edge.noteIds.push(note.id)
      }
    }
  }

  // 过滤孤立节点（只有1条笔记且无边）
  const connectedTags = new Set<string>()
  edgeMap.forEach(e => {
    connectedTags.add(e.source)
    connectedTags.add(e.target)
  })

  const nodes = [...nodeMap.values()].filter(
    n => n.count >= 2 || connectedTags.has(n.id)
  )

  return {
    nodes,
    edges: [...edgeMap.values()],
  }
}

// 找出与某个标签直接相连的笔记
export function getTagNotes(tag: string, notes: Note[]): Note[] {
  return notes
    .filter(n => n.tags.includes(tag))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

// 找出两个标签共同出现的笔记
export function getSharedNotes(tagA: string, tagB: string, notes: Note[]): Note[] {
  return notes
    .filter(n => n.tags.includes(tagA) && n.tags.includes(tagB))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}
