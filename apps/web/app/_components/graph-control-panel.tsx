'use client'

import { useState } from 'react'
import { Settings, RotateCcw, X } from 'lucide-react'
import { useGraphViewStore } from '@/lib/store/graph-view-store'

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
  hint?: string
}

function SliderRow({ label, value, min, max, step, onChange, format, hint }: SliderRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-caption">
        <span style={{ color: 'var(--clay-body)' }}>{label}</span>
        <span className="font-mono text-[11px]" style={{ color: 'var(--clay-muted)' }}>
          {format ? format(value) : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--clay-primary)]"
      />
      {hint && (
        <p className="text-[10px]" style={{ color: 'var(--clay-muted)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

function ToggleRow({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <div className="text-caption" style={{ color: 'var(--clay-body)' }}>
          {label}
        </div>
        {hint && (
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--clay-muted)' }}>
            {hint}
          </p>
        )}
      </div>
      <button
        onClick={() => onChange(!value)}
        className="relative shrink-0 mt-0.5 w-9 h-5 rounded-full transition-colors"
        style={{
          background: value ? 'var(--clay-primary)' : 'var(--clay-hairline)',
        }}
        aria-pressed={value}
      >
        <div
          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
          style={{ transform: value ? 'translateX(16px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  )
}

export function GraphControlPanel() {
  const [open, setOpen] = useState(false)
  const {
    physics,
    labelMinZoom,
    summaryMinZoom,
    linkWidthMultiplier,
    enableCommunityColor,
    updatePhysics,
    updateView,
    resetAll,
  } = useGraphViewStore()

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute top-4 right-4 z-10 p-2 rounded-[var(--radius-md)] transition-all hover:scale-105"
        style={{
          background: 'var(--clay-surface-card)',
          color: 'var(--clay-body)',
          border: '1px solid var(--clay-hairline)',
        }}
        title="图谱设置"
      >
        <Settings className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div
      className="absolute top-4 right-4 z-20 w-[280px] rounded-[var(--radius-lg)] shadow-lg overflow-hidden"
      style={{
        background: 'var(--clay-surface-card)',
        border: '1px solid var(--clay-hairline)',
        maxHeight: 'calc(100vh - 120px)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--clay-hairline)' }}
      >
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" style={{ color: 'var(--clay-primary)' }} />
          <span className="text-title-sm font-medium" style={{ color: 'var(--clay-ink)' }}>
            图谱设置
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={resetAll}
            className="p-1.5 rounded hover:bg-[var(--clay-hairline)] transition-colors"
            title="恢复默认"
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
      <div className="px-4 py-3 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {/* 物理引擎 */}
        <section className="space-y-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--clay-muted)' }}>
            物理引擎
          </h4>
          <SliderRow
            label="排斥力"
            value={Math.abs(physics.chargeStrength)}
            min={50}
            max={1000}
            step={10}
            onChange={(v) => updatePhysics({ chargeStrength: -v })}
            format={(v) => `-${v.toFixed(0)}`}
            hint="数值越大节点越分散"
          />
          <SliderRow
            label="边长"
            value={physics.linkBaseDistance}
            min={30}
            max={250}
            step={5}
            onChange={(v) => updatePhysics({ linkBaseDistance: v })}
            format={(v) => `${v.toFixed(0)}px`}
            hint="实际长度按 weight 反比缩放"
          />
          <SliderRow
            label="边弹性"
            value={physics.linkStrength}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(v) => updatePhysics({ linkStrength: v })}
          />
          <SliderRow
            label="中心引力"
            value={physics.centerStrength}
            min={0}
            max={0.5}
            step={0.01}
            onChange={(v) => updatePhysics({ centerStrength: v })}
            hint="向画布中心聚拢的强度"
          />
          <SliderRow
            label="漂浮持续度"
            value={1 - physics.alphaDecay * 50}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => updatePhysics({ alphaDecay: (1 - v) / 50 })}
            hint="越大节点越持续漂浮"
          />
          <SliderRow
            label="速度衰减"
            value={physics.velocityDecay}
            min={0.1}
            max={0.9}
            step={0.05}
            onChange={(v) => updatePhysics({ velocityDecay: v })}
            hint="越小运动越流畅"
          />
        </section>

        {/* 视觉 */}
        <section className="space-y-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--clay-muted)' }}>
            视觉
          </h4>
          <SliderRow
            label="边宽倍数"
            value={linkWidthMultiplier}
            min={0.5}
            max={3}
            step={0.1}
            onChange={(v) => updateView({ linkWidthMultiplier: v })}
            format={(v) => `${v.toFixed(1)}x`}
          />
          <SliderRow
            label="标签显示阈值"
            value={labelMinZoom}
            min={0.1}
            max={2}
            step={0.05}
            onChange={(v) => updateView({ labelMinZoom: v })}
            hint="缩放级别 ≥ 此值才显示标题"
          />
          <SliderRow
            label="摘要显示阈值"
            value={summaryMinZoom}
            min={0.5}
            max={3}
            step={0.05}
            onChange={(v) => updateView({ summaryMinZoom: v })}
            hint="缩放级别 ≥ 此值才显示摘要"
          />
        </section>

        {/* 选项 */}
        <section className="space-y-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--clay-muted)' }}>
            其他
          </h4>
          <ToggleRow
            label="社区聚类着色"
            value={enableCommunityColor}
            onChange={(v) => updateView({ enableCommunityColor: v })}
            hint="基于 Louvain 算法自动分群着色"
          />

        </section>
      </div>
    </div>
  )
}
