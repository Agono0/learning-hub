'use client'

/**
 * @file apps/web/src/components/CognitiveFlexibilityStudio.tsx
 * @description Interactive Cognitive Flexibility & Perspective Shifting Studio.
 *
 * Implements:
 * - Rand J. Spiro et al. (1988) Cognitive Flexibility Theory:
 *   - Nonlinear Landscape Criss-Crossing over ill-structured conceptual domains
 *   - Multiple Orthogonal Interpretive Lenses
 *   - Feltovich et al. (1989) Reductive Bias & Oversimplification Trap Diagnostics
 * - Edward de Bono (1985) Six Thinking Hats Lateral Thinking Modality
 * - FSRS-6 Context-Free Stability Scaling Deck Synthesis
 */

import React, { useMemo, useState } from 'react'
import {
  CALIBRATED_FLEXIBILITY_SUITES,
  CognitiveFlexibilitySession,
  CognitiveFlexibilitySuite,
  evaluateCognitiveFlexibility,
  exportFlexibilityToFSRSCards,
  FSRSFlexibilityCard,
  PerspectiveLens,
  ThinkingHatType,
} from '@learning-hub/core/flexibility/cognitive-flexibility-engine'
import { Badge, Button, CognitiveFlexibilityHUD, Markdown, Panel } from '@/ui'
import { getSharedAudioContext } from '@/lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium } from '../platform/haptics'
import {
  CheckCircle2,
  Compass,
  Copy,
  Download,
  Layers,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'

export interface CognitiveFlexibilityStudioProps {
  initialSuites?: Record<string, CognitiveFlexibilitySuite>
  onExportCards?: (cards: FSRSFlexibilityCard[]) => void
}

type StudioTab =
  'landscape_criss_cross' | 'six_hats_crucible' | 'reductive_bias_diagnostic' | 'fsrs_deck'

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

export function CognitiveFlexibilityStudio({
  initialSuites = CALIBRATED_FLEXIBILITY_SUITES,
  onExportCards,
}: CognitiveFlexibilityStudioProps) {
  const [suiteKey, setSuiteKey] = useState<string>('distributed_chaos_cascade')
  const [activeTab, setActiveTab] = useState<StudioTab>('landscape_criss_cross')
  const [activeHat, setActiveHat] = useState<ThinkingHatType>('white_hat')
  const [activeLens, setActiveLens] = useState<PerspectiveLens>('mechanistic_technical')

  // Interactive student notes and selections
  const [studentNotes, setStudentNotes] = useState<string>('')
  const [selectedThematicNodes, setSelectedThematicNodes] = useState<string[]>([])
  const [diagnosedTrapIds, setDiagnosedTrapIds] = useState<string[]>([])
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null)

  // Maintain session instance
  const session = useMemo(() => {
    return new CognitiveFlexibilitySession(suiteKey)
  }, [suiteKey])

  const suite = initialSuites[suiteKey] || CALIBRATED_FLEXIBILITY_SUITES.distributed_chaos_cascade
  const primaryCase = suite.primaryCase

  // Evaluate live progress based on recorded steps plus current selections
  const evaluation = useMemo(() => {
    const attempts = [
      ...session.getStepAttempts(),
      ...(studentNotes.trim().length > 0 ||
      selectedThematicNodes.length > 0 ||
      diagnosedTrapIds.length > 0
        ? [
            {
              caseId: primaryCase.id,
              selectedHat: activeHat,
              activeLens: activeLens,
              studentObservations: studentNotes,
              identifiedThematicNodeIds: selectedThematicNodes,
              diagnosedReductiveTrapIds: diagnosedTrapIds,
            },
          ]
        : []),
    ]
    return session.getSuite().id === suite.id
      ? evaluateCognitiveFlexibility(suite, attempts)
      : {
          perspectiveDispersionIndex: 0.0,
          hatCoverageCount: 1,
          lensCoverageCount: 1,
          crissCrossDensity: 0.0,
          reductiveBiasMastery: 0,
          cognitiveFlexibilityScore: 20,
          cognitiveRigidityWarning: true,
          feedbackSummary: 'Begin exploring by criss-crossing themes and switching thinking hats.',
        }
  }, [
    session,
    suite,
    primaryCase.id,
    activeHat,
    activeLens,
    studentNotes,
    selectedThematicNodes,
    diagnosedTrapIds,
  ])

  const exportedCards = useMemo(() => {
    return exportFlexibilityToFSRSCards(suite, evaluation)
  }, [suite, evaluation])

  // Handlers
  const handleHatSelect = (hat: ThinkingHatType) => {
    hapticLight()
    playStudioAudio(523.25, 0.1, 'sine')
    setActiveHat(hat)
    session.setActiveHat(hat)
  }

  const handleLensSelect = (lens: PerspectiveLens) => {
    hapticLight()
    playStudioAudio(659.25, 0.1, 'triangle')
    setActiveLens(lens)
    session.setActiveLens(lens)
  }

  const handleToggleThematicNode = (nodeId: string) => {
    hapticMedium()
    setSelectedThematicNodes((prev) => {
      const next = prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]
      playStudioAudio(next.includes(nodeId) ? 783.99 : 440.0, 0.12, 'sine')
      return next
    })
  }

  const handleToggleTrap = (trapId: string) => {
    hapticHeavy()
    setDiagnosedTrapIds((prev) => {
      const next = prev.includes(trapId) ? prev.filter((id) => id !== trapId) : [...prev, trapId]
      playStudioAudio(next.includes(trapId) ? 880.0 : 330.0, 0.15, 'triangle')
      return next
    })
  }

  const handleCommitStepAttempt = () => {
    if (!studentNotes.trim() && selectedThematicNodes.length === 0 && diagnosedTrapIds.length === 0)
      return
    hapticHeavy()
    playStudioAudio(987.77, 0.2, 'sine')
    session.recordStepAttempt({
      selectedHat: activeHat,
      activeLens: activeLens,
      studentObservations: studentNotes,
      identifiedThematicNodeIds: selectedThematicNodes,
      diagnosedReductiveTrapIds: diagnosedTrapIds,
    })
    setStudentNotes('')
  }

  const handleCopyCard = (card: FSRSFlexibilityCard) => {
    const text = `# ${card.caseTitle} (${card.domain})\n\n${card.promptFront}\n\n---\n\n${card.solutionBack}\n\n${card.reductiveTrapWarning}`
    void navigator.clipboard.writeText(text)
    setCopiedCardId(card.id)
    setTimeout(() => setCopiedCardId(null), 2000)
  }

  const handleResetSession = () => {
    hapticMedium()
    session.resetSession()
    setStudentNotes('')
    setSelectedThematicNodes([])
    setDiagnosedTrapIds([])
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Domain Suite Selector Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-faint">
              Ill-Structured Domain Suite:
            </span>
            <Badge tone="cyan">{suite.domainFamily}</Badge>
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
                  setSelectedThematicNodes([])
                  setDiagnosedTrapIds([])
                  setStudentNotes('')
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  isSelected
                    ? 'border border-sky-500/40 bg-sky-500/20 text-status-info-text'
                    : 'border border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200'
                }`}
              >
                {s.name.split('&')[0].trim()}
              </button>
            )
          })}
        </div>
      </div>

      {/* Primary Telemetry & Modality HUD */}
      <CognitiveFlexibilityHUD
        evaluation={evaluation}
        activeHat={activeHat}
        activeLens={activeLens}
        onSelectHat={handleHatSelect}
        onSelectLens={handleLensSelect}
      />

      {/* Studio Navigation Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          type="button"
          onClick={() => {
            hapticLight()
            setActiveTab('landscape_criss_cross')
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'landscape_criss_cross'
              ? 'border-sky-400 text-status-info-text'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>1. Landscape Criss-Cross</span>
          <Badge tone="neutral" className="text-[10px]">
            {primaryCase.thematicNodes.length} Themes
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => {
            hapticLight()
            setActiveTab('six_hats_crucible')
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'six_hats_crucible'
              ? 'border-indigo-400 text-indigo-300'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <Compass className="h-4 w-4" />
          <span>2. Six Hats Crucible</span>
          <Badge tone="neutral" className="text-[10px]">
            {activeHat.replace('_', ' ')}
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => {
            hapticLight()
            setActiveTab('reductive_bias_diagnostic')
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'reductive_bias_diagnostic'
              ? 'border-amber-400 text-status-warning-text'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <ShieldAlert className="h-4 w-4" />
          <span>3. Reductive Bias Traps</span>
          <Badge tone="neutral" className="text-[10px]">
            {primaryCase.reductiveTraps.length} Traps
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
          <span>4. FSRS Transfer Deck</span>
          <Badge tone="neutral" className="text-[10px]">
            {exportedCards.length} Cards
          </Badge>
        </button>
      </div>

      {/* TAB 1: LANDSCAPE CRISS-CROSSING */}
      {activeTab === 'landscape_criss_cross' && (
        <div className="flex flex-col gap-6 animate-fade-in">
          {/* Primary Case Header Card */}
          <Panel className="border-slate-800 bg-slate-900/60 p-5">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Badge tone="cyan">{primaryCase.domain}</Badge>
                <span className="text-xs text-tertiary">
                  Criss-Cross Coverage: {Math.round(evaluation.crissCrossDensity * 100)}%
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-100">{primaryCase.title}</h3>
              <p className="text-xs leading-relaxed text-secondary">{primaryCase.contextSummary}</p>
              <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-200">
                <span className="font-bold text-status-warning-text">Core Dilemma: </span>
                {primaryCase.coreDilemma}
              </div>
            </div>
          </Panel>

          {/* Spiro Thematic Nodes Matrix */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                Spiro Thematic Nodes (Revisit across multiple case traversals)
              </span>
              <span className="text-xs text-faint">
                Click nodes to mark as identified in current analysis
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {primaryCase.thematicNodes.map((node) => {
                const isSelected = selectedThematicNodes.includes(node.id)
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => handleToggleThematicNode(node.id)}
                    className={`flex flex-col gap-2 rounded-xl border p-4 text-left transition-all ${
                      isSelected
                        ? 'border-indigo-500/50 bg-indigo-950/30 ring-1 ring-indigo-400/40'
                        : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">{node.theme}</span>
                      <Badge tone={isSelected ? 'success' : 'neutral'}>
                        {node.crossCuttingCategory}
                      </Badge>
                    </div>
                    <p className="text-xs leading-relaxed text-secondary">{node.description}</p>
                    <div className="flex items-center gap-1.5 text-[10px] text-faint">
                      <CheckCircle2
                        className={`h-3 w-3 ${isSelected ? 'text-status-success-text' : 'text-slate-600'}`}
                      />
                      <span>{isSelected ? 'Node Criss-Crossed' : 'Click to Criss-Cross'}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Comparison / Analogous Case Studies */}
          {suite.comparisonCases.length > 0 && (
            <div className="flex flex-col gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                Cross-Domain Isomorphic Comparison Case
              </span>
              {suite.comparisonCases.map((comp) => (
                <div
                  key={comp.id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-status-info-text">{comp.title}</span>
                    <Badge tone="neutral">{comp.domain}</Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-faint">{comp.contextSummary}</p>
                  <div className="text-[11px] text-status-warning-text/90">
                    <strong>Dilemma:</strong> {comp.coreDilemma}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SIX HATS CRUCIBLE */}
      {activeTab === 'six_hats_crucible' && (
        <div className="flex flex-col gap-6 animate-fade-in">
          {(() => {
            const currentHatAnalysis = primaryCase.hatAnalyses[activeHat]
            const activeLensText = primaryCase.multiPerspectiveLenses[activeLens]

            return (
              <div className="flex flex-col gap-5">
                {/* Active Hat Directive Card */}
                <Panel className="border-slate-800 bg-slate-900/60 p-5">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-faint">
                          Active Thinking Modality:
                        </span>
                        <Badge tone="cyan">{activeHat.replace('_', ' ').toUpperCase()}</Badge>
                        <Badge tone="neutral">Lens: {activeLens.replace('_', ' ')}</Badge>
                      </div>
                      <span className="text-xs text-status-info-text font-mono">
                        PDI Contribution: +{(1 / 6).toFixed(2)}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-100">
                      {currentHatAnalysis.promptQuestion}
                    </h3>

                    {/* Active Lens Interpretation Context */}
                    <div className="rounded-lg border border-sky-500/20 bg-sky-950/20 p-3 text-xs text-sky-200 leading-relaxed">
                      <strong className="text-status-info-text">
                        Systemic Lens Angle ({activeLens}):
                      </strong>{' '}
                      {activeLensText}
                    </div>

                    {/* Expert Key Observations */}
                    <div className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-faint">
                        Expert Domain Observations for this Hat:
                      </span>
                      <ul className="flex flex-col gap-1 text-xs text-secondary">
                        {currentHatAnalysis.keyObservations.map((obs, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-status-info-text">•</span>
                            <span>{obs}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Failure Warning / Generative Insight */}
                    {currentHatAnalysis.failureModeWarning && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200">
                        <strong>Critical Failure Warning:</strong>{' '}
                        {currentHatAnalysis.failureModeWarning}
                      </div>
                    )}
                    {currentHatAnalysis.generativeInsight && (
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs text-emerald-200">
                        <strong>Generative Breakthrough:</strong>{' '}
                        {currentHatAnalysis.generativeInsight}
                      </div>
                    )}
                  </div>
                </Panel>

                {/* Student Analysis Workbench Input */}
                <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                  <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                    Your Cognitive Analysis ({activeHat.replace('_', ' ')} ×{' '}
                    {activeLens.replace('_', ' ')})
                  </span>
                  <textarea
                    rows={4}
                    value={studentNotes}
                    onChange={(e) => setStudentNotes(e.target.value)}
                    placeholder="Articulate your perspective shifting observations: What does this hat reveal that other modalities completely miss? What unintended systemic cascades must be anticipated?"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-tertiary">
                      Recording this attempt deepens entropy and unlocks context-free FSRS
                      stability.
                    </span>
                    <Button
                      variant="primary"
                      onClick={handleCommitStepAttempt}
                      disabled={!studentNotes.trim()}
                    >
                      Commit Modality Step
                    </Button>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* TAB 3: REDUCTIVE BIAS DIAGNOSTIC */}
      {activeTab === 'reductive_bias_diagnostic' && (
        <div className="flex flex-col gap-6 animate-fade-in">
          <Panel className="border-slate-800 bg-slate-900/60 p-5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-status-warning-text" />
                <h3 className="text-sm font-bold text-slate-100">
                  Feltovich, Spiro & Coulson (1989) Reductive Oversimplification Traps
                </h3>
              </div>
              <p className="text-xs leading-relaxed text-secondary">
                In complex non-linear domains, learners habitually reduce complex multidimensional
                phenomena to single, intuitive, linear models. Diagnose and disprove each reductive
                bias below to cultivate cognitive resilience.
              </p>
            </div>
          </Panel>

          <div className="flex flex-col gap-4">
            {primaryCase.reductiveTraps.map((trap) => {
              const isDiagnosed = diagnosedTrapIds.includes(trap.id)

              return (
                <div
                  key={trap.id}
                  className={`flex flex-col gap-3 rounded-xl border p-5 transition-all ${
                    isDiagnosed
                      ? 'border-emerald-500/40 bg-emerald-950/20'
                      : 'border-slate-800 bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Badge tone={isDiagnosed ? 'success' : 'warning'}>
                      {trap.type.replace(/_/g, ' ').toUpperCase()}
                    </Badge>
                    <Button
                      variant={isDiagnosed ? 'primary' : 'ghost'}
                      className="text-xs px-2.5 py-1"
                      onClick={() => handleToggleTrap(trap.id)}
                    >
                      {isDiagnosed ? 'Trap Disproven ✓' : 'Mark as Diagnosed'}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1 rounded-lg border border-rose-500/20 bg-rose-950/20 p-3">
                      <span className="text-[11px] font-bold text-danger-text uppercase tracking-wider">
                        Superficial / Reductive Mental Model:
                      </span>
                      <p className="text-xs text-rose-100/90 leading-relaxed">
                        {trap.superficialModel}
                      </p>
                    </div>

                    <div className="flex flex-col gap-1 rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3">
                      <span className="text-[11px] font-bold text-status-success-text uppercase tracking-wider">
                        Nuanced Multi-Perspective Reality:
                      </span>
                      <p className="text-xs text-emerald-100/90 leading-relaxed">
                        {trap.nuancedReality}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 text-xs text-secondary">
                    <span className="font-semibold text-status-warning-text">
                      Catastrophic Failure Consequence:
                    </span>
                    <span>{trap.failureConsequence}</span>
                  </div>

                  <div className="text-[11px] text-status-info-text/90">
                    <strong>Remedial Criss-Cross Step:</strong> {trap.remedialCrissCrossStep}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB 4: FSRS GENERALIZATION DECK */}
      {activeTab === 'fsrs_deck' && (
        <div className="flex flex-col gap-6 animate-fade-in">
          <Panel className="border-slate-800 bg-slate-900/60 p-5">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-faint">
                  FSRS-6 Cross-Cutting Generalization Deck
                </span>
                <Badge tone="success">
                  {Math.round((1.0 + 0.35 * evaluation.perspectiveDispersionIndex) * 100) / 100}x
                  Stability Multiplier
                </Badge>
              </div>
              <h3 className="text-base font-bold text-slate-100">
                Cognitive Flexibility Spaced Retrieval Cards
              </h3>
              <p className="text-xs leading-relaxed text-secondary">
                These cards test your ability to re-represent ill-structured problems from opposing
                perspectives under spaced conditions. By disentangling retrieval from local context
                cues, each card gains up to a 1.35x FSRS initial stability multiplier.
              </p>
              <div className="flex items-center gap-3">
                <Button variant="primary" onClick={() => onExportCards?.(exportedCards)}>
                  <Download className="mr-2 h-4 w-4" />
                  <span>Export {exportedCards.length} Cards to Review System</span>
                </Button>
                <Button variant="ghost" onClick={handleResetSession}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  <span>Reset Studio Session</span>
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
                      <Badge tone="cyan">{card.hat.replace('_', ' ').toUpperCase()}</Badge>
                      <span className="text-[10px] font-mono text-status-success-text">
                        {card.fsrsStabilityMultiplier}x Stability
                      </span>
                    </div>

                    <div className="text-xs text-slate-200">
                      <Markdown>{card.promptFront}</Markdown>
                    </div>

                    <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3 text-xs text-slate-300">
                      <Markdown>{card.solutionBack}</Markdown>
                    </div>

                    <div className="text-[10px] text-status-warning-text/90">
                      {card.reductiveTrapWarning}
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
