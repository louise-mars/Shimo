import { useEffect, useRef, useState, useMemo } from 'react'
import * as d3 from 'd3'
import { useStore } from '../../store'
import { buildTagGraph, getTagNotes, getSharedNotes } from '../../lib/tagGraph'
import type { TagNode } from '../../lib/tagGraph'
import type { Note } from '@notepro/shared'

interface SimNode extends TagNode, d3.SimulationNodeDatum {}
interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  weight: number
  noteIds: string[]
  sourceId: string
  targetId: string
}

interface PanelState {
  type: 'node' | 'edge'
  tag?: string
  tagA?: string
  tagB?: string
  notes: Note[]
}

interface Props {
  onSelectNote: (noteId: string) => void
}

export default function TagGraphPage({ onSelectNote }: Props) {
  const { state, dispatch } = useStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const [panel, setPanel] = useState<PanelState | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  const graph = useMemo(() => buildTagGraph(state.notes), [state.notes])

  const isEmpty = graph.nodes.length === 0

  useEffect(() => {
    if (!svgRef.current || isEmpty) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const W = svgRef.current.clientWidth || 360
    const H = svgRef.current.clientHeight || 400

    // 缩放容器
    const g = svg.append('g')

    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 3])
        .on('zoom', (event) => g.attr('transform', event.transform))
    )

    // 节点大小比例
    const maxCount = Math.max(...graph.nodes.map(n => n.count))
    const nodeRadius = (count: number) => 8 + (count / maxCount) * 20

    // 边粗细比例
    const maxWeight = Math.max(...graph.edges.map(e => e.weight), 1)
    const edgeWidth = (weight: number) => 1 + (weight / maxWeight) * 4

    // 构建仿真数据
    const nodes: SimNode[] = graph.nodes.map(n => ({ ...n }))
    const nodeById = new Map(nodes.map(n => [n.id, n]))

    const links: SimEdge[] = graph.edges
      .map(e => ({
        ...e,
        source: nodeById.get(e.source)!,
        target: nodeById.get(e.target)!,
        sourceId: e.source,
        targetId: e.target,
      }))
      .filter(e => e.source && e.target)

    // 力导向仿真
    const simulation = d3.forceSimulation<SimNode>(nodes)
      .force('link', d3.forceLink<SimNode, SimEdge>(links)
        .id(d => d.id)
        .distance(d => 80 - d.weight * 5)
        .strength(0.6)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide<SimNode>(d => nodeRadius(d.count) + 8))

    // 绘制边
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', 'var(--border-medium)')
      .attr('stroke-width', d => edgeWidth(d.weight))
      .attr('stroke-opacity', 0.5)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        const notes = getSharedNotes(d.sourceId, d.targetId, state.notes)
        setPanel({ type: 'edge', tagA: d.sourceId, tagB: d.targetId, notes })
        setSelectedTag(null)
      })

    // 绘制节点组
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x; d.fy = d.y
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null; d.fy = null
          }) as any
      )
      .on('click', (_event, d) => {
        const notes = getTagNotes(d.id, state.notes)
        setPanel({ type: 'node', tag: d.id, notes })
        setSelectedTag(d.id)
      })

    // 节点圆
    node.append('circle')
      .attr('r', d => nodeRadius(d.count))
      .attr('fill', d => selectedTag === d.id ? 'var(--accent-deep)' : 'var(--bg-elevated)')
      .attr('stroke', d => selectedTag === d.id ? 'var(--accent-deep)' : 'var(--accent)')
      .attr('stroke-width', 1.5)

    // 节点标签
    node.append('text')
      .text(d => `#${d.id}`)
      .attr('text-anchor', 'middle')
      .attr('dy', d => nodeRadius(d.count) + 12)
      .attr('font-size', 11)
      .attr('font-family', 'var(--font-sans)')
      .attr('fill', 'var(--text-secondary)')
      .attr('pointer-events', 'none')

    // 节点数量
    node.append('text')
      .text(d => d.count)
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('font-size', d => nodeRadius(d.count) > 14 ? 12 : 10)
      .attr('font-family', 'var(--font-num)')
      .attr('fill', 'var(--text-tertiary)')
      .attr('pointer-events', 'none')

    // 仿真 tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as SimNode).x!)
        .attr('y1', d => (d.source as SimNode).y!)
        .attr('x2', d => (d.target as SimNode).x!)
        .attr('y2', d => (d.target as SimNode).y!)

      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    return () => { simulation.stop() }
  }, [graph, selectedTag, state.notes])

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* 顶部 */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="page-title">图谱</span>
        <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-num)' }}>
          {graph.nodes.length} 个标签 · {graph.edges.length} 条关联
        </span>
      </div>

      {isEmpty ? (
        /* 空状态 */
        <div className="empty" style={{ flex: 1 }}>
          <div style={{ textAlign: 'center', padding: '40px 32px' }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>◎</div>
            <div style={{ fontSize: 15, color: 'var(--text-secondary)', fontFamily: 'var(--font-serif)', letterSpacing: 1, marginBottom: 8 }}>
              还没有标签网络
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)', lineHeight: 1.6 }}>
              在笔记中使用 #标签，<br />当多条笔记共享标签时，<br />图谱会自动生长
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* 图谱区域 */}
          <div style={{ flex: panel ? '0 0 55%' : 1, position: 'relative', overflow: 'hidden' }}>
            <svg
              ref={svgRef}
              style={{ width: '100%', height: '100%' }}
            />
            {/* 操作提示 */}
            <div style={{
              position: 'absolute', bottom: 8, left: 0, right: 0,
              textAlign: 'center', fontSize: 10,
              color: 'var(--text-faint)', fontFamily: 'var(--font-sans)',
              pointerEvents: 'none',
            }}>
              点击节点或连线 · 双指缩放 · 拖动节点
            </div>
          </div>

          {/* 详情面板 */}
          {panel && (
            <div style={{
              flex: '0 0 45%',
              borderTop: '1px solid var(--border-light)',
              background: 'var(--bg-elevated)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>
              {/* 面板标题 */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px 6px',
                borderBottom: '1px solid var(--border-light)',
              }}>
                <div style={{ fontSize: 13, fontFamily: 'var(--font-sans)', color: 'var(--text-secondary)' }}>
                  {panel.type === 'node'
                    ? <><span style={{ color: 'var(--accent-deep)', fontWeight: 500 }}>#{panel.tag}</span> · {panel.notes.length} 条笔记</>
                    : <><span style={{ color: 'var(--accent-deep)', fontWeight: 500 }}>#{panel.tagA}</span> × <span style={{ color: 'var(--accent-deep)', fontWeight: 500 }}>#{panel.tagB}</span> · {panel.notes.length} 条</>
                  }
                </div>
                <button
                  onClick={() => { setPanel(null); setSelectedTag(null) }}
                  style={{ border: 'none', background: 'none', color: 'var(--text-faint)', fontSize: 16, cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>

              {/* 笔记列表 */}
              <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
                {panel.notes.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                    暂无笔记
                  </div>
                ) : (
                  panel.notes.map(note => (
                    <div
                      key={note.id}
                      onClick={() => {
                        dispatch({ type: 'SET_ACTIVE_NOTE', noteId: note.id })
                        onSelectNote(note.id)
                      }}
                      style={{
                        padding: '10px 16px',
                        borderBottom: '1px solid var(--border-light)',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'baseline',
                        justifyContent: 'space-between', gap: 8,
                      }}
                    >
                      <span style={{
                        fontSize: 14, color: 'var(--text-primary)',
                        fontFamily: 'var(--font-serif)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        flex: 1,
                      }}>
                        {note.title || '无标题'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', flexShrink: 0 }}>
                        {formatTime(note.updatedAt)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
