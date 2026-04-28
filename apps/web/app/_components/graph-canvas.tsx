'use client'

import { useEffect, useRef } from 'react'
import cytoscape, { Core, EventObject } from 'cytoscape'
import type { Node, Edge } from '@galaxy/shared'

let fcoseRegistered = false

interface Props {
  nodes: Node[]
  edges: Edge[]
  onSelectNode: (id: string | null) => void
  onCreateEdge: (sourceId: string, targetId: string) => void
}

export function GraphCanvas({ nodes, edges, onSelectNode, onCreateEdge }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const pendingSourceRef = useRef<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // 延迟注册 fcose 布局（避免模块顶层 ESM/CJS 兼容问题）
    if (!fcoseRegistered) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fcose = require('cytoscape-fcose')
        cytoscape.use(fcose.default || fcose)
        fcoseRegistered = true
      } catch {
        // fcose 加载失败时 fallback 到 grid 布局
      }
    }

    // Obsidian-style palette — saturated, distinct hues on solid circles
    const NODE_COLORS = [
      '#c06050', // terracotta red
      '#60a8a8', // teal
      '#70a860', // sage green
      '#9878b8', // lavender
      '#c0a040', // ochre gold
      '#c06888', // rose pink
    ]

    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(bgColor)',
            'border-width': 0,
            label: '',
            color: '#e8e0d8',
            'font-family': 'Figtree, system-ui, sans-serif',
            'font-size': 12,
            'font-weight': 500,
            'text-valign': 'bottom',
            'text-margin-y': 8,
            'text-outline-color': '#221e1a',
            'text-outline-width': 3,
            'text-max-width': '110px',
            'text-wrap': 'ellipsis',
            width: 'data(size)',
            height: 'data(size)',
            'overlay-opacity': 0,
            'transition-property': 'width height opacity border-width',
            'transition-duration': 150,
          },
        },
        {
          selector: 'node.show-label',
          style: {
            label: 'data(label)',
          },
        },
        {
          selector: 'node:selected',
          style: {
            label: 'data(label)',
            'border-width': 2,
            'border-color': '#e8e0d8',
          },
        },
        {
          selector: 'node.pending-source',
          style: {
            'border-color': '#60a8a8',
            'border-style': 'dashed',
            'border-width': 3,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 0.8,
            'line-color': '#332e28',
            'target-arrow-color': '#332e28',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            opacity: 0.35,
          },
        },
        {
          selector: 'edge.neighbor',
          style: {
            opacity: 0.6,
            'line-color': '#4a4238',
            'target-arrow-color': '#4a4238',
          },
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#685e52',
            'target-arrow-color': '#685e52',
            opacity: 1,
            width: 1.5,
            label: 'data(label)',
            'font-size': 9,
            'font-family': 'Figtree, system-ui, sans-serif',
            color: '#685e52',
            'text-outline-color': '#221e1a',
            'text-outline-width': 1,
          },
        },
      ],
    })
    cyRef.current = cy

    // Hover: show label + highlight neighbors
    cy.on('mouseover', 'node', (e: EventObject) => {
      const node = e.target
      node.addClass('show-label')
      node.neighborhood('node').addClass('show-label')
      node.connectedEdges().addClass('neighbor')
    })
    cy.on('mouseout', 'node', (e: EventObject) => {
      const node = e.target
      node.removeClass('show-label')
      node.neighborhood('node').removeClass('show-label')
      node.connectedEdges().removeClass('neighbor')
    })

    cy.on('tap', 'node', (e: EventObject) => {
      const id = e.target.id() as string
      if (pendingSourceRef.current && pendingSourceRef.current !== id) {
        onCreateEdge(pendingSourceRef.current, id)
        pendingSourceRef.current = null
        cy.elements().removeClass('pending-source')
      } else {
        onSelectNode(id)
      }
    })
    cy.on('tap', (e: EventObject) => {
      if (e.target === cy) {
        onSelectNode(null)
        pendingSourceRef.current = null
        cy.elements().removeClass('pending-source')
      }
    })
    cy.on('cxttap', 'node', (e: EventObject) => {
      pendingSourceRef.current = e.target.id() as string
      e.target.addClass('pending-source')
    })

    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [onSelectNode, onCreateEdge])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.elements().remove()
    const COLORS = [
      '#c06050', '#60a8a8', '#70a860', '#9878b8', '#c0a040', '#c06888',
    ]
    const hashIndex = (id: string) => {
      let h = 0
      for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0
      return Math.abs(h) % COLORS.length
    }

    // Count connections per node for size scaling
    const MIN_SIZE = 24
    const MAX_SIZE = 60
    const degreeMap = new Map<string, number>()
    for (const e of edges) {
      degreeMap.set(e.source_node_id, (degreeMap.get(e.source_node_id) ?? 0) + 1)
      degreeMap.set(e.target_node_id, (degreeMap.get(e.target_node_id) ?? 0) + 1)
    }
    const maxDegree = Math.max(1, ...degreeMap.values())
    const nodeSize = (id: string) => {
      const degree = degreeMap.get(id) ?? 0
      return Math.round(MIN_SIZE + (degree / maxDegree) * (MAX_SIZE - MIN_SIZE))
    }

    cy.add([
      ...nodes.map((n) => ({
        group: 'nodes' as const,
        data: {
          id: n.id,
          label: n.title,
          seed: n.is_seed ? 1 : 0,
          bgColor: COLORS[hashIndex(n.id)],
          size: nodeSize(n.id),
        },
      })),
      ...edges.map((e) => ({
        group: 'edges' as const,
        data: { id: e.id, source: e.source_node_id, target: e.target_node_id, label: e.relation_type },
      })),
    ])

    // Animated layout
    const layoutOptions = fcoseRegistered
      ? {
          name: 'fcose',
          animate: true,
          animationDuration: 600,
          animationEasing: 'ease-out-quart' as const,
          randomize: nodes.length < 30,
          nodeSeparation: 80,
          idealEdgeLength: 120,
          nodeRepulsion: () => 6000,
          gravity: 0.3,
        }
      : { name: 'grid', animate: true, animationDuration: 400 }
    cy.layout(layoutOptions as any).run()
    cy.fit(undefined, 50)
  }, [nodes, edges])

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Soft warm vignette */}
      <div className="pointer-events-none absolute inset-0" style={{
        background: 'radial-gradient(ellipse 70% 60% at 50% 45%, hsl(30 8% 14%) 0%, hsl(30 8% 12%) 80%)',
      }} />
      <div ref={containerRef} className="absolute inset-0" />
      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 animate-fade-in">
          <p className="text-base font-medium text-muted-foreground">还没有任何节点</p>
          <p className="text-sm text-muted-foreground/60">点击右下角 + 投喂第一条知识</p>
        </div>
      )}
    </div>
  )
}
