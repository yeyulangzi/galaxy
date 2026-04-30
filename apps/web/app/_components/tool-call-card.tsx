
'use client'

import { useState } from 'react'
import {
  Search,
  Link2,
  BarChart3,
  PenLine,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'

interface ToolCallCardProps {
  name: string
  arguments: Record<string, unknown>
  result?: Record<string, unknown>
  isWrite: boolean
  suggestionId?: string
  loading?: boolean
}

const TOOL_ICON_MAP: Record<string, LucideIcon> = {
  search_nodes: Search,
  get_node_detail: Search,
  list_node_edges: Link2,
  create_edge: Link2,
  update_edge: Link2,
  delete_edge: Link2,
  get_graph_stats: BarChart3,
  create_node: PenLine,
  update_node: PenLine,
  create_aspect: PenLine,
  update_aspect: PenLine,
  batch_update_nodes: PenLine,
  delete_node: Trash2,
  delete_aspect: Trash2,
}

const TOOL_LABEL_MAP: Record<string, string> = {
  search_nodes: '搜索节点',
  get_node_detail: '获取节点详情',
  list_node_edges: '获取关联边',
  get_graph_stats: '图谱统计',
  create_node: '创建节点',
  update_node: '修改节点',
  delete_node: '删除节点',
  create_edge: '创建关联',
  update_edge: '修改关联',
  delete_edge: '删除关联',
  create_aspect: '创建维度卡',
  update_aspect: '修改维度卡',
  delete_aspect: '删除维度卡',
  batch_update_nodes: '批量修改节点',
}

function getToolIcon(name: string, loading?: boolean): LucideIcon {
  if (loading) return Loader2
  return TOOL_ICON_MAP[name] ?? Search
}

function getToolLabel(name: string): string {
  return TOOL_LABEL_MAP[name] ?? name
}

function getArgumentsSummary(
  name: string,
  args: Record<string, unknown>
): string {
  switch (name) {
    case 'search_nodes':
      return (args.keyword ?? args.query) ? `"${String(args.keyword ?? args.query)}"` : ''
    case 'get_node_detail':
    case 'list_node_edges':
      return args.node_id ? `#${String(args.node_id)}` : ''
    case 'create_node':
      return args.title ? `"${String(args.title)}"` : ''
    case 'create_edge':
      if (args.source && args.target) {
        return `${String(args.source)} → ${String(args.target)}`
      }
      return ''
    default: {
      const idKey = Object.keys(args).find(
        (key) => key === 'id' || key.endsWith('_id')
      )
      return idKey ? `#${String(args[idKey])}` : ''
    }
  }
}

function getResultSummary(
  name: string,
  result: Record<string, unknown>,
  suggestionId?: string
): string {
  if (result.error) {
    return `❌ ${String(result.error)}`
  }

  switch (name) {
    case 'search_nodes': {
      const nodes = Array.isArray(result.nodes) ? result.nodes : []
      return `找到 ${nodes.length} 个节点`
    }
    case 'get_graph_stats': {
      const nodeCount = result.node_count ?? result.nodes ?? 0
      const edgeCount = result.edge_count ?? result.edges ?? 0
      return `${nodeCount} 节点, ${edgeCount} 边`
    }
    default: {
      if (suggestionId) {
        return '✓ 已提交待审'
      }
      return '完成'
    }
  }
}

export function ToolCallCard({
  name,
  arguments: toolArguments,
  result,
  isWrite,
  suggestionId,
  loading,
}: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)

  const Icon = getToolIcon(name, loading)
  const label = getToolLabel(name)
  const argumentsSummary = getArgumentsSummary(name, toolArguments)
  const resultSummary = result
    ? getResultSummary(name, result, suggestionId)
    : null

  return (
    <div
      style={{
        background: isWrite
          ? 'var(--clay-surface-soft)'
          : 'var(--clay-canvas)',
        border: '1px solid var(--clay-border)',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Icon
          size={16}
          style={{
            color: isWrite ? 'var(--clay-coral)' : 'var(--clay-primary)',
            flexShrink: 0,
          }}
          className={loading ? 'animate-spin' : undefined}
        />
        <span style={{ fontWeight: 500 }}>{label}</span>
        {argumentsSummary && (
          <span style={{ color: 'var(--clay-text-secondary)', fontSize: 12 }}>
            {argumentsSummary}
          </span>
        )}
      </div>

      {loading && !result && (
        <div
          style={{
            marginTop: 4,
            color: 'var(--clay-text-secondary)',
            fontSize: 12,
          }}
        >
          执行中…
        </div>
      )}

      {resultSummary && (
        <div style={{ marginTop: 4 }}>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--clay-text-secondary)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {expanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            {resultSummary}
          </button>

          {expanded && result && (
            <pre
              style={{
                marginTop: 6,
                padding: 8,
                background: 'var(--clay-canvas)',
                border: '1px solid var(--clay-border)',
                borderRadius: 6,
                fontSize: 11,
                lineHeight: 1.4,
                maxHeight: 200,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
