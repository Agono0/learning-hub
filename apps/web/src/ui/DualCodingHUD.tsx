'use client'

/**
 * @file DualCodingHUD.tsx
 * @description Real-time Paivio Dual-Coding & Mayer CTML Multimedia Compliance HUD.
 *
 * Visualizes:
 * - Verbal (Logogen) vs Non-Verbal (Imagen) Dual-Channel Balance
 * - Paivio Additive Memory Multiplier (1.25x to 2.35x)
 * - Mayer (2014) Cognitive Theory of Multimedia Learning (CTML) Audit Score
 * - Spatial Contiguity Index & Split-Attention Detection
 * - Referential Connectivity Density
 */

import React from 'react'
import {
  DualCodingMetrics,
  MayerComplianceAudit,
} from '@learning-hub/core/multimodal/dual-coding-engine'
import { Badge } from './Feedback'
import { ProgressBar } from './Progress'
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Eye,
  Layers,
  Link as LinkIcon,
  Sparkles,
  Type,
  Zap,
} from 'lucide-react'

export interface DualCodingHUDProps {
  metrics: DualCodingMetrics
  audit: MayerComplianceAudit
  activeLogogenId?: string | null
  activeImagenId?: string | null
  className?: string
}

const STATUS_CONFIG: Record<
  DualCodingMetrics['status'],
  { label: string; tone: 'success' | 'warning' | 'danger' | 'cyan'; description: string }
> = {
  optimally_dual_coded: {
    label: 'Optimally Dual-Coded',
    tone: 'success',
    description:
      'Balanced verbal & pictorial codes with dense referential bindings. Maximum additive retention.',
  },
  partially_dual_coded: {
    label: 'Partially Dual-Coded',
    tone: 'cyan',
    description: 'Both channels active, but referential density or balance can be improved.',
  },
  purely_verbal_vulnerable: {
    label: 'Purely Verbal (High Load)',
    tone: 'warning',
    description: 'Unanchored text with zero visuospatial support. High cognitive load risk.',
  },
  purely_visual_unanchored: {
    label: 'Purely Visual (Unanchored)',
    tone: 'danger',
    description: 'Diagrammatic elements without semantic proposition anchors.',
  },
}

export function DualCodingHUD({
  metrics,
  audit,
  activeLogogenId,
  activeImagenId,
  className = '',
}: DualCodingHUDProps) {
  const {
    logogenCount,
    imagenCount,
    referentialLinkCount,
    dualCodingBalanceRatio,
    referentialDensity,
    dualCodingRetentionMultiplier,
    status,
  } = metrics

  const {
    overallComplianceScore,
    spatialContiguityScore,
    coherencePurityScore,
    signalingSalienceScore,
    segmentingModularityScore,
    identifiedViolations,
  } = audit

  const statusMeta = STATUS_CONFIG[status]

  return (
    <div
      className={`rounded-xl border border-border/80 bg-card/70 p-4 shadow-sm backdrop-blur-md ${className}`}
    >
      {/* Top Header & Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Dual-Coding &amp; Mayer CTML HUD
            </h3>
            <p className="text-xs text-muted-foreground">
              Paivio (1971) Additive Dual-Channel Model • Mayer (2014) Multimedia Learning
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
          {status === 'optimally_dual_coded' && (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-500 animate-pulse">
              <Sparkles className="h-3.5 w-3.5" /> 2x Dual Retrieval Paths
            </span>
          )}
        </div>
      </div>

      {/* Main Grid: Dual Channels & Mayer Compliance */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Column: Paivio Dual-Channel Architecture (6 cols) */}
        <div className="lg:col-span-6 flex flex-col justify-between rounded-lg border border-border/50 bg-muted/20 p-3.5 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-foreground">
            <span className="flex items-center gap-1.5">
              <Brain className="h-4 w-4 text-primary" /> Paivio Dual-Channel Subsystems
            </span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
              {dualCodingRetentionMultiplier}x Retention Boost
            </span>
          </div>

          {/* Dual Channels Visual Balance */}
          <div className="grid grid-cols-2 gap-3">
            {/* Verbal Stream (Logogens) */}
            <div
              className={`rounded-lg border p-2.5 transition-all ${
                activeLogogenId
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                  : 'border-border/60 bg-card'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span className="flex items-center gap-1 font-medium text-foreground">
                  <Type className="h-3.5 w-3.5 text-primary" /> Verbal (Logogens)
                </span>
                <span className="font-mono font-semibold">{logogenCount}</span>
              </div>
              <div className="text-[10px] text-muted-foreground leading-tight">
                Sequential propositions &amp; mathematical lemmas.
              </div>
            </div>

            {/* Non-Verbal Stream (Imagens) */}
            <div
              className={`rounded-lg border p-2.5 transition-all ${
                activeImagenId
                  ? 'border-sky-500 bg-sky-500/10 ring-1 ring-sky-500/40'
                  : 'border-border/60 bg-card'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span className="flex items-center gap-1 font-medium text-foreground">
                  <Eye className="h-3.5 w-3.5 text-sky-500" /> Visual (Imagens)
                </span>
                <span className="font-mono font-semibold">{imagenCount}</span>
              </div>
              <div className="text-[10px] text-muted-foreground leading-tight">
                Synchronous spatial topology &amp; state diagrams.
              </div>
            </div>
          </div>

          {/* Balance & Referential Density Progress */}
          <div className="space-y-2 pt-1">
            <div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                <span>Dual-Channel Balance Ratio:</span>
                <span className="font-mono font-semibold text-foreground">
                  {Math.round(dualCodingBalanceRatio * 100)}%
                </span>
              </div>
              <ProgressBar value={dualCodingBalanceRatio} />
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                <span className="flex items-center gap-1">
                  <LinkIcon className="h-3 w-3 text-emerald-500" /> Referential Link Density:
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {referentialLinkCount} links ({Math.round(referentialDensity * 100)}%)
                </span>
              </div>
              <ProgressBar value={referentialDensity} />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground leading-tight">
            {statusMeta.description}
          </p>
        </div>

        {/* Right Column: Mayer CTML Compliance Audit (6 cols) */}
        <div className="lg:col-span-6 flex flex-col justify-between rounded-lg border border-border/50 bg-card p-3.5 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-foreground">
            <span className="flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-amber-500" /> Mayer CTML Compliance Score
            </span>
            <span className="font-mono font-bold text-foreground">
              {overallComplianceScore} / 100
            </span>
          </div>

          {/* CTML Principles Breakdown Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Spatial Contiguity */}
            <div className="rounded-md border border-border/40 bg-muted/20 p-2">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Spatial Contiguity</span>
                <span className="font-mono font-semibold text-foreground">
                  {spatialContiguityScore}%
                </span>
              </div>
              <div className="mt-1">
                <ProgressBar value={spatialContiguityScore / 100} />
              </div>
            </div>

            {/* Coherence Purity */}
            <div className="rounded-md border border-border/40 bg-muted/20 p-2">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Coherence Purity</span>
                <span className="font-mono font-semibold text-foreground">
                  {coherencePurityScore}%
                </span>
              </div>
              <div className="mt-1">
                <ProgressBar value={coherencePurityScore / 100} />
              </div>
            </div>

            {/* Signaling Salience */}
            <div className="rounded-md border border-border/40 bg-muted/20 p-2">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Signaling Salience</span>
                <span className="font-mono font-semibold text-foreground">
                  {signalingSalienceScore}%
                </span>
              </div>
              <div className="mt-1">
                <ProgressBar value={signalingSalienceScore / 100} />
              </div>
            </div>

            {/* Segmenting Modularity */}
            <div className="rounded-md border border-border/40 bg-muted/20 p-2">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Segmenting Steps</span>
                <span className="font-mono font-semibold text-foreground">
                  {segmentingModularityScore}%
                </span>
              </div>
              <div className="mt-1">
                <ProgressBar value={segmentingModularityScore / 100} />
              </div>
            </div>
          </div>

          {/* Identified Violations or Green Check */}
          {identifiedViolations.length > 0 ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
              <span className="line-clamp-2">{identifiedViolations[0]}</span>
            </div>
          ) : (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>
                Full compliance with Mayer multimedia learning invariants. Zero split-attention.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
