'use client'

/**
 * @file app/cognitive-load/page.tsx
 * @description Cognitive Load Theory & Real-Time Flow State Balancer Studio Page.
 *
 * Grounded in:
 * - John Sweller (1988, 2011) - Tripartite Cognitive Load (Intrinsic, Extraneous, Germane)
 * - Fred Paas & Jeroen J. G. van Merriënboer (1993) - 2D Cognitive Efficiency Metric (E-score)
 * - Mihaly Csikszentmihalyi (1990) - Flow Channel & Optimal Challenge-to-Skill Balance
 * - Robert Yerkes & John Dodson (1908) - Inverted-U Arousal-Performance Law
 * - Malcolm Pollock, Paul Chandler & John Sweller (2002) - Isolated-Elements Scaffolding Continuum
 * - Free Spaced Repetition Scheduler (FSRS-6) dynamic modulation
 */

import React from 'react'
import { Activity, Cpu, Flame, Sparkles } from 'lucide-react'
import { PageHeader, Panel } from '@/ui'
import { CognitiveLoadStudio } from '@/components/CognitiveLoadStudio'

export default function CognitiveLoadPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title="Cognitive Load & Flow State Balancer"
        subtitle="Decompose intrinsic and extraneous working memory chunks (Cowan 4-chunk capacity), monitor 2D instructional efficiency, calibrate Csikszentmihalyi flow channels, and modulate FSRS intervals in real-time."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400">
              <Cpu className="h-3.5 w-3.5" />
              <span>Sweller Tripartite Load</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <Flame className="h-3.5 w-3.5" />
              <span>Csikszentmihalyi Flow</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-600 dark:text-amber-400">
              <Activity className="h-3.5 w-3.5" />
              <span>Paas 2D Efficiency</span>
            </span>
          </div>
        }
      />

      {/* Main Interactive Studio */}
      <CognitiveLoadStudio />

      {/* Cognitive Science Foundations */}
      <Panel className="p-6 rounded-2xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel)/40 space-y-4">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-5 w-5 text-indigo-500" />
          <h3 className="text-sm font-bold text-strong">
            Cognitive Load Theory & Psychometric Foundations
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs text-secondary leading-relaxed">
          <div className="space-y-1.5 p-3 rounded-lg bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border)">
            <span className="font-semibold text-strong block">
              1. Sweller (1988, 2011) Tripartite Load
            </span>
            <p>
              Working memory is bounded by Nelson Cowan's 4-chunk limit (W ≤ 4 ± 1). Working memory
              is allocated across Intrinsic Load (element interactivity), Extraneous Load
              (presentation clutter), and Germane Load (schema abstraction). When total chunks
              exceed capacity, cognitive thrashing occurs.
            </p>
          </div>

          <div className="space-y-1.5 p-3 rounded-lg bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border)">
            <span className="font-semibold text-strong block">
              2. Paas &amp; Van Merriënboer (1993) 2D Efficiency
            </span>
            <p>
              Instructional efficiency cannot be measured by accuracy alone. The 2D metric E =
              (z(Performance) - z(Mental Effort)) / √2 compares standardized recall performance
              against subjective mental effort. High performance achieved with low effort reflects
              automated schema fluency.
            </p>
          </div>

          <div className="space-y-1.5 p-3 rounded-lg bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border)">
            <span className="font-semibold text-strong block">
              3. Pollock Isolated-Elements Scaffolding
            </span>
            <p>
              When element interactivity exceeds Cowan capacity, attempting full problem synthesis
              guarantees cognitive collapse. Pollock, Chandler &amp; Sweller (2002) prove that
              staging learning through Isolated Elements → Pairwise Coupling → Systemic Synthesis
              allows working memory to construct intermediate schemas without overload.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  )
}
