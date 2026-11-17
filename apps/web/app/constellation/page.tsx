'use client'

/**
 * Knowledge Constellation — Graph Knowledge Tracing over a prerequisite DAG.
 *
 * - Force-directed canvas of concepts (arrows point prerequisite → dependent),
 *   coloured by BKT mastery. Click a star (or a list row) to inspect it.
 * - Add concepts and prerequisite links (the server refuses cycles).
 * - Record a pass/fail on a concept: belief propagates through the graph and a
 *   failure names the weakest prerequisite to review first (root-cause diagnosis).
 * - No raw fetch: uses apiGet/apiSend from @/lib/transport.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Layers, Move3d, Plus, Sparkles, X } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { useReducedMotion } from '@/lib/useReducedMotion'
import { ConstellationStudio } from '@/components/ConstellationStudio'
import type { ConstellationEdge, ConstellationNode } from '@learning-hub/core/knowledge-graph'
import {
  Button,
  Callout,
  EmptyState,
  PageHeader,
  Panel,
  SelectField,
  Skeleton,
  TextField,
} from '@/ui'

interface GktNodeData {
  id: string
  title: string
  masteryProb: number
}

interface GktEdgeData {
  prerequisiteId: string
  dependentId: string
  weight: number
}

interface GktResponse {
  ok: boolean
  nodes: GktNodeData[]
  edges: GktEdgeData[]
}

interface RootCauseAlert {
  culpritPrerequisiteId: string
  culpritTitle?: string
  currentMastery: number
  message: string
}

interface Particle {
  id: string
  title: string
  x: number
  y: number
  vx: number
  vy: number
  mastery: number
}

const CANVAS_HEIGHT = 380
const QUERY_KEY = ['cognitive-gkt-dag']

/** Mastery bands shared by the canvas, the list and the legend. */
function band(mastery: number): 'weak' | 'learning' | 'mastered' {
  return mastery < 0.6 ? 'weak' : mastery > 0.8 ? 'mastered' : 'learning'
}
const BAND_COLOR = { weak: '#ef4444', learning: '#34d399', mastered: '#38bdf8' } as const

/** URL-safe concept id from its title, unique against existing ids. */
function slugId(title: string, taken: ReadonlySet<string>): string {
  const base =
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .slice(0, 60) || 'concept'
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

function radiusOf(p: { mastery: number }): number {
  return 10 + p.mastery * 8
}

export default function ConstellationPage() {
  const queryClient = useQueryClient()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Map<string, Particle>>(new Map())
  const selectedRef = useRef<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [linkFrom, setLinkFrom] = useState('')
  const [linkTo, setLinkTo] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [alert, setAlert] = useState<RootCauseAlert | null>(null)
  const [viewMode, setViewMode] = useState<'studio' | 'classic'>('studio')
  selectedRef.current = selectedId

  const { data, isLoading, isError, refetch } = useQuery<GktResponse>({
    queryKey: QUERY_KEY,
    queryFn: () => apiGet<GktResponse>('/api/cognitive/gkt'),
  })
  const nodes = useMemo(() => data?.nodes ?? [], [data])
  const edges = useMemo(() => data?.edges ?? [], [data])
  const selected = nodes.find((n) => n.id === selectedId) ?? null
  const titleOf = (id: string) => nodes.find((n) => n.id === id)?.title ?? id
  const reducedMotion = useReducedMotion()

  const studioNodes: ConstellationNode[] = useMemo(() => {
    if (nodes.length === 0) return []
    return nodes.map((n, idx) => ({
      id: n.id,
      title: n.title,
      domain: 'Core Knowledge',
      mastery: n.masteryProb,
      retention: n.masteryProb > 0.8 ? 0.92 : n.masteryProb > 0.6 ? 0.72 : 0.45,
      x: 350 + (idx % 3) * 140 + Math.sin(idx * 1.5) * 50,
      y: 200 + Math.floor(idx / 3) * 120 + Math.cos(idx * 1.5) * 40,
      z: idx % 2 === 0 ? 35 : -35,
      vx: 0,
      vy: 0,
      vz: 0,
      mass: 1.2,
      radius: 12 + n.masteryProb * 6,
    }))
  }, [nodes])

  const studioEdges: ConstellationEdge[] = useMemo(() => {
    return edges.map((e) => ({
      sourceId: e.prerequisiteId,
      targetId: e.dependentId,
      strength: e.weight ?? 0.85,
      type: 'prerequisite',
    }))
  }, [edges])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })
  const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')

  const addConcept = useMutation({
    mutationFn: (title: string) =>
      apiSend('/api/cognitive/gkt', 'POST', {
        action: 'upsert_node',
        nodeData: { id: slugId(title, new Set(nodes.map((n) => n.id))), title },
      }),
    onSuccess: () => {
      setNewTitle('')
      setFormError(null)
      void invalidate()
    },
    onError: (e) => setFormError(errorText(e)),
  })

  const addLink = useMutation({
    mutationFn: (v: { prerequisiteId: string; dependentId: string }) =>
      apiSend('/api/cognitive/gkt', 'POST', { action: 'add_edge', edgeData: v }),
    onSuccess: () => {
      setLinkFrom('')
      setLinkTo('')
      setFormError(null)
      void invalidate()
    },
    onError: (e) =>
      setFormError(
        /409|cycle/i.test(errorText(e))
          ? 'That link would create a loop — a prerequisite cannot depend on its own dependent.'
          : errorText(e),
      ),
  })

  const evaluate = useMutation({
    mutationFn: (v: { nodeId: string; passed: boolean }) =>
      apiSend<{ ok: boolean; rootCauseAlert?: RootCauseAlert }>('/api/cognitive/gkt', 'POST', {
        action: 'evaluate_review',
        ...v,
      }),
    onSuccess: (res) => {
      setAlert(res.rootCauseAlert ?? null)
      void invalidate()
    },
  })

  // ── Physics + rendering ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || nodes.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      width = canvas.parentElement?.clientWidth ?? 600
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(CANVAS_HEIGHT * dpr)
      canvas.style.height = `${CANVAS_HEIGHT}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    if (canvas.parentElement) observer?.observe(canvas.parentElement)

    // Sync particles with the latest nodes: keep positions, refresh data, drop removed.
    const particles = particlesRef.current
    const ids = new Set(nodes.map((n) => n.id))
    for (const id of [...particles.keys()]) if (!ids.has(id)) particles.delete(id)
    nodes.forEach((n, i) => {
      const existing = particles.get(n.id)
      if (existing) {
        existing.title = n.title
        existing.mastery = n.masteryProb
        return
      }
      const theta = (i / nodes.length) * 2 * Math.PI
      const dist = 80 + Math.random() * 50
      particles.set(n.id, {
        id: n.id,
        title: n.title,
        x: width / 2 + Math.cos(theta) * dist,
        y: CANVAS_HEIGHT / 2 + Math.sin(theta) * dist,
        vx: 0,
        vy: 0,
        mastery: n.masteryProb,
      })
    })

    let animId = 0
    const step = () => {
      const list = [...particles.values()]
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!
          const b = list[j]!
          const dx = b.x - a.x
          const dy = b.y - a.y
          const distSq = dx * dx + dy * dy + 100
          const dist = Math.sqrt(distSq)
          const f = 3200 / distSq
          a.vx -= (dx / dist) * f
          a.vy -= (dy / dist) * f
          b.vx += (dx / dist) * f
          b.vy += (dy / dist) * f
        }
      }
      for (const e of edges) {
        const a = particles.get(e.prerequisiteId)
        const b = particles.get(e.dependentId)
        if (!a || !b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1 // coincident points: no NaN
        const f = (dist - 90) * 0.035 * e.weight
        a.vx += (dx / dist) * f
        a.vy += (dy / dist) * f
        b.vx -= (dx / dist) * f
        b.vy -= (dy / dist) * f
      }
      for (const p of list) {
        p.vx = (p.vx + (width / 2 - p.x) * 0.005) * 0.88
        p.vy = (p.vy + (CANVAS_HEIGHT / 2 - p.y) * 0.005) * 0.88
        p.x = Math.min(width - 12, Math.max(12, p.x + p.vx))
        p.y = Math.min(CANVAS_HEIGHT - 24, Math.max(12, p.y + p.vy))
      }

      ctx.fillStyle = '#05070f'
      ctx.fillRect(0, 0, width, CANVAS_HEIGHT)

      ctx.lineWidth = 1.5
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'
      ctx.fillStyle = 'rgba(56, 189, 248, 0.55)'
      for (const e of edges) {
        const a = particles.get(e.prerequisiteId)
        const b = particles.get(e.dependentId)
        if (!a || !b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const ux = dx / dist
        const uy = dy / dist
        const tipX = b.x - ux * (radiusOf(b) + 3)
        const tipY = b.y - uy * (radiusOf(b) + 3)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(tipX, tipY)
        ctx.stroke()
        ctx.beginPath() // arrowhead: prerequisite → dependent
        ctx.moveTo(tipX, tipY)
        ctx.lineTo(tipX - ux * 8 - uy * 4, tipY - uy * 8 + ux * 4)
        ctx.lineTo(tipX - ux * 8 + uy * 4, tipY - uy * 8 - ux * 4)
        ctx.closePath()
        ctx.fill()
      }

      for (const p of list) {
        const color = BAND_COLOR[band(p.mastery)]
        const r = radiusOf(p)
        ctx.globalAlpha = 0.35
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(p.x, p.y, r + 6, 0, 2 * Math.PI)
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, 2 * Math.PI)
        ctx.fill()
        if (selectedRef.current === p.id) {
          ctx.strokeStyle = '#f8fafc'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(p.x, p.y, r + 4, 0, 2 * Math.PI)
          ctx.stroke()
          ctx.lineWidth = 1.5
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'
        }
        ctx.fillStyle = '#f8fafc'
        ctx.font = '11px Inter, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(p.title, p.x, p.y + r + 13)
      }
      if (!reducedMotion) {
        animId = requestAnimationFrame(step)
      }
    }
    animId = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(animId)
      observer?.disconnect()
    }
  }, [nodes, edges, reducedMotion])

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    let hit: string | null = null
    for (const p of particlesRef.current.values()) {
      const r = radiusOf(p) + 6
      if ((p.x - x) ** 2 + (p.y - y) ** 2 <= r * r) hit = p.id
    }
    if (hit) {
      setSelectedId(hit)
      setAlert(null)
    }
  }

  const prerequisites = selected ? edges.filter((e) => e.dependentId === selected.id) : []
  const dependents = selected ? edges.filter((e) => e.prerequisiteId === selected.id) : []

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Knowledge Constellation"
          subtitle="Your concepts and their prerequisites. Record how you did on a concept and the graph tells you which foundation to shore up first."
          icon={<Sparkles className="h-5 w-5" />}
        />

        <div className="flex items-center rounded-xl border border-white/10 bg-slate-900/60 p-1 text-xs backdrop-blur-md self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('studio')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-all ${
              viewMode === 'studio'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Move3d className="h-3.5 w-3.5" />
            <span>Studio Workbench</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('classic')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-all ${
              viewMode === 'classic'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Classic Canvas</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : isError ? (
        <Callout tone="danger" title="Could not load the concept graph">
          <Button variant="ghost" onClick={() => void refetch()}>
            Try again
          </Button>
        </Callout>
      ) : viewMode === 'studio' ? (
        <ConstellationStudio
          initialNodes={studioNodes.length > 0 ? studioNodes : undefined}
          initialEdges={studioEdges.length > 0 ? studioEdges : undefined}
          onStartPractice={(cid) => {
            setSelectedId(cid)
            setViewMode('classic')
          }}
        />
      ) : nodes.length === 0 ? (
        <EmptyState icon={<Sparkles className="h-6 w-6" />} title="No concepts yet">
          Add your first concept below, then link the ideas it depends on.
        </EmptyState>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-[#05070f] dark:border-(--hub-border)">
          <canvas
            ref={canvasRef}
            onClick={onCanvasClick}
            className="block w-full cursor-pointer"
            aria-label="Concept graph. Use the concept list below to inspect concepts with a keyboard."
            role="img"
          />
          <div className="absolute bottom-2 left-2 flex flex-wrap items-center gap-3 rounded-lg bg-black/60 px-3 py-1.5 text-[11px] text-neutral-300">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> Mastered (&gt; 80%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Learning (60–80%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Weak (&lt; 60%)
            </span>
          </div>
        </div>
      )}

      {selected ? (
        <Panel
          title={selected.title}
          actions={
            <Button
              variant="ghost"
              icon={<X className="h-4 w-4" />}
              aria-label="Close concept details"
              onClick={() => {
                setSelectedId(null)
                setAlert(null)
              }}
            />
          }
        >
          <p className="text-sm">
            Estimated mastery: <strong>{Math.round(selected.masteryProb * 100)}%</strong>
          </p>
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <div className="font-semibold text-neutral-500">Builds on</div>
              {prerequisites.length ? (
                <ul className="mt-1 space-y-0.5">
                  {prerequisites.map((e) => (
                    <li key={e.prerequisiteId}>{titleOf(e.prerequisiteId)}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-neutral-500">No prerequisites linked.</p>
              )}
            </div>
            <div>
              <div className="font-semibold text-neutral-500">Unlocks</div>
              {dependents.length ? (
                <ul className="mt-1 space-y-0.5">
                  {dependents.map((e) => (
                    <li key={e.dependentId}>{titleOf(e.dependentId)}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-neutral-500">Nothing depends on this yet.</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              icon={<Check className="h-4 w-4" />}
              loading={evaluate.isPending}
              onClick={() => evaluate.mutate({ nodeId: selected.id, passed: true })}
            >
              I got it right
            </Button>
            <Button
              variant="ghost"
              icon={<X className="h-4 w-4" />}
              disabled={evaluate.isPending}
              onClick={() => evaluate.mutate({ nodeId: selected.id, passed: false })}
            >
              I got it wrong
            </Button>
          </div>
          {evaluate.isError ? (
            <p className="text-xs text-rose-600">{errorText(evaluate.error)}</p>
          ) : null}
          {alert ? (
            <Callout tone="warning" title="Review a prerequisite first">
              <span className="inline-flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {alert.message}
              </span>
            </Callout>
          ) : evaluate.isSuccess ? (
            <p className="text-xs text-neutral-500">Recorded — the graph has been updated.</p>
          ) : null}
        </Panel>
      ) : null}

      {nodes.length > 0 ? (
        <Panel title="Concepts">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {nodes.map((node) => {
              const b = band(node.masteryProb)
              return (
                <button
                  type="button"
                  key={node.id}
                  onClick={() => {
                    setSelectedId(node.id)
                    setAlert(null)
                  }}
                  aria-pressed={selectedId === node.id}
                  className={`min-h-[44px] rounded-xl border p-3 text-left text-xs transition ${
                    selectedId === node.id
                      ? 'border-indigo-500 bg-indigo-600/10'
                      : 'border-neutral-200 hover:border-neutral-400 dark:border-(--hub-border)'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 font-semibold">
                    <span className="truncate">{node.title}</span>
                    <span className={b === 'weak' ? 'text-rose-600' : 'text-sky-600'}>
                      {Math.round(node.masteryProb * 100)}%
                    </span>
                  </div>
                  {b === 'weak' ? (
                    <div className="mt-1 flex items-center gap-1 text-rose-600">
                      <AlertTriangle className="h-3 w-3" /> Weak
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
        </Panel>
      ) : null}

      <Panel title="Edit the graph">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            if (newTitle.trim()) addConcept.mutate(newTitle.trim())
          }}
        >
          <TextField
            label="New concept"
            className="flex-1"
            value={newTitle}
            maxLength={200}
            placeholder="e.g. Chain rule"
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <Button
            type="submit"
            variant="ghost"
            icon={<Plus className="h-4 w-4" />}
            loading={addConcept.isPending}
            disabled={!newTitle.trim()}
          >
            Add concept
          </Button>
        </form>

        {nodes.length >= 2 ? (
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              if (linkFrom && linkTo)
                addLink.mutate({ prerequisiteId: linkFrom, dependentId: linkTo })
            }}
          >
            <SelectField
              label="Prerequisite"
              value={linkFrom}
              onChange={(e) => setLinkFrom(e.target.value)}
            >
              <option value="">Choose…</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="is needed for"
              value={linkTo}
              onChange={(e) => setLinkTo(e.target.value)}
            >
              <option value="">Choose…</option>
              {nodes
                .filter((n) => n.id !== linkFrom)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
            </SelectField>
            <Button
              type="submit"
              variant="ghost"
              loading={addLink.isPending}
              disabled={!linkFrom || !linkTo || linkFrom === linkTo}
            >
              Link
            </Button>
          </form>
        ) : null}
        {formError ? <p className="text-xs text-rose-600">{formError}</p> : null}
      </Panel>
    </div>
  )
}
