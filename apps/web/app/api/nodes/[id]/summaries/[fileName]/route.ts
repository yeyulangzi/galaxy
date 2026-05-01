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
 * GET /api/nodes/[id]/summaries/[fileName]
 * 读取单个 md 附件的内容
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; fileName: string } },
) {
  const dir = resolveSummariesDir(params.id)
  if (!dir) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const decodedName = decodeURIComponent(params.fileName)
  if (decodedName.includes('..') || decodedName.includes('/')) {
    return NextResponse.json({ error: 'Invalid file name' }, { status: 400 })
  }

  const filePath = path.join(dir, decodedName)
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  return NextResponse.json({ data: { fileName: decodedName, content } })
}
