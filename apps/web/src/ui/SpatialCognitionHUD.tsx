/**
 * Learning HUB — Spatial Cognition & Mental Rotation HUD
 *
 * Real-time cognitive telemetry tracking:
 * - Roger Shepard & Jacqueline Metzler (1971) Mental Rotation Velocity & Angular Disparity Latency
 * - Mary Hegarty (2004) Kinematic Step Coherence & Causal Propagation
 * - Barbara Tversky (1993, 2005) Spatial Alignment Heuristic Bias
 * - Spatial Visualization Index (SVI) & Skill Tier Progression
 */

import React from 'react'
import type { SpatialVisualizationMetrics } from '@learning-hub/core/spatial'
import { Badge } from './Feedback'
import { Panel } from './Panel'
import { ProgressBar } from './Progress'
import {
  Activity,
  AlertCircle,
  Award,
  CheckCircle2,
  Compass,
  Gauge,
  RotateCw,
  Zap,
} from 'lucide-react'

export interface SpatialCognitionHUDProps {
  metrics: SpatialVisualizationMetrics
  currentDisparityDeg: number
  measuredReactionTimeMs?: number
  expectedReactionTimeMs?: number
  isCongruentStimulus?: boolean
  className?: string
}

export function SpatialCognitionHUD({
  metrics,
  currentDisparityDeg,
  measuredReactionTimeMs,
  expectedReactionTimeMs,
  isCongruentStimulus,
  className = '',
}: SpatialCognitionHUDProps) {
  const tierMeta: Record<
    SpatialVisualizationMetrics['skillTier'],
    { label: string; tone: 'neutral' | 'warning' | 'accent' | 'success'; desc: string }
  > = {
    piecemeal_2d_rotator: {
      label: 'Piecemeal 2D Rotator',
      tone: 'warning',
      desc: 'High cognitive load on depth disparity; relies on sequential 2D slices',
    },
    constrained_3d_animator: {
      label: 'Constrained 3D Animator',
      tone: 'neutral',
      desc: 'Rotates 3D frames with moderate speed; susceptible to chirality inversions',
    },
    holistic_spatial_synthesizer: {
      label: 'Holistic Spatial Synthesizer',
      tone: 'accent',
      desc: 'Simulates continuous 3D rotations and multi-step kinematic chains',
    },
    master_spatial_modeler: {
      label: 'Master Spatial Modeler',
      tone: 'success',
      desc: 'Seamless coordinate frame switching and rapid mental SO(3) invariance',
    },
  }

  const currentTier = tierMeta[metrics.skillTier]

  return (
    <Panel
      className={`p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4 ${className}`}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-strong flex items-center gap-2">
              Spatial Cognition Telemetry
              <Badge tone={currentTier.tone} dot>
                {currentTier.label}
              </Badge>
            </h3>
            <p className="text-xs text-secondary">{currentTier.desc}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-secondary">Disparity:</span>
          <span className="font-mono font-bold text-strong bg-neutral-100 dark:bg-(--hub-panel-2) px-2 py-0.5 rounded border border-neutral-200 dark:border-(--hub-border)">
            {currentDisparityDeg}°
          </span>
          {isCongruentStimulus !== undefined && (
            <Badge tone={isCongruentStimulus ? 'success' : 'warning'}>
              {isCongruentStimulus ? 'Congruent (SO3)' : 'Chiral Mirror (Enantiomer)'}
            </Badge>
          )}
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* SVI Gauge */}
        <div className="p-3 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              SVI Index
            </span>
            <span className="font-mono font-medium text-strong">
              {Math.round(metrics.overallSpatialVisualizationIndex * 100)}%
            </span>
          </div>
          <ProgressBar value={metrics.overallSpatialVisualizationIndex} className="h-1.5" />
          <span className="text-[10px] text-secondary block truncate">
            Composite spatial dexterity
          </span>
        </div>

        {/* Mental Rotation Velocity */}
        <div className="p-3 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="flex items-center gap-1">
              <RotateCw className="w-3.5 h-3.5 text-status-info-text dark:text-status-info-text" />
              Rotation Speed
            </span>
            <span className="font-mono font-bold text-strong">
              {metrics.mentalRotationVelocityDegPerSec}{' '}
              <span className="text-[10px] text-secondary">°/s</span>
            </span>
          </div>
          <ProgressBar
            value={Math.min(1.0, metrics.mentalRotationVelocityDegPerSec / 320)}
            className="h-1.5"
          />
          <span className="text-[10px] text-secondary block truncate">
            Shepard-Metzler benchmark
          </span>
        </div>

        {/* Hegarty Kinematic Coherence */}
        <div className="p-3 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-status-success-text dark:text-status-success-text" />
              Kinematics
            </span>
            <span className="font-mono font-bold text-strong">
              {Math.round(metrics.kinematicStepCoherence * 100)}%
            </span>
          </div>
          <ProgressBar value={metrics.kinematicStepCoherence} className="h-1.5" />
          <span className="text-[10px] text-secondary block truncate">
            Hegarty causal coherence
          </span>
        </div>

        {/* Chirality Discrimination */}
        <div className="p-3 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-status-warning-text dark:text-status-warning-text" />
              Chirality Acc.
            </span>
            <span className="font-mono font-bold text-strong">
              {Math.round(metrics.chiralityDiscriminationAccuracy * 100)}%
            </span>
          </div>
          <ProgressBar value={metrics.chiralityDiscriminationAccuracy} className="h-1.5" />
          <span className="text-[10px] text-secondary block truncate">Reflection vs rotation</span>
        </div>
      </div>

      {/* Latency Comparison (Actual vs Shepard-Metzler Predicted) */}
      {measuredReactionTimeMs !== undefined && expectedReactionTimeMs !== undefined && (
        <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="text-secondary">Reaction Time Latency:</span>
            <span className="font-mono font-semibold text-strong">{measuredReactionTimeMs} ms</span>
            <span className="text-secondary font-mono">
              (Predicted: {expectedReactionTimeMs} ms)
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            {measuredReactionTimeMs <= expectedReactionTimeMs ? (
              <span className="text-status-success-text dark:text-status-success-text flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Fast Mental Rotation (+
                {expectedReactionTimeMs - measuredReactionTimeMs} ms lead)
              </span>
            ) : (
              <span className="text-secondary flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-status-warning-text" /> Piecemeal latency
                overhead (+
                {measuredReactionTimeMs - expectedReactionTimeMs} ms)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Diagnostic Recommendations */}
      {metrics.recommendations.length > 0 && (
        <div className="pt-1 text-xs space-y-1">
          <div className="text-[11px] font-medium text-secondary flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
            Adaptive Spatial Training Focus:
          </div>
          <ul className="list-disc list-inside text-secondary text-[11px] space-y-0.5">
            {metrics.recommendations.slice(0, 2).map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}
