'use client'

/**
 * @file app/generation/page.tsx
 * @description Desirable Difficulties & Multi-Ladder Retrieval Generation Studio.
 *
 * Implements:
 * - Bjork & Bjork (1992, 2011) Storage Strength vs Retrieval Strength 2D phase space
 * - Slamecka & Graf (1978) 4-Rung Generation Difficulty Ladder
 * - Roediger & Karpicke (2006) Empirical Testing Effect & Potentiation
 * - FSRS Generative Spaced Repetition Stability Scaling
 */

import React from 'react'
import { Award, Compass, Flame, Sparkles } from 'lucide-react'
import { PageHeader } from '@/ui'
import { DesirableDifficultyStudio } from '@/components/DesirableDifficultyStudio'

export default function GenerationStudioPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title="Desirable Difficulties & Generative Retrieval Studio"
        subtitle="Harness Bjork's New Theory of Disuse: maximize storage strength gains by retrieving under low accessibility across Slamecka's 4-rung generative difficulty ladder."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
              <Flame className="h-3.5 w-3.5 text-amber-400" />
              <span>Slamecka (1978)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-300">
              <Compass className="h-3.5 w-3.5 text-sky-400" />
              <span>Bjork & Bjork (2011)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
              <Award className="h-3.5 w-3.5 text-emerald-400" />
              <span>Roediger (2006)</span>
            </span>
          </div>
        }
      />

      {/* Main Interactive Workbench */}
      <DesirableDifficultyStudio />

      {/* Learning Science Foundations Card */}
      <div className="rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur-md">
        <div className="flex items-center gap-2.5 mb-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-bold text-foreground">
            Cognitive Science Foundations: Storage vs Retrieval Dynamics
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground leading-relaxed">
          <div className="space-y-1">
            <span className="font-semibold text-foreground">
              New Theory of Disuse (Bjork & Bjork 1992, 2011)
            </span>
            <p>
              Storage Strength (SS) is permanent and does not decay; Retrieval Strength (RS) decays
              rapidly over time. Paradoxically, retrieval produces the greatest consolidation into
              Storage Strength when Retrieval Strength is low (effortful recall).
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-foreground">
              The 4-Rung Generation Ladder (Slamecka & Graf 1978)
            </span>
            <p>
              Actively generating target materials produces superior retention compared to passive
              reading. Climbing the cognitive friction ladder—from stem completion to semantic
              anagrams, reverse inquiry, and structural analogy—potentiates deep encoding.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-foreground">
              The Testing Crucible (Roediger & Karpicke 2006)
            </span>
            <p>
              Passive restudy produces high initial confidence but rapid forgetting. Testing and
              effortful generative retrieval produce durable long-term retention (+50% recall at 1
              week delay) and primes the nervous system for error correction.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
