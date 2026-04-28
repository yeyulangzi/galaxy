
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { nodes, edges, aspects, suggestions } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  ensureDb()
  const db = getDb()
  const url = new URL(req.url)
  const format = url.searchParams.get('format') ?? 'json'

  const allNodes = db.select().from(nodes).all()
  const allEdges = db.select().from(edges).all()
  const allAspects = db.select().from(aspects).all()
  const allSuggestions = db.select().from(suggestions).all()

  if (format === 'markdown') {
    const aspectsByNode = new Map<string, typeof allAspects>()
    for (const aspect of allAspects) {
      const existing = aspectsByNode.get(aspect.node_id) ?? []
      existing.push(aspect)
      aspectsByNode.set(aspect.node_id, existing)
    }

    const lines: string[] = ['# Galaxy Knowledge Graph Export', '']

    for (const node of allNodes) {
      lines.push(`## ${node.title}`)
      lines.push('')
      if (node.summary) {
        lines.push(node.summary)
        lines.push('')
      }
      if (node.domain) {
        lines.push(`**Domain:** ${node.domain}`)
        lines.push('')
      }

      const nodeAspects = aspectsByNode.get(node.id) ?? []
      for (const aspect of nodeAspects) {
        lines.push(`### ${aspect.title}`)
        lines.push('')
        lines.push(aspect.content)
        lines.push('')
      }

      lines.push('---')
      lines.push('')
    }

    const markdown = lines.join('\n')
    return new NextResponse(markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="galaxy-export.md"',
      },
    })
  }

  // JSON format (default)
  const exportData = {
    nodes: allNodes,
    edges: allEdges,
    aspects: allAspects,
    suggestions: allSuggestions,
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="galaxy-export.json"',
    },
  })
}
