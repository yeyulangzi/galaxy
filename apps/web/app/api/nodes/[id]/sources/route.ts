import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { sources, sourceNodeLinks } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()

  const rows = db
    .select({
      id: sources.id,
      title: sources.title,
      type: sources.type,
      content: sources.content,
      url: sources.url,
      feed_item_id: sources.feed_item_id,
      created_at: sources.created_at,
      excerpt: sourceNodeLinks.excerpt,
      link_created_at: sourceNodeLinks.created_at,
    })
    .from(sourceNodeLinks)
    .innerJoin(sources, eq(sourceNodeLinks.source_id, sources.id))
    .where(eq(sourceNodeLinks.node_id, params.id))
    .all()

  return NextResponse.json({ data: rows })
}
