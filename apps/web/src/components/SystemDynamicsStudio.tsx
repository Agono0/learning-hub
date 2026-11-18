'use client'

import React, { useState } from 'react'
import {
  CANONICAL_SYSTEM_DYNAMICS_SCENARIOS,
  evaluateLearnerModel,
  generateSystemDynamicsFSRSDeck,
  runEulerSimulation,
  type SystemDynamicsScenario,
  type VariableNature,
  type LoopPolarity,
  type SystemsArchetype,
  type LearnerModelHypothesis,
  type SystemsDynamicsEvaluation,
  type SimulationRun,
  type SystemDynamicsDeck,
} from '@learning-hub/core/system-dynamics'
import { Panel } from '@/ui/Panel'
import { Button } from '@/ui/Button'
import { TextArea } from '@/ui/Field'
import { SystemDynamicsHUD } from '@/ui/SystemDynamicsHUD'
import {
  Activity,
  ArrowRightLeft,
  ChevronRight,
  Clock,
  Layers,
  Play,
  RefreshCw,
  Sliders,
  Sparkles,
  Zap,
} from 'lucide-react'

export function SystemDynamicsStudio() {
  const [activeScenario, setActiveScenario] = useState<SystemDynamicsScenario>(
    CANONICAL_SYSTEM_DYNAMICS_SCENARIOS[0]!,
  )
  const [activeTab, setActiveTab] = useState<'mapping' | 'loops' | 'simulation' | 'consolidation'>(
    'mapping',
  )

  // Tab 1: Variable Classifications
  const [variableClassifications, setVariableClassifications] = useState<
    Record<string, VariableNature>
  >({
    atmospheric_carbon: 'stock',
    ocean_carbon_sink: 'stock',
    permafrost_methane_stock: 'stock',
    global_temperature_anomaly: 'stock',
    fossil_emissions: 'flow',
    ocean_sink_absorption: 'flow',
    permafrost_thaw_release: 'flow',
    radiative_heat_accumulation: 'flow',
  })

  // Tab 2: Loop & Archetype Diagnosis
  const [identifiedPolarities, setIdentifiedPolarities] = useState<Record<string, LoopPolarity>>({
    R1_albedo_cryosphere: 'reinforcing',
    R2_permafrost_runaway: 'reinforcing',
    B1_ocean_buffering: 'balancing',
  })
  const [identifiedDelays, setIdentifiedDelays] = useState<Record<string, boolean>>({
    R1_albedo_cryosphere: true,
    R2_permafrost_runaway: true,
    B1_ocean_buffering: true,
  })
  const [selectedArchetype, setSelectedArchetype] = useState<SystemsArchetype>('limits_to_growth')
  const [predictedBehavior, setPredictedBehavior] = useState<
    | 'exponential_growth'
    | 's_shaped_growth'
    | 'overshoot_and_collapse'
    | 'damped_oscillation'
    | 'asymptotic_stability'
  >('overshoot_and_collapse')

  // Tab 3: Simulation Parameters
  const [simulationSteps, setSimulationSteps] = useState<number>(50)
  const [policyMultiplier, setPolicyMultiplier] = useState<number>(1.0)
  const [simulationRun, setSimulationRun] = useState<SimulationRun | null>(() =>
    runEulerSimulation(activeScenario, 50, activeScenario.defaultDt),
  )

  // Tab 4: Evaluation & Deck
  const [proposedIntervention, setProposedIntervention] = useState<string>(
    'Enforce global carbon emission caps and deploy rapid methane flaring mandates (Meadows Rank 4 - Rules of the System).',
  )
  const [evaluation, setEvaluation] = useState<SystemsDynamicsEvaluation | null>(null)
  const [fsrsDeck, setFsrsDeck] = useState<SystemDynamicsDeck | null>(null)
  const [evaluating, setEvaluating] = useState<boolean>(false)

  const handleSelectScenario = (scenario: SystemDynamicsScenario) => {
    setActiveScenario(scenario)

    // Reset default classifications
    const defaults: Record<string, VariableNature> = {}
    for (const s of scenario.stocks) defaults[s.id] = 'stock'
    for (const f of scenario.flows) defaults[f.id] = 'flow'
    setVariableClassifications(defaults)

    // Reset loop polarities
    const loopPols: Record<string, LoopPolarity> = {}
    const loopDels: Record<string, boolean> = {}
    for (const l of scenario.canonicalLoops) {
      loopPols[l.id] = l.polarity
      loopDels[l.id] = (l.delaySteps ?? 0) > 0
    }
    setIdentifiedPolarities(loopPols)
    setIdentifiedDelays(loopDels)
    setSelectedArchetype(scenario.canonicalArchetype)

    // Reset simulation
    const sim = runEulerSimulation(scenario, scenario.defaultDuration, scenario.defaultDt)
    setSimulationRun(sim)
    setEvaluation(null)
    setFsrsDeck(null)
  }

  const handleRunSimulation = () => {
    const primaryFlow = activeScenario.flows[0]?.id
    const flowMultipliers: Record<string, number> = {}
    if (primaryFlow) {
      flowMultipliers[primaryFlow] = policyMultiplier
    }

    const sim = runEulerSimulation(activeScenario, simulationSteps, activeScenario.defaultDt, {
      flowRateMultipliers: flowMultipliers,
    })
    setSimulationRun(sim)
  }

  const handleEvaluateModel = () => {
    setEvaluating(true)

    const hypothesis: LearnerModelHypothesis = {
      scenarioId: activeScenario.id,
      classifiedVariables: Object.entries(variableClassifications).map(([id, nature]) => ({
        id,
        nature,
      })),
      identifiedLoops: activeScenario.canonicalLoops.map((cl) => ({
        id: cl.id,
        polarity: identifiedPolarities[cl.id] ?? cl.polarity,
        elementIds: cl.elementIds,
        delayIdentified: identifiedDelays[cl.id] ?? false,
      })),
      identifiedArchetype: selectedArchetype,
      proposedHighLeverageIntervention: proposedIntervention,
      predictedBehavior,
    }

    const res = evaluateLearnerModel(activeScenario, hypothesis)
    const deck = generateSystemDynamicsFSRSDeck(activeScenario, res)

    setEvaluation(res)
    setFsrsDeck(deck)
    setEvaluating(false)
    setActiveTab('consolidation')
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Studio Header Banner */}
      <Panel className="space-y-3 border-l-4 border-l-cyan-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border border-cyan-500/30">
                Forrester (1968) · Sterman (2000) · Meadows (2008) · Senge (1990)
              </span>
              <span className="text-xs text-tertiary">System Dynamics Studio</span>
            </div>
            <h1 className="text-xl font-bold text-strong mt-1">
              System Dynamics &amp; Feedback Loop Modeling Studio
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={handleEvaluateModel} disabled={evaluating} variant="secondary">
              {evaluating ? 'Simulating Model...' : 'Evaluate Systems Model'}
            </Button>
          </div>
        </div>

        <p className="text-xs text-secondary leading-relaxed">
          Human intuition systematically fails in dynamic non-linear systems: people confuse
          accumulations (stocks) with rates (flows), ignore material and informational delays, and
          attribute systemic collapse to linear external shocks rather than internal feedback
          archetypes. This studio develops structural systems literacy through explicit stock-flow
          mapping, causal loop diagramming, and Euler numerical simulation.
        </p>
      </Panel>

      {/* Scenario Selector Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.map((scenario) => {
          const isSelected = scenario.id === activeScenario.id
          return (
            <div
              key={scenario.id}
              onClick={() => handleSelectScenario(scenario)}
              className={`cursor-pointer rounded-lg border p-3 transition-all ${
                isSelected
                  ? 'border-cyan-500 bg-cyan-50/40 dark:bg-cyan-950/20 shadow-xs'
                  : 'border-neutral-200 dark:border-(--hub-border) bg-surface hover:bg-surface-elevated'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-medium text-tertiary">
                <span className="uppercase">{scenario.difficulty}</span>
                <span>{scenario.stocks.length} Stocks</span>
              </div>
              <h3 className="text-xs font-bold text-strong mt-1 line-clamp-2">{scenario.title}</h3>
            </div>
          )
        })}
      </div>

      {/* Real-time Telemetry HUD (When Evaluated) */}
      {evaluation && (
        <SystemDynamicsHUD
          evaluation={evaluation}
          scenarioTitle={activeScenario.title}
          canonicalArchetype={activeScenario.canonicalArchetype}
        />
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-(--hub-border) gap-2 text-xs">
        <button
          onClick={() => setActiveTab('mapping')}
          className={`pb-2.5 px-3 font-semibold transition-colors flex items-center gap-1.5 border-b-2 ${
            activeTab === 'mapping'
              ? 'border-cyan-500 text-strong'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          1. Stock &amp; Flow Mapping
        </button>

        <button
          onClick={() => setActiveTab('loops')}
          className={`pb-2.5 px-3 font-semibold transition-colors flex items-center gap-1.5 border-b-2 ${
            activeTab === 'loops'
              ? 'border-cyan-500 text-strong'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          2. Causal Loops &amp; Delays
        </button>

        <button
          onClick={() => setActiveTab('simulation')}
          className={`pb-2.5 px-3 font-semibold transition-colors flex items-center gap-1.5 border-b-2 ${
            activeTab === 'simulation'
              ? 'border-cyan-500 text-strong'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          3. Euler Dynamic Simulation
        </button>

        <button
          onClick={() => setActiveTab('consolidation')}
          className={`pb-2.5 px-3 font-semibold transition-colors flex items-center gap-1.5 border-b-2 ${
            activeTab === 'consolidation'
              ? 'border-cyan-500 text-strong'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          4. Leverage Points &amp; FSRS Deck
        </button>
      </div>

      {/* TAB 1: Stock & Flow Mapping */}
      {activeTab === 'mapping' && (
        <div className="space-y-4">
          <Panel className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-cyan-500" />
                  Bathtub Dynamics: Classify Stocks vs Flows
                </h3>
                <span className="text-xs text-tertiary">
                  Linda Booth Sweeney &amp; John Sterman (2000) Bathtub Dynamics Inventory
                </span>
              </div>
            </div>

            <p className="text-xs text-secondary leading-relaxed">
              A <strong>Stock</strong> is an accumulation that integrates over time (e.g. water in a
              tub, carbon in the atmosphere, money in a vault). A <strong>Flow</strong> is a rate
              that changes a stock instantaneously per unit time (e.g. water from faucet, emissions
              per year). Classify each system element:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {/* Stocks Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-strong uppercase tracking-wider text-tertiary">
                  Accumulation Candidates (Stocks)
                </h4>
                {activeScenario.stocks.map((stock) => (
                  <div
                    key={stock.id}
                    className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-strong">{stock.name}</span>
                      <select
                        value={variableClassifications[stock.id] ?? 'stock'}
                        onChange={(e) =>
                          setVariableClassifications((prev) => ({
                            ...prev,
                            [stock.id]: e.target.value as VariableNature,
                          }))
                        }
                        className="rounded border border-neutral-200 dark:border-(--hub-border) bg-surface px-2 py-1 text-xs text-strong"
                      >
                        <option value="stock">Stock (Accumulation)</option>
                        <option value="flow">Flow (Rate)</option>
                        <option value="auxiliary">Auxiliary / Parameter</option>
                      </select>
                    </div>
                    <p className="text-xs text-secondary">{stock.description}</p>
                    <div className="text-[11px] font-medium text-cyan-700 dark:text-cyan-400">
                      Unit: {stock.unit} · Baseline Initial Value: {stock.initialValue}
                    </div>
                  </div>
                ))}
              </div>

              {/* Flows Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-strong uppercase tracking-wider text-tertiary">
                  Rate of Change Candidates (Flows)
                </h4>
                {activeScenario.flows.map((flow) => (
                  <div
                    key={flow.id}
                    className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-strong">{flow.name}</span>
                      <select
                        value={variableClassifications[flow.id] ?? 'flow'}
                        onChange={(e) =>
                          setVariableClassifications((prev) => ({
                            ...prev,
                            [flow.id]: e.target.value as VariableNature,
                          }))
                        }
                        className="rounded border border-neutral-200 dark:border-(--hub-border) bg-surface px-2 py-1 text-xs text-strong"
                      >
                        <option value="flow">Flow (Rate)</option>
                        <option value="stock">Stock (Accumulation)</option>
                        <option value="auxiliary">Auxiliary / Parameter</option>
                      </select>
                    </div>
                    <p className="text-xs text-secondary">{flow.formulaDescription}</p>
                    <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      Rate: {flow.defaultRate} {flow.unit}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setActiveTab('loops')} variant="primary">
                Next: Causal Loops &amp; Delays <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 2: Causal Loops & Delays */}
      {activeTab === 'loops' && (
        <div className="space-y-4">
          <Panel className="space-y-3">
            <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
              <ArrowRightLeft className="h-4 w-4 text-cyan-500" />
              Causal Loop Diagramming &amp; Polarity Analysis
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              Closed feedback loops dictate system behavior. A <strong>Reinforcing (R)</strong> loop
              compounds growth or collapse; a <strong>Balancing (B)</strong> loop seeks a goal or
              equilibrium setpoint. When balancing loops contain long delays, they oscillate and
              overshoot.
            </p>

            <div className="space-y-3 pt-2">
              {activeScenario.canonicalLoops.map((loop) => (
                <div
                  key={loop.id}
                  className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-bold text-strong">{loop.name}</span>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={identifiedDelays[loop.id] ?? false}
                          onChange={(e) =>
                            setIdentifiedDelays((prev) => ({
                              ...prev,
                              [loop.id]: e.target.checked,
                            }))
                          }
                          className="rounded border-neutral-300 dark:border-(--hub-border)"
                        />
                        <Clock className="h-3 w-3 text-cyan-500" />
                        Significant Delay Present
                      </label>

                      <select
                        value={identifiedPolarities[loop.id] ?? loop.polarity}
                        onChange={(e) =>
                          setIdentifiedPolarities((prev) => ({
                            ...prev,
                            [loop.id]: e.target.value as LoopPolarity,
                          }))
                        }
                        className="rounded border border-neutral-200 dark:border-(--hub-border) bg-surface px-2 py-1 text-xs text-strong font-medium"
                      >
                        <option value="reinforcing">Reinforcing (Positive Feedback R)</option>
                        <option value="balancing">Balancing (Negative Feedback B)</option>
                      </select>
                    </div>
                  </div>

                  <p className="text-xs text-secondary">{loop.explanation}</p>
                  {loop.delayDescription && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                      Latent Lag: {loop.delayDescription} ({loop.delaySteps} steps)
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Archetype & Behavioral Prediction Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-neutral-200 dark:border-(--hub-border)">
              <div>
                <label className="text-xs font-semibold text-strong block mb-1">
                  Diagnose Dominant Systems Archetype (Peter Senge 1990)
                </label>
                <select
                  value={selectedArchetype}
                  onChange={(e) => setSelectedArchetype(e.target.value as SystemsArchetype)}
                  className="w-full rounded border border-neutral-200 dark:border-(--hub-border) bg-surface p-2 text-xs text-strong"
                >
                  <option value="limits_to_growth">Limits to Growth (R meets B capacity)</option>
                  <option value="fixes_that_fail">
                    Fixes that Fail (Quick-fix yields delayed vicious cycle)
                  </option>
                  <option value="shifting_the_burden">
                    Shifting the Burden (Symptomatic fix atrophies fundamental capacity)
                  </option>
                  <option value="tragedy_of_the_commons">
                    Tragedy of the Commons (Erosion of shared finite resource)
                  </option>
                  <option value="eroding_goals">
                    Eroding Goals (Lowering standards to match lagging performance)
                  </option>
                  <option value="escalation">Escalation (Reciprocal competitive arms race)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-strong block mb-1">
                  Predicted Behavioral Trajectory Over Time
                </label>
                <select
                  value={predictedBehavior}
                  onChange={(e) =>
                    setPredictedBehavior(
                      e.target.value as
                        | 'exponential_growth'
                        | 's_shaped_growth'
                        | 'overshoot_and_collapse'
                        | 'damped_oscillation'
                        | 'asymptotic_stability',
                    )
                  }
                  className="w-full rounded border border-neutral-200 dark:border-(--hub-border) bg-surface p-2 text-xs text-strong"
                >
                  <option value="overshoot_and_collapse">
                    Overshoot and Collapse (Tipping Threshold)
                  </option>
                  <option value="s_shaped_growth">
                    S-Shaped Sigmoidal Growth (Carrying Capacity)
                  </option>
                  <option value="damped_oscillation">Damped Oscillation (Delay Hunting)</option>
                  <option value="exponential_growth">Runaway Exponential Growth</option>
                  <option value="asymptotic_stability">Smooth Asymptotic Stability</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setActiveTab('simulation')} variant="primary">
                Next: Run Euler Dynamic Simulation <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 3: Euler Dynamic Simulation */}
      {activeTab === 'simulation' && (
        <div className="space-y-4">
          <Panel className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-cyan-500" />
                  Deterministic Euler Numerical Integration (dt = {activeScenario.defaultDt})
                </h3>
                <span className="text-xs text-tertiary">
                  Stock(t + dt) = Stock(t) + dt × (Inflows - Outflows)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={handleRunSimulation} variant="primary">
                  <Play className="h-3.5 w-3.5 mr-1" />
                  Re-Run Simulation
                </Button>
              </div>
            </div>

            {/* Interactive Policy Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface">
              <div>
                <label className="text-xs font-semibold text-strong flex items-center gap-1 mb-1">
                  <Sliders className="h-3.5 w-3.5 text-cyan-500" />
                  Primary Flow Multiplier Policy: {policyMultiplier}×
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="2.5"
                  step="0.1"
                  value={policyMultiplier}
                  onChange={(e) => setPolicyMultiplier(parseFloat(e.target.value))}
                  className="w-full"
                />
                <span className="text-[11px] text-tertiary">
                  Scale rate of primary driver flow ({activeScenario.flows[0]?.name})
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-strong flex items-center gap-1 mb-1">
                  <Clock className="h-3.5 w-3.5 text-cyan-500" />
                  Simulation Duration: {simulationSteps} Steps
                </label>
                <input
                  type="range"
                  min="20"
                  max="120"
                  step="10"
                  value={simulationSteps}
                  onChange={(e) => setSimulationSteps(parseInt(e.target.value, 10))}
                  className="w-full"
                />
                <span className="text-[11px] text-tertiary">
                  Total time horizon simulated under discrete Euler integration
                </span>
              </div>
            </div>

            {/* Simulation Trajectory Results Table */}
            {simulationRun && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs font-medium text-secondary">
                  <span>{simulationRun.summary}</span>
                  <span className="font-semibold text-cyan-600 dark:text-cyan-400">
                    {simulationRun.steps.length} Sample Points
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[300px] border border-neutral-200 dark:border-(--hub-border) rounded-lg">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-surface-elevated text-tertiary border-b border-neutral-200 dark:border-(--hub-border) sticky top-0">
                      <tr>
                        <th className="p-2">Step</th>
                        <th className="p-2">Time</th>
                        {activeScenario.stocks.map((s) => (
                          <th key={s.id} className="p-2">
                            {s.name} ({s.unit})
                          </th>
                        ))}
                        <th className="p-2">Dominant Loop</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-(--hub-border)">
                      {simulationRun.steps
                        .filter((_, idx) => idx % Math.ceil(simulationSteps / 15) === 0)
                        .map((step) => (
                          <tr key={step.step} className="hover:bg-surface-elevated">
                            <td className="p-2 font-mono text-secondary">{step.step}</td>
                            <td className="p-2 font-mono text-secondary">{step.time}</td>
                            {activeScenario.stocks.map((s) => (
                              <td key={s.id} className="p-2 font-mono text-strong font-semibold">
                                {Math.round((step.stocks[s.id] ?? 0) * 100) / 100}
                              </td>
                            ))}
                            <td className="p-2 text-[11px] font-medium text-cyan-700 dark:text-cyan-400">
                              {step.dominantLoopId ?? 'None'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={() => setActiveTab('consolidation')} variant="primary">
                Next: Consolidate Leverage Points &amp; FSRS Deck{' '}
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 4: Leverage Points & FSRS Deck */}
      {activeTab === 'consolidation' && (
        <div className="space-y-4">
          <Panel className="space-y-3">
            <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-cyan-500" />
              Donella Meadows High-Leverage Strategic Intervention
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              Formulate your systemic leverage proposal. Donella Meadows demonstrated that pushing
              parameters (tax rates, subsidy dollars) is low leverage (Rank 12–10); restructuring
              feedback loops, information channels, and system rules (Rank 6–4) yields exponential
              transformational leverage.
            </p>

            <TextArea
              label="Proposed High-Leverage Policy / Structural Intervention"
              value={proposedIntervention}
              onChange={(e) => setProposedIntervention(e.target.value)}
              placeholder="State how you would rewire information flows, feedback loops, or system rules..."
              rows={3}
            />

            <div className="flex justify-end pt-2">
              <Button onClick={handleEvaluateModel} disabled={evaluating} variant="primary">
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                {evaluating ? 'Evaluating Telemetry...' : 'Compute Full Systemic Evaluation'}
              </Button>
            </div>
          </Panel>

          {/* Calibrated FSRS Review Deck */}
          {fsrsDeck && (
            <Panel className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-cyan-500" />
                    Calibrated FSRS-6 Review Deck ({fsrsDeck.cards.length} Cards)
                  </h3>
                  <span className="text-xs text-tertiary">
                    Anchored to Stock/Flow Discrepancies, Loop Polarities &amp; Leverage Points
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {fsrsDeck.cards.map((card) => (
                  <div
                    key={card.id}
                    className="rounded border border-neutral-200 dark:border-(--hub-border) bg-surface p-2.5 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px] font-medium text-tertiary">
                      <span className="uppercase text-cyan-600 dark:text-cyan-400">
                        {card.cardType.replace(/_/g, ' ')}
                      </span>
                      <span>
                        S: {card.fsrsParameters.stability}d · D: {card.fsrsParameters.difficulty}
                      </span>
                    </div>
                    <p className="text-strong font-medium whitespace-pre-line">{card.front}</p>
                    <p className="text-secondary whitespace-pre-line pt-1 border-t border-neutral-200 dark:border-(--hub-border)">
                      {card.back}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  )
}
