import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { useStore } from '../store'
import { buildTagGraph } from '@notepro/shared'
import type { GraphNode, GraphEdge, TagGraphData } from '@notepro/shared'

// ─── Simulation Types ────────────────────────────────────────────────────────

interface SimNode extends GraphNode, d3.SimulationNodeDatum {}
interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  type: GraphEdge['type']
  weight: number
  sourceId: string
  targetId: string
}

// ─── Edge Colors (tag=dark, temporal=medium, semantic=light) ─────────────────

const EDGE_COLORS: Record<GraphEdge['type'], string> = {
  tag:      '#4A5C6A',   // dark
  temporal: '#8FA3A6',   // medium
  semantic: '#C8D0D4',   // light
}

const EDGE_LABELS: Record<GraphEdge['type'], string> = {
  tag:      '标签',
  temporal: '时间',
  semantic: '语义',
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
}

export default function TagGraph({ onClose }: Props) {
  const { state, dispatch } = useStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const [selected, setSelected] = useState<string | null>(state.activeNoteId)
  const [graphData, setGraphData] = useState<TagGraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [embeddingsLoading, setEmbeddingsLoading] = useState(false)

  // Build graph data using shared buildTagGraph (async for embeddings)
  useEffect(() => {
    let cancelled = false

    async function loadGraph() {
      setLoading(true)
      const activeNotes = state.notes.filter(n => !n.deletedAt)

      // First pass: build without embeddings for immediate display
      const initialGraph = await buildTagGraph(activeNotes, state.activeNoteId || null)
      if (cancelled) return
      setGraphData(initialGraph)
      setLoading(false)

      // Second pass: attempt to fetch embeddings for semantic edges
      setEmbeddingsLoading(true)
      try {
        const graphWithEmbeddings = await buildTagGraph(activeNotes, state.activeNoteId || null, {
          fetchEmbeddings: async (noteIds: string[]) => {
            // Attempt to load cached embeddings from localStorage
            const cached = new Map<string, number[]>()
            for (const id of noteIds) {
              const key = `shimo-embedding-${id}`
              const stored = localStorage.getItem(key)
              if (stored) {
                try {
                  cached.set(id, JSON.parse(stored))
                } catch { /* skip invalid */ }
              }
            }
            // If no cached embeddings, return empty (graceful degradation)
            return cached
          },
        })
        if (!cancelled) {
          setGraphData(graphWithEmbeddings)
        }
      } catch {
        // Graceful degradation: keep the graph without semantic edges
      } finally {
        if (!cancelled) setEmbeddingsLoading(false)
      }
    }

    loadGraph()
    return () => { cancelled = true }
  }, [state.notes, state.activeNoteId])

  const selectedNote = selected ? state.notes.find(n => n.id === selected) : null
  const selectedGraphNode = selected && graphData ? graphData.nodes.find(n => n.id === selected) : null

  // ─── D3 Rendering ──────────────────────────────────────────────────────────

  const renderGraph = useCallback(() => {
    if (!svgRef.current || !graphData || graphData.nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const W = svgRef.current.clientWidth || 560
    const H = svgRef.current.clientHeight || 420

    const g = svg.append('g')

    // Zoom: 0.2x to 4x with pan
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on('zoom', e => g.attr('transform', e.transform))
    )

    // Node radius based on edge count
    const edgeCountMap = new Map<string, number>()
    for (const edge of graphData.edges) {
      edgeCountMap.set(edge.source, (edgeCountMap.get(edge.source) || 0) + 1)
      edgeCountMap.set(edge.target, (edgeCountMap.get(edge.target) || 0) + 1)
    }
    const r = (nodeId: string) => {
      const count = edgeCountMap.get(nodeId) || 0
      return 8 + Math.min(count, 8) * 2
    }

    const centerId = state.activeNoteId

    // Build simulation nodes
    const nodes: SimNode[] = graphData.nodes.map(n => ({
      ...n,
      ...(n.id === centerId ? { fx: W / 2, fy: H / 2 } : {}),
    }))
    const byId = new Map(nodes.map(n => [n.id, n]))

    // Build simulation edges
    const links: SimEdge[] = graphData.edges
      .map(e => ({
        ...e,
        source: byId.get(e.source)!,
        target: byId.get(e.target)!,
        sourceId: e.source,
        targetId: e.target,
      }))
      .filter(e => e.source && e.target)

    // Force simulation
    const sim = d3.forceSimulation<SimNode>(nodes)
      .force('link', d3.forceLink<SimNode, SimEdge>(links)
        .id(d => d.id)
        .distance(d => 120 - d.weight * 40)
        .strength(d => 0.2 + d.weight * 0.3)
      )
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide<SimNode>(d => r(d.id) + 12))

    // Draw edges
    const link = g.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', d => EDGE_COLORS[d.type])
      .attr('stroke-width', d => 1 + d.weight * 2)
      .attr('stroke-opacity', d => 0.2 + d.weight * 0.4)

    // Edge labels (hidden by default, shown on hover)
    const linkLabel = g.append('g').selectAll('text').data(links).join('text')
      .text(d => EDGE_LABELS[d.type])
      .attr('font-size', 9)
      .attr('font-family', 'var(--font-sans)')
      .attr('fill', 'var(--text-faint)')
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none')
      .attr('opacity', 0)

    // Drag behavior for nodes
    const dragBehavior = d3.drag<SVGGElement, SimNode>()
      .on('start', (e, d) => {
        if (!e.active) sim.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (e, d) => {
        d.fx = e.x
        d.fy = e.y
      })
      .on('end', (e, d) => {
        if (!e.active) sim.alphaTarget(0)
        // Keep center node fixed, release others
        if (d.id !== centerId) {
          d.fx = null
          d.fy = null
        }
      })

    // Draw nodes
    const node = g.append('g').selectAll<SVGGElement, SimNode>('g').data(nodes).join('g')
      .style('cursor', 'pointer')
      .call(dragBehavior as any)
      .on('click', (_e, d) => setSelected(d.id))
      .on('mouseenter', (_e, d) => {
        // Highlight connected edges and show labels
        link.attr('stroke-opacity', l => {
          const s = l.source as SimNode
          const t = l.target as SimNode
          return (s.id === d.id || t.id === d.id) ? 0.9 : 0.06
        })
        linkLabel.attr('opacity', l => {
          const s = l.source as SimNode
          const t = l.target as SimNode
          return (s.id === d.id || t.id === d.id) ? 1 : 0
        })
        // Dim unconnected nodes
        const connectedIds = new Set<string>()
        connectedIds.add(d.id)
        links.forEach(l => {
          const s = l.source as SimNode
          const t = l.target as SimNode
          if (s.id === d.id) connectedIds.add(t.id)
          if (t.id === d.id) connectedIds.add(s.id)
        })
        node.attr('opacity', n => connectedIds.has(n.id) ? 1 : 0.3)
      })
      .on('mouseleave', () => {
        link.attr('stroke-opacity', d => 0.2 + d.weight * 0.4)
        linkLabel.attr('opacity', 0)
        node.attr('opacity', 1)
      })

    // Center node glow
    node.filter(d => d.id === centerId)
      .append('circle')
      .attr('r', d => r(d.id) + 5)
      .attr('fill', '#4A5C6A')
      .attr('opacity', 0.1)

    // Node circles
    node.append('circle')
      .attr('r', d => r(d.id))
      .attr('fill', d => d.id === centerId ? '#4A5C6A' : d.id === selected ? '#8FA3A6' : 'var(--bg-elevated)')
      .attr('stroke', '#8FA3A6')
      .attr('stroke-width', d => d.id === centerId ? 0 : 1.5)

    // Node labels
    node.append('text')
      .text(d => d.title.length > 7 ? d.title.slice(0, 7) + '…' : d.title)
      .attr('text-anchor', 'middle')
      .attr('dy', d => r(d.id) + 12)
      .attr('font-size', 10)
      .attr('font-family', 'var(--font-serif)')
      .attr('fill', 'var(--text-secondary)')
      .attr('pointer-events', 'none')

    // Tick handler
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
  }, [graphData, selected, state.activeNoteId])

  useEffect(() => {
    const cleanup = renderGraph()
    return cleanup
  }, [renderGraph])

  // ─── Content preview helper ────────────────────────────────────────────────

  const getContentPreview = (noteId: string): string => {
    const note = state.notes.find(n => n.id === noteId)
    if (!note) return '（无内容）'
    try {
      const doc = JSON.parse(note.content)
      const walk = (n: any): string => n.text || (n.content || []).map(walk).join('')
      return walk(doc).slice(0, 120) || '（无内容）'
    } catch {
      return '（无内容）'
    }
  }

  // ─── Connected edges for detail panel ──────────────────────────────────────

  const connectedEdges = selected && graphData
    ? graphData.edges.filter(e => e.source === selected || e.target === selected)
    : []

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(28,28,30,0.4)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-label="思维图"
    >
      <div style={{
        width: 'min(860px, 92vw)', height: 'min(620px, 88vh)',
        background: 'var(--bg-primary)',
        borderRadius: 12, border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', animation: 'fadeIn 200ms ease-out',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderBottom: '1px solid var(--border-light)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--text-primary)', letterSpacing: 1 }}>
              思维图
            </span>
            {graphData && (
              <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-num)' }}>
                {graphData.nodes.length} 个节点 · {graphData.edges.length} 条关联
              </span>
            )}
            {/* Edge color legend */}
            <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)' }}>
              <span style={{ color: EDGE_COLORS.tag }}>— 标签</span>
              <span style={{ color: EDGE_COLORS.temporal }}>— 时间</span>
              <span style={{ color: EDGE_COLORS.semantic }}>— 语义</span>
            </div>
            {/* Loading indicator for async embeddings */}
            {embeddingsLoading && (
              <span style={{
                fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8,
                  border: '1.5px solid var(--text-faint)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                加载语义关联…
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', color: 'var(--text-faint)', fontSize: 18, cursor: 'pointer' }}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Graph area */}
          <div style={{ flex: 1, position: 'relative' }}>
            {loading ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: 'var(--text-faint)', fontSize: 13,
                fontFamily: 'var(--font-sans)',
              }}>
                <span style={{
                  display: 'inline-block', width: 16, height: 16,
                  border: '2px solid var(--text-faint)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  marginRight: 8,
                }} />
                构建思维图…
              </div>
            ) : graphData && graphData.nodes.length === 0 ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: 'var(--text-faint)', fontSize: 13,
                fontFamily: 'var(--font-sans)', textAlign: 'center', padding: 32,
              }}>
                记录更多笔记并使用 #标签，<br />思维网络会自动浮现
              </div>
            ) : (
              <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
            )}
          </div>

          {/* Detail panel (shown on node click) */}
          {selected && selectedNote && selectedGraphNode && (
            <div style={{
              width: 240, borderLeft: '1px solid var(--border-light)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              animation: 'fadeIn 150ms ease-out',
            }}>
              {/* Note title and tags */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{
                  fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
                  fontFamily: 'var(--font-serif)', marginBottom: 4,
                }}>
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

              {/* Content preview */}
              <div style={{
                padding: '10px 14px', fontSize: 12, color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-serif)', lineHeight: 1.6, flex: 1, overflow: 'auto',
              }}>
                {getContentPreview(selected)}
              </div>

              {/* Connected notes */}
              {connectedEdges.length > 0 && (
                <div style={{ padding: '8px 14px 12px', borderTop: '1px solid var(--border-light)' }}>
                  <div style={{
                    fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-num)',
                    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    关联
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {connectedEdges.slice(0, 5).map(e => {
                      const otherId = e.source === selected ? e.target : e.source
                      const otherNode = graphData?.nodes.find(n => n.id === otherId)
                      if (!otherNode) return null
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
                          title={EDGE_LABELS[e.type]}
                        >
                          {otherNode.title || '无标题'}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Open note button */}
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

      {/* Spinner animation keyframes */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
