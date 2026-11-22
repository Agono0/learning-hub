'use client'

/**
 * Idle-classify dialog (S3-78, the UI half of S3-33) — when the user
 * returns from an idle gap the core gate (`classifyIdle`) says what to
 * offer: keep tracking, take a break, or discard the dead time. The dialog
 * renders that verdict over the task being tracked and applies the choice
 * through `onResolve` (the page subtracts/log per the core
 * `applyIdleSubtraction` math).
 *
 * Max Focus suppresses the gate (S3-34): the caller passes the core
 * classification, so a suppressed verdict simply never opens this.
 */
import React from 'react'
import { Coffee, LogOut, Undo2 } from 'lucide-react'
import { Button, Sheet } from '@/ui'
import type { IdleClassification } from '@learning-hub/core'

/** One of the three S3-78 actions. */
export type IdleAction = 'assign' | 'break' | 'discard'

/** Minutes label for the gap (floor 1 — any surfaced gap is ≥ the ignore). */
export function gapMinutes(idleMs: number): number {
  return Math.max(1, Math.round(idleMs / 60_000))
}

export interface IdleClassifyDialogProps {
  open: boolean
  onClose: () => void
  /** The core gate's verdict for the returned gap. */
  classification: IdleClassification
  /** The task that was being tracked. */
  taskTitle: string
  /** Apply the chosen action (the page persists per the core math). */
  onResolve: (action: IdleAction) => void
}

/** The verdicts that open the dialog (active gaps never prompt). */
export function shouldPrompt(classification: IdleClassification): boolean {
  return classification.verdict !== 'active'
}

export function IdleClassifyDialog({
  open,
  onClose,
  classification,
  taskTitle,
  onResolve,
}: IdleClassifyDialogProps) {
  const minutes = gapMinutes(classification.idleMs)
  const discardable = classification.verdict === 'suggest-discard' && classification.subtractMs > 0

  const choose = (action: IdleAction) => {
    onResolve(action)
    onClose()
  }

  return (
    <Sheet
      open={open && shouldPrompt(classification)}
      onClose={onClose}
      title={`Away for ${minutes} min`}
      footer={
        <Button variant="secondary" className="w-full text-xs" onClick={onClose}>
          Decide later
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-secondary">
          You were away from <span className="font-medium">{taskTitle}</span>. What happened?
        </p>

        <div className="space-y-2">
          <Button variant="primary" className="w-full text-xs" onClick={() => choose('assign')}>
            <Undo2 className="size-4" aria-hidden /> Keep tracking — I was working on it
          </Button>
          <Button variant="secondary" className="w-full text-xs" onClick={() => choose('break')}>
            <Coffee className="size-4" aria-hidden /> It was a break — log nothing extra
          </Button>
          {discardable && (
            <Button
              variant="ghost"
              className="w-full text-xs text-danger-text"
              onClick={() => choose('discard')}
            >
              <LogOut className="size-4" aria-hidden /> Discard{' '}
              {gapMinutes(classification.subtractMs)} min of dead time
            </Button>
          )}
        </div>

        {classification.suppressedBy === 'max-focus' && (
          <p className="text-xs text-tertiary">
            Idle detection is paused during a Max Focus session.
          </p>
        )}
      </div>
    </Sheet>
  )
}

export default IdleClassifyDialog
