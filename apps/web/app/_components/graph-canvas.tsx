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

    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#475569',
            'border-width': 2,
            'border-color': '#64748b',
            label: 'data(label)',
            color: '#cbd5e1',
            'font-size': 11,
            'font-weight': 500,
            'text-valign': 'bottom',
            'text-margin-y': 8,
            'text-outline-color': '#0c1120',
            'text-outline-width': 2,
            width: 24,
            height: 24,
            'overlay-opacity': 0,
            'transition-property': 'background-color border-color width height',
            'transition-duration': 200,
          },
        },
        {
          selector: 'node[?seed]',
          style: {
            'background-color': '#d4a017',
            'border-color': '#fbbf24',
            width: 32,
            height: 32,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#fbbf24',
            'background-color': '#d4a017',
            width: 30,
            height: 30,
          },
        },
        {
          selector: 'node.pending-source',
          style: {
            'border-color': '#38bdf8',
            'border-style': 'dashed',
            'border-width': 3,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'line-color': '#334155',
            'target-arrow-color': '#475569',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 9,
            color: '#475569',
            'text-outline-color': '#0c1120',
            'text-outline-width': 1.5,
            opacity: 0.7,
          },
        },
        {
          selector: 'edge:selected',
          style: { 'line-color': '#fbbf24', 'target-arrow-color': '#fbbf24', opacity: 1, width: 2 },
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
    cy.add([
      ...nodes.map((n) => ({
        group: 'nodes' as const,
        data: { id: n.id, label: n.title, seed: n.is_seed ? 1 : 0 },
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
      {/* Subtle radial glow behind graph */}
      <div className="pointer-events-none absolute inset-0" style={{
        background: 'radial-gradient(ellipse 60% 50% at 50% 45%, hsl(225 30% 12%) 0%, hsl(230 25% 7%) 70%)',
      }} />
      <div ref={containerRef} className="absolute inset-0" />
      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 animate-fade-in">
          <div className="text-5xl">✨</div>
          <p className="text-lg font-medium text-muted-foreground">你的知识星图还是空的</p>
          <p className="text-sm text-muted-foreground/70">点击右下角 ➕ 投喂第一条知识</p>
        </div>
      )}
    </div>
  )
}
