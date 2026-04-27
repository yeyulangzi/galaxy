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

    // Node color palette — warm, distinguishable hues
    const NODE_COLORS = [
      { bg: '#c2654a', border: '#d4795f' }, // terracotta
      { bg: '#4a96a0', border: '#5fb0b8' }, // teal
      { bg: '#54966e', border: '#6aad84' }, // sage
      { bg: '#8a6db5', border: '#9f84c4' }, // lavender
      { bg: '#b89640', border: '#ccaa55' }, // ochre
      { bg: '#b5567a', border: '#c86e90' }, // rose
    ]

    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(bgColor)',
            'border-width': 2,
            'border-color': 'data(borderColor)',
            label: 'data(label)',
            color: '#c8bfb4',
            'font-family': 'Figtree, system-ui, sans-serif',
            'font-size': 12,
            'font-weight': 500,
            'text-valign': 'bottom',
            'text-margin-y': 8,
            'text-outline-color': '#1f1b17',
            'text-outline-width': 2,
            'text-max-width': '90px',
            'text-wrap': 'ellipsis',
            width: 28,
            height: 28,
            'overlay-opacity': 0,
            'transition-property': 'background-color border-color width height',
            'transition-duration': 200,
          },
        },
        {
          selector: 'node[?seed]',
          style: {
            width: 38,
            height: 38,
            'font-size': 13,
            'font-weight': 600,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#c2654a',
            width: 34,
            height: 34,
          },
        },
        {
          selector: 'node.pending-source',
          style: {
            'border-color': '#4a96a0',
            'border-style': 'dashed',
            'border-width': 3,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'line-color': '#3d3730',
            'target-arrow-color': '#4d453d',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 9,
            'font-family': 'Figtree, system-ui, sans-serif',
            color: '#665d54',
            'text-outline-color': '#1f1b17',
            'text-outline-width': 1.5,
            opacity: 0.8,
          },
        },
        {
          selector: 'edge:selected',
          style: { 'line-color': '#c2654a', 'target-arrow-color': '#c2654a', opacity: 1, width: 2 },
        },
      ],
    })
    cyRef.current = cy

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
    // Stable color assignment based on node id hash
    const NODE_COLORS = [
      { bg: '#c2654a', border: '#d4795f' },
      { bg: '#4a96a0', border: '#5fb0b8' },
      { bg: '#54966e', border: '#6aad84' },
      { bg: '#8a6db5', border: '#9f84c4' },
      { bg: '#b89640', border: '#ccaa55' },
      { bg: '#b5567a', border: '#c86e90' },
    ]
    const hashIndex = (id: string) => {
      let h = 0
      for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0
      return Math.abs(h) % NODE_COLORS.length
    }

    cy.add([
      ...nodes.map((n) => {
        const c = NODE_COLORS[hashIndex(n.id)]
        return {
          group: 'nodes' as const,
          data: { id: n.id, label: n.title, seed: n.is_seed ? 1 : 0, bgColor: c.bg, borderColor: c.border },
        }
      }),
      ...edges.map((e) => ({
        group: 'edges' as const,
        data: { id: e.id, source: e.source_node_id, target: e.target_node_id, label: e.relation_type },
      })),
    ])
    cy.layout({ name: fcoseRegistered ? 'fcose' : 'grid', animate: false, randomize: nodes.length < 20 } as any).run()
    cy.fit(undefined, 40)
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
