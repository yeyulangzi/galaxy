import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { feedItems, settings } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import { eq } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'
import { FeedSchema } from '@/lib/api/schemas'
import { ProviderRegistry, DirectChannel } from '@galaxy/ai'
import path from 'node:path'
import fs from 'node:fs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function resolvePromptsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'data', 'prompts'),
    path.resolve(process.cwd(), '..', '..', 'data', 'prompts'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  throw new Error(`Cannot find data/prompts folder. Tried: ${candidates.join(', ')}`)
}

function buildRegistry(): { registry: ProviderRegistry; defaultProvider: string; defaultModel: string } {
  ensureDb()
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  const registry = new ProviderRegistry()

  const envMap: Record<string, { envKey: string }> = {
    openai: { envKey: 'OPENAI_API_KEY' },
    anthropic: { envKey: 'ANTHROPIC_API_KEY' },
    bailian: { envKey: 'DASHSCOPE_API_KEY' },
    volcengine: { envKey: 'ARK_API_KEY' },
    deepseek: { envKey: 'DEEPSEEK_API_KEY' },
  }

  const creds = (row?.provider_credentials ?? {}) as Record<string, { api_key?: string; base_url?: string }>

  for (const [providerId, { envKey }] of Object.entries(envMap)) {
    const apiKey = process.env[envKey] ?? creds[providerId]?.api_key
    if (apiKey) {
      registry.registerBuiltIn(providerId as any, {
        apiKey,
        baseUrl: creds[providerId]?.base_url,
      })
    }
  }

  const defaultProvider = row?.default_provider ?? process.env.GALAXY_DEFAULT_PROVIDER ?? 'openai'
  const defaultModel = row?.default_model ?? process.env.GALAXY_DEFAULT_MODEL ?? 'gpt-4o-mini'

  return { registry, defaultProvider, defaultModel }
}

async function parseContent(input: Record<string, unknown>): Promise<string> {
  const type = input.type as string
  if (type === 'text') return (input.content as string) ?? ''

  if (type === 'url' && input.url) {
    const { extract } = await import('@extractus/article-extractor')
    const article = await extract(input.url as string)
    if (!article?.content) throw new Error('无法从该 URL 提取内容')
    return article.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  if (type === 'file_md' && input.file_content) {
    return Buffer.from(input.file_content as string, 'base64').toString('utf-8')
  }

  if (type === 'file_pdf' && input.file_content) {
    const pdfParse = (await import('pdf-parse')).default
    const buffer = Buffer.from(input.file_content as string, 'base64')
    const result = await pdfParse(buffer)
    return result.text
  }

  throw new Error(`不支持的投喂类型: ${type}`)
}

export async function POST(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = FeedSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const db = getDb()
  const feedId = generateId('f')
  const now = nowIso()

  db.insert(feedItems)
    .values({
      id: feedId,
      type: parsed.data.type,
      raw_content: 'content' in parsed.data ? parsed.data.content : null,
      source_url: 'url' in parsed.data ? parsed.data.url : null,
      status: 'processing',
      created_at: now,
    })
    .run()

  try {
    const parsedContent = await parseContent(parsed.data)

    const settingsRow = db.select().from(settings).where(eq(settings.id, 1)).get()
    if (!settingsRow?.enable_feed_ai) {
      db.update(feedItems).set({ status: 'done', suggestions_count: 0 }).where(eq(feedItems.id, feedId)).run()
      return NextResponse.json({ data: { feed_item_id: feedId, suggestions_count: 0, suggestions: [] } })
    }

    const { registry, defaultProvider, defaultModel } = buildRegistry()
    const channel = new DirectChannel(registry, resolvePromptsDir())
    const result = await channel.extractFromFeed(feedId, parsedContent, defaultProvider, defaultModel)

    return NextResponse.json({
      data: {
        feed_item_id: feedId,
        suggestions_count: result.suggestionsCreated,
        cost_usd: result.costUsd,
        duration_ms: result.durationMs,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    db.update(feedItems)
      .set({ status: 'failed', error_message: message })
      .where(eq(feedItems.id, feedId))
      .run()
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
