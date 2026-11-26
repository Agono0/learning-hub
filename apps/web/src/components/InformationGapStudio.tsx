/**
 * Learning HUB — Epistemic Curiosity & Information Gap Studio
 *
 * Grounded in:
 * - George Loewenstein (1994):
 *   "The Psychology of Curiosity: A Review and Reinterpretation"
 *   Curiosity as an aversive feeling of deprivation arising from an awareness gap.
 * - Daniel E. Berlyne (1960, 1966):
 *   "Conflict, Arousal, and Curiosity"
 *   Collative variables (novelty, complexity, ambiguity, surprise, incongruity) driving exploratory epistemic search.
 * - Min Jeong Kang et al. (2009, Neuron):
 *   "The Wick in the Candle of Learning: Epistemic Curiosity Activates the Reward Circuit and Enhances Memory"
 *   fMRI: Anticipatory curiosity sensitizes striatal dopamine, yielding up to 85% higher long-term retention.
 *
 * All engine evaluation runs through the hub transport (`@/lib/transport` →
 * `/api/curiosity`, registered in the hub worker for native builds): the
 * mystery catalog via GET and the live Loewenstein/Kang telemetry via POST
 * `action:metrics`. The pure core engine is mirrored in-browser as the instant
 * optimistic value and the fallback when the API is unreachable (manual-mode
 * guarantee, AGENTS.md rule 9); both compute identical deterministic values,
 * so rendering never changes. The resolution crucible composes its result from
 * resolver-option content (no engine math — historical behavior kept); the
 * engine's own stateful resolution is exposed headless via POST
 * `action:resolve`.
 */

'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  CALIBRATED_CURIOSITY_MYSTERIES,
  calculateLoewensteinEpistemicTension,
  calculateMemoryFacilitationMultiplier,
  type CuriosityGapMystery,
  type CuriosityMetrics,
  evaluateEpistemicDriveStatus,
  type FSRSCuriosityCard,
  type MysteryResolutionResult,
} from '@learning-hub/core/curiosity'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, Button, InformationGapHUD, Panel } from '@/ui'
import { getSharedAudioContext } from '@/lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium } from '../platform/haptics'
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  Compass,
  Copy,
  Eye,
  Flame,
  HelpCircle,
  Layers,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react'

type StudioTab = 'clues' | 'crucible' | 'audit' | 'deck'

/** GET /api/curiosity — the calibrated mystery catalog. */
interface CuriosityCatalogResponse {
  ok: boolean
  mysteries: CuriosityGapMystery[]
}

/** POST /api/curiosity `action:metrics` — authoritative Loewenstein/Kang telemetry. */
interface CuriosityMetricsResponse {
  ok: boolean
  metrics: CuriosityMetrics
}

export function InformationGapStudio() {
  const [selectedMysteryId, setSelectedMysteryId] = useState<string>(
    'quantum_delayed_choice_eraser',
  )
  const [activeTab, setActiveTab] = useState<StudioTab>('clues')

  // Session state
  const [revealedClueIds, setRevealedClueIds] = useState<Set<string>>(new Set())
  const [selectedResolverId, setSelectedResolverId] = useState<string | null>(null)
  const [resolutionResult, setResolutionResult] = useState<MysteryResolutionResult | null>(null)
  const [simulatedKnowledge, setSimulatedKnowledge] = useState<number | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Mystery catalog — served by the runtime-neutral handler (GET
  // /api/curiosity). The shipped corpus is both the initial data and the
  // unreachable-API fallback, so rendering never waits on the transport
  // (manual mode, AGENTS.md rule 9). API-first effect fetch: the bundled
  // corpus paints synchronously (SSR included); the handler's catalog
  // replaces it once the response lands.
  const [mysteries, setMysteries] = useState<CuriosityGapMystery[]>(() =>
    Object.values(CALIBRATED_CURIOSITY_MYSTERIES),
  )
  useEffect(() => {
    let stale = false
    apiGet<CuriosityCatalogResponse>('/api/curiosity')
      .then((res) => {
        if (!stale && res?.mysteries?.length) setMysteries(res.mysteries)
      })
      .catch(() => {
        // Manual mode: the bundled calibrated corpus remains.
      })
    return () => {
      stale = true
    }
  }, [])

  const mystery: CuriosityGapMystery =
    mysteries.find((m) => m.id === selectedMysteryId) ??
    CALIBRATED_CURIOSITY_MYSTERIES.quantum_delayed_choice_eraser

  // Perceived-knowledge model — the studio's own INPUT to the engine's tension
  // curve: baseline 0.25 + 0.45 × clue coverage, the HUD's simulated level, or
  // the 0.95 post-resolution epistemic closure. Sent to the handler unrounded
  // so the server computes the identical tension value.
  const isResolved = resolutionResult?.isAccurate === true
  const baseK = useMemo(() => {
    if (simulatedKnowledge !== null) return simulatedKnowledge
    if (isResolved) return 0.95
    return 0.25 + (revealedClueIds.size / Math.max(1, mystery.clues.length)) * 0.45
  }, [simulatedKnowledge, isResolved, revealedClueIds, mystery])

  // Live HUD telemetry — the in-browser engine mirror: instant (the HUD must
  // never wait on the transport) and the manual-mode fallback when the API is
  // unreachable. Deterministic and identical to the handler's computation.
  const localMetrics: CuriosityMetrics = useMemo(() => {
    const tension = calculateLoewensteinEpistemicTension(baseK, mystery.collativeVariable)
    const mult = calculateMemoryFacilitationMultiplier(
      tension,
      revealedClueIds.size,
      mystery.clues.length,
    )
    const salience =
      Math.round((revealedClueIds.size / Math.max(1, mystery.clues.length)) * 100) / 100
    const driveStatus = evaluateEpistemicDriveStatus(tension, isResolved)

    return {
      priorKnowledgeLevel: Math.round(baseK * 100) / 100,
      epistemicTensionScore: tension,
      cluesRevealedCount: revealedClueIds.size,
      totalAvailableClues: mystery.clues.length,
      gapSalienceIndex: salience,
      memoryFacilitationMultiplier: mult,
      isResolved,
      epistemicDriveStatus: driveStatus,
    }
  }, [baseK, mystery, revealedClueIds, isResolved])

  // Authoritative evaluation through the hub transport (POST /api/curiosity
  // `action:metrics`): the handler runs Loewenstein's inverted-U, the Kang
  // memory facilitation multiplier and the drive-status classifier. The query
  // is keyed on the full input so each clue reveal / knowledge simulation
  // reconciles; until it lands (or forever, if the API is unreachable) the
  // identical local mirror above shows — the HUD never flickers.
  const metricsInput = useMemo(
    () => ({
      mysteryId: mystery.id,
      priorKnowledgeLevel: baseK,
      cluesRevealedCount: revealedClueIds.size,
      isResolved,
    }),
    [mystery, baseK, revealedClueIds, isResolved],
  )
  // The metrics request is keyed on its serialized inputs ({mysteryId,
  // priorKnowledgeLevel, cluesRevealedCount, isResolved}); a response is
  // applied only while its key still matches the current inputs, so a stale
  // in-flight response can never render for newer inputs — the identical
  // local mirror covers the in-flight window (values are deterministic, so
  // the substitution is never visible).
  const [apiMetrics, setApiMetrics] = useState<{ key: string; metrics: CuriosityMetrics } | null>(
    null,
  )
  const metricsKey = JSON.stringify(metricsInput)
  useEffect(() => {
    let stale = false
    apiSend<CuriosityMetricsResponse>('/api/curiosity', 'POST', {
      action: 'metrics',
      ...metricsInput,
    })
      .then((res) => {
        if (!stale && res?.metrics) setApiMetrics({ key: metricsKey, metrics: res.metrics })
      })
      .catch(() => {
        // Manual mode: the in-browser mirror already rendered these metrics.
      })
    return () => {
      stale = true
    }
  }, [metricsKey, metricsInput])
  const metrics: CuriosityMetrics =
    apiMetrics?.key === metricsKey ? apiMetrics.metrics : localMetrics

  // Play audio soundscapes
  const playAudioChime = (tone: 'clue' | 'success' | 'trap') => {
    void getSharedAudioContext()
      .then((ctx) => {
        if (!ctx || ctx.state === 'suspended') return

        const now = ctx.currentTime
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)

        if (tone === 'clue') {
          osc.frequency.setValueAtTime(440, now)
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.15)
          gain.gain.setValueAtTime(0.08, now)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
          osc.start(now)
          osc.stop(now + 0.2)
        } else if (tone === 'success') {
          osc.frequency.setValueAtTime(523.25, now)
          osc.frequency.setValueAtTime(659.25, now + 0.1)
          osc.frequency.setValueAtTime(783.99, now + 0.2)
          gain.gain.setValueAtTime(0.1, now)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
          osc.start(now)
          osc.stop(now + 0.4)
        } else {
          osc.type = 'sawtooth'
          osc.frequency.setValueAtTime(180, now)
          osc.frequency.linearRampToValueAtTime(120, now + 0.2)
          gain.gain.setValueAtTime(0.08, now)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
          osc.start(now)
          osc.stop(now + 0.25)
        }
      })
      .catch(() => {
        // Audio autoplay gracefully suppressed
      })
  }

  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  // Handle clue revelation
  const handleRevealClue = (clueId: string) => {
    hapticMedium()
    playAudioChime('clue')
    setRevealedClueIds((prev) => {
      const next = new Set(prev)
      next.add(clueId)
      return next
    })
    triggerToast('Progressive clue revealed! Epistemic gap narrowed.')
  }

  // Handle resolution hypothesis check — stays client-side deliberately: the
  // result is a lookup into the resolver-option content (no engine math), and
  // the multiplier mirrors the studio's historical pre-resolution peak. The
  // engine's own stateful resolution (post-closure knowledge bump and
  // re-derived multiplier) is exposed headless via POST action:resolve.
  const handleSelectResolver = (optionId: string) => {
    const opt = mystery.resolverOptions.find((o) => o.id === optionId)
    if (!opt) return

    setSelectedResolverId(optionId)
    const result: MysteryResolutionResult = {
      isAccurate: opt.isAccurateResolution,
      score: opt.epistemicClosureScore,
      feedback: opt.explanatoryFeedback,
      conceptualShift: opt.conceptualShiftSummary,
      memoryFacilitationMultiplier: opt.isAccurateResolution
        ? metrics.memoryFacilitationMultiplier
        : 1.0,
    }
    setResolutionResult(result)

    if (opt.isAccurateResolution) {
      hapticHeavy()
      playAudioChime('success')
      triggerToast('Epistemic closure achieved! Incongruity resolved.')
    } else {
      hapticLight()
      playAudioChime('trap')
      triggerToast('Cognitive trap triggered. Re-examine the progressive clues.')
    }
  }

  // Handle reset
  const handleReset = () => {
    hapticLight()
    setRevealedClueIds(new Set())
    setSelectedResolverId(null)
    setResolutionResult(null)
    setSimulatedKnowledge(null)
    triggerToast('Information gap session reset.')
  }

  // FSRS Flashcard export — stays client-side: it composes mystery content
  // (sourced from the catalog GET) with the API-reconciled multiplier and the
  // studio's bespoke retention note; the engine's own session export is
  // exposed headless via POST action:fsrsCards.
  const exportedCards: readonly FSRSCuriosityCard[] = useMemo(() => {
    return [
      {
        id: `fsrs_curiosity_${mystery.id}`,
        mysteryId: mystery.id,
        paradoxHook: mystery.paradoxHook,
        informationGapPrompt: `[Epistemic Information Gap: ${mystery.title}]\n${mystery.epistemicDeprivationQuestion}`,
        resolutionInsight: mystery.targetResolutionInsight,
        counterIntuitiveTwist: mystery.initialIntuitionTrap,
        kangDopamineRetentionNote:
          'Min Jeong Kang et al. (2009, Neuron): Striatal dopaminergic reward priming enhances long-term memory consolidation.',
        recommendedStabilityMultiplier: metrics.memoryFacilitationMultiplier,
      },
    ]
  }, [mystery, metrics.memoryFacilitationMultiplier])

  const handleCopyDeck = () => {
    hapticLight()
    navigator.clipboard.writeText(JSON.stringify(exportedCards, null, 2))
    triggerToast('Copied FSRS Epistemic Curiosity cards to clipboard!')
  }

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 px-4 py-2.5 text-xs shadow-lg transition-all animate-fade-in">
          {toastMessage}
        </div>
      )}

      {/* Header & Mystery Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-neutral-200/80 dark:border-(--hub-border)/80 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-strong flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            Epistemic Curiosity &amp; Information Gap Studio
          </h2>
          <p className="text-xs text-secondary mt-0.5">
            George Loewenstein (1994) • Daniel Berlyne (1960) • Min Jeong Kang et al. (2009 Neuron)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="mystery-select" className="text-xs font-medium text-secondary">
            Paradox Suite:
          </label>
          <select
            id="mystery-select"
            value={selectedMysteryId}
            onChange={(e) => {
              setSelectedMysteryId(e.target.value)
              handleReset()
            }}
            className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-3 py-1.5 text-xs font-medium text-strong shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {mysteries.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>

          <Button variant="ghost" onClick={handleReset} title="Reset session">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Top HUD: Loewenstein & Kang Dynamics */}
      <InformationGapHUD
        metrics={metrics}
        collativeVariable={mystery.collativeVariable}
        currentMysteryTitle={mystery.title}
        onKnowledgeAdjust={(k) => setSimulatedKnowledge(k)}
      />

      {/* Navigation Tabs */}
      <div className="flex border-b border-neutral-200/80 dark:border-(--hub-border)/80 text-sm font-medium overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        <button
          type="button"
          onClick={() => setActiveTab('clues')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'clues'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <HelpCircle className="h-4 w-4" />
          Paradox Hook &amp; Clues ({revealedClueIds.size}/{mystery.clues.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('crucible')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'crucible'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <Flame className="h-4 w-4" />
          Incongruity Crucible{' '}
          {metrics.isResolved && (
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <Brain className="h-4 w-4" />
          Collative Variables &amp; Dopamine
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
          FSRS Curiosity Deck ({exportedCards.length})
        </button>
      </div>

      {/* TAB 1: PARADOX HOOK & PROGRESSIVE CLUES */}
      {activeTab === 'clues' && (
        <div className="space-y-6 animate-fade-in">
          {/* Paradox Card */}
          <Panel className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200/80 dark:border-(--hub-border)/80 pb-3">
              <div className="space-y-0.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Loewenstein Epistemic Deprivation Hook
                </span>
                <h3 className="text-base font-bold text-strong">{mystery.title}</h3>
              </div>
              <Badge tone="accent">{mystery.domain}</Badge>
            </div>

            {/* Paradox statement */}
            <div className="rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2) p-4 space-y-2 text-xs">
              <span className="font-semibold text-strong flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-status-warning-text" />
                The Paradox Hook:
              </span>
              <p className="text-secondary leading-relaxed italic">{mystery.paradoxHook}</p>
            </div>

            {/* Initial Folk Intuition Trap */}
            <div className="rounded-xl border border-rose-500/20 bg-rose-50 dark:bg-rose-950/20 p-4 space-y-1.5 text-xs">
              <span className="font-semibold text-danger-text dark:text-danger-text flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" />
                Initial Folk Intuition Trap (The Cognitive Bias):
              </span>
              <p className="text-secondary leading-relaxed">{mystery.initialIntuitionTrap}</p>
            </div>

            {/* Burning Epistemic Deprivation Question */}
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-1.5 text-xs">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <HelpCircle className="h-4 w-4" />
                The Core Information Gap Question:
              </span>
              <p className="text-strong font-medium leading-relaxed">
                {mystery.epistemicDeprivationQuestion}
              </p>
            </div>
          </Panel>

          {/* Progressive Clues Accordion / Timeline */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-strong flex items-center gap-1.5">
                  <Compass className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  Progressive Clue Disclosures ({revealedClueIds.size}/{mystery.clues.length}{' '}
                  Disclosed)
                </h3>
                <p className="text-xs text-secondary">
                  Each revealed clue sharpens the information gap and stimulates anticipatory
                  dopamine release.
                </p>
              </div>

              {revealedClueIds.size < mystery.clues.length && (
                <Button
                  variant="primary"
                  onClick={() => {
                    const nextClue = mystery.clues.find((c) => !revealedClueIds.has(c.id))
                    if (nextClue) handleRevealClue(nextClue.id)
                  }}
                  className="px-3 py-1.5 text-xs"
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  Reveal Next Clue
                </Button>
              )}
            </div>

            <div className="space-y-4">
              {mystery.clues.map((clue) => {
                const isRevealed = revealedClueIds.has(clue.id)

                return (
                  <Panel key={clue.id} className="p-4 space-y-3 text-xs">
                    <div className="flex items-center justify-between border-b border-neutral-200/80 dark:border-(--hub-border)/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/10 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                          {clue.order}
                        </span>
                        <span className="font-bold text-strong">{clue.title}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge tone={isRevealed ? 'success' : 'neutral'}>
                          {isRevealed ? 'Revealed' : 'Locked'}
                        </Badge>
                        {!isRevealed && (
                          <Button
                            variant="secondary"
                            onClick={() => handleRevealClue(clue.id)}
                            className="px-2.5 py-1 text-xs"
                          >
                            Reveal Clue
                          </Button>
                        )}
                      </div>
                    </div>

                    {isRevealed ? (
                      <div className="space-y-2.5 animate-fade-in">
                        <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) p-3 text-secondary leading-relaxed border border-neutral-200/60 dark:border-(--hub-border)/60">
                          <strong className="text-strong block pb-1">
                            Revealed Scientific Fact:
                          </strong>
                          {clue.revealedFact}
                        </div>

                        {/* Cognitive Dissonance Prompt */}
                        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 space-y-1">
                          <span className="font-semibold text-status-warning-text flex items-center gap-1">
                            <Zap className="h-3.5 w-3.5" />
                            Cognitive Dissonance Spike:
                          </span>
                          <p className="text-secondary leading-relaxed">
                            {clue.cognitiveDissonancePrompt}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="py-2 text-center text-tertiary italic">
                        Clue hidden. Click "Reveal Clue" to uncover empirical evidence narrowing the
                        gap.
                      </div>
                    )}
                  </Panel>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INCONGRUITY RESOLUTION CRUCIBLE */}
      {activeTab === 'crucible' && (
        <div className="space-y-6 animate-fade-in">
          <Panel className="p-5 space-y-4">
            <div className="border-b border-neutral-200/80 dark:border-(--hub-border)/80 pb-3">
              <h3 className="text-base font-bold text-strong flex items-center gap-2">
                <Flame className="h-5 w-5 text-status-warning-text" />
                Epistemic Incongruity Resolution Crucible
              </h3>
              <p className="text-xs text-secondary mt-0.5">
                Select the theoretical hypothesis that resolves the paradox without violating
                structural physical laws.
              </p>
            </div>

            {/* Burning Question Reminder */}
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3.5 text-xs">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 block pb-1">
                Core Deprivation Question:
              </span>
              <p className="text-strong font-medium">{mystery.epistemicDeprivationQuestion}</p>
            </div>

            {/* Resolver Options */}
            <div className="space-y-3 pt-2">
              <span className="text-xs font-semibold text-strong block">
                Choose Your Resolution Hypothesis:
              </span>

              {mystery.resolverOptions.map((opt) => {
                const isSelected = selectedResolverId === opt.id

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectResolver(opt.id)}
                    className={`w-full text-left rounded-xl p-4 text-xs transition-all border ${
                      isSelected
                        ? opt.isAccurateResolution
                          ? 'border-emerald-500/50 bg-emerald-500/10 shadow-sm'
                          : 'border-rose-500/50 bg-rose-500/10 shadow-sm'
                        : 'border-neutral-200/80 dark:border-(--hub-border)/80 bg-white dark:bg-(--hub-panel) hover:bg-neutral-50 dark:hover:bg-(--hub-panel-2)'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-1.5">
                      <span className="font-bold text-strong flex items-center gap-1.5">
                        {isSelected && opt.isAccurateResolution && (
                          <CheckCircle2 className="h-4 w-4 text-status-success-text shrink-0" />
                        )}
                        {isSelected && !opt.isAccurateResolution && (
                          <AlertCircle className="h-4 w-4 text-danger-text shrink-0" />
                        )}
                        Hypothesis Option
                      </span>
                      {isSelected && (
                        <Badge tone={opt.isAccurateResolution ? 'success' : 'danger'}>
                          {opt.isAccurateResolution ? 'Accurate Resolution' : 'Cognitive Trap'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-secondary leading-relaxed">{opt.text}</p>
                  </button>
                )
              })}
            </div>

            {/* Resolution Feedback & Deep Explanation */}
            {resolutionResult && (
              <div className="space-y-4 pt-3 border-t border-neutral-200/80 dark:border-(--hub-border)/80 animate-fade-in text-xs">
                <div
                  className={`rounded-xl border p-4 space-y-2 ${
                    resolutionResult.isAccurate
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-rose-500/30 bg-rose-500/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-bold ${
                        resolutionResult.isAccurate
                          ? 'text-status-success-text dark:text-status-success-text'
                          : 'text-danger-text dark:text-danger-text'
                      }`}
                    >
                      {resolutionResult.isAccurate
                        ? 'Epistemic Satiation Achieved'
                        : 'Sub-Optimal Mental Model'}
                    </span>
                    <Badge tone={resolutionResult.isAccurate ? 'success' : 'danger'}>
                      Closure Score: {resolutionResult.score * 100}%
                    </Badge>
                  </div>
                  <p className="text-secondary leading-relaxed">{resolutionResult.feedback}</p>
                  <div className="pt-1 font-medium text-strong">
                    Conceptual Shift: {resolutionResult.conceptualShift}
                  </div>
                </div>

                {/* Deep Scientific Explanation */}
                {resolutionResult.isAccurate && (
                  <div className="rounded-xl border border-indigo-500/30 bg-neutral-50 dark:bg-(--hub-panel-2) p-4 space-y-2">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4" />
                      Comprehensive Scientific Closure:
                    </span>
                    <p className="text-secondary leading-relaxed">
                      {mystery.deepScientificExplanation}
                    </p>
                    <div className="rounded bg-indigo-500/10 p-2.5 font-mono text-[11px] text-strong">
                      Target Invariant Insight: {mystery.targetResolutionInsight}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* TAB 3: BERLYNE COLLATIVE VARIABLES & DOPAMINE AUDIT */}
      {activeTab === 'audit' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in text-xs">
          <Panel className="p-5 space-y-4">
            <h3 className="text-base font-bold text-strong flex items-center gap-2">
              <Compass className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              Daniel Berlyne’s 5 Collative Variables
            </h3>
            <p className="text-secondary">
              Berlyne (1960) established that exploratory epistemic curiosity is triggered by
              perceived structural properties of stimuli.
            </p>

            <div className="space-y-3 pt-1">
              <div
                className={`rounded-lg p-3 border ${
                  mystery.collativeVariable === 'incongruity'
                    ? 'border-indigo-500/40 bg-indigo-500/10'
                    : 'border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2)'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-strong">
                  <span>1. Incongruity (Current Focus):</span>
                  {mystery.collativeVariable === 'incongruity' && (
                    <Badge tone="accent">Active</Badge>
                  )}
                </div>
                <p className="text-secondary mt-1">
                  Mismatch between prior conceptual schemas and empirical observation (e.g.,
                  delayed-choice interference vs which-way path measurement).
                </p>
              </div>

              <div
                className={`rounded-lg p-3 border ${
                  mystery.collativeVariable === 'surprise'
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2)'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-strong">
                  <span>2. Surprise:</span>
                  {mystery.collativeVariable === 'surprise' && <Badge tone="warning">Active</Badge>}
                </div>
                <p className="text-secondary mt-1">
                  Direct disconfirmation of an explicit expectation, generating sudden cognitive
                  arousal and involuntary attentional capture.
                </p>
              </div>

              <div
                className={`rounded-lg p-3 border ${
                  mystery.collativeVariable === 'complexity'
                    ? 'border-violet-500/40 bg-violet-500/10'
                    : 'border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2)'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-strong">
                  <span>3. Complexity:</span>
                  {mystery.collativeVariable === 'complexity' && (
                    <Badge tone="violet">Active</Badge>
                  )}
                </div>
                <p className="text-secondary mt-1">
                  High density of non-linear interconnections requiring systematic schema
                  decomposition (e.g. antagonistic pleiotropy).
                </p>
              </div>

              <div
                className={`rounded-lg p-3 border ${
                  mystery.collativeVariable === 'ambiguity'
                    ? 'border-cyan-500/40 bg-cyan-500/10'
                    : 'border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2)'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-strong">
                  <span>4. Ambiguity:</span>
                  {mystery.collativeVariable === 'ambiguity' && <Badge tone="cyan">Active</Badge>}
                </div>
                <p className="text-secondary mt-1">
                  Equally plausible competing hypotheses with incomplete evidence (e.g. Fermi
                  Paradox and Great Filter placement).
                </p>
              </div>

              <div
                className={`rounded-lg p-3 border ${
                  mystery.collativeVariable === 'novelty'
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2)'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-strong">
                  <span>5. Novelty:</span>
                  {mystery.collativeVariable === 'novelty' && <Badge tone="success">Active</Badge>}
                </div>
                <p className="text-secondary mt-1">
                  Encounter with completely unprecedented stimuli that do not fit existing memory
                  taxonomies.
                </p>
              </div>
            </div>
          </Panel>

          <Panel className="p-5 space-y-4">
            <h3 className="text-base font-bold text-strong flex items-center gap-2">
              <Zap className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              Kang et al. (2009) Dopaminergic Striatum Model
            </h3>
            <p className="text-secondary">
              fMRI discoveries published in <em>Neuron</em> revealing how epistemic curiosity acts
              as "the wick in the candle of learning."
            </p>

            <div className="rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2) p-4 space-y-3">
              <div className="space-y-1">
                <span className="font-bold text-strong block">
                  1. Anticipatory Deprivation Phase:
                </span>
                <p className="text-secondary leading-relaxed">
                  When a learner recognizes an information gap, the bilateral dorsal striatum
                  (caudate nucleus and putamen) lights up, firing anticipatory dopamine even before
                  the answer is provided.
                </p>
              </div>

              <div className="space-y-1">
                <span className="font-bold text-strong block">
                  2. Hippocampal Memory Facilitation:
                </span>
                <p className="text-secondary leading-relaxed">
                  Striatal dopamine projects to the hippocampus and parahippocampal cortex.
                  Information revealed during peak curiosity is retained with up to{' '}
                  <strong className="text-indigo-600 dark:text-indigo-400">
                    85% higher fidelity
                  </strong>
                  , even on surprise delayed recall tests 2 weeks later.
                </p>
              </div>

              <div className="space-y-1">
                <span className="font-bold text-strong block">
                  3. Incidental Knowledge Priming:
                </span>
                <p className="text-secondary leading-relaxed">
                  Remarkably, the dopamine wash boosts memory not only for the answer to the
                  paradox, but for completely unrelated incidental material presented during the
                  arousal window.
                </p>
              </div>

              <div className="rounded-lg bg-indigo-500/10 p-3 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                Current Facilitation Factor: {metrics.memoryFacilitationMultiplier.toFixed(2)}x
                baseline stability.
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 4: FSRS CURIOSITY MICRO-DECK */}
      {activeTab === 'deck' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200/80 dark:border-(--hub-border)/80 pb-4">
            <div>
              <h3 className="text-sm font-bold text-strong flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                FSRS-6 Epistemic Curiosity Flashcards ({exportedCards.length} Cards)
              </h3>
              <p className="text-xs text-secondary">
                Curiosity-primed flashcards engineered with stability multiplier S₀ based on Kang et
                al. (2009).
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
                  <span className="font-semibold text-strong">Information Gap Front Prompt:</span>
                  <p className="text-secondary bg-neutral-50 dark:bg-(--hub-panel-2) p-2.5 rounded border border-neutral-200/60 dark:border-(--hub-border)/60 whitespace-pre-line font-mono text-[11px]">
                    {card.informationGapPrompt}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    Resolution Insight:
                  </span>
                  <p className="text-strong italic bg-indigo-500/5 p-2 rounded border border-indigo-500/20">
                    "{card.resolutionInsight}"
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="font-semibold text-danger-text dark:text-danger-text">
                    Initial Folk Intuition Trap:
                  </span>
                  <p className="text-secondary text-[11px]">{card.counterIntuitiveTwist}</p>
                </div>

                <div className="pt-1 text-[10px] text-tertiary border-t border-neutral-200/60 dark:border-(--hub-border)/60">
                  {card.kangDopamineRetentionNote}
                </div>
              </Panel>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
