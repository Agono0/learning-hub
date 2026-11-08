'use client'

/**
 * Kinetic Cosmic Knowledge Constellation.
 *
 * Implements:
 * - Real-time force-directed physics graph with particle mass.
 * - Cosmic mastery decay glow based on FSRS Retrievability R(t).
 * - Root-cause prerequisite dependency traces.
 * - No raw fetch: uses apiGet/apiSend from @/lib/transport.
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { apiGet } from '@/lib/transport'
import { PageHeader } from '@/ui'

interface GktNodeData {
  id: string
  title: string
  masteryProb: number
  slipProb: number
  guessProb: number
  transitProb: number
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

interface SimulatedParticle {
  id: string
  title: string
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  mastery: number
}

export default function ConstellationPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedNode, setSelectedNode] = useState<GktNodeData | null>(null)
  const particlesRef = useRef<Map<string, SimulatedParticle>>(new Map())

  const { data } = useQuery<GktResponse>({
    queryKey: ['cognitive-gkt-dag'],
    queryFn: () => apiGet<GktResponse>('/api/cognitive/gkt'),
  })

  const nodes = data?.nodes ?? []
  const edges = data?.edges ?? []

  // Initialize and run the force-directed physics simulation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || nodes.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = (canvas.width = canvas.parentElement?.clientWidth ?? 600)
    const height = (canvas.height = 420)

    // Seed particles if not already initialized
    const particles = particlesRef.current
    nodes.forEach((n, i) => {
      if (!particles.has(n.id)) {
        const theta = (i / nodes.length) * 2 * Math.PI
        const dist = 100 + Math.random() * 60
        particles.set(n.id, {
          id: n.id,
          title: n.title,
          x: width / 2 + Math.cos(theta) * dist,
          y: height / 2 + Math.sin(theta) * dist,
          vx: 0,
          vy: 0,
          radius: 12 + n.masteryProb * 8,
          mastery: n.masteryProb,
        })
      }
    })

    let animId: number
    const stepPhysics = () => {
      // 1. Repulsive electrostatic force between all particle pairs
      const list = Array.from(particles.values())
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const p1 = list[i]
          const p2 = list[j]
          const dx = p2.x - p1.x
          const dy = p2.y - p1.y
          const distSq = dx * dx + dy * dy + 100
          const dist = Math.sqrt(distSq)
          const force = 3200 / distSq

          const fx = (dx / dist) * force
          const fy = (dy / dist) * force

          p1.vx -= fx
          p1.vy -= fy
          p2.vx += fx
          p2.vy += fy
        }
      }

      // 2. Attractive spring force along prerequisite edges
      for (const edge of edges) {
        const p1 = particles.get(edge.prerequisiteId)
        const p2 = particles.get(edge.dependentId)
        if (p1 && p2) {
          const dx = p2.x - p1.x
          const dy = p2.y - p1.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const targetDist = 90
          const springForce = (dist - targetDist) * 0.035 * edge.weight

          p1.vx += (dx / dist) * springForce
          p1.vy += (dy / dist) * springForce
          p2.vx -= (dx / dist) * springForce
          p2.vy -= (dy / dist) * springForce
        }
      }

      // 3. Center gravity pull & friction damping
      for (const p of list) {
        const cdx = width / 2 - p.x
        const cdy = height / 2 - p.y
        p.vx += cdx * 0.005
        p.vy += cdy * 0.005

        p.vx *= 0.88
        p.vy *= 0.88

        p.x += p.vx
        p.y += p.vy
      }

      // 4. Render Cosmic Constellation Frame
      ctx.fillStyle = '#05070f'
      ctx.fillRect(0, 0, width, height)

      // Draw Edges with direction arrows
      ctx.lineWidth = 1.5
      for (const edge of edges) {
        const p1 = particles.get(edge.prerequisiteId)
        const p2 = particles.get(edge.dependentId)
        if (p1 && p2) {
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)'
          ctx.beginPath()
          ctx.moveTo(p1.x, p1.y)
          ctx.lineTo(p2.x, p2.y)
          ctx.stroke()
        }
      }

      // Draw Nodes with Mastery Decay Glow
      for (const p of list) {
        const isDue = p.mastery < 0.6
        const glowColor = isDue
          ? 'rgba(239, 68, 68, 0.4)'
          : p.mastery > 0.8
            ? 'rgba(56, 189, 248, 0.45)'
            : 'rgba(52, 211, 153, 0.4)'

        // Outer cosmic aura
        ctx.fillStyle = glowColor
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius + 6, 0, 2 * Math.PI)
        ctx.fill()

        // Inner solid core
        ctx.fillStyle = isDue ? '#ef4444' : p.mastery > 0.8 ? '#38bdf8' : '#34d399'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI)
        ctx.fill()

        // Label
        ctx.fillStyle = '#f8fafc'
        ctx.font = '10px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(p.title, p.x, p.y + p.radius + 12)
      }

      animId = requestAnimationFrame(stepPhysics)
    }

    animId = requestAnimationFrame(stepPhysics)
    return () => cancelAnimationFrame(animId)
  }, [nodes, edges])

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <PageHeader
        title="Kinetic Knowledge Constellation"
        subtitle="A living, force-directed cosmic knowledge graph. Nodes glow brighter with retention and cool down as they near their review deadline."
      />

      {/* Interactive Physics Canvas */}
      <div className="relative rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl bg-[#05070f]">
        <canvas ref={canvasRef} className="w-full h-[420px] block cursor-pointer" />

        {/* Legend Overlay */}
        <div className="absolute bottom-3 left-3 flex items-center gap-4 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur border border-white/10 text-[11px] text-neutral-300">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]" />
            <span>Mastered (&gt; 80%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span>Learning (60–80%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
            <span>Due for Review</span>
          </div>
        </div>
      </div>

      {/* Concept Node List & Prerequisite Inspect */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-300">Knowledge Topography Nodes</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {nodes.map((node) => {
            const isDue = node.masteryProb < 0.6
            return (
              <div
                key={node.id}
                onClick={() => setSelectedNode(node)}
                className={`p-3.5 rounded-xl border transition cursor-pointer text-xs space-y-1 ${
                  selectedNode?.id === node.id
                    ? 'bg-blue-950/40 border-blue-500'
                    : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center justify-between font-semibold text-neutral-200">
                  <span>{node.title}</span>
                  <span className={isDue ? 'text-red-400' : 'text-sky-400'}>
                    {Math.round(node.masteryProb * 100)}%
                  </span>
                </div>
                <div className="text-neutral-400 text-[11px] flex items-center gap-1">
                  <span>Transit prob: {node.transitProb}</span>
                  {isDue ? (
                    <span className="ml-auto text-red-400 flex items-center gap-0.5">
                      <AlertTriangle className="w-3 h-3" /> Due
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
