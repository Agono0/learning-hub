'use client'

import React from 'react'

/**
 * Freeform canvas: absolute-positioned draggable note/card/excerpt cards +
 * an edges list, persisted as JSON via /api/canvas. Pointer-events based
 * dragging (no dependency needed).
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Trash2 } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Callout, EmptyState, IconButton, PageHeader, Skeleton } from '@/ui'
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
import { DualCodingAnalyzer } from '@/components/DualCodingAnalyzer'

interface CanvasItem {
  id: string
  kind: 'note' | 'card' | 'excerpt'
  text: string
  x: number
  y: number
  w: number
}
interface CanvasEdge {
  id: string
  from: string
  to: string
  label?: string
}
interface CanvasRow {
  id: number
  title: string
  items: CanvasItem[]
  edges: CanvasEdge[]
  updatedAt: string
}

export default function CanvasPage() {
  const qc = useQueryClient()
  const {
    data,
    isPending: listPending,
    isError: listFailed,
    refetch: refetchList,
  } = useQuery<{ canvases: CanvasRow[] }>({
    queryKey: ['canvases'],
    queryFn: () => apiGet<{ canvases: CanvasRow[] }>('/api/canvas'),
  })
  const [activeId, setActiveId] = useState<number | null>(null)
  // Destructive confirm — DELETE only fires from the dialog action.
  const [confirmDeleteCanvas, setConfirmDeleteCanvas] = useState(false)
  // GSAP moment: header + board rise in (SSR-safe; reduced-motion skips).
  const pageRef = useGsapReveal<HTMLDivElement>()
  const active = data?.canvases.find((c) => c.id === activeId) ?? null
  const [items, setItems] = useState<CanvasItem[]>([])
  const [edges, setEdges] = useState<CanvasEdge[]>([])
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  // Pan & zoom (M18): wheel zooms at the cursor, dragging the empty board
  // pans, buttons nudge. Item drags convert screen → board space via zoom.
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)

  const toBoardSpace = (clientX: number, clientY: number) => {
    const board = boardRef.current?.getBoundingClientRect()
    if (!board) return { x: 0, y: 0 }
    return {
      x: (clientX - board.left - pan.x) / zoom,
      y: (clientY - board.top - pan.y) / zoom,
    }
  }

  const onWheelZoom = (e: React.WheelEvent) => {
    e.preventDefault()
    const board = boardRef.current?.getBoundingClientRect()
    if (!board) return
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const next = Math.min(2.5, Math.max(0.4, zoom * factor))
    // Keep the point under the cursor stationary.
    const cx = e.clientX - board.left
    const cy = e.clientY - board.top
    setPan((p) => ({
      x: cx - ((cx - p.x) * next) / zoom,
      y: cy - ((cy - p.y) * next) / zoom,
    }))
    setZoom(next)
  }

  const onBoardPointerDown = (e: React.PointerEvent) => {
    // Empty-board drag = pan (item drags stop propagation before this).
    if (e.target !== e.currentTarget) return
    panRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onBoardPointerMove = (e: React.PointerEvent) => {
    const p = panRef.current
    if (!p) return
    setPan({ x: p.panX + (e.clientX - p.startX), y: p.panY + (e.clientY - p.startY) })
  }

  const onBoardPointerUp = () => {
    panRef.current = null
  }

  useEffect(() => {
    if (!active) return
    setItems(active.items ?? [])
    setEdges(active.edges ?? [])
  }, [active])

  const createCanvas = useMutation({
    mutationFn: () =>
      apiSend<{ canvas: CanvasRow }>('/api/canvas', 'POST', {
        title: `Canvas ${new Date().toLocaleDateString()}`,
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['canvases'] })
      setActiveId(r.canvas.id)
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      if (!activeId) return
      await apiSend(`/api/canvas/${activeId}`, 'PATCH', { items, edges })
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['canvases'] }),
  })

  const deleteCanvas = useMutation({
    mutationFn: async (id: number) => apiSend(`/api/canvas/${id}`, 'DELETE'),
    onSuccess: () => {
      setActiveId(null)
      void qc.invalidateQueries({ queryKey: ['canvases'] })
    },
  })

  const addItem = (kind: CanvasItem['kind']) => {
    setItems((xs) => [
      ...xs,
      {
        id: `it-${Date.now()}`,
        kind,
        text: kind === 'card' ? 'Q: …\nA: …' : '',
        x: 40 + Math.random() * 300,
        y: 40 + Math.random() * 200,
        w: 200,
      },
    ])
  }

  const onPointerDown = (e: React.PointerEvent, item: CanvasItem) => {
    const pos = toBoardSpace(e.clientX, e.clientY)
    dragRef.current = {
      id: item.id,
      dx: pos.x - item.x,
      dy: pos.y - item.y,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const pos = toBoardSpace(e.clientX, e.clientY)
    setItems((xs) =>
      xs.map((it) =>
        it.id === d.id
          ? {
              ...it,
              x: Math.max(0, pos.x - d.dx),
              y: Math.max(0, pos.y - d.dy),
            }
          : it,
      ),
    )
  }
  const onPointerUp = () => {
    dragRef.current = null
  }

  const clickItem = (id: string) => {
    if (!linkFrom) return
    if (linkFrom !== id)
      setEdges((es) => [...es, { id: `e-${Date.now()}`, from: linkFrom, to: id }])
    setLinkFrom(null)
  }

  return (
    <div ref={pageRef} className="space-y-4">
      <PageHeader
        title="Canvas"
        subtitle="Spatial thinking: drag notes, cards, and excerpts; connect them; it all persists as JSON."
        actions={
          <div className="flex flex-wrap gap-2">
            <select
              className="input w-44"
              value={activeId ?? ''}
              onChange={(e) => setActiveId(Number(e.target.value) || null)}
            >
              <option value="">New canvas…</option>
              {(data?.canvases ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <button
              className="btn-ghost"
              onClick={() => {
                if (activeId) return
                createCanvas.mutate()
              }}
              disabled={Boolean(activeId) || createCanvas.isPending}
            >
              <Plus className="h-4 w-4" /> New
            </button>
            <button className="btn-ghost" onClick={() => addItem('note')} disabled={!activeId}>
              + Note
            </button>
            <button className="btn-ghost" onClick={() => addItem('card')} disabled={!activeId}>
              + Card
            </button>
            <button className="btn-ghost" onClick={() => addItem('excerpt')} disabled={!activeId}>
              + Excerpt
            </button>
            <button
              className="btn"
              onClick={() => save.mutate()}
              disabled={!activeId || save.isPending}
            >
              <Save className="h-4 w-4" /> Save
            </button>
          </div>
        }
      />
      <DualCodingAnalyzer className="mt-4" />

      {listFailed ? (
        <Callout tone="danger" title="Couldn't load canvases">
          <button className="underline underline-offset-2" onClick={() => void refetchList()}>
            Retry
          </button>
        </Callout>
      ) : !activeId ? (
        listPending ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <EmptyState title="No canvas open">
            Create a new canvas or pick one from the dropdown above.
          </EmptyState>
        )
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2 text-xs">
            <button
              type="button"
              className="btn-ghost border px-2 py-1"
              onClick={() => setZoom((z) => Math.max(0.4, z / 1.2))}
              aria-label="Zoom out"
            >
              −
            </button>
            <span className="w-12 text-center text-tertiary">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="btn-ghost border px-2 py-1"
              onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              className="btn-ghost border px-2 py-1"
              onClick={() => {
                setZoom(1)
                setPan({ x: 0, y: 0 })
              }}
            >
              Reset view
            </button>
            <span className="text-faint">scroll = zoom · drag empty space = pan</span>
          </div>
          <div
            ref={boardRef}
            className="relative h-[60vh] overflow-hidden rounded-xl border border-neutral-200 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22><circle cx=%222%22 cy=%222%22 r=%221%22 fill=%22%23333%22/></svg>')] dark:border-(--hub-border)"
            onPointerMove={(e) => {
              onBoardPointerMove(e)
              onPointerMove(e)
            }}
            onPointerUp={() => {
              onBoardPointerUp()
              onPointerUp()
            }}
            onPointerDown={onBoardPointerDown}
            onWheel={onWheelZoom}
          >
            <div
              className="absolute inset-0 origin-top-left"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`absolute cursor-grab touch-none rounded-lg border p-2 shadow-sm select-none active:cursor-grabbing ${
                    item.kind === 'card'
                      ? 'border-indigo-500/60 bg-indigo-600/5'
                      : item.kind === 'excerpt'
                        ? 'border-amber-500/50 bg-amber-500/5'
                        : 'border-neutral-300 bg-white/90 dark:border-(--hub-border-strong) dark:bg-(--hub-panel)/95'
                  } ${linkFrom === item.id ? 'ring-2 ring-indigo-500' : ''}`}
                  style={{ left: item.x, top: item.y, width: item.w }}
                  onPointerDown={(e) => onPointerDown(e, item)}
                  onClick={() => clickItem(item.id)}
                >
                  <textarea
                    className="w-full resize-none bg-transparent text-xs outline-none"
                    value={item.text}
                    rows={3}
                    placeholder="Write…"
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setItems((xs) =>
                        xs.map((it) => (it.id === item.id ? { ...it, text: e.target.value } : it)),
                      )
                    }
                  />
                  <div className="flex justify-between text-xs text-faint">
                    <span>{item.kind}</span>
                    <IconButton
                      label={`Delete node ${item.text.slice(0, 24)}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setItems((xs) => xs.filter((x) => x.id !== item.id))
                        setEdges((es) =>
                          es.filter((e2) => e2.from !== item.id && e2.to !== item.id),
                        )
                      }}
                      className="hover:text-danger-text"
                    >
                      <Trash2 className="h-3 w-3" />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>

            <div className="panel space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="label">Edges ({edges.length})</span>
                <button
                  className={`btn-ghost text-xs ${linkFrom ? 'text-indigo-400' : ''}`}
                  onClick={() => setLinkFrom(linkFrom ? null : 'pending')}
                >
                  {linkFrom ? 'Pick target item…' : 'Connect two items'}
                </button>
              </div>
              {edges.map((e) => {
                const from = items.find((i) => i.id === e.from)?.text.slice(0, 24) ?? '?'
                const to = items.find((i) => i.id === e.to)?.text.slice(0, 24) ?? '?'
                return (
                  <div key={e.id} className="flex items-center gap-2 text-xs text-faint">
                    <span className="flex-1 truncate">
                      {from} → {to}
                    </span>
                    <IconButton
                      label={`Delete edge ${from} to ${to}`}
                      onClick={() => setEdges((es) => es.filter((x) => x.id !== e.id))}
                      className="hover:text-danger-text"
                    >
                      <Trash2 className="h-3 w-3" />
                    </IconButton>
                  </div>
                )
              })}
              <div className="pt-2">
                <button
                  className="btn-ghost text-xs text-danger-text"
                  onClick={() => setConfirmDeleteCanvas(true)}
                >
                  Delete canvas
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Destructive confirm — the DELETE request only fires from here. */}
      <AlertDialog open={confirmDeleteCanvas} onOpenChange={setConfirmDeleteCanvas}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete canvas?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently removes “{active?.title ?? 'this canvas'}” with all of its items and
              edges.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (activeId) deleteCanvas.mutate(activeId)
              }}
            >
              Delete canvas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
