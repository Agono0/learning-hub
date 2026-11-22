'use client'

/**
 * Mind Map Visual Editor & Flashcard Generator (Milestone 8).
 *
 * Interactive visual concept mapping with SVG radial layout, markdown outline
 * synchronization, and automatic flashcard extraction into spaced-repetition decks.
 */
import { useEffect, useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Network, Plus, Sparkles, FileText, Trash2, Save, Move3d, Layers } from 'lucide-react'
import { parseMarkdownOutline, type MindmapData, type MindmapNode } from '@learning-hub/core/visual'
import { apiGet, apiSend } from '@/lib/transport'
import { InteractiveMindmapStudio } from '@/components/InteractiveMindmapStudio'
import { Button, Callout, IconButton, PageHeader, Panel, Skeleton } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { queryKeys } from '@/lib/query-keys'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useGsapReveal } from '@/lib/useGsapReveal'

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
  const [studioMode, setStudioMode] = useState<'studio' | 'classic'>('studio')
  const [viewMode, setViewMode] = useState<'visual' | 'outline'>('visual')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [exportResult, setExportResult] = useState<string | null>(null)
  // Mindmap id awaiting destructive confirmation (AlertDialog) — null = none.
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  // Fetch mindmaps
  const mindmaps = useQuery<{ ok: boolean; mindmaps: MindmapRow[] }>({
    queryKey: ['mindmaps'],
    queryFn: () => apiGet('/api/mindmaps'),
  })
  const mindmapsData = mindmaps.data

  // Fetch decks for export target
  const { data: decksData } = useQuery<{ decks: DeckRow[] }>({
    queryKey: queryKeys.decks,
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
      // Guarded parse — same contract as handleSelectMindmap below: a corrupt
      // row (e.g. from a hand-edited backup) opens empty instead of crashing
      // the page on load.
      let nodes: MindmapNode[] = []
      try {
        const parsed: unknown = JSON.parse(first.nodesJson)
        if (Array.isArray(parsed)) nodes = parsed as MindmapNode[]
      } catch {
        /* corrupt map: open it empty rather than crash the page */
      }
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
        return apiSend<{ ok: boolean; mindmap?: MindmapRow }>(
          `/api/mindmaps/${selectedId}`,
          'PUT',
          payload,
        )
      } else {
        return apiSend<{ ok: boolean; mindmap: MindmapRow }>('/api/mindmaps', 'POST', payload)
      }
    },
    onSuccess: (res) => {
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
      return apiSend<{ ok: boolean; importedCount: number; skippedCount?: number }>(
        `/api/mindmaps/${selectedId}/cards`,
        'POST',
        { deckId: selectedDeckId },
      )
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: queryKeys.decks })
      const skipped = res.skippedCount
        ? ` (${res.skippedCount} already in this deck were kept as-is)`
        : ''
      setExportResult(
        res.importedCount > 0 || !skipped
          ? `Created ${res.importedCount} flashcards in your deck${skipped}.`
          : `No new cards — all ${res.skippedCount} are already in this deck.`,
      )
    },
    onError: (err) => {
      setExportResult(err instanceof Error ? err.message : 'Export failed')
    },
  })

  const handleSelectMindmap = (row: MindmapRow) => {
    setSelectedId(row.id)
    setTitle(row.title)
    let nodes: MindmapNode[] = []
    try {
      const parsed: unknown = JSON.parse(row.nodesJson)
      if (Array.isArray(parsed)) nodes = parsed as MindmapNode[]
    } catch {
      /* corrupt map: open it empty rather than crash the page */
    }
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

  // GSAP reveal (per-page motion mandate): the studio-mode toggle bar rises in
  // on scroll — motionOK-gated; SSR/tests keep the static content.
  const modeToggleRef = useGsapReveal<HTMLDivElement>()

  if (mindmaps.isError) {
    return (
      <ClayIn as="div" className="space-y-5">
        <PageHeader
          title="Mind Maps"
          subtitle="Visualize concept structures, explore knowledge hierarchies, and generate flashcards directly into your review queue."
        />
        <Callout tone="danger" title="Couldn't load mind maps">
          <div className="mt-1 flex items-center gap-3">
            <span>{(mindmaps.error as Error).message}</span>
            <Button variant="secondary" onClick={() => void mindmaps.refetch()}>
              Try again
            </Button>
          </div>
        </Callout>
      </ClayIn>
    )
  }

  return (
    <ClayIn as="div" className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
                  <Sparkles className="mr-1.5 h-4 w-4 text-status-warning-text" />
                  Generate Cards
                </Button>
              )}
            </div>
          }
        />
      </div>

      <div ref={modeToggleRef} className="flex items-center justify-end">
        <div className="flex items-center gap-1 rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-1 text-xs">
          <button
            type="button"
            onClick={() => setStudioMode('studio')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-colors [@media(pointer:coarse)]:min-h-11 ${
              studioMode === 'studio'
                ? 'bg-hub-accent/10 text-hub-accent ring-2 ring-(--ac-strong)'
                : 'text-faint hover:text-body'
            }`}
          >
            <Move3d className="h-3.5 w-3.5" />
            <span>Interactive Studio</span>
          </button>
          <button
            type="button"
            onClick={() => setStudioMode('classic')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-colors [@media(pointer:coarse)]:min-h-11 ${
              studioMode === 'classic'
                ? 'bg-hub-accent/10 text-hub-accent ring-2 ring-(--ac-strong)'
                : 'text-faint hover:text-body'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Classic Editor</span>
          </button>
        </div>
      </div>

      {studioMode === 'studio' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-(--hub-border) bg-(--hub-panel-2) px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-faint">
                Selected Map:
              </span>
              <select
                value={selectedId ?? ''}
                onChange={(e) => {
                  const id = Number(e.target.value)
                  const map = mindmapsData?.mindmaps?.find((m) => m.id === id)
                  if (map) handleSelectMindmap(map)
                  else handleNew()
                }}
                className="rounded-lg border border-(--hub-border) bg-(--hub-panel-2) px-3 py-1.5 text-xs text-secondary"
              >
                <option value="">(New Draft Map)</option>
                {mindmapsData?.mindmaps?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={handleNew}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New
              </Button>
              {selectedId && (
                <Button
                  variant="ghost"
                  onClick={() => setConfirmDeleteId(selectedId)}
                  className="text-danger-text hover:text-danger-text"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete
                </Button>
              )}
            </div>
          </div>

          <InteractiveMindmapStudio
            key={`${selectedId ?? 'new'}-${title}`}
            initialTitle={title}
            initialMarkdown={markdown}
            onSaveMindmap={({ title: newTitle, markdown: newMd, nodes }) => {
              setTitle(newTitle)
              setMarkdown(newMd)
              const payload = {
                title: newTitle.trim() || 'Untitled Mind Map',
                nodesJson: JSON.stringify(nodes),
                edgesJson: JSON.stringify([]),
              }
              if (selectedId) {
                void apiSend(`/api/mindmaps/${selectedId}`, 'PUT', payload).then(() => {
                  void qc.invalidateQueries({ queryKey: ['mindmaps'] })
                })
              } else {
                void apiSend<{ ok: boolean; mindmap: MindmapRow }>(
                  '/api/mindmaps',
                  'POST',
                  payload,
                ).then((res) => {
                  void qc.invalidateQueries({ queryKey: ['mindmaps'] })
                  if (res?.mindmap?.id) setSelectedId(res.mindmap.id)
                })
              }
            }}
            onExportCards={(_cards) => {
              setExportResult(null)
              setIsExportModalOpen(true)
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Saved Mindmaps Sidebar */}
          <Panel className="lg:col-span-1 p-3 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-faint px-2 py-1">
              Saved Maps ({mindmapsData?.mindmaps?.length ?? 0})
            </div>

            <div className="space-y-1">
              {mindmaps.isPending &&
                Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-8 w-full" aria-hidden />
                ))}
              {mindmapsData?.mindmaps?.map((m) => {
                const isSelected = m.id === selectedId
                return (
                  <div
                    key={m.id}
                    onClick={() => handleSelectMindmap(m)}
                    className={`group flex items-center justify-between rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-600/20 text-indigo-300 font-medium border border-indigo-500/30'
                        : 'text-faint hover:bg-(--hub-panel-2) hover:text-body'
                    }`}
                  >
                    <span className="truncate flex-1">{m.title}</span>
                    <IconButton
                      label="Delete map"
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDeleteId(m.id)
                      }}
                      className="hover:text-danger-text"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                )
              })}

              {(!mindmapsData?.mindmaps || mindmapsData.mindmaps.length === 0) && (
                <p className="px-2 py-4 text-xs text-tertiary">No saved mind maps yet.</p>
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

                <div className="flex items-center gap-1 rounded-lg bg-(--hub-panel-2) p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode('visual')}
                    className={`flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors [@media(pointer:coarse)]:min-h-11 ${
                      viewMode === 'visual'
                        ? 'bg-hub-accent/10 text-hub-accent ring-2 ring-(--ac-strong) font-medium'
                        : 'text-faint hover:text-body'
                    }`}
                  >
                    <Network className="h-3.5 w-3.5" />
                    Visual Graph
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('outline')}
                    className={`flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors [@media(pointer:coarse)]:min-h-11 ${
                      viewMode === 'outline'
                        ? 'bg-hub-accent/10 text-hub-accent ring-2 ring-(--ac-strong) font-medium'
                        : 'text-faint hover:text-body'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Outline Markdown
                  </button>
                </div>
              </div>

              {viewMode === 'outline' ? (
                <div className="space-y-2">
                  <p className="text-xs text-tertiary">
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
                /* The graph canvas is a deliberately dark, isolated surface
                   (SVG node fills/text are hardcoded for dark bg) — scoping
                   the `dark` class keeps token-based children correct. */
                <div className="dark relative h-[540px] w-full overflow-hidden rounded-xl border border-(--hub-border) bg-[#0e0e11]">
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
                          className="hover:stroke-indigo-400"
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

                  <div className="absolute bottom-3 right-3 rounded bg-(--hub-panel-2) px-2.5 py-1 text-xs text-tertiary border border-(--hub-border)">
                    {mindmap.nodes.length} nodes · Radial layout
                  </div>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* Export to Deck Modal */}
      <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
        <DialogContent>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="h-5 w-5 text-status-warning-text" />
            Generate Flashcards
          </DialogTitle>
          <DialogDescription className="text-xs text-faint">
            Extract high-yield definition cards and subtopic recall cards directly into one of your
            spaced repetition decks.
          </DialogDescription>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-secondary block">
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
                  ? 'bg-emerald-500/10 text-status-success-text border border-emerald-500/30'
                  : 'bg-rose-500/10 text-danger-text border border-rose-500/30'
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
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this mind map?</AlertDialogTitle>
            <AlertDialogDescription>
              The map and its nodes are permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep map</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmDeleteId !== null) deleteMutation.mutate(confirmDeleteId)
                setConfirmDeleteId(null)
              }}
            >
              Delete map
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ClayIn>
  )
}
