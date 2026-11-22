'use client'

/**
 * @file app/workload/page.tsx
 * @description Workload Balancer & Backlog Recovery Studio.
 *
 * Implements:
 * - 14-90 Day Spaced Repetition Review Horizon Forecasting
 * - Safe Interval Fuzz Smoothing (+/- 5% interval jitter, max 2 days; Rule 7 compliant)
 * - Easy Days Schedule Routing (weekend load shifting)
 * - Gentle Overdue Backlog Catch-Up Engine (spreading overdue cards by retrievability)
 */

import React from 'react'
import { BarChart3, Calendar, ShieldCheck, Sparkles } from 'lucide-react'
import { PageHeader } from '@/ui'
import { WorkloadStudio } from '@/components/WorkloadStudio'
import { ClayIn, staggerDelay } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'

export default function WorkloadStudioPage() {
  // GSAP moment: the three principle columns rise in with a capped stagger
  // when the foundations panel scrolls into view (the panel itself is owned
  // by ClayIn — one animation owner per element).
  const principlesRef = useGsapReveal<HTMLDivElement>()
  return (
    // Entrance choreography: three blocks rise + fade in on the clay spring,
    // 40ms apart (`staggerDelay`), total <300ms (motion law: transform/opacity
    // only, gated by `motionOK`). The old `animate-fade-in` class is dropped —
    // ClayIn owns the entrance. SSR renders the final state; the animation is
    // client-only, so hydration output is unchanged.
    <div className="space-y-6">
      {/* Page Header — entrance beat 0 */}
      <ClayIn>
        <PageHeader
          title="Workload Balancer & Review Forecaster"
          subtitle="Forecast 14 to 90-day review loads, smooth spike volumes with safe interval fuzzing, schedule rest days, and recover overdue backlogs gently."
          actions={
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-300">
                <BarChart3 className="h-3.5 w-3.5 text-indigo-400" />
                <span>90-Day Forecast</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-status-success-text">
                <ShieldCheck className="h-3.5 w-3.5 text-status-success-text" />
                <span>Safe Fuzz Smoothing</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-bold text-status-info-text">
                <Calendar className="h-3.5 w-3.5 text-status-info-text" />
                <span>Easy Days</span>
              </span>
            </div>
          }
        />
      </ClayIn>

      {/* Main Interactive Studio — entrance beat 1 */}
      <ClayIn delayS={staggerDelay(1)}>
        <WorkloadStudio />
      </ClayIn>

      {/* Spaced Repetition Scheduling Foundations — entrance beat 2 */}
      <ClayIn
        delayS={staggerDelay(2)}
        className="rounded-2xl border border-(--hub-border) bg-(--hub-panel) p-6"
      >
        <div className="flex items-center gap-2.5 mb-3">
          <Sparkles className="h-5 w-5 text-indigo-400" />
          <h3 className="text-sm font-bold text-strong">
            Spaced Repetition & Cognitive Capacity Principles
          </h3>
        </div>
        <div
          ref={principlesRef}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-faint leading-relaxed"
        >
          <div className="space-y-1">
            <span className="font-semibold text-body">Spike Attenuation via Interval Fuzzing</span>
            <p>
              When many cards are introduced on the same day, their future reviews synchronize and
              create overwhelming volume spikes. Safe interval fuzzing applies a slight random phase
              shift (±5%) that de-synchronizes reviews without measurably altering retention.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-body">Easy Days & Rest-Period Routing</span>
            <p>
              Designated rest days prevent study burnout and habit failure. Reviews that fall on
              easy days are gently shifted to adjacent active days ahead of time, ensuring zero
              guilt and unbroken consistency.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-body">
              Backlog Recovery without Cognitive Fatigue
            </span>
            <p>
              Cramming a large backlog triggers acute cognitive overload and elevated relapse rates.
              The catch-up engine reschedules overdue cards in daily digestible quotas, prioritizing
              the lowest retrievability cards to salvage fading memory traces first.
            </p>
          </div>
        </div>
      </ClayIn>
    </div>
  )
}
