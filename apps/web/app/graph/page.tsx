'use client'

import React from 'react'

/**
 * Knowledge graph — react-force-graph-2d dynamically imported (ssr: false,
 * per ENGINE-REFERENCE). Node click routes to the owner page; filter by type.
 *
 * Enhanced in Milestone 13:
 * - Full Knowledge Web view
 * - Adaptive Prerequisite DAG & Remedial Control view
 * - Cycle-preventing dependency linker
 */
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  GitFork,
  Network,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Callout, EmptyState, PageHeader, Skeleton } from '@/ui'
import { ChipPicker } from '@/components/ui/chip-picker'
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
import { SchemaDistillationStudio } from '@/components/SchemaDistillationStudio'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

interface GraphNode {
  id: string
  kind: 'note' | 'idea' | 'skill' | 'card'
  label: string
  refId: number
  stage?: string
  x?: number
  y?: number
}
interface GraphEdge {
  source: string | GraphNode
  target: string | GraphNode
  type: string
}

interface ConceptDependency {
  id: number
  sourceConcept: string
  targetConcept: string
  strength: number
  createdAt: string
}

const KIND_COLOR: Record<GraphNode['kind'], string> = {
  note: '#818cf8',
  idea: '#fbbf24',
  skill: '#34d399',
  card: '#94a3b8',
}

/** GET /api/curriculum/graph/remedial — honest verdict from real skill mastery. */
interface RemedialResponse {
  ok: boolean
  result: {
    blocked: boolean
    conceptId: string
    remedialConceptId: string | null
    reason: string
  } | null
  prereqs: { name: string; masteryPct: number | null; attempts: number }[]
  message?: string
}

/**
 * Live remedial check (F-08⑥): pick a target concept, see whether its
 * prerequisites are below the mastery bar. Verdicts come from real skill
 * mastery only — when no prerequisite has practice data, the panel says so
 * instead of fabricating a verdict. Unblocked concepts link straight to
 * practice; blocked ones name the prereq to refresh.
 */
function RemedialCheckPanel({ targets }: { targets: string[] }) {
  const router = useRouter()
  const [concept, setConcept] = useState('')
  const check = useMutation({
    mutationFn: (target: string) =>
      apiGet<RemedialResponse>(
        `/api/curriculum/graph/remedial?conceptId=${encodeURIComponent(target)}`,
      ),
  })
  const r = check.data

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-hub-accent">
        <Sparkles className="h-4 w-4" />
        Remedial check
      </div>
      <p className="text-xs text-faint">
        Below 70% mastery on a prerequisite blocks the target until you refresh the foundation.
      </p>
      {targets.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input h-9 max-w-xs text-xs"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            aria-label="Concept to check"
          >
            <option value="">Pick a concept…</option>
            {targets.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn text-xs"
            disabled={!concept || check.isPending}
            onClick={() => check.mutate(concept)}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Check
          </button>
        </div>
      ) : (
        <p className="text-xs text-tertiary">
          No prerequisite chains registered yet — add dependencies above to enable remedial checks.
        </p>
      )}
      {check.isPending && <p className="text-xs text-tertiary">Checking prerequisites…</p>}
      {r?.message && <p className="text-xs text-tertiary">{r.message}</p>}
      {r?.result && (
        <div
          className={`flex items-start gap-2 rounded-lg p-2.5 text-xs ${
            r.result.blocked
              ? 'border border-amber-500/30 bg-amber-500/10 text-status-warning-text'
              : 'border border-emerald-500/30 bg-emerald-500/10 text-status-success-text'
          }`}
        >
          <AlertTriangle
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${r.result.blocked ? 'text-status-warning-text' : 'text-status-success-text'}`}
          />
          <span className="min-w-0 flex-1">{r.result.reason}</span>
          <button
            type="button"
            onClick={() => router.push(r.result!.blocked ? '/review' : '/courses')}
            className="btn-ghost shrink-0 text-xs"
          >
            {r.result.blocked ? 'Refresh foundation' : 'Open courses'}
          </button>
        </div>
      )}
      {r?.prereqs && r.prereqs.length > 0 && (
        <p className="text-xs text-tertiary">
          Prerequisites:{' '}
          {r.prereqs
            .map((p) =>
              p.masteryPct == null
                ? `${p.name} (no data)`
                : `${p.name} ${Math.round(p.masteryPct * 100)}%`,
            )
            .join(' · ')}
        </p>
      )}
    </div>
  )
}

export default function GraphPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [viewMode, setViewMode] = useState<'web' | 'prereq' | 'schema_studio'>('web')
  // Hydration-safe canvas height: window only known after mount.
  const [graphHeight, setGraphHeight] = useState(500)
  useEffect(() => {
    setGraphHeight(Math.max(400, Math.round(window.innerHeight * 0.62)))
  }, [])

  // Full graph data
  const { data } = useQuery<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    queryKey: ['graph'],
    queryFn: () => apiGet<{ nodes: GraphNode[]; edges: GraphEdge[] }>('/api/graph'),
  })

  // Prerequisite dependencies data
  const prereqQuery = useQuery<{ ok: boolean; dependencies: ConceptDependency[] }>({
    queryKey: ['concept-dependencies'],
    queryFn: () =>
      apiGet<{ ok: boolean; dependencies: ConceptDependency[] }>(
        '/api/curriculum/graph/dependencies',
      ),
  })

  const [filters, setFilters] = useState<Record<GraphNode['kind'], boolean>>({
    note: true,
    idea: true,
    skill: true,
    card: false,
  })

  // Edge creation state
  const [sourceConcept, setSourceConcept] = useState('')
  const [targetConcept, setTargetConcept] = useState('')
  const [edgeError, setEdgeError] = useState<string | null>(null)
  // Destructive confirm — dependency removal only fires from the dialog.
  const [edgeToRemove, setEdgeToRemove] = useState<ConceptDependency | null>(null)

  const addEdgeMutation = useMutation({
    mutationFn: async (payload: { sourceConcept: string; targetConcept: string }) =>
      apiSend<{ ok: boolean; error?: string }>(
        '/api/curriculum/graph/dependencies',
        'POST',
        payload,
      ),
    onSuccess: (res) => {
      if (res.ok) {
        setSourceConcept('')
        setTargetConcept('')
        setEdgeError(null)
        void qc.invalidateQueries({ queryKey: ['concept-dependencies'] })
      } else if (res.error) {
        setEdgeError(res.error)
      }
    },
    onError: (err: unknown) => {
      setEdgeError(err instanceof Error ? err.message : 'Could not add dependency')
    },
  })

  const deleteEdgeMutation = useMutation({
    mutationFn: async (id: number) =>
      apiSend<{ ok: boolean }>(`/api/curriculum/graph/dependencies?id=${id}`, 'DELETE'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['concept-dependencies'] })
    },
  })

  const graph = useMemo(() => {
    const nodes = (data?.nodes ?? []).filter((n) => filters[n.kind])
    const ids = new Set(nodes.map((n) => n.id))
    const edges = (data?.edges ?? [])
      .filter((e) => ids.has(String(e.source)) && ids.has(String(e.target)))
      .map((e) => ({ ...e, source: String(e.source), target: String(e.target) }))
    return { nodes, links: edges }
  }, [data, filters])

  const routeFor = (n: GraphNode): string =>
    n.kind === 'note'
      ? '/notes'
      : n.kind === 'idea'
        ? '/ideas'
        : n.kind === 'skill'
          ? '/curriculum'
          : '/decks'

  const deps = prereqQuery.data?.dependencies ?? []
  // GSAP moment: header + active view rise in (SSR-safe; reduced-motion skips).
  const pageRef = useGsapReveal()

  return (
    <div ref={pageRef} className="space-y-4">
      <PageHeader
        title="Knowledge Graph"
        subtitle="Notes, skills, and adaptive prerequisite DAGs as one navigable web."
        actions={
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/constellation')}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-500/20 dark:text-indigo-300"
            >
              <Sparkles className="h-3.5 w-3.5 text-status-warning-text" />
              <span>3D Constellation</span>
            </button>
            <button
              type="button"
              onClick={() => router.push('/mindmap')}
              className="flex items-center gap-1.5 rounded-lg border border-(--hub-border) bg-(--hub-panel-2) px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:text-strong"
            >
              <span>Mind Map Studio</span>
            </button>
            {/* View Switcher — kit ChipPicker (choose-one mode row) */}
            <ChipPicker<'web' | 'prereq' | 'schema_studio'>
              label="Graph view"
              className="min-w-0 max-w-full"
              items={[
                { value: 'web', label: 'Force Web', icon: <Network /> },
                { value: 'prereq', label: 'Prerequisite DAG & Remedial', icon: <GitFork /> },
                { value: 'schema_studio', label: 'Ausubel Schema Studio', icon: <Sparkles /> },
              ]}
              value={viewMode}
              onChange={setViewMode}
            />
          </div>
        }
      />

      {viewMode === 'schema_studio' ? (
        <SchemaDistillationStudio />
      ) : viewMode === 'web' ? (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              {(Object.keys(KIND_COLOR) as GraphNode['kind'][]).map((k) => (
                <button
                  key={k}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs [@media(pointer:coarse)]:min-h-11 ${
                    filters[k]
                      ? 'border-(--hub-border) bg-(--hub-panel-2) text-strong'
                      : 'border-transparent opacity-40 text-faint'
                  }`}
                  onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[k] }} />
                  {k}s
                </button>
              ))}
            </div>
            <span className="text-xs text-tertiary">Click node to inspect</span>
          </div>

          <div className="panel h-[65vh] overflow-hidden">
            {data === undefined ? (
              <div className="grid h-full place-items-center" aria-hidden="true">
                <Skeleton className="h-full w-full" />
              </div>
            ) : graph.nodes.length === 0 ? (
              <div className="grid h-full place-items-center p-6">
                <EmptyState title="No nodes yet">
                  Capture notes or curriculum skills first — they appear here automatically.
                </EmptyState>
              </div>
            ) : (
              <ForceGraph2D
                graphData={graph}
                nodeLabel="label"
                nodeColor={(n: object) => KIND_COLOR[(n as GraphNode).kind]}
                nodeVal={(n: object) => ((n as GraphNode).kind === 'card' ? 1 : 3)}
                linkColor={() => 'rgba(140,140,160,0.35)'}
                linkDirectionalArrowLength={3}
                onNodeClick={(n: object) => {
                  const node = n as GraphNode
                  router.push(`${routeFor(node)}`)
                }}
                width={900}
                height={graphHeight}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Prerequisite DAG & Remedial Management */}
          <div className="panel space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Adaptive Prerequisite Flow</h2>
                <p className="text-xs text-faint">
                  Concept dependencies ensure you master foundational material before advanced
                  units. When prerequisite recall slips, remedial pauses protect deeper learning.
                </p>
              </div>
            </div>

            {/* Edge Builder Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (sourceConcept.trim() && targetConcept.trim()) {
                  addEdgeMutation.mutate({
                    sourceConcept: sourceConcept.trim(),
                    targetConcept: targetConcept.trim(),
                  })
                }
              }}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-3"
            >
              <div className="flex flex-1 items-center gap-2 min-w-[280px]">
                <input
                  type="text"
                  placeholder="Prerequisite (e.g. Linear Algebra)"
                  value={sourceConcept}
                  onChange={(e) => setSourceConcept(e.target.value)}
                  className="input text-xs"
                />
                <ArrowRight className="h-4 w-4 text-tertiary shrink-0" />
                <input
                  type="text"
                  placeholder="Target (e.g. Neural Networks)"
                  value={targetConcept}
                  onChange={(e) => setTargetConcept(e.target.value)}
                  className="input text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={
                  !sourceConcept.trim() || !targetConcept.trim() || addEdgeMutation.isPending
                }
                className="btn text-xs py-2 px-3"
              >
                <Plus className="h-3.5 w-3.5" /> Add Prerequisite
              </button>
            </form>

            {edgeError && (
              <Callout tone="danger" title="Could not add dependency">
                {edgeError}
              </Callout>
            )}

            {/* Dependencies Table */}
            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
                Registered Concept Prerequisite Chains ({deps.length})
              </h3>

              {prereqQuery.isPending ? (
                <div className="grid gap-2 sm:grid-cols-2" aria-hidden="true">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : deps.length === 0 ? (
                <EmptyState title="No prerequisite chains yet">
                  Add dependencies above to enable remedial pauses.
                </EmptyState>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {deps.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded-lg border border-(--hub-border) bg-(--hub-panel-2) p-3 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-hub-accent">{d.sourceConcept}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-tertiary" />
                        <span className="font-semibold text-status-success-text">
                          {d.targetConcept}
                        </span>
                      </div>
                      <button
                        onClick={() => setEdgeToRemove(d)}
                        className="btn-ghost text-xs text-tertiary hover:text-danger-text [@media(pointer:coarse)]:min-h-11"
                        title="Remove dependency"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Remedial status — a live check against real skill mastery (F-08⑥) */}
            <RemedialCheckPanel targets={[...new Set(deps.map((d) => d.targetConcept))]} />
          </div>
        </div>
      )}

      {/* Destructive confirm — DELETE fires only from the dialog action. */}
      <AlertDialog
        open={edgeToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setEdgeToRemove(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this prerequisite chain?</AlertDialogTitle>
            <AlertDialogDescription>
              {edgeToRemove?.sourceConcept} will no longer gate {edgeToRemove?.targetConcept} — the
              remedial pause disappears with it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep chain</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (edgeToRemove) deleteEdgeMutation.mutate(edgeToRemove.id)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
