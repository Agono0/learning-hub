'use client'

import React, { useState } from 'react'
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Flame,
  Lightbulb,
  Plus,
  Scale,
  Shield,
  Sparkles,
} from 'lucide-react'
import {
  evaluateToulminGraph,
  type ToulminArgumentGraph,
  type ToulminNodeType,
} from '@learning-hub/core/dialectic'
import { cx } from './cx'

export interface ToulminArgumentHUDProps {
  graph: ToulminArgumentGraph
  onAddNode?: (type: ToulminNodeType) => void
  onChallengeNode?: (nodeId: string) => void
  onExportCards?: () => void
  className?: string
}

const NODE_TYPE_META: Record<
  ToulminNodeType,
  { label: string; color: string; badge: string; icon: React.ReactNode; hint: string }
> = {
  claim: {
    label: 'Claim',
    color: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
    badge: 'bg-indigo-500/20 text-indigo-300',
    icon: <Sparkles className="h-3 w-3" />,
    hint: 'Central assertion being established',
  },
  ground: {
    label: 'Grounds',
    color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    badge: 'bg-emerald-500/20 text-emerald-300',
    icon: <CheckCircle2 className="h-3 w-3" />,
    hint: 'Empirical data, observations & experimental facts',
  },
  warrant: {
    label: 'Warrant',
    color: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    badge: 'bg-amber-500/20 text-amber-300',
    icon: <Scale className="h-3 w-3" />,
    hint: 'Inferential principle connecting grounds to claim',
  },
  backing: {
    label: 'Backing',
    color: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
    badge: 'bg-cyan-500/20 text-cyan-300',
    icon: <Shield className="h-3 w-3" />,
    hint: 'Underlying scientific theoretical backing',
  },
  qualifier: {
    label: 'Qualifier',
    color: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
    badge: 'bg-purple-500/20 text-purple-300',
    icon: <Lightbulb className="h-3 w-3" />,
    hint: 'Boundary probability or degree of certainty',
  },
  rebuttal: {
    label: 'Rebuttal',
    color: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
    badge: 'bg-rose-500/20 text-rose-300',
    icon: <AlertTriangle className="h-3 w-3" />,
    hint: 'Conditions of exception where warrant fails',
  },
}

export function ToulminArgumentHUD({
  graph,
  onAddNode,
  onChallengeNode,
  onExportCards,
  className,
}: ToulminArgumentHUDProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [showVulnerabilities, setShowVulnerabilities] = useState(false)

  const evaluation = evaluateToulminGraph(graph)

  const rigorColor =
    evaluation.epistemicRigorScore >= 80
      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
      : evaluation.epistemicRigorScore >= 50
        ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
        : 'text-rose-400 border-rose-500/30 bg-rose-500/10'

  return (
    <div
      className={cx(
        'relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 shadow-2xl backdrop-blur-xl transition-all',
        className,
      )}
    >
      {/* Header telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-bold text-indigo-300">
              <Scale className="h-3 w-3" />
              Toulmin Argument Model (1958)
            </span>
            {evaluation.isBloomLevel6Synthesized && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-300 animate-pulse">
                <Award className="h-3 w-3 text-emerald-400" />
                Bloom Level 6: Evaluated
              </span>
            )}
          </div>
          <h3 className="text-base font-bold text-white tracking-tight">{graph.topic}</h3>
        </div>

        {/* Epistemic Rigor Score Meter */}
        <div className="flex items-center gap-3">
          <div className={cx('flex items-center gap-2 rounded-xl border px-3 py-1.5', rigorColor)}>
            <div className="text-right">
              <span className="text-[10px] uppercase font-semibold block leading-none opacity-80">
                Epistemic Rigor
              </span>
              <span className="font-mono text-base font-black leading-none">
                {evaluation.epistemicRigorScore}%
              </span>
            </div>
            <div className="h-6 w-1 rounded-full bg-current opacity-30" />
            <span className="text-xs font-semibold">
              {evaluation.epistemicRigorScore >= 80
                ? 'Robust'
                : evaluation.epistemicRigorScore >= 50
                  ? 'Moderate'
                  : 'Fragile'}
            </span>
          </div>

          {onExportCards && (
            <button
              type="button"
              onClick={onExportCards}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 transition-all shadow-sm"
              title="Convert Argument Elements into Spaced Retrieval Cards"
            >
              <FileText className="h-3.5 w-3.5 text-indigo-400" />
              <span>Export Cards</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 divide-x divide-white/5 border-b border-white/5 bg-slate-950/40 text-center text-xs">
        <div className="p-2.5">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">
            Grounding Ratio
          </span>
          <span className="font-mono text-sm font-bold text-slate-200">
            {Math.round(evaluation.groundingRatio * 100)}%
          </span>
        </div>
        <div className="p-2.5">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">
            Warrant Backing
          </span>
          <span className="font-mono text-sm font-bold text-slate-200">
            {Math.round(evaluation.warrantBackingRatio * 100)}%
          </span>
        </div>
        <div className="p-2.5">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">
            Boundary Defeaters
          </span>
          <span className="font-mono text-sm font-bold text-slate-200">
            {Math.round(evaluation.rebuttalIntegrity * 100)}%
          </span>
        </div>
      </div>

      {/* Interactive Node Matrix */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Argument Elements ({graph.nodes.length})
          </span>
          {onAddNode && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onAddNode('ground')}
                className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-all"
              >
                <Plus className="h-3 w-3" /> Ground
              </button>
              <button
                type="button"
                onClick={() => onAddNode('warrant')}
                className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 transition-all"
              >
                <Plus className="h-3 w-3" /> Warrant
              </button>
              <button
                type="button"
                onClick={() => onAddNode('rebuttal')}
                className="flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 transition-all"
              >
                <Plus className="h-3 w-3" /> Rebuttal
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {graph.nodes.map((node) => {
            const meta = NODE_TYPE_META[node.type]
            const isSelected = selectedNodeId === node.id
            return (
              <div
                key={node.id}
                onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                className={cx(
                  'cursor-pointer rounded-xl border p-3 transition-all relative overflow-hidden group',
                  meta.color,
                  isSelected
                    ? 'ring-2 ring-white/40 shadow-lg'
                    : 'hover:border-white/20 hover:bg-white/5',
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span
                    className={cx(
                      'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                      meta.badge,
                    )}
                  >
                    {meta.icon}
                    {meta.label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {node.verified && (
                      <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5">
                        <CheckCircle2 className="h-3 w-3" /> Verified
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 font-mono">
                      {Math.round(node.confidence * 100)}%
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-100 font-medium leading-relaxed line-clamp-2">
                  {node.text}
                </p>

                {isSelected && (
                  <div className="mt-3 border-t border-white/10 pt-2 flex items-center justify-between gap-2 animate-fadeIn text-[11px]">
                    <span className="text-slate-400 italic">{meta.hint}</span>
                    {onChallengeNode && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onChallengeNode(node.id)
                        }}
                        className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 font-semibold text-white hover:bg-white/20 transition-all"
                      >
                        <Flame className="h-3 w-3 text-amber-400" /> Challenge Node
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Structural Vulnerabilities Dropdown */}
      {evaluation.structuralVulnerabilities.length > 0 && (
        <div className="border-t border-white/10 bg-slate-950/60 p-4">
          <button
            type="button"
            onClick={() => setShowVulnerabilities((p) => !p)}
            className="flex w-full items-center justify-between text-xs font-semibold text-amber-300"
          >
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>
                {evaluation.structuralVulnerabilities.length} Dialectical Vulnerabilities Detected
              </span>
            </div>
            {showVulnerabilities ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          {showVulnerabilities && (
            <div className="mt-3 space-y-2 text-xs">
              {evaluation.structuralVulnerabilities.map((v, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-slate-300 space-y-1"
                >
                  <p className="font-semibold text-amber-200">{v.issue}</p>
                  <p className="text-[11px] text-slate-400">{v.recommendation}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
