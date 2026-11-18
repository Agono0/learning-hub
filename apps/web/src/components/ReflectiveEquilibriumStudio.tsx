'use client'

/**
 * @file apps/web/src/components/ReflectiveEquilibriumStudio.tsx
 * @description Interactive Wide Reflective Equilibrium & Epistemic Calibration Studio.
 *
 * Implements:
 * - John Rawls (1971) & Nelson Goodman (1955) Wide Reflective Equilibrium (WRE)
 * - Glenn W. Brier (1950) & Philip Tetlock (2005) Epistemic Probability Calibration
 * - FSRS-6 Epistemic Stability Bridge
 */

import React, { useMemo, useState } from 'react'
import {
  CALIBRATED_EQUILIBRIUM_SUITES,
  CalibratedProbabilityPrediction,
  EpistemicTierType,
  evaluateReflectiveEquilibrium,
  exportEquilibriumToFSRSCards,
  FSRSEpistemicCard,
  ReflectiveEquilibriumSession,
  ReflectiveEquilibriumSuite,
  TriadResolutionStrategy,
} from '@learning-hub/core/equilibrium/reflective-equilibrium-engine'
import { Badge, Button, Markdown, Panel, ReflectiveEquilibriumHUD } from '@/ui'
import { getSharedAudioContext } from '@/lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium } from '../platform/haptics'
import {
  Brain,
  CheckCircle2,
  Copy,
  Download,
  GitBranch,
  Network,
  RotateCcw,
  Scale,
  Sparkles,
  Target,
} from 'lucide-react'

export interface ReflectiveEquilibriumStudioProps {
  initialSuites?: Record<string, ReflectiveEquilibriumSuite>
  onExportCards?: (cards: FSRSEpistemicCard[]) => void
}

type StudioTab = 'triad_reconciler' | 'coherence_graph' | 'brier_crucible' | 'fsrs_deck'

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
    .catch(() => {})
}

export function ReflectiveEquilibriumStudio({
  initialSuites = CALIBRATED_EQUILIBRIUM_SUITES,
  onExportCards,
}: ReflectiveEquilibriumStudioProps) {
  const [suiteKey, setSuiteKey] = useState<string>('distributed_consensus_wre')
  const [activeTab, setActiveTab] = useState<StudioTab>('triad_reconciler')
  const [activeTier, setActiveTier] = useState<EpistemicTierType>('considered_judgment')

  // Interactive adjustments
  const [resolvedStrategies, setResolvedStrategies] = useState<
    Record<string, TriadResolutionStrategy>
  >({})
  const [userPredictions, setUserPredictions] = useState<CalibratedProbabilityPrediction[]>([])
  const [currentConfidenceInput, setCurrentConfidenceInput] = useState<number>(0.8)
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null)

  const session = useMemo(() => {
    return new ReflectiveEquilibriumSession(suiteKey)
  }, [suiteKey])

  const suite = initialSuites[suiteKey] || CALIBRATED_EQUILIBRIUM_SUITES.distributed_consensus_wre

  // Live evaluation state
  const evaluation = useMemo(() => {
    const combinedState = {
      suiteId: suite.id,
      activeAdjustments: {},
      resolvedTriadStrategies: resolvedStrategies,
      recordedPredictions: userPredictions.length > 0 ? userPredictions : suite.predictionBank,
    }
    return evaluateReflectiveEquilibrium(suite, combinedState)
  }, [suite, resolvedStrategies, userPredictions])

  const exportedCards = useMemo(() => {
    return exportEquilibriumToFSRSCards(suite, evaluation)
  }, [suite, evaluation])

  // Handlers
  const handleSelectTier = (tier: EpistemicTierType) => {
    hapticLight()
    playStudioAudio(523.25, 0.1, 'sine')
    setActiveTier(tier)
  }

  const handleResolveStrategy = (triadId: string, strategy: TriadResolutionStrategy) => {
    hapticHeavy()
    playStudioAudio(783.99, 0.2, 'triangle')
    setResolvedStrategies((prev) => ({
      ...prev,
      [triadId]: strategy,
    }))
  }

  const handleRecordPrediction = (propId: string, actualOutcome: boolean, userAns: boolean) => {
    hapticMedium()
    const isCorrect = userAns === actualOutcome
    playStudioAudio(isCorrect ? 880.0 : 330.0, 0.15, isCorrect ? 'sine' : 'sawtooth')
    setUserPredictions((prev) => {
      const existing = prev.filter((p) => p.propositionId !== propId)
      return [
        ...existing,
        {
          propositionId: propId,
          propositionText: propId,
          subjectiveConfidence: currentConfidenceInput,
          actualOutcome,
          domainContext: suite.domain,
        },
      ]
    })
  }

  const handleCopyCard = (card: FSRSEpistemicCard) => {
    const text = `# ${card.suiteName} (${card.domain})\n\n${card.conflictPrompt}\n\n---\n\n${card.equilibriumResolution}\n\n${card.calibrationTip}`
    void navigator.clipboard.writeText(text)
    setCopiedCardId(card.id)
    setTimeout(() => setCopiedCardId(null), 2000)
  }

  const handleResetSession = () => {
    hapticMedium()
    session.resetSession()
    setResolvedStrategies({})
    setUserPredictions([])
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Suite Selector Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-faint">
              Epistemic Domain Suite:
            </span>
            <Badge tone="cyan">{suite.domain}</Badge>
          </div>
          <span className="text-sm font-semibold text-slate-100">{suite.name}</span>
        </div>

        <div className="flex items-center gap-2">
          {Object.keys(initialSuites).map((key) => {
            const s = initialSuites[key]
            const isSelected = s.id === suite.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  hapticLight()
                  setSuiteKey(s.id)
                  setResolvedStrategies({})
                  setUserPredictions([])
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  isSelected
                    ? 'border border-sky-500/40 bg-sky-500/20 text-status-info-text'
                    : 'border border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200'
                }`}
              >
                {s.name.split(':')[0].trim()}
              </button>
            )
          })}
        </div>
      </div>

      {/* Primary Telemetry & Coherence HUD */}
      <ReflectiveEquilibriumHUD
        evaluation={evaluation}
        activeTier={activeTier}
        onSelectTier={handleSelectTier}
      />

      {/* Studio Navigation Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          type="button"
          onClick={() => {
            hapticLight()
            setActiveTab('triad_reconciler')
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'triad_reconciler'
              ? 'border-sky-400 text-status-info-text'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <Scale className="h-4 w-4" />
          <span>1. Triad Reconciler</span>
          <Badge tone="neutral" className="text-[10px]">
            {suite.dissonantTriads.length} Triads
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => {
            hapticLight()
            setActiveTab('coherence_graph')
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'coherence_graph'
              ? 'border-indigo-400 text-indigo-300'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <Network className="h-4 w-4" />
          <span>2. Coherence Graph</span>
          <Badge tone="neutral" className="text-[10px]">
            {suite.nodes.length} Nodes
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => {
            hapticLight()
            setActiveTab('brier_crucible')
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'brier_crucible'
              ? 'border-amber-400 text-status-warning-text'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <Target className="h-4 w-4" />
          <span>3. Brier Calibration Crucible</span>
          <Badge tone="neutral" className="text-[10px]">
            {suite.predictionBank.length} Predictions
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => {
            hapticLight()
            setActiveTab('fsrs_deck')
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'fsrs_deck'
              ? 'border-emerald-400 text-status-success-text'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>4. FSRS Epistemic Deck</span>
          <Badge tone="neutral" className="text-[10px]">
            {exportedCards.length} Cards
          </Badge>
        </button>
      </div>

      {/* TAB 1: TRIAD RECONCILER */}
      {activeTab === 'triad_reconciler' && (
        <div className="flex flex-col gap-6 animate-fade-in">
          <Panel className="border-slate-800 bg-slate-900/60 p-5">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-faint">
                Philosophical Context & Theoretical Foundation
              </span>
              <p className="text-xs leading-relaxed text-secondary">{suite.philosophicalContext}</p>
            </div>
          </Panel>

          <div className="flex flex-col gap-6">
            {suite.dissonantTriads.map((triad) => {
              const jNode = suite.nodes.find((n) => n.id === triad.judgmentNodeId)
              const pNode = suite.nodes.find((n) => n.id === triad.principleNodeId)
              const tNode = suite.nodes.find((n) => n.id === triad.theoryNodeId)
              const currentStrategy = resolvedStrategies[triad.id]

              return (
                <div
                  key={triad.id}
                  className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-100">
                      Dissonant Triad: {triad.conflictDescription.split('.')[0]}
                    </span>
                    <Badge tone={currentStrategy ? 'success' : 'warning'}>
                      {currentStrategy ? 'Resolved' : 'Conflict Active'}
                    </Badge>
                  </div>

                  {/* 3 Poles Visual Representation */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {/* Pole 1: Principle (P) */}
                    <div className="flex flex-col gap-1.5 rounded-lg border border-sky-500/20 bg-sky-950/20 p-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-status-info-text uppercase tracking-wider">
                        <GitBranch className="h-3.5 w-3.5" />
                        <span>General Principle (P)</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed font-medium">
                        &quot;{pNode?.statement}&quot;
                      </p>
                      <span className="text-[10px] text-faint">
                        Citation: {pNode?.formalCitation || 'Domain Axiom'}
                      </span>
                    </div>

                    {/* Pole 2: Judgment (C) */}
                    <div className="flex flex-col gap-1.5 rounded-lg border border-amber-500/20 bg-amber-950/20 p-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-status-warning-text uppercase tracking-wider">
                        <Scale className="h-3.5 w-3.5" />
                        <span>Considered Judgment (C)</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed font-medium">
                        &quot;{jNode?.statement}&quot;
                      </p>
                      <span className="text-[10px] text-faint">Intuition: {jNode?.rationale}</span>
                    </div>

                    {/* Pole 3: Background Theory (B) */}
                    <div className="flex flex-col gap-1.5 rounded-lg border border-indigo-500/20 bg-indigo-950/20 p-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                        <Brain className="h-3.5 w-3.5" />
                        <span>Background Theory (B)</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed font-medium">
                        &quot;{tNode?.statement}&quot;
                      </p>
                      <span className="text-[10px] text-faint">Proof: {tNode?.formalCitation}</span>
                    </div>
                  </div>

                  {/* Conflict Diagnostic */}
                  <div className="rounded-lg border border-rose-500/20 bg-rose-950/20 p-3 text-xs text-rose-200 leading-relaxed">
                    <strong>Epistemic Dissonance:</strong> {triad.conflictDescription}
                  </div>

                  {/* Available Resolution Proposals */}
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                      Reconciliation Strategies (Select to harmonize network):
                    </span>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {triad.availableResolutions.map((res) => {
                        const isChosen = currentStrategy === res.strategy
                        return (
                          <button
                            key={res.strategy}
                            type="button"
                            onClick={() => handleResolveStrategy(triad.id, res.strategy)}
                            className={`flex flex-col justify-between gap-2 rounded-lg border p-3 text-left transition-all ${
                              isChosen
                                ? 'border-emerald-500/50 bg-emerald-950/30 ring-1 ring-emerald-400/50'
                                : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <Badge
                                  tone={isChosen ? 'success' : 'neutral'}
                                  className="text-[10px]"
                                >
                                  {res.strategy.replace('_', ' ').toUpperCase()}
                                </Badge>
                                <span className="text-[10px] font-mono text-status-success-text">
                                  +{res.resultingCoherenceGain}% Coherence
                                </span>
                              </div>
                              <span className="text-xs font-bold text-slate-100">
                                {res.proposalTitle}
                              </span>
                              <p className="text-[11px] text-secondary leading-relaxed">
                                {res.consequenceAnalysis}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5 text-[10px] text-faint">
                              <CheckCircle2
                                className={`h-3.5 w-3.5 ${
                                  isChosen ? 'text-status-success-text' : 'text-slate-600'
                                }`}
                              />
                              <span>{isChosen ? 'Active Strategy' : 'Select Strategy'}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB 2: COHERENCE GRAPH */}
      {activeTab === 'coherence_graph' && (
        <div className="flex flex-col gap-6 animate-fade-in">
          <Panel className="border-slate-800 bg-slate-900/60 p-5">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-faint">
                Epistemic Coherence Graph ({activeTier.replace('_', ' ')})
              </span>
              <p className="text-xs leading-relaxed text-secondary">
                Explore the belief network across Considered Judgments, General Principles, and
                Background Theories. Inspect mutual support and qualification edges.
              </p>
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {suite.nodes
              .filter((n) => n.tier === activeTier)
              .map((node) => {
                const incomingEdges = suite.edges.filter((e) => e.targetNodeId === node.id)

                return (
                  <div
                    key={node.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow"
                  >
                    <div className="flex items-center justify-between">
                      <Badge tone="cyan">{node.tier.replace('_', ' ').toUpperCase()}</Badge>
                      <span className="text-xs font-mono text-faint">
                        Credence: {Math.round(node.initialConfidence * 100)}%
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-100 leading-relaxed">
                      &quot;{node.statement}&quot;
                    </h4>

                    <p className="text-xs text-secondary leading-relaxed">{node.rationale}</p>

                    {node.formalCitation && (
                      <div className="text-[11px] text-tertiary">
                        <strong>Source:</strong> {node.formalCitation}
                      </div>
                    )}

                    {incomingEdges.length > 0 && (
                      <div className="flex flex-col gap-1 border-t border-slate-800 pt-2 text-[10px] text-faint">
                        <span className="font-semibold text-secondary">
                          Incoming Relational Edges:
                        </span>
                        {incomingEdges.map((e, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <span>from: {e.sourceNodeId.split('_').slice(1).join(' ')}</span>
                            <Badge
                              tone={
                                e.relation === 'supports'
                                  ? 'success'
                                  : e.relation === 'contradicts'
                                    ? 'danger'
                                    : 'warning'
                              }
                              className="text-[9px]"
                            >
                              {e.relation} (weight {e.weight})
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* TAB 3: BRIER CALIBRATION CRUCIBLE */}
      {activeTab === 'brier_crucible' && (
        <div className="flex flex-col gap-6 animate-fade-in">
          <Panel className="border-slate-800 bg-slate-900/60 p-5">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-faint">
                  Tetlock Superforecasting Probability Crucible
                </span>
                <Badge tone="accent">
                  Brier Score: {evaluation.brierMetrics.brierScore.toFixed(3)}
                </Badge>
              </div>
              <p className="text-xs leading-relaxed text-secondary">
                To conquer the Overconfidence Bias, test your subjective certainty against objective
                ground truth. Select your confidence probability slider (50% = pure guess, 100% =
                absolute certainty) and test each technical proposition.
              </p>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-secondary">
                  Subjective Confidence Level:
                </span>
                <input
                  type="range"
                  min="0.5"
                  max="1.0"
                  step="0.05"
                  value={currentConfidenceInput}
                  onChange={(e) => setCurrentConfidenceInput(parseFloat(e.target.value))}
                  className="h-2 w-48 cursor-pointer rounded-lg bg-slate-800 accent-sky-400"
                />
                <span className="font-mono text-xs font-bold text-status-info-text">
                  {Math.round(currentConfidenceInput * 100)}%
                </span>
              </div>
            </div>
          </Panel>

          <div className="flex flex-col gap-4">
            {suite.predictionBank.map((pred) => {
              const recorded = userPredictions.find((p) => p.propositionId === pred.propositionId)

              return (
                <div
                  key={pred.propositionId}
                  className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-faint font-mono">
                      Context: {pred.domainContext}
                    </span>
                    {recorded && (
                      <Badge
                        tone={
                          recorded.subjectiveConfidence >= 0.5 && pred.actualOutcome
                            ? 'success'
                            : 'danger'
                        }
                      >
                        {pred.actualOutcome ? 'TRUE' : 'FALSE'} (Your Conf:{' '}
                        {Math.round(recorded.subjectiveConfidence * 100)}%)
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs font-bold text-slate-100 leading-relaxed">
                    &quot;{pred.propositionText}&quot;
                  </p>

                  <div className="flex items-center gap-3">
                    <Button
                      variant="primary"
                      className="text-xs px-3 py-1.5"
                      onClick={() =>
                        handleRecordPrediction(pred.propositionId, pred.actualOutcome, true)
                      }
                    >
                      Predict TRUE
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-xs px-3 py-1.5"
                      onClick={() =>
                        handleRecordPrediction(pred.propositionId, pred.actualOutcome, false)
                      }
                    >
                      Predict FALSE
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB 4: FSRS EPISTEMIC DECK */}
      {activeTab === 'fsrs_deck' && (
        <div className="flex flex-col gap-6 animate-fade-in">
          <Panel className="border-slate-800 bg-slate-900/60 p-5">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-faint">
                  Wide Reflective Equilibrium FSRS Cards
                </span>
                <Badge tone="success">
                  {exportedCards[0]?.fsrsStabilityMultiplier || 1.0}x Stability Multiplier
                </Badge>
              </div>
              <h3 className="text-base font-bold text-slate-100">
                Epistemic Reconciliation Spaced Retrieval Deck
              </h3>
              <p className="text-xs leading-relaxed text-secondary">
                These cards prompt you to identify the underlying theoretical theorem that resolves
                clashes between abstract design principles and concrete scenario demands.
              </p>
              <div className="flex items-center gap-3">
                <Button variant="primary" onClick={() => onExportCards?.(exportedCards)}>
                  <Download className="mr-2 h-4 w-4" />
                  <span>Export {exportedCards.length} Cards to Review System</span>
                </Button>
                <Button variant="ghost" onClick={handleResetSession}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  <span>Reset Session</span>
                </Button>
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {exportedCards.map((card) => {
              const isCopied = copiedCardId === card.id

              return (
                <div
                  key={card.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <Badge tone="cyan">{card.domain}</Badge>
                      <span className="text-[10px] font-mono text-status-success-text">
                        {card.fsrsStabilityMultiplier}x Stability
                      </span>
                    </div>

                    <div className="text-xs text-slate-200">
                      <Markdown>{card.conflictPrompt}</Markdown>
                    </div>

                    <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3 text-xs text-slate-300">
                      <Markdown>{card.equilibriumResolution}</Markdown>
                    </div>

                    <div className="text-[10px] text-status-warning-text/90">
                      {card.calibrationTip}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-end">
                    <Button
                      variant="ghost"
                      className="text-xs px-2 py-1"
                      onClick={() => handleCopyCard(card)}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      <span>{isCopied ? 'Copied!' : 'Copy Card'}</span>
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
