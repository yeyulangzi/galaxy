'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, GitCompare, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ThoughtVersion {
  id: string
  node_id: string
  content: string
  version_label: string | null
  saved_at: string
}

interface ThoughtDiffViewerProps {
  versions: ThoughtVersion[]
  currentContent: string
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  text: string
}

/**
 * 简单 LCS 行级 diff 算法
 */
function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')

  // LCS 表
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
      }
    }
  }

  // 回溯生成 diff
  const result: DiffLine[] = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'unchanged', text: oldLines[i - 1]! })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      result.unshift({ type: 'added', text: newLines[j - 1]! })
      j--
    } else if (i > 0) {
      result.unshift({ type: 'removed', text: oldLines[i - 1]! })
      i--
    }
  }

  return result
}

export function ThoughtDiffViewer({ versions, currentContent }: ThoughtDiffViewerProps) {
  const [selectedOldIdx, setSelectedOldIdx] = useState<number | null>(null)
  const [selectedNewIdx, setSelectedNewIdx] = useState<number | null>(null)
  const [showTimeline, setShowTimeline] = useState(true)

  // 按时间正序：最旧在前
  const sortedVersions = useMemo(() => {
    const all = [
      ...versions.map((v) => ({ ...v, isCurrent: false })),
      { id: '__current__', node_id: '', content: currentContent, version_label: '当前版本', saved_at: new Date().toISOString(), isCurrent: true },
    ]
    return all.sort((a, b) => new Date(a.saved_at).getTime() - new Date(b.saved_at).getTime())
  }, [versions, currentContent])

  const diffResult = useMemo(() => {
    if (selectedOldIdx === null || selectedNewIdx === null) return null
    const oldVersion = sortedVersions[selectedOldIdx]
    const newVersion = sortedVersions[selectedNewIdx]
    if (!oldVersion || !newVersion) return null
    return {
      diff: computeLineDiff(oldVersion.content, newVersion.content),
      oldLabel: oldVersion.version_label || formatDate(oldVersion.saved_at),
      newLabel: newVersion.version_label || formatDate(newVersion.saved_at),
    }
  }, [selectedOldIdx, selectedNewIdx, sortedVersions])

  if (sortedVersions.length < 2) {
    return (
      <p className="text-[13px] py-4 text-center" style={{ color: 'var(--clay-muted)' }}>
        至少需要 2 个版本才能进行对比
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── 知识演化时间线 ── */}
      {showTimeline && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" style={{ color: 'var(--clay-primary)' }} />
            <span className="text-[13px] font-medium" style={{ color: 'var(--clay-ink)' }}>知识演化时间线</span>
          </div>
          <div className="relative pl-4">
            {/* 时间线轴 */}
            <div className="absolute left-[7px] top-0 bottom-0 w-px" style={{ background: 'var(--clay-hairline)' }} />

            {sortedVersions.map((version, idx) => {
              const isSelected = idx === selectedOldIdx || idx === selectedNewIdx
              const label = version.version_label || `版本 ${idx + 1}`
              const wordCount = version.content.length

              return (
                <div
                  key={version.id}
                  className="relative flex items-start gap-3 pb-3 cursor-pointer group"
                  onClick={() => {
                    if (selectedOldIdx === null) {
                      setSelectedOldIdx(idx)
                    } else if (selectedNewIdx === null && idx !== selectedOldIdx) {
                      // 确保 old < new
                      if (idx < selectedOldIdx) {
                        setSelectedNewIdx(selectedOldIdx)
                        setSelectedOldIdx(idx)
                      } else {
                        setSelectedNewIdx(idx)
                      }
                    } else {
                      setSelectedOldIdx(idx)
                      setSelectedNewIdx(null)
                    }
                  }}
                >
                  {/* 时间线节点 */}
                  <div
                    className="relative z-10 w-3 h-3 rounded-full border-2 flex-shrink-0 mt-0.5 transition-all"
                    style={{
                      borderColor: isSelected ? 'var(--clay-primary)' : 'var(--clay-hairline)',
                      background: isSelected ? 'var(--clay-primary)' : 'var(--clay-canvas)',
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[12px] font-medium truncate"
                        style={{ color: isSelected ? 'var(--clay-primary)' : 'var(--clay-ink)' }}
                      >
                        {label}
                      </span>
                      {version.isCurrent && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ background: 'var(--clay-primary-alpha-10)', color: 'var(--clay-primary)' }}
                        >
                          当前
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--clay-muted)' }}>
                      <span>{formatDate(version.saved_at)}</span>
                      <span>·</span>
                      <span>{wordCount} 字</span>
                      {idx > 0 && (
                        <>
                          <span>·</span>
                          <span style={{ color: version.content.length > sortedVersions[idx - 1]!.content.length ? 'var(--clay-success)' : 'var(--clay-error)' }}>
                            {version.content.length > sortedVersions[idx - 1]!.content.length ? '+' : ''}
                            {version.content.length - sortedVersions[idx - 1]!.content.length} 字
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 选择提示 */}
          {selectedOldIdx !== null && selectedNewIdx === null && (
            <p className="text-[11px] pl-4" style={{ color: 'var(--clay-primary)' }}>
              已选择起始版本，请点击另一个版本进行对比
            </p>
          )}
        </div>
      )}

      {/* ── Diff 对比结果 ── */}
      {diffResult && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitCompare className="h-3.5 w-3.5" style={{ color: 'var(--clay-primary)' }} />
              <span className="text-[13px] font-medium" style={{ color: 'var(--clay-ink)' }}>
                版本对比
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span style={{ color: 'var(--clay-error)' }}>
                {diffResult.oldLabel}
              </span>
              <span style={{ color: 'var(--clay-muted)' }}>→</span>
              <span style={{ color: 'var(--clay-success)' }}>
                {diffResult.newLabel}
              </span>
            </div>
          </div>

          {/* Diff 统计 */}
          <div className="flex items-center gap-3 text-[11px]">
            <span style={{ color: 'var(--clay-success)' }}>
              +{diffResult.diff.filter((l) => l.type === 'added').length} 行
            </span>
            <span style={{ color: 'var(--clay-error)' }}>
              -{diffResult.diff.filter((l) => l.type === 'removed').length} 行
            </span>
            <span style={{ color: 'var(--clay-muted)' }}>
              {diffResult.diff.filter((l) => l.type === 'unchanged').length} 行未变
            </span>
          </div>

          {/* Diff 内容 */}
          <div
            className="text-[12px] font-mono max-h-[350px] overflow-y-auto rounded-md p-2"
            style={{
              background: 'var(--clay-surface-soft)',
              border: '1px solid var(--clay-hairline-soft)',
            }}
          >
            {diffResult.diff.map((line, idx) => (
              <div
                key={idx}
                className="px-2 py-0.5 whitespace-pre-wrap break-all"
                style={{
                  background:
                    line.type === 'added'
                      ? 'rgba(34, 197, 94, 0.08)'
                      : line.type === 'removed'
                        ? 'rgba(239, 68, 68, 0.08)'
                        : 'transparent',
                  color:
                    line.type === 'added'
                      ? 'var(--clay-success)'
                      : line.type === 'removed'
                        ? 'var(--clay-error)'
                        : 'var(--clay-body)',
                  borderLeft: `3px solid ${
                    line.type === 'added'
                      ? 'var(--clay-success)'
                      : line.type === 'removed'
                        ? 'var(--clay-error)'
                        : 'transparent'
                  }`,
                }}
              >
                <span className="select-none mr-2" style={{ color: 'var(--clay-muted)' }}>
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                {line.text || ' '}
              </div>
            ))}
          </div>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[12px]"
            onClick={() => {
              setSelectedOldIdx(null)
              setSelectedNewIdx(null)
            }}
          >
            清除对比
          </Button>
        </div>
      )}
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
