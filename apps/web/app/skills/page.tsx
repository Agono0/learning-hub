'use client'

/**
 * @file apps/web/app/skills/page.tsx
 * @description Matt Pocock Agent Skills & Autonomous Engineering Studio.
 *
 * Implements:
 * - Structured Idea-to-Ship Autonomous Agent Flow:
 *   1. /grill-me — Relentless Socratic interview resolving design trees.
 *   2. /to-spec — Formal specifications with architectural invariants.
 *   3. /to-tickets — Atomic ticket decomposition with TDD recipes.
 *   4. /code-review — Real-time AGENTS.md rule auditor.
 *   5. /handoff — Multi-agent state compaction and seamless handoff.
 * - Deliberate Practice (Ericsson 1993) micro-drill generation into FSRS decks.
 * - Meaningful Learning (Ausubel 1968) propositional concept refactoring.
 */

import React from 'react'
import { Flame, ShieldCheck, Sparkles, Terminal } from 'lucide-react'
import { PageHeader } from '@/ui'
import { SkillsStudio } from '@/components/SkillsStudio'

export default function SkillsStudioPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title="Agent Skills & Autonomous Engineering Studio"
        subtitle="Harness Matt Pocock's prompt-driven engineering skills: Socratic design grilling, formal specifications, atomic ticket decomposition, AGENTS.md rule verification, and deliberate practice drills."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-300">
              <Terminal className="h-3.5 w-3.5 text-indigo-400" />
              <span>Matt Pocock /skills</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-status-success-text">
              <ShieldCheck className="h-3.5 w-3.5 text-status-success-text" />
              <span>AGENTS.md Linter</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-status-warning-text">
              <Flame className="h-3.5 w-3.5 text-status-warning-text" />
              <span>Ericsson (1993)</span>
            </span>
          </div>
        }
      />

      {/* Main Interactive Studio Workbench */}
      <SkillsStudio />

      {/* Autonomous Engineering Foundations Card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <div className="flex items-center gap-2.5 mb-3">
          <Sparkles className="h-5 w-5 text-indigo-400" />
          <h3 className="text-sm font-bold text-white">
            Autonomous Agent Engineering & Learning Science Foundations
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-tertiary leading-relaxed">
          <div className="space-y-1">
            <span className="font-semibold text-neutral-200">
              The Idea-to-Ship Spine (Pocock 2024)
            </span>
            <p>
              Rather than unstructured code generation, elite engineering workflows follow a
              disciplined pipeline: interview the design tree until ambiguity is zero (
              <code className="text-indigo-300">/grill-me</code>), formalize constraints in a
              specification (<code className="text-indigo-300">/to-spec</code>), decompose into
              atomic 1-change tickets (<code className="text-indigo-300">/to-tickets</code>), and
              enforce architectural invariants (
              <code className="text-indigo-300">/code-review</code>).
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-neutral-200">
              Deliberate Practice at the Boundary (Ericsson 1993)
            </span>
            <p>
              Passive repetition reinforces existing comfort zones. True skill mastery demands
              deliberate practice: isolating core bottlenecks, constructing micro-drills at the Zone
              of Proximal Development (ZPD) boundary, and receiving immediate diagnostic feedback
              before chunking into high-level mental representations.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-neutral-200">
              Zero-Regression Invariant Gates (AGENTS.md)
            </span>
            <p>
              Autonomous systems require strict invariant enforcement: absolute runtime neutrality
              across Web, Android, and Desktop, transactional database writes, single-path FSRS
              grading (Rule 7), append-only revlogs, and zero raw fetch calls in presentation
              components.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
