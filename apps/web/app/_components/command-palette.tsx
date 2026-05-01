'use client'

import { useState } from 'react'
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[560px]">
        <Command label="节点搜索" className="flex flex-col">
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="模糊搜索节点标题 / 摘要 / 领域…"
            className="border-b border-border/30 px-4 py-3 outline-none clay-input"
          />
          <Command.List className="max-h-[360px] overflow-y-auto p-2">
            <Command.Empty className="px-4 py-6 text-center text-sm text-muted-foreground">
              没有匹配的节点
            </Command.Empty>
            {nodes.map((n) => (
              <Command.Item
                key={n.id}
                value={`${n.title} ${n.summary ?? ''} ${n.domain ?? ''}`}
                onSelect={() => {
                  selectNode(n.id)
                  onOpenChange(false)
                  setQuery('')
                }}
                className="flex cursor-pointer flex-col gap-0.5 rounded-xl px-3 py-2 text-sm aria-selected:bg-accent transition-colors"
              >
                <span className="font-medium">{n.title}</span>
                <div className="flex items-center gap-2">
                  {n.domain && (
                    <span className="text-xs text-muted-foreground">{n.domain}</span>
                  )}
                  {n.summary && (
                    <span className="text-xs text-muted-foreground/60 truncate max-w-[300px]">{n.summary}</span>
                  )}
                </div>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
