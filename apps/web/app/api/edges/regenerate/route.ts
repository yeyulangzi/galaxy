import { NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { edges, nodes, settings } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'
import { ProviderRegistry, generateEdgeDescription } from '@galaxy/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST() {
  ensureDb()
  const db = getDb()

  const allEdges = db.select().from(edges).all()
  if (allEdges.length === 0) {
    return NextResponse.json({ data: { updated: 0 } })
  }

  const settingsRow = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!settingsRow?.enable_feed_ai) {
    return NextResponse.json({ error: 'AI 未启用，请在设置中开启' }, { status: 400 })
  }

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
  if (!provider) {
    return NextResponse.json({ error: '无可用的 AI 提供商' }, { status: 400 })
  }

  // 预加载所有节点以减少查询
  const allNodes = db.select().from(nodes).all()
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]))

  let updated = 0
  for (const edge of allEdges) {
    const src = nodeMap.get(edge.source_node_id)
    const tgt = nodeMap.get(edge.target_node_id)
    if (!src || !tgt) continue

    try {
      const result = await generateEdgeDescription(
        {
          sourceTitle: src.title,
          sourceSummary: src.summary ?? null,
          targetTitle: tgt.title,
          targetSummary: tgt.summary ?? null,
          relationType: edge.relation_type,
        },
        provider,
        defaultModel,
      )

      db.update(edges)
        .set({ description: result.description, weight: result.weight })
        .where(eq(edges.id, edge.id))
        .run()
      updated++
    } catch {
      // 单条失败不中断整体
    }
  }

  return NextResponse.json({ data: { updated, total: allEdges.length } })
}
