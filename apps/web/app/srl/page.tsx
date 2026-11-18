'use client'

/**
 * @file apps/web/app/srl/page.tsx
 * @description Self-Regulated Learning (SRL) & Zimmerman Metacognitive Matrix Studio Page.
 *
 * Grounded in empirical educational psychology:
 * - Barry J. Zimmerman (2000, 2002): Cyclical model of self-regulated learning.
 * - Paul R. Pintrich et al. (1991, 1993, 2004): Motivated Strategies for Learning Questionnaire (MSLQ).
 * - Bernard Weiner (1985): Attributional theory of achievement motivation.
 * - Albert Bandura (1997): Self-efficacy mechanisms in human agency.
 */

import React from 'react'
import { Compass, Target, Activity, Flame, Sparkles } from 'lucide-react'
import { PageHeader } from '@/ui'
import { SelfRegulatedLearningStudio } from '@/components/SelfRegulatedLearningStudio'

export default function SelfRegulatedLearningPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title="Self-Regulated Learning Studio"
        subtitle="Master the complete Zimmerman 3-phase cyclical engine: forethought task analysis & self-efficacy, volitional performance control with attention intervention, and Weiner causal attribution reflection."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-600 dark:text-blue-400">
              <Compass className="h-3.5 w-3.5" />
              <span>Zimmerman (2002) Cyclical SRL</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <Activity className="h-3.5 w-3.5" />
              <span>MSLQ 15-Scale Benchmark</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-600 dark:text-violet-400">
              <Flame className="h-3.5 w-3.5" />
              <span>Weiner Attributional Model</span>
            </span>
          </div>
        }
      />

      {/* Main Studio Workbench */}
      <SelfRegulatedLearningStudio />

      {/* Learning Science Foundations Card */}
      <div className="rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-6">
        <div className="flex items-center gap-2.5 mb-3">
          <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-base font-bold text-strong">
            Learning Science Foundations &amp; Empirical Frameworks
          </h2>
        </div>
        <p className="text-xs text-secondary leading-relaxed mb-4">
          Self-regulation is not an immutable trait or a generic measure of willpower; it is a
          systematic, teachable process whereby learners actively transform their mental abilities
          into academic skills through cyclical feedback loops (Zimmerman 2002).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="rounded-lg bg-white dark:bg-(--hub-panel) p-3 border border-neutral-200 dark:border-(--hub-border)">
            <div className="font-semibold text-strong mb-1 flex items-center gap-1.5">
              <Target className="h-4 w-4 text-blue-500" />
              Phase 1: Forethought
            </div>
            <p className="text-secondary leading-relaxed">
              Task analysis, proximal goal setting, and generative strategy selection precede
              action. Calibration between Bandura self-efficacy (1997) and objective task complexity
              predicts persistence and effort regulation.
            </p>
          </div>

          <div className="rounded-lg bg-white dark:bg-(--hub-panel) p-3 border border-neutral-200 dark:border-(--hub-border)">
            <div className="font-semibold text-strong mb-1 flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-emerald-500" />
              Phase 2: Volitional Performance
            </div>
            <p className="text-secondary leading-relaxed">
              Execution demands self-control (Meichenbaum 1977 self-instruction) and metacognitive
              monitoring. Managing cognitive load (Paas 1992) and intervening immediately upon
              attention leakage preserves executive stamina.
            </p>
          </div>

          <div className="rounded-lg bg-white dark:bg-(--hub-panel) p-3 border border-neutral-200 dark:border-(--hub-border)">
            <div className="font-semibold text-strong mb-1 flex items-center gap-1.5">
              <Flame className="h-4 w-4 text-violet-500" />
              Phase 3: Self-Reflection
            </div>
            <p className="text-secondary leading-relaxed">
              Weiner (1985) attribution theory demonstrates that attributing failure to unstable,
              controllable factors (effort and strategy) fosters resilience and growth mindset
              (Dweck 2006), directly powering the next forethought cycle.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
