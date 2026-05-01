import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { nodes, edges, aspects, operationLogs } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

/**
 * POST /api/data/import — 从 JSON 导入数据（与 /api/data/export?format=json 格式对齐）
 *
 * 导入策略：upsert（已有则跳过，不覆盖）。
 * 如需合并覆盖，先导出备份再清空重导。
 *
 * Body: { nodes: [...], edges: [...], aspects: [...] }
 */
export async function POST(request: NextRequest) {
  ensureDb()
  const db = getDb()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const importNodes = Array.isArray(body.nodes) ? body.nodes : []
  const importEdges = Array.isArray(body.edges) ? body.edges : []
  const importAspects = Array.isArray(body.aspects) ? body.aspects : []

  const stats = { nodes: 0, edges: 0, aspects: 0, skipped: 0, errors: 0 }

  // 导入前先做一次备份
  try {
    const backupResponse = await fetch(new URL('/api/data/backup', request.url), { method: 'POST' })
    if (!backupResponse.ok) {
      console.warn('[import] Pre-import backup failed, proceeding anyway')
    }
  } catch {
    console.warn('[import] Pre-import backup request failed')
  }

  // ── 导入 Nodes ──
  for (const node of importNodes) {
    if (!node.id || !node.title || !node.slug) {
      stats.errors++
      continue
    }
    try {
      db.insert(nodes)
        .values({
          id: node.id,
          title: node.title,
          slug: node.slug,
          summary: node.summary ?? null,
          domain: node.domain ?? null,
          is_seed: node.is_seed ?? false,
          status: node.status ?? 'active',
          node_type: node.node_type ?? 'concept',
          channel: node.channel ?? 'light',
          internalization_status: node.internalization_status ?? 'draft',
          my_thoughts: node.my_thoughts ?? null,
          created_at: node.created_at ?? new Date().toISOString(),
          updated_at: node.updated_at ?? new Date().toISOString(),
          created_by: node.created_by ?? 'user',
        })
        .onConflictDoNothing()
        .run()
      stats.nodes++
    } catch {
      stats.skipped++
    }
  }

  // ── 导入 Edges ──
  for (const edge of importEdges) {
    if (!edge.id || !edge.source_node_id || !edge.target_node_id) {
      stats.errors++
      continue
    }
    try {
      db.insert(edges)
        .values({
          id: edge.id,
          source_node_id: edge.source_node_id,
          target_node_id: edge.target_node_id,
          relation_type: edge.relation_type ?? 'relates_to',
          description: edge.description ?? null,
          weight: edge.weight ?? 0.5,
          origin: edge.origin ?? 'manual',
          created_at: edge.created_at ?? new Date().toISOString(),
          created_by: edge.created_by ?? 'user',
        })
        .onConflictDoNothing()
        .run()
      stats.edges++
    } catch {
      stats.skipped++
    }
  }

  // ── 导入 Aspects ──
  for (const aspect of importAspects) {
    if (!aspect.id || !aspect.node_id || !aspect.title) {
      stats.errors++
      continue
    }
    try {
      db.insert(aspects)
        .values({
          id: aspect.id,
          node_id: aspect.node_id,
          template_key: aspect.template_key ?? aspect.title.toLowerCase().replace(/\s+/g, '-'),
          title: aspect.title,
          content: aspect.content ?? '',
          source_type: aspect.source_type ?? 'manual',
          source_id: aspect.source_id ?? null,
          order: aspect.order ?? 0,
          created_at: aspect.created_at ?? new Date().toISOString(),
          updated_at: aspect.updated_at ?? new Date().toISOString(),
          created_by: aspect.created_by ?? 'user',
        })
        .onConflictDoNothing()
        .run()
      stats.aspects++
    } catch {
      stats.skipped++
    }
  }

  db.insert(operationLogs)
    .values({
      id: generateId('ol'),
      operation: 'import_data',
      affected_ids: JSON.stringify([]),
      payload_snapshot: null,
      user_note: `导入数据：${stats.nodes} 节点、${stats.edges} 边、${stats.aspects} 切面（${stats.skipped} 跳过、${stats.errors} 错误）`,
      created_at: nowIso(),
    })
    .run()

  return NextResponse.json({
    data: {
      imported: stats,
      message: `导入完成：${stats.nodes} 节点、${stats.edges} 边、${stats.aspects} 切面（${stats.skipped} 跳过、${stats.errors} 错误）`,
    },
  })
}
