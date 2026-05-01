'use client'

import { useMemo, useState } from 'react'
import { Filter, X, RotateCcw, ChevronDown } from 'lucide-react'
import type { Node as DomainNode } from '@galaxy/shared'
import { INTERNALIZATION_STATUSES } from '@galaxy/shared'
import { useGraphViewStore } from '@/lib/store/graph-view-store'
import coreDomains from '@/config/core-domains.json'

// re-export 纯函数，保持向后兼容（page.tsx 等已改为从 @/lib/graph/filter 直接导入）
export { applyGraphFilter } from '@/lib/graph/filter'

interface GraphFilterPanelProps {
  nodes: DomainNode[]
}

const CREATOR_LABELS: Record<string, string> = {
  user: '用户创建',
  ai_feed: 'AI 投喂',
  ai_proactive: 'AI 主动',
  ai_deepdive: 'AI 深度对话',
}

const NODE_TYPE_LABELS: Record<string, string> = {
  concept: '概念',
  claim: '主张',
  case: '案例',
  resource: '资源',
}

const CHANNEL_LABELS: Record<string, string> = {
  core: '核心',
  light: '轻量',
}

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  linked: '已关联',
  dialogued: '已对话',
  mastered: '已掌握',
}

/* ═══ collapsible section ═══ */
function FilterSection({
  title,
  badge,
  onClear,
  defaultOpen = false,
  children,
}: {
  title: string
  badge?: number
  onClear?: () => void
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="space-y-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full py-1.5 text-left group"
      >
        <div className="flex items-center gap-1.5">
          <ChevronDown
            className="h-3 w-3 transition-transform duration-200"
            style={{
              color: 'var(--clay-muted)',
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
          />
          <h4
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--clay-muted)' }}
          >
            {title}
          </h4>
          {badge != null && badge > 0 && (
            <span
              className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-semibold"
              style={{ background: 'var(--clay-primary)', color: '#fff' }}
            >
              {badge}
            </span>
          )}
        </div>
        {onClear && badge != null && badge > 0 && (
          <span
            onClick={(e) => { e.stopPropagation(); onClear() }}
            className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            style={{ color: 'var(--clay-primary)' }}
          >
            清空
          </span>
        )}
      </button>
      <div
        className="overflow-hidden transition-all duration-200 ease-out"
        style={{ maxHeight: open ? '500px' : '0px', opacity: open ? 1 : 0 }}
      >
        <div className="pt-1.5 pb-1">{children}</div>
      </div>
    </section>
  )
}

/** 内化进度的顺序索引，用于判断"是否达到目标" */
const STATUS_ORDER: Record<string, number> = {
  draft: 0,
  linked: 1,
  dialogued: 2,
  mastered: 3,
}

/** 从 core-domains.json 读取各通道的目标内化进度 */
const CHANNEL_TARGET = coreDomains.channelTargetStatus as Record<string, string>

export function GraphFilterPanel({ nodes }: GraphFilterPanelProps) {
  const [open, setOpen] = useState(false)
  const [expandedDomainPaths, setExpandedDomainPaths] = useState<Set<string>>(new Set())
  const { filter, updateFilter } = useGraphViewStore()

  const allDomains = useMemo(() => {
    const set = new Set<string>()
    for (const n of nodes) {
      if (n.domain) set.add(n.domain)
    }
    return Array.from(set).sort()
  }, [nodes])

  /** 将扁平的 domain 列表构建为层级树，用于多级筛选 */
  const domainTree = useMemo(() => {
    type DomainTreeNode = { label: string; fullPath: string; children: Map<string, DomainTreeNode>; count: number }
    const root = new Map<string, DomainTreeNode>()

    for (const d of allDomains) {
      const parts = d.split('/').map((s) => s.trim()).filter(Boolean)
      let currentLevel = root
      let pathSoFar = ''
      for (let i = 0; i < parts.length; i++) {
        pathSoFar = pathSoFar ? `${pathSoFar}/${parts[i]}` : parts[i]
        if (!currentLevel.has(parts[i])) {
          currentLevel.set(parts[i], { label: parts[i], fullPath: pathSoFar, children: new Map(), count: 0 })
        }
        const node = currentLevel.get(parts[i])!
        if (i === parts.length - 1) node.count++
        currentLevel = node.children
      }
    }
    return root
  }, [allDomains])

  const allCreators = useMemo(() => {
    const set = new Set<string>()
    for (const n of nodes) {
      if (n.created_by) set.add(n.created_by)
    }
    return Array.from(set).sort()
  }, [nodes])

  const allNodeTypes = useMemo(() => {
    const set = new Set<string>()
    for (const n of nodes) {
      if (n.node_type) set.add(n.node_type)
    }
    return Array.from(set).sort()
  }, [nodes])

  const allChannels = useMemo(() => {
    const set = new Set<string>()
    for (const n of nodes) {
      if (n.channel) set.add(n.channel)
    }
    return Array.from(set).sort()
  }, [nodes])

  const allStatuses = useMemo(() => {
    const set = new Set<string>()
    for (const n of nodes) {
      if (n.internalization_status) set.add(n.internalization_status)
    }
    return Array.from(set).sort()
  }, [nodes])

  const activeCount =
    filter.domains.length +
    filter.hiddenCreators.length +
    (filter.nodeTypes?.length ?? 0) +
    (filter.channels?.length ?? 0) +
    (filter.statuses?.length ?? 0) +
    (filter.minConfidence > 0 ? 1 : 0) +
    (filter.hideIsolated ? 1 : 0)

  const toggleDomain = (d: string) => {
    const next = filter.domains.includes(d)
      ? filter.domains.filter((x) => x !== d)
      : [...filter.domains, d]
    updateFilter({ domains: next })
  }

  const toggleCreator = (c: string) => {
    const next = filter.hiddenCreators.includes(c)
      ? filter.hiddenCreators.filter((x) => x !== c)
      : [...filter.hiddenCreators, c]
    updateFilter({ hiddenCreators: next })
  }

  const toggleNodeType = (t: string) => {
    const current = filter.nodeTypes ?? []
    const next = current.includes(t)
      ? current.filter((x) => x !== t)
      : [...current, t]
    updateFilter({ nodeTypes: next })
  }

  const toggleChannel = (c: string) => {
    const current = filter.channels ?? []
    const next = current.includes(c)
      ? current.filter((x) => x !== c)
      : [...current, c]
    updateFilter({ channels: next })
  }

  const toggleStatus = (s: string) => {
    const current = filter.statuses ?? []
    const next = current.includes(s)
      ? current.filter((x) => x !== s)
      : [...current, s]
    updateFilter({ statuses: next })
  }

  const reset = () =>
    updateFilter({
      domains: [],
      minConfidence: 0,
      hideIsolated: false,
      hiddenCreators: [],
      nodeTypes: [],
      channels: [],
      statuses: [],
    })

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute top-16 left-4 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)] text-caption font-medium transition-all hover:scale-105"
        style={{
          background: 'var(--clay-surface-card)',
          color: 'var(--clay-body)',
          border: '1px solid var(--clay-hairline)',
        }}
        title="过滤器"
      >
        <Filter className="h-3.5 w-3.5" />
        <span>过滤</span>
        {activeCount > 0 && (
          <span
            className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-semibold"
            style={{ background: 'var(--clay-primary)', color: '#fff' }}
          >
            {activeCount}
          </span>
        )}
      </button>
    )
  }

  return (
    <div
      className="absolute top-16 left-4 z-20 w-[260px] rounded-[var(--radius-lg)] shadow-lg overflow-hidden"
      style={{
        background: 'var(--clay-surface-card)',
        border: '1px solid var(--clay-hairline)',
        maxHeight: 'calc(100vh - 160px)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--clay-hairline)' }}
      >
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4" style={{ color: 'var(--clay-primary)' }} />
          <span className="text-title-sm font-medium" style={{ color: 'var(--clay-ink)' }}>
            过滤器
          </span>
          {activeCount > 0 && (
            <span
              className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold"
              style={{ background: 'var(--clay-primary)', color: '#fff' }}
            >
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={reset}
            className="p-1.5 rounded hover:bg-[var(--clay-hairline)] transition-colors"
            title="清空所有过滤"
          >
            <RotateCcw className="h-3.5 w-3.5" style={{ color: 'var(--clay-muted)' }} />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded hover:bg-[var(--clay-hairline)] transition-colors"
          >
            <X className="h-3.5 w-3.5" style={{ color: 'var(--clay-muted)' }} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        className="px-4 py-2 space-y-1 overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 240px)' }}
      >
        {/* 领域（多级折叠） */}
        {allDomains.length > 0 && (
          <FilterSection title="领域" badge={filter.domains.length} onClear={() => updateFilter({ domains: [] })} defaultOpen>
            <div className="space-y-0.5">
              {Array.from(domainTree.entries()).map(([level1Key, level1Node]) => {
                const hasChildren = level1Node.children.size > 0
                const isExpanded = expandedDomainPaths.has(level1Key)
                // 一级节点：如果它本身就是完整 domain（没有子级），也作为可点选项
                const level1IsLeaf = !hasChildren && level1Node.count > 0
                const level1Active = level1IsLeaf && filter.domains.includes(level1Node.fullPath)

                return (
                  <div key={level1Key}>
                    <div className="flex items-center gap-1">
                      {hasChildren ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setExpandedDomainPaths((prev) => {
                              const next = new Set(prev)
                              next.has(level1Key) ? next.delete(level1Key) : next.add(level1Key)
                              return next
                            })}
                            className="shrink-0 p-1 rounded transition-colors hover:opacity-80"
                          >
                            <ChevronDown
                              className="h-3 w-3 transition-transform"
                              style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', color: 'var(--clay-muted)' }}
                            />
                          </button>
                          <button
                            onClick={() => toggleDomain(level1Node.fullPath)}
                            className="flex-1 flex items-center justify-between px-1.5 py-1 rounded-[var(--radius-pill)] text-[11px] font-medium transition-colors"
                            style={{
                              background: filter.domains.includes(level1Node.fullPath) ? 'var(--clay-primary)' : 'transparent',
                              color: filter.domains.includes(level1Node.fullPath) ? '#fff' : 'var(--clay-body)',
                            }}
                          >
                            {level1Key}
                            <span className="text-[10px] ml-1" style={{ color: filter.domains.includes(level1Node.fullPath) ? 'rgba(255,255,255,0.7)' : 'var(--clay-muted-soft)' }}>
                              {level1Node.children.size}
                            </span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => toggleDomain(level1Node.fullPath)}
                          className="px-2 py-1 rounded-[var(--radius-pill)] text-[11px] transition-colors"
                          style={{
                            background: level1Active ? 'var(--clay-primary)' : 'var(--clay-canvas)',
                            color: level1Active ? '#fff' : 'var(--clay-body)',
                            border: '1px solid var(--clay-hairline)',
                          }}
                        >
                          {level1Key}
                        </button>
                      )}
                    </div>

                    {/* 二级 */}
                    {hasChildren && isExpanded && (
                      <div className="ml-4 mt-0.5 space-y-0.5">
                        {Array.from(level1Node.children.entries()).map(([level2Key, level2Node]) => {
                          const hasLevel3 = level2Node.children.size > 0
                          const level2Expanded = expandedDomainPaths.has(level2Node.fullPath)
                          const level2IsLeaf = !hasLevel3 && level2Node.count > 0
                          const level2Active = level2IsLeaf && filter.domains.includes(level2Node.fullPath)

                          return (
                            <div key={level2Key}>
                              <div className="flex items-center gap-1">
                                {hasLevel3 ? (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedDomainPaths((prev) => {
                                      const next = new Set(prev)
                                      next.has(level2Node.fullPath) ? next.delete(level2Node.fullPath) : next.add(level2Node.fullPath)
                                      return next
                                    })}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] w-full text-left transition-colors hover:opacity-80"
                                    style={{ color: 'var(--clay-body)' }}
                                  >
                                    <ChevronDown
                                      className="h-2.5 w-2.5 shrink-0 transition-transform"
                                      style={{ transform: level2Expanded ? 'rotate(0deg)' : 'rotate(-90deg)', color: 'var(--clay-muted)' }}
                                    />
                                    {level2Key}
                                    <span className="text-[10px] ml-auto" style={{ color: 'var(--clay-muted-soft)' }}>
                                      {level2Node.children.size}
                                    </span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => toggleDomain(level2Node.fullPath)}
                                    className="px-2 py-0.5 rounded-[var(--radius-pill)] text-[11px] transition-colors"
                                    style={{
                                      background: level2Active ? 'var(--clay-primary)' : 'var(--clay-canvas)',
                                      color: level2Active ? '#fff' : 'var(--clay-body)',
                                      border: '1px solid var(--clay-hairline)',
                                    }}
                                  >
                                    {level2Key}
                                  </button>
                                )}
                              </div>

                              {/* 三级 */}
                              {hasLevel3 && level2Expanded && (
                                <div className="ml-4 mt-0.5 flex flex-wrap gap-1">
                                  {Array.from(level2Node.children.entries()).map(([level3Key, level3Node]) => {
                                    const level3Active = filter.domains.includes(level3Node.fullPath)
                                    return (
                                      <button
                                        key={level3Key}
                                        onClick={() => toggleDomain(level3Node.fullPath)}
                                        className="px-2 py-0.5 rounded-[var(--radius-pill)] text-[10px] transition-colors"
                                        style={{
                                          background: level3Active ? 'var(--clay-primary)' : 'var(--clay-canvas)',
                                          color: level3Active ? '#fff' : 'var(--clay-body)',
                                          border: '1px solid var(--clay-hairline)',
                                        }}
                                      >
                                        {level3Key}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--clay-muted)' }}>
              不选 = 全部显示；选中 = 仅显示选中
            </p>
          </FilterSection>
        )}

        {/* 来源 */}
        {allCreators.length > 0 && (
          <FilterSection title="隐藏来源" badge={filter.hiddenCreators.length} onClear={() => updateFilter({ hiddenCreators: [] })}>
            <div className="space-y-1.5">
              {allCreators.map((c) => {
                const hidden = filter.hiddenCreators.includes(c)
                return (
                  <label
                    key={c}
                    className="flex items-center gap-2 cursor-pointer text-caption"
                    style={{ color: 'var(--clay-body)' }}
                  >
                    <input
                      type="checkbox"
                      checked={hidden}
                      onChange={() => toggleCreator(c)}
                      className="accent-[var(--clay-primary)]"
                    />
                    <span>{CREATOR_LABELS[c] ?? c}</span>
                  </label>
                )
              })}
            </div>
          </FilterSection>
        )}

        {/* 节点类型 */}
        {allNodeTypes.length > 1 && (
          <FilterSection title="节点类型" badge={(filter.nodeTypes ?? []).length} onClear={() => updateFilter({ nodeTypes: [] })}>
            <div className="flex flex-wrap gap-1.5">
              {allNodeTypes.map((t) => {
                const active = (filter.nodeTypes ?? []).includes(t)
                return (
                  <button
                    key={t}
                    onClick={() => toggleNodeType(t)}
                    className="px-2 py-1 rounded-[var(--radius-pill)] text-[11px] transition-colors"
                    style={{
                      background: active ? 'var(--clay-primary)' : 'var(--clay-canvas)',
                      color: active ? '#fff' : 'var(--clay-body)',
                      border: '1px solid var(--clay-hairline)',
                    }}
                  >
                    {NODE_TYPE_LABELS[t] ?? t}
                  </button>
                )
              })}
            </div>
          </FilterSection>
        )}

        {/* 知识通道 */}
        {allChannels.length > 0 && (
          <FilterSection title="知识通道" badge={(filter.channels ?? []).length} onClear={() => updateFilter({ channels: [] })}>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {allChannels.map((c) => {
                const active = (filter.channels ?? []).includes(c)
                return (
                  <button
                    key={c}
                    onClick={() => toggleChannel(c)}
                    className="px-2 py-1 rounded-[var(--radius-pill)] text-[11px] transition-colors"
                    style={{
                      background: active ? 'var(--clay-primary)' : 'var(--clay-canvas)',
                      color: active ? '#fff' : 'var(--clay-body)',
                      border: '1px solid var(--clay-hairline)',
                    }}
                  >
                    {CHANNEL_LABELS[c] ?? c}
                  </button>
                )
              })}
            </div>

            {/* 内化完成率统计 */}
            <div className="space-y-2">
              {(['core', 'light'] as const).map((ch) => {
                const channelNodes = nodes.filter((n) => n.channel === ch)
                if (channelNodes.length === 0) return null
                const targetStatus = CHANNEL_TARGET[ch] ?? 'linked'
                const targetOrder = STATUS_ORDER[targetStatus] ?? 1
                const reachedCount = channelNodes.filter(
                  (n) => STATUS_ORDER[n.internalization_status ?? 'draft'] >= targetOrder
                ).length
                const pct = Math.round((reachedCount / channelNodes.length) * 100)
                const icon = ch === 'core' ? '🔥' : '🌿'
                const label = ch === 'core' ? '核心' : '泛读'
                const targetLabel = INTERNALIZATION_STATUSES.indexOf(targetStatus as typeof INTERNALIZATION_STATUSES[number]) >= 0
                  ? ({ draft: '草稿', linked: '已关联', dialogued: '已对话', mastered: '已掌握' }[targetStatus] ?? targetStatus)
                  : targetStatus
                const barColor = ch === 'core' ? 'var(--clay-coral)' : 'var(--clay-primary)'

                return (
                  <div key={ch} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span style={{ color: 'var(--clay-body)' }}>
                        {icon} {label}
                        <span className="ml-1" style={{ color: 'var(--clay-muted)' }}>
                          目标：{targetLabel}
                        </span>
                      </span>
                      <span className="font-medium tabular-nums" style={{ color: 'var(--clay-ink)' }}>
                        {reachedCount}/{channelNodes.length}
                        <span className="ml-1" style={{ color: 'var(--clay-muted)' }}>{pct}%</span>
                      </span>
                    </div>
                    <div
                      className="h-1.5 rounded-full overflow-hidden"
                      style={{ background: 'var(--clay-hairline-soft)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: barColor }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </FilterSection>
        )}

        {/* 内化进度 */}
        <FilterSection title="内化进度" badge={(filter.statuses ?? []).length} onClear={() => updateFilter({ statuses: [] })}>
          <div className="flex flex-wrap gap-1.5">
            {(['draft', 'linked', 'dialogued', 'mastered'] as const).map((s) => {
              const active = (filter.statuses ?? []).includes(s)
              return (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className="px-2 py-1 rounded-[var(--radius-pill)] text-[11px] transition-colors"
                  style={{
                    background: active ? 'var(--clay-primary)' : 'var(--clay-canvas)',
                    color: active ? '#fff' : 'var(--clay-body)',
                    border: '1px solid var(--clay-hairline)',
                  }}
                >
                  {STATUS_LABELS[s] ?? s}
                </button>
              )
            })}
          </div>
        </FilterSection>

        {/* 连线强度 */}
        <FilterSection
          title="连线强度"
          badge={
            (filter.weightRange?.[0] ?? 0) > 0 || (filter.weightRange?.[1] ?? 1) < 1 ? 1 : 0
          }
          onClear={() => updateFilter({ weightRange: [0, 1] })}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--clay-muted)' }}>
              <span>最低: {(filter.weightRange?.[0] ?? 0).toFixed(2)}</span>
              <span>最高: {(filter.weightRange?.[1] ?? 1).toFixed(2)}</span>
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-caption" style={{ color: 'var(--clay-body)' }}>
                <span className="w-6 text-[10px]">下限</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={filter.weightRange?.[0] ?? 0}
                  onChange={(e) => {
                    const minVal = parseFloat(e.target.value)
                    const maxVal = filter.weightRange?.[1] ?? 1
                    updateFilter({ weightRange: [Math.min(minVal, maxVal), maxVal] })
                  }}
                  className="flex-1 accent-[var(--clay-primary)]"
                />
              </label>
              <label className="flex items-center gap-2 text-caption" style={{ color: 'var(--clay-body)' }}>
                <span className="w-6 text-[10px]">上限</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={filter.weightRange?.[1] ?? 1}
                  onChange={(e) => {
                    const maxVal = parseFloat(e.target.value)
                    const minVal = filter.weightRange?.[0] ?? 0
                    updateFilter({ weightRange: [minVal, Math.max(maxVal, minVal)] })
                  }}
                  className="flex-1 accent-[var(--clay-primary)]"
                />
              </label>
            </div>
          </div>
        </FilterSection>

        {/* 其他 */}
        <FilterSection title="其他" badge={filter.hideIsolated ? 1 : 0}>
          <label
            className="flex items-center gap-2 cursor-pointer text-caption"
            style={{ color: 'var(--clay-body)' }}
          >
            <input
              type="checkbox"
              checked={filter.hideIsolated}
              onChange={(e) => updateFilter({ hideIsolated: e.target.checked })}
              className="accent-[var(--clay-primary)]"
            />
            <span>隐藏孤立节点（无任何边）</span>
          </label>
        </FilterSection>
      </div>
    </div>
  )
}


