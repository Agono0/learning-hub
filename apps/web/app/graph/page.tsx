'use client'

/**
 * Knowledge graph — react-force-graph-2d dynamically imported (ssr: false,
 * per ENGINE-REFERENCE). Node click routes to the owner page; filter by type.
 */
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/transport'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

interface GraphNode {
  id: string
  kind: 'note' | 'idea' | 'skill' | 'card'
  label: string
  refId: number
  stage?: string
  // force-graph runtime fields
  x?: number
  y?: number
}
interface GraphEdge {
  source: string | GraphNode
  target: string | GraphNode
  type: string
}

const KIND_COLOR: Record<GraphNode['kind'], string> = {
  note: '#818cf8',
  idea: '#fbbf24',
  skill: '#34d399',
  card: '#94a3b8',
}

export default function GraphPage() {
  const router = useRouter()
  const { data } = useQuery<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    queryKey: ['graph'],
    queryFn: () => apiGet<{ nodes: GraphNode[]; edges: GraphEdge[] }>('/api/graph'),
  })
  const [filters, setFilters] = useState<Record<GraphNode['kind'], boolean>>({
    note: true,
    idea: true,
    skill: true,
    card: false,
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

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Knowledge graph</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Notes, ideas, and skills as one navigable web. Click a node to open it.
          </p>
        </div>
        <div className="flex gap-2">
          {(Object.keys(KIND_COLOR) as GraphNode['kind'][]).map((k) => (
            <button
              key={k}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${filters[k] ? 'bg-neutral-100 dark:bg-[#1a1a1f]' : 'opacity-40'}`}
              onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} />
              {k}s
            </button>
          ))}
        </div>
      </header>

      <div className="panel h-[70vh] overflow-hidden">
        {graph.nodes.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-neutral-500">
            No nodes yet — write notes and capture ideas first.
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
            height={Math.max(400, typeof window !== 'undefined' ? window.innerHeight * 0.68 : 500)}
          />
        )}
      </div>
    </div>
  )
}
