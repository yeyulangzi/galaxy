import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs'

export const dynamic = 'force-dynamic'

function resolveSummariesDir(nodeId: string): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'data', 'summaries', nodeId),
    path.resolve(process.cwd(), '..', '..', 'data', 'summaries', nodeId),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return null
}

/**
 * GET /api/nodes/[id]/summaries
 * 列出节点的所有总结 md 附件
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const dir = resolveSummariesDir(params.id)
  if (!dir) {
    return NextResponse.json({ data: [] })
  }

  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort((a, b) => b.localeCompare(a)) // newest first
    .map((fileName) => {
      const filePath = path.join(dir, fileName)
      const stat = fs.statSync(filePath)
      return {
        fileName,
        relativePath: `summaries/${params.id}/${fileName}`,
        createdAt: stat.mtime.toISOString(),
        size: stat.size,
      }
    })

  return NextResponse.json({ data: files })
}
