import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { edges, operationLogs } from '@galaxy/db/schema'
import { ensureDb } from '@/lib/api/ensure-db'
import { eq } from 'drizzle-orm'
import { generateId, nowIso } from '@galaxy/shared'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const existing = db.select().from(edges).where(eq(edges.id, params.id)).get()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const logId = generateId('ol')
  db.insert(operationLogs)
    .values({
      id: logId,
      operation: 'confirm_delete_edge',
      affected_ids: JSON.stringify([params.id]),
      payload_snapshot: JSON.stringify({ edge: existing }),
      user_note: `删除边「${existing.source_id} → ${existing.target_id}」`,
      created_at: nowIso(),
    })
    .run()

  db.delete(edges).where(eq(edges.id, params.id)).run()
  return NextResponse.json({ data: { id: params.id, operation_log_id: logId } })
}
