import React from 'react'
import { Badge } from './Feedback'
import { ProgressBar } from './Progress'

export interface SuccessiveRelearningHUDProps {
  currentSessionIndex: number
  totalSessions: number
  sessionCriterionPercent: number
  activeQueueCount: number
  completedCount: number
  ebbinghausSavingsPercent: number
  retentionDecayLambda: number
  estimatedRetention: number
  nextSessionDueInDays: number | null
  onAdvanceSession?: () => void
  canAdvanceSession?: boolean
}

export function SuccessiveRelearningHUD({
  currentSessionIndex,
  totalSessions,
  sessionCriterionPercent,
  activeQueueCount,
  completedCount,
  ebbinghausSavingsPercent,
  retentionDecayLambda,
  estimatedRetention,
  nextSessionDueInDays,
  onAdvanceSession,
  canAdvanceSession,
}: SuccessiveRelearningHUDProps) {
  const isAcquisition = currentSessionIndex === 0
  const isAllComplete = currentSessionIndex >= totalSessions

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) p-5 shadow-sm space-y-5">
      {/* Top Header & Session Wave Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-wider uppercase text-secondary">
              Successive Relearning &amp; Ebbinghaus Savings HUD
            </span>
            <Badge tone={isAcquisition ? 'accent' : 'success'}>
              {isAcquisition
                ? 'Wave 0: Initial Acquisition'
                : `Relearning Wave ${currentSessionIndex} / ${totalSessions}`}
            </Badge>
            {isAllComplete && <Badge tone="success">Mastery Schedule Complete</Badge>}
            <Badge tone="neutral">Rawson &amp; Dunlosky (2012)</Badge>
          </div>
          <h3 className="text-base font-medium text-strong">
            {isAcquisition
              ? 'Acquire items to criterion. Each failed item rotates until verified.'
              : `Distributed relearning session ${currentSessionIndex}. Testing recall & measuring Ebbinghaus savings.`}
          </h3>
        </div>

        {/* Advance Wave CTA */}
        {canAdvanceSession && onAdvanceSession && (
          <button
            type="button"
            onClick={onAdvanceSession}
            className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
          >
            Advance to Next Wave →
          </button>
        )}
      </div>

      {/* Telemetry Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Session Criterion Completion */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-strong">Dropout Criterion</span>
            <span className="font-bold text-strong">{sessionCriterionPercent}%</span>
          </div>
          <ProgressBar value={sessionCriterionPercent / 100} />
          <div className="flex justify-between text-[11px] text-secondary">
            <span>{activeQueueCount} in active rotation</span>
            <span className="text-status-success-text dark:text-status-success-text font-medium">
              {completedCount} to criterion
            </span>
          </div>
        </div>

        {/* Metric 2: Ebbinghaus Savings Metric */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-strong">Ebbinghaus Savings</span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">
              {isAcquisition ? 'Baseline' : `${ebbinghausSavingsPercent}%`}
            </span>
          </div>
          <ProgressBar value={isAcquisition ? 0.05 : ebbinghausSavingsPercent / 100} />
          <div className="flex justify-between text-[11px] text-secondary">
            <span>Trials saved vs Wave 0</span>
            <span className="text-secondary font-medium">
              {isAcquisition ? 'Setting Baseline' : 'Effort Reduced'}
            </span>
          </div>
        </div>

        {/* Metric 3: Forgetting Decay Deceleration */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-strong">Decay Constant (λ)</span>
            <span className="font-bold text-status-warning-text dark:text-status-warning-text">
              {retentionDecayLambda.toFixed(4)}
            </span>
          </div>
          <ProgressBar value={Math.max(0.1, 1 - retentionDecayLambda / 0.12)} />
          <div className="flex justify-between text-[11px] text-secondary">
            <span>Baseline: 0.1200</span>
            <span className="text-status-success-text dark:text-status-success-text font-medium">
              Decelerating Rate
            </span>
          </div>
        </div>

        {/* Metric 4: Cohort Retention Confidence */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-strong">Retention Probability</span>
            <span className="font-bold text-status-success-text dark:text-status-success-text text-sm">
              {Math.round(estimatedRetention * 100)}%
            </span>
          </div>
          <ProgressBar value={estimatedRetention} />
          <div className="flex justify-between text-[11px] text-secondary">
            <span>
              {nextSessionDueInDays !== null ? `Due in ${nextSessionDueInDays}d` : 'Mastery Locked'}
            </span>
            <span className="text-secondary font-medium">Dunlosky Target: &gt;85%</span>
          </div>
        </div>
      </div>

      {/* Research Citation Callout */}
      <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/40 p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-indigo-700 dark:text-indigo-300">
        <div>
          <strong>Rawson &amp; Dunlosky (2012):</strong> &ldquo;Successive relearning yields large
          and durable gains in retention when items are practiced to a criterion of 1–2 correct
          recalls across spaced relearning intervals.&rdquo;
        </div>
        <Badge tone="accent">d &gt; 1.5 Effect Size</Badge>
      </div>
    </div>
  )
}
