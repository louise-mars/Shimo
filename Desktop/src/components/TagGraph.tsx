import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as d3 from 'd3'
import { useStore } from '../store'
import { buildNoteGraph } from '../lib/noteGraph'
import type { NoteNode, NoteEdge } from '../lib/noteGraph'

interface SimNode extends NoteNode, d3.SimulationNodeDatum {}
interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  type: NoteEdge['type']
  strength: number
  label: string
  sourceId: string
  targetId: string
}

const EDGE_COLORS = {
  tag:    '#4A5C6A',
  time:   '#8FA3A6',
  coword: '#AEAEB2',
}

interface Props {
  onClose: () => void
}

export default function TagGraph({ onClose }: Props) {
  const { state, dispatch } = useStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const [selected, setSelected] = useState<string | null>(state.activeNoteId)

  const graph = useMemo(
    () => buildNoteGraph(state.notes, { maxNodes: 30, centerNoteId: state.activeNoteId || undefined }),
    [state.notes, state.activeNoteId]
  )

  const selectedNote = selected ? state.notes.find(n => n.id === selected) : null
  const selectedNode = selected ? graph.nodes.find(n => n.id === selected) : null

  const renderGraph = useCallback(() => {
    if (!svgRef.current || graph.nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const W = svgRef.current.clientWidth || 560
    const H = svgRef.current.clientHeight || 420

    const g = svg.append('g')
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on('zoom', e => g.attr('transform', e.transform))
    )

    const r = (weight: number) => 8 + weight * 16
    const centerId = state.activeNoteId

    const nodes: SimNode[] = graph.nodes.map(n => ({
      ...n,
      ...(n.id === centerId ? { fx: W / 2, fy: H / 2 } : {}),
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

    const sim = d3.forceSimulation<SimNode>(nodes)
      .force('link', d3.forceLink<SimNode, SimEdge>(links)
        .id(d => d.id)
        .distance(d => 110 - d.strength * 50)
        .strength(d => d.strength * 0.4)
      )
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide<SimNode>(d => r(d.weight) + 10))

    const link = g.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', d => EDGE_COLORS[d.type])
      .attr('stroke-width', d => 1 + d.strength * 2)
      .attr('stroke-opacity', d => 0.2 + d.strength * 0.4)

    const linkLabel = g.append('g').selectAll('text').data(links).join('text')
      .text(d => d.label)
      .attr('font-size', 9)
      .attr('font-family', 'var(--font-sans)')
      .attr('fill', 'var(--text-faint)')
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none')
      .attr('opacity', 0)

    const dragBehavior = d3.drag<SVGGElement, SimNode>()
      .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
      .on('end', (e, d) => {
        if (!e.active) sim.alphaTarget(0)
        if (d.id !== centerId) { d.fx = null; d.fy = null }
      })

    const node = g.append('g').selectAll('g').data(nodes).join('g')
      .style('cursor', 'pointer')
      .call(dragBehavior as any)
      .on('click', (_e, d) => setSelected(d.id))
      .on('mouseenter', (_e, d) => {
        link.attr('stroke-opacity', l => {
          const s = l.source as SimNode
          const t = l.target as SimNode
          return (s.id === d.id || t.id === d.id) ? 0.9 : 0.08
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

    // 中心节点光晕
    node.filter(d => d.id === centerId)
      .append('circle')
      .attr('r', d => r(d.weight) + 5)
      .attr('fill', '#4A5C6A')
      .attr('opacity', 0.1)

    node.append('circle')
      .attr('r', d => r(d.weight))
      .attr('fill', d => d.id === centerId ? '#4A5C6A' : d.id === selected ? '#8FA3A6' : 'var(--bg-elevated)')
      .attr('stroke', '#8FA3A6')
      .attr('stroke-width', d => d.id === centerId ? 0 : 1.5)

    node.append('text')
      .text(d => d.title.length > 7 ? d.title.slice(0, 7) + '…' : d.title)
      .attr('text-anchor', 'middle')
      .attr('dy', d => r(d.weight) + 12)
      .attr('font-size', 10)
      .attr('font-family', 'var(--font-serif)')
      .attr('fill', 'var(--text-secondary)')
      .attr('pointer-events', 'none')

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
  }, [graph, selected, state.activeNoteId])

  useEffect(() => {
    const cleanup = renderGraph()
    return cleanup
  }, [renderGraph])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 'min(860px, 92vw)', height: 'min(620px, 88vh)',
        background: 'var(--bg-primary)',
        borderRadius: 12, border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', animation: 'fadeIn 200ms ease-out',
      }}>
        {/* 顶部 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderBottom: '1px solid var(--border-light)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--text-primary)', letterSpacing: 1 }}>
              思维图
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-num)' }}>
              {graph.nodes.length} 个节点 · {graph.edges.length} 条关联
            </span>
            <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)' }}>
              <span style={{ color: EDGE_COLORS.tag }}>— 标签</span>
              <span style={{ color: EDGE_COLORS.time }}>— 时间</span>
              <span>— 词义</span>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', color: 'var(--text-faint)', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* 图谱 */}
          <div style={{ flex: 1, position: 'relative' }}>
            {graph.nodes.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-faint)', fontSize: 13, fontFamily: 'var(--font-sans)', textAlign: 'center', padding: 32 }}>
                记录更多笔记并使用 #标签，<br />思维网络会自动浮现
              </div>
            ) : (
              <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
            )}
          </div>

          {/* 右侧详情 */}
          {selected && selectedNote && selectedNode && (
            <div style={{
              width: 240, borderLeft: '1px solid var(--border-light)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              animation: 'fadeIn 150ms ease-out',
            }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', marginBottom: 4 }}>
                  {selectedNote.title || '无标题'}
                </div>
                {selectedNote.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {selectedNote.tags.map(t => (
                      <span key={t} style={{ fontSize: 10, color: '#4A5C6A', fontFamily: 'var(--font-sans)' }}>#{t}</span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-serif)', lineHeight: 1.6, flex: 1, overflow: 'auto' }}>
                {selectedNode.preview || '（无内容）'}
              </div>

              {/* 关联节点 */}
              {graph.edges.filter(e => e.source === selected || e.target === selected).length > 0 && (
                <div style={{ padding: '8px 14px 12px', borderTop: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>关联</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {graph.edges
                      .filter(e => e.source === selected || e.target === selected)
                      .slice(0, 5)
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
                              background: 'transparent', borderRadius: 4,
                              padding: '4px 8px', fontSize: 11,
                              color: 'var(--text-secondary)', fontFamily: 'var(--font-serif)',
                              cursor: 'pointer', textAlign: 'left',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                            title={e.label}
                          >
                            {other.title}
                          </button>
                        )
                      })
                    }
                  </div>
                </div>
              )}

              <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-light)' }}>
                <button
                  onClick={() => { dispatch({ type: 'SET_ACTIVE_NOTE', noteId: selected }); onClose() }}
                  style={{
                    width: '100%', padding: '8px 0',
                    border: 'none', borderRadius: 6,
                    background: 'var(--ink)', color: 'var(--bg-primary)',
                    fontFamily: 'var(--font-sans)', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  打开笔记
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
