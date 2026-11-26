'use client'

import React, { useState, useMemo } from 'react'
import {
  listMicroWorldScenarios,
  simulateMicroWorldStep,
  evaluateCPSSession,
  generateCPSFSRSDeck,
  type MicroWorldScenario,
  type MicroWorldState,
  type CPSSessionEvaluation,
  type GeneratedCPSFSRSCard,
} from '@learning-hub/core/complex-problem-solving'
import { Panel } from '@/ui/Panel'
import { Button } from '@/ui/Button'
import { ComplexProblemSolvingHUD } from '@/ui/ComplexProblemSolvingHUD'
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Eye,
  Layers,
  Play,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'

export function ComplexProblemSolvingStudio() {
  const scenarios = useMemo(() => listMicroWorldScenarios(), [])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(scenarios[0]!.id)

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0]!,
    [scenarios, selectedScenarioId],
  )

  // Initialize initial micro-world state
  const buildInitialState = (scenario: MicroWorldScenario): MicroWorldState => {
    const values: Record<string, number> = {}
    for (const v of scenario.variables) {
      values[v.id] = v.initialValue
    }
    return {
      currentCycle: 1,
      variableValues: values,
      activeDelays: [],
      inspectedVariables: scenario.variables.filter((v) => v.isObservable).map((v) => v.id),
      executedPolicyIds: [],
      systemCollapsed: false,
    }
  }

  const [state, setState] = useState<MicroWorldState>(() => buildInitialState(activeScenario))
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<string[]>([])
  const [lastFeedback, setLastFeedback] = useState<string[]>([])
  const [deck, setDeck] = useState<GeneratedCPSFSRSCard[] | null>(null)

  // Switch scenario
  const handleSelectScenario = (id: string) => {
    const sc = scenarios.find((s) => s.id === id) || scenarios[0]!
    setSelectedScenarioId(id)
    setState(buildInitialState(sc))
    setSelectedPolicyIds([])
    setLastFeedback([])
    setDeck(null)
  }

  // Reset current scenario
  const handleReset = () => {
    setState(buildInitialState(activeScenario))
    setSelectedPolicyIds([])
    setLastFeedback([])
    setDeck(null)
  }

  // Toggle policy selection for the upcoming cycle
  const handleTogglePolicy = (policyId: string) => {
    if (state.systemCollapsed) return
    setSelectedPolicyIds((prev) =>
      prev.includes(policyId) ? prev.filter((p) => p !== policyId) : [...prev, policyId],
    )
  }

  // Inspect variable (for uninspected variables)
  const handleInspectVariable = (varId: string) => {
    if (!state.inspectedVariables.includes(varId)) {
      setState((prev) => ({
        ...prev,
        inspectedVariables: [...prev.inspectedVariables, varId],
      }))
    }
  }

  // Advance decision cycle
  const handleAdvanceCycle = () => {
    if (state.systemCollapsed) return
    const result = simulateMicroWorldStep(
      activeScenario.id,
      state,
      selectedPolicyIds,
      state.inspectedVariables,
    )
    setState(result.nextState)
    setLastFeedback(result.stepFeedback)
    setSelectedPolicyIds([])
  }

  // Evaluate session telemetry
  const evaluation: CPSSessionEvaluation = useMemo(
    () => evaluateCPSSession(activeScenario.id, state),
    [activeScenario.id, state],
  )

  // Generate FSRS spaced repetition deck
  const handleGenerateDeck = () => {
    const generated = generateCPSFSRSDeck(activeScenario.id, evaluation)
    setDeck(generated)
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Scenario Selector */}
      <Panel className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-tertiary">
              <SlidersHorizontal className="h-4 w-4 text-cyan-500" />
              Dietrich Dörner Complex Problem Solving (CPS) Micro-World Studio
            </div>
            <h1 className="text-2xl font-extrabold text-strong mt-1">
              Micro-World Simulation & Systemic Failure Remediation
            </h1>
            <p className="text-xs text-secondary mt-1">
              Grounded in Dörner (1996 <i>The Logic of Failure</i>) and Jens Rasmussen (1983 SRK
              framework). Manage complex dynamic systems with delayed non-linear side effects,
              avoiding ballistic action, thematic vagabonding, and repair-service traps.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 max-w-full">
            <Button variant="secondary" onClick={handleReset} className="flex items-center gap-1.5">
              <RotateCcw className="h-4 w-4" />
              Reset Simulation
            </Button>
          </div>
        </div>

        {/* Scenario Selection Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pt-2 border-t border-[var(--border-subtle)]">
          {scenarios.map((sc) => {
            const isSelected = sc.id === activeScenario.id
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => handleSelectScenario(sc.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  isSelected
                    ? 'border-cyan-500 bg-cyan-500/10 text-strong shadow-sm'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-secondary'
                }`}
              >
                <div className="text-xs font-semibold flex items-center justify-between">
                  <span className="truncate">{sc.domain}</span>
                  {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-cyan-500 shrink-0" />}
                </div>
                <div className="text-[11px] text-tertiary mt-1 line-clamp-2">{sc.title}</div>
              </button>
            )
          })}
        </div>
      </Panel>

      {/* Main Dörner Telemetry HUD */}
      <ComplexProblemSolvingHUD
        evaluation={evaluation}
        scenarioTitle={activeScenario.title}
        currentCycle={state.currentCycle}
      />

      {/* System Collapse Emergency Alert */}
      {state.systemCollapsed && (
        <Panel className="border-2 border-rose-500 bg-rose-500/10 space-y-3">
          <div className="flex items-start gap-3">
            <AlertOctagon className="h-6 w-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-base font-bold text-rose-700 dark:text-rose-400">
                Systemic Catastrophic Collapse in Decision Cycle #{state.currentCycle}
              </h3>
              <p className="text-xs text-rose-600 dark:text-rose-300 leading-relaxed font-medium">
                {state.collapseReason ||
                  'A critical safety variable breached its operational limits.'}
              </p>
              <div className="text-xs text-secondary pt-2">
                <span className="font-semibold text-strong">Canonical Failure Mode: </span>
                {activeScenario.canonicalFailureMode.trapDescription}
              </div>
              <div className="text-xs text-emerald-700 dark:text-emerald-400 pt-1">
                <span className="font-semibold">Dörner Remediation Principle: </span>
                {activeScenario.canonicalFailureMode.remedyPrinciple}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Grid: Micro-World System State + Active Delayed Cascades */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: System Variables & Telemetry (2 cols wide) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Micro-World Variables Monitor */}
          <Panel className="space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="text-sm font-bold text-strong flex items-center gap-2">
                  <Activity className="h-4 w-4 text-cyan-500" />
                  System State Variables & Safety Envelopes
                </h3>
                <p className="text-xs text-tertiary">
                  Observable parameters monitored across decision cycles. Breaching critical bounds
                  triggers immediate systemic collapse.
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-secondary">
                Cycle #{state.currentCycle}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeScenario.variables.map((variable) => {
                const currentVal = state.variableValues[variable.id] ?? variable.initialValue
                const isSafe = currentVal >= variable.minSafe && currentVal <= variable.maxSafe
                const isInspected = state.inspectedVariables.includes(variable.id)

                return (
                  <div
                    key={variable.id}
                    className={`p-3.5 rounded-lg border transition-all ${
                      !isSafe
                        ? 'border-rose-500/50 bg-rose-500/5'
                        : isInspected
                          ? 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                          : 'border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-strong">{variable.name}</span>
                          {variable.isCritical && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                              Critical
                            </span>
                          )}
                          {!variable.isObservable && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                              Latent
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-tertiary mt-0.5 line-clamp-1">
                          {variable.description}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          className={`text-base font-extrabold ${
                            isSafe
                              ? 'text-strong'
                              : 'text-rose-600 dark:text-rose-400 flex items-center justify-end gap-1'
                          }`}
                        >
                          {!isSafe && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                          {currentVal}{' '}
                          <span className="text-[11px] font-normal text-tertiary">
                            {variable.unit}
                          </span>
                        </div>
                        <div className="text-[10px] text-tertiary">
                          Safe: {variable.minSafe} – {variable.maxSafe}
                        </div>
                      </div>
                    </div>

                    {/* Inspection & Monitoring Action */}
                    <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
                      <span className="text-tertiary flex items-center gap-1">
                        <Eye className="h-3 w-3 text-cyan-500" />
                        {isInspected
                          ? 'Observed in Feedback'
                          : 'Uninspected (Risk of Ballistic Action)'}
                      </span>
                      {!isInspected && (
                        <button
                          type="button"
                          onClick={() => handleInspectVariable(variable.id)}
                          className="text-cyan-600 dark:text-cyan-400 font-semibold hover:underline"
                        >
                          Inspect Variable
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>

          {/* Policy Decision Interventions Dashboard */}
          <Panel className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="text-sm font-bold text-strong flex items-center gap-2">
                  <Layers className="h-4 w-4 text-cyan-500" />
                  Policy Interventions (Select for Cycle #{state.currentCycle})
                </h3>
                <p className="text-xs text-tertiary">
                  Interventions have direct primary impacts and trigger delayed second-order side
                  effects that cascade across subsequent cycles.
                </p>
              </div>

              <Button
                variant="primary"
                onClick={handleAdvanceCycle}
                disabled={state.systemCollapsed}
                className="flex items-center gap-1.5 self-start sm:self-auto"
              >
                <Play className="h-4 w-4" />
                Advance Decision Cycle
              </Button>
            </div>

            <div className="space-y-3">
              {activeScenario.availablePolicies.map((policy) => {
                const isSelected = selectedPolicyIds.includes(policy.id)
                return (
                  <div
                    key={policy.id}
                    onClick={() => handleTogglePolicy(policy.id)}
                    className={`p-3.5 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-500/10 shadow-sm'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // handled by parent onClick
                            className="rounded border-[var(--border-subtle)] text-cyan-600 focus:ring-cyan-500 h-4 w-4"
                          />
                          <span className="text-xs font-bold text-strong">{policy.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-secondary border border-[var(--border-subtle)] uppercase">
                            {policy.category}
                          </span>
                          {policy.isSustainable && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                              Sustainable Causal Remedy
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-secondary">{policy.rationalJustification}</p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-cyan-600 dark:text-cyan-400">
                          Direct:{' '}
                          {policy.directDelta > 0 ? `+${policy.directDelta}` : policy.directDelta}
                        </div>
                        <div className="text-[11px] text-tertiary">
                          Cost: {policy.costResource} pts
                        </div>
                      </div>
                    </div>

                    {/* Delayed Side Effects Preview */}
                    {policy.delayedSideEffects.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)] space-y-1 text-[11px]">
                        <div className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Delayed Cascades ({policy.delayedSideEffects.length}):
                        </div>
                        {policy.delayedSideEffects.map((se, idx) => (
                          <div key={idx} className="text-secondary pl-4">
                            • In +{se.delayPeriods} cycle(s): {se.description}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Panel>
        </div>

        {/* Right Column: Active Delayed Cascades & Step Feedback (1 col wide) */}
        <div className="space-y-6">
          {/* Active Delayed Effects Queue */}
          <Panel className="space-y-3">
            <h3 className="text-sm font-bold text-strong flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2">
              <Clock className="h-4 w-4 text-amber-500" />
              Active Delayed Side-Effects Queue
            </h3>
            {state.activeDelays.length === 0 ? (
              <div className="p-4 rounded-lg bg-[var(--bg-subtle)]/50 border border-dashed border-[var(--border-subtle)] text-center text-xs text-tertiary">
                No delayed cascades currently queued. Future policy side-effects will appear here.
              </div>
            ) : (
              <div className="space-y-2">
                {state.activeDelays.map((delay, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Matures in {delay.cyclesRemaining} cycle(s)
                      </span>
                      <span className="font-bold text-strong">
                        Delta: {delay.delta > 0 ? `+${delay.delta}` : delay.delta}
                      </span>
                    </div>
                    <p className="text-[11px] text-secondary leading-normal">{delay.description}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Last Decision Cycle Execution Feedback */}
          <Panel className="space-y-3">
            <h3 className="text-sm font-bold text-strong flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2">
              <ArrowRight className="h-4 w-4 text-cyan-500" />
              Cycle Feedback Log
            </h3>
            {lastFeedback.length === 0 ? (
              <div className="p-4 rounded-lg bg-[var(--bg-subtle)]/50 border border-dashed border-[var(--border-subtle)] text-center text-xs text-tertiary">
                Advance a decision cycle to inspect execution and delayed cascade resolution.
              </div>
            ) : (
              <ul className="space-y-1.5 text-xs text-secondary pl-2">
                {lastFeedback.map((fb, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-cyan-500 font-bold">•</span>
                    <span className={fb.includes('CRITICAL') ? 'text-rose-600 font-semibold' : ''}>
                      {fb}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* FSRS-6 Practice Deck Generator */}
          <Panel className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-strong flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-indigo-500" />
                Dörner Practice Deck (FSRS-6)
              </h3>
              <Button
                variant="secondary"
                onClick={handleGenerateDeck}
                className="text-xs flex items-center gap-1"
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                Generate
              </Button>
            </div>
            <p className="text-xs text-tertiary">
              Converts micro-world failures and systemic insights into calibrated FSRS spaced
              repetition cards.
            </p>

            {deck && (
              <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                <div className="text-xs font-semibold text-strong flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {deck.length} Calibrated Cards Generated
                </div>
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {deck.map((card) => (
                    <div
                      key={card.id}
                      className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1"
                    >
                      <div className="text-xs font-semibold text-strong">{card.front}</div>
                      <div className="text-[11px] text-secondary leading-normal">{card.back}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
