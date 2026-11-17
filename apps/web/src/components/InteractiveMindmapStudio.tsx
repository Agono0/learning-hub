'use client'

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Download, FileText, Network, Plus, Save, Sparkles } from 'lucide-react'
import {
  calculateRadialLayout,
  mindmapToCards,
  parseMarkdownOutline,
  type MindmapNode,
} from '@learning-hub/core/visual'
import { hapticLight, hapticMedium } from '../platform/haptics'
import { cx } from '../ui/cx'

export interface InteractiveMindmapStudioProps {
  initialTitle?: string
  initialMarkdown?: string
  onSaveMindmap?: (data: { title: string; markdown: string; nodes: MindmapNode[] }) => void
  onExportCards?: (cards: Array<{ front: string; back: string }>) => void
  className?: string
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

export function InteractiveMindmapStudio({
  initialTitle = 'Human Memory Architecture',
  initialMarkdown = DEFAULT_MARKDOWN,
  onSaveMindmap,
  onExportCards,
  className,
}: InteractiveMindmapStudioProps) {
  const [title, setTitle] = useState(initialTitle)
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [zoomLevel, setZoomLevel] = useState(1.0)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isMiningOpen, setIsMiningOpen] = useState(false)

  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })

  // Parse markdown into hierarchical tree & calculate coordinates
  const parsedTree = useMemo(() => {
    try {
      const parsed = parseMarkdownOutline(markdown)
      if (title) parsed.title = title
      return parsed
    } catch {
      return { title, nodes: [] }
    }
  }, [markdown, title])

  // Radial Layout Node Coordinates
  const layoutNodes: MindmapNode[] = useMemo(() => {
    if (parsedTree.nodes.length === 0) return []
    const flatHierarchy = parsedTree.nodes.map((n) => ({
      id: n.id,
      text: n.text,
      parentId: n.parentId ?? null,
    }))
    return calculateRadialLayout(title, flatHierarchy, 500, 400, 180)
  }, [parsedTree, title])

  // Automatically mined flashcard preview
  const minedCards = useMemo<Array<{ front: string; back: string }>>(() => {
    try {
      const generated = mindmapToCards(parsedTree)
      return generated.map((c) => ({
        front: c.content.basic?.front ?? '',
        back: c.content.basic?.back ?? '',
      }))
    } catch {
      return []
    }
  }, [parsedTree])

  const selectedNode = useMemo(() => {
    return layoutNodes.find((n) => n.id === selectedNodeId) || null
  }, [layoutNodes, selectedNodeId])

  // Node Click Selection
  const handleNodeClick = (node: MindmapNode, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedNodeId(node.id)
    setEditingText(node.text)
    hapticLight()
  }

  // Pan interaction
  const handleMouseDown = (e: React.MouseEvent) => {
    isPanningRef.current = true
    panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanningRef.current) return
    setPanOffset({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    })
  }

  const handleMouseUp = () => {
    isPanningRef.current = false
  }

  // Add Child to Selected Node
  const handleAddChild = () => {
    if (!selectedNodeId) return
    const newMarkdown = `${markdown}\n  - New Concept Node`
    setMarkdown(newMarkdown)
    hapticMedium()
  }

  // Export SVG to download
  const handleExportSvg = useCallback(() => {
    const svgElem = document.getElementById('mindmap-svg-root')
    if (!svgElem) return
    const svgData = new XMLSerializer().serializeToString(svgElem)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${title.toLowerCase().replace(/\s+/g, '-')}-mindmap.svg`
    link.click()
    URL.revokeObjectURL(url)
  }, [title])

  return (
    <div
      className={cx(
        'relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl transition-all',
        className,
      )}
    >
      {/* Mindmap Studio Header */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
            <Network className="h-4 w-4" />
          </div>
          <div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-transparent text-sm font-bold text-white tracking-tight outline-none focus:border-b focus:border-sky-400"
            />
            <p className="text-[11px] text-slate-400">
              Interactive radial concept editor with automated flashcard mining
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Card Miner Toggle */}
          <button
            type="button"
            onClick={() => setIsMiningOpen((prev) => !prev)}
            className={cx(
              'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all shadow-sm',
              isMiningOpen
                ? 'border-indigo-500/40 bg-indigo-600/30 text-indigo-200'
                : 'border-white/10 bg-white/5 text-slate-300 hover:text-white',
            )}
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span>Card Miner ({minedCards.length})</span>
          </button>

          {/* Export SVG */}
          <button
            type="button"
            onClick={handleExportSvg}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition-all shadow-sm"
          >
            <Download className="h-3.5 w-3.5 text-slate-400" />
            <span>SVG</span>
          </button>

          {/* Save Action */}
          {onSaveMindmap && (
            <button
              type="button"
              onClick={() => onSaveMindmap({ title, markdown, nodes: layoutNodes })}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-600/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 hover:text-white transition-all shadow-sm"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save Map</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Studio Viewport */}
      <div className="relative flex flex-1 flex-col lg:flex-row overflow-hidden min-h-[560px]">
        {/* Left: Interactive SVG Mindmap Canvas */}
        <div
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="relative flex-1 cursor-grab active:cursor-grabbing overflow-hidden bg-slate-950"
        >
          <svg
            id="mindmap-svg-root"
            viewBox="0 0 1000 800"
            className="h-full w-full select-none"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
              transformOrigin: '500px 400px',
              transition: isPanningRef.current ? 'none' : 'transform 0.15s ease-out',
            }}
          >
            {/* Draw Connecting Curved Splines */}
            {layoutNodes.map((node) => {
              if (!node.parentId) return null
              const parent = layoutNodes.find((n) => n.id === node.parentId)
              if (!parent) return null

              const dx = node.x - parent.x
              const _dy = node.y - parent.y
              const cx1 = parent.x + dx * 0.5
              const cy1 = parent.y
              const cx2 = parent.x + dx * 0.5
              const cy2 = node.y

              return (
                <path
                  key={`edge_${parent.id}_${node.id}`}
                  d={`M ${parent.x} ${parent.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${node.x} ${node.y}`}
                  fill="none"
                  stroke={node.color || '#6366f1'}
                  strokeWidth="2"
                  strokeOpacity="0.4"
                  strokeLinecap="round"
                />
              )
            })}

            {/* Draw Nodes */}
            {layoutNodes.map((node) => {
              const isSelected = node.id === selectedNodeId
              const isRoot = !node.parentId

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => handleNodeClick(node, e)}
                  className="cursor-pointer transition-transform duration-200"
                >
                  {/* Outer Glow */}
                  {isSelected && (
                    <circle
                      r={isRoot ? 48 : 34}
                      className="fill-sky-400/20 stroke-sky-400 stroke-2 animate-pulse"
                    />
                  )}

                  {/* Node Capsule */}
                  <rect
                    x={isRoot ? -70 : -55}
                    y={isRoot ? -24 : -18}
                    width={isRoot ? 140 : 110}
                    height={isRoot ? 48 : 36}
                    rx={isRoot ? 16 : 12}
                    className={cx(
                      'transition-colors duration-150',
                      isRoot
                        ? 'fill-indigo-600 stroke-indigo-400 stroke-2'
                        : isSelected
                          ? 'fill-slate-800 stroke-sky-400 stroke-2'
                          : 'fill-slate-900/90 stroke-white/10 hover:stroke-indigo-400',
                    )}
                  />

                  {/* Node Text Label */}
                  <text
                    textAnchor="middle"
                    dy="4"
                    className={cx(
                      'font-sans font-semibold tracking-tight',
                      isRoot ? 'fill-white text-xs' : 'fill-slate-200 text-[11px]',
                    )}
                  >
                    {node.text.length > 18 ? node.text.slice(0, 16) + '…' : node.text}
                  </text>
                </g>
              )
            })}
          </svg>

          {/* Canvas Floating Controls */}
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 p-1 backdrop-blur-md text-xs text-slate-300">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(2.0, z + 0.15))}
              className="h-7 w-7 rounded-lg hover:bg-white/10 flex items-center justify-center font-bold"
            >
              +
            </button>
            <span className="px-1 text-[11px] font-mono text-slate-400">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(0.4, z - 0.15))}
              className="h-7 w-7 rounded-lg hover:bg-white/10 flex items-center justify-center font-bold"
            >
              -
            </button>
            <button
              type="button"
              onClick={() => {
                setZoomLevel(1.0)
                setPanOffset({ x: 0, y: 0 })
              }}
              className="px-2 h-7 rounded-lg hover:bg-white/10 text-[11px]"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Right Sidebar: Markdown Outline & Card Miner */}
        <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-white/10 bg-slate-900/90 p-5 flex flex-col gap-4 backdrop-blur-xl">
          {/* Node Actions Toolbar */}
          {selectedNode && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white tracking-tight">Active Node</span>
                <span className="text-[10px] text-slate-400 font-mono">{selectedNode.id}</span>
              </div>
              <input
                type="text"
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddChild}
                  className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-indigo-500/30 bg-indigo-600/20 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/30 hover:text-white transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Branch</span>
                </button>
              </div>
            </div>
          )}

          {/* Flashcard Miner Drawer */}
          {isMiningOpen && (
            <div className="flex-1 rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Mined Flashcards ({minedCards.length})</span>
                </div>
                {onExportCards && (
                  <button
                    type="button"
                    onClick={() =>
                      onExportCards(
                        minedCards.map((c: { front: string; back: string }) => ({
                          front: c.front,
                          back: c.back,
                        })),
                      )
                    }
                    className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500 transition-all shadow-sm"
                  >
                    Export to Deck
                  </button>
                )}
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto max-h-56 pr-1">
                {minedCards.map((card: { front: string; back: string }, idx: number) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-white/5 bg-slate-900/80 p-3 text-xs space-y-1"
                  >
                    <p className="font-semibold text-slate-200">Q: {card.front}</p>
                    <p className="text-indigo-300 text-[11px]">A: {card.back}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Markdown Outline Editor */}
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-semibold text-slate-300">
                <FileText className="h-3.5 w-3.5 text-indigo-400" /> Outline Source
              </span>
              <span className="text-[11px]">Markdown format</span>
            </div>
            <textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              className="flex-1 w-full rounded-2xl border border-white/10 bg-slate-950 p-3 font-mono text-xs text-slate-300 outline-none focus:border-indigo-500 resize-none leading-relaxed"
              rows={8}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
