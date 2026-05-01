'use client'

import { useEffect, useRef } from 'react'
import type { PhysicsNode } from '@/lib/graph/physics'

interface GraphMinimapProps {
  /** 引用主 simulation 的当前节点位置 */
  getNodes: () => PhysicsNode[]
  /** 主画布尺寸 */
  mainSize: { width: number; height: number }
  /** 主画布的 zoom transform */
  getTransform: () => { x: number; y: number; k: number }
  /** 点击/拖拽小地图改变主视图 */
  onPanTo?: (worldX: number, worldY: number) => void
  /** 小地图尺寸 */
  width?: number
  height?: number
  /**
   * 重绘节流的最小间隔（ms）。默认 100ms（即 10fps）。
   * 小地图只用于俯瞰，不需要 60fps；过高会和主画布抢 CPU。
   */
  minRedrawIntervalMs?: number
}

const COLORS = {
  bg: 'rgba(20, 20, 19, 0.85)',
  node: '#5db8a6',
  viewport: 'rgba(204, 120, 92, 0.85)',
  viewportFill: 'rgba(204, 120, 92, 0.12)',
}

export function GraphMinimap({
  getNodes,
  mainSize,
  getTransform,
  onPanTo,
  width = 180,
  height = 120,
  minRedrawIntervalMs = 100,
}: GraphMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const nodes = getNodes()
      // 计算节点 bbox
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const n of nodes) {
        if (n.x === undefined || n.y === undefined) continue
        minX = Math.min(minX, n.x)
        minY = Math.min(minY, n.y)
        maxX = Math.max(maxX, n.x)
        maxY = Math.max(maxY, n.y)
      }
      // 加 padding 以包含主视口
      const transform = getTransform()
      const viewLeft = -transform.x / transform.k
      const viewTop = -transform.y / transform.k
      const viewRight = viewLeft + mainSize.width / transform.k
      const viewBottom = viewTop + mainSize.height / transform.k
      minX = Math.min(minX, viewLeft)
      minY = Math.min(minY, viewTop)
      maxX = Math.max(maxX, viewRight)
      maxY = Math.max(maxY, viewBottom)

      if (!isFinite(minX)) {
        minX = 0
        minY = 0
        maxX = mainSize.width
        maxY = mainSize.height
      }

      const padding = 20
      minX -= padding
      minY -= padding
      maxX += padding
      maxY += padding

      const worldW = Math.max(maxX - minX, 1)
      const worldH = Math.max(maxY - minY, 1)
      // 等比缩放
      const scale = Math.min(width / worldW, height / worldH)
      const offsetX = (width - worldW * scale) / 2 - minX * scale
      const offsetY = (height - worldH * scale) / 2 - minY * scale

      // 清空 + 背景
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = COLORS.bg
      ctx.fillRect(0, 0, width, height)

      // 绘制节点（小圆点）
      ctx.fillStyle = COLORS.node
      for (const n of nodes) {
        if (n.x === undefined || n.y === undefined) continue
        const x = n.x * scale + offsetX
        const y = n.y * scale + offsetY
        ctx.beginPath()
        ctx.arc(x, y, Math.max(1.2, Math.sqrt(n.degree) * 0.6), 0, Math.PI * 2)
        ctx.fill()
      }

      // 绘制视口框
      const vx = viewLeft * scale + offsetX
      const vy = viewTop * scale + offsetY
      const vw = (mainSize.width / transform.k) * scale
      const vh = (mainSize.height / transform.k) * scale
      ctx.fillStyle = COLORS.viewportFill
      ctx.fillRect(vx, vy, vw, vh)
      ctx.strokeStyle = COLORS.viewport
      ctx.lineWidth = 1.5
      ctx.strokeRect(vx, vy, vw, vh)

      // 暴露反向变换给 click 处理
      currentMappingRef.current = { scale, offsetX, offsetY }
    }

    // 用 rAF 自循环 + 时间节流替代 setInterval：
    // - 不和主画布抢 setInterval/setTimeout 的事件队列
    // - 浏览器在标签页隐藏时会自动暂停 rAF，省 CPU
    // - 拖拽时立即重绘以提供即时反馈，否则按 minRedrawIntervalMs 节流
    let rafId = 0
    let lastDrawAt = 0
    const tick = (now: number) => {
      const interval = draggingRef.current ? 16 : minRedrawIntervalMs
      if (now - lastDrawAt >= interval) {
        draw()
        lastDrawAt = now
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [getNodes, getTransform, mainSize.width, mainSize.height, width, height, minRedrawIntervalMs])

  const currentMappingRef = useRef<{ scale: number; offsetX: number; offsetY: number } | null>(null)

  const handleMouseEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPanTo) return
    const m = currentMappingRef.current
    if (!m) return
    const rect = e.currentTarget.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    // 屏幕坐标 → 世界坐标
    const wx = (sx - m.offsetX) / m.scale
    const wy = (sy - m.offsetY) / m.scale
    onPanTo(wx, wy)
  }

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={(e) => {
        draggingRef.current = true
        handleMouseEvent(e)
      }}
      onMouseMove={(e) => {
        if (draggingRef.current) handleMouseEvent(e)
      }}
      onMouseUp={() => {
        draggingRef.current = false
      }}
      onMouseLeave={() => {
        draggingRef.current = false
      }}
      className="rounded-[var(--radius-md)] cursor-pointer"
      style={{
        border: '1px solid var(--clay-hairline)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      }}
    />
  )
}
