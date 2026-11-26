'use client'

import React, { useState } from 'react'
import {
  CANONICAL_COLLABORATIVE_SCENARIOS,
  evaluateCollaborativeDiscourse,
  generateCollaborativePeerTurn,
  generateCollaborativeFSRSDeck,
  type CollaborativeScenario,
  type CollaborativeTurn,
  type CollaborativeEvaluation,
  type CalibratedCollaborativeDeck,
  type TransactiveAct,
  type KingQuestionStem,
} from '@learning-hub/core'
import { apiSend } from '@/lib/transport'
import { Panel } from '../ui/Panel'
import { Button } from '../ui/Button'
import { CollaborativeScriptsHUD } from '../ui/CollaborativeScriptsHUD'
import { TextArea } from '../ui/Field'
import {
  Users,
  MessageSquare,
  Sparkles,
  GitMerge,
  Send,
  HelpCircle,
  FileCheck,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react'

export function CollaborativeScriptsStudio() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    CANONICAL_COLLABORATIVE_SCENARIOS[0]!.id,
  )

  const activeScenario: CollaborativeScenario =
    CANONICAL_COLLABORATIVE_SCENARIOS.find((s) => s.id === selectedScenarioId) ??
    CANONICAL_COLLABORATIVE_SCENARIOS[0]!

  const [activeTab, setActiveTab] = useState<'framing' | 'dialogue' | 'synthesis' | 'transfer'>(
    'framing',
  )

  // Phase 1: Learner Initial Position
  const [initialPosition, setInitialPosition] = useState<string>(
    'Late-LTP provides the primary protein synthesis substrate for synaptic efficacy, but requires spatial regulation to prevent saturation.',
  )

  // Phase 2: Dialogue Turns
  const [dialogueTurns, setDialogueTurns] = useState<CollaborativeTurn[]>([
    {
      id: 'turn-peer-0',
      speaker: 'peer_partner',
      role: activeScenario.simulatedPeer.role,
      text: activeScenario.simulatedPeer.initialArgument,
      speechAct: 'transactive_critique',
      epistemicKeywords: ['late-ltp', 'protein_synthesis', 'retention'],
    },
  ])
  const [currentLearnerMessage, setCurrentLearnerMessage] = useState<string>('')
  const [selectedSpeechAct, setSelectedSpeechAct] = useState<TransactiveAct>('transactive_critique')
  const [selectedKingStem, setSelectedKingStem] = useState<string>('')

  // Phase 3: Joint Synthesis
  const [jointSynthesis, setJointSynthesis] = useState<string>(
    'We conclude that memory persistence depends on Frey-Morris Synaptic Tagging & Capture Coordination combined with a BCM sliding threshold: local tags capture global PRPs while homeostatic LTD depotentiates untagged inputs to maintain contrast.',
  )

  // Phase 4: Individual Transfer
  const [transferAnswer, setTransferAnswer] = useState<string>(
    'When applying this to artificial neural networks, local gradient updates serve as synaptic tags while global weight decay acts as homeostatic LTD, preventing catastrophic gradient explosion.',
  )
  const [transferSubmitted, setTransferSubmitted] = useState<boolean>(false)

  // Evaluation & Deck State
  const [evaluation, setEvaluation] = useState<CollaborativeEvaluation | null>(null)
  const [fsrsDeck, setFsrsDeck] = useState<CalibratedCollaborativeDeck | null>(null)
  const [evaluating, setEvaluating] = useState<boolean>(false)

  // Change Scenario
  const handleSelectScenario = (scenario: CollaborativeScenario) => {
    setSelectedScenarioId(scenario.id)
    setActiveTab('framing')
    setInitialPosition('')
    setDialogueTurns([
      {
        id: `turn-peer-${scenario.id}-0`,
        speaker: 'peer_partner',
        role: scenario.simulatedPeer.role,
        text: scenario.simulatedPeer.initialArgument,
        speechAct: 'transactive_critique',
        epistemicKeywords: ['initial_challenge'],
      },
    ])
    setCurrentLearnerMessage('')
    setJointSynthesis('')
    setTransferAnswer('')
    setTransferSubmitted(false)
    setEvaluation(null)
    setFsrsDeck(null)
  }

  // Handle applying a King Question Stem
  const handleApplyStem = (stem: KingQuestionStem) => {
    setSelectedKingStem(stem.id)
    setCurrentLearnerMessage((prev) => (prev ? `${stem.stem} ${prev}` : stem.stem))
  }

  // Handle sending a learner dialogue turn + automated peer reply
  const handleSendTurn = () => {
    if (!currentLearnerMessage.trim()) return

    const newLearnerTurn: CollaborativeTurn = {
      id: `turn-learner-${Date.now()}`,
      speaker: 'learner',
      role: 'synthesizer',
      text: currentLearnerMessage.trim(),
      speechAct: selectedSpeechAct,
      epistemicKeywords: [],
    }

    const updatedTurns = [...dialogueTurns, newLearnerTurn]
    const learnerTurnCount = updatedTurns.filter((t) => t.speaker === 'learner').length

    // Generate automated peer turn
    const automatedPeerTurn = generateCollaborativePeerTurn(
      activeScenario,
      currentLearnerMessage,
      learnerTurnCount,
    )

    setDialogueTurns([...updatedTurns, automatedPeerTurn])
    setCurrentLearnerMessage('')
  }

  // Evaluate Discourse via Transport or local fallback
  const handleEvaluateDiscourse = async () => {
    setEvaluating(true)
    const submission = {
      scenarioId: activeScenario.id,
      learnerInitialPosition: initialPosition,
      dialogueTurns,
      jointSynthesis,
      individualTransferAnswer: transferAnswer,
    }

    try {
      const response = await apiSend<{ ok: boolean; evaluation: CollaborativeEvaluation }>(
        '/api/collaborative',
        'POST',
        {
          action: 'evaluate',
          submission,
        },
      )
      if (response && response.evaluation) {
        setEvaluation(response.evaluation)
      } else {
        const localEval = evaluateCollaborativeDiscourse(activeScenario, submission)
        setEvaluation(localEval)
      }
    } catch {
      const localEval = evaluateCollaborativeDiscourse(activeScenario, submission)
      setEvaluation(localEval)
    } finally {
      setEvaluating(false)
    }
  }

  // Generate Calibrated FSRS Deck
  const handleGenerateDeck = async () => {
    const currentEval =
      evaluation ??
      evaluateCollaborativeDiscourse(activeScenario, {
        scenarioId: activeScenario.id,
        learnerInitialPosition: initialPosition,
        dialogueTurns,
        jointSynthesis,
        individualTransferAnswer: transferAnswer,
      })

    try {
      const response = await apiSend<{ ok: boolean; deck: CalibratedCollaborativeDeck }>(
        '/api/collaborative',
        'POST',
        {
          action: 'deck',
          scenarioId: activeScenario.id,
          ceiBaseline: currentEval.cei,
        },
      )
      if (response && response.deck) {
        setFsrsDeck(response.deck)
      } else {
        setFsrsDeck(generateCollaborativeFSRSDeck(activeScenario, currentEval))
      }
    } catch {
      setFsrsDeck(generateCollaborativeFSRSDeck(activeScenario, currentEval))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Info Panel */}
      <Panel className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border border-indigo-500/30">
                King (1997, 1999) · Weinberger &amp; Fischer (2006) · Berkowitz &amp; Gibbs (1983)
              </span>
              <span className="text-xs text-tertiary">CSCL Collaborative Scripts Studio</span>
            </div>
            <h1 className="text-xl font-bold text-strong mt-1">
              Collaborative Scripts &amp; Transactive Discourse Studio
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={handleEvaluateDiscourse} disabled={evaluating} variant="secondary">
              {evaluating ? 'Analyzing Discourse...' : 'Analyze Discourse Telemetry'}
            </Button>
          </div>
        </div>

        <p className="text-xs text-secondary leading-relaxed">
          Unscripted collaboration frequently degrades into superficial consensus or parallel
          individualism. This studio implements an external CSCL script structured across 4 phases:
          individual cognitive formulation, transactive reciprocal dialogue using Alison King
          question stems, dialectical invariant synthesis, and independent consolidation.
        </p>
      </Panel>

      {/* Scenario Selector Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {CANONICAL_COLLABORATIVE_SCENARIOS.map((scenario) => {
          const isSelected = scenario.id === activeScenario.id
          return (
            <div
              key={scenario.id}
              onClick={() => handleSelectScenario(scenario)}
              className={`cursor-pointer rounded-lg border p-3 transition-all ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-xs'
                  : 'border-neutral-200 dark:border-(--hub-border) bg-surface hover:bg-surface-elevated'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-medium text-tertiary">
                <span className="uppercase">{scenario.difficulty}</span>
                <span>{scenario.invariantsForSynthesis.length} Invariants</span>
              </div>
              <h3 className="text-xs font-bold text-strong mt-1 line-clamp-2">{scenario.title}</h3>
            </div>
          )
        })}
      </div>

      {/* Real-time Telemetry HUD */}
      {evaluation && (
        <CollaborativeScriptsHUD evaluation={evaluation} scenarioTitle={activeScenario.title} />
      )}

      {/* 4-Phase Navigation Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-(--hub-border) text-xs font-medium overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        <button
          onClick={() => setActiveTab('framing')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'framing'
              ? 'border-indigo-500 text-strong font-semibold'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <Users className="h-3.5 w-3.5 text-ac-text" />
          Phase 1: Individual Framing
        </button>

        <button
          onClick={() => setActiveTab('dialogue')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'dialogue'
              ? 'border-indigo-500 text-strong font-semibold'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5 text-ac-text" />
          Phase 2: Transactive Dialogue
        </button>

        <button
          onClick={() => setActiveTab('synthesis')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'synthesis'
              ? 'border-indigo-500 text-strong font-semibold'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <GitMerge className="h-3.5 w-3.5 text-ac-text" />
          Phase 3: Joint Invariant Synthesis
        </button>

        <button
          onClick={() => setActiveTab('transfer')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'transfer'
              ? 'border-indigo-500 text-strong font-semibold'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 text-ac-text" />
          Phase 4: Far Transfer &amp; FSRS Deck
        </button>
      </div>

      {/* TAB 1: Individual Framing */}
      {activeTab === 'framing' && (
        <div className="space-y-4">
          <Panel className="space-y-3">
            <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
              <Users className="h-4 w-4 text-ac-text" />
              Central Collaborative Dilemma
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              {activeScenario.centralDilemma}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {activeScenario.competingPerspectives.map((persp) => (
                <div
                  key={persp.id}
                  className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-strong">{persp.label}</span>
                    <span className="text-[11px] text-tertiary">{persp.advocate}</span>
                  </div>
                  <p className="text-xs text-secondary">{persp.corePremise}</p>
                  <div className="text-[11px] space-y-1 pt-1 border-t border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-status-success-text dark:text-status-success-text">
                      <strong>Key Evidence:</strong> {persp.primaryEvidence}
                    </div>
                    <div className="text-status-warning-text dark:text-status-warning-text">
                      <strong>Vulnerability:</strong> {persp.vulnerability}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary">
              Your Initial Individual Position (Pre-Collaboration Anchor)
            </h3>
            <p className="text-xs text-secondary">
              Formulate your initial hypothesis before entering peer discourse. Individual framing
              prevents premature conformity and provides the cognitive anchor for transactive
              critique.
            </p>

            <TextArea
              label="Initial Position Hypothesis"
              value={initialPosition}
              onChange={(e) => setInitialPosition(e.target.value)}
              placeholder="State your initial mechanistic stance..."
              rows={3}
            />

            <div className="flex justify-end pt-2">
              <Button onClick={() => setActiveTab('dialogue')} variant="primary">
                Next: Enter Transactive Dialogue <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 2: Transactive Dialogue */}
      {activeTab === 'dialogue' && (
        <div className="space-y-4">
          <Panel className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-ac-text" />
                  Peer Discussion: Partner {activeScenario.simulatedPeer.name}
                </h3>
                <span className="text-xs text-tertiary">
                  Epistemic Style: {activeScenario.simulatedPeer.epistemicStyle} · Role:{' '}
                  {activeScenario.simulatedPeer.role}
                </span>
              </div>
            </div>

            {/* King Stems Toolbar */}
            <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-2.5 space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-tertiary flex items-center gap-1">
                <HelpCircle className="h-3 w-3 text-ac-text" />
                Alison King (1997) &quot;ASK to THINK - TEL WHY&quot; Question Stems
              </span>
              <div className="flex flex-wrap gap-1.5">
                {activeScenario.guidedKingStems.map((stem) => (
                  <button
                    key={stem.id}
                    onClick={() => handleApplyStem(stem)}
                    className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                      selectedKingStem === stem.id
                        ? 'border-indigo-500 bg-indigo-500/15 text-strong font-medium'
                        : 'border-neutral-200 dark:border-(--hub-border) bg-surface hover:bg-surface-elevated text-secondary'
                    }`}
                  >
                    [{stem.category}] &quot;{stem.stem}&quot;
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Transcript */}
            <div className="space-y-3 max-h-[360px] overflow-y-auto p-1">
              {dialogueTurns.map((turn, idx) => {
                const isLearner = turn.speaker === 'learner'
                return (
                  <div
                    key={turn.id || idx}
                    className={`flex flex-col ${isLearner ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] text-tertiary mb-1 px-1">
                      <span className="font-semibold text-strong">
                        {isLearner ? 'You (Learner)' : activeScenario.simulatedPeer.name}
                      </span>
                      <span>·</span>
                      <span className="uppercase text-[10px] px-1 rounded bg-neutral-100 dark:bg-neutral-800">
                        {turn.speechAct.replace('_', ' ')}
                      </span>
                    </div>

                    <div
                      className={`max-w-[85%] rounded-lg p-3 text-xs leading-relaxed ${
                        isLearner
                          ? 'border border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-950/20 text-strong'
                          : 'border border-neutral-200 dark:border-(--hub-border) bg-surface text-secondary'
                      }`}
                    >
                      {turn.text}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Message Input & Speech Act Selector */}
            <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-(--hub-border)">
              <div className="flex flex-wrap items-center gap-2 max-w-full">
                <span className="text-[11px] font-medium text-tertiary">Tag Transactive Act:</span>
                <select
                  value={selectedSpeechAct}
                  onChange={(e) => setSelectedSpeechAct(e.target.value as TransactiveAct)}
                  className="rounded border border-neutral-200 dark:border-(--hub-border) bg-surface px-2 py-1 text-xs text-strong"
                >
                  <option value="transactive_critique">Transactive Critique</option>
                  <option value="transactive_extension">Transactive Extension</option>
                  <option value="transactive_synthesis">Transactive Synthesis</option>
                  <option value="transactive_justification">Transactive Justification</option>
                  <option value="non_transactive">Non-Transactive Parallel</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={currentLearnerMessage}
                  onChange={(e) => setCurrentLearnerMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendTurn()}
                  placeholder="Address partner's reasoning directly (e.g. 'Because you argued X, consider Y...')"
                  className="flex-1 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface px-3 py-2 text-xs text-strong focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
                <Button onClick={handleSendTurn} variant="primary">
                  <Send className="h-3.5 w-3.5 mr-1" /> Send
                </Button>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button onClick={handleEvaluateDiscourse} variant="secondary">
                Recalculate Transactivity
              </Button>

              <Button onClick={() => setActiveTab('synthesis')} variant="primary">
                Next: Joint Invariant Synthesis <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 3: Joint Synthesis */}
      {activeTab === 'synthesis' && (
        <div className="space-y-4">
          <Panel className="space-y-3">
            <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
              <GitMerge className="h-4 w-4 text-ac-text" />
              Dialectical Invariant Reconciliation
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              Synthesize an overarching conceptual model that explains how both competing mechanisms
              operate without contradiction. Inspect the target invariants below for theoretical
              inspiration.
            </p>

            <div className="space-y-2 pt-1">
              {activeScenario.invariantsForSynthesis.map((inv) => (
                <div
                  key={inv.id}
                  className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 text-xs space-y-1"
                >
                  <span className="font-semibold text-strong flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-ac-text" />
                    Target Invariant: {inv.name}
                  </span>
                  <p className="text-secondary leading-relaxed">{inv.reconciliation}</p>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <TextArea
                label="Joint Invariant Reconciliation"
                value={jointSynthesis}
                onChange={(e) => setJointSynthesis(e.target.value)}
                placeholder="Formulate the integrated rule coordinating both opposing forces..."
                rows={4}
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button onClick={handleEvaluateDiscourse} variant="secondary">
                Update Synthesis Score
              </Button>

              <Button onClick={() => setActiveTab('transfer')} variant="primary">
                Proceed to Far Transfer <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 4: Far Transfer & FSRS Deck */}
      {activeTab === 'transfer' && (
        <div className="space-y-4">
          <Panel className="space-y-3">
            <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-ac-text" />
              Individual Far Transfer &amp; Internalization
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              Internalization Verification (Vygotsky 1978): Demonstrate that the collaborative
              interaction has transitioned into your internal cognitive schema by applying the
              synthesized invariant to a novel domain.
            </p>

            <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2 text-xs">
              <span className="font-semibold text-strong">
                Transfer Prompt: Novel Domain Generalization
              </span>
              <p className="text-secondary">
                How does the reconciled principle from &quot;{activeScenario.title}&quot; govern an
                analogous complex adaptive system under severe disturbance or edge scale?
              </p>

              <TextArea
                label="Transfer Application Solution"
                value={transferAnswer}
                onChange={(e) => setTransferAnswer(e.target.value)}
                placeholder="Explain the transfer application in your own words..."
                rows={3}
              />

              {!transferSubmitted ? (
                <div className="flex justify-end pt-1">
                  <Button
                    onClick={() => {
                      setTransferSubmitted(true)
                      handleEvaluateDiscourse()
                    }}
                    variant="primary"
                  >
                    Submit Transfer &amp; Lock In
                  </Button>
                </div>
              ) : (
                <div className="rounded border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-xs text-emerald-800 dark:text-status-success-text flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-status-success-text shrink-0" />
                  <span>Transfer solution submitted. Ready for FSRS card synthesis.</span>
                </div>
              )}
            </div>
          </Panel>

          {/* FSRS Deck Generator */}
          <Panel className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-strong flex items-center gap-1.5">
                  <FileCheck className="h-4 w-4 text-ac-text" />
                  Calibrated FSRS-6 Collaborative Dialectic Deck
                </h4>
                <p className="text-xs text-secondary">
                  Generates spaced repetition cards with stability parameters scaled by the
                  Collaborative Epistemic Index (CEI).
                </p>
              </div>

              <Button onClick={handleGenerateDeck} variant="primary">
                Generate FSRS Cards
              </Button>
            </div>

            {fsrsDeck && (
              <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-(--hub-border)">
                <div className="flex items-center justify-between text-xs text-secondary">
                  <span>Deck: {fsrsDeck.scenarioTitle}</span>
                  <span>{fsrsDeck.cards.length} Calibrated Cards Generated</span>
                </div>

                <div className="space-y-2">
                  {fsrsDeck.cards.map((card) => (
                    <div
                      key={card.id}
                      className="rounded border border-neutral-200 dark:border-(--hub-border) bg-surface p-2.5 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px] font-medium text-tertiary">
                        <span className="uppercase text-ac-text">
                          {card.cardType.replace('_', ' ')}
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
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}
