'use client'

import { useState, useMemo } from 'react'
import { Network, GitBranch, Layers, ChevronDown } from 'lucide-react'

/* ═══ palette — 与 graph-canvas.tsx 的 COMMUNITY_COLORS 保持一致 ═══ */
const COMMUNITY_COLORS_HEX = [
  '#5DB8A6', // 0 产品设计 — 青绿
  '#E8845A', // 1 运营体系 — 珊瑚橙
  '#7B6FE0', // 2 用户与社群 — 薰衣草紫
  '#E8B94A', // 3 数据与增长 — 赭黄
  '#5A9FE8', // 4 市场与商业 — 天蓝
  '#E85A8A', // 5 平台与组织 — 玫瑰粉
  '#6BBF6B', // 6 鼠尾草绿
  '#BF8A5A', // 7 沙棕
  '#8A5ABF', // 8 深紫
  '#5ABFBF', // 9 青碧
  '#D4645A', // 10 砖红
  '#A0C45A', // 11 柠檬绿
  '#5A7ABF', // 12 钴蓝
  '#BF5AAA', // 13 洋紫
  '#E89A5A', // 14 杏橙
  '#5ABFA0', // 15 薄荷绿
]

/** 固定二级领域颜色索引（与 graph-canvas.tsx 保持一致） */
const FIXED_DOMAIN_INDEX: Record<string, number> = {
  '互联网/产品设计': 0,
  '互联网/运营体系': 1,
  '互联网/用户与社群': 2,
  '互联网/数据与增长': 3,
  '互联网/市场与商业': 4,
  '互联网/平台与组织': 5,
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function getDomainColor(level2Key: string, dynamicMap: Map<string, number>, nextId: { value: number }) {
  let index: number
  if (level2Key in FIXED_DOMAIN_INDEX) {
    index = FIXED_DOMAIN_INDEX[level2Key]
  } else if (dynamicMap.has(level2Key)) {
    index = dynamicMap.get(level2Key)!
  } else {
    index = nextId.value++
    dynamicMap.set(level2Key, index)
  }
  const bar = COMMUNITY_COLORS_HEX[index % COMMUNITY_COLORS_HEX.length]
  return { bar, bg: hexToRgba(bar, 0.08), accent: hexToRgba(bar, 0.15) }
}

interface DomainNode {
  id: string
  title: string
  domain?: string | null
  node_type?: string | null
}

interface Props {
  nodeCount: number
  edgeCount: number
  domainStats: Array<[string, number]>
  nodes?: DomainNode[]
}

const NODE_TYPE_EMOJI: Record<string, string> = {
  concept: '💡',
  claim: '💬',
  case: '📦',
  resource: '📚',
}

/** 解析 domain 的一级类目 */
function getLevel1(domain: string): string {
  const idx = domain.indexOf('/')
  return idx > 0 ? domain.slice(0, idx).trim() : domain.trim()
}

interface Level1Group {
  label: string
  count: number
  subDomains: Array<{ label: string; fullPath: string; count: number }>
  nodes: DomainNode[]
}

export function GraphOverview({ nodeCount, edgeCount, domainStats, nodes = [] }: Props) {
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null)
  const totalNodes = domainStats.reduce((sum, [, count]) => sum + count, 0)

  /** 按一级领域分组，同时计算每组的固定颜色 */
  const { level1Groups, groupColors } = useMemo(() => {
    const groupMap = new Map<string, Level1Group>()

    for (const [domain, count] of domainStats) {
      const level1 = getLevel1(domain)
      if (!groupMap.has(level1)) {
        groupMap.set(level1, { label: level1, count: 0, subDomains: [], nodes: [] })
      }
      const group = groupMap.get(level1)!
      group.count += count
      if (domain !== level1) {
        const subLabel = domain.slice(level1.length + 1)
        group.subDomains.push({ label: subLabel, fullPath: domain, count })
      }
    }

    for (const node of nodes) {
      const domain = node.domain || '未分类'
      const level1 = getLevel1(domain)
      const group = groupMap.get(level1)
      if (group) group.nodes.push(node)
    }

    const sorted = Array.from(groupMap.values()).sort((a, b) => b.count - a.count)

    // 为每个一级领域计算固定颜色（基于其下节点的二级领域，取第一个命中的）
    const dynamicMap = new Map<string, number>()
    const nextId = { value: Object.keys(FIXED_DOMAIN_INDEX).length }
    const colors = new Map<string, ReturnType<typeof getDomainColor>>()

    for (const group of sorted) {
      // 找该一级领域下第一个有二级路径的 domain，用于确定颜色
      const firstSubDomain = group.subDomains[0]
      const level2Key = firstSubDomain
        ? `${group.label}/${firstSubDomain.label.split('/')[0]}`
        : group.label
      colors.set(group.label, getDomainColor(level2Key, dynamicMap, nextId))
    }

    return { level1Groups: sorted, groupColors: colors }
  }, [domainStats, nodes])

  return (
    <div className="h-full flex flex-col px-5 pt-5 overflow-y-auto">
      {/* Header */}
      <h2 className="text-title-lg mb-1" style={{ color: 'var(--clay-ink)' }}>
        知识图谱概览
      </h2>
      <p className="text-body-sm mb-5" style={{ color: 'var(--clay-muted)' }}>
        点击左侧图谱中的节点查看详情
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ background: 'var(--clay-surface-soft)', borderRadius: 'var(--radius-md)' }}
        >
          <Network className="h-5 w-5 shrink-0" style={{ color: 'var(--clay-coral)' }} />
          <div>
            <p className="text-display-sm" style={{ color: 'var(--clay-ink)' }}>{nodeCount}</p>
            <p className="text-body-sm" style={{ color: 'var(--clay-muted)' }}>节点</p>
          </div>
        </div>
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ background: 'var(--clay-surface-soft)', borderRadius: 'var(--radius-md)' }}
        >
          <GitBranch className="h-5 w-5 shrink-0" style={{ color: 'var(--clay-lavender)' }} />
          <div>
            <p className="text-display-sm" style={{ color: 'var(--clay-ink)' }}>{edgeCount}</p>
            <p className="text-body-sm" style={{ color: 'var(--clay-muted)' }}>关联</p>
          </div>
        </div>
      </div>

      {/* Domain distribution */}
      {domainStats.length > 0 && (
        <div className="space-y-4 pb-6">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4" style={{ color: 'var(--clay-muted)' }} />
            <h3 className="text-title-sm" style={{ color: 'var(--clay-ink)' }}>领域分布</h3>
            <span className="text-caption ml-auto" style={{ color: 'var(--clay-muted-soft)' }}>
              {domainStats.length} 个领域
            </span>
          </div>

          {/* stacked bar overview — 按一级领域 */}
          <div className="flex gap-0.5 h-3 rounded-full overflow-hidden" style={{ background: 'var(--clay-surface-soft)' }}>
            {level1Groups.map((group, index) => {
              const color = groupColors.get(group.label) ?? { bar: '#999', bg: 'rgba(153,153,153,0.08)', accent: 'rgba(153,153,153,0.15)' }
              const percent = totalNodes > 0 ? (group.count / totalNodes) * 100 : 0
              return (
                <div
                  key={group.label}
                  className="h-full transition-all duration-500 cursor-pointer hover:opacity-80"
                  style={{
                    width: `${Math.max(percent, 2)}%`,
                    background: color.bar,
                    borderRadius: index === 0 ? 'var(--radius-pill) 0 0 var(--radius-pill)' : index === level1Groups.length - 1 ? '0 var(--radius-pill) var(--radius-pill) 0' : '0',
                  }}
                  title={`${group.label}: ${group.count} 个节点 (${percent.toFixed(0)}%)`}
                  onClick={() => setExpandedDomain(expandedDomain === group.label ? null : group.label)}
                />
              )
            })}
          </div>

          {/* domain cards — 一级分组，展开显示二级/三级 + 节点列表 */}
          <div className="space-y-2">
            {level1Groups.map((group) => {
              const color = groupColors.get(group.label) ?? { bar: '#999', bg: 'rgba(153,153,153,0.08)', accent: 'rgba(153,153,153,0.15)' }
              const percent = totalNodes > 0 ? (group.count / totalNodes) * 100 : 0
              const isExpanded = expandedDomain === group.label
              const hasSubDomains = group.subDomains.length > 0

              return (
                <div key={group.label}>
                  <button
                    type="button"
                    onClick={() => setExpandedDomain(isExpanded ? null : group.label)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 transition-all group"
                    style={{
                      borderRadius: isExpanded ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
                      background: isExpanded ? color.accent : 'transparent',
                      border: `1px solid ${isExpanded ? color.bar + '30' : 'var(--clay-hairline-soft)'}`,
                      borderBottom: isExpanded ? 'none' : undefined,
                    }}
                    onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = color.bg }}
                    onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: color.bar }} />
                    <span className="flex-1 text-left text-body-sm font-medium truncate" style={{ color: 'var(--clay-ink)' }}>
                      {group.label}
                    </span>
                    <span className="shrink-0 text-caption tabular-nums text-right min-w-[60px]" style={{ color: 'var(--clay-muted)' }}>
                      {group.count} · {percent.toFixed(0)}%
                    </span>
                    <ChevronDown
                      className="shrink-0 h-3.5 w-3.5 transition-transform duration-200"
                      style={{ color: 'var(--clay-muted)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    />
                  </button>

                  {/* expanded content: sub-domains + node list */}
                  <div
                    className="overflow-hidden transition-all duration-200 ease-out"
                    style={{
                      maxHeight: isExpanded ? '400px' : '0px',
                      opacity: isExpanded ? 1 : 0,
                      background: color.bg,
                      borderLeft: `1px solid ${color.bar}30`,
                      borderRight: `1px solid ${color.bar}30`,
                      borderBottom: isExpanded ? `1px solid ${color.bar}30` : 'none',
                      borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                    }}
                  >
                    <div className="px-3 py-2 max-h-[380px] overflow-y-auto space-y-2">
                      {/* sub-domain breakdown */}
                      {hasSubDomains && (
                        <div className="flex flex-wrap gap-1.5">
                          {group.subDomains.map((sub) => (
                            <span
                              key={sub.fullPath}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-pill)] text-[10px]"
                              style={{ background: color.accent, color: 'var(--clay-body)', border: `1px solid ${color.bar}25` }}
                            >
                              {sub.label}
                              <span style={{ color: 'var(--clay-muted-soft)' }}>{sub.count}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* node list */}
                      <div className="space-y-0.5">
                        {group.nodes.map((node) => (
                          <div
                            key={node.id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] text-caption transition-colors"
                            style={{ color: 'var(--clay-body)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = color.accent)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <span className="shrink-0 text-[11px]">
                              {NODE_TYPE_EMOJI[node.node_type ?? ''] ?? '📄'}
                            </span>
                            <span className="truncate">{node.title}</span>
                            {/* 显示二级/三级子路径 */}
                            {node.domain && node.domain.includes('/') && (
                              <span className="shrink-0 text-[9px] ml-auto" style={{ color: 'var(--clay-muted-soft)' }}>
                                {node.domain.slice(node.domain.indexOf('/') + 1)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {nodeCount === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <p className="text-body-md" style={{ color: 'var(--clay-muted)' }}>还没有任何节点</p>
          <p className="text-body-sm" style={{ color: 'var(--clay-muted-soft)' }}>点击右下角 + 投喂第一条知识</p>
        </div>
      )}
    </div>
  )
}
