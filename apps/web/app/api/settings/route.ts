import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { settings } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { nowIso } from '@galaxy/shared'
import { encrypt, decrypt } from '@galaxy/ai'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  ensureDb()
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!row) return NextResponse.json({ error: 'settings not initialized' }, { status: 500 })

  const creds = (row.provider_credentials ?? {}) as Record<string, { api_key?: string }>

  // 构建 masked credentials：解密后脱敏返回
  const maskedCredentials: Record<string, { has_key: boolean; masked_key: string }> = {}
  for (const [provider, value] of Object.entries(creds)) {
    const encryptedKey = value?.api_key ?? ''
    if (encryptedKey.length === 0) {
      maskedCredentials[provider] = { has_key: false, masked_key: '' }
      continue
    }
    let plainKey: string
    try {
      plainKey = decrypt(encryptedKey)
    } catch {
      plainKey = encryptedKey
    }
    maskedCredentials[provider] = {
      has_key: true,
      masked_key: plainKey.length > 8 ? plainKey.slice(0, 4) + '****' + plainKey.slice(-4) : '****',
    }
  }

  const configuredProviders = Object.entries(creds)
    .filter(([, v]) => v.api_key)
    .map(([k]) => k)

  const safeRow = { ...row, provider_credentials: undefined }
  return NextResponse.json({ data: { ...safeRow, configured_providers: configuredProviders, masked_credentials: maskedCredentials } })
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
    'proactive_scan_cron', 'proactive_scan_max_suggestions', 'proactive_scan_strategies',
  ] as const

  const patch: Record<string, unknown> = { updated_at: nowIso() }
  for (const field of allowedFields) {
    if (field in body) {
      patch[field] = body[field]
    }
  }

  // provider_credentials 需要增量合并，不是直接覆盖
  if ('provider_credentials' in body && typeof body.provider_credentials === 'object') {
    const row = db.select().from(settings).where(eq(settings.id, 1)).get()
    const existingCreds = (row?.provider_credentials ?? {}) as Record<string, { api_key?: string }>
    const incomingCreds = body.provider_credentials as Record<string, { api_key?: string }>
    const mergedCreds: Record<string, { api_key?: string }> = { ...existingCreds }

    for (const [providerId, value] of Object.entries(incomingCreds)) {
      const newKey = value?.api_key ?? ''
      if (newKey === '__KEEP__') {
        continue
      }
      if (newKey === '') {
        delete mergedCreds[providerId]
      } else {
        mergedCreds[providerId] = { api_key: encrypt(newKey) }
      }
    }
    patch.provider_credentials = mergedCreds
  }

  db.update(settings).set(patch).where(eq(settings.id, 1)).run()
  const updated = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!updated) return NextResponse.json({ error: 'settings not found' }, { status: 500 })

  // 返回时不暴露原始 credentials，但要返回 masked 信息
  const updatedCreds = (updated.provider_credentials ?? {}) as Record<string, { api_key?: string }>
  const maskedCredentials: Record<string, { has_key: boolean; masked_key: string }> = {}
  for (const [provider, value] of Object.entries(updatedCreds)) {
    const encryptedKey = value?.api_key ?? ''
    if (encryptedKey.length === 0) {
      maskedCredentials[provider] = { has_key: false, masked_key: '' }
      continue
    }
    let plainKey: string
    try {
      plainKey = decrypt(encryptedKey)
    } catch {
      plainKey = encryptedKey
    }
    maskedCredentials[provider] = {
      has_key: true,
      masked_key: plainKey.length > 8 ? plainKey.slice(0, 4) + '****' + plainKey.slice(-4) : '****',
    }
  }
  const configuredProviders = Object.entries(updatedCreds)
    .filter(([, v]) => v.api_key)
    .map(([k]) => k)

  const safeUpdated = { ...updated, provider_credentials: undefined }
  return NextResponse.json({ data: { ...safeUpdated, configured_providers: configuredProviders, masked_credentials: maskedCredentials } })
}
