'use client'

import { useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useGraphStore } from '@/lib/store/graph-store'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const { nodes, selectNode } = useGraphStore()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return nodes.slice(0, 30)
    return nodes
      .filter((n) =>
        n.title.toLowerCase().includes(q) ||
        (n.summary?.toLowerCase().includes(q) ?? false) ||
        (n.domain?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 30)
  }, [nodes, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[560px]">
        <Command label="节点搜索" shouldFilter={false} className="flex flex-col">
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="搜索节点标题 / 摘要 / 领域…"
            className="border-b px-4 py-3 outline-none"
          />
          <Command.List className="max-h-[360px] overflow-y-auto p-2">
            <Command.Empty className="px-4 py-6 text-center text-sm text-muted-foreground">
              没有匹配的节点
            </Command.Empty>
            {filtered.map((n) => (
              <Command.Item
                key={n.id}
                value={n.id}
                onSelect={() => {
                  selectNode(n.id)
                  onOpenChange(false)
                }}
                className="flex cursor-pointer flex-col gap-0.5 rounded px-3 py-2 text-sm aria-selected:bg-accent"
              >
                <span className="font-medium">{n.title}</span>
                {n.domain && (
                  <span className="text-xs text-muted-foreground">{n.domain}</span>
                )}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
