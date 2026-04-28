
import { NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { settings } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { nowIso } from '@galaxy/shared'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function POST() {
  ensureDb()
  const db = getDb()

  db.update(settings)
    .set({
      enable_feed_ai: false,
      enable_proactive_scan: false,
      enable_deepdive: false,
      updated_at: nowIso(),
    })
    .where(eq(settings.id, 1))
    .run()

  return NextResponse.json({ data: { disabled: true } })
}
