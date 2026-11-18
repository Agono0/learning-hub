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

export default function WorkloadStudioPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title="Workload Balancer & Review Forecaster"
        subtitle="Forecast 14 to 90-day review loads, smooth spike volumes with safe interval fuzzing, schedule rest days, and recover overdue backlogs gently."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-300">
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

      {/* Main Interactive Studio */}
      <WorkloadStudio />

      {/* Spaced Repetition Scheduling Foundations */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <div className="flex items-center gap-2.5 mb-3">
          <Sparkles className="h-5 w-5 text-indigo-400" />
          <h3 className="text-sm font-bold text-white">
            Spaced Repetition & Cognitive Capacity Principles
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-faint leading-relaxed">
          <div className="space-y-1">
            <span className="font-semibold text-neutral-200">
              Spike Attenuation via Interval Fuzzing
            </span>
            <p>
              When many cards are introduced on the same day, their future reviews synchronize and
              create overwhelming volume spikes. Safe interval fuzzing applies a slight random phase
              shift (±5%) that de-synchronizes reviews without measurably altering retention.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-neutral-200">Easy Days & Rest-Period Routing</span>
            <p>
              Designated rest days prevent study burnout and habit failure. Reviews that fall on
              easy days are gently shifted to adjacent active days ahead of time, ensuring zero
              guilt and unbroken consistency.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-neutral-200">
              Backlog Recovery without Cognitive Fatigue
            </span>
            <p>
              Cramming a large backlog triggers acute cognitive overload and elevated relapse rates.
              The catch-up engine reschedules overdue cards in daily digestible quotas, prioritizing
              the lowest retrievability cards to salvage fading memory traces first.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
