import type { ReactNode } from 'react'
import { Compass, ShieldAlert, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { Badge } from './Feedback'
import { cx } from './cx'

export interface MetacognitionRadarProps {
  /** Brier calibration score: 0 = perfect probability alignment, 1 = maximum error */
  brierScore: number
  /** Overconfidence / Underconfidence bias (-1 to 1) */
  bias: number
  /** Metacognitive state diagnosis */
  status: 'expertly_calibrated' | 'mild_overconfidence' | 'fluency_illusion' | 'underconfident'
  /** Recommended retrieval friction adjustment */
  difficultyAdjustment?:
    'escalate_to_free_production' | 'maintain_standard_spacing' | 'support_with_cues'
  /** Scientific guidance message */
  guidance?: string
  /** Sample trials count */
  sampleSize?: number
  className?: string
}

const STATUS_CONFIG = {
  expertly_calibrated: {
    label: 'Calibrated Intuition',
    badgeTone: 'success' as const,
    icon: Sparkles,
    color: 'text-status-success-text',
    description: 'Your subjective confidence matches your empirical recall accurately.',
  },
  mild_overconfidence: {
    label: 'Mild Overconfidence',
    badgeTone: 'warning' as const,
    icon: TrendingUp,
    color: 'text-status-warning-text',
    description: 'Subjective feeling of knowing slightly exceeds retrieval success.',
  },
  fluency_illusion: {
    label: 'Fluency Illusion (Dunning-Kruger)',
    badgeTone: 'danger' as const,
    icon: ShieldAlert,
    color: 'text-danger-text',
    description: 'Perceptual familiarity is deceiving you into believing material is mastered.',
  },
  underconfident: {
    label: 'Underconfidence Bias',
    badgeTone: 'cyan' as const,
    icon: TrendingDown,
    color: 'text-status-info-text',
    description: 'Actual recall is stronger than your self-predicted confidence.',
  },
}

/**
 * Metacognitive Calibration Radar HUD conforming to getdesign.md.
 * Grounded in Koriat & Bjork (2005) and Glenn Brier (1950).
 */
export function MetacognitionRadar({
  brierScore,
  bias,
  status,
  difficultyAdjustment = 'maintain_standard_spacing',
  guidance,
  sampleSize,
  className,
}: MetacognitionRadarProps): ReactNode {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.expertly_calibrated
  const StatusIcon = cfg.icon

  // Calibration accuracy percentage (1 - Brier score)
  const calibrationPct = Math.round(Math.max(0, 1 - brierScore) * 100)
  const biasPct = Math.round(bias * 100)

  return (
    <div className={cx('panel-glass p-5 space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              Metacognitive Calibration
              <Badge tone={cfg.badgeTone} pulse={status === 'fluency_illusion'}>
                {cfg.label}
              </Badge>
            </h3>
            <p className="text-xs text-tertiary dark:text-faint">
              Koriat &amp; Bjork fluency illusion index · {sampleSize ?? 0} trials analyzed
            </p>
          </div>
        </div>

        <div className="text-right">
          <div className="text-lg font-bold font-mono text-neutral-900 dark:text-neutral-100 flex items-center justify-end gap-1">
            <span>{calibrationPct}%</span>
            <span className="text-xs font-normal text-faint">calibrated</span>
          </div>
          <div className="text-[11px] text-tertiary dark:text-faint">
            Brier Score: {brierScore.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <div className="rounded-lg bg-neutral-500/5 border border-neutral-200/40 dark:border-neutral-800/60 p-3">
          <div className="text-xs text-tertiary dark:text-faint flex items-center justify-between">
            <span>Confidence Bias</span>
            {bias > 0 ? (
              <span className="text-danger-text font-semibold flex items-center gap-0.5 text-xs">
                <TrendingUp className="h-3 w-3" /> +{biasPct}% Over
              </span>
            ) : bias < 0 ? (
              <span className="text-status-info-text font-semibold flex items-center gap-0.5 text-xs">
                <TrendingDown className="h-3 w-3" /> {biasPct}% Under
              </span>
            ) : (
              <span className="text-status-success-text font-semibold text-xs">Neutral</span>
            )}
          </div>
          <div className="mt-1 text-xs text-neutral-600 dark:text-secondary">
            {bias > 0.15
              ? 'Over-predicting recall success. High risk of passive recognition.'
              : bias < -0.1
                ? 'Under-estimating mastery. You know more than you think.'
                : 'Balanced self-assessment.'}
          </div>
        </div>

        <div className="rounded-lg bg-neutral-500/5 border border-neutral-200/40 dark:border-neutral-800/60 p-3">
          <div className="text-xs text-tertiary dark:text-faint flex items-center justify-between">
            <span>Desirable Difficulty</span>
            <span className="font-semibold text-neutral-900 dark:text-neutral-100 text-xs uppercase tracking-wide">
              {difficultyAdjustment === 'escalate_to_free_production'
                ? 'Escalate Production'
                : difficultyAdjustment === 'support_with_cues'
                  ? 'Cue Support'
                  : 'Maintain Spacing'}
            </span>
          </div>
          <div className="mt-1 text-xs text-neutral-600 dark:text-secondary">
            {difficultyAdjustment === 'escalate_to_free_production'
              ? 'Switching from recognition to free recall to burst familiarity.'
              : difficultyAdjustment === 'support_with_cues'
                ? 'Providing positive retrieval feedback to bolster confidence.'
                : 'Optimal friction level.'}
          </div>
        </div>
      </div>

      {/* Advisory */}
      <div className="rounded-lg bg-indigo-500/5 border border-indigo-500/20 p-3 text-xs flex items-start gap-2.5">
        <StatusIcon className={cx('h-4 w-4 shrink-0 mt-0.5', cfg.color)} />
        <div className="text-neutral-700 dark:text-secondary">
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
            Metacognitive Advisory:{' '}
          </span>
          {guidance || cfg.description}
        </div>
      </div>
    </div>
  )
}
