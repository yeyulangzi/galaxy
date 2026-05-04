'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RefreshCw, Undo2 } from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'

interface OperationLog {
  id: string
  operation: string
  affected_ids: string[] | string
  payload_snapshot: unknown
  user_note: string | null
  is_undone: boolean
  undone_at: string | null
  created_at: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 操作类型 → 中文标签 + 颜色 */
const OPERATION_LABELS: Record<string, { label: string; color: string }> = {
  create_node: { label: '创建节点', color: 'var(--clay-success)' },
  confirm_update_node: { label: '修改节点', color: 'var(--clay-info)' },
  confirm_delete_node: { label: '删除节点', color: 'var(--clay-error)' },
  create_edge: { label: '创建边', color: 'var(--clay-success)' },
  confirm_delete_edge: { label: '删除边', color: 'var(--clay-error)' },
  confirm_edges: { label: '确认边', color: 'var(--clay-info)' },
  create_aspect: { label: '创建切面', color: 'var(--clay-success)' },
  update_aspect: { label: '更新切面', color: 'var(--clay-info)' },
  confirm_delete_aspect: { label: '删除切面', color: 'var(--clay-error)' },
  create_attachment: { label: '添加文档', color: 'var(--clay-success)' },
  delete_attachment: { label: '删除文档', color: 'var(--clay-error)' },
  extract_aspects: { label: 'AI 提取', color: 'var(--clay-accent)' },
  import_data: { label: '导入数据', color: 'var(--clay-info)' },
  feed_content: { label: '投喂内容', color: 'var(--clay-accent)' },
  save_thought_version: { label: '保存思考', color: 'var(--clay-muted)' },
  merge_nodes: { label: '合并节点', color: 'var(--clay-warning)' },
  batch_accept: { label: '批量接受', color: 'var(--clay-success)' },
  batch_reject: { label: '批量拒绝', color: 'var(--clay-error)' },
  confirm_reject: { label: '拒绝建议', color: 'var(--clay-error)' },
}

function getOperationInfo(operation: string) {
  // 精确匹配
  if (OPERATION_LABELS[operation]) return OPERATION_LABELS[operation]
  // confirm_accept_xxx / confirm_accept_modified_xxx 等
  if (operation.startsWith('confirm_accept')) return { label: '确认建议', color: 'var(--clay-success)' }
  return { label: operation, color: 'var(--clay-muted)' }
}

function formatTime(isoString: string) {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)

  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) return `${diffHour} 小时前`

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function OperationLogViewer({ open, onOpenChange }: Props) {
  const [logs, setLogs] = useState<OperationLog[]>([])
  const [loading, setLoading] = useState(false)
  const [undoing, setUndoing] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/data/undo')
      const json = await res.json() as { data: OperationLog[] }
      setLogs(json.data ?? [])
    } catch {
      // 静默失败
    } finally {
      setLoading(false)
    }
  }, [])

  // 打开弹窗时加载日志，并启动轮询
  useEffect(() => {
    if (open) {
      fetchLogs()
      intervalRef.current = setInterval(fetchLogs, 5000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [open, fetchLogs])

  // 新日志滚动到顶部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [logs.length])

  const handleUndo = async (logId: string) => {
    setUndoing(logId)
    try {
      await api.undoOperation(logId)
      toast.success('撤销成功')
      await fetchLogs()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '撤销失败')
    } finally {
      setUndoing(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            操作日志
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchLogs}
              disabled={loading}
              className="h-6 w-6 p-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <span className="text-xs font-normal" style={{ color: 'var(--clay-muted)' }}>
              {logs.length} 条记录 · 每 5s 刷新
            </span>
          </DialogTitle>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto -mx-6 px-6"
          style={{ maxHeight: 'calc(80vh - 100px)' }}
        >
          {logs.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--clay-muted)' }}>
              暂无操作记录
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => {
                const info = getOperationInfo(log.operation)
                const canUndo = !!log.payload_snapshot && !log.is_undone
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 py-2 px-2 rounded-md hover:bg-accent/50 transition-colors"
                    style={{ opacity: log.is_undone ? 0.5 : 1 }}
                  >
                    {/* 时间线圆点 */}
                    <div className="mt-1.5 flex-shrink-0">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: info.color }}
                      />
                    </div>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-medium px-1.5 py-0.5 rounded"
                          style={{
                            color: info.color,
                            backgroundColor: `color-mix(in srgb, ${info.color} 10%, transparent)`,
                          }}
                        >
                          {info.label}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--clay-muted)' }}>
                          {formatTime(log.created_at)}
                        </span>
                        {log.is_undone && (
                          <span className="text-xs px-1 rounded" style={{ color: 'var(--clay-muted)', border: '1px solid var(--clay-hairline)' }}>
                            已撤销
                          </span>
                        )}
                      </div>
                      <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--clay-ink)' }}>
                        {log.user_note || log.operation}
                      </p>
                    </div>

                    {/* 撤销按钮 */}
                    {canUndo && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 flex-shrink-0"
                        disabled={undoing === log.id}
                        onClick={() => handleUndo(log.id)}
                      >
                        <Undo2 className="h-3.5 w-3.5 mr-1" />
                        <span className="text-xs">撤销</span>
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
