import { NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { edges, nodes, settings } from '@galaxy/db/schema'
import { eq, sql } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'
import { ProviderRegistry, backfillEdgesForNode } from '@galaxy/ai'
import type { BackfillNodeInfo } from '@galaxy/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/edges/backfill
 * 增量式关系补齐：只扫描边数不足（< 3 条）的节点，让 AI 找出应该关联的节点对。
 * 已有边的节点对不会重复创建，避免计算资源浪费。
 */
export async function POST() {
  ensureDb()
  const db = getDb()

  const settingsRow = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!settingsRow?.enable_feed_ai) {
    return NextResponse.json({ error: 'AI 未启用，请在设置中开启' }, { status: 400 })
  }

  // 初始化 AI provider
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

  // 加载所有节点
  const allNodes = db.select().from(nodes).all()
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]))
  const titleToId = new Map(allNodes.map((n) => [n.title, n.id]))

  // 加载所有已有的边，构建已有关系集合
  const allEdges = db.select().from(edges).all()
  const existingPairs = new Set<string>()
  const edgeCountMap = new Map<string, number>()

  for (const edge of allEdges) {
    existingPairs.add(`${edge.source_node_id}::${edge.target_node_id}`)
    existingPairs.add(`${edge.target_node_id}::${edge.source_node_id}`)
    edgeCountMap.set(edge.source_node_id, (edgeCountMap.get(edge.source_node_id) ?? 0) + 1)
    edgeCountMap.set(edge.target_node_id, (edgeCountMap.get(edge.target_node_id) ?? 0) + 1)
  }

  // 找出边数不足（< 3 条）的节点作为 anchor
  const sparseNodes = allNodes.filter((n) => (edgeCountMap.get(n.id) ?? 0) < 3)

  if (sparseNodes.length === 0) {
    return NextResponse.json({ data: { created: 0, scanned: 0, message: '所有节点都已有足够的关联' } })
  }

  // 候选节点列表（标题）
  const candidates = allNodes.map((n) => ({ title: n.title }))

  let totalCreated = 0

  for (const anchor of sparseNodes) {
    // 构建 anchor 已有的关联目标标题集合
    const existingTargetTitles = new Set<string>()
    for (const edge of allEdges) {
      if (edge.source_node_id === anchor.id) {
        const target = nodeMap.get(edge.target_node_id)
        if (target) existingTargetTitles.add(target.title)
      } else if (edge.target_node_id === anchor.id) {
        const source = nodeMap.get(edge.source_node_id)
        if (source) existingTargetTitles.add(source.title)
      }
    }

    const anchorInfo: BackfillNodeInfo = {
      id: anchor.id,
      title: anchor.title,
      summary: anchor.summary,
      domain: anchor.domain,
    }

    try {
      const suggestions = await backfillEdgesForNode(
        anchorInfo,
        candidates,
        existingTargetTitles,
        provider,
        defaultModel,
      )

      for (const suggestion of suggestions) {
        const targetId = titleToId.get(suggestion.targetTitle)
        if (!targetId) continue
        if (existingPairs.has(`${anchor.id}::${targetId}`)) continue

        const edgeId = `e_bf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
        db.insert(edges).values({
          id: edgeId,
          source_node_id: anchor.id,
          target_node_id: targetId,
          relation_type: suggestion.relationType,
          weight: suggestion.confidence,
          origin: 'ai_suggested',
          description: suggestion.rationale,
          created_at: new Date().toISOString(),
        }).run()

        existingPairs.add(`${anchor.id}::${targetId}`)
        existingPairs.add(`${targetId}::${anchor.id}`)
        totalCreated++
      }
    } catch {
      // 单个 anchor 失败不中断整体
    }
  }

  return NextResponse.json({
    data: {
      created: totalCreated,
      scanned: sparseNodes.length,
      totalNodes: allNodes.length,
    },
  })
}
