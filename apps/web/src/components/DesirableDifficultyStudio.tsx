'use client'

/**
 * @file DesirableDifficultyStudio.tsx
 * @description Desirable Difficulties & Multi-Ladder Retrieval Generation Studio.
 *
 * Implements:
 * - Bjork & Bjork (1992, 2011) Storage Strength vs Retrieval Strength 2D phase-space.
 * - Slamecka & Graf (1978) 4-Rung Generation Ladder (Stem Completion, Anagram, Reverse Inquiry, Analogy).
 * - Roediger & Karpicke (2006) Empirical Testing Effect Crucible.
 * - FSRS Spaced Repetition Generative Stability Scaling.
 */

import React, { useMemo, useState } from 'react'
import {
  CALIBRATED_GENERATION_CHALLENGES,
  calculateRetrievalStrengthDecay,
  calculateStorageHalfLifeHours,
  DesirableDifficultySession,
  exportGenerativeChallengesToFSRSCards,
  FSRSGenerativeCard,
  GenerativeChallengeItem,
} from '@learning-hub/core/generation'
import { GenerationTier } from '@learning-hub/core/generation'
import { Badge, Button, DesirableDifficultyHUD, Markdown, Panel, ProgressBar } from '@/ui'
import { getSharedAudioContext } from '@/lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium } from '../platform/haptics'
import {
  Activity,
  ArrowRight,
  Award,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Copy,
  Download,
  Flame,
  HelpCircle,
  RotateCcw,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react'

export interface DesirableDifficultyStudioProps {
  initialChallenges?: Record<string, GenerativeChallengeItem>
  onExportCards?: (cards: FSRSGenerativeCard[]) => void
}

type StudioTab = 'generative_ladder' | 'bjork_phase_space' | 'testing_crucible' | 'fsrs_cards'

const TIER_ORDER: GenerationTier[] = [
  'stem_completion',
  'semantic_anagram',
  'reverse_query',
  'analogy_synthesis',
]

const TIER_META: Record<
  GenerationTier,
  { level: number; label: string; multiplier: string; description: string }
> = {
  stem_completion: {
    level: 1,
    label: 'Stem Completion',
    multiplier: '1.25x',
    description: 'Phonemic initial & final anchors with masked vowels. Low friction cueing.',
  },
  semantic_anagram: {
    level: 2,
    label: 'Semantic Anagram',
    multiplier: '1.60x',
    description: 'Syntactic reordering of scrambled concept fragments into coherent thesis.',
  },
  reverse_query: {
    level: 3,
    label: 'Reverse Inquiry',
    multiplier: '2.00x',
    description: 'Socratic inversion: Given the answer, formulate the precise core question.',
  },
  analogy_synthesis: {
    level: 4,
    label: 'Analogy Synthesis',
    multiplier: '2.50x',
    description: 'Cross-domain structural isomorphism: Translate mechanism to physical metaphor.',
  },
}

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
      // Audio failure fallback
    })
}

export function DesirableDifficultyStudio({
  initialChallenges = CALIBRATED_GENERATION_CHALLENGES,
  onExportCards,
}: DesirableDifficultyStudioProps) {
  const [session, setSession] = useState(() => new DesirableDifficultySession(initialChallenges))
  const [activeTab, setActiveTab] = useState<StudioTab>('generative_ladder')

  // User input & latency state
  const [userAttempt, setUserAttempt] = useState<string>('')
  const [selectedTokens, setSelectedTokens] = useState<string[]>([])
  const [startTime] = useState<number>(() => Date.now())
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  // Phase-space simulator state: simulated elapsed hours (0 to 720 hrs = 30 days)
  const [simulatedElapsedHours, setSimulatedElapsedHours] = useState<number>(0)

  // Testing crucible state: comparison retention interval (5min, 2days, 7days, 30days)
  const [crucibleIntervalDays, setCrucibleIntervalDays] = useState<number>(7)

  const sessionState = session.getState()
  const currentChallenge = session.getCurrentChallenge()
  const currentMemory = currentChallenge ? sessionState.memoryStates[currentChallenge.id] : null
  const currentRung = currentChallenge ? currentChallenge.rungs[sessionState.currentTier] : null

  // Generated FSRS cards memo
  const fsrsCards = useMemo(() => {
    return exportGenerativeChallengesToFSRSCards(session)
  }, [session, sessionState.history.length])

  // Handle token chip click for Tier 2 Semantic Anagram
  const handleTokenClick = (token: string) => {
    hapticLight()
    const nextTokens = [...selectedTokens, token]
    setSelectedTokens(nextTokens)
    const combined = nextTokens.join(' ')
    setUserAttempt(combined)
    session.setUserAttempt(combined)
  }

  const handleResetTokens = () => {
    hapticLight()
    setSelectedTokens([])
    setUserAttempt('')
    session.setUserAttempt('')
  }

  // Handle tier change
  const handleTierSelect = (tier: GenerationTier) => {
    hapticLight()
    session.setTier(tier)
    setSelectedTokens([])
    setUserAttempt('')
    setSession(new DesirableDifficultySession(initialChallenges))
    // Keep challenge and memory states
    session.setTier(tier)
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Handle challenge change
  const handleChallengeSelect = (id: string) => {
    hapticLight()
    session.selectChallenge(id)
    setSelectedTokens([])
    setUserAttempt('')
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Evaluate generation attempt
  const handleEvaluateAttempt = () => {
    if (!userAttempt.trim()) return

    const latencyMs = Math.max(1000, Date.now() - startTime)
    session.setUserAttempt(userAttempt.trim())
    const telemetry = session.evaluateAttempt(latencyMs)

    if (telemetry.isCorrect) {
      if (telemetry.isDesirablyDifficult) {
        hapticHeavy()
        playStudioAudio(880, 0.3, 'triangle') // High resonance for desirable difficulty
      } else {
        hapticMedium()
        playStudioAudio(659.25, 0.2, 'sine') // E5 chime
      }
    } else {
      hapticLight()
      playStudioAudio(330, 0.2, 'sawtooth')
    }

    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Advance to next rung
  const handleAdvanceTier = () => {
    const currentIndex = TIER_ORDER.indexOf(sessionState.currentTier)
    if (currentIndex < TIER_ORDER.length - 1) {
      const nextTier = TIER_ORDER[currentIndex + 1]!
      handleTierSelect(nextTier)
      playStudioAudio(784, 0.25, 'sine')
    }
  }

  // Copy FSRS cards JSON
  const handleCopyCardsJSON = () => {
    hapticMedium()
    navigator.clipboard.writeText(JSON.stringify(fsrsCards, null, 2))
    setCopyStatus('Copied JSON to clipboard!')
    setTimeout(() => setCopyStatus(null), 3000)
  }

  // Export cards callback
  const handleExportToDeck = () => {
    hapticHeavy()
    if (onExportCards) {
      onExportCards(fsrsCards)
    }
    setCopyStatus(`Exported ${fsrsCards.length} generative cards to review deck!`)
    setTimeout(() => setCopyStatus(null), 3500)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top HUD Telemetry */}
      {currentMemory && (
        <DesirableDifficultyHUD
          memoryState={currentMemory}
          lastTelemetry={sessionState.lastTelemetry}
          activeTier={sessionState.currentTier}
        />
      )}

      {/* Main Studio Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-2">
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={activeTab === 'generative_ladder' ? 'primary' : 'ghost'}
            onClick={() => {
              hapticLight()
              setActiveTab('generative_ladder')
            }}
          >
            <Flame className="mr-1.5 h-4 w-4 text-amber-500" /> Generative Ladder
          </Button>

          <Button
            variant={activeTab === 'bjork_phase_space' ? 'primary' : 'ghost'}
            onClick={() => {
              hapticLight()
              setActiveTab('bjork_phase_space')
            }}
          >
            <Compass className="mr-1.5 h-4 w-4 text-sky-500" /> Bjork SS/RS Matrix
          </Button>

          <Button
            variant={activeTab === 'testing_crucible' ? 'primary' : 'ghost'}
            onClick={() => {
              hapticLight()
              setActiveTab('testing_crucible')
            }}
          >
            <Activity className="mr-1.5 h-4 w-4 text-emerald-500" /> Testing Crucible
          </Button>

          <Button
            variant={activeTab === 'fsrs_cards' ? 'primary' : 'ghost'}
            onClick={() => {
              hapticLight()
              setActiveTab('fsrs_cards')
            }}
          >
            <Sparkles className="mr-1.5 h-4 w-4 text-violet-500" /> FSRS Deck ({fsrsCards.length})
          </Button>
        </div>

        {/* Challenge Selection Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Concept:</span>
          <select
            className="rounded-lg border border-border/80 bg-background px-2.5 py-1 text-xs font-medium text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            value={sessionState.currentChallengeId}
            onChange={(e) => handleChallengeSelect(e.target.value)}
          >
            {sessionState.challengeIds.map((id) => (
              <option key={id} value={id}>
                {initialChallenges[id]?.title ?? id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* WORKSPACE 1: ACTIVE GENERATIVE LADDER */}
      {activeTab === 'generative_ladder' && currentChallenge && currentRung && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Challenge Prompt & Tier Stepper (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* Tier Selector Buttons */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TIER_ORDER.map((tier) => {
                const meta = TIER_META[tier]
                const isCurrent = tier === sessionState.currentTier
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => handleTierSelect(tier)}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                      isCurrent
                        ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40'
                        : 'border-border/60 bg-card hover:bg-muted/40'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Tier {meta.level}
                    </span>
                    <span className="text-xs font-semibold text-foreground">{meta.label}</span>
                    <span className="mt-0.5 text-[10px] font-mono font-bold text-primary">
                      {meta.multiplier}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Main Challenge Card */}
            <Panel className="p-5">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div className="flex items-center gap-2">
                  <Badge tone="violet">Tier {TIER_META[sessionState.currentTier].level}</Badge>
                  <span className="text-xs font-medium text-muted-foreground">
                    {TIER_META[sessionState.currentTier].label}
                  </span>
                </div>
                <Badge tone="neutral">{currentChallenge.domain.replace('_', ' ')}</Badge>
              </div>

              {/* Challenge Prompt */}
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-semibold text-foreground">
                  {currentRung.challengePrompt}
                </h4>
                <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5 text-xs text-muted-foreground flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 shrink-0 text-primary" />
                  <span>{currentRung.cue}</span>
                </div>
              </div>

              {/* Tier 1 Stem Mask View */}
              {sessionState.currentTier === 'stem_completion' && (
                <div className="mt-4 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
                  <div className="text-[10px] font-bold uppercase text-primary tracking-wider mb-1">
                    Cued Phonemic Stem Mask:
                  </div>
                  <p className="font-mono text-sm tracking-wide text-foreground font-medium select-none">
                    {currentRung.targetExpected
                      .split(' ')
                      .map((word) =>
                        word.length > 3 ? `${word[0]}_${word[word.length - 1]}` : word,
                      )
                      .join(' ')}
                  </p>
                </div>
              )}

              {/* Tier 2 Semantic Anagram Fragment Chips */}
              {sessionState.currentTier === 'semantic_anagram' &&
                currentRung.scrambledFragments && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Click fragments in order to reconstruct thesis:</span>
                      {selectedTokens.length > 0 && (
                        <button
                          type="button"
                          onClick={handleResetTokens}
                          className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                        >
                          <RotateCcw className="h-3 w-3" /> Reset Fragments
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {currentRung.scrambledFragments.map((frag, idx) => {
                        const isChosen = selectedTokens.includes(frag)
                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={isChosen}
                            onClick={() => handleTokenClick(frag)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                              isChosen
                                ? 'opacity-30 border-border/40 bg-muted cursor-not-allowed line-through'
                                : 'border-border/80 bg-card hover:border-primary hover:bg-primary/5 shadow-2xs'
                            }`}
                          >
                            {frag}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

              {/* User Synthesis Input */}
              <div className="mt-5 space-y-2">
                <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>Your Generative Formulation:</span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {userAttempt.length} chars
                  </span>
                </label>
                <textarea
                  rows={4}
                  className="w-full rounded-xl border border-border/80 bg-background p-3 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
                  placeholder={
                    sessionState.currentTier === 'analogy_synthesis'
                      ? 'Synthesize a physical or organizational metaphor, then describe where it breaks...'
                      : 'Type or construct your generative solution from memory...'
                  }
                  value={userAttempt}
                  onChange={(e) => {
                    setUserAttempt(e.target.value)
                    session.setUserAttempt(e.target.value)
                  }}
                />
              </div>

              {/* Actions */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    handleResetTokens()
                    session.setTier(sessionState.currentTier)
                    setSession(
                      Object.assign(Object.create(Object.getPrototypeOf(session)), session),
                    )
                  }}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Clear
                </Button>

                <Button
                  variant="primary"
                  disabled={!userAttempt.trim()}
                  onClick={handleEvaluateAttempt}
                >
                  <Zap className="mr-1.5 h-4 w-4" /> Evaluate Retrieval Attempt
                </Button>
              </div>
            </Panel>
          </div>

          {/* Right Column: Telemetry Feedback & Canon Solution (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Feedback / Evaluation Panel */}
            {sessionState.isEvaluated && sessionState.lastTelemetry ? (
              <Panel className="p-5 border-l-4 border-l-primary space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {sessionState.lastTelemetry.isCorrect ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-amber-500" />
                    )}
                    <span className="text-sm font-semibold text-foreground">
                      {sessionState.lastTelemetry.isCorrect
                        ? 'Generative Target Achieved'
                        : 'Partial Retrieval'}
                    </span>
                  </div>
                  <Badge tone={sessionState.lastTelemetry.isCorrect ? 'success' : 'warning'}>
                    {Math.round(sessionState.lastTelemetry.similarityScore * 100)}% Match
                  </Badge>
                </div>

                {/* Feedback message */}
                <p className="text-xs text-foreground/90 leading-relaxed">
                  {sessionState.lastTelemetry.feedbackMessage}
                </p>

                {/* Telemetry Chips */}
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/40 bg-muted/20 p-3 text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Storage Delta</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      +{sessionState.lastTelemetry.storageDelta} SS
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">
                      Retention Multiplier
                    </span>
                    <span className="font-mono font-bold text-primary">
                      {sessionState.lastTelemetry.retentionMultiplier}x
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">
                      Cognitive Effort
                    </span>
                    <span className="font-mono font-semibold text-foreground">
                      {sessionState.lastTelemetry.cognitiveEffortIndex} / 100
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">
                      Desirable Difficulty
                    </span>
                    <span className="font-semibold text-foreground">
                      {sessionState.lastTelemetry.isDesirablyDifficult ? 'Mastered ✨' : 'Standard'}
                    </span>
                  </div>
                </div>

                {/* Reference Solution Comparison */}
                <div className="space-y-1.5 pt-2 border-t border-border/40">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                    Canonical Reference Solution:
                  </span>
                  <div className="rounded-lg bg-background p-2.5 text-xs text-foreground/90 border border-border/50">
                    <Markdown>{currentRung.referenceSolution}</Markdown>
                  </div>
                </div>

                {/* Advance Button */}
                {sessionState.lastTelemetry.isCorrect && (
                  <Button variant="primary" className="w-full mt-2" onClick={handleAdvanceTier}>
                    Advance to Next Rung <ChevronRight className="ml-1.5 h-4 w-4" />
                  </Button>
                )}
              </Panel>
            ) : (
              <Panel className="p-5 flex flex-col items-center justify-center text-center space-y-3 min-h-[220px]">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Brain className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">Active Retrieval Primer</h4>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Generate your synthesis from memory without consulting the solution. High effort
                  maximizes synaptic long-term potentiation.
                </p>
              </Panel>
            )}

            {/* Concept Overview Card */}
            <Panel className="p-4 space-y-2">
              <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                Canonical Mechanism
              </span>
              <p className="text-xs text-foreground/80 leading-relaxed">
                {currentChallenge.canonicalDefinition}
              </p>
              <div className="pt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Domain Analogy:</span>
                <span className="font-semibold text-foreground">
                  {currentChallenge.analogyDomain}
                </span>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* WORKSPACE 2: BJORK PHASE-SPACE ANALYZER */}
      {activeTab === 'bjork_phase_space' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: 2D Interactive Scatter Map (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <Panel className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    Bjork Memory Phase-Space (SS vs RS)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Simulate elapsed time to observe decay of momentary accessibility.
                  </p>
                </div>
                <Badge tone="cyan">{sessionState.challengeIds.length} Concepts Tracked</Badge>
              </div>

              {/* 2D Grid with all concepts plotted */}
              <div className="relative aspect-video w-full rounded-xl border border-border/80 bg-background/60 p-3 overflow-hidden shadow-inner">
                {/* Axes */}
                <div className="absolute top-2 left-3 text-[10px] font-bold uppercase text-muted-foreground/60 tracking-wider">
                  Storage Strength (SS: 0-100) ↑
                </div>
                <div className="absolute bottom-2 right-3 text-[10px] font-bold uppercase text-muted-foreground/60 tracking-wider">
                  Retrieval Strength (RS: 0-1.0) →
                </div>

                {/* Quadrant Lines */}
                <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/50" />
                <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-border/50" />

                {/* Quadrant Backdrops */}
                <div className="absolute top-2 left-3 text-[9px] font-semibold text-emerald-600/70 dark:text-emerald-400/70">
                  DESIRABLE SWEET SPOT
                  <br />
                  (High SS / Low RS)
                </div>
                <div className="absolute top-2 right-3 text-right text-[9px] font-semibold text-sky-600/70 dark:text-sky-400/70">
                  OVERLEARNED FLUENCY
                  <br />
                  (High SS / High RS)
                </div>
                <div className="absolute bottom-4 left-3 text-[9px] font-semibold text-muted-foreground/50">
                  EXTINCT TRACE
                  <br />
                  (Low SS / Low RS)
                </div>
                <div className="absolute bottom-4 right-3 text-right text-[9px] font-semibold text-amber-600/70 dark:text-amber-400/70">
                  FLUENCY TRAP
                  <br />
                  (Low SS / High RS)
                </div>

                {/* Render Dots for each Concept in Library */}
                {sessionState.challengeIds.map((id) => {
                  const item = initialChallenges[id]!
                  const mem = sessionState.memoryStates[id]!

                  // Calculate decayed RS based on simulated hours
                  const decayedRS = calculateRetrievalStrengthDecay(
                    mem.retrievalStrength,
                    mem.storageStrength,
                    simulatedElapsedHours,
                  )

                  const isCurrent = id === sessionState.currentChallengeId
                  return (
                    <div
                      key={id}
                      className="absolute -translate-x-1/2 translate-y-1/2 cursor-pointer transition-all duration-500 ease-out"
                      style={{
                        left: `${Math.max(6, Math.min(94, decayedRS * 100))}%`,
                        bottom: `${Math.max(6, Math.min(94, mem.storageStrength))}%`,
                      }}
                      onClick={() => handleChallengeSelect(id)}
                      title={`${item.title} (SS: ${mem.storageStrength}, RS: ${(decayedRS * 100).toFixed(0)}%)`}
                    >
                      <div className="group relative flex items-center justify-center">
                        <span
                          className={`h-4 w-4 rounded-full border-2 border-background shadow-md transition-transform group-hover:scale-150 ${
                            isCurrent ? 'bg-primary ring-2 ring-primary/40' : 'bg-foreground/70'
                          }`}
                        />
                        <span className="absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[9px] font-medium text-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                          {item.title}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Time Decay Simulation Slider */}
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-sky-500" /> Simulated Elapsed Time:
                  </span>
                  <span className="font-mono font-bold text-foreground">
                    {simulatedElapsedHours} hours ({(simulatedElapsedHours / 24).toFixed(1)} days)
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={720}
                  step={12}
                  className="w-full accent-primary cursor-pointer"
                  value={simulatedElapsedHours}
                  onChange={(e) => setSimulatedElapsedHours(Number(e.target.value))}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0 hrs (Immediate)</span>
                  <span>7 days (168h)</span>
                  <span>14 days (336h)</span>
                  <span>30 days (720h)</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Notice how time decays <em>Retrieval Strength</em> while <em>Storage Strength</em>{' '}
                  remains durable. This decay creates the <strong>Desirable Difficulty</strong>{' '}
                  opportunity for high-yield retrieval practice!
                </p>
              </div>
            </Panel>
          </div>

          {/* Right Column: Mathematical Formulations & Concept Inspector (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <Panel className="p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" /> Bjork Formulation Breakdown
              </h4>
              <div className="space-y-2 text-xs text-foreground/80">
                <div className="rounded-md border border-border/40 bg-muted/20 p-2.5">
                  <div className="font-mono font-semibold text-primary text-[11px]">
                    t_halfLife = 24 × (1 + SS / 12)^1.35
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Storage Strength lengthens decay half-life super-linearly from hours to years.
                  </div>
                </div>

                <div className="rounded-md border border-border/40 bg-muted/20 p-2.5">
                  <div className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 text-[11px]">
                    ΔSS = 12 × TierMultiplier × (1.05 - RS) × Headroom
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Inverse accessibility: The harder it is to retrieve (lower RS), the greater the
                    consolidation into Storage Strength.
                  </div>
                </div>
              </div>
            </Panel>

            {/* Selected Concept Deep Dive */}
            {currentMemory && currentChallenge && (
              <Panel className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Active Concept Telemetry
                  </h4>
                  <Badge tone="cyan">{currentMemory.quadrant.replace(/_/g, ' ')}</Badge>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Title:</span>
                    <span className="font-medium text-foreground">{currentChallenge.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Storage Strength (SS):</span>
                    <span className="font-mono font-bold text-foreground">
                      {currentMemory.storageStrength} / 100
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Initial RS:</span>
                    <span className="font-mono text-foreground">
                      {(currentMemory.retrievalStrength * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Simulated Decayed RS:</span>
                    <span className="font-mono font-semibold text-primary">
                      {(
                        calculateRetrievalStrengthDecay(
                          currentMemory.retrievalStrength,
                          currentMemory.storageStrength,
                          simulatedElapsedHours,
                        ) * 100
                      ).toFixed(0)}
                      %
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Half-Life Projection:</span>
                    <span className="font-mono text-foreground">
                      {calculateStorageHalfLifeHours(currentMemory.storageStrength)} hrs
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Target ΔSS on Retrieval:</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      +{currentMemory.projectedStorageDelta} SS
                    </span>
                  </div>
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}

      {/* WORKSPACE 3: ROEDIGER & KARPICKE TESTING CRUCIBLE */}
      {activeTab === 'testing_crucible' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Empirical Comparison & Retention Curve (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <Panel className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    Empirical Testing Effect (Roediger & Karpicke 2006)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Generative Retrieval Practice (Study-Test) vs Passive Restudying (Study-Study).
                  </p>
                </div>
                <Badge tone="violet">Science Grounded</Badge>
              </div>

              {/* Interval Buttons */}
              <div className="flex gap-2">
                {[
                  { days: 0.003, label: '5 Minutes' },
                  { days: 2, label: '2 Days' },
                  { days: 7, label: '1 Week' },
                  { days: 30, label: '1 Month' },
                ].map((item) => {
                  const isSelected = crucibleIntervalDays === item.days
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        hapticLight()
                        setCrucibleIntervalDays(item.days)
                      }}
                      className={`flex-1 rounded-lg border py-2 text-center text-xs font-semibold transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary shadow-xs'
                          : 'border-border/60 bg-card text-muted-foreground hover:bg-muted/30'
                      }`}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>

              {/* Retention Bars Comparison */}
              <div className="space-y-4 pt-2">
                {/* Passive Restudy (SS) */}
                <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-muted-foreground">
                      Passive Restudy (Study-Study)
                    </span>
                    <span className="font-mono font-bold text-foreground">
                      {crucibleIntervalDays < 0.1
                        ? '82%'
                        : crucibleIntervalDays <= 2
                          ? '54%'
                          : crucibleIntervalDays <= 7
                            ? '42%'
                            : '21%'}{' '}
                      Retention
                    </span>
                  </div>
                  <ProgressBar
                    value={
                      crucibleIntervalDays < 0.1
                        ? 0.82
                        : crucibleIntervalDays <= 2
                          ? 0.54
                          : crucibleIntervalDays <= 7
                            ? 0.42
                            : 0.21
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {crucibleIntervalDays < 0.1
                      ? 'Deceptive short-term peak! High perceptual fluency creates illusion of mastery.'
                      : 'Rapid catastrophic forgetting due to lack of effortful retrieval consolidation.'}
                  </p>
                </div>

                {/* Generative Retrieval (ST) */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4" /> Generative Retrieval Practice (Study-Test)
                    </span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {crucibleIntervalDays < 0.1
                        ? '76%'
                        : crucibleIntervalDays <= 2
                          ? '68%'
                          : crucibleIntervalDays <= 7
                            ? '61%'
                            : '49%'}{' '}
                      Retention
                    </span>
                  </div>
                  <ProgressBar
                    value={
                      crucibleIntervalDays < 0.1
                        ? 0.76
                        : crucibleIntervalDays <= 2
                          ? 0.68
                          : crucibleIntervalDays <= 7
                            ? 0.61
                            : 0.49
                    }
                  />
                  <p className="text-[11px] text-foreground/80">
                    {crucibleIntervalDays < 0.1
                      ? 'Initially feels harder, but generates durable inter-associative structural nodes.'
                      : 'Robust synaptic consolidation protects against forgetting over long delay intervals.'}
                  </p>
                </div>
              </div>
            </Panel>
          </div>

          {/* Right Column: Research Insights & Rung Multipliers (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <Panel className="p-5 space-y-3">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" /> Key Empirical Findings
              </h4>
              <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                <p>
                  <strong>1. The Fluency Paradox:</strong> Students who restudy predict they will
                  remember far more than students who test themselves, yet at 1 week the testing
                  group outperforms restudying by <strong>~50%</strong>.
                </p>
                <p>
                  <strong>2. Desirable Difficulty Invariant:</strong> Conditions that make learning
                  feel easy in the short term often produce superficial encoding. Conditions that
                  introduce difficulty and friction (generation, spacing, interleaving) enhance
                  long-term retention.
                </p>
                <p>
                  <strong>3. Potentiation of Errors:</strong> Even an unsuccessful retrieval attempt
                  primes the brain to absorb and encode corrective feedback significantly more
                  durably than passive reading.
                </p>
              </div>
            </Panel>

            <Panel className="p-4 space-y-2">
              <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                Generative Ladder Friction Multipliers
              </span>
              <div className="space-y-1.5 text-xs">
                {TIER_ORDER.map((tier) => {
                  const meta = TIER_META[tier]
                  return (
                    <div
                      key={tier}
                      className="flex items-center justify-between border-b border-border/30 pb-1"
                    >
                      <span className="text-foreground">{meta.label}</span>
                      <span className="font-mono font-bold text-primary">{meta.multiplier}</span>
                    </div>
                  )
                })}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* WORKSPACE 4: FSRS GENERATIVE CARDS & EXPORTER */}
      {activeTab === 'fsrs_cards' && (
        <div className="flex flex-col gap-4">
          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  FSRS Generative Review Deck
                </h4>
                <p className="text-xs text-muted-foreground">
                  Generated cards with boosted initial stability from deliberate retrieval practice.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={handleCopyCardsJSON}
                  disabled={fsrsCards.length === 0}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy JSON
                </Button>
                <Button
                  variant="primary"
                  onClick={handleExportToDeck}
                  disabled={fsrsCards.length === 0}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Export to Review Engine
                </Button>
              </div>
            </div>

            {copyStatus && (
              <div className="mt-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {copyStatus}
              </div>
            )}

            {/* Cards List */}
            {fsrsCards.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h5 className="text-sm font-semibold text-foreground">No Generative Cards Yet</h5>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Complete retrieval challenges in the Generative Ladder tab. Each successful
                  attempt will automatically synthesize an FSRS review card with enhanced stability!
                </p>
                <Button
                  variant="primary"
                  onClick={() => {
                    hapticLight()
                    setActiveTab('generative_ladder')
                  }}
                >
                  Start First Generative Trial <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {fsrsCards.map((card) => (
                  <div
                    key={card.id}
                    className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-4 shadow-2xs hover:border-primary/50 transition-all"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <Badge tone="violet">
                          Tier {card.metadata.tier.replace('_', ' ').toUpperCase()}
                        </Badge>
                        <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          Initial S: {card.suggestedInitialStability}d
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                          Front Prompt
                        </div>
                        <div className="text-xs text-foreground/90 font-medium">
                          <Markdown>{card.front}</Markdown>
                        </div>
                      </div>

                      <div className="space-y-1 pt-2 border-t border-border/30">
                        <div className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                          Back Synthesis
                        </div>
                        <div className="text-xs text-foreground/80">
                          <Markdown>{card.back}</Markdown>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground">
                      <div className="flex flex-wrap gap-1">
                        {card.tags.map((t) => (
                          <span key={t} className="rounded bg-muted px-1.5 py-0.5 font-mono">
                            #{t}
                          </span>
                        ))}
                      </div>
                      <span className="font-mono text-primary font-bold">
                        {card.metadata.retentionMultiplier}x Boost
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}
