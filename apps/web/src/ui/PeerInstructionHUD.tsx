/**
 * Learning HUB — Peer Instruction & ConcepTest HUD
 *
 * Real-time cognitive telemetry tracking:
 * - Eric Mazur (1997, 2001) Peer Instruction & Mazur Decision Window
 * - Richard Hake (1998) Normalized Learning Gain (<g>)
 * - Michelle Smith et al. (Science 2009) Isomorphic Transfer Verification
 * - Mazur Polarization Index (PI) & Distractor Entropy
 * - Peer Discussion Convergence Ratio (DCR)
 */

import React from 'react'
import type { PIMetrics } from '@learning-hub/core/peer-instruction'
import { Badge } from './Feedback'
import { Panel } from './Panel'
import { ProgressBar } from './Progress'
import {
  Award,
  GraduationCap,
  HelpCircle,
  MessageSquare,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'

export interface PeerInstructionHUDProps {
  metrics: PIMetrics
  activeSuiteTitle?: string
  className?: string
}

export function PeerInstructionHUD({
  metrics,
  activeSuiteTitle,
  className = '',
}: PeerInstructionHUDProps) {
  const engagementMeta: Record<
    PIMetrics['engagementBand'],
    {
      label: string
      tone: 'neutral' | 'warning' | 'accent' | 'success'
      desc: string
    }
  > = {
    'Exceptional Interactive Engagement': {
      label: 'Exceptional Interactive Gain (Hake <g> ≥ 0.70)',
      tone: 'success',
      desc: 'High normalized gain; student peer discussion resolved core misconceptions with robust transfer',
    },
    'Robust Conceptual Gain': {
      label: 'Robust Conceptual Gain (0.45 ≤ <g> < 0.70)',
      tone: 'accent',
      desc: 'Substantial mental model restructuring following peer deliberation',
    },
    'Moderate Discussion Convergence': {
      label: 'Moderate Discussion Convergence (0.25 ≤ <g> < 0.45)',
      tone: 'neutral',
      desc: 'Partial consensus; some surface-level reasoning persists',
    },
    'Transmissionist Baseline': {
      label: 'Transmissionist Baseline (<g> < 0.25)',
      tone: 'warning',
      desc: 'Misconception entrenched; requires instructor canonical intervention',
    },
  }

  const windowMeta: Record<
    PIMetrics['mazurWindowRecommendedAction'],
    { label: string; tone: 'warning' | 'accent' | 'success' }
  > = {
    re_explain: {
      label: 'Mazur: Direct Re-Explanation Required (<30% Correct)',
      tone: 'warning',
    },
    peer_discussion: {
      label: 'Mazur: Optimal Peer Discussion Window (30%-70% Correct)',
      tone: 'accent',
    },
    proceed: {
      label: 'Mazur: Mastery Achieved — Brief Synthesis (>70% Correct)',
      tone: 'success',
    },
  }

  const currentEngagement = engagementMeta[metrics.engagementBand]
  const currentWindow = windowMeta[metrics.mazurWindowRecommendedAction]

  return (
    <Panel
      className={`p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4 ${className}`}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-sky-500/10 text-status-info-text dark:text-status-info-text">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Peer Instruction Telemetry
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-(--hub-panel-2) text-secondary font-mono">
                Mazur-Smith Engine
              </span>
            </div>
            <h3 className="text-sm font-bold text-strong">
              {activeSuiteTitle || 'Interactive ConcepTest Deliberation'}
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={currentWindow.tone} className="text-xs font-medium">
            <MessageSquare className="w-3.5 h-3.5 mr-1" />
            {currentWindow.label}
          </Badge>
          <Badge tone={currentEngagement.tone} className="text-xs font-medium">
            <Award className="w-3.5 h-3.5 mr-1" />
            {currentEngagement.label}
          </Badge>
        </div>
      </div>

      {/* 4-Metric Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Hake Normalized Learning Gain <g> */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Hake Gain ⟨g⟩</span>
            <TrendingUp className="w-3.5 h-3.5 text-status-success-text" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-strong">
              {metrics.hakeNormalizedGain.toFixed(2)}
            </span>
            <span className="text-[11px] text-secondary">normalized</span>
          </div>
          <p className="text-[10px] text-tertiary truncate">(post - pre) / (100 - pre)</p>
        </div>

        {/* Mazur Polarization Index (PI) */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Vote Polarization (PI)</span>
            <HelpCircle className="w-3.5 h-3.5 text-ac-text" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
              {`${(metrics.mazurPolarizationIndex * 100).toFixed(0)}%`}
            </span>
            <span className="text-[11px] text-secondary">entropy</span>
          </div>
          <p className="text-[10px] text-tertiary truncate">Cognitive spread across choices</p>
        </div>

        {/* Peer Discussion Convergence (DCR) */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Convergence Ratio</span>
            <Users className="w-3.5 h-3.5 text-status-warning-text" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-strong">
              {`${(metrics.peerDiscussionConvergence * 100).toFixed(0)}%`}
            </span>
            <span className="text-[11px] text-secondary">consensus</span>
          </div>
          <p className="text-[10px] text-tertiary truncate">Paired resolution rate</p>
        </div>

        {/* Isomorphic Transfer Score (Q2) */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Smith Q2 Transfer</span>
            <Target className="w-3.5 h-3.5 text-status-info-text" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-status-info-text dark:text-status-info-text">
              {`${metrics.isomorphicTransferScore}%`}
            </span>
            <span className="text-[11px] text-secondary">isomorphic</span>
          </div>
          <p className="text-[10px] text-tertiary truncate">Novel context invariance</p>
        </div>
      </div>

      {/* Progress & Hake Gain Bar */}
      <div className="space-y-2 pt-1 border-t border-neutral-200 dark:border-(--hub-border)">
        <div className="flex items-center justify-between text-xs">
          <span className="text-secondary font-medium flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-status-warning-text" />
            Hake Interactive Learning Gain
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-strong">
              ⟨g⟩ = {metrics.hakeNormalizedGain.toFixed(2)}
            </span>
            <span className="text-[11px] text-tertiary">
              {metrics.smithLearningVerification
                ? '(Smith 2009: Verified Schema Restructuring)'
                : '(Awaiting Transfer Verification)'}
            </span>
          </div>
        </div>
        <ProgressBar value={Math.max(0, Math.min(1.0, metrics.hakeNormalizedGain))} />
      </div>

      {/* Diagnostic & Pedagogical Advice banner */}
      <div className="p-3 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2)/50 border border-neutral-200 dark:border-(--hub-border) text-xs space-y-1">
        <div className="flex items-center gap-1.5 font-semibold text-strong">
          <GraduationCap className="w-3.5 h-3.5 text-status-info-text" />
          <span>Peer Instruction Diagnostic</span>
        </div>
        <p className="text-secondary leading-relaxed">{metrics.qualitativeSummary}</p>
        <p className="text-tertiary text-[11px]">
          <strong className="text-secondary">Instructional Guidance: </strong>
          {metrics.pedagogicalAdvice}
        </p>
      </div>
    </Panel>
  )
}
