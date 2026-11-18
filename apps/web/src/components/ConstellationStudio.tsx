'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Compass,
  Eye,
  Maximize2,
  Minimize2,
  Move3d,
  Sliders,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react'
import {
  computeOptimalLearningPath,
  detectConceptClusters,
  identifyCurriculumBottlenecks,
  project3DTo2D,
  stepConstellationPhysics,
  suggestCrossDomainSyntheses,
  type ConstellationEdge,
  type ConstellationNode,
  type ConceptCluster,
  type CurriculumBottleneck,
  type OptimalLearningPath,
  type PhysicsConfig,
} from '@learning-hub/core/knowledge-graph'
import { getSharedAudioContext } from '../lib/audio-graph'
import { hapticLight, hapticMedium } from '../platform/haptics'
import { ConceptInspectorHUD } from '../ui/ConceptInspectorHUD'
import { cx } from '../ui/cx'

export interface ConstellationStudioProps {
  initialNodes?: ConstellationNode[]
  initialEdges?: ConstellationEdge[]
  onStartPractice?: (conceptId: string) => void
  className?: string
}

const DEFAULT_NODES: ConstellationNode[] = [
  {
    id: 'c_linear_algebra',
    title: 'Linear Algebra Foundations',
    domain: 'Mathematics',
    mastery: 0.88,
    retention: 0.92,
    x: 320,
    y: 220,
    z: 40,
    vx: 0,
    vy: 0,
    vz: 0,
    mass: 1.6,
    radius: 16,
  },
  {
    id: 'c_calculus_deriv',
    title: 'Differential Calculus',
    domain: 'Mathematics',
    mastery: 0.52,
    retention: 0.58,
    x: 480,
    y: 200,
    z: -30,
    vx: 0,
    vy: 0,
    vz: 0,
    mass: 1.4,
    radius: 14,
  },
  {
    id: 'c_multivariate',
    title: 'Multivariate Vector Fields',
    domain: 'Mathematics',
    mastery: 0.45,
    retention: 0.5,
    x: 400,
    y: 330,
    z: 20,
    vx: 0,
    vy: 0,
    vz: 0,
    mass: 1.3,
    radius: 13,
  },
  {
    id: 'c_grad_descent',
    title: 'Gradient Descent Optimization',
    domain: 'Computer Science',
    mastery: 0.65,
    retention: 0.72,
    x: 350,
    y: 440,
    z: -20,
    vx: 0,
    vy: 0,
    vz: 0,
    mass: 1.2,
    radius: 12,
  },
  {
    id: 'c_neural_nets',
    title: 'Deep Feedforward Networks',
    domain: 'Computer Science',
    mastery: 0.38,
    retention: 0.42,
    x: 520,
    y: 430,
    z: 50,
    vx: 0,
    vy: 0,
    vz: 0,
    mass: 1.5,
    radius: 15,
  },
  {
    id: 'c_backprop',
    title: 'Backpropagation Algorithm',
    domain: 'Computer Science',
    mastery: 0.28,
    retention: 0.35,
    x: 450,
    y: 530,
    z: 10,
    vx: 0,
    vy: 0,
    vz: 0,
    mass: 1.2,
    radius: 12,
  },
  {
    id: 'c_loss_surfaces',
    title: 'Loss Landscape Topology',
    domain: 'Physics',
    mastery: 0.74,
    retention: 0.8,
    x: 620,
    y: 320,
    z: -40,
    vx: 0,
    vy: 0,
    vz: 0,
    mass: 1.1,
    radius: 11,
  },
]

const DEFAULT_EDGES: ConstellationEdge[] = [
  { sourceId: 'c_linear_algebra', targetId: 'c_multivariate', strength: 0.9, type: 'prerequisite' },
  { sourceId: 'c_calculus_deriv', targetId: 'c_multivariate', strength: 1.0, type: 'prerequisite' },
  { sourceId: 'c_multivariate', targetId: 'c_grad_descent', strength: 0.9, type: 'prerequisite' },
  { sourceId: 'c_grad_descent', targetId: 'c_neural_nets', strength: 0.85, type: 'prerequisite' },
  { sourceId: 'c_neural_nets', targetId: 'c_backprop', strength: 1.0, type: 'prerequisite' },
  { sourceId: 'c_calculus_deriv', targetId: 'c_backprop', strength: 0.8, type: 'prerequisite' },
  { sourceId: 'c_loss_surfaces', targetId: 'c_neural_nets', strength: 0.7, type: 'synergy' },
]

export function ConstellationStudio({
  initialNodes = DEFAULT_NODES,
  initialEdges = DEFAULT_EDGES,
  onStartPractice,
  className,
}: ConstellationStudioProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [nodes, setNodes] = useState<ConstellationNode[]>(initialNodes)
  const [edges] = useState<ConstellationEdge[]>(initialEdges)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')
  const [isPhysicsActive, setIsPhysicsActive] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [activeLearningPath, setActiveLearningPath] = useState<OptimalLearningPath | null>(null)

  // Camera parameters for 3D orbital view
  const cameraRef = useRef({
    pitch: 0.25,
    yaw: 0.4,
    distance: 600,
    fov: 450,
  })

  // Dragging & Orbit interaction state
  const dragRef = useRef<{
    isDragging: boolean
    draggedNodeId: string | null
    startX: number
    startY: number
  }>({
    isDragging: false,
    draggedNodeId: null,
    startX: 0,
    startY: 0,
  })

  const [physicsConfig, setPhysicsConfig] = useState<PhysicsConfig>({
    springStiffness: 0.015,
    repulsionConstant: 2200,
    centerGravity: 0.0035,
    dampingRatio: 0.88,
    minDistance: 30,
    maxVelocity: 14,
    dimensionality: '2d',
  })

  // Derived Analytics
  const clusters: ConceptCluster[] = useMemo(() => {
    return detectConceptClusters(nodes, edges)
  }, [nodes, edges])

  const bottlenecks: CurriculumBottleneck[] = useMemo(() => {
    const conceptNodes = nodes.map((n) => ({
      id: n.id,
      title: n.title,
      mastery: n.mastery,
      lapses: n.mastery < 0.6 ? 2 : 0,
    }))
    const prereqEdges = edges
      .filter((e) => e.type === 'prerequisite' || !e.type)
      .map((e) => ({ from: e.sourceId, to: e.targetId, strength: e.strength }))

    return identifyCurriculumBottlenecks(conceptNodes, prereqEdges, 0.7)
  }, [nodes, edges])

  const crossSyntheses = useMemo(() => {
    const conceptNodes = nodes.map((n) => ({
      id: n.id,
      title: n.title,
      domain: n.domain,
      mastery: n.mastery,
      lapses: 0,
    }))
    const prereqEdges = edges.map((e) => ({
      from: e.sourceId,
      to: e.targetId,
      strength: e.strength,
    }))
    return suggestCrossDomainSyntheses(conceptNodes, prereqEdges)
  }, [nodes, edges])

  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || null
  }, [nodes, selectedNodeId])

  // Soft celestial chime on node selection
  const playCelestialTone = useCallback(
    async (freq = 528) => {
      if (!soundEnabled) return
      try {
        const ctx = await getSharedAudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, ctx.currentTime)

        gain.gain.setValueAtTime(0.001, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.04)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)

        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.65)
      } catch {
        // Audio unavailable
      }
    },
    [soundEnabled],
  )

  // Simulation & Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let pulseAngle = 0

    const render = () => {
      const width = canvas.width
      const height = canvas.height
      pulseAngle += 0.03

      // 1. Physics Step (if active)
      if (isPhysicsActive) {
        setNodes((prevNodes) =>
          stepConstellationPhysics(prevNodes, edges, {
            ...physicsConfig,
            dimensionality: viewMode === '3d' ? '3d' : '2d',
            bounds: { width, height, depth: height },
          }),
        )
      }

      // 2. Clear & Draw Celestial Space Background
      ctx.clearRect(0, 0, width, height)
      const bgGrad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        50,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.7,
      )
      bgGrad.addColorStop(0, '#090d16')
      bgGrad.addColorStop(1, '#020408')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, width, height)

      // Project star coordinates according to view mode
      const projectedMap = new Map<
        string,
        { x: number; y: number; scale: number; opacity: number; node: ConstellationNode }
      >()

      for (const n of nodes) {
        if (viewMode === '3d') {
          const proj = project3DTo2D(n, cameraRef.current, width, height)
          projectedMap.set(n.id, {
            x: proj.x2d,
            y: proj.y2d,
            scale: proj.depthScale,
            opacity: proj.opacity,
            node: n,
          })
        } else {
          projectedMap.set(n.id, {
            x: n.x,
            y: n.y,
            scale: 1.0,
            opacity: 1.0,
            node: n,
          })
        }
      }

      // 3. Draw Cluster Hulls (if in 2D mode)
      if (viewMode === '2d') {
        for (const cluster of clusters) {
          ctx.beginPath()
          ctx.arc(cluster.centroid.x, cluster.centroid.y, cluster.radius, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(99, 102, 241, 0.03)'
          ctx.fill()
          ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)'
          ctx.setLineDash([4, 6])
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.setLineDash([])

          // Cluster label
          ctx.fillStyle = 'rgba(148, 163, 184, 0.4)'
          ctx.font = '10px ui-sans-serif, system-ui'
          ctx.textAlign = 'center'
          ctx.fillText(cluster.name, cluster.centroid.x, cluster.centroid.y - cluster.radius + 14)
        }
      }

      // 4. Draw Edges with Animated Pulsing Waves
      const activePathIds = new Set(activeLearningPath?.path.map((s) => s.conceptId) ?? [])

      for (const edge of edges) {
        const p1 = projectedMap.get(edge.sourceId)
        const p2 = projectedMap.get(edge.targetId)
        if (!p1 || !p2) continue

        const isPathEdge = activePathIds.has(edge.sourceId) && activePathIds.has(edge.targetId)

        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)

        if (isPathEdge) {
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)'
          ctx.lineWidth = 2.5
          ctx.shadowColor = '#38bdf8'
          ctx.shadowBlur = 8
        } else if (edge.type === 'synergy') {
          ctx.strokeStyle = 'rgba(234, 179, 8, 0.35)'
          ctx.lineWidth = 1.2
          ctx.shadowBlur = 0
        } else {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)'
          ctx.lineWidth = 1
          ctx.shadowBlur = 0
        }

        ctx.stroke()
        ctx.shadowBlur = 0

        // Draw animated pulse packet along prerequisite edges
        const waveProgress = (pulseAngle * 0.4 + p1.x * 0.01) % 1
        const packetX = p1.x + (p2.x - p1.x) * waveProgress
        const packetY = p1.y + (p2.y - p1.y) * waveProgress

        ctx.beginPath()
        ctx.arc(packetX, packetY, isPathEdge ? 3 : 1.8, 0, Math.PI * 2)
        ctx.fillStyle = isPathEdge ? '#38bdf8' : 'rgba(165, 180, 252, 0.6)'
        ctx.fill()
      }

      // 5. Draw Star Nodes
      for (const [, proj] of projectedMap.entries()) {
        const { x, y, scale, opacity, node } = proj
        const isSelected = node.id === selectedNodeId
        const isPathNode = activePathIds.has(node.id)

        const baseRadius = node.radius * scale
        const renderRadius = isSelected ? baseRadius * 1.3 : baseRadius

        // Mastery color scheme
        const color =
          node.mastery >= 0.8
            ? '#38bdf8' // Cyan / Mastered
            : node.mastery >= 0.6
              ? '#34d399' // Emerald / Learning
              : '#f43f5e' // Rose / Weak prerequisite

        // Outer Glow Aura
        const auraGrad = ctx.createRadialGradient(
          x,
          y,
          renderRadius * 0.4,
          x,
          y,
          renderRadius * 2.5,
        )
        auraGrad.addColorStop(0, color)
        auraGrad.addColorStop(1, 'transparent')

        ctx.globalAlpha = opacity
        ctx.fillStyle = auraGrad
        ctx.beginPath()
        ctx.arc(x, y, renderRadius * 2.5, 0, Math.PI * 2)
        ctx.fill()

        // Inner Core Star
        ctx.beginPath()
        ctx.arc(x, y, renderRadius, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.shadowColor = color
        ctx.shadowBlur = isSelected ? 16 : 8
        ctx.fill()
        ctx.shadowBlur = 0

        // Selection ring
        if (isSelected || isPathNode) {
          ctx.beginPath()
          ctx.arc(x, y, renderRadius + 5, 0, Math.PI * 2)
          ctx.strokeStyle = isSelected ? '#ffffff' : '#38bdf8'
          ctx.lineWidth = isSelected ? 2 : 1.5
          ctx.stroke()
        }

        // Title Label
        ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(226, 232, 240, 0.85)'
        ctx.font = `${Math.max(10, Math.round(11 * scale))}px ui-sans-serif, system-ui`
        ctx.textAlign = 'center'
        ctx.fillText(node.title, x, y + renderRadius + 14)
        ctx.globalAlpha = 1.0
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [
    nodes,
    edges,
    selectedNodeId,
    viewMode,
    isPhysicsActive,
    physicsConfig,
    clusters,
    activeLearningPath,
  ])

  // Mouse Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top

    // Check hit test against nodes
    for (const n of nodes) {
      const dx = clientX - n.x
      const dy = clientY - n.y
      if (Math.hypot(dx, dy) <= n.radius + 6) {
        dragRef.current = {
          isDragging: true,
          draggedNodeId: n.id,
          startX: clientX,
          startY: clientY,
        }
        setSelectedNodeId(n.id)
        hapticLight()
        playCelestialTone(528)
        return
      }
    }

    // Otherwise initiate canvas orbit / pan
    dragRef.current = {
      isDragging: true,
      draggedNodeId: null,
      startX: clientX,
      startY: clientY,
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.isDragging) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top

    const dx = clientX - dragRef.current.startX
    const dy = clientY - dragRef.current.startY

    if (dragRef.current.draggedNodeId) {
      // Drag individual star
      const targetId = dragRef.current.draggedNodeId
      setNodes((prev) =>
        prev.map((n) => (n.id === targetId ? { ...n, x: clientX, y: clientY, vx: 0, vy: 0 } : n)),
      )
    } else if (viewMode === '3d') {
      // Rotate 3D celestial orbit
      cameraRef.current.yaw += dx * 0.005
      cameraRef.current.pitch = Math.max(
        -Math.PI / 3,
        Math.min(Math.PI / 3, cameraRef.current.pitch + dy * 0.005),
      )
      dragRef.current.startX = clientX
      dragRef.current.startY = clientY
    }
  }

  const handleMouseUp = () => {
    dragRef.current.isDragging = false
    dragRef.current.draggedNodeId = null
  }

  // Generate Learning Path for Selected Concept
  const handleSimulatePath = (targetId: string) => {
    const conceptNodes = nodes.map((n) => ({
      id: n.id,
      title: n.title,
      mastery: n.mastery,
      lapses: n.mastery < 0.6 ? 2 : 0,
    }))
    const prereqEdges = edges.map((e) => ({
      from: e.sourceId,
      to: e.targetId,
      strength: e.strength,
    }))

    const path = computeOptimalLearningPath(targetId, conceptNodes, prereqEdges, {
      masteryBar: 0.7,
    })
    setActiveLearningPath(path)
    hapticMedium()
    playCelestialTone(660)
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }

  return (
    <div
      ref={containerRef}
      className={cx(
        'relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl transition-all',
        isFullscreen ? 'h-screen w-screen rounded-none' : 'min-h-[640px] w-full',
        className,
      )}
    >
      {/* Top Studio Toolbar */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">
              Concept Constellation Workbench
            </h2>
            <p className="text-[11px] text-faint">
              Interactive n-body knowledge graph with 3D celestial orbit & optimal path traversal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 2D / 3D Mode Switcher */}
          <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setViewMode('2d')
                hapticLight()
              }}
              className={cx(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition-all',
                viewMode === '2d'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-faint hover:text-white',
              )}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>2D Galaxy</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('3d')
                hapticLight()
              }}
              className={cx(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition-all',
                viewMode === '3d'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-faint hover:text-white',
              )}
            >
              <Move3d className="h-3.5 w-3.5" />
              <span>3D Orbit</span>
            </button>
          </div>

          {/* Physics Toggle */}
          <button
            type="button"
            onClick={() => setIsPhysicsActive((p) => !p)}
            className={cx(
              'flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-all',
              isPhysicsActive
                ? 'border-emerald-500/30 bg-emerald-500/10 text-status-success-text'
                : 'border-white/10 bg-white/5 text-faint',
            )}
          >
            <span
              className={cx(
                'h-1.5 w-1.5 rounded-full',
                isPhysicsActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600',
              )}
            />
            <span>Physics {isPhysicsActive ? 'Live' : 'Paused'}</span>
          </button>

          {/* Physics Tuning Controls Toggle */}
          <button
            type="button"
            onClick={() => setShowControls((p) => !p)}
            className={cx(
              'flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-all',
              showControls
                ? 'border-indigo-500/40 bg-indigo-600/30 text-indigo-200'
                : 'border-white/10 bg-white/5 text-faint hover:text-white',
            )}
            title="Configure Physics Parameters"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Tuning</span>
          </button>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled((p) => !p)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-faint hover:text-white transition-all"
            title="Toggle Celestial Soundscape"
          >
            {soundEnabled ? (
              <Volume2 className="h-4 w-4 text-indigo-400" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-faint hover:text-white transition-all"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Main Interactive Canvas Area */}
      <div className="relative flex-1">
        <canvas
          ref={canvasRef}
          width={960}
          height={600}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="h-full w-full cursor-grab active:cursor-grabbing block"
        />

        {/* Floating Concept Inspector HUD */}
        {selectedNode && (
          <div className="absolute top-4 right-4 z-30 w-80 max-w-[calc(100%-2rem)]">
            <ConceptInspectorHUD
              conceptId={selectedNode.id}
              title={selectedNode.title}
              domain={selectedNode.domain}
              mastery={selectedNode.mastery}
              retention={selectedNode.retention}
              lapses={selectedNode.mastery < 0.6 ? 2 : 0}
              dependentsCount={edges.filter((e) => e.sourceId === selectedNode.id).length}
              onSimulateLearningPath={handleSimulatePath}
              onStartRemedialDrill={onStartPractice}
              onClose={() => setSelectedNodeId(null)}
            />
          </div>
        )}

        {/* Physics Tuning Controls Overlay */}
        {showControls && (
          <div className="absolute top-4 left-4 z-30 w-72 rounded-2xl border border-white/10 bg-slate-900/90 p-4 shadow-2xl backdrop-blur-xl text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-indigo-400" /> Physics Tuning
              </span>
              <button
                type="button"
                onClick={() => setShowControls(false)}
                className="text-faint hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-faint">
                <span>Repulsion</span>
                <span className="font-mono text-slate-200">{physicsConfig.repulsionConstant}</span>
              </div>
              <input
                type="range"
                min="500"
                max="4000"
                step="100"
                value={physicsConfig.repulsionConstant}
                onChange={(e) =>
                  setPhysicsConfig((prev) => ({
                    ...prev,
                    repulsionConstant: Number(e.target.value),
                  }))
                }
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-faint">
                <span>Spring Tension</span>
                <span className="font-mono text-slate-200">
                  {physicsConfig.springStiffness.toFixed(3)}
                </span>
              </div>
              <input
                type="range"
                min="0.005"
                max="0.05"
                step="0.002"
                value={physicsConfig.springStiffness}
                onChange={(e) =>
                  setPhysicsConfig((prev) => ({
                    ...prev,
                    springStiffness: Number(e.target.value),
                  }))
                }
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-faint">
                <span>Friction Damping</span>
                <span className="font-mono text-slate-200">
                  {physicsConfig.dampingRatio.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0.75"
                max="0.98"
                step="0.01"
                value={physicsConfig.dampingRatio}
                onChange={(e) =>
                  setPhysicsConfig((prev) => ({
                    ...prev,
                    dampingRatio: Number(e.target.value),
                  }))
                }
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Bottom Path Simulator Panel */}
        {activeLearningPath && (
          <div className="absolute bottom-4 left-4 right-4 z-30 rounded-2xl border border-white/10 bg-slate-900/90 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 text-status-info-text" />
                <h4 className="text-xs font-bold text-white tracking-tight">
                  Learning Route: {activeLearningPath.targetTitle}
                </h4>
                <span className="rounded-full bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 text-[10px] font-semibold text-status-info-text">
                  {activeLearningPath.totalEstimatedMinutes} min total
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveLearningPath(null)}
                className="text-xs text-faint hover:text-white"
              >
                Clear Route
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {activeLearningPath.path.map((step) => (
                <div
                  key={step.conceptId}
                  className="flex shrink-0 items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600/30 font-mono text-[10px] font-bold text-indigo-300">
                    {step.stepIndex}
                  </span>
                  <div>
                    <p className="font-semibold text-slate-200">{step.title}</p>
                    <p className="text-[10px] text-faint">
                      {step.recommendedModality.replace('_', ' ')} • {step.estimatedMinutes}m
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Info & Insights Bar */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 bg-slate-950/80 px-6 py-3 text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-400" /> Mastered (&gt;80%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Learning (60-80%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-400" /> Prerequisite Gap (&lt;60%)
          </span>
        </div>

        {crossSyntheses.length > 0 ? (
          <div className="flex items-center gap-1.5 text-indigo-300 font-medium">
            <Sparkles className="h-3.5 w-3.5 text-status-warning-text" />
            <span>
              Analogy Bridge: {crossSyntheses[0]?.conceptA.title} ↔{' '}
              {crossSyntheses[0]?.conceptB.title}
            </span>
          </div>
        ) : bottlenecks.length > 0 ? (
          <div className="flex items-center gap-1.5 text-danger-text font-medium">
            <Zap className="h-3.5 w-3.5 text-danger-text" />
            <span>
              Top Foundation Bottleneck: <strong>{bottlenecks[0]!.title}</strong>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
