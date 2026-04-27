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
            label: 'data(label)',
            color: '#e8e0d8',
            'font-family': 'Figtree, system-ui, sans-serif',
            'font-size': 13,
            'font-weight': 500,
            'text-valign': 'bottom',
            'text-margin-y': 10,
            'text-outline-color': '#221e1a',
            'text-outline-width': 3,
            'text-max-width': '100px',
            'text-wrap': 'ellipsis',
            width: 40,
            height: 40,
            'overlay-opacity': 0,
            'transition-property': 'width height opacity',
            'transition-duration': 150,
          },
        },
        {
          selector: 'node[?seed]',
          style: {
            width: 52,
            height: 52,
            'font-size': 14,
            'font-weight': 600,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#e8e0d8',
            width: 46,
            height: 46,
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
            width: 1,
            'line-color': '#383228',
            'target-arrow-color': '#383228',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'font-size': 8,
            'font-family': 'Figtree, system-ui, sans-serif',
            color: '#4a4238',
            'text-outline-color': '#221e1a',
            'text-outline-width': 1,
            opacity: 0.5,
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
          },
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
    const COLORS = [
      '#c06050', '#60a8a8', '#70a860', '#9878b8', '#c0a040', '#c06888',
    ]
    const hashIndex = (id: string) => {
      let h = 0
      for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0
      return Math.abs(h) % COLORS.length
    }

    cy.add([
      ...nodes.map((n) => ({
        group: 'nodes' as const,
        data: { id: n.id, label: n.title, seed: n.is_seed ? 1 : 0, bgColor: COLORS[hashIndex(n.id)] },
      })),
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
