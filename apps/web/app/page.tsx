'use client'

import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { Sparkles, Search, FilePlus } from 'lucide-react'
import { useGraphStore } from '@/lib/store/graph-store'
import { useGraphViewStore } from '@/lib/store/graph-view-store'
import { api } from '@/lib/api/client'
import { NavBar } from './_components/nav-bar'
import { FeedFab } from './_components/feed-fab'
import { applyGraphFilter } from '@/lib/graph/filter'
import type { GraphCanvasV2Ref } from './_components/graph-canvas-v2'

const GraphCanvasV2 = dynamic(
  () => import('./_components/graph-canvas-v2').then((m) => m.GraphCanvasV2),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse" style={{ background: 'var(--clay-surface-soft)' }} /> },
)
const GraphControlPanel = dynamic(
  () => import('./_components/graph-control-panel').then((m) => m.GraphControlPanel),
  { ssr: false },
)
const GraphFilterPanel = dynamic(
  () => import('./_components/graph-filter-panel').then((m) => m.GraphFilterPanel),
  { ssr: false },
)
const NodeDetailPanel = dynamic(
  () => import('./_components/node-detail-panel').then((m) => m.NodeDetailPanel),
  { ssr: false },
)
const GraphOverview = dynamic(
  () => import('./_components/graph-overview').then((m) => m.GraphOverview),
  { ssr: false },
)
const NewNodeDialog = dynamic(
  () => import('./_components/new-node-dialog').then((m) => m.NewNodeDialog),
  { ssr: false },
)
const CommandPalette = dynamic(
  () => import('./_components/command-palette').then((m) => m.CommandPalette),
  { ssr: false },
)

interface EdgeInfo {
  sourceTitle: string
  targetTitle: string
  relationType: string
  weight: number
  description: string | null
}

const RELATION_LABELS: Record<string, string> = {
  contains: '包含',
  related: '关联',
  opposes: '对立',
  instance_of: '实例',
  evolved_from: '演化自',
  cites: '引用',
}

export default function Page() {
  const { nodes, edges, loadAll, selectedNodeId, selectNode, addEdge } = useGraphStore()
  const {
    physics,
    labelMinZoom,
    summaryMinZoom,
    linkWidthMultiplier,
    enableCommunityColor,
    filter,
  } = useGraphViewStore()
  const [selectedEdge, setSelectedEdge] = useState<EdgeInfo | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const v2Ref = useRef<GraphCanvasV2Ref>(null)
  const [mainSize, setMainSize] = useState({ width: 0, height: 0 })

  // 应用过滤器（V1/V2 都使用过滤后的数据）
  const filteredData = useMemo(() => {
    return applyGraphFilter(nodes, edges, filter)
  }, [nodes, edges, filter])

  // 社区检测：基于二级领域分组（比 Louvain 算法更稳定、更语义化）
  const communityMap = useMemo(() => {
    if (!enableCommunityColor) return undefined
    if (filteredData.nodes.length === 0) return undefined

    // 用二级领域名称确定性地映射颜色（不依赖遍历顺序）
    // 已知的 6 个领域固定分配，新领域用名称哈希分配新颜色
    const FIXED_DOMAIN_INDEX: Record<string, number> = {
      '互联网/产品设计': 0,
      '互联网/运营体系': 1,
      '互联网/用户与社群': 2,
      '互联网/数据与增长': 3,
      '互联网/市场与商业': 4,
      '互联网/平台与组织': 5,
    }
    let nextDynamicId = Object.keys(FIXED_DOMAIN_INDEX).length // 从 6 开始
    const dynamicMap = new Map<string, number>()

    const result = new Map<string, number>()
    for (const node of filteredData.nodes) {
      const domain = node.domain ?? '未分类'
      const parts = domain.split('/')
      const level2Key = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0]

      let colorIndex: number
      if (level2Key in FIXED_DOMAIN_INDEX) {
        colorIndex = FIXED_DOMAIN_INDEX[level2Key]
      } else if (dynamicMap.has(level2Key)) {
        colorIndex = dynamicMap.get(level2Key)!
      } else {
        colorIndex = nextDynamicId++
        dynamicMap.set(level2Key, colorIndex)
      }
      result.set(node.id, colorIndex)
    }

    return result
  }, [filteredData, enableCommunityColor])

  const handleSelectNode = useCallback(
    (id: string | null) => {
      selectNode(id)
      setSelectedEdge(null)
      setSelectedEdgeId(null)
    },
    [selectNode],
  )

  const handleSelectEdgeV2 = useCallback(
    (id: string | null) => {
      setSelectedEdgeId(id)
      if (!id) {
        setSelectedEdge(null)
        return
      }
      const edge = edges.find((e) => e.id === id)
      if (!edge) {
        setSelectedEdge(null)
        return
      }
      const sourceNode = nodes.find((n) => n.id === edge.source_node_id)
      const targetNode = nodes.find((n) => n.id === edge.target_node_id)
      setSelectedEdge({
        sourceTitle: sourceNode?.title ?? '?',
        targetTitle: targetNode?.title ?? '?',
        relationType: edge.relation_type,
        weight: edge.weight ?? 1,
        description: edge.description ?? null,
      })
    },
    [edges, nodes],
  )

  const handleCreateEdge = useCallback(
    async (sourceId: string, targetId: string) => {
      try {
        await addEdge({ source_node_id: sourceId, target_node_id: targetId, relation_type: 'related', origin: 'manual', weight: 1 })
        toast.success('已创建边')
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : '创建失败'
        toast.error(message)
      }
    },
    [addEdge],
  )
  const [newOpen, setNewOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [refreshingEdges, setRefreshingEdges] = useState(false)
  const [refreshEdgesStatus, setRefreshEdgesStatus] = useState('')
  const refreshPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (refreshPollRef.current) {
      clearInterval(refreshPollRef.current)
      refreshPollRef.current = null
    }
  }, [])

  const handleRefreshEdges = useCallback(async () => {
    setRefreshingEdges(true)
    setRefreshEdgesStatus('启动中…')
    try {
      const startResponse = await fetch('/api/edges/refresh', { method: 'POST' })
      const startJson = await startResponse.json()
      if (!startResponse.ok) throw new Error(startJson.error ?? '启动失败')
      // 开始轮询任务进度（不传 taskId，直接查询当前活跃任务，避免热重载导致内存 taskStore 丢失）
      const pollStatus = async () => {
        try {
          const statusResponse = await fetch('/api/edges/refresh')
          const statusJson = await statusResponse.json()
          if (!statusResponse.ok) {
            stopPolling()
            setRefreshingEdges(false)
            setRefreshEdgesStatus('')
            toast.error('查询任务状态失败')
            return
          }
          const { phase, progress, result, error } = statusJson.data
          if (phase === 'backfilling') {
            setRefreshEdgesStatus(`补齐关联 ${progress.current}/${progress.total}`)
          } else if (phase === 'regenerating') {
            setRefreshEdgesStatus(`生成描述 ${progress.current}/${progress.total}`)
          } else if (phase === 'completed') {
            stopPolling()
            setRefreshingEdges(false)
            setRefreshEdgesStatus('')
            toast.success(`补齐 ${result?.created ?? 0} 条关联，刷新 ${result?.updated ?? 0} 条描述`)
            await loadAll()
          } else if (phase === 'failed') {
            stopPolling()
            setRefreshingEdges(false)
            setRefreshEdgesStatus('')
            toast.error(error ?? '刷新关联失败')
          } else if (phase === 'idle') {
            // 没有活跃任务也没有最近完成的任务
            stopPolling()
            setRefreshingEdges(false)
            setRefreshEdgesStatus('')
            toast.info('当前无刷新任务')
          }
        } catch {
          stopPolling()
          setRefreshingEdges(false)
          setRefreshEdgesStatus('')
          toast.error('轮询任务状态失败')
        }
      }

      // 立即查询一次，然后每 2 秒轮询
      await pollStatus()
      refreshPollRef.current = setInterval(pollStatus, 2000)
    } catch (e: unknown) {
      setRefreshingEdges(false)
      setRefreshEdgesStatus('')
      toast.error(e instanceof Error ? e.message : '刷新关联失败')
    }
  }, [loadAll, stopPolling])

  // 组件卸载时清理轮询
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Domain distribution for overview
  const domainStats = useMemo(() => {
    const map = new Map<string, number>()
    for (const n of nodes) {
      const d = n.domain || '未分类'
      map.set(d, (map.get(d) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
  }, [nodes])

  return (
    <main className="flex h-screen flex-col" style={{ background: 'var(--clay-canvas)' }}>
      <NavBar />
      <div className="flex flex-1 min-h-0">
        {/* Left: Graph Canvas */}
        <div className="relative flex-1 min-w-0">
          <GraphCanvasV2
            ref={v2Ref}
            nodes={filteredData.nodes}
            edges={filteredData.edges}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            onSelectNode={handleSelectNode}
            onSelectEdge={handleSelectEdgeV2}
            onCreateEdge={handleCreateEdge}
            physicsConfig={physics}
            labelMinZoom={labelMinZoom}
            summaryMinZoom={summaryMinZoom}
            linkWidthMultiplier={linkWidthMultiplier}
            communityMap={communityMap}
            onSizeChange={setMainSize}
          />
          {/* Top-left toolbar */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-caption font-medium transition-all hover:scale-105"
              style={{
                background: 'var(--clay-surface-card)',
                color: 'var(--clay-body)',
                border: '1px solid var(--clay-hairline)',
              }}
              title="搜索节点 (⌘K)"
            >
              <Search className="h-3.5 w-3.5" />
              搜索
            </button>
            <button
              onClick={() => setNewOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-caption font-medium transition-all hover:scale-105"
              style={{
                background: 'var(--clay-surface-card)',
                color: 'var(--clay-body)',
                border: '1px solid var(--clay-hairline)',
              }}
              title="添加节点"
            >
              <FilePlus className="h-3.5 w-3.5" />
              添加节点
            </button>
            {/* Refresh edges: backfill + regenerate descriptions */}
            <button
              onClick={handleRefreshEdges}
              disabled={refreshingEdges}
              className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-caption font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'var(--clay-surface-card)',
                color: 'var(--clay-body)',
                border: '1px solid var(--clay-hairline)',
              }}
              title="AI 补齐缺失关联 + 刷新所有边的描述"
            >
              <Sparkles className={`h-3.5 w-3.5 ${refreshingEdges ? 'animate-pulse' : ''}`} />
              {refreshingEdges ? (refreshEdgesStatus || '处理中…') : '刷新关联'}
            </button>
          </div>

          <GraphFilterPanel nodes={nodes} />
          <GraphControlPanel />
          {/* Edge detail tooltip */}
          {selectedEdge && (
            <div
              className="absolute bottom-6 left-1/2 -translate-x-1/2 clay-card px-6 py-4 animate-fade-in z-20"
              style={{ minWidth: 320, maxWidth: 480 }}
            >
              <div className="flex items-center gap-3 text-body-sm" style={{ color: 'var(--clay-ink)' }}>
                <span className="font-medium truncate max-w-[140px]">{selectedEdge.sourceTitle}</span>
                <span className="shrink-0 px-2 py-0.5 rounded-[var(--radius-pill)] text-caption font-medium"
                  style={{ background: 'var(--clay-primary)', color: 'var(--clay-on-primary)' }}>
                  {RELATION_LABELS[selectedEdge.relationType] ?? selectedEdge.relationType}
                </span>
                <span className="font-medium truncate max-w-[140px]">{selectedEdge.targetTitle}</span>
              </div>
              {selectedEdge.description && (
                <p className="mt-2 text-body-sm leading-relaxed" style={{ color: 'var(--clay-body)' }}>
                  {selectedEdge.description}
                </p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-caption" style={{ color: 'var(--clay-muted)' }}>关联系数</span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--clay-hairline)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(selectedEdge.weight * 100, 100)}%`, background: 'var(--clay-primary)' }}
                  />
                </div>
                <span className="text-caption font-medium" style={{ color: 'var(--clay-ink)' }}>
                  {selectedEdge.weight.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>
        {/* Right: Detail Panel — fixed 480px */}
        <div
          className="w-[480px] shrink-0 overflow-y-auto"
          style={{ borderLeft: '1px solid var(--clay-hairline-soft)', background: 'var(--clay-canvas)' }}
        >
          {selectedNodeId ? (
            <NodeDetailPanel />
          ) : (
            <GraphOverview
              nodeCount={nodes.length}
              edgeCount={edges.length}
              domainStats={domainStats}
              nodes={nodes}
            />
          )}
        </div>
      </div>
      <NewNodeDialog open={newOpen} onOpenChange={setNewOpen} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <FeedFab />
    </main>
  )
}
