import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { edges, nodes, settings, operationLogs } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import { CreateEdgeSchema } from '@/lib/api/schemas'
import { ensureDb } from '@/lib/api/ensure-db'
import { desc, eq } from 'drizzle-orm'
import { ProviderRegistry, generateEdgeDescription } from '@galaxy/ai'

export const dynamic = 'force-dynamic'

export async function GET() {
  ensureDb()
  const db = getDb()
  const rows = db.select().from(edges).orderBy(desc(edges.updated_at)).all()
  return NextResponse.json({ data: rows })
}

export async function POST(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = CreateEdgeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const db = getDb()

  // 校验两端节点存在
  const src = db.select().from(nodes).where(eq(nodes.id, parsed.data.source_node_id)).get()
  const tgt = db.select().from(nodes).where(eq(nodes.id, parsed.data.target_node_id)).get()
  if (!src || !tgt) {
    return NextResponse.json({ error: 'source or target node not found' }, { status: 404 })
  }

  const id = generateId('e')
  try {
    db.insert(edges)
      .values({
        id,
        source_node_id: parsed.data.source_node_id,
        target_node_id: parsed.data.target_node_id,
        relation_type: parsed.data.relation_type,
        origin: parsed.data.origin ?? 'manual',
        weight: parsed.data.weight ?? 1,
        description: parsed.data.description ?? null,
      })
      .run()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: '相同三元组的边已存在' }, { status: 409 })
    }
    throw e
  }
  // 异步调用 AI 生成关联描述（不阻塞响应）
  generateEdgeDescriptionAsync(db, id, src, tgt, parsed.data.relation_type).catch(() => {
    /* 静默失败，不影响边的创建 */
  })

  const row = db.select().from(edges).where(eq(edges.id, id)).get()

  db.insert(operationLogs)
    .values({
      id: generateId('ol'),
      operation: 'create_edge',
      affected_ids: JSON.stringify([id]),
      payload_snapshot: null,
      user_note: `创建边「${src.title} → ${tgt.title}」(${parsed.data.relation_type})`,
      created_at: nowIso(),
    })
    .run()

  return NextResponse.json({ data: row }, { status: 201 })
}

/**
 * 后台用 AI 生成边的关联描述和 weight，然后更新 edge 记录。
 */
async function generateEdgeDescriptionAsync(
  db: ReturnType<typeof getDb>,
  edgeId: string,
  src: { title: string; summary: string | null },
  tgt: { title: string; summary: string | null },
  relationType: string,
) {
  const settingsRow = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!settingsRow?.enable_feed_ai) return

  const registry = new ProviderRegistry()
  const envMap: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    bailian: 'DASHSCOPE_API_KEY',
    volcengine: 'ARK_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
  }
  const creds = (settingsRow?.provider_credentials ?? {}) as Record<string, { api_key?: string; base_url?: string }>
  for (const [providerId, envKey] of Object.entries(envMap)) {
    const apiKey = process.env[envKey] ?? creds[providerId]?.api_key
    if (apiKey) {
      registry.registerBuiltIn(providerId as any, { apiKey, baseUrl: creds[providerId]?.base_url })
    }
  }

  const defaultProvider = settingsRow?.default_provider ?? process.env.GALAXY_DEFAULT_PROVIDER ?? 'openai'
  const defaultModel = settingsRow?.default_model ?? process.env.GALAXY_DEFAULT_MODEL ?? 'gpt-4o-mini'

  const provider = registry.get(defaultProvider)
  if (!provider) return

  const result = await generateEdgeDescription(
    {
      sourceTitle: src.title,
      sourceSummary: src.summary ?? null,
      targetTitle: tgt.title,
      targetSummary: tgt.summary ?? null,
      relationType,
    },
    provider,
    defaultModel,
  )

  db.update(edges)
    .set({
      description: result.description,
      weight: result.weight,
    })
    .where(eq(edges.id, edgeId))
    .run()
}
