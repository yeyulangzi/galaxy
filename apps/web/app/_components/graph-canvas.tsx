'use client'

import { useEffect, useRef } from 'react'
import cytoscape, { Core, EventObject } from 'cytoscape'
// @ts-expect-error - cytoscape-fcose has no types
import fcose from 'cytoscape-fcose'
import type { Node, Edge } from '@galaxy/shared'

cytoscape.use(fcose)

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
    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#0f172a',
            label: 'data(label)',
            color: '#0f172a',
            'font-size': 12,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            width: 28,
            height: 28,
          },
        },
        {
          selector: 'node[?seed]',
          style: { 'background-color': '#f59e0b', width: 36, height: 36 },
        },
        { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#3b82f6' } },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#94a3b8',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 10,
            color: '#64748b',
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
    cy.layout({ name: 'fcose', animate: false, randomize: nodes.length < 20 } as any).run()
    cy.fit(undefined, 40)
  }, [nodes, edges])

  return (
    <div ref={containerRef} className="h-full w-full bg-muted/20" />
  )
}
