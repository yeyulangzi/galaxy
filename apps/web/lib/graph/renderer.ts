/**
 * Canvas 渲染层
 * 高性能绘制节点、边、标签
 */
import type { PhysicsNode, PhysicsLink } from './physics'

export interface RenderContext {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  /** 屏幕到世界坐标的 transform */
  transform: { x: number; y: number; k: number }
  dpr: number
}

export interface RenderState {
  nodes: PhysicsNode[]
  links: PhysicsLink[]
  hoveredId: string | null
  selectedId: string | null
  selectedEdgeId: string | null
  neighborMap: Map<string, Set<string>>
  /** 标签显示的最低缩放级别 */
  labelMinZoom: number
  /** 摘要显示的最低缩放级别 */
  summaryMinZoom: number
  /** 边宽度倍数 */
  linkWidthMultiplier: number
  /** 是否显示边描述 */
  showEdgeDescriptions: boolean
}

const COLORS = {
  canvas: '#faf9f5',
  nodeDefault: '#5db8a6',
  nodeSelected: '#cc785c',
  nodeStroke: '#141413',
  nodeStrokeSelected: '#a9583e',
  edgeDefault: '#b0a99f',
  edgeHighlight: '#cc785c',
  edgeAiSuggested: '#9b8e7e',
  labelText: '#141413',
  labelBg: 'rgba(250, 249, 245, 0.9)',
  summaryText: '#3d3d3a',
} as const

/** 按 node_type 差异化颜色 */
const NODE_TYPE_COLORS: Record<string, string> = {
  concept: '#5db8a6',
  claim: '#d4915e',
  case: '#7a9ec4',
  resource: '#a0a0a0',
}

/** 按 internalization_status 差异化描边 */
const STATUS_STROKE_COLORS: Record<string, string> = {
  draft: '#b0a99f',
  linked: '#5db8a6',
  dialogued: '#3d8b7a',
  mastered: '#2a6b5e',
}

/**
 * measureText 缓存：(title|fontSize) → width。
 * Canvas measureText 每帧每节点调用代价不可忽视（千节点级别能占毫秒级）。
 * 标题文本和字号在帧间高度稳定，缓存命中率接近 100%。
 * 用 Map + 容量上限避免节点频繁更新时无限增长。
 */
const MEASURE_CACHE = new Map<string, number>()
const MEASURE_CACHE_MAX = 2000

function measureTextCached(ctx: CanvasRenderingContext2D, text: string, fontSize: number): number {
  // fontSize 量化到 0.5px 精度，避免 zoom 微小变化导致缓存全失效
  const key = `${text}|${(Math.round(fontSize * 2) / 2).toFixed(1)}`
  const cached = MEASURE_CACHE.get(key)
  if (cached !== undefined) return cached
  const width = ctx.measureText(text).width
  if (MEASURE_CACHE.size >= MEASURE_CACHE_MAX) {
    // 简单的 FIFO 淘汰：删掉最早插入的那一批（前 1/4）
    const toDelete = Math.floor(MEASURE_CACHE_MAX / 4)
    let i = 0
    for (const k of MEASURE_CACHE.keys()) {
      MEASURE_CACHE.delete(k)
      if (++i >= toDelete) break
    }
  }
  MEASURE_CACHE.set(key, width)
  return width
}

/**
 * 主渲染入口（每帧调用）
 */
export function render(rctx: RenderContext, state: RenderState) {
  const { ctx, width, height, transform, dpr } = rctx
  // 清空画布（屏幕坐标系）
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = COLORS.canvas
  ctx.fillRect(0, 0, width, height)
  ctx.restore()

  // 应用 zoom transform（世界坐标系）
  ctx.save()
  ctx.setTransform(dpr * transform.k, 0, 0, dpr * transform.k, dpr * transform.x, dpr * transform.y)

  // 关键优化：1/zoom 在入口计算一次，传给所有子函数
  // 旧代码在循环里反复 `xxx / zoom`，1000 节点 × 10 次/节点 = 万级浮点除法/帧
  const invK = 1 / transform.k

  // 计算视口在世界坐标的 bbox（标签裁剪用）
  // 屏幕 (0,0)-(width,height) 反变换到世界坐标
  const viewLeft = -transform.x * invK
  const viewTop = -transform.y * invK
  const viewRight = viewLeft + width * invK
  const viewBottom = viewTop + height * invK

  // 1. 绘制边
  drawEdges(ctx, state, invK)

  // 2. 绘制节点
  drawNodes(ctx, state, invK)

  // 3. 绘制标签（如果缩放级别足够）
  if (transform.k >= state.labelMinZoom) {
    drawLabels(ctx, state, transform.k, invK, viewLeft, viewTop, viewRight, viewBottom)
  }

  ctx.restore()
}

function getNodeOpacity(node: PhysicsNode, state: RenderState): number {
  const { hoveredId, selectedId, neighborMap } = state
  const focusId = hoveredId ?? selectedId
  if (!focusId) return 1
  if (node.id === focusId) return 1
  const isNeighbor = neighborMap.get(focusId)?.has(node.id)
  return isNeighbor ? 1 : 0.18
}

function getEdgeOpacity(link: PhysicsLink, state: RenderState): number {
  const { hoveredId, selectedId, selectedEdgeId } = state
  if (selectedEdgeId === link.id) return 1
  const focusId = hoveredId ?? selectedId
  if (!focusId) return 0.55
  const sourceId = typeof link.source === 'string' ? link.source : link.source.id
  const targetId = typeof link.target === 'string' ? link.target : link.target.id
  const isConnected = sourceId === focusId || targetId === focusId
  return isConnected ? 0.95 : 0.08
}

function drawNodes(ctx: CanvasRenderingContext2D, state: RenderState, invK: number) {
  const { nodes, hoveredId, selectedId } = state
  const normalStroke = 1.2 * invK
  const lightDash = [3 * invK, 3 * invK]

  for (const node of nodes) {
    if (node.x === undefined || node.y === undefined) continue
    const opacity = getNodeOpacity(node, state)
    const isHovered = node.id === hoveredId
    const isSelected = node.id === selectedId

    ctx.globalAlpha = opacity

    const fillColor = isSelected
      ? COLORS.nodeSelected
      : node.color ?? NODE_TYPE_COLORS[node.node_type ?? ''] ?? COLORS.nodeDefault

    // hover/选中时节点半径放大
    const displayRadius = isHovered ? node.radius * 1.25 : isSelected ? node.radius * 1.15 : node.radius

    // 选中状态：外圈光晕环
    if (isSelected) {
      const glowRadius = displayRadius + 6 * invK
      const gradient = ctx.createRadialGradient(node.x, node.y, displayRadius, node.x, node.y, glowRadius)
      gradient.addColorStop(0, 'rgba(204, 120, 92, 0.5)')
      gradient.addColorStop(1, 'rgba(204, 120, 92, 0)')
      ctx.beginPath()
      ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2)
      ctx.fillStyle = gradient
      ctx.fill()
    }

    // hover 状态：柔光光晕
    if (isHovered && !isSelected) {
      const glowRadius = displayRadius + 8 * invK
      const gradient = ctx.createRadialGradient(node.x, node.y, displayRadius * 0.8, node.x, node.y, glowRadius)
      gradient.addColorStop(0, hexToRgba(fillColor, 0.4))
      gradient.addColorStop(1, hexToRgba(fillColor, 0))
      ctx.beginPath()
      ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2)
      ctx.fillStyle = gradient
      ctx.fill()
    }

    // 绘制节点形状
    const nodeType = node.node_type ?? 'concept'
    ctx.beginPath()
    if (nodeType === 'claim') {
      drawDiamond(ctx, node.x, node.y, displayRadius)
    } else if (nodeType === 'case') {
      drawRoundedSquare(ctx, node.x, node.y, displayRadius, 3 * invK)
    } else if (nodeType === 'resource') {
      drawHexagon(ctx, node.x, node.y, displayRadius)
    } else {
      ctx.arc(node.x, node.y, displayRadius, 0, Math.PI * 2)
    }
    ctx.fillStyle = fillColor
    ctx.fill()

    // 描边
    const strokeWidth = isSelected ? 3 * invK : isHovered ? 2 * invK : normalStroke
    ctx.lineWidth = strokeWidth
    const statusStroke = STATUS_STROKE_COLORS[node.internalization_status ?? '']
    ctx.strokeStyle = isSelected
      ? COLORS.nodeStrokeSelected
      : isHovered
        ? fillColor
        : statusStroke ?? COLORS.nodeStroke
    ctx.globalAlpha = opacity * (isHovered || isSelected ? 1 : 0.7)
    if (node.channel === 'light') ctx.setLineDash(lightDash)
    ctx.stroke()
    if (node.channel === 'light') ctx.setLineDash([])
  }
  ctx.globalAlpha = 1
}

/** 将 hex 颜色转为 rgba 字符串 */
function hexToRgba(hex: string, alpha: number): string {
  // 处理 hsl 格式
  if (hex.startsWith('hsl')) return hex.replace(')', `, ${alpha})`).replace('hsl', 'hsla')
  // 处理 rgb 格式
  if (hex.startsWith('rgb')) return hex.replace(')', `, ${alpha})`).replace('rgb', 'rgba')
  // 处理 hex 格式
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return `rgba(93, 184, 166, ${alpha})`
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`
}

/** 菱形（claim） */
function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx + r, cy)
  ctx.lineTo(cx, cy + r)
  ctx.lineTo(cx - r, cy)
  ctx.closePath()
}

/** 圆角方形（case） */
function drawRoundedSquare(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  cornerRadius: number,
) {
  const half = r * 0.85
  const x = cx - half
  const y = cy - half
  const size = half * 2
  const cr = Math.min(cornerRadius, half)
  ctx.moveTo(x + cr, y)
  ctx.lineTo(x + size - cr, y)
  ctx.arcTo(x + size, y, x + size, y + cr, cr)
  ctx.lineTo(x + size, y + size - cr)
  ctx.arcTo(x + size, y + size, x + size - cr, y + size, cr)
  ctx.lineTo(x + cr, y + size)
  ctx.arcTo(x, y + size, x, y + size - cr, cr)
  ctx.lineTo(x, y + cr)
  ctx.arcTo(x, y, x + cr, y, cr)
  ctx.closePath()
}

/** 六边形（resource） */
function drawHexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    const px = cx + r * Math.cos(angle)
    const py = cy + r * Math.sin(angle)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

function drawEdges(ctx: CanvasRenderingContext2D, state: RenderState, invK: number) {
  const { links, selectedEdgeId, hoveredId, selectedId, linkWidthMultiplier } = state
  const widthScale = linkWidthMultiplier * invK
  const arrowSize = 5 * invK // 箭头大小

  for (const link of links) {
    const source = link.source as PhysicsNode
    const target = link.target as PhysicsNode
    if (
      source.x === undefined ||
      source.y === undefined ||
      target.x === undefined ||
      target.y === undefined
    )
      continue

    const isHighlight =
      selectedEdgeId === link.id ||
      (hoveredId && (source.id === hoveredId || target.id === hoveredId)) ||
      (selectedId && (source.id === selectedId || target.id === selectedId))

    // 粗细按 weight 映射：weight 0.1~1.0 → 视觉宽度 0.5~4.0（保底 0.5 保证可见）
    const normalizedWeight = Math.max(link.weight, 0.1)
    const baseWidth = Math.max(0.5, 0.5 + (normalizedWeight - 0.3) * 5) // 0.3→0.5, 0.5→1.5, 0.7→2.5, 1.0→4.0
    const lineWidth = (isHighlight ? baseWidth * 1.8 : baseWidth) * widthScale

    // 透明度按 weight 映射（保底 0.2 保证可见）
    const baseOpacity = getEdgeOpacity(link, state)
    const weightOpacity = isHighlight ? 1 : Math.min(0.2 + normalizedWeight * 0.5, 0.9)
    ctx.globalAlpha = Math.max(baseOpacity * weightOpacity, 0.2)

    // 计算线段终点：停在 target 节点边缘（不穿过节点圆心）
    const dx = target.x - source.x
    const dy = target.y - source.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const unitX = dx / dist
    const unitY = dy / dist
    // 终点缩短到 target 节点半径外侧
    const endX = target.x - unitX * (target.radius + 1 * invK)
    const endY = target.y - unitY * (target.radius + 1 * invK)

    // 画线段
    const strokeColor = isHighlight
      ? COLORS.edgeHighlight
      : link.origin === 'ai_suggested'
        ? COLORS.edgeAiSuggested
        : COLORS.edgeDefault

    ctx.strokeStyle = strokeColor
    ctx.lineWidth = lineWidth

    if (link.origin === 'ai_suggested') {
      ctx.setLineDash([4 * invK, 4 * invK])
    }

    ctx.beginPath()
    ctx.moveTo(source.x, source.y)
    ctx.lineTo(endX, endY)
    ctx.stroke()

    if (link.origin === 'ai_suggested') {
      ctx.setLineDash([])
    }

    // 画箭头（三角形，指向 target）
    const arrowLen = arrowSize + lineWidth * 0.5
    const arrowWidth = arrowLen * 0.6
    ctx.fillStyle = strokeColor
    ctx.beginPath()
    ctx.moveTo(endX, endY)
    ctx.lineTo(
      endX - unitX * arrowLen + unitY * arrowWidth,
      endY - unitY * arrowLen - unitX * arrowWidth,
    )
    ctx.lineTo(
      endX - unitX * arrowLen - unitY * arrowWidth,
      endY - unitY * arrowLen + unitX * arrowWidth,
    )
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawLabels(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  zoom: number,
  invK: number,
  viewLeft: number,
  viewTop: number,
  viewRight: number,
  viewBottom: number,
) {
  const { nodes, summaryMinZoom } = state
  const fontSize = 12 * invK
  const summaryFontSize = 10 * invK
  // 提到循环外的常量
  const titleFont = `500 ${fontSize}px Inter, system-ui, sans-serif`
  const summaryFont = `400 ${summaryFontSize}px Inter, system-ui, sans-serif`
  const padX = 3 * invK
  const padXTotal = 6 * invK
  const padY = 1 * invK
  const padYTotal = 2 * invK
  const labelGap = 4 * invK
  const summaryGap = 2 * invK
  const showSummary = zoom >= summaryMinZoom
  // 视口裁剪 padding：粗略估计标签的最大半宽（< 200px 屏幕宽折合 200*invK 世界宽）
  // 比逐节点精确测要快，只要有重叠就绘制
  const cullPad = 200 * invK

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  for (const node of nodes) {
    if (node.x === undefined || node.y === undefined) continue
    // 视口裁剪：节点中心 + cullPad 完全在视口外则跳过
    if (
      node.x + cullPad < viewLeft ||
      node.x - cullPad > viewRight ||
      node.y + cullPad < viewTop ||
      node.y - cullPad > viewBottom
    ) {
      continue
    }
    const opacity = getNodeOpacity(node, state)
    if (opacity < 0.5) continue // 淡出的节点不绘制标签

    ctx.globalAlpha = Math.min(opacity, 1)

    const isHovered = node.id === state.hoveredId
    const isSelected = node.id === state.selectedId
    // hover/选中时半径放大，标签位置也跟随
    const displayRadius = isHovered ? node.radius * 1.25 : isSelected ? node.radius * 1.15 : node.radius

    // 标题
    ctx.font = titleFont
    const labelY = node.y + displayRadius + labelGap
    const textWidth = measureTextCached(ctx, node.title, fontSize)

    // 标签背景
    ctx.fillStyle = isHovered || isSelected ? 'rgba(250, 249, 245, 0.95)' : COLORS.labelBg
    ctx.fillRect(
      node.x - textWidth / 2 - padX,
      labelY - padY,
      textWidth + padXTotal,
      fontSize + padYTotal,
    )
    ctx.fillStyle = isHovered || isSelected ? '#141413' : COLORS.labelText
    ctx.font = isHovered || isSelected ? `600 ${fontSize}px Inter, system-ui, sans-serif` : titleFont
    ctx.fillText(node.title, node.x, labelY)

    // 摘要：hover 时由 HTML 卡片承载，canvas 只在非 hover 且缩放足够时绘制
    if (!isHovered && showSummary && node.summary) {
      const summary = truncate(node.summary, 40)
      ctx.font = summaryFont
      ctx.fillStyle = COLORS.summaryText
      ctx.fillText(summary, node.x, labelY + fontSize + summaryGap)
    }
  }
  ctx.globalAlpha = 1
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '…'
}

/** 按最大宽度将文本拆为多行（中文友好——逐字符检测） */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let currentLine = ''
  for (const char of text) {
    const testLine = currentLine + char
    if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine)
      currentLine = char
    } else {
      currentLine = testLine
    }
  }
  if (currentLine) lines.push(currentLine)
  return lines.length > 0 ? lines : [text]
}

/**
 * 在屏幕坐标 (sx, sy) 查找命中的节点（O(N)，节点数 < 1000 足够快）
 */
export function findNodeAtScreen(
  state: RenderState,
  transform: { x: number; y: number; k: number },
  sx: number,
  sy: number,
): PhysicsNode | null {
  // 屏幕坐标 → 世界坐标
  const wx = (sx - transform.x) / transform.k
  const wy = (sy - transform.y) / transform.k

  // 倒序遍历（绘制顺序后绘制的在上层）
  for (let i = state.nodes.length - 1; i >= 0; i--) {
    const node = state.nodes[i]
    if (!node || node.x === undefined || node.y === undefined) continue
    const dx = wx - node.x
    const dy = wy - node.y
    if (dx * dx + dy * dy <= node.radius * node.radius) {
      return node
    }
  }
  return null
}

/**
 * 在屏幕坐标 (sx, sy) 查找命中的边（基于点到线段距离）
 */
export function findEdgeAtScreen(
  state: RenderState,
  transform: { x: number; y: number; k: number },
  sx: number,
  sy: number,
  threshold = 10,
): PhysicsLink | null {
  const wx = (sx - transform.x) / transform.k
  const wy = (sy - transform.y) / transform.k
  // 命中阈值：至少 5 世界像素，保证细线也能点到
  const t = Math.max(threshold / transform.k, 5)

  for (const link of state.links) {
    const source = link.source as PhysicsNode
    const target = link.target as PhysicsNode
    if (
      source.x === undefined ||
      source.y === undefined ||
      target.x === undefined ||
      target.y === undefined
    )
      continue

    const dist = pointToSegmentDistance(wx, wy, source.x, source.y, target.x, target.y)
    if (dist <= t) return link
  }
  return null
}

function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  return Math.hypot(px - cx, py - cy)
}

/**
 * 设置 Canvas 的 DPR（解决 retina 屏模糊问题）
 */
export function setupCanvasDpr(canvas: HTMLCanvasElement, width: number, height: number): number {
  const dpr = window.devicePixelRatio || 1
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  return dpr
}
