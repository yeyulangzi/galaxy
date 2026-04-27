'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useGraphStore } from '@/lib/store/graph-store'

const GraphCanvas = dynamic(
  () => import('./_components/graph-canvas').then((m) => m.GraphCanvas),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-muted" /> },
)
const NodeDetailPanel = dynamic(
  () => import('./_components/node-detail-panel').then((m) => m.NodeDetailPanel),
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

export default function Page() {
  const { nodes, edges, loadAll, selectNode, addEdge } = useGraphStore()

  const handleCreateEdge = useCallback(
    async (sourceId: string, targetId: string) => {
      try {
        await addEdge({ source_node_id: sourceId, target_node_id: targetId, relation_type: 'related', weight: 1 })
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

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h1 className="text-lg font-semibold">Galaxy</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPaletteOpen(true)}>
            <Search className="mr-1 h-4 w-4" /> 搜索 (⌘K)
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> 新建节点
          </Button>
        </div>
      </header>
      <div className="relative flex-1">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          onSelectNode={selectNode}
          onCreateEdge={handleCreateEdge}
        />
        <NodeDetailPanel />
      </div>
      <NewNodeDialog open={newOpen} onOpenChange={setNewOpen} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </main>
  )
}
