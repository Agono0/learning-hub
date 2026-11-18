/**
 * Learning HUB — Multi-Representational Fluency & Representational Competence Studio
 *
 * Grounded in:
 * - Shaaron Ainsworth (1999, 2006): DeFT (Design, Functions, Tasks) framework for Multiple External Representations (MERs).
 * - Richard Lesh, Thomas Post, & Merlyn Behr (1987): Lesh Translation Model across 5 mathematical modes.
 * - Robert L. Goldstone & Ji Y. Son (2005): Concreteness fading and grounded conceptual transfer.
 */

'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  CALIBRATED_REPRESENTATIONAL_PROBLEMS,
  CANONICAL_MODALITY_CATALOG,
  type CrossModalMappingChallenge,
  type RepresentationModality,
  type RepresentationalProblem,
  type RepresentationalSessionMetrics,
  calculateCrossModalCoherenceScore,
  calculateRepresentationalCoordinationGap,
  calculateRepresentationalFluencyIndex,
  generateFSRSTranslationDeck,
} from '@learning-hub/core/representation'
import { Badge, Button, Panel, RepresentationalFluencyHUD } from '@/ui'
import { getSharedAudioContext } from '@/lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium } from '../platform/haptics'
import { ArrowRight, CheckCircle2, ChevronRight, Copy, Sparkles, XCircle } from 'lucide-react'

type StudioView = 'multimodal_explorer' | 'translation_crucible' | 'fsrs_deck'

export function RepresentationalFluencyStudio() {
  const [selectedProblemId, setSelectedProblemId] = useState<string>('shannon_information_entropy')
  const [view, setView] = useState<StudioView>('multimodal_explorer')
  const [primaryModality, setPrimaryModality] = useState<RepresentationModality>('symbolic_formal')
  const [secondaryModality, setSecondaryModality] =
    useState<RepresentationModality>('concrete_physical')
  const [isDualCompareActive, setIsDualCompareActive] = useState<boolean>(true)

  // Problem definition
  const problem: RepresentationalProblem = useMemo(() => {
    return (
      CALIBRATED_REPRESENTATIONAL_PROBLEMS.find((p) => p.id === selectedProblemId) ??
      CALIBRATED_REPRESENTATIONAL_PROBLEMS[0]
    )
  }, [selectedProblemId])

  // Session telemetry tracking
  const [exploredModalities, setExploredModalities] = useState<RepresentationModality[]>([
    'symbolic_formal',
    'concrete_physical',
  ])
  const [completedChallengeIds, setCompletedChallengeIds] = useState<string[]>([])
  const [correctChallengeIds, setCorrectChallengeIds] = useState<string[]>([])
  const [selectedOptionByChallenge, setSelectedOptionByChallenge] = useState<
    Record<string, string>
  >({})
  const [translationStartMs, setTranslationStartMs] = useState<number>(Date.now())
  const [latencyHistoryMs, setLatencyHistoryMs] = useState<number[]>([4200])

  // Clipboard copy state
  const [isDeckCopied, setIsDeckCopied] = useState<boolean>(false)

  // Reset when problem changes
  useEffect(() => {
    setView('multimodal_explorer')
    setPrimaryModality('symbolic_formal')
    setSecondaryModality('concrete_physical')
    setIsDualCompareActive(true)
    setExploredModalities(['symbolic_formal', 'concrete_physical'])
    setCompletedChallengeIds([])
    setCorrectChallengeIds([])
    setSelectedOptionByChallenge({})
    setTranslationStartMs(Date.now())
    setLatencyHistoryMs([4200])
    setIsDeckCopied(false)
  }, [selectedProblemId])

  // Tone generation helper
  const playTone = (freq: number, type: OscillatorType = 'sine', duration: number = 0.15) => {
    void getSharedAudioContext()
      .then((ctx) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(freq, ctx.currentTime)
        gain.gain.setValueAtTime(0.08, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + duration)
      })
      .catch(() => {})
  }

  // Handle modality exploration tracking
  const handleSelectPrimaryModality = (mod: RepresentationModality) => {
    setPrimaryModality(mod)
    if (!exploredModalities.includes(mod)) {
      setExploredModalities((prev) => [...prev, mod])
    }
    hapticLight()
    playTone(493.88, 'sine', 0.1)
  }

  const handleSelectSecondaryModality = (mod: RepresentationModality) => {
    setSecondaryModality(mod)
    if (!exploredModalities.includes(mod)) {
      setExploredModalities((prev) => [...prev, mod])
    }
    hapticLight()
    playTone(554.37, 'sine', 0.1)
  }

  // Average translation latency
  const avgLatency = useMemo(() => {
    if (latencyHistoryMs.length === 0) return 4000
    const sum = latencyHistoryMs.reduce((acc, v) => acc + v, 0)
    return Math.round(sum / latencyHistoryMs.length)
  }, [latencyHistoryMs])

  // Compute live metrics
  const metrics: RepresentationalSessionMetrics = useMemo(() => {
    const gap = calculateRepresentationalCoordinationGap({
      totalChallenges: problem.translationChallenges.length,
      correctChallenges: correctChallengeIds.length,
      exploredModalitiesCount: exploredModalities.length,
    })

    const coherence = calculateCrossModalCoherenceScore({
      totalChallenges: problem.translationChallenges.length,
      correctChallenges: correctChallengeIds.length,
      averageTranslationLatencyMs: avgLatency,
    })

    const fluencyIndex = calculateRepresentationalFluencyIndex({
      totalChallenges: problem.translationChallenges.length,
      correctChallenges: correctChallengeIds.length,
      exploredModalitiesCount: exploredModalities.length,
      crossModalCoherenceScore: coherence,
      representationalCoordinationGap: gap,
    })

    return {
      problemId: problem.id,
      exploredModalities,
      completedChallengeIds,
      correctChallengeIds,
      averageTranslationLatencyMs: avgLatency,
      representationalCoordinationGap: gap,
      crossModalCoherenceScore: coherence,
      representationalFluencyIndex: fluencyIndex,
    }
  }, [problem, correctChallengeIds, exploredModalities, completedChallengeIds, avgLatency])

  // Generated FSRS Deck
  const translationDeck = useMemo(() => {
    return generateFSRSTranslationDeck(problem)
  }, [problem])

  // Handle translation answer submission
  const handleAnswerChallenge = (challenge: CrossModalMappingChallenge, option: string) => {
    if (completedChallengeIds.includes(challenge.id)) return

    const latency = Math.max(1200, Date.now() - translationStartMs)
    setLatencyHistoryMs((prev) => [...prev, latency])
    setCompletedChallengeIds((prev) => [...prev, challenge.id])
    setSelectedOptionByChallenge((prev) => ({ ...prev, [challenge.id]: option }))

    const isCorrect = option === challenge.correctTargetElement
    if (isCorrect) {
      setCorrectChallengeIds((prev) => [...prev, challenge.id])
      playTone(659.25, 'sine', 0.25)
      hapticMedium()
    } else {
      playTone(293.66, 'sawtooth', 0.2)
      hapticHeavy()
    }

    setTranslationStartMs(Date.now())
  }

  // Handle Copy Deck
  const handleCopyDeck = () => {
    const text = translationDeck
      .map(
        (c, i) =>
          `Card ${i + 1} [${c.sourceModality} ➔ ${c.targetModality} (${c.deftFunction})]:\n${c.prompt}\n\n${c.answer}\n\nRule: ${c.isomorphismRule}\n`,
      )
      .join('\n---\n\n')

    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setIsDeckCopied(true)
        hapticLight()
        setTimeout(() => setIsDeckCopied(false), 2500)
      })
      .catch(() => {})
  }

  const primaryArtifact = problem.artifacts[primaryModality]
  const secondaryArtifact = problem.artifacts[secondaryModality]

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header & Problem Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-secondary">
              Multi-Representational Fluency Studio
            </span>
            <Badge tone="accent">Ainsworth DeFT · Lesh 5-Mode Model</Badge>
          </div>
          <h1 className="text-2xl font-bold text-strong tracking-tight">
            Cross-Modal Representational Competence
          </h1>
          <p className="text-sm text-secondary mt-1">
            Bridge abstract formalisms with executable code, geometric topology, and grounded
            physical analogies to dismantle the Ainsworth coordination barrier.
          </p>
        </div>

        {/* Problem Selector Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {CALIBRATED_REPRESENTATIONAL_PROBLEMS.map((pr) => (
            <button
              key={pr.id}
              type="button"
              onClick={() => setSelectedProblemId(pr.id)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                pr.id === selectedProblemId
                  ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 shadow-xs'
                  : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) text-secondary hover:text-strong'
              }`}
            >
              {pr.domain === 'information_theory' && 'Shannon Entropy'}
              {pr.domain === 'state_estimation' && 'Kalman Filter'}
              {pr.domain === 'signal_processing' && 'Fourier Transform'}
              {pr.domain === 'deep_learning' && 'Backpropagation'}
            </button>
          ))}
        </div>
      </div>

      {/* Real-Time Representational Fluency HUD */}
      <RepresentationalFluencyHUD
        activeModality={primaryModality}
        metrics={metrics}
        problemTitle={problem.title}
        onModalitySelect={(mod) => handleSelectPrimaryModality(mod)}
      />

      {/* Studio View Navigation Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setView('multimodal_explorer')}
          className={`p-3 rounded-xl border text-left transition-all ${
            view === 'multimodal_explorer'
              ? 'border-sky-500 bg-sky-50/40 dark:bg-sky-950/20 ring-1 ring-sky-500/40'
              : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel)'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-strong mb-1">
            <span>1. Multi-Modal Explorer</span>
            <span className="text-[10px] text-sky-600 dark:text-sky-400">
              {exploredModalities.length}/5 Explored
            </span>
          </div>
          <p className="text-[11px] text-secondary">Ainsworth Complementary Views</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setView('translation_crucible')
            setTranslationStartMs(Date.now())
          }}
          className={`p-3 rounded-xl border text-left transition-all ${
            view === 'translation_crucible'
              ? 'border-violet-500 bg-violet-50/40 dark:bg-violet-950/20 ring-1 ring-violet-500/40'
              : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel)'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-strong mb-1">
            <span>2. Translation Crucible</span>
            <span className="text-[10px] text-violet-600 dark:text-violet-400">
              {correctChallengeIds.length}/{problem.translationChallenges.length} Solved
            </span>
          </div>
          <p className="text-[11px] text-secondary">Lesh Cross-Modal Isomorphisms</p>
        </button>

        <button
          type="button"
          onClick={() => setView('fsrs_deck')}
          className={`p-3 rounded-xl border text-left transition-all ${
            view === 'fsrs_deck'
              ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 ring-1 ring-emerald-500/40'
              : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel)'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-strong mb-1">
            <span>3. FSRS Translation Deck</span>
            <Badge tone="success">{translationDeck.length} Cards</Badge>
          </div>
          <p className="text-[11px] text-secondary">Spaced Isomorphism Practice</p>
        </button>
      </div>

      {/* View 1: Multi-Modal Explorer */}
      {view === 'multimodal_explorer' && (
        <Panel className="p-5 sm:p-6 border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="accent">Shaaron Ainsworth (2006)</Badge>
                <span className="text-xs text-secondary">DeFT Cognitive Coordination</span>
              </div>
              <h2 className="text-lg font-bold text-strong">{problem.title}</h2>
              <p className="text-xs text-secondary mt-1 max-w-2xl">
                Core Invariant:{' '}
                <strong className="text-strong">{problem.coreInvariancePrinciple}</strong>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setIsDualCompareActive(!isDualCompareActive)}
              >
                {isDualCompareActive ? 'Single Modality View' : 'Side-by-Side Dual View'}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setView('translation_crucible')
                  setTranslationStartMs(Date.now())
                }}
              >
                Test Translations
                <ChevronRight className="w-4 h-4 ml-1 inline" />
              </Button>
            </div>
          </div>

          {/* Primary & Secondary Modality Switchers */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border)">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-secondary">Primary Modality:</span>
              <div className="flex items-center gap-1">
                {(Object.keys(CANONICAL_MODALITY_CATALOG) as RepresentationModality[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleSelectPrimaryModality(m)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      primaryModality === m
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-white dark:bg-(--hub-panel) text-secondary hover:text-strong border border-neutral-200 dark:border-(--hub-border)'
                    }`}
                  >
                    {CANONICAL_MODALITY_CATALOG[m].leshEquivalent}
                  </button>
                ))}
              </div>
            </div>

            {isDualCompareActive && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-secondary">Contrast With:</span>
                <div className="flex items-center gap-1">
                  {(Object.keys(CANONICAL_MODALITY_CATALOG) as RepresentationModality[]).map(
                    (m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleSelectSecondaryModality(m)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                          secondaryModality === m
                            ? 'bg-violet-600 text-white shadow-xs'
                            : 'bg-white dark:bg-(--hub-panel) text-secondary hover:text-strong border border-neutral-200 dark:border-(--hub-border)'
                        }`}
                      >
                        {CANONICAL_MODALITY_CATALOG[m].leshEquivalent}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Side-by-Side Modality Artifact Presentation */}
          <div
            className={`grid gap-5 ${
              isDualCompareActive ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {/* Primary Modality Artifact */}
            <div className="p-5 rounded-2xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
                <div className="flex items-center gap-2">
                  <Badge tone="accent">
                    Primary: {CANONICAL_MODALITY_CATALOG[primaryModality].label}
                  </Badge>
                </div>
                <span className="text-[11px] text-tertiary">
                  Lesh Mode: {CANONICAL_MODALITY_CATALOG[primaryModality].leshEquivalent}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-strong mb-2">{primaryArtifact.title}</h3>
                <div className="p-3.5 rounded-xl bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) font-mono text-xs whitespace-pre-wrap leading-relaxed text-strong overflow-x-auto">
                  {primaryArtifact.content}
                </div>
              </div>

              {/* Key Elements & Affordance Breakdown */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-strong">Constituent Invariants:</div>
                <div className="space-y-1">
                  {primaryArtifact.keyElements.map((elem, idx) => (
                    <div key={idx} className="text-xs text-secondary flex items-start gap-1.5">
                      <span className="text-sky-500 font-bold">•</span>
                      <span>{elem}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-xs">
                <div className="p-2.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30">
                  <div className="font-bold text-emerald-800 dark:text-emerald-300 mb-0.5">
                    Cognitive Affordance:
                  </div>
                  <div className="text-secondary">{primaryArtifact.cognitiveAffordance}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30">
                  <div className="font-bold text-rose-800 dark:text-rose-300 mb-0.5">
                    Cognitive Limitation:
                  </div>
                  <div className="text-secondary">{primaryArtifact.cognitiveLimitation}</div>
                </div>
              </div>
            </div>

            {/* Secondary Modality Artifact (If Dual Mode Active) */}
            {isDualCompareActive && (
              <div className="p-5 rounded-2xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
                  <div className="flex items-center gap-2">
                    <Badge tone="violet">
                      Contrast: {CANONICAL_MODALITY_CATALOG[secondaryModality].label}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-tertiary">
                    Lesh Mode: {CANONICAL_MODALITY_CATALOG[secondaryModality].leshEquivalent}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-strong mb-2">{secondaryArtifact.title}</h3>
                  <div className="p-3.5 rounded-xl bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) font-mono text-xs whitespace-pre-wrap leading-relaxed text-strong overflow-x-auto">
                    {secondaryArtifact.content}
                  </div>
                </div>

                {/* Key Elements & Affordance Breakdown */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-strong">Constituent Invariants:</div>
                  <div className="space-y-1">
                    {secondaryArtifact.keyElements.map((elem, idx) => (
                      <div key={idx} className="text-xs text-secondary flex items-start gap-1.5">
                        <span className="text-violet-500 font-bold">•</span>
                        <span>{elem}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30">
                    <div className="font-bold text-emerald-800 dark:text-emerald-300 mb-0.5">
                      Cognitive Affordance:
                    </div>
                    <div className="text-secondary">{secondaryArtifact.cognitiveAffordance}</div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30">
                    <div className="font-bold text-rose-800 dark:text-rose-300 mb-0.5">
                      Cognitive Limitation:
                    </div>
                    <div className="text-secondary">{secondaryArtifact.cognitiveLimitation}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* View 2: Translation Crucible */}
      {view === 'translation_crucible' && (
        <Panel className="p-5 sm:p-6 border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="violet">Richard Lesh (1987)</Badge>
                <span className="text-xs text-secondary">
                  Cross-Modal Translation Isomorphisms ({correctChallengeIds.length}/
                  {problem.translationChallenges.length})
                </span>
              </div>
              <h2 className="text-lg font-bold text-strong">
                Representational Translation Crucible
              </h2>
              <p className="text-xs text-secondary mt-1">
                Map structural components between distinct representational modes to eliminate the
                Ainsworth coordination gap and achieve multi-representational fluency.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setView('multimodal_explorer')}>
                Back to Explorer
              </Button>
              <Button variant="primary" onClick={() => setView('fsrs_deck')}>
                View Translation Deck
                <ChevronRight className="w-4 h-4 ml-1 inline" />
              </Button>
            </div>
          </div>

          <div className="space-y-5">
            {problem.translationChallenges.map((challenge, idx) => {
              const isCompleted = completedChallengeIds.includes(challenge.id)
              const selectedOpt = selectedOptionByChallenge[challenge.id]
              const isCorrect = selectedOpt === challenge.correctTargetElement
              const src = CANONICAL_MODALITY_CATALOG[challenge.sourceModality]
              const tgt = CANONICAL_MODALITY_CATALOG[challenge.targetModality]

              return (
                <div
                  key={challenge.id}
                  className={`p-5 rounded-2xl border transition-all ${
                    isCompleted
                      ? isCorrect
                        ? 'border-emerald-500/50 bg-emerald-50/20 dark:bg-emerald-950/10'
                        : 'border-rose-500/50 bg-rose-50/20 dark:bg-rose-950/10'
                      : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-panel-2)'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-strong">Challenge #{idx + 1}:</span>
                      <Badge tone="accent">
                        {src.label} ➔ {tgt.label}
                      </Badge>
                      <Badge tone="neutral">DeFT: {challenge.deftFunction}</Badge>
                    </div>

                    <span className="text-[11px] text-tertiary">
                      Concreteness Step:{' '}
                      <strong>{challenge.goldstoneFadingStep.replace(/_/g, ' ')}</strong>
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-strong mb-3 leading-relaxed">
                    {challenge.prompt}
                  </p>

                  <div className="p-3 rounded-xl bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) mb-4 text-xs">
                    <strong className="text-secondary font-medium">Source Element: </strong>
                    <span className="text-strong font-semibold">{challenge.sourceElement}</span>
                  </div>

                  {/* Multiple Choice Target Options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {challenge.targetElementOptions.map((opt, optIdx) => {
                      const isThisSelected = selectedOpt === opt
                      return (
                        <button
                          key={optIdx}
                          type="button"
                          disabled={isCompleted}
                          onClick={() => handleAnswerChallenge(challenge, opt)}
                          className={`p-3 rounded-xl border text-left text-xs font-medium transition-all ${
                            isCompleted
                              ? opt === challenge.correctTargetElement
                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-bold'
                                : isThisSelected
                                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
                                  : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) text-tertiary opacity-50'
                              : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) text-secondary hover:border-sky-500 hover:text-strong'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{opt}</span>
                            {isCompleted && opt === challenge.correctTargetElement && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            )}
                            {isCompleted && isThisSelected && !isCorrect && (
                              <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Structural Explanation & Isomorphism Rule Reveal */}
                  {isCompleted && (
                    <div className="mt-4 p-4 rounded-xl bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-strong">
                        <Sparkles className="w-4 h-4 text-sky-500" />
                        Ainsworth Structural Translation Isomorphism:
                      </div>
                      <p className="text-secondary leading-relaxed">
                        {challenge.structuralMappingExplanation}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Deep Synthesis Banner */}
          <div className="p-4 rounded-xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/30 text-xs text-secondary leading-relaxed space-y-1">
            <div className="font-bold text-strong text-sky-900 dark:text-sky-300">
              Goldstone & Son (2005) Concreteness Fading Principle:
            </div>
            <p>{problem.deepSynthesisSynthesis}</p>
          </div>
        </Panel>
      )}

      {/* View 3: FSRS Translation Deck */}
      {view === 'fsrs_deck' && (
        <Panel className="p-5 sm:p-6 border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="success">FSRS-6 Cross-Modal Bridge</Badge>
                <span className="text-xs text-secondary">
                  Spaced Repetition Translation Cards ({translationDeck.length} generated)
                </span>
              </div>
              <h2 className="text-lg font-bold text-strong">
                Multi-Representational Translation Flashcards
              </h2>
              <p className="text-xs text-secondary mt-1">
                Retain isomorphic mappings and DeFT cognitive links across representations in
                long-term memory using FSRS-6 spaced retrieval.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={handleCopyDeck}>
                <Copy className="w-3.5 h-3.5 mr-1.5 inline" />
                {isDeckCopied ? 'Deck Copied!' : 'Copy Cards'}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setView('multimodal_explorer')
                  setSelectedProblemId(
                    selectedProblemId === 'shannon_information_entropy'
                      ? 'kalman_filter_state_estimation'
                      : 'shannon_information_entropy',
                  )
                }}
              >
                Next Problem
                <ArrowRight className="w-4 h-4 ml-1 inline" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {translationDeck.map((card, idx) => (
              <div
                key={card.id}
                className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-panel-2) space-y-3"
              >
                <div className="flex items-center justify-between">
                  <Badge tone="accent">
                    {card.sourceModality.replace(/_/g, ' ')} ➔{' '}
                    {card.targetModality.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-[11px] text-tertiary">Card #{idx + 1}</span>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-bold text-strong">Translation Query:</div>
                  <p className="text-xs text-secondary font-medium leading-relaxed whitespace-pre-wrap">
                    {card.prompt}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) space-y-2">
                  <div className="text-[11px] font-bold text-strong">Isomorphic Target:</div>
                  <p className="text-xs text-secondary whitespace-pre-line leading-relaxed">
                    {card.answer}
                  </p>
                  <div className="text-[10px] text-tertiary pt-1 border-t border-neutral-200 dark:border-(--hub-border)">
                    DeFT Rule: <em>{card.isomorphismRule}</em>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
