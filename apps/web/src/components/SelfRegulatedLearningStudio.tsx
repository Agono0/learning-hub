/**
 * Learning HUB — Self-Regulated Learning (SRL) & Metacognitive Matrix Studio
 *
 * Grounded in:
 * - Barry J. Zimmerman (2000, 2002):
 *   "Attaining Self-Regulation: A Social Cognitive Perspective"
 *   "Becoming a Self-Regulated Learner: An Overview" (Theory into Practice)
 *   Tripartite Cyclical Model: Forethought -> Performance/Volitional Control -> Self-Reflection.
 * - Paul R. Pintrich (2004):
 *   "A Conceptual Framework for Assessing Motivation and Self-Regulated Learning in College Students"
 *   4 Phases (Forethought, Monitoring, Control, Reaction) across 4 Domains (Cognition, Motivation/Affect, Behavior, Context).
 * - Philip H. Winne & Peter A. Hadwin (1998):
 *   "Studying as Self-Regulated Learning"
 *   The COPES Model: Conditions, Operations, Products, Evaluations, Standards.
 * - Bernard Weiner (1985, 1986):
 *   "An Attributional Theory of Achievement Motivation and Emotion"
 *   Causal dimensions: Locus of causality (internal vs external), Stability, and Controllability.
 */

'use client'

import React, { useMemo, useState } from 'react'
import {
  CALIBRATED_SRL_CHALLENGES,
  CANONICAL_CAUSAL_ATTRIBUTIONS,
  type FSRSRegulatoryCard,
  type GoalOrientation,
  type SRLChallengeScenario,
  type SRLCyclicalPhase,
  type SRLSessionMetrics,
  calculateGoalAttainmentScale,
  calculateSRLMaturityIndex,
  evaluateSRLMaturityTier,
} from '@learning-hub/core/srl'
import { Badge, Button, Panel, SelfRegulatedLearningHUD } from '@/ui'
import { getSharedAudioContext } from '@/lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium } from '../platform/haptics'
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Compass,
  Copy,
  Flame,
  Layers,
  RotateCcw,
  Shield,
  Sparkles,
  Target,
} from 'lucide-react'

type StudioTab = 'forethought' | 'performance' | 'reflection' | 'deck'

export function SelfRegulatedLearningStudio() {
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>(
    'distributed_systems_consensus',
  )
  const [activeTab, setActiveTab] = useState<StudioTab>('forethought')

  // Forethought state
  const [goalOrientation, setGoalOrientation] = useState<GoalOrientation>('mastery_approach')
  const [goalStatement, setGoalStatement] = useState<string>(
    'Master Raft consensus verification by exhaustively checking ElectionSafety invariants.',
  )

  // Performance state
  const [completedCheckpointIds, setCompletedCheckpointIds] = useState<Set<string>>(new Set())

  // Self-Reflection state
  const [selectedAttributionId, setSelectedAttributionId] = useState<string | null>(null)
  const [selfEvalScore, setSelfEvalScore] = useState<number>(0.85)
  const [adaptivePlan, setAdaptivePlan] = useState<string>(
    'In the next cycle, construct adversarial partition scenarios before running model checks.',
  )
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const challenge: SRLChallengeScenario =
    CALIBRATED_SRL_CHALLENGES[selectedChallengeId] ??
    CALIBRATED_SRL_CHALLENGES.distributed_systems_consensus

  // Dynamic session metrics
  const metrics: SRLSessionMetrics = useMemo(() => {
    const hasSpecificGoal = goalStatement.trim().length > 15
    const isMastery = goalOrientation === 'mastery_approach'
    const forethoughtScore = (hasSpecificGoal ? 0.5 : 0.2) + (isMastery ? 0.5 : 0.3)

    const totalCP = Math.max(1, challenge.volitionalCheckpoints.length)
    const volitionalScore = Math.min(1.0, completedCheckpointIds.size / totalCP)

    const chosenAttr = selectedAttributionId
      ? CANONICAL_CAUSAL_ATTRIBUTIONS[selectedAttributionId]
      : null
    const attributionScore = chosenAttr ? chosenAttr.adaptiveScore : 0.5

    const maturity = calculateSRLMaturityIndex(forethoughtScore, volitionalScore, attributionScore)
    const tier = evaluateSRLMaturityTier(maturity)
    const gas = calculateGoalAttainmentScale(
      volitionalScore,
      chosenAttr?.controllability === 'controllable',
      selfEvalScore,
    )

    const isForethoughtComplete = hasSpecificGoal
    const isPerformanceComplete = completedCheckpointIds.size >= 1
    const isReflectionComplete = selectedAttributionId !== null

    let completedPhases = 0
    if (isForethoughtComplete) completedPhases++
    if (isPerformanceComplete) completedPhases++
    if (isReflectionComplete) completedPhases++

    return {
      cyclicalMaturityIndex: maturity,
      forethoughtPlanningQuality: Math.round(forethoughtScore * 100) / 100,
      volitionalControlEfficiency: Math.round(volitionalScore * 100) / 100,
      attributionalResilienceScore: Math.round(attributionScore * 100) / 100,
      goalAttainmentScale: gas,
      completedPhasesCount: completedPhases,
      isForethoughtComplete,
      isPerformanceComplete,
      isReflectionComplete,
      currentMaturityTier: tier,
    }
  }, [
    challenge,
    goalStatement,
    goalOrientation,
    completedCheckpointIds,
    selectedAttributionId,
    selfEvalScore,
  ])

  // Soundscape effects
  const playAudioChime = (tone: 'advance' | 'checkpoint' | 'attribution') => {
    void getSharedAudioContext()
      .then((ctx) => {
        if (!ctx || ctx.state === 'suspended') return

        const now = ctx.currentTime
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)

        if (tone === 'checkpoint') {
          osc.frequency.setValueAtTime(523.25, now)
          osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15)
          gain.gain.setValueAtTime(0.08, now)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
          osc.start(now)
          osc.stop(now + 0.2)
        } else if (tone === 'advance') {
          osc.frequency.setValueAtTime(440, now)
          osc.frequency.setValueAtTime(554.37, now + 0.1)
          osc.frequency.setValueAtTime(659.25, now + 0.2)
          gain.gain.setValueAtTime(0.1, now)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
          osc.start(now)
          osc.stop(now + 0.35)
        } else {
          osc.frequency.setValueAtTime(392, now)
          osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.2)
          gain.gain.setValueAtTime(0.08, now)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
          osc.start(now)
          osc.stop(now + 0.25)
        }
      })
      .catch(() => {
        // Autoplay gracefully suppressed
      })
  }

  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  // Handle volitional checkpoint toggle
  const handleToggleCheckpoint = (checkpointId: string) => {
    hapticMedium()
    playAudioChime('checkpoint')
    setCompletedCheckpointIds((prev) => {
      const next = new Set(prev)
      if (next.has(checkpointId)) {
        next.delete(checkpointId)
      } else {
        next.add(checkpointId)
      }
      return next
    })
    triggerToast('Volitional focus strategy recorded.')
  }

  // Handle attribution selection
  const handleSelectAttribution = (attrId: string) => {
    const attr = CANONICAL_CAUSAL_ATTRIBUTIONS[attrId]
    if (!attr) return

    setSelectedAttributionId(attrId)
    if (attr.controllability === 'controllable') {
      hapticHeavy()
      playAudioChime('attribution')
      triggerToast('Adaptive causal attribution: Internal & Controllable.')
    } else {
      hapticLight()
      triggerToast('Maladaptive attribution: Externalized / Fixed Mindset.')
    }
  }

  // Reset session
  const handleReset = () => {
    hapticLight()
    setCompletedCheckpointIds(new Set())
    setSelectedAttributionId(null)
    setSelfEvalScore(0.85)
    triggerToast('Self-regulated learning session reset.')
  }

  // FSRS Flashcard export
  const exportedCards: readonly FSRSRegulatoryCard[] = useMemo(() => {
    const mult = 1.0 + metrics.cyclicalMaturityIndex * 0.75
    return [
      {
        id: `fsrs_srl_${challenge.id}_forethought`,
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        forethoughtPrompt: `[Zimmerman Forethought: ${challenge.title}]\nStrategic Heuristic: ${challenge.expertForethoughtHeuristic}\nTarget Goal: ${goalStatement}`,
        volitionalTacticRule:
          'Before executing complex proofs or code, specify COPES conditions, operations, and objective standards.',
        attributionCalibrationInsight:
          'Mastery approach goal orientations buffer against premature cognitive defeat.',
        zimmermanCyclePhase: 'forethought',
        recommendedStabilityMultiplier: mult,
      },
      {
        id: `fsrs_srl_${challenge.id}_reflection`,
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        forethoughtPrompt: `[Zimmerman Self-Reflection: ${challenge.title}]\nReflection Prompt: ${challenge.expertSelfReflectionPrompt}`,
        volitionalTacticRule:
          'Weiner (1986): Always attribute impasses to internal, controllable factors (strategy adaptation, specific tactical effort).',
        attributionCalibrationInsight:
          'Externalizing failure as bad luck or innate lack of genius destroys self-regulatory agency.',
        zimmermanCyclePhase: 'self_reflection',
        recommendedStabilityMultiplier: mult,
      },
    ]
  }, [challenge, goalStatement, metrics.cyclicalMaturityIndex])

  const handleCopyDeck = () => {
    hapticLight()
    navigator.clipboard.writeText(JSON.stringify(exportedCards, null, 2))
    triggerToast('Copied FSRS Regulatory Flashcards to clipboard!')
  }

  // Active phase mapping for HUD
  const activeCyclePhase: SRLCyclicalPhase =
    activeTab === 'forethought'
      ? 'forethought'
      : activeTab === 'performance'
        ? 'performance_control'
        : 'self_reflection'

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 px-4 py-2.5 text-xs shadow-lg transition-all animate-fade-in">
          {toastMessage}
        </div>
      )}

      {/* Header & Scenario Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-neutral-200/80 dark:border-(--hub-border)/80 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-strong flex items-center gap-2">
            <Target className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            Self-Regulated Learning &amp; Metacognitive Matrix Studio
          </h2>
          <p className="text-xs text-secondary mt-0.5">
            Barry Zimmerman (2000) • Paul Pintrich (2004) • Philip Winne (1998) • Bernard Weiner
            (1986)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="challenge-select" className="text-xs font-medium text-secondary">
            Challenge Scenario:
          </label>
          <select
            id="challenge-select"
            value={selectedChallengeId}
            onChange={(e) => {
              setSelectedChallengeId(e.target.value)
              handleReset()
            }}
            className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-3 py-1.5 text-xs font-medium text-strong shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {Object.values(CALIBRATED_SRL_CHALLENGES).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          <Button variant="ghost" onClick={handleReset} title="Reset session">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Top HUD: Tripartite Cyclical Gauges */}
      <SelfRegulatedLearningHUD
        activePhase={activeCyclePhase}
        metrics={metrics}
        challengeTitle={challenge.title}
        onPhaseSelect={(phase) => {
          if (phase === 'forethought') setActiveTab('forethought')
          else if (phase === 'performance_control') setActiveTab('performance')
          else setActiveTab('reflection')
        }}
      />

      {/* Navigation Tabs */}
      <div className="flex border-b border-neutral-200/80 dark:border-(--hub-border)/80 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('forethought')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'forethought'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <Compass className="h-4 w-4" />
          Phase 1: Forethought &amp; Task Analysis
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('performance')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'performance'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <Flame className="h-4 w-4" />
          Phase 2: Performance &amp; Volition ({completedCheckpointIds.size}/
          {challenge.volitionalCheckpoints.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reflection')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'reflection'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <Shield className="h-4 w-4" />
          Phase 3: Self-Reflection &amp; Attribution
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('deck')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'deck'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <Layers className="h-4 w-4" />
          FSRS Regulatory Deck ({exportedCards.length})
        </button>
      </div>

      {/* TAB 1: PHASE 1 — FORETHOUGHT & TASK ANALYSIS */}
      {activeTab === 'forethought' && (
        <div className="space-y-6 animate-fade-in">
          <Panel className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200/80 dark:border-(--hub-border)/80 pb-3">
              <div className="space-y-0.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Zimmerman Phase 1: Forethought &amp; Motivation
                </span>
                <h3 className="text-base font-bold text-strong">{challenge.title}</h3>
              </div>
              <Badge tone="accent">{challenge.domain}</Badge>
            </div>

            {/* Task Description */}
            <div className="rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2) p-4 space-y-1.5 text-xs">
              <span className="font-semibold text-strong flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-status-warning-text" />
                Target Task Scope:
              </span>
              <p className="text-secondary leading-relaxed">{challenge.taskDescription}</p>
            </div>

            {/* Goal Orientation Selection (Pintrich & Elliot) */}
            <div className="space-y-2 text-xs">
              <span className="font-bold text-strong block">
                1. Goal Orientation Selection (Elliot &amp; Church 1997):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    id: 'mastery_approach' as const,
                    title: 'Mastery-Approach (Optimal)',
                    desc: 'Focus on deep invariant understanding, self-improvement, and causal insight.',
                    tone: 'emerald',
                  },
                  {
                    id: 'mastery_avoidance' as const,
                    title: 'Mastery-Avoidance',
                    desc: 'Focus on avoiding misunderstanding or deterioration of previously acquired skills.',
                    tone: 'amber',
                  },
                  {
                    id: 'performance_approach' as const,
                    title: 'Performance-Approach',
                    desc: 'Focus on outperforming peers and demonstrating normative superiority.',
                    tone: 'cyan',
                  },
                  {
                    id: 'performance_avoidance' as const,
                    title: 'Performance-Avoidance (Fragile)',
                    desc: 'Focus on avoiding public demonstration of incompetence; leads to avoidance.',
                    tone: 'rose',
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setGoalOrientation(opt.id)}
                    className={`text-left rounded-xl p-3 border transition-all ${
                      goalOrientation === opt.id
                        ? 'border-indigo-500/50 bg-indigo-500/10 shadow-sm'
                        : 'border-neutral-200/80 dark:border-(--hub-border)/80 bg-white dark:bg-(--hub-panel) hover:bg-neutral-50 dark:hover:bg-(--hub-panel-2)'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-1">
                      <span className="font-bold text-strong">{opt.title}</span>
                      {goalOrientation === opt.id && <Badge tone="accent">Selected</Badge>}
                    </div>
                    <p className="text-secondary text-[11px]">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Proximal Target Goal Formulation */}
            <div className="space-y-2 text-xs">
              <label htmlFor="goal-input" className="font-bold text-strong block">
                2. Proximal Goal Formulation (Zimmerman 2002):
              </label>
              <textarea
                id="goal-input"
                rows={2}
                value={goalStatement}
                onChange={(e) => setGoalStatement(e.target.value)}
                placeholder="Formulate a specific, measurable proximal target for this study session..."
                className="w-full rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) p-3 text-xs text-strong focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed"
              />
            </div>

            {/* Winne & Hadwin (1998) COPES Decomposition */}
            <div className="space-y-2 text-xs">
              <span className="font-bold text-strong flex items-center gap-1.5">
                <Compass className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                3. Winne &amp; Hadwin COPES Task Decomposition:
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) p-3 border border-neutral-200/60 dark:border-(--hub-border)/60 space-y-1">
                  <strong className="text-strong block">C — Task Conditions:</strong>
                  <p className="text-secondary leading-relaxed">
                    {challenge.defaultCopes.conditions}
                  </p>
                </div>

                <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) p-3 border border-neutral-200/60 dark:border-(--hub-border)/60 space-y-1">
                  <strong className="text-strong block">O — Cognitive Operations:</strong>
                  <p className="text-secondary leading-relaxed">
                    {challenge.defaultCopes.operations}
                  </p>
                </div>

                <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) p-3 border border-neutral-200/60 dark:border-(--hub-border)/60 space-y-1">
                  <strong className="text-strong block">P — Observable Products:</strong>
                  <p className="text-secondary leading-relaxed">
                    {challenge.defaultCopes.products}
                  </p>
                </div>

                <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) p-3 border border-neutral-200/60 dark:border-(--hub-border)/60 space-y-1">
                  <strong className="text-strong block">S — Evaluation Standards:</strong>
                  <p className="text-secondary leading-relaxed">
                    {challenge.defaultCopes.standards}
                  </p>
                </div>
              </div>
            </div>

            {/* Expert Forethought Heuristic Callout */}
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 text-xs space-y-1">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" />
                Expert Forethought Heuristic:
              </span>
              <p className="text-strong leading-relaxed font-medium">
                {challenge.expertForethoughtHeuristic}
              </p>
            </div>

            {/* Advance Button */}
            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                onClick={() => {
                  playAudioChime('advance')
                  setActiveTab('performance')
                  triggerToast('Advanced to Phase 2: Performance & Volitional Control.')
                }}
                className="px-3.5 py-1.5 text-xs"
              >
                Advance to Performance Phase
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 2: PHASE 2 — PERFORMANCE & VOLITIONAL CONTROL */}
      {activeTab === 'performance' && (
        <div className="space-y-6 animate-fade-in">
          <Panel className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200/80 dark:border-(--hub-border)/80 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-status-warning-text">
                  Zimmerman Phase 2: Volitional Execution &amp; Control
                </span>
                <h3 className="text-base font-bold text-strong">
                  Real-Time Strategy Deployment &amp; Focus Recovery
                </h3>
              </div>
              <Badge tone="warning">
                {completedCheckpointIds.size} / {challenge.volitionalCheckpoints.length} Checkpoints
                Active
              </Badge>
            </div>

            <p className="text-xs text-secondary leading-relaxed">
              Lyn Corno (1993) &amp; Barry Zimmerman (2000): Volitional control protects the
              execution of learning intentions against cognitive distraction, emotional fatigue, and
              task impasses.
            </p>

            {/* Volitional Strategy Checkpoint Cards */}
            <div className="space-y-4 pt-1">
              {challenge.volitionalCheckpoints.map((cp) => {
                const isResolved = completedCheckpointIds.has(cp.id)

                return (
                  <div
                    key={cp.id}
                    className={`rounded-xl border p-4.5 space-y-3 text-xs transition-all ${
                      isResolved
                        ? 'border-emerald-500/40 bg-emerald-500/5 shadow-sm'
                        : 'border-neutral-200/80 dark:border-(--hub-border)/80 bg-white dark:bg-(--hub-panel)'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Flame className="h-4 w-4 text-status-warning-text" />
                        <span className="font-bold text-strong text-sm">{cp.title}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge tone={isResolved ? 'success' : 'neutral'}>
                          {isResolved ? 'Strategy Deployed' : 'Friction Open'}
                        </Badge>
                        <Button
                          variant={isResolved ? 'secondary' : 'primary'}
                          onClick={() => handleToggleCheckpoint(cp.id)}
                          className="px-2.5 py-1 text-xs"
                        >
                          {isResolved ? 'Mark Active' : 'Deploy Tactic'}
                        </Button>
                      </div>
                    </div>

                    {/* Targeted Friction Description */}
                    <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) p-3 text-secondary leading-relaxed border border-neutral-200/60 dark:border-(--hub-border)/60">
                      <strong className="text-strong block pb-0.5">
                        Targeted Friction Obstacle:
                      </strong>
                      {cp.targetedObstacle}
                    </div>

                    {/* Volitional Tactic & Self-Instruction */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                      <div className="rounded-lg bg-indigo-500/10 p-3 border border-indigo-500/20 space-y-1">
                        <strong className="text-indigo-600 dark:text-indigo-400 block">
                          Volitional Intervention Tactic:
                        </strong>
                        <p className="text-secondary leading-relaxed">{cp.volitionalTactic}</p>
                      </div>

                      <div className="rounded-lg bg-amber-500/10 p-3 border border-amber-500/20 space-y-1">
                        <strong className="text-status-warning-text block">
                          Metacognitive Self-Instruction Maxim:
                        </strong>
                        <p className="text-secondary italic leading-relaxed">
                          {cp.selfInstructionMaxim}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Advance Button */}
            <div className="flex justify-between items-center pt-3 border-t border-neutral-200/80 dark:border-(--hub-border)/80">
              <Button
                variant="ghost"
                onClick={() => setActiveTab('forethought')}
                className="px-3 py-1.5 text-xs"
              >
                Back to Forethought
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  playAudioChime('advance')
                  setActiveTab('reflection')
                  triggerToast('Advanced to Phase 3: Self-Reflection & Attribution.')
                }}
                className="px-3.5 py-1.5 text-xs"
              >
                Advance to Self-Reflection Phase
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 3: PHASE 3 — SELF-REFLECTION & CAUSAL ATTRIBUTION */}
      {activeTab === 'reflection' && (
        <div className="space-y-6 animate-fade-in">
          <Panel className="p-5 space-y-4">
            <div className="border-b border-neutral-200/80 dark:border-(--hub-border)/80 pb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ac-text">
                Zimmerman Phase 3: Self-Reflection &amp; Adaptation
              </span>
              <h3 className="text-base font-bold text-strong">
                Bernard Weiner Causal Attribution &amp; Standard Evaluation
              </h3>
              <p className="text-xs text-secondary mt-0.5">
                Weiner (1985, 1986): Causal attribution determines subsequent self-efficacy,
                affective persistence, and adaptive strategy revision.
              </p>
            </div>

            {/* Self-Evaluation against Standards */}
            <div className="rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2) p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-strong flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-status-success-text" />
                  Self-Evaluation against COPES Standard:
                </span>
                <span className="font-mono text-strong font-bold">
                  {Math.round(selfEvalScore * 100)}%
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={selfEvalScore}
                onChange={(e) => setSelfEvalScore(parseFloat(e.target.value))}
                className="w-full accent-indigo-600"
              />

              <div className="flex justify-between text-[11px] text-tertiary">
                <span>0% Severe Standard Deficit</span>
                <span>50% Partial Standard Compliance</span>
                <span>100% Flawless Objective Invariant</span>
              </div>
            </div>

            {/* Weiner Causal Attribution Selector */}
            <div className="space-y-3 text-xs pt-1">
              <span className="font-bold text-strong block">
                Select Your Causal Attribution for Session Impasses:
              </span>

              <div className="grid grid-cols-1 gap-3">
                {challenge.attributionOptions.map((attr) => {
                  const isSelected = selectedAttributionId === attr.id
                  const isAdaptive = attr.controllability === 'controllable'

                  return (
                    <button
                      key={attr.id}
                      type="button"
                      onClick={() => handleSelectAttribution(attr.id)}
                      className={`text-left rounded-xl p-4 border transition-all ${
                        isSelected
                          ? isAdaptive
                            ? 'border-emerald-500/50 bg-emerald-500/10 shadow-sm'
                            : 'border-rose-500/50 bg-rose-500/10 shadow-sm'
                          : 'border-neutral-200/80 dark:border-(--hub-border)/80 bg-white dark:bg-(--hub-panel) hover:bg-neutral-50 dark:hover:bg-(--hub-panel-2)'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-1.5">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                          <span className="font-bold text-strong">{attr.name}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Badge tone={attr.locus === 'internal' ? 'accent' : 'neutral'}>
                            Locus: {attr.locus}
                          </Badge>
                          <Badge
                            tone={attr.controllability === 'controllable' ? 'success' : 'danger'}
                          >
                            {attr.controllability}
                          </Badge>
                        </div>
                      </div>

                      <p className="text-secondary leading-relaxed text-[11px]">
                        {attr.psychologicalImpact}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Adaptive Plan for Next Cycle */}
            <div className="space-y-2 text-xs pt-2">
              <label htmlFor="adaptive-plan-input" className="font-bold text-strong block">
                Adaptive Strategic Inference for Next Learning Cycle (Zimmerman 2002):
              </label>
              <textarea
                id="adaptive-plan-input"
                rows={2}
                value={adaptivePlan}
                onChange={(e) => setAdaptivePlan(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) p-3 text-xs text-strong focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed"
                placeholder="Detail the exact tactical adaptation you will apply in the next Forethought phase..."
              />
            </div>

            {/* Expert Reflection Prompt Callout */}
            <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 text-xs space-y-1">
              <span className="font-bold text-ac-text dark:text-ac-text flex items-center gap-1.5">
                <Brain className="h-4 w-4" />
                Expert Self-Reflection Guidance:
              </span>
              <p className="text-strong leading-relaxed font-medium">
                {challenge.expertSelfReflectionPrompt}
              </p>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 4: FSRS REGULATORY DECK & LEDGER */}
      {activeTab === 'deck' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200/80 dark:border-(--hub-border)/80 pb-4">
            <div>
              <h3 className="text-sm font-bold text-strong flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                FSRS-6 Regulatory Flashcards ({exportedCards.length} Cards)
              </h3>
              <p className="text-xs text-secondary">
                Metacognitive regulatory prompts to consolidate closed-loop self-regulation into
                automatic habits.
              </p>
            </div>

            <Button variant="secondary" onClick={handleCopyDeck} className="px-2.5 py-1 text-xs">
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy Deck JSON
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {exportedCards.map((card) => (
              <Panel key={card.id} className="p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-[10px] text-tertiary border-b border-neutral-200/80 dark:border-(--hub-border)/80 pb-1.5">
                  <span className="font-mono">{card.id}</span>
                  <Badge tone="accent">
                    S₀ Multiplier: {card.recommendedStabilityMultiplier.toFixed(2)}x
                  </Badge>
                </div>

                <div className="space-y-1">
                  <span className="font-semibold text-strong">Regulatory Cycle Prompt:</span>
                  <p className="text-secondary bg-neutral-50 dark:bg-(--hub-panel-2) p-2.5 rounded border border-neutral-200/60 dark:border-(--hub-border)/60 whitespace-pre-line font-mono text-[11px]">
                    {card.forethoughtPrompt}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    Volitional Tactic Rule:
                  </span>
                  <p className="text-strong italic bg-indigo-500/5 p-2 rounded border border-indigo-500/20">
                    "{card.volitionalTacticRule}"
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="font-semibold text-ac-text dark:text-ac-text">
                    Attribution Insight:
                  </span>
                  <p className="text-secondary text-[11px]">{card.attributionCalibrationInsight}</p>
                </div>
              </Panel>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
