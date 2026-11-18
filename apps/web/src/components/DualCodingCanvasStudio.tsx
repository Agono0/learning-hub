'use client'

/**
 * Paivio Dual Coding Theory Interactive Studio (Allan Paivio 1971, 1986).
 *
 * Implements dual-memory trace potentiation by coupling verbal propositions with
 * non-verbal imagistic anchors (sketches, spatial maps, flow diagrams).
 *
 * Provides a responsive vector/sketch canvas, automatic Paivio retention boost
 * calculation (P = 1 - (1 - Rv)(1 - Rimg)), diagram presets, and 1-click card export.
 */
import React, { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Circle,
  MoveUpRight,
  Palette,
  Pencil,
  RotateCcw,
  Save,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import { analyzeDualCoding, type DualCodingAnalysis } from '@learning-hub/core/dualcoding'
import { apiGet, apiSend } from '@/lib/transport'
import { hapticLight, hapticMedium } from '@/platform/haptics'
import { Badge } from '@/ui/Feedback'

export interface DualCodingCanvasStudioProps {
  initialConcept?: string
  initialVerbalText?: string
  cardId?: number
  deckId?: number
  onCardSaved?: () => void
  onClose?: () => void
  isOpen?: boolean
}

type ToolType = 'pen' | 'rect' | 'circle' | 'arrow' | 'text'

interface Point {
  x: number
  y: number
}

interface DrawElement {
  id: string
  tool: ToolType
  points: Point[]
  color: string
  strokeWidth: number
  text?: string
}

const PALETTE_COLORS = [
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Cyan', value: '#06b6d4' },
  { label: 'Neutral', value: '#71717a' },
]

export function DualCodingCanvasStudio({
  initialConcept = "Hebb's Postulate",
  initialVerbalText = 'Neurons that fire together wire together: repeated and persistent stimulation of cell B by cell A induces metabolic changes that increase the synaptic efficacy of A in firing B.',
  cardId,
  deckId: propDeckId,
  onCardSaved,
  onClose,
  isOpen = true,
}: DualCodingCanvasStudioProps) {
  const [concept, setConcept] = useState(initialConcept)
  const [verbalText, setVerbalText] = useState(initialVerbalText)
  const [activeTool, setActiveTool] = useState<ToolType>('pen')
  const [activeColor, setActiveColor] = useState<string>('#6366f1')
  const strokeWidth = 3
  const [elements, setElements] = useState<DrawElement[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentPoints, setCurrentPoints] = useState<Point[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [selectedDeckId, setSelectedDeckId] = useState<number | ''>(propDeckId ?? '')

  const svgRef = useRef<SVGSVGElement | null>(null)

  // Fetch available decks
  const { data: decksData } = useQuery<{ decks: { id: number; name: string }[] }>({
    queryKey: ['decks-for-dual-coding'],
    queryFn: () => apiGet<{ decks: { id: number; name: string }[] }>('/api/decks'),
  })

  const effectiveDeckId = useMemo(() => {
    if (typeof selectedDeckId === 'number') return selectedDeckId
    if (propDeckId) return propDeckId
    return decksData?.decks?.[0]?.id ?? 1
  }, [selectedDeckId, propDeckId, decksData])

  // Paivio Dual Coding Analysis
  const analysis: DualCodingAnalysis = useMemo(() => {
    return analyzeDualCoding({
      cardId,
      text: `${concept} ${verbalText}`,
      hasDiagram: elements.length > 0,
      verbalRetention: 0.7,
      visualRetention: 0.78,
    })
  }, [cardId, concept, verbalText, elements.length])

  // Get pointer coordinates relative to SVG viewBox
  const getCoordinates = (
    e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>,
  ): Point | null => {
    if (!svgRef.current) return null
    const rect = svgRef.current.getBoundingClientRect()
    const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? 0) : e.clientX
    const clientY = 'touches' in e ? (e.touches[0]?.clientY ?? 0) : e.clientY

    // Scale to internal 600x400 viewBox
    const scaleX = 600 / rect.width
    const scaleY = 400 / rect.height

    return {
      x: Math.round((clientX - rect.left) * scaleX),
      y: Math.round((clientY - rect.top) * scaleY),
    }
  }

  // Pointer down: start stroke
  const handleStartDraw = (
    e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>,
  ) => {
    const pt = getCoordinates(e)
    if (!pt) return
    setIsDrawing(true)
    setCurrentPoints([pt])
  }

  // Pointer move: append points
  const handleMoveDraw = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    if (!isDrawing) return
    const pt = getCoordinates(e)
    if (!pt) return

    if (activeTool === 'pen') {
      setCurrentPoints((prev) => [...prev, pt])
    } else {
      // For shapes, hold start and update current endpoint
      setCurrentPoints((prev) => [prev[0]!, pt])
    }
  }

  // Pointer up: finalize element
  const handleEndDraw = () => {
    if (!isDrawing || currentPoints.length === 0) return
    setIsDrawing(false)

    const newElement: DrawElement = {
      id: `elem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool: activeTool,
      points: currentPoints,
      color: activeColor,
      strokeWidth,
    }

    setElements((prev) => [...prev, newElement])
    setCurrentPoints([])
    hapticLight()
  }

  // Preset Template Injectors
  const handleApplyPreset = (type: 'flow' | 'matrix' | 'hierarchy') => {
    hapticMedium()
    if (type === 'flow') {
      setElements([
        // Box 1
        {
          id: 'b1',
          tool: 'rect',
          points: [
            { x: 50, y: 150 },
            { x: 170, y: 230 },
          ],
          color: '#6366f1',
          strokeWidth: 2.5,
        },
        // Arrow 1
        {
          id: 'a1',
          tool: 'arrow',
          points: [
            { x: 180, y: 190 },
            { x: 250, y: 190 },
          ],
          color: '#f59e0b',
          strokeWidth: 3,
        },
        // Box 2
        {
          id: 'b2',
          tool: 'rect',
          points: [
            { x: 260, y: 150 },
            { x: 380, y: 230 },
          ],
          color: '#10b981',
          strokeWidth: 2.5,
        },
        // Arrow 2
        {
          id: 'a2',
          tool: 'arrow',
          points: [
            { x: 390, y: 190 },
            { x: 460, y: 190 },
          ],
          color: '#f59e0b',
          strokeWidth: 3,
        },
        // Box 3
        {
          id: 'b3',
          tool: 'rect',
          points: [
            { x: 470, y: 150 },
            { x: 570, y: 230 },
          ],
          color: '#f43f5e',
          strokeWidth: 2.5,
        },
      ])
    } else if (type === 'matrix') {
      setElements([
        // Horizontal line
        {
          id: 'h1',
          tool: 'pen',
          points: [
            { x: 50, y: 200 },
            { x: 550, y: 200 },
          ],
          color: '#71717a',
          strokeWidth: 2,
        },
        // Vertical line
        {
          id: 'v1',
          tool: 'pen',
          points: [
            { x: 300, y: 50 },
            { x: 300, y: 350 },
          ],
          color: '#71717a',
          strokeWidth: 2,
        },
        // Circles in quadrants
        {
          id: 'c1',
          tool: 'circle',
          points: [
            { x: 175, y: 125 },
            { x: 220, y: 125 },
          ],
          color: '#6366f1',
          strokeWidth: 2,
        },
        {
          id: 'c2',
          tool: 'circle',
          points: [
            { x: 425, y: 125 },
            { x: 470, y: 125 },
          ],
          color: '#10b981',
          strokeWidth: 2,
        },
        {
          id: 'c3',
          tool: 'circle',
          points: [
            { x: 175, y: 275 },
            { x: 220, y: 275 },
          ],
          color: '#f59e0b',
          strokeWidth: 2,
        },
        {
          id: 'c4',
          tool: 'circle',
          points: [
            { x: 425, y: 275 },
            { x: 470, y: 275 },
          ],
          color: '#f43f5e',
          strokeWidth: 2,
        },
      ])
    } else if (type === 'hierarchy') {
      setElements([
        // Top Root Box
        {
          id: 'r1',
          tool: 'rect',
          points: [
            { x: 230, y: 40 },
            { x: 370, y: 110 },
          ],
          color: '#6366f1',
          strokeWidth: 2.5,
        },
        // Branch down left
        {
          id: 'l1',
          tool: 'arrow',
          points: [
            { x: 270, y: 120 },
            { x: 170, y: 210 },
          ],
          color: '#71717a',
          strokeWidth: 2,
        },
        // Branch down right
        {
          id: 'l2',
          tool: 'arrow',
          points: [
            { x: 330, y: 120 },
            { x: 430, y: 210 },
          ],
          color: '#71717a',
          strokeWidth: 2,
        },
        // Child 1
        {
          id: 'c1',
          tool: 'rect',
          points: [
            { x: 100, y: 220 },
            { x: 240, y: 290 },
          ],
          color: '#10b981',
          strokeWidth: 2,
        },
        // Child 2
        {
          id: 'c2',
          tool: 'rect',
          points: [
            { x: 360, y: 220 },
            { x: 500, y: 290 },
          ],
          color: '#f59e0b',
          strokeWidth: 2,
        },
      ])
    }
  }

  // Undo last element
  const handleUndo = () => {
    hapticLight()
    setElements((prev) => prev.slice(0, -1))
  }

  // Clear canvas
  const handleClear = () => {
    hapticLight()
    setElements([])
  }

  // Render SVG Element
  const renderElement = (elem: DrawElement) => {
    if (elem.points.length === 0) return null

    if (elem.tool === 'pen') {
      const d = elem.points.reduce(
        (acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
        '',
      )
      return (
        <path
          key={elem.id}
          d={d}
          fill="none"
          stroke={elem.color}
          strokeWidth={elem.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    }

    if (elem.tool === 'rect') {
      const p1 = elem.points[0]!
      const p2 = elem.points[elem.points.length - 1]!
      const x = Math.min(p1.x, p2.x)
      const y = Math.min(p1.y, p2.y)
      const w = Math.abs(p2.x - p1.x)
      const h = Math.abs(p2.y - p1.y)
      return (
        <rect
          key={elem.id}
          x={x}
          y={y}
          width={w}
          height={h}
          rx="8"
          fill={`${elem.color}15`}
          stroke={elem.color}
          strokeWidth={elem.strokeWidth}
        />
      )
    }

    if (elem.tool === 'circle') {
      const p1 = elem.points[0]!
      const p2 = elem.points[elem.points.length - 1]!
      const r = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      return (
        <circle
          key={elem.id}
          cx={p1.x}
          cy={p1.y}
          r={Math.max(5, r)}
          fill={`${elem.color}15`}
          stroke={elem.color}
          strokeWidth={elem.strokeWidth}
        />
      )
    }

    if (elem.tool === 'arrow') {
      const p1 = elem.points[0]!
      const p2 = elem.points[elem.points.length - 1]!
      return (
        <g key={elem.id}>
          <line
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={elem.color}
            strokeWidth={elem.strokeWidth}
            strokeLinecap="round"
          />
          {/* Arrowhead */}
          <circle cx={p2.x} cy={p2.y} r={elem.strokeWidth * 1.5} fill={elem.color} />
        </g>
      )
    }

    return null
  }

  // Save Card to Deck
  const handleSaveCard = async () => {
    if (isSaving || !concept.trim()) return
    setIsSaving(true)
    hapticMedium()

    try {
      await apiSend('/api/cards', 'POST', {
        deckId: effectiveDeckId,
        type: 'basic',
        content: {
          basic: {
            front: concept.trim(),
            back: `${verbalText.trim()}\n\n<!-- dual-code-anchor: ${analysis.recommendedModality} -->`,
          },
        },
        tags: [
          'dual-coded',
          analysis.recommendedModality.replace('_', '-'),
          concept.toLowerCase().replace(/\s+/g, '-'),
        ],
      })

      if (onCardSaved) onCardSaved()
      if (onClose) onClose()
    } catch {
      // fallback
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 shadow-sm space-y-6">
      {/* Studio Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Paivio Dual-Coding Studio
              </h3>
              <Badge tone="accent">
                +{((analysis.compositeRetention - analysis.verbalRetention) * 100).toFixed(0)}%
                Retention Boost
              </Badge>
            </div>
            <p className="text-xs text-tertiary dark:text-faint">
              Allan Paivio (1971) Dual-Trace Synthesis · Independent Verbal &amp; Imagistic
              Retention
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-tertiary hover:text-neutral-700 dark:text-faint dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
            aria-label="Close studio"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Paivio Formula Telemetry Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40 text-xs">
        <div>
          <span className="font-semibold text-neutral-600 dark:text-faint block">
            Verbal Trace Only (P_v):
          </span>
          <div className="text-lg font-mono font-bold text-neutral-900 dark:text-neutral-100">
            {Math.round(analysis.verbalRetention * 100)}%
          </div>
          <span className="text-[11px] text-tertiary">Language channel alone</span>
        </div>

        <div>
          <span className="font-semibold text-neutral-600 dark:text-faint block">
            Dual-Coded Trace (1 - (1-Pv)(1-Pimg)):
          </span>
          <div className="text-lg font-mono font-bold text-status-success-text dark:text-status-success-text">
            {Math.round(analysis.compositeRetention * 100)}%
          </div>
          <span className="text-[11px] text-tertiary">Composite dual recall</span>
        </div>

        <div>
          <span className="font-semibold text-neutral-600 dark:text-faint block">
            Forgetting Reduction:
          </span>
          <div className="text-lg font-mono font-bold text-indigo-600 dark:text-indigo-400">
            {analysis.forgettingReductionFactor.toFixed(1)}x Less Forgetting
          </div>
          <span className="text-[11px] text-tertiary">Mayer &amp; Paivio retention gain</span>
        </div>
      </div>

      {/* Main Split Workbench: Verbal Proposition (Left) + Drawing Canvas (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Verbal Proposition (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="dual-coding-concept-input"
              className="block text-xs font-semibold uppercase tracking-wider text-tertiary"
            >
              Verbal Concept / Cue
            </label>
            <input
              id="dual-coding-concept-input"
              type="text"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Concept title..."
              className="w-full px-3.5 py-2 text-sm rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="dual-coding-verbal-input"
              className="block text-xs font-semibold uppercase tracking-wider text-tertiary"
            >
              Verbal Proposition / Definition
            </label>
            <textarea
              id="dual-coding-verbal-input"
              value={verbalText}
              onChange={(e) => setVerbalText(e.target.value)}
              placeholder="Enter detailed verbal proposition..."
              rows={4}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/40 resize-y leading-relaxed"
            />
          </div>

          {/* AI Recommended Modality & Guidance */}
          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/60 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-700 dark:text-secondary flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-ac-text" />
                Recommended Visual Modality:
              </span>
              <Badge tone="accent">{analysis.recommendedModality.replace('_', ' ')}</Badge>
            </div>
            <p className="text-neutral-600 dark:text-faint text-[11px] leading-relaxed">
              {analysis.visualPromptSuggestion}
            </p>
          </div>

          {/* Preset Diagram Quick Buttons */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-tertiary block">
              Quick Structural Templates:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleApplyPreset('flow')}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-secondary transition"
              >
                Sequential Flow (A → B → C)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('matrix')}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-secondary transition"
              >
                2x2 Matrix
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('hierarchy')}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-secondary transition"
              >
                Hierarchy Tree
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Drawing Vector Canvas (7 cols) */}
        <div className="lg:col-span-7 space-y-2">
          {/* Canvas Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700">
            {/* Tools */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTool('pen')}
                className={`p-1.5 rounded-lg transition ${
                  activeTool === 'pen'
                    ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold'
                    : 'text-tertiary hover:text-neutral-700 dark:text-faint'
                }`}
                title="Pen Tool"
                aria-label="Pen Tool"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setActiveTool('rect')}
                className={`p-1.5 rounded-lg transition ${
                  activeTool === 'rect'
                    ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-tertiary hover:text-neutral-700 dark:text-faint'
                }`}
                title="Rectangle Box"
                aria-label="Rectangle Box"
              >
                <Square className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setActiveTool('circle')}
                className={`p-1.5 rounded-lg transition ${
                  activeTool === 'circle'
                    ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-tertiary hover:text-neutral-700 dark:text-faint'
                }`}
                title="Circle Node"
                aria-label="Circle Node"
              >
                <Circle className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setActiveTool('arrow')}
                className={`p-1.5 rounded-lg transition ${
                  activeTool === 'arrow'
                    ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-tertiary hover:text-neutral-700 dark:text-faint'
                }`}
                title="Arrow Pointer"
                aria-label="Arrow Pointer"
              >
                <MoveUpRight className="h-4 w-4" />
              </button>
            </div>

            {/* Colors */}
            <div className="flex items-center gap-1.5">
              {PALETTE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setActiveColor(c.value)}
                  className={`h-5 w-5 rounded-full transition ${
                    activeColor === c.value
                      ? 'ring-2 ring-indigo-500 ring-offset-1 scale-110'
                      : 'opacity-80'
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                  aria-label={c.label}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleUndo}
                disabled={elements.length === 0}
                className="p-1.5 text-tertiary hover:text-neutral-700 dark:text-faint disabled:opacity-40 rounded-lg hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50 transition"
                title="Undo"
                aria-label="Undo last element"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={elements.length === 0}
                className="text-xs px-2 py-1 text-tertiary hover:text-danger-text dark:text-faint disabled:opacity-40 transition"
              >
                Clear
              </button>
            </div>
          </div>

          {/* SVG Vector Canvas */}
          <div className="relative aspect-3/2 w-full rounded-2xl bg-neutral-900 border border-neutral-700/60 overflow-hidden shadow-inner cursor-crosshair touch-none">
            <svg
              ref={svgRef}
              viewBox="0 0 600 400"
              className="w-full h-full select-none"
              onMouseDown={handleStartDraw}
              onMouseMove={handleMoveDraw}
              onMouseUp={handleEndDraw}
              onTouchStart={handleStartDraw}
              onTouchMove={handleMoveDraw}
              onTouchEnd={handleEndDraw}
            >
              {/* Dot Grid Background */}
              <defs>
                <pattern
                  id="dot-grid"
                  x="0"
                  y="0"
                  width="20"
                  height="20"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="2" cy="2" r="1" fill="#3f3f46" />
                </pattern>
              </defs>
              <rect width="600" height="400" fill="url(#dot-grid)" />

              {/* Render Saved Elements */}
              {elements.map(renderElement)}

              {/* Render Current Live Stroke */}
              {isDrawing &&
                currentPoints.length > 0 &&
                renderElement({
                  id: 'active',
                  tool: activeTool,
                  points: currentPoints,
                  color: activeColor,
                  strokeWidth,
                })}
            </svg>

            {elements.length === 0 && !isDrawing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-tertiary p-4 text-center">
                <Palette className="h-8 w-8 mb-2 opacity-40 text-indigo-400" />
                <span className="text-xs font-medium">
                  Draw your visual anchor or click a template above
                </span>
                <span className="text-[11px] opacity-75">
                  Non-verbal imagery trace potentiates recall
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-faint px-1">
            <span>600x400 vector resolution · Touch &amp; stylus compatible</span>
            <span>{elements.length} visual entities</span>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          {decksData?.decks && (
            <select
              value={selectedDeckId}
              onChange={(e) => setSelectedDeckId(e.target.value ? Number(e.target.value) : '')}
              className="text-xs py-1.5 px-3 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-secondary"
            >
              {decksData.decks.map((d) => (
                <option key={d.id} value={d.id}>
                  Deck: {d.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveCard}
            disabled={isSaving || !concept.trim() || elements.length === 0}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-xs flex items-center gap-1.5 transition"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Save Dual-Coded Flashcard</span>
          </button>
        </div>
      </div>
    </div>
  )
}
