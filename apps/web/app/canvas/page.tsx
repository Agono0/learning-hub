'use client'

/**
 * Freeform canvas: absolute-positioned draggable note/card/excerpt cards +
 * an edges list, persisted as JSON via /api/canvas. Pointer-events based
 * dragging (no dependency needed).
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Trash2 } from 'lucide-react'

interface CanvasItem { id: string; kind: 'note' | 'card' | 'excerpt'; text: string; x: number; y: number; w: number }
interface CanvasEdge { id: string; from: string; to: string; label?: string }
interface CanvasRow { id: number; title: string; items: CanvasItem[]; edges: CanvasEdge[]; updatedAt: string }

export default function CanvasPage() {
  const qc = useQueryClient()
  const { data } = useQuery<{ canvases: CanvasRow[] }>({ queryKey: ['canvases'], queryFn: () => fetch('/api/canvas').then((r) => r.json()) })
  const [activeId, setActiveId] = useState<number | null>(null)
  const active = data?.canvases.find((c) => c.id === activeId) ?? null
  const [items, setItems] = useState<CanvasItem[]>([])
  const [edges, setEdges] = useState<CanvasEdge[]>([])
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return
    setItems(active.items ?? [])
    setEdges(active.edges ?? [])
  }, [active])

  const createCanvas = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/canvas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: `Canvas ${new Date().toLocaleDateString()}` }),
      })
      return res.json() as Promise<{ canvas: CanvasRow }>
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['canvases'] })
      setActiveId(r.canvas.id)
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      if (!activeId) return
      await fetch(`/api/canvas/${activeId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items, edges }),
      })
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['canvases'] }),
  })

  const deleteCanvas = useMutation({
    mutationFn: async (id: number) => fetch(`/api/canvas/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setActiveId(null); void qc.invalidateQueries({ queryKey: ['canvases'] }) },
  })

  const addItem = (kind: CanvasItem['kind']) => {
    setItems((xs) => [...xs, { id: `it-${Date.now()}`, kind, text: kind === 'card' ? 'Q: …\nA: …' : '', x: 40 + Math.random() * 300, y: 40 + Math.random() * 200, w: 200 }])
  }

  const onPointerDown = (e: React.PointerEvent, item: CanvasItem) => {
    const board = boardRef.current?.getBoundingClientRect()
    if (!board) return
    dragRef.current = { id: item.id, dx: e.clientX - board.left - item.x, dy: e.clientY - board.top - item.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    const board = boardRef.current?.getBoundingClientRect()
    if (!d || !board) return
    setItems((xs) => xs.map((it) => (it.id === d.id ? { ...it, x: Math.max(0, e.clientX - board.left - d.dx), y: Math.max(0, e.clientY - board.top - d.dy) } : it)))
  }
  const onPointerUp = () => { dragRef.current = null }

  const clickItem = (id: string) => {
    if (!linkFrom) return
    if (linkFrom !== id) setEdges((es) => [...es, { id: `e-${Date.now()}`, from: linkFrom, to: id }])
    setLinkFrom(null)
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Canvas</h1>
          <p className="mt-1 text-sm text-neutral-500">Spatial thinking: drag notes, cards, and excerpts; connect them; it all persists as JSON.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input w-44" value={activeId ?? ''} onChange={(e) => setActiveId(Number(e.target.value) || null)}>
            <option value="">New canvas…</option>
            {(data?.canvases ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <button className="btn-ghost" onClick={() => { if (activeId) return; createCanvas.mutate() }} disabled={Boolean(activeId) || createCanvas.isPending}>
            <Plus className="h-4 w-4" /> New
          </button>
          <button className="btn-ghost" onClick={() => addItem('note')} disabled={!activeId}>+ Note</button>
          <button className="btn-ghost" onClick={() => addItem('card')} disabled={!activeId}>+ Card</button>
          <button className="btn-ghost" onClick={() => addItem('excerpt')} disabled={!activeId}>+ Excerpt</button>
          <button className="btn" onClick={() => save.mutate()} disabled={!activeId || save.isPending}><Save className="h-4 w-4" /> Save</button>
        </div>
      </header>

      {!activeId ? (
        <div className="panel text-sm text-neutral-500">Create or pick a canvas.</div>
      ) : (
        <>
          <div
            ref={boardRef}
            className="relative h-[60vh] overflow-hidden rounded-xl border border-neutral-200 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22><circle cx=%222%22 cy=%222%22 r=%221%22 fill=%22%23333%22/></svg>')] dark:border-[#26262b]"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {items.map((item) => (
              <div
                key={item.id}
                className={`absolute cursor-grab touch-none rounded-lg border p-2 shadow-sm select-none active:cursor-grabbing ${
                  item.kind === 'card'
                    ? 'border-indigo-500/60 bg-indigo-600/5'
                    : item.kind === 'excerpt'
                      ? 'border-amber-500/50 bg-amber-500/5'
                      : 'border-neutral-300 bg-white/90 dark:border-[#3a3a41] dark:bg-[#141417]/95'
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
                  onChange={(e) => setItems((xs) => xs.map((it) => (it.id === item.id ? { ...it, text: e.target.value } : it)))}
                />
                <div className="flex justify-between text-[10px] text-neutral-400">
                  <span>{item.kind}</span>
                  <button className="hover:text-red-400" onClick={(e) => { e.stopPropagation(); setItems((xs) => xs.filter((x) => x.id !== item.id)); setEdges((es) => es.filter((e2) => e2.from !== item.id && e2.to !== item.id)) }}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="panel space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="label">Edges ({edges.length})</span>
              <button className={`btn-ghost text-xs ${linkFrom ? 'text-indigo-400' : ''}`} onClick={() => setLinkFrom(linkFrom ? null : 'pending')}>
                {linkFrom ? 'Pick target item…' : 'Connect two items'}
              </button>
            </div>
            {edges.map((e) => {
              const from = items.find((i) => i.id === e.from)?.text.slice(0, 24) ?? '?'
              const to = items.find((i) => i.id === e.to)?.text.slice(0, 24) ?? '?'
              return (
                <div key={e.id} className="flex items-center gap-2 text-xs text-neutral-400">
                  <span className="flex-1 truncate">{from} → {to}</span>
                  <button className="hover:text-red-400" onClick={() => setEdges((es) => es.filter((x) => x.id !== e.id))}><Trash2 className="h-3 w-3" /></button>
                </div>
              )
            })}
            <div className="pt-2">
              <button className="btn-ghost text-xs text-red-400" onClick={() => activeId && deleteCanvas.mutate(activeId)}>Delete canvas</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
