'use client'

/**
 * @file app/interactivity/page.tsx
 * @description Cognitive Load & Element Interactivity Studio.
 *
 * Implements:
 * - John Sweller's Cognitive Load Theory (CLT, Sweller 1988, 2011)
 * - Pollock, Chandler & Sweller (2002) Isolated-Elements Effect 3-phase scaffold
 * - Fred Paas's (1992) 2D Instructional Efficiency Diagnostic Crucible
 */

import React from 'react'
import { Activity, Cpu, Layers, Network, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/ui'
import { ElementInteractivityStudio } from '@/components/ElementInteractivityStudio'

export default function InteractivityPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title="Cognitive Load & Element Interactivity Studio"
        subtitle="Harness John Sweller's Cognitive Load Theory (1988, 2011) and Pollock's Isolated-Elements Effect (2002): decompose high-interactivity complex systems into isolated constituents, internalize binary couplings, and synthesize unified systemic schemas without working memory paralysis."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">
              <Cpu className="h-3.5 w-3.5 text-cyan-400" />
              <span>Sweller CLT (1988, 2011)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300">
              <Layers className="h-3.5 w-3.5 text-violet-400" />
              <span>Pollock Scaffold (2002)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              <span>Paas Efficiency (1992)</span>
            </span>
          </div>
        }
      />

      {/* Scientific Foundation Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-cyan-400 uppercase tracking-wider">
            <Network className="h-4 w-4" />
            <span>Element Interactivity</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Material with high element interactivity requires multiple interacting elements to be
            held simultaneously in working memory. Without schema chunking, total cognitive load
            exceeds Cowan’s capacity limit (4 chunks), causing cognitive paralysis.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-violet-400 uppercase tracking-wider">
            <Layers className="h-4 w-4" />
            <span>Isolated-Elements Effect</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Pollock et al. (2002) proved that presenting constituent elements in isolation first,
            followed by pairwise coupling and systemic integration, enables novices to acquire
            complex schemas that would otherwise be impossible to process simultaneously.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 font-bold text-xs text-emerald-400 uppercase tracking-wider">
            <ShieldCheck className="h-4 w-4" />
            <span>Paas Efficiency Metric</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Instructional efficiency E = (Z_P - Z_R) / √2 balances objective test performance
            against subjective mental effort. High performance achieved with low effort indicates
            optimal schema automation.
          </p>
        </div>
      </div>

      {/* Main Studio Interactive Crucible */}
      <ElementInteractivityStudio />
    </div>
  )
}
