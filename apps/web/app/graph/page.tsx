'use client'

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
import { PageHeader } from '@/ui'

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

export default function GraphPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [viewMode, setViewMode] = useState<'web' | 'prereq'>('web')
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Knowledge Graph"
        subtitle="Notes, skills, and adaptive prerequisite DAGs as one navigable web."
        actions={
          <div className="flex items-center gap-2">
            {/* View Switcher */}
            <div className="flex rounded-lg border border-neutral-700 bg-neutral-900/60 p-1 text-xs font-medium">
              <button
                onClick={() => setViewMode('web')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                  viewMode === 'web'
                    ? 'bg-indigo-600 text-white'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Network className="h-3.5 w-3.5" /> Force Web
              </button>
              <button
                onClick={() => setViewMode('prereq')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                  viewMode === 'prereq'
                    ? 'bg-indigo-600 text-white'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <GitFork className="h-3.5 w-3.5" /> Prerequisite DAG & Remedial
              </button>
            </div>
          </div>
        }
      />

      {viewMode === 'web' ? (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              {(Object.keys(KIND_COLOR) as GraphNode['kind'][]).map((k) => (
                <button
                  key={k}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs border ${
                    filters[k]
                      ? 'border-neutral-700 bg-neutral-800 text-neutral-200'
                      : 'border-transparent opacity-40 text-neutral-400'
                  }`}
                  onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[k] }} />
                  {k}s
                </button>
              ))}
            </div>
            <span className="text-xs text-neutral-500">Click node to inspect</span>
          </div>

          <div className="panel h-[65vh] overflow-hidden">
            {graph.nodes.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-neutral-500">
                No nodes yet — capture notes or curriculum skills first.
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
                <p className="text-xs text-neutral-400">
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
              className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3"
            >
              <div className="flex flex-1 items-center gap-2 min-w-[280px]">
                <input
                  type="text"
                  placeholder="Prerequisite (e.g. Linear Algebra)"
                  value={sourceConcept}
                  onChange={(e) => setSourceConcept(e.target.value)}
                  className="input text-xs"
                />
                <ArrowRight className="h-4 w-4 text-neutral-500 shrink-0" />
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
              <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{edgeError}</span>
              </div>
            )}

            {/* Dependencies Table */}
            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Registered Concept Prerequisite Chains ({deps.length})
              </h3>

              {deps.length === 0 ? (
                <div className="rounded-lg border border-neutral-800 p-6 text-center text-xs text-neutral-500">
                  No prerequisite relationships configured yet. Add dependencies above to enable
                  remedial pauses.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {deps.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-indigo-300">{d.sourceConcept}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-neutral-500" />
                        <span className="font-semibold text-emerald-300">{d.targetConcept}</span>
                      </div>
                      <button
                        onClick={() => deleteEdgeMutation.mutate(d.id)}
                        className="btn-ghost text-[10px] text-neutral-500 hover:text-rose-400"
                        title="Remove dependency"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Remedial Remediation Fast-Track Banner */}
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300">
                <Sparkles className="h-4 w-4" />
                Adaptive Remedial Pause Active
              </div>
              <p className="text-xs text-neutral-400">
                If prerequisite stability slips below 70% or incurs 3+ recent lapses, Learning HUB
                automatically inserts a remedial practice loop before allowing you to test dependent
                advanced skills.
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => router.push('/review')}
                  className="btn text-xs flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Start Remedial Practice
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
