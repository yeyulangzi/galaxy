'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Node as DomainNode, Edge as DomainEdge } from '@galaxy/shared'
import { select } from 'd3-selection'
import 'd3-transition' // 必须 import 才能给 selection 添加 .transition() 方法
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom'
import { drag, type D3DragEvent } from 'd3-drag'
import { forceCenter } from 'd3-force'
import {
  createSimulation,
  updateSimulationConfig,
  computeDegree,
  computeRadius,
  buildNeighborMap,
  presetCommunityPositions,
  DEFAULT_PHYSICS_CONFIG,
  type PhysicsNode,
  type PhysicsLink,
  type PhysicsConfig,
} from '@/lib/graph/physics'
import {
  render,
  setupCanvasDpr,
  findNodeAtScreen,
  findEdgeAtScreen,
  type RenderState,
} from '@/lib/graph/renderer'

/**
 * 6 个二级领域的固定颜色——高辨识度、互相区分明显
 * 顺序对应 domain 分组编号（0~5），额外颜色用于未分类或新增领域
 */
const DOMAIN_COMMUNITY_COLORS = [
  '#5DB8A6', // 0 产品设计 — 青绿
  '#E8845A', // 1 运营体系 — 珊瑚橙
  '#7B6FE0', // 2 用户与社群 — 薰衣草紫
  '#E8B94A', // 3 数据与增长 — 赭黄
  '#5A9FE8', // 4 市场与商业 — 天蓝
  '#E85A8A', // 5 平台与组织 — 玫瑰粉
  '#6BBF6B', // 6 备用 — 鼠尾草绿
  '#BF8A5A', // 7 备用 — 沙棕
  '#8A5ABF', // 8 备用 — 深紫
  '#5ABFBF', // 9 备用 — 青碧
  '#D4645A', // 10 备用 — 砖红
  '#A0C45A', // 11 备用 — 柠檬绿
  '#5A7ABF', // 12 备用 — 钴蓝
  '#BF5AAA', // 13 备用 — 洋紫
  '#E89A5A', // 14 备用 — 杏橙
  '#5ABFA0', // 15 备用 — 薄荷绿
]

export interface GraphCanvasV2Ref {
  /** 获取当前节点列表（带实时位置） */
  getNodes: () => PhysicsNode[]
  /** 获取当前 zoom transform */
  getTransform: () => { x: number; y: number; k: number }
  /** 获取主画布尺寸 */
  getSize: () => { width: number; height: number }
  /** 平移视图到世界坐标 (wx, wy)，使其位于画布中心 */
  panTo: (wx: number, wy: number) => void
  /** 重置视图 */
  resetView: () => void
  /** 让物理引擎重新加热（启动节点漂浮） */
  reheat: (alpha?: number) => void
}

interface GraphCanvasV2Props {
  nodes: DomainNode[]
  edges: DomainEdge[]
  selectedNodeId?: string | null
  selectedEdgeId?: string | null
  onSelectNode?: (id: string | null) => void
  onSelectEdge?: (id: string | null) => void
  onCreateEdge?: (sourceId: string, targetId: string) => void
  /** 物理引擎配置（来自设置面板） */
  physicsConfig?: PhysicsConfig
  /** 标签显示阈值 */
  labelMinZoom?: number
  /** 摘要显示阈值 */
  summaryMinZoom?: number
  /** 边宽倍数 */
  linkWidthMultiplier?: number
  /** 节点社区分配（id → community） */
  communityMap?: Map<string, number>
  /** 节点颜色（id → color），优先级高于 community */
  colorMap?: Map<string, string>
  /** 通知主画布尺寸变化（小地图用） */
  onSizeChange?: (size: { width: number; height: number }) => void
}

export const GraphCanvasV2 = forwardRef<GraphCanvasV2Ref, GraphCanvasV2Props>(function GraphCanvasV2(
  {
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    onSelectNode,
    onSelectEdge,
    onCreateEdge,
    physicsConfig = DEFAULT_PHYSICS_CONFIG,
    labelMinZoom = 0.6,
    summaryMinZoom = 1.5,
    linkWidthMultiplier = 1,
    communityMap,
    colorMap,
    onSizeChange,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simulationRef = useRef<ReturnType<typeof createSimulation> | null>(null)
  const transformRef = useRef({ x: 0, y: 0, k: 1 })
  const zoomBehaviorRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null)
  const dprRef = useRef(1)
  const sizeRef = useRef({ width: 0, height: 0 })
  /** 主绘制函数引用，初始化后由所有事件 handler 复用，避免 setState 触发 React 重渲染 */
  const drawRef = useRef<(() => void) | null>(null)
  /**
   * Hover 状态用 ref 而非 state，避免每次鼠标移动触发整个组件树重渲染。
   * UI 上 edgeCreation 提示框必须显示/隐藏，所以用一个轻量的 boolean state 兜底。
   */
  const hoveredIdRef = useRef<string | null>(null)
  /** Hover 卡片信息（用 state 驱动 HTML overlay 的显示，频率低——仅节点切换时更新） */
  const [hoverCard, setHoverCard] = useState<{
    title: string
    summary: string
    domain: string
    nodeType: string
    screenX: number
    screenY: number
  } | null>(null)
  const edgeCreationRef = useRef<{
    sourceId: string
    sourcePos: { x: number; y: number }
    cursorPos: { x: number; y: number }
  } | null>(null)
  /** 仅用于驱动 edgeCreation 提示条的显示/隐藏，不携带坐标数据（坐标存在 ref 里） */
  const [edgeCreationActive, setEdgeCreationActive] = useState(false)

  // 1. 准备物理数据（domain Node/Edge → PhysicsNode/PhysicsLink）
  const { physicsNodes, physicsLinks, neighborMap } = useMemo(() => {
    const linksRaw: PhysicsLink[] = edges.map((e) => ({
      id: e.id,
      source: e.source_node_id,
      target: e.target_node_id,
      weight: e.weight ?? 1,
      relation_type: e.relation_type,
      origin: e.origin,
      description: e.description,
    }))

    const nodesRaw: PhysicsNode[] = nodes.map((n) => ({
      id: n.id,
      title: n.title,
      domain: n.domain,
      summary: n.summary,
      node_type: n.node_type,
      channel: n.channel,
      internalization_status: n.internalization_status,
      radius: 8,
      degree: 0,
    }))

    // 计算度 + 半径 + 颜色
    const degreeMap = computeDegree(nodesRaw, linksRaw)
    for (const node of nodesRaw) {
      const deg = degreeMap.get(node.id) ?? 0
      node.degree = deg
      node.radius = computeRadius(deg)
      // 颜色优先级：colorMap > 按 domain 着色 > 默认
      if (colorMap?.has(node.id)) {
        node.color = colorMap.get(node.id)
      } else if (communityMap?.has(node.id)) {
        const c = communityMap.get(node.id)!
        node.community = c
        node.color = DOMAIN_COMMUNITY_COLORS[c % DOMAIN_COMMUNITY_COLORS.length]
      }
    }

    const nMap = buildNeighborMap(nodesRaw, linksRaw)
    return { physicsNodes: nodesRaw, physicsLinks: linksRaw, neighborMap: nMap }
  }, [nodes, edges, communityMap, colorMap])

  // 2. 渲染状态（每帧用）
  const renderStateRef = useRef<RenderState>({
    nodes: physicsNodes,
    links: physicsLinks,
    hoveredId: null,
    selectedId: null,
    selectedEdgeId: null,
    neighborMap,
    labelMinZoom,
    summaryMinZoom,
    linkWidthMultiplier,
    showEdgeDescriptions: false,
  })

  // 同步 props/memo 变化到 renderStateRef，并在变化后请求一次重绘
  // 注意：hoveredId 不在这里同步——它由 mousemove 直接写 ref + 调 draw，避免 setState
  useEffect(() => {
    renderStateRef.current.nodes = physicsNodes
    renderStateRef.current.links = physicsLinks
    renderStateRef.current.neighborMap = neighborMap
    renderStateRef.current.selectedId = selectedNodeId ?? null
    renderStateRef.current.selectedEdgeId = selectedEdgeId ?? null
    renderStateRef.current.labelMinZoom = labelMinZoom
    renderStateRef.current.summaryMinZoom = summaryMinZoom
    renderStateRef.current.linkWidthMultiplier = linkWidthMultiplier
    // 选中或参数变化后手动重绘一帧（simulation 可能已停止）
    drawRef.current?.()
  }, [
    physicsNodes,
    physicsLinks,
    neighborMap,
    selectedNodeId,
    selectedEdgeId,
    labelMinZoom,
    summaryMinZoom,
    linkWidthMultiplier,
  ])

  // 3. 主初始化：尺寸、Canvas、Simulation、Zoom、事件
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const rect = container.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    sizeRef.current = { width, height }
    dprRef.current = setupCanvasDpr(canvas, width, height)

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 按社区预分配初始位置，让不同社区从不同区域出发
    presetCommunityPositions(physicsNodes, width, height)

    // 创建 simulation
    const simulation = createSimulation(physicsNodes, physicsLinks, width, height, physicsConfig)
    simulationRef.current = simulation

    // 渲染循环（simulation 每 tick 触发；其它事件也可手动调 drawRef.current()）
    // 用 rAF 节流：连续多次请求合并为一帧，避免 simulation tick + zoom + hover 同帧多次重绘
    let rafScheduled = false
    let currentSize = { width, height }
    const draw = () => {
      if (rafScheduled) return
      rafScheduled = true
      requestAnimationFrame(() => {
        rafScheduled = false
        render(
          {
            ctx,
            width: currentSize.width,
            height: currentSize.height,
            transform: transformRef.current,
            dpr: dprRef.current,
          },
          renderStateRef.current,
        )
        // 如果正在创建边，叠加绘制临时连线
        const ec = edgeCreationRef.current
        if (ec) {
          const { sourcePos, cursorPos } = ec
          ctx.save()
          ctx.setTransform(
            dprRef.current * transformRef.current.k,
            0,
            0,
            dprRef.current * transformRef.current.k,
            dprRef.current * transformRef.current.x,
            dprRef.current * transformRef.current.y,
          )
          ctx.beginPath()
          ctx.setLineDash([4 / transformRef.current.k, 4 / transformRef.current.k])
          ctx.moveTo(sourcePos.x, sourcePos.y)
          ctx.lineTo(cursorPos.x, cursorPos.y)
          ctx.strokeStyle = '#cc785c'
          ctx.lineWidth = 2 / transformRef.current.k
          ctx.stroke()
          ctx.setLineDash([])
          ctx.restore()
        }
      })
    }
    drawRef.current = draw
    simulation.on('tick', draw)

    // 设置 d3-zoom
    const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 4])
      .filter((event) => {
        // 只允许左键拖拽 + wheel；右键交给我们自己处理
        if (event.type === 'mousedown' && (event as MouseEvent).button !== 0) return false
        // 允许 ctrlKey + wheel（Mac 触摸板双指缩放被浏览器映射为 ctrlKey + wheel）
        if (event.type === 'wheel') return true
        return !event.ctrlKey && !event.button
      })
      .on('zoom', (event: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
        transformRef.current = { x: event.transform.x, y: event.transform.y, k: event.transform.k }
        draw()
      })
    zoomBehaviorRef.current = zoomBehavior

    const canvasSel = select(canvas)
    canvasSel.call(zoomBehavior)

    // 节点拖拽：使用 d3-drag，但要和 zoom 区分（drag 触发时 zoom 不应介入）
    const dragBehavior = drag<HTMLCanvasElement, unknown>()
      .filter((event) => {
        if ((event as MouseEvent).button !== 0) return false
        // 只在命中节点时才启动 drag
        const { offsetX, offsetY } = event as MouseEvent
        const hit = findNodeAtScreen(renderStateRef.current, transformRef.current, offsetX, offsetY)
        return !!hit
      })
      .container(() => canvas)
      .subject((event: D3DragEvent<HTMLCanvasElement, unknown, unknown>) => {
        const sx = event.x
        const sy = event.y
        const node = findNodeAtScreen(renderStateRef.current, transformRef.current, sx, sy)
        return node
      })
      .on('start', (event: D3DragEvent<HTMLCanvasElement, PhysicsNode, PhysicsNode>) => {
        if (!event.subject) return
        if (!event.active) simulation.alphaTarget(0.3).restart()
        event.subject.fx = event.subject.x
        event.subject.fy = event.subject.y
      })
      .on('drag', (event: D3DragEvent<HTMLCanvasElement, PhysicsNode, PhysicsNode>) => {
        if (!event.subject) return
        // 屏幕坐标 → 世界坐标
        const wx = (event.x - transformRef.current.x) / transformRef.current.k
        const wy = (event.y - transformRef.current.y) / transformRef.current.k
        event.subject.fx = wx
        event.subject.fy = wy
      })
      .on('end', (event: D3DragEvent<HTMLCanvasElement, PhysicsNode, PhysicsNode>) => {
        if (!event.subject) return
        if (!event.active) simulation.alphaTarget(0)
        // 释放节点（让其自然漂浮回去）
        event.subject.fx = null
        event.subject.fy = null
      })

    canvasSel.call(dragBehavior)

    // ResizeObserver（仅处理物理引擎相关逻辑，尺寸通知拆到独立 effect）
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        const h = entry.contentRect.height
        sizeRef.current = { width: w, height: h }
        currentSize = { width: w, height: h }
        dprRef.current = setupCanvasDpr(canvas, w, h)
        const center = simulation.force('center') as ReturnType<typeof forceCenter> | null
        if (center) center.x(w / 2).y(h / 2)
        simulation.alpha(0.3).restart()
        draw()
      }
    })
    resizeObserver.observe(container)

    // 初始绘制
    draw()

    return () => {
      resizeObserver.disconnect()
      simulation.stop()
      canvasSel.on('.zoom', null).on('.drag', null)
      drawRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [physicsNodes, physicsLinks])

  // 3b. 独立的尺寸通知 effect（不受主 useEffect 的 StrictMode 双执行影响）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const notifySize = () => {
      const rect = container.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        sizeRef.current = { width: rect.width, height: rect.height }
        onSizeChange?.({ width: rect.width, height: rect.height })
      }
    }
    // 延迟一帧确保布局完成
    const frameId = requestAnimationFrame(notifySize)
    const observer = new ResizeObserver(() => notifySize())
    observer.observe(container)
    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
    }
  }, [onSizeChange])

  // 4. 物理参数变化时更新 simulation
  useEffect(() => {
    const sim = simulationRef.current
    if (!sim) return
    const { width, height } = sizeRef.current
    if (width === 0 || height === 0) return
    updateSimulationConfig(sim, physicsConfig, width, height)
  }, [physicsConfig])

  // 暴露 ref API（供小地图、设置面板等外部组件使用）
  useImperativeHandle(
    ref,
    () => ({
      getNodes: () => renderStateRef.current.nodes,
      getTransform: () => transformRef.current,
      getSize: () => sizeRef.current,
      panTo: (wx: number, wy: number) => {
        const canvas = canvasRef.current
        const zb = zoomBehaviorRef.current
        if (!canvas || !zb) return
        const { width, height } = sizeRef.current
        // 计算让 (wx, wy) 位于屏幕中心需要的 transform
        const k = transformRef.current.k
        const tx = width / 2 - wx * k
        const ty = height / 2 - wy * k
        select(canvas)
          .transition()
          .duration(250)
          .call(zb.transform, zoomIdentity.translate(tx, ty).scale(k))
      },
      resetView: () => {
        const canvas = canvasRef.current
        const zb = zoomBehaviorRef.current
        if (canvas && zb) {
          select(canvas).transition().duration(400).call(zb.transform, zoomIdentity)
        }
      },
      reheat: (alpha = 0.3) => {
        simulationRef.current?.alpha(alpha).restart()
      },
    }),
    [],
  )

  // 5. 鼠标移动：直接写 ref + 触发重绘，不走 React state，避免组件重渲染
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const hit = findNodeAtScreen(renderStateRef.current, transformRef.current, sx, sy)
    const newHoverId = hit?.id ?? null

    // 设置鼠标指针（直接操作 DOM，不触发 React）
    e.currentTarget.style.cursor = hit ? 'pointer' : edgeCreationRef.current ? 'crosshair' : 'grab'

    // 更新右键拖拽线坐标（仅写 ref，不触发 React）
    const ec = edgeCreationRef.current
    if (ec) {
      const wx = (sx - transformRef.current.x) / transformRef.current.k
      const wy = (sy - transformRef.current.y) / transformRef.current.k
      ec.cursorPos = { x: wx, y: wy }
      drawRef.current?.()
      return // 拖拽时不再处理 hover
    }

    // hover 状态变化时才同步 + 重绘（避免无意义重绘）
    if (newHoverId !== hoveredIdRef.current) {
      hoveredIdRef.current = newHoverId
      renderStateRef.current.hoveredId = newHoverId
      drawRef.current?.()

      // 更新 hover 卡片
      if (hit) {
        setHoverCard({
          title: hit.title,
          summary: hit.summary ?? '',
          domain: hit.domain ?? '',
          nodeType: hit.node_type ?? 'concept',
          screenX: e.clientX - rect.left,
          screenY: e.clientY - rect.top,
        })
      } else {
        setHoverCard(null)
      }
    }
  }, [])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top

      const node = findNodeAtScreen(renderStateRef.current, transformRef.current, sx, sy)
      if (node) {
        onSelectNode?.(node.id)
        return
      }

      // 点空白：取消选择
      onSelectNode?.(null)
    },
    [onSelectNode],
  )

  // 右键按下：开始创建边
  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const node = findNodeAtScreen(renderStateRef.current, transformRef.current, sx, sy)
      if (node && node.x !== undefined && node.y !== undefined) {
        edgeCreationRef.current = {
          sourceId: node.id,
          sourcePos: { x: node.x, y: node.y },
          cursorPos: { x: node.x, y: node.y },
        }
        setEdgeCreationActive(true)
        drawRef.current?.()
      }
    },
    [],
  )

  // 鼠标抬起：完成边创建
  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button !== 2) return
      const ec = edgeCreationRef.current
      if (!ec) return
      const rect = e.currentTarget.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const target = findNodeAtScreen(renderStateRef.current, transformRef.current, sx, sy)
      const sourceId = ec.sourceId
      edgeCreationRef.current = null
      setEdgeCreationActive(false)
      drawRef.current?.()
      if (target && target.id !== sourceId) {
        onCreateEdge?.(sourceId, target.id)
      }
    },
    [onCreateEdge],
  )

  // 提供"重置视图"能力（双击空白）
  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const node = findNodeAtScreen(renderStateRef.current, transformRef.current, sx, sy)
    if (node) return // 双击节点不重置
    const canvas = canvasRef.current
    const zb = zoomBehaviorRef.current
    if (canvas && zb) {
      select(canvas).transition().duration(400).call(zb.transform, zoomIdentity)
    }
  }, [])

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        className="block"
        style={{ display: 'block' }}
      />
      {edgeCreationActive && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-[var(--clay-surface-card)]/90 px-3 py-1.5 text-xs text-[var(--clay-body)] shadow-sm">
          松开右键到目标节点以创建关联
        </div>
      )}
      {/* Hover 节点信息卡片 */}
      <div
        className="pointer-events-none absolute z-30"
        style={{
          left: hoverCard ? Math.min(hoverCard.screenX + 16, (containerRef.current?.clientWidth ?? 800) - 280) : 0,
          top: hoverCard ? Math.max(hoverCard.screenY - 20, 8) : 0,
          opacity: hoverCard ? 1 : 0,
          transform: hoverCard ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 0.2s ease-out, transform 0.2s ease-out',
          visibility: hoverCard ? 'visible' : 'hidden',
        }}
      >
        {hoverCard && (
          <div
            className="w-[260px] rounded-xl px-4 py-3 shadow-lg backdrop-blur-sm"
            style={{
              background: 'rgba(250, 249, 245, 0.95)',
              border: '1px solid rgba(176, 169, 159, 0.3)',
            }}
          >
            {/* 领域标签 */}
            {hoverCard.domain && (
              <div
                className="mb-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  background: 'rgba(93, 184, 166, 0.15)',
                  color: '#3d8b7a',
                }}
              >
                {hoverCard.domain}
              </div>
            )}
            {/* 标题 */}
            <div
              className="text-[13px] font-semibold leading-snug"
              style={{ color: '#141413' }}
            >
              {hoverCard.title}
            </div>
            {/* 介绍 */}
            {hoverCard.summary && (
              <div
                className="mt-1.5 text-[11px] leading-relaxed"
                style={{ color: '#5c5c57' }}
              >
                {hoverCard.summary.length > 120
                  ? hoverCard.summary.slice(0, 120) + '…'
                  : hoverCard.summary}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})