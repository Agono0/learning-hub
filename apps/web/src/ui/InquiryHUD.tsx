/**
 * Learning HUB — Scientific Inquiry & Dual-Space Discovery HUD
 *
 * Real-time cognitive telemetry tracking:
 * - David Klahr & Kevin Dunbar (1988) Scientific Discovery as Dual Search (SDDS)
 * - Zhe Chen & David Klahr (1999) Control of Variables Strategy (VOTAT)
 * - Clark Chinn & William Brewer (1993) Anomalous Data Epistemic Taxonomy
 * - Peter Wason (1960) Confirmation Bias Index (CBI)
 * - Composite Scientific Discovery Index (SDI)
 */

import React from 'react'
import type { InquiryMetrics } from '@learning-hub/core/inquiry'
import { Badge } from './Feedback'
import { Panel } from './Panel'
import { ProgressBar } from './Progress'
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  FlaskConical,
  GraduationCap,
  Microscope,
  RotateCcw,
  Sparkles,
  Target,
} from 'lucide-react'

export interface InquiryHUDProps {
  metrics: InquiryMetrics
  activeLabTitle?: string
  className?: string
}

export function InquiryHUD({ metrics, activeLabTitle, className = '' }: InquiryHUDProps) {
  const bandMeta: Record<
    InquiryMetrics['inquiryMasteryBand'],
    {
      label: string
      tone: 'neutral' | 'warning' | 'accent' | 'success'
      desc: string
    }
  > = {
    'Master Empirical Scientist': {
      label: 'Master Empirical Scientist (SDI ≥ 85)',
      tone: 'success',
      desc: 'Rigorous VOTAT isolation, active Popperian falsification, and authentic schema restructuring',
    },
    'Methodical Investigator': {
      label: 'Methodical Investigator (70 ≤ SDI < 85)',
      tone: 'accent',
      desc: 'Systematic parameter control with moderate confirmation bias sensitivity',
    },
    'Emerging Experimenter': {
      label: 'Emerging Experimenter (50 ≤ SDI < 70)',
      tone: 'neutral',
      desc: 'Partial variable isolation; occasional confounding variables introduced',
    },
    'Unsystematic Explorer': {
      label: 'Unsystematic Explorer (SDI < 50)',
      tone: 'warning',
      desc: 'High multi-variable confounding and persistent confirmation bias',
    },
  }

  const currentBand = bandMeta[metrics.inquiryMasteryBand]

  return (
    <Panel
      className={`p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4 ${className}`}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <Microscope className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Inquiry &amp; Discovery Telemetry
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-(--hub-panel-2) text-secondary font-mono">
                Klahr-Dunbar SDDS Engine
              </span>
            </div>
            <h3 className="text-sm font-bold text-strong">
              {activeLabTitle || 'Empirical Laboratory Crucible'}
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={currentBand.tone} className="text-xs font-medium">
            <Award className="w-3.5 h-3.5 mr-1" />
            {currentBand.label}
          </Badge>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* 1. VOTAT Rigor Index */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>VOTAT Rigor (VRI)</span>
            <Target className="w-3.5 h-3.5 text-teal-500" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-strong">
              {`${(metrics.votatRigorIndex * 100).toFixed(0)}%`}
            </span>
            <span className="text-[11px] text-secondary">isolated</span>
          </div>
          <p className="text-[10px] text-tertiary truncate">Chen &amp; Klahr 1999</p>
        </div>

        {/* 2. Confirmation Bias Index */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Confirmation Bias</span>
            {metrics.confirmationBiasIndex > 0.75 ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-status-success-text" />
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-strong">
              {`${(metrics.confirmationBiasIndex * 100).toFixed(0)}%`}
            </span>
            <span className="text-[11px] text-secondary">positive tests</span>
          </div>
          <p className="text-[10px] text-tertiary truncate">Wason 1960 Ratio</p>
        </div>

        {/* 3. Anomalous Data Resolution */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Anomaly Resolution</span>
            <RotateCcw className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-strong">
              {`${metrics.anomalousDataResolutionIndex}%`}
            </span>
            <span className="text-[11px] text-secondary">epistemic</span>
          </div>
          <p className="text-[10px] text-tertiary truncate">Chinn &amp; Brewer 1993</p>
        </div>

        {/* 4. Scientific Discovery Index */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Discovery Index</span>
            <FlaskConical className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-teal-600 dark:text-teal-400">
              {metrics.scientificDiscoveryIndex}
            </span>
            <span className="text-[11px] text-secondary">/ 100 SDI</span>
          </div>
          <p className="text-[10px] text-tertiary truncate">Composite score</p>
        </div>
      </div>

      {/* SDDS Search Efficiency Ratio Progress Bar */}
      <div className="space-y-2 pt-1 border-t border-neutral-200 dark:border-(--hub-border)">
        <div className="flex items-center justify-between text-xs">
          <span className="text-secondary font-medium flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            SDDS Dual-Space Search Efficiency
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-strong">
              {`${(metrics.sddsSearchEfficiencyRatio * 100).toFixed(0)}%`}
            </span>
            <span className="text-[11px] text-tertiary">
              (Hypothesis ↔ Experiment Space Coupling)
            </span>
          </div>
        </div>
        <ProgressBar value={metrics.sddsSearchEfficiencyRatio * 100} className="h-2" />
      </div>

      {/* Qualitative Diagnostic & Pedagogical Advice */}
      <div className="p-3 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2)/50 border border-neutral-200 dark:border-(--hub-border) text-xs space-y-1">
        <div className="flex items-center gap-1.5 font-semibold text-strong">
          <GraduationCap className="w-3.5 h-3.5 text-teal-500" />
          <span>Scientific Discovery Diagnostic</span>
        </div>
        <p className="text-secondary leading-relaxed">{metrics.qualitativeDiagnostic}</p>
        <p className="text-tertiary text-[11px]">
          <strong className="text-secondary">Instructional Guidance: </strong>
          {metrics.pedagogicalAdvice}
        </p>
      </div>
    </Panel>
  )
}
