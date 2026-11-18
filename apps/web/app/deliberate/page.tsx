'use client'

/**
 * @file app/deliberate/page.tsx
 * @description Deliberate Practice & Progressive Error Recovery Studio.
 *
 * Implements:
 * - K. Anders Ericsson's Deliberate Practice Theory (1993, 2016)
 * - Kurt VanLehn's (1990) Impasse-Driven Learning & Schema Bug Repair
 * - Nina Keith & Michael Frese's (2008) Error Management Training (EMT)
 */

import React from 'react'
import { Brain, Crosshair, ShieldAlert, Target } from 'lucide-react'
import { PageHeader } from '@/ui'
import { DeliberatePracticeStudio } from '@/components/DeliberatePracticeStudio'

export default function DeliberatePracticePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title="Deliberate Practice & Progressive Error Recovery Studio"
        subtitle="Harness K. Anders Ericsson's Deliberate Practice (1993) and Kurt VanLehn's Impasse-Driven Schema Repair (1990): isolate targeted micro-skill deficits on the outer perimeter of competence, dissect cognitive impasses, and build adaptive transfer through positive error climate training."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">
              <Crosshair className="h-3.5 w-3.5 text-cyan-400" />
              <span>Ericsson (1993)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300">
              <Target className="h-3.5 w-3.5 text-violet-400" />
              <span>VanLehn Impasse (1990)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
              <ShieldAlert className="h-3.5 w-3.5 text-emerald-400" />
              <span>Keith-Frese EMT (2008)</span>
            </span>
          </div>
        }
      />

      {/* Scientific Foundation Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-cyan-400 uppercase tracking-wider">
            <Crosshair className="h-4 w-4" />
            <span>Targeted Deficit Drills</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Deliberate practice is not mindlessly repeating what you already know. It requires
            continuous, effortful focus on granular sub-skill deficits where errors are most likely
            to occur, with immediate informative feedback.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-violet-400 uppercase tracking-wider">
            <Brain className="h-4 w-4" />
            <span>Impasse-Driven Repair</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            VanLehn (1990) demonstrated that schema repair occurs at cognitive impasses. Classifying
            mistakes into misconceptions, procedural lapses, and boundary oversights allows targeted
            sub-goal repair rather than generic repetition.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-emerald-400 uppercase tracking-wider">
            <ShieldAlert className="h-4 w-4" />
            <span>Error Management Training</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Keith & Frese (2008) showed that positive error framing decouples ego threat from
            tactical failure, fostering emotional resilience and superior adaptive transfer when
            confronting novel, complex problems.
          </p>
        </div>
      </div>

      {/* Main Studio Interactive Crucible */}
      <DeliberatePracticeStudio />
    </div>
  )
}
