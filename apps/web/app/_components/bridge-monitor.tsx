'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, FileText, Clock, CheckCircle2, XCircle, Archive, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BridgeFile {
  name: string
  status: 'pending' | 'done' | 'cancelled' | 'archive'
  modifiedAt: string
  taskId: string
}

interface BridgeStatus {
  bridgeDir: string
  pending: BridgeFile[]
  done: BridgeFile[]
  cancelled: BridgeFile[]
  archive: BridgeFile[]
}

const STATUS_CONFIG = {
  pending: { icon: Clock, color: 'var(--clay-warning)', label: '处理中' },
  done: { icon: CheckCircle2, color: 'var(--clay-success)', label: '已完成' },
  cancelled: { icon: XCircle, color: 'var(--clay-error)', label: '已取消' },
  archive: { icon: Archive, color: 'var(--clay-muted)', label: '已归档' },
} as const

export function BridgeMonitor() {
  const [status, setStatus] = useState<BridgeStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bridge/status')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setStatus(json.data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-[13px]" style={{ color: 'var(--clay-muted)' }}>
          Bridge 目录未配置或不可访问
        </p>
        <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={loadStatus}>
          <RefreshCw className="mr-1 h-3 w-3" /> 重试
        </Button>
      </div>
    )
  }

  if (loading && !status) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--clay-muted)' }} />
        <span className="text-[13px]" style={{ color: 'var(--clay-muted)' }}>加载中…</span>
      </div>
    )
  }

  if (!status) return null

  const allFiles = [
    ...status.pending.map((f) => ({ ...f, status: 'pending' as const })),
    ...status.done.map((f) => ({ ...f, status: 'done' as const })),
    ...status.cancelled.map((f) => ({ ...f, status: 'cancelled' as const })),
  ]

  // 按修改时间倒序
  allFiles.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())

  return (
    <div className="space-y-3">
      {/* 概览统计 */}
      <div className="flex items-center gap-4 text-[12px]">
        {(['pending', 'done', 'cancelled', 'archive'] as const).map((key) => {
          const config = STATUS_CONFIG[key]
          const count = status[key].length
          const Icon = config.icon
          return (
            <div key={key} className="flex items-center gap-1">
              <Icon className="h-3 w-3" style={{ color: config.color }} />
              <span style={{ color: count > 0 ? config.color : 'var(--clay-muted)' }}>
                {count} {config.label}
              </span>
            </div>
          )
        })}
        <Button size="sm" variant="ghost" className="h-6 px-1.5 ml-auto" onClick={loadStatus} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* 任务列表 */}
      {allFiles.length === 0 ? (
        <p className="text-[12px]" style={{ color: 'var(--clay-muted)' }}>暂无桥接任务</p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {allFiles.slice(0, 10).map((file) => {
            const config = STATUS_CONFIG[file.status]
            const Icon = config.icon
            return (
              <div
                key={`${file.status}-${file.name}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded"
                style={{ background: 'var(--clay-surface-soft)' }}
              >
                <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: config.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] truncate" style={{ color: 'var(--clay-ink)' }}>
                    {file.taskId || file.name}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--clay-muted)' }}>
                    {new Date(file.modifiedAt).toLocaleDateString('zh-CN', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: `color-mix(in oklch, ${config.color} 15%, transparent)`, color: config.color }}
                >
                  {config.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Bridge 目录路径 */}
      <p className="text-[10px] truncate" style={{ color: 'var(--clay-muted)' }}>
        📁 {status.bridgeDir}
      </p>
    </div>
  )
}
