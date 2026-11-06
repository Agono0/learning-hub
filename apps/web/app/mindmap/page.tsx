'use client'

/**
 * Mind Map Visual Editor & Flashcard Generator (Milestone 8).
 *
 * Interactive visual concept mapping with SVG radial layout, markdown outline
 * synchronization, and automatic flashcard extraction into spaced-repetition decks.
 */
import { useEffect, useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Network, Plus, Sparkles, FileText, Trash2, Save } from 'lucide-react'
import { parseMarkdownOutline, type MindmapData, type MindmapNode } from '@learning-hub/core/visual'
import { apiGet, apiSend } from '@/lib/transport'
import { PageHeader, Panel, Button } from '@/ui'

interface MindmapRow {
  id: number
  title: string
  nodesJson: string
  edgesJson: string
  createdAt: string
  updatedAt: string
}

interface DeckRow {
  id: number
  name: string
  cardCount: number
}

const DEFAULT_MARKDOWN = `# Human Memory Architecture
- Sensory Memory
  - Iconic: Visual sensory buffer (<1s)
  - Echoic: Auditory sensory buffer (3-4s)
- Working Memory
  - Central Executive: Attention control
  - Phonological Loop: Verbal rehearsal
  - Visuospatial Sketchpad: Spatial imagery
- Long-Term Memory
  - Declarative (Explicit)
    - Semantic: Facts and concepts
    - Episodic: Personal events
  - Non-Declarative (Implicit)
    - Procedural: Motor skills`

export default function MindmapPage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [title, setTitle] = useState('New Mind Map')
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN)
  const [viewMode, setViewMode] = useState<'visual' | 'outline'>('visual')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [exportResult, setExportResult] = useState<string | null>(null)

  // Fetch mindmaps
  const { data: mindmapsData } = useQuery<{ ok: boolean; mindmaps: MindmapRow[] }>({
    queryKey: ['mindmaps'],
    queryFn: () => apiGet('/api/mindmaps'),
  })

  // Fetch decks for export target
  const { data: decksData } = useQuery<{ decks: DeckRow[] }>({
    queryKey: ['decks'],
    queryFn: () => apiGet('/api/decks'),
  })

  // Parse markdown into mindmap tree
  const mindmap = useMemo<MindmapData>(() => {
    try {
      const parsed = parseMarkdownOutline(markdown)
      if (title) parsed.title = title
      return parsed
    } catch {
      return { title, nodes: [] }
    }
  }, [markdown, title])

  // Select first mindmap or default
  useEffect(() => {
    if (mindmapsData?.mindmaps && mindmapsData.mindmaps.length > 0 && selectedId === null) {
      const first = mindmapsData.mindmaps[0]!
      setSelectedId(first.id)
      setTitle(first.title)
      const nodes = JSON.parse(first.nodesJson) as MindmapNode[]
      // Reconstruct simple markdown from nodes
      if (nodes.length > 0) {
        let md = `# ${first.title}\n`
        for (const n of nodes) {
          if (n.parentId === 'root') {
            md += `- ${n.text}\n`
          } else if (n.parentId) {
            md += `  - ${n.text}\n`
          }
        }
        setMarkdown(md)
      }
    }
  }, [mindmapsData, selectedId])

  // Save mindmap
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim() || 'Untitled Mind Map',
        nodesJson: JSON.stringify(mindmap.nodes),
        edgesJson: JSON.stringify(mindmap.edges ?? []),
      }
      if (selectedId) {
        return apiSend(`/api/mindmaps/${selectedId}`, 'PUT', payload)
      } else {
        return apiSend<{ ok: boolean; mindmap: MindmapRow }>('/api/mindmaps', 'POST', payload)
      }
    },
    onSuccess: (res: any) => {
      void qc.invalidateQueries({ queryKey: ['mindmaps'] })
      if (res?.mindmap?.id) {
        setSelectedId(res.mindmap.id)
      }
    },
  })

  // Delete mindmap
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiSend(`/api/mindmaps/${id}`, 'DELETE'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mindmaps'] })
      setSelectedId(null)
      setTitle('New Mind Map')
      setMarkdown(DEFAULT_MARKDOWN)
    },
  })

  // Generate flashcards into deck
  const exportCardsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !selectedDeckId) throw new Error('Select a deck')
      return apiSend<{ ok: boolean; importedCount: number }>(
        `/api/mindmaps/${selectedId}/cards`,
        'POST',
        { deckId: selectedDeckId },
      )
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['decks'] })
      setExportResult(`Successfully created ${res.importedCount} flashcards in your deck!`)
    },
    onError: (err) => {
      setExportResult(err instanceof Error ? err.message : 'Export failed')
    },
  })

  const handleSelectMindmap = (row: MindmapRow) => {
    setSelectedId(row.id)
    setTitle(row.title)
    const nodes = JSON.parse(row.nodesJson) as MindmapNode[]
    if (nodes.length > 0) {
      let md = `# ${row.title}\n`
      for (const n of nodes) {
        if (n.parentId === 'root') {
          md += `- ${n.text}\n`
        } else if (n.parentId) {
          md += `  - ${n.text}\n`
        }
      }
      setMarkdown(md)
    }
  }

  const handleNew = () => {
    setSelectedId(null)
    setTitle('New Concept Map')
    setMarkdown(DEFAULT_MARKDOWN)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mind Maps"
        subtitle="Visualize concept structures, explore knowledge hierarchies, and generate flashcards directly into your review queue."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleNew}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Map
            </Button>
            <Button
              variant="primary"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              <Save className="mr-1.5 h-4 w-4" />
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
            {selectedId && (
              <Button
                variant="primary"
                onClick={() => {
                  setExportResult(null)
                  setIsExportModalOpen(true)
                }}
              >
                <Sparkles className="mr-1.5 h-4 w-4 text-amber-300" />
                Generate Cards
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Saved Mindmaps Sidebar */}
        <Panel className="lg:col-span-1 p-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 px-2 py-1">
            Saved Maps ({mindmapsData?.mindmaps?.length ?? 0})
          </div>

          <div className="space-y-1">
            {mindmapsData?.mindmaps?.map((m) => {
              const isSelected = m.id === selectedId
              return (
                <div
                  key={m.id}
                  onClick={() => handleSelectMindmap(m)}
                  className={`group flex items-center justify-between rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-indigo-600/20 text-indigo-300 font-medium border border-indigo-500/30'
                      : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
                  }`}
                >
                  <span className="truncate flex-1">{m.title}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteMutation.mutate(m.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400"
                    title="Delete map"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}

            {(!mindmapsData?.mindmaps || mindmapsData.mindmaps.length === 0) && (
              <p className="px-2 py-4 text-xs text-neutral-500">No saved mind maps yet.</p>
            )}
          </div>
        </Panel>

        {/* Editor Main Canvas */}
        <div className="lg:col-span-3 space-y-4">
          <Panel className="p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Mind map title…"
                className="input text-base font-semibold max-w-sm"
              />

              <div className="flex items-center gap-1 rounded-lg bg-neutral-800/60 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('visual')}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${
                    viewMode === 'visual'
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Network className="h-3.5 w-3.5" />
                  Visual Graph
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('outline')}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${
                    viewMode === 'outline'
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Outline Markdown
                </button>
              </div>
            </div>

            {viewMode === 'outline' ? (
              <div className="space-y-2">
                <p className="text-xs text-neutral-500">
                  Write or paste your concepts in Markdown nested lists. Indent subtopics with 2
                  spaces.
                </p>
                <textarea
                  className="input min-h-[460px] font-mono text-xs leading-relaxed"
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                />
              </div>
            ) : (
              <div className="relative h-[540px] w-full overflow-hidden rounded-xl border border-neutral-800 bg-[#0e0e11]">
                <svg className="h-full w-full" viewBox="0 0 1000 800">
                  {/* Connecting Bezier Edges */}
                  {mindmap.edges?.map((edge) => {
                    const fromNode = mindmap.nodes.find((n) => n.id === edge.from)
                    const toNode = mindmap.nodes.find((n) => n.id === edge.to)
                    if (!fromNode || !toNode) return null

                    const d = `M ${fromNode.x} ${fromNode.y} Q ${(fromNode.x + toNode.x) / 2} ${
                      fromNode.y
                    } ${toNode.x} ${toNode.y}`

                    return (
                      <path
                        key={edge.id}
                        d={d}
                        fill="none"
                        stroke="#374151"
                        strokeWidth="2"
                        strokeDasharray="none"
                        className="transition-all hover:stroke-indigo-400"
                      />
                    )
                  })}

                  {/* Nodes */}
                  {mindmap.nodes.map((node) => {
                    const isRoot = node.id === 'root'
                    const isSelected = selectedNodeId === node.id

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        onClick={() => setSelectedNodeId(node.id)}
                        className="cursor-pointer transition-transform hover:scale-105"
                      >
                        <circle
                          r={isRoot ? 32 : 18}
                          fill={node.color || (isRoot ? '#6366f1' : '#3b82f6')}
                          stroke={isSelected ? '#ffffff' : '#1e1e24'}
                          strokeWidth={isSelected ? 3 : 2}
                          className="shadow-lg filter drop-shadow"
                        />
                        <text
                          textAnchor="middle"
                          dy={isRoot ? 4 : 3}
                          fontSize={isRoot ? '12' : '10'}
                          fontWeight="bold"
                          fill="#ffffff"
                          className="pointer-events-none select-none"
                        >
                          {isRoot ? 'ROOT' : '•'}
                        </text>
                        <text
                          textAnchor="middle"
                          dy={isRoot ? 48 : 30}
                          fontSize="11"
                          fill="#d1d5db"
                          className="pointer-events-none select-none font-medium"
                        >
                          {node.text.length > 28 ? `${node.text.slice(0, 26)}…` : node.text}
                        </text>
                      </g>
                    )
                  })}
                </svg>

                <div className="absolute bottom-3 right-3 rounded bg-neutral-900/90 px-2.5 py-1 text-[11px] text-neutral-400 border border-neutral-800">
                  {mindmap.nodes.length} nodes · Radial layout
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* Export to Deck Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-neutral-100 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" />
              Generate Flashcards
            </h3>
            <p className="text-xs text-neutral-400">
              Extract high-yield definition cards and subtopic recall cards directly into one of
              your spaced repetition decks.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-300 block">
                Select target deck:
              </label>
              <select
                className="input text-xs"
                value={selectedDeckId ?? ''}
                onChange={(e) => setSelectedDeckId(Number(e.target.value) || null)}
              >
                <option value="">-- Choose deck --</option>
                {decksData?.decks?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.cardCount} cards)
                  </option>
                ))}
              </select>
            </div>

            {exportResult && (
              <p
                className={`text-xs p-2 rounded-lg ${
                  exportResult.includes('Success')
                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                    : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                }`}
              >
                {exportResult}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setIsExportModalOpen(false)}>
                Close
              </Button>
              <Button
                variant="primary"
                disabled={!selectedDeckId || exportCardsMutation.isPending}
                onClick={() => exportCardsMutation.mutate()}
              >
                {exportCardsMutation.isPending ? 'Generating…' : 'Generate Cards'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
