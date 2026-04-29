import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as d3 from 'd3'
import { useStore } from '../../store'
import { buildNoteGraph } from '../../lib/noteGraph'
import type { NoteNode, NoteEdge } from '../../lib/noteGraph'

interface SimNode extends NoteNode, d3.SimulationNodeDatum {}
interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  type: NoteEdge['type']
  strength: number
  label: string
  sourceId: string
  targetId: string
}

interface Props {
  onSelectNote: (noteId: string) => void
  centerNoteId?: string
}

const EDGE_COLORS = {
  tag:    'var(--accent-deep)',
  time:   'var(--accent)',
  coword: 'var(--text-faint)',
}

export default function NoteGraphPage({ onSelectNote, centerNoteId }: Props) {
  const { state, dispatch } = useStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const [selected, setSelected] = useState<string | null>(centerNoteId || null)

  const graph = useMemo(
    () => buildNoteGraph(state.notes, {
      maxNodes: Math.min(20, Math.max(10, Math.floor(state.notes.length * 0.6))),
      centerNoteId
    }),
    [state.notes, centerNoteId]
  )

  const selectedNote = selected ? state.notes.find(n => n.id === selected) : null

  const renderGraph = useCallback(() => {
    if (!svgRef.current || graph.nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const W = svgRef.current.clientWidth || 360
    const H = svgRef.current.clientHeight || 400

    const g = svg.append('g')

    // 缩放
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 3])
        .on('zoom', e => g.attr('transform', e.transform))
    )

    // 节点半径：基于权重
    const r = (weight: number) => 10 + weight * 14

    // 构建仿真数据
    const nodes: SimNode[] = graph.nodes.map(n => ({
      ...n,
      // 中心节点固定在中央
      ...(n.id === centerNoteId ? { fx: W / 2, fy: H / 2 } : {}),
    }))
    const byId = new Map(nodes.map(n => [n.id, n]))

    const links: SimEdge[] = graph.edges
      .map(e => ({
        ...e,
        source: byId.get(e.source)!,
        target: byId.get(e.target)!,
        sourceId: e.source,
        targetId: e.target,
      }))
      .filter(e => e.source && e.target)

    // 力导向仿真
    const sim = d3.forceSimulation<SimNode>(nodes)
      .force('link', d3.forceLink<SimNode, SimEdge>(links)
        .id(d => d.id)
        .distance(d => 100 - d.strength * 40)
        .strength(d => d.strength * 0.5)
      )
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide<SimNode>(d => r(d.weight) + 12))
      .alphaDecay(nodes.length > 15 ? 0.05 : 0.028) // 节点多时加速收敛
      .velocityDecay(0.4)

    // 边
    const link = g.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', d => EDGE_COLORS[d.type])
      .attr('stroke-width', d => 1 + d.strength * 2)
      .attr('stroke-opacity', d => 0.2 + d.strength * 0.4)

    // 边标签（只在 hover 时显示）
    const linkLabel = g.append('g').selectAll('text').data(links).join('text')
      .text(d => d.label)
      .attr('font-size', 9)
      .attr('font-family', 'var(--font-sans)')
      .attr('fill', 'var(--text-faint)')
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none')
      .attr('opacity', 0)

    // 节点组
    const dragBehavior = d3.drag<SVGGElement, SimNode>()
      .on('start', (e, d) => {
        if (!e.active) sim.alphaTarget(0.3).restart()
        d.fx = d.x; d.fy = d.y
      })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
      .on('end', (e, d) => {
        if (!e.active) sim.alphaTarget(0)
        if (d.id !== centerNoteId) { d.fx = null; d.fy = null }
      })

    const node = g.append('g').selectAll('g').data(nodes).join('g')
      .style('cursor', 'pointer')
      .call(dragBehavior as any)
      .on('click', (_e, d) => {
        setSelected(d.id)
      })
      .on('mouseenter', (_e, d) => {
        // 高亮相关边
        link.attr('stroke-opacity', l => {
          const s = l.source as SimNode
          const t = l.target as SimNode
          return (s.id === d.id || t.id === d.id) ? 0.8 : 0.1
        })
        linkLabel.attr('opacity', l => {
          const s = l.source as SimNode
          const t = l.target as SimNode
          return (s.id === d.id || t.id === d.id) ? 1 : 0
        })
      })
      .on('mouseleave', () => {
        link.attr('stroke-opacity', d => 0.2 + d.strength * 0.4)
        linkLabel.attr('opacity', 0)
      })

    // 节点背景圆（光晕效果，中心节点）
    node.filter(d => d.id === centerNoteId)
      .append('circle')
      .attr('r', d => r(d.weight) + 6)
      .attr('fill', 'var(--accent-deep)')
      .attr('opacity', 0.1)

    // 节点主圆
    node.append('circle')
      .attr('r', d => r(d.weight))
      .attr('fill', d => {
        if (d.id === centerNoteId) return 'var(--accent-deep)'
        if (d.id === selected) return 'var(--accent)'
        return 'var(--bg-elevated)'
      })
      .attr('stroke', d => {
        if (d.id === centerNoteId) return 'var(--accent-deep)'
        return 'var(--accent)'
      })
      .attr('stroke-width', d => d.id === centerNoteId ? 0 : 1.5)

    // 节点标题（截断）
    node.append('text')
      .text(d => d.title.length > 8 ? d.title.slice(0, 8) + '…' : d.title)
      .attr('text-anchor', 'middle')
      .attr('dy', d => r(d.weight) + 13)
      .attr('font-size', 10)
      .attr('font-family', 'var(--font-serif)')
      .attr('fill', 'var(--text-secondary)')
      .attr('pointer-events', 'none')

    // 节点标签数（小圆点）
    node.filter(d => d.tags.length > 0)
      .append('circle')
      .attr('r', 4)
      .attr('cx', d => r(d.weight) - 2)
      .attr('cy', d => -r(d.weight) + 2)
      .attr('fill', 'var(--accent)')
      .attr('opacity', 0.7)

    // tick
    sim.on('tick', () => {
      link
        .attr('x1', d => (d.source as SimNode).x!)
        .attr('y1', d => (d.source as SimNode).y!)
        .attr('x2', d => (d.target as SimNode).x!)
        .attr('y2', d => (d.target as SimNode).y!)

      linkLabel
        .attr('x', d => ((d.source as SimNode).x! + (d.target as SimNode).x!) / 2)
        .attr('y', d => ((d.source as SimNode).y! + (d.target as SimNode).y!) / 2)

      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    return () => { sim.stop() }
  }, [graph, selected, centerNoteId])

  useEffect(() => {
    const cleanup = renderGraph()
    return cleanup
  }, [renderGraph])

  const isEmpty = graph.nodes.length === 0

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* 顶部 */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="page-title">思维图</span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* 图例 */}
          <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)' }}>
            <span style={{ color: 'var(--accent-deep)' }}>— 标签</span>
            <span style={{ color: 'var(--accent)' }}>— 时间</span>
            <span>— 词义</span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-num)' }}>
            {graph.nodes.length} 节点
          </span>
        </div>
      </div>

      {isEmpty ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', gap: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 40, opacity: 0.2 }}>◎</div>
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', fontFamily: 'var(--font-serif)', letterSpacing: 1 }}>
            思维网络正在生长
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)', lineHeight: 1.6 }}>
            记录更多笔记，<br />使用 #标签 建立连接，<br />你的思维网络会自动浮现
          </div>
        </div>
      ) : (
        <>
          {/* 图谱区域 */}
          <div style={{ flex: selected ? '0 0 55%' : 1, position: 'relative', overflow: 'hidden' }}>
            <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
            <div style={{
              position: 'absolute', bottom: 8, left: 0, right: 0,
              textAlign: 'center', fontSize: 10,
              color: 'var(--text-faint)', fontFamily: 'var(--font-sans)',
              pointerEvents: 'none',
            }}>
              点击节点查看 · 拖动重排 · 双指缩放
            </div>
          </div>

          {/* 选中节点详情 */}
          {selected && selectedNote && (
            <div style={{
              flex: '0 0 45%',
              borderTop: '1px solid var(--border-light)',
              background: 'var(--bg-elevated)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              animation: 'fadeIn 200ms ease-out',
            }}>
              {/* 笔记标题 */}
              <div style={{
                padding: '12px 16px 8px',
                borderBottom: '1px solid var(--border-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}>
                    {selectedNote.title || '无标题'}
                  </div>
                  {selectedNote.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      {selectedNote.tags.map(t => (
                        <span key={t} style={{ fontSize: 11, color: 'var(--accent-deep)', fontFamily: 'var(--font-sans)' }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      dispatch({ type: 'SET_ACTIVE_NOTE', noteId: selected })
                      onSelectNote(selected)
                    }}
                    style={{
                      border: 'none', borderRadius: 6,
                      background: 'var(--ink)', color: 'var(--bg-primary)',
                      padding: '6px 12px', fontSize: 12,
                      fontFamily: 'var(--font-sans)', cursor: 'pointer',
                    }}
                  >
                    打开
                  </button>
                  <button
                    onClick={() => setSelected(null)}
                    style={{ border: 'none', background: 'none', color: 'var(--text-faint)', fontSize: 16, cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* 笔记预览 */}
              <div style={{
                padding: '10px 16px',
                fontSize: 13, color: 'var(--text-secondary)',
                fontFamily: 'var(--font-serif)', lineHeight: 1.6,
                flex: 1, overflow: 'auto',
              }}>
                {graph.nodes.find(n => n.id === selected)?.preview || '（无内容）'}
              </div>

              {/* 相关节点 */}
              {graph.edges.filter(e => e.source === selected || e.target === selected).length > 0 && (
                <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    关联
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {graph.edges
                      .filter(e => e.source === selected || e.target === selected)
                      .map(e => {
                        const otherId = e.source === selected ? e.target : e.source
                        const other = graph.nodes.find(n => n.id === otherId)
                        if (!other) return null
                        return (
                          <button
                            key={otherId}
                            onClick={() => setSelected(otherId)}
                            style={{
                              border: `1px solid ${EDGE_COLORS[e.type]}`,
                              background: 'transparent',
                              borderRadius: 4, padding: '3px 8px',
                              fontSize: 11, color: 'var(--text-secondary)',
                              fontFamily: 'var(--font-serif)', cursor: 'pointer',
                              maxWidth: 100, overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                            title={`${e.label} · ${Math.round(e.strength * 100)}%`}
                          >
                            {other.title}
                          </button>
                        )
                      })
                    }
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
