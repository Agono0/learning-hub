'use client'

/**
 * @file AnalogicalTransferStudio.tsx
 * @description Interactive Analogical Transfer & Schema Induction Studio.
 *
 * Implements:
 * - Mary L. Gick & Keith J. Holyoak (1980, 1983) Cross-Domain Convergence Schema Induction
 * - Dedre Gentner (1983) Structure-Mapping Theory & Systematicity Principle
 * - Laura R. Novick (1988) Novice Surface Decoys vs Expert Relational Transfer
 * - FSRS-6 Spaced Retrieval Generalization Deck Synthesis
 */

import React, { useMemo, useState } from 'react'
import {
  AnalogicalTransferSession,
  AnalogicalTransferSuite,
  CALIBRATED_ANALOGICAL_SUITES,
  exportAnalogicalToFSRSCards,
  FSRSAnalogicalCard,
} from '@learning-hub/core/analogy/structure-mapping-engine'
import { AnalogicalTransferHUD, Badge, Button, Markdown, Panel } from '@/ui'
import { getSharedAudioContext } from '@/lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium } from '../platform/haptics'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  GitCompare,
  Layers,
  Network,
  RotateCcw,
  Sparkles,
} from 'lucide-react'

export interface AnalogicalTransferStudioProps {
  initialSuites?: Record<string, AnalogicalTransferSuite>
  onExportCards?: (cards: FSRSAnalogicalCard[]) => void
}

type StudioTab =
  'isomorphic_mapping' | 'convergence_schema' | 'false_analogy_crucible' | 'fsrs_deck'

function playStudioAudio(freq: number, duration = 0.15, type: OscillatorType = 'sine') {
  void getSharedAudioContext()
    .then((ctx) => {
      if (!ctx) return
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, now)
      gain.gain.setValueAtTime(0.08, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + duration)
    })
    .catch(() => {
      // Audio fallback
    })
}

export function AnalogicalTransferStudio({
  initialSuites = CALIBRATED_ANALOGICAL_SUITES,
  onExportCards,
}: AnalogicalTransferStudioProps) {
  const [session, setSession] = useState(() => new AnalogicalTransferSession(initialSuites))
  const [activeTab, setActiveTab] = useState<StudioTab>('isomorphic_mapping')

  // User input states
  const [schemaText, setSchemaText] = useState<string>('')
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  const sessionState = session.getState()
  const currentSuite = session.getCurrentSuite()
  const currentBase = session.getSelectedBaseAnalog()
  const currentTelemetry = currentSuite
    ? (sessionState.suiteHistory[currentSuite.suiteId] ?? null)
    : null

  // Generated FSRS Cards
  const fsrsCards = useMemo(() => {
    return exportAnalogicalToFSRSCards(session)
  }, [session, Object.keys(sessionState.suiteHistory).length])

  // Handle Suite Change
  const handleSelectSuite = (suiteId: string) => {
    hapticLight()
    session.selectSuite(suiteId)
    setSchemaText('')
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Handle Base Analog Toggle
  const handleSelectBaseAnalog = (idx: number) => {
    hapticLight()
    session.selectBaseAnalog(idx)
    playStudioAudio(440, 0.12, 'sine')
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Map Entity
  const handleSetEntityMapping = (baseId: string, targetId: string) => {
    hapticLight()
    session.setEntityMapping(baseId, targetId)
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Map Predicate
  const handleSetPredicateMapping = (basePredId: string, targetPredId: string) => {
    hapticLight()
    session.setPredicateMapping(basePredId, targetPredId)
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Evaluate Structure Mapping
  const handleEvaluate = () => {
    if (!currentSuite) return

    session.setSchemaText(schemaText)
    const telemetry = session.evaluateCurrentMapping()

    if (telemetry && telemetry.systematicityScore >= 75) {
      hapticMedium()
      playStudioAudio(659.25, 0.25, 'sine') // E5 chime
    } else {
      hapticLight()
      playStudioAudio(392, 0.2, 'triangle')
    }

    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Reset mappings
  const handleReset = () => {
    hapticLight()
    session.selectSuite(sessionState.currentSuiteId)
    setSchemaText('')
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Copy FSRS cards
  const handleCopyCards = () => {
    hapticMedium()
    navigator.clipboard.writeText(JSON.stringify(fsrsCards, null, 2))
    setCopyStatus('Copied Analogical FSRS JSON to clipboard!')
    setTimeout(() => setCopyStatus(null), 3000)
  }

  // Export to Deck Engine
  const handleExportDeck = () => {
    hapticHeavy()
    if (onExportCards) {
      onExportCards(fsrsCards)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Real-time Telemetry HUD */}
      {currentSuite && currentBase && (
        <AnalogicalTransferHUD
          telemetry={currentTelemetry}
          currentSuiteTitle={currentSuite.title}
          targetDomainName={currentSuite.targetProblem.domainName}
          baseDomainName={currentBase.domainName}
        />
      )}

      {/* Suite Selector & Workspace Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Suite Quick Selector */}
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <label htmlFor="suite-select" className="text-xs font-semibold text-faint">
            Analogical Problem Suite:
          </label>
          <select
            id="suite-select"
            value={sessionState.currentSuiteId}
            onChange={(e) => handleSelectSuite(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs font-bold text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            {Object.entries(initialSuites).map(([id, s]) => (
              <option key={id} value={id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        {/* Workspace Navigation Tabs */}
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 p-1.5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              hapticLight()
              setActiveTab('isomorphic_mapping')
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'isomorphic_mapping'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-faint hover:text-slate-200'
            }`}
          >
            <GitCompare className="h-3.5 w-3.5 text-status-info-text" />
            <span>Isomorphic Mapping</span>
          </button>
          <button
            type="button"
            onClick={() => {
              hapticLight()
              setActiveTab('convergence_schema')
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'convergence_schema'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-faint hover:text-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-indigo-400" />
            <span>Convergence Schema</span>
          </button>
          <button
            type="button"
            onClick={() => {
              hapticLight()
              setActiveTab('false_analogy_crucible')
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'false_analogy_crucible'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-faint hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-danger-text" />
            <span>False Analogy Decoy</span>
          </button>
          <button
            type="button"
            onClick={() => {
              hapticLight()
              setActiveTab('fsrs_deck')
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'fsrs_deck'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-faint hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-status-warning-text" />
            <span>FSRS Schema Deck ({fsrsCards.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: ISOMORPHIC MAPPING STAGE */}
      {activeTab === 'isomorphic_mapping' && currentSuite && currentBase && (
        <div className="flex flex-col gap-6">
          {/* Base Analog Selector Sub-Bar */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-faint">Select Base Domain Analog:</span>
              <div className="flex gap-1.5">
                {currentSuite.baseAnalogs.map((base, idx) => (
                  <button
                    key={base.id}
                    type="button"
                    onClick={() => handleSelectBaseAnalog(idx)}
                    className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                      sessionState.selectedBaseAnalogIndex === idx
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-800 text-tertiary hover:bg-slate-700'
                    }`}
                  >
                    Analog {idx + 1}: {base.domainName}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleReset}
              className="gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-1"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Mappings</span>
            </Button>
          </div>

          {/* Side-by-Side Domain Panels */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left Column: Source Base Domain */}
            <Panel className="p-6 border-sky-900/40">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <Badge tone="cyan" className="text-[10px]">
                    Source Base: {currentBase.domainName}
                  </Badge>
                  <h3 className="mt-1 text-base font-bold text-slate-100">
                    {currentBase.scenarioTitle}
                  </h3>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-300 border border-slate-800">
                {currentBase.narrativeDescription}
              </div>

              {/* Base Entities & Interactive Mapping Target Picker */}
              <div className="mt-5">
                <span className="text-xs font-bold uppercase tracking-wider text-faint">
                  Base Entities &rarr; Map to Target:
                </span>
                <div className="mt-3 space-y-3">
                  {currentBase.entities.map((baseEnt) => {
                    const currentMapping = sessionState.activeEntityMappings[baseEnt.id] ?? ''
                    const isEvaluated = !!currentTelemetry
                    const expectedTarget = currentSuite.keyRelationalAlignments[baseEnt.id]
                    const isMatch = isEvaluated && currentMapping === expectedTarget

                    let cardBorder = 'border-slate-800 bg-slate-950/40'
                    if (isEvaluated) {
                      cardBorder = isMatch
                        ? 'border-emerald-500 bg-emerald-950/20 text-status-success-text'
                        : 'border-rose-500 bg-rose-950/20 text-danger-text'
                    }

                    return (
                      <div
                        key={baseEnt.id}
                        className={`rounded-xl border p-3.5 transition-all ${cardBorder}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold text-slate-100">{baseEnt.name}</span>
                            <span className="ml-2 text-[10px] text-status-info-text">
                              ({baseEnt.role})
                            </span>
                          </div>
                          {isEvaluated && (
                            <Badge tone={isMatch ? 'success' : 'danger'} className="text-[10px]">
                              {isMatch ? 'Aligned' : 'Misaligned'}
                            </Badge>
                          )}
                        </div>

                        {/* Surface attributes */}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {baseEnt.surfaceAttributes.map((attr) => (
                            <span
                              key={attr}
                              className="rounded bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-tertiary"
                            >
                              {attr}
                            </span>
                          ))}
                        </div>

                        {/* Target Entity Select Box */}
                        <div className="mt-3 flex items-center gap-2">
                          <label
                            htmlFor={`target-entity-select-${baseEnt.id}`}
                            className="text-xs text-faint"
                          >
                            Corresponds to:
                          </label>
                          <select
                            id={`target-entity-select-${baseEnt.id}`}
                            value={currentMapping}
                            onChange={(e) => handleSetEntityMapping(baseEnt.id, e.target.value)}
                            disabled={isEvaluated}
                            className="flex-1 rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-1 text-xs font-semibold text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          >
                            <option value="">-- Select Target Entity --</option>
                            {currentSuite.targetProblem.entities.map((targetEnt) => (
                              <option key={targetEnt.id} value={targetEnt.id}>
                                {targetEnt.name} ({targetEnt.role})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Panel>

            {/* Right Column: Target Problem Domain */}
            <Panel className="p-6 border-indigo-900/40">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <Badge tone="violet" className="text-[10px]">
                    Target Goal: {currentSuite.targetProblem.domainName}
                  </Badge>
                  <h3 className="mt-1 text-base font-bold text-slate-100">
                    {currentSuite.targetProblem.scenarioTitle}
                  </h3>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-300 border border-slate-800">
                {currentSuite.targetProblem.narrativeDescription}
              </div>

              {/* Target Entities Display */}
              <div className="mt-5">
                <span className="text-xs font-bold uppercase tracking-wider text-faint">
                  Target Domain Entities:
                </span>
                <div className="mt-3 space-y-3">
                  {currentSuite.targetProblem.entities.map((targetEnt) => (
                    <div
                      key={targetEnt.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-100">{targetEnt.name}</span>
                        <span className="text-[10px] text-indigo-400">({targetEnt.role})</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {targetEnt.surfaceAttributes.map((attr) => (
                          <span
                            key={attr}
                            className="rounded bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-tertiary"
                          >
                            {attr}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>

          {/* Relational Predicate Correspondence Mapping Bar */}
          <Panel className="p-6">
            <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Network className="h-4 w-4 text-status-info-text" />
              <span>Gentner Higher-Order Predicate Preservation</span>
            </h4>
            <p className="mt-1 text-xs text-faint">
              True analogies preserve systems of relational predicates (causal results, threshold
              boundaries) rather than isolated objects.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {currentBase.predicates.map((basePred) => {
                const mappedTargetPredId = sessionState.activePredicateMappings[basePred.id] ?? ''
                const isEvaluated = !!currentTelemetry
                const targetMatches = currentSuite.targetProblem.predicates.filter(
                  (tp) => tp.predicateType === basePred.predicateType,
                )

                return (
                  <div
                    key={basePred.id}
                    className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/40 p-4"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <Badge tone="cyan" className="text-[10px]">
                          {basePred.predicateType}
                        </Badge>
                        <span className="text-xs font-mono font-bold text-secondary">
                          {basePred.predicateName}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-faint leading-relaxed">
                        {basePred.higherOrderExplanation}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2">
                      <label
                        htmlFor={`predicate-select-${basePred.id}`}
                        className="text-xs text-faint"
                      >
                        Target Predicate:
                      </label>
                      <select
                        id={`predicate-select-${basePred.id}`}
                        value={mappedTargetPredId}
                        onChange={(e) => handleSetPredicateMapping(basePred.id, e.target.value)}
                        disabled={isEvaluated}
                        className="flex-1 rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-1 text-xs font-semibold text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      >
                        <option value="">-- Match Relational Predicate --</option>
                        {targetMatches.map((tp) => (
                          <option key={tp.id} value={tp.id}>
                            {tp.predicateName} ({tp.predicateType})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Abstract Convergence Schema Synthesis Input */}
            <div className="mt-6">
              <label className="block text-xs font-semibold text-secondary">
                Articulate the Domain-Invariant Convergence Schema:
              </label>
              <textarea
                value={schemaText}
                onChange={(e) => setSchemaText(e.target.value)}
                disabled={!!currentTelemetry}
                placeholder="State the underlying principle in abstract terms (e.g., 'Subdivide a large force into multiple sub-threshold fractions so they do not destroy the intervening medium, and synchronize them to converge on the target')..."
                rows={3}
                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            {/* Action Button */}
            <div className="mt-5 flex justify-end">
              <Button
                onClick={handleEvaluate}
                disabled={
                  Object.keys(sessionState.activeEntityMappings).length === 0 ||
                  schemaText.trim().length === 0
                }
                className="gap-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2.5 px-6"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Evaluate Structure Mapping</span>
              </Button>
            </div>

            {/* Evaluation Result Feedback */}
            {currentTelemetry && (
              <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/80 p-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">Gentner Evaluation:</span>
                  <Badge tone={currentTelemetry.systematicityScore >= 80 ? 'success' : 'warning'}>
                    Systematicity: {currentTelemetry.systematicityScore}/100
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-secondary leading-relaxed">
                  {currentTelemetry.feedbackMessage}
                </p>
                <div className="mt-3 pt-2.5 border-t border-slate-800 text-xs text-faint">
                  <strong className="text-status-info-text">Canonical Solution:</strong>{' '}
                  {currentSuite.targetProblem.solutionProcedure}
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* TAB 2: CONVERGENCE SCHEMA SYNTHESIZER */}
      {activeTab === 'convergence_schema' && currentSuite && (
        <Panel className="p-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-400" />
              <span>Multi-Analog Convergence Schema Synthesis (Gick & Holyoak 1983)</span>
            </h3>
            <p className="mt-1 text-xs text-faint leading-relaxed">
              When learners examine only ONE analog, spontaneous transfer occurs in only 30% of
              cases. When comparing TWO diverse analogs, spontaneous transfer surges to over 80% as
              superficial narratives drop away and the abstract relational schema crystallizes.
            </p>
          </div>

          {/* Triad Comparison Grid */}
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Base 1 */}
            <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <Badge tone="cyan" className="self-start text-[10px]">
                Base 1: {currentSuite.baseAnalogs[0]?.domainName}
              </Badge>
              <h4 className="mt-2 text-sm font-bold text-slate-100">
                {currentSuite.baseAnalogs[0]?.scenarioTitle}
              </h4>
              <p className="mt-2 flex-1 text-xs text-faint leading-relaxed">
                {currentSuite.baseAnalogs[0]?.narrativeDescription}
              </p>
              <div className="mt-3 pt-2 border-t border-slate-800/80 text-[11px] font-semibold text-status-info-text">
                Procedure: {currentSuite.baseAnalogs[0]?.solutionProcedure}
              </div>
            </div>

            {/* Base 2 */}
            <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <Badge tone="violet" className="self-start text-[10px]">
                Base 2: {currentSuite.baseAnalogs[1]?.domainName ?? 'Disaster Control'}
              </Badge>
              <h4 className="mt-2 text-sm font-bold text-slate-100">
                {currentSuite.baseAnalogs[1]?.scenarioTitle ?? 'Radial Water Streams'}
              </h4>
              <p className="mt-2 flex-1 text-xs text-faint leading-relaxed">
                {currentSuite.baseAnalogs[1]?.narrativeDescription ??
                  'Small water hoses deployed in a radial circle prevent soil collapse while delivering adequate extinguishing water.'}
              </p>
              <div className="mt-3 pt-2 border-t border-slate-800/80 text-[11px] font-semibold text-indigo-300">
                Procedure:{' '}
                {currentSuite.baseAnalogs[1]?.solutionProcedure ?? 'Converge radial streams.'}
              </div>
            </div>

            {/* Target */}
            <div className="flex flex-col rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-4">
              <Badge tone="success" className="self-start text-[10px]">
                Target: {currentSuite.targetProblem.domainName}
              </Badge>
              <h4 className="mt-2 text-sm font-bold text-slate-100">
                {currentSuite.targetProblem.scenarioTitle}
              </h4>
              <p className="mt-2 flex-1 text-xs text-faint leading-relaxed">
                {currentSuite.targetProblem.narrativeDescription}
              </p>
              <div className="mt-3 pt-2 border-t border-emerald-900/40 text-[11px] font-semibold text-status-success-text">
                Procedure: {currentSuite.targetProblem.solutionProcedure}
              </div>
            </div>
          </div>

          {/* Unified Abstract Schema Card */}
          <div className="mt-6 rounded-xl border border-slate-700 bg-slate-900/90 p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-status-warning-text" />
              <h4 className="text-sm font-bold text-slate-100">
                {currentSuite.convergenceSchema.schemaName}
              </h4>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
              <div className="rounded-lg bg-slate-950/60 p-3 border border-slate-800">
                <span className="font-bold text-faint">Abstract Goal:</span>
                <p className="mt-1 text-secondary">{currentSuite.convergenceSchema.abstractGoal}</p>
              </div>

              <div className="rounded-lg bg-slate-950/60 p-3 border border-slate-800">
                <span className="font-bold text-faint">Abstract Obstacle:</span>
                <p className="mt-1 text-secondary">
                  {currentSuite.convergenceSchema.abstractObstacle}
                </p>
              </div>

              <div className="rounded-lg bg-slate-950/60 p-3 border border-slate-800">
                <span className="font-bold text-faint">Abstract Solution:</span>
                <p className="mt-1 text-secondary">
                  {currentSuite.convergenceSchema.abstractSolution}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-slate-950/70 p-3 border border-slate-800 font-mono text-xs text-status-success-text">
              <strong>Mathematical Invariant:</strong>{' '}
              {currentSuite.convergenceSchema.mathematicalOrAlgorithmicInvariant}
            </div>
          </div>
        </Panel>
      )}

      {/* TAB 3: FALSE ANALOGY CRUCIBLE */}
      {activeTab === 'false_analogy_crucible' && currentSuite && (
        <Panel className="p-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-danger-text" />
              <span>False Analogy Decoy Inspector (Novick 1988 Negative Transfer)</span>
            </h3>
            <p className="mt-1 text-xs text-faint leading-relaxed">
              Novices frequently fall for surface traps (e.g. matching words like
              &apos;stomach&apos;, &apos;doctor&apos;, &apos;tissue&apos;) even when the relational
              causal structure is completely broken. Inspect the negative transfer trap below:
            </p>
          </div>

          <div className="mt-6 flex flex-col rounded-xl border border-rose-900/40 bg-rose-950/10 p-5">
            <div className="flex items-center justify-between border-b border-rose-900/30 pb-3">
              <div>
                <Badge tone="danger" className="text-[10px]">
                  Negative Transfer Trap: {currentSuite.falseAnalogyDecoy.decoyDomain}
                </Badge>
                <h4 className="mt-1 text-base font-bold text-slate-100">
                  {currentSuite.falseAnalogyDecoy.decoyTitle}
                </h4>
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-secondary">
              {currentSuite.falseAnalogyDecoy.narrative}
            </p>

            {/* Surface matching keywords that fool novices */}
            <div className="mt-4">
              <span className="text-xs font-semibold text-faint">
                Surface Vocabulary That Triggers False Matching:
              </span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {currentSuite.falseAnalogyDecoy.surfaceMatchingEntities.map((kw) => (
                  <span
                    key={kw}
                    className="rounded bg-rose-950/40 border border-rose-800/40 px-2 py-0.5 text-xs text-danger-text"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>

            {/* Why the relational predicate fails */}
            <div className="mt-4 rounded-xl bg-slate-900/80 p-4 border border-slate-800 text-xs text-slate-300">
              <strong className="text-danger-text">Why Relational Mapping Breaks Down:</strong>
              <p className="mt-1 leading-relaxed">
                {currentSuite.falseAnalogyDecoy.brokenPredicateReason}
              </p>
              <div className="mt-2.5 pt-2 border-t border-slate-800 text-faint">
                <strong>Novice Cognitive Trap:</strong>{' '}
                {currentSuite.falseAnalogyDecoy.noviceTrapExplanation}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* TAB 4: FSRS SCHEMA DECK */}
      {activeTab === 'fsrs_deck' && (
        <Panel className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-status-warning-text" />
                <span>FSRS Analogical Generalization Review Deck</span>
              </h3>
              <p className="mt-1 text-xs text-faint">
                Cross-domain flashcards created from structure-mapping sessions. Memory stability is
                multiplied by your Gentner Systematicity score.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleCopyCards}
                disabled={fsrsCards.length === 0}
                className="gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs py-2"
              >
                <Copy className="h-3.5 w-3.5 text-faint" />
                <span>Copy JSON</span>
              </Button>
              <Button
                onClick={handleExportDeck}
                disabled={fsrsCards.length === 0}
                className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs py-2"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export to Review Engine</span>
              </Button>
            </div>
          </div>

          {copyStatus && (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs text-status-success-text">
              {copyStatus}
            </div>
          )}

          {fsrsCards.length === 0 ? (
            <div className="mt-8 flex flex-col items-center justify-center p-8 text-center text-faint">
              <BookOpen className="h-10 w-10 text-slate-600 mb-3" />
              <p className="text-sm font-semibold text-secondary">No Evaluated Suites Yet</p>
              <p className="mt-1 text-xs text-tertiary max-w-sm">
                Perform structure mapping in the Isomorphic Mapping stage to synthesize cross-domain
                transfer flashcards with elevated initial memory stability.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              {fsrsCards.map((card) => (
                <div
                  key={card.id}
                  className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/50 p-4"
                >
                  <div className="flex items-center justify-between border-b border-slate-800/60 pb-2.5">
                    <Badge tone="cyan" className="text-[10px]">
                      Stability: {card.suggestedStabilityDays} days
                    </Badge>
                    <span className="text-[10px] text-tertiary font-mono">
                      {card.schemaCategory}
                    </span>
                  </div>

                  <div className="mt-3 flex-1 text-xs">
                    <div className="font-semibold text-secondary mb-1">Front Prompt:</div>
                    <div className="rounded-lg bg-slate-900/60 p-2.5 text-slate-300 border border-slate-800/60">
                      <Markdown>{card.front}</Markdown>
                    </div>

                    <div className="font-semibold text-secondary mt-3 mb-1">Back Solution:</div>
                    <div className="rounded-lg bg-slate-900/60 p-2.5 text-slate-300 border border-slate-800/60">
                      <Markdown>{card.back}</Markdown>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
