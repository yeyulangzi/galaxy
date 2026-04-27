import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { settings } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { nowIso } from '@galaxy/shared'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  ensureDb()
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!row) return NextResponse.json({ error: 'settings not initialized' }, { status: 500 })

  const safeRow = { ...row, provider_credentials: undefined }
  const creds = (row.provider_credentials ?? {}) as Record<string, { api_key?: string }>
  const configuredProviders = Object.entries(creds)
    .filter(([, v]) => v.api_key)
    .map(([k]) => k)

  return NextResponse.json({ data: { ...safeRow, configured_providers: configuredProviders } })
}

export async function PATCH(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const db = getDb()

  const allowedFields = [
    'enable_feed_ai', 'enable_proactive_scan', 'enable_deepdive',
    'default_provider', 'default_model',
    'provider_credentials', 'task_provider_overrides', 'custom_providers',
    'enable_monthly_budget', 'monthly_budget_usd',
  ] as const

  const patch: Record<string, unknown> = { updated_at: nowIso() }
  for (const field of allowedFields) {
    if (field in body) {
      patch[field] = body[field]
    }
  }

  db.update(settings).set(patch).where(eq(settings.id, 1)).run()
  const updated = db.select().from(settings).where(eq(settings.id, 1)).get()
  return NextResponse.json({ data: updated })
}
