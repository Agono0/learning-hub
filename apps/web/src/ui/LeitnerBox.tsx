import type { ReactNode } from 'react'
import { CheckCircle2, Layers } from 'lucide-react'
import { Badge } from './Feedback'
import { cx } from './cx'

export interface LeitnerBoxData {
  /** Box level (typically 1 to 5) */
  level: number
  /** Box title or stage name */
  title: string
  /** Total count of items currently residing in this box */
  count: number
  /** Items due for review today */
  dueCount?: number
  /** Spaced interval description (e.g. "1 day", "3 days", "7 days", "14 days", "30 days") */
  interval: string
  /** Estimated retention probability (0 to 1) */
  estimatedRetention?: number
}

export interface LeitnerProgressionProps {
  /** List of 5 Leitner tier boxes */
  boxes: LeitnerBoxData[]
  /** Currently selected box level */
  selectedLevel?: number
  /** Callback triggered when a box is clicked */
  onSelectBox?: (level: number) => void
  /** Additional container classes */
  className?: string
}

const TIER_ACCENTS: Record<number, { bg: string; text: string; ring: string; border: string }> = {
  1: {
    bg: 'bg-rose-500/10 dark:bg-rose-500/15',
    text: 'text-rose-600 dark:text-danger-text',
    ring: 'focus-visible:ring-rose-500',
    border: 'border-rose-500/20 hover:border-rose-500/40',
  },
  2: {
    bg: 'bg-amber-500/10 dark:bg-amber-500/15',
    text: 'text-status-warning-text dark:text-status-warning-text',
    ring: 'focus-visible:ring-amber-500',
    border: 'border-amber-500/20 hover:border-amber-500/40',
  },
  3: {
    bg: 'bg-indigo-500/10 dark:bg-indigo-500/15',
    text: 'text-indigo-600 dark:text-indigo-400',
    ring: 'focus-visible:ring-indigo-500',
    border: 'border-indigo-500/20 hover:border-indigo-500/40',
  },
  4: {
    bg: 'bg-sky-500/10 dark:bg-sky-500/15',
    text: 'text-status-info-text dark:text-status-info-text',
    ring: 'focus-visible:ring-sky-500',
    border: 'border-sky-500/20 hover:border-sky-500/40',
  },
  5: {
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
    text: 'text-status-success-text dark:text-status-success-text',
    ring: 'focus-visible:ring-emerald-500',
    border: 'border-emerald-500/20 hover:border-emerald-500/40',
  },
}

/**
 * Visual Leitner Multi-Box Progression HUD conforming to getdesign.md.
 * Displays spaced repetition conveyor stages from Box 1 (Acquisition) to Box 5 (Mastery).
 */
export function LeitnerProgression({
  boxes,
  selectedLevel,
  onSelectBox,
  className,
}: LeitnerProgressionProps): ReactNode {
  const totalCards = boxes.reduce((acc, b) => acc + b.count, 0)
  const totalDue = boxes.reduce((acc, b) => acc + (b.dueCount ?? 0), 0)
  const masteredCount = boxes.find((b) => b.level === 5)?.count ?? 0
  const masteryPercentage = totalCards > 0 ? Math.round((masteredCount / totalCards) * 100) : 0

  return (
    <div className={cx('panel-glass p-5 space-y-5', className)}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              Leitner Progression Conveyor
              {masteryPercentage >= 50 && (
                <Badge tone="success" dot>
                  {masteryPercentage}% Mastered
                </Badge>
              )}
            </h3>
            <p className="text-xs text-tertiary dark:text-faint">
              {totalCards} total cards · {totalDue} due for review across 5 retention tiers
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {totalDue > 0 ? (
            <Badge tone="danger" pulse>
              {totalDue} Due Now
            </Badge>
          ) : (
            <Badge tone="neutral">All caught up</Badge>
          )}
        </div>
      </div>

      {/* Conveyor grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {boxes.map((box) => {
          const isSelected = selectedLevel === box.level
          const accent = TIER_ACCENTS[box.level] ?? TIER_ACCENTS[1]
          const retentionPct =
            box.estimatedRetention != null ? Math.round(box.estimatedRetention * 100) : null

          return (
            <button
              key={box.level}
              type="button"
              onClick={() => onSelectBox?.(box.level)}
              className={cx(
                'relative flex flex-col justify-between rounded-xl p-3.5 text-left border transition-all duration-200 cursor-pointer',
                'focus:outline-none focus-visible:ring-2',
                accent.ring,
                isSelected
                  ? 'bg-neutral-900/5 dark:bg-neutral-100/10 shadow-sm ' + accent.border
                  : 'bg-neutral-500/5 hover:bg-neutral-500/10 ' + accent.border,
              )}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={cx(
                      'inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-semibold border',
                      accent.bg,
                      accent.text,
                    )}
                  >
                    Box {box.level}
                  </span>
                  <span className="text-[11px] font-mono text-faint dark:text-tertiary">
                    {box.interval}
                  </span>
                </div>

                <div className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-baseline gap-1.5">
                  {box.count}
                  <span className="text-xs font-normal text-tertiary dark:text-faint">cards</span>
                </div>

                <div className="text-xs font-medium text-neutral-600 dark:text-secondary mt-0.5 truncate">
                  {box.title}
                </div>
              </div>

              {/* Footer details */}
              <div className="mt-3 pt-2.5 border-t border-neutral-200/40 dark:border-neutral-800/60 flex items-center justify-between text-[11px]">
                {box.dueCount && box.dueCount > 0 ? (
                  <span className="text-danger-text dark:text-danger-text font-medium">
                    {box.dueCount} due
                  </span>
                ) : (
                  <span className="text-faint flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-status-success-text" /> caught up
                  </span>
                )}

                {retentionPct != null && (
                  <span className="text-faint dark:text-tertiary font-mono">
                    {retentionPct}% ret.
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
