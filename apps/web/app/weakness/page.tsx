'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  GitFork,
  Layers,
  Sparkles,
  Split,
} from 'lucide-react'
import type { ConfusionPair, TopicDecayForecast, LeechDecomposition } from '@learning-hub/core'
import { apiGet, apiSend } from '@/lib/transport'
import {
  Button,
  Callout,
  EmptyState,
  PageHeader,
  Panel,
  ProgressBar,
  Skeleton,
  Tabs,
  useToast,
} from '@/ui'
import Link from 'next/link'
import { GenerationPracticeModal } from '@/components/GenerationPracticeModal'
import { DualCodingCanvasStudio } from '@/components/DualCodingCanvasStudio'
import { ClayIn, Stagger, StaggerItem, staggerDelay } from '@/lib/motion'

interface WeaknessV2Data {
  ok: boolean
  confusionPairs: ConfusionPair[]
  topicForecasts: TopicDecayForecast[]
  leechDecompositions: LeechDecomposition[]
  totalCards: number
  leechCount: number
}

export default function WeaknessRadarPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'pairs' | 'forecast' | 'leeches'>('pairs')
  const [appliedCards, setAppliedCards] = useState<Set<number>>(new Set())
  const [generationTarget, setGenerationTarget] = useState<{
    concept: string
    explanation: string
    cardId?: number
  } | null>(null)
  const [dualCodingTarget, setDualCodingTarget] = useState<{
    concept: string
    explanation: string
    cardId?: number
  } | null>(null)

  const { data, isLoading, isError, refetch } = useQuery<WeaknessV2Data>({
    queryKey: ['curriculum', 'skills', 'weakness-v2'],
    queryFn: () => apiGet('/api/curriculum/skills/weakness-v2'),
  })

  const applyDecompMutation = useMutation({
    mutationFn: (variables: {
      cardId: number
      candidates: Array<{ front: string; back: string; format: 'basic' | 'cloze' }>
    }) =>
      apiSend('/api/curriculum/skills/weakness-v2', 'POST', {
        action: 'apply_decomposition',
        originalCardId: variables.cardId,
        candidates: variables.candidates,
      }),
    onSuccess: (_, variables) => {
      setAppliedCards((prev) => new Set([...prev, variables.cardId]))
      toast({
        title: 'Leech decomposed',
        description: `Created ${variables.candidates.length} atomic flashcards in your deck.`,
        tone: 'success',
      })
      void queryClient.invalidateQueries({ queryKey: ['curriculum', 'skills', 'weakness-v2'] })
    },
    onError: (err) => {
      toast({
        title: 'Failed to decompose card',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      })
    },
  })

  if (isLoading) {
    return (
      <div className="container max-w-4xl space-y-6 py-6">
        <PageHeader
          title="Weakness Radar v2"
          subtitle="Semantic interference, forward topic decay forecasts, and atomic leech decomposition."
        />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="container max-w-4xl space-y-6 py-6">
        <PageHeader
          title="Weakness Radar v2"
          subtitle="Semantic interference, forward topic decay forecasts, and atomic leech decomposition."
        />
        <EmptyState
          title="Failed to load weakness data"
          action={<Button onClick={() => void refetch()}>Retry</Button>}
        >
          Could not connect to the memory analytics engine. Please retry.
        </EmptyState>
      </div>
    )
  }

  const { confusionPairs, topicForecasts, leechDecompositions } = data

  return (
    // Entrance choreography: header and section controls rise + fade in on the
    // clay spring, 40ms apart (`staggerDelay`), total <300ms (motion law:
    // transform/opacity only, gated by `motionOK`). SSR renders the final
    // state; the animation is client-only, so hydration output is unchanged.
    // Loading skeleton and error EmptyState above stay instant — never
    // animated.
    <div className="container max-w-4xl space-y-6 py-6">
      <ClayIn>
        <PageHeader
          title="Weakness Radar v2"
          subtitle="Semantic interference matrix, forward retention decay forecasting, and 1-click leech atomic decomposition."
        />
      </ClayIn>

      {/* Top metric overview — the four stat panels cascade in (40ms steps,
          capped <300ms); StaggerItem is the grid cell so placement is intact. */}
      <Stagger className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StaggerItem index={0}>
          <Panel className="p-4 text-center">
            <div className="text-2xl font-bold text-status-warning-text">
              {confusionPairs.length}
            </div>
            <div className="text-xs text-tertiary">Confusion Pairs</div>
          </Panel>
        </StaggerItem>
        <StaggerItem index={1}>
          <Panel className="p-4 text-center">
            <div className="text-2xl font-bold text-danger-text">{data.leechCount}</div>
            <div className="text-xs text-tertiary">Active Leeches</div>
          </Panel>
        </StaggerItem>
        <StaggerItem index={2}>
          <Panel className="p-4 text-center">
            <div className="text-2xl font-bold text-ac-text">{topicForecasts.length}</div>
            <div className="text-xs text-tertiary">Tracked Topics</div>
          </Panel>
        </StaggerItem>
        <StaggerItem index={3}>
          <Panel className="p-4 text-center">
            <div className="text-2xl font-bold text-status-success-text">{data.totalCards}</div>
            <div className="text-xs text-tertiary">Total Cards</div>
          </Panel>
        </StaggerItem>
      </Stagger>

      <ClayIn delayS={staggerDelay(2)}>
        <Tabs
          label="Weakness Radar Sections"
          value={activeTab}
          onChange={(val) => setActiveTab(val)}
          items={[
            {
              key: 'pairs',
              label: `Confusion Pairs (${confusionPairs.length})`,
            },
            {
              key: 'forecast',
              label: `Retention Forecasts (${topicForecasts.length})`,
            },
            {
              key: 'leeches',
              label: `Leech Decomposer (${leechDecompositions.length})`,
            },
          ]}
        />
      </ClayIn>

      {/* TAB 1: CONFUSION PAIRS */}
      {activeTab === 'pairs' && (
        <div className="space-y-4">
          <Callout tone="accent" title="Semantic Interference (Underwood 1957)">
            When two similar concepts are reviewed in close temporal proximity, the memory traces
            interfere. The radar detects card pairs where failing Card A significantly correlates
            with failing Card B.
          </Callout>

          {confusionPairs.length === 0 ? (
            <EmptyState title="No confusion pairs detected">
              Keep reviewing cards! When sequential failures cluster around related cards, the radar
              will highlight interference pairs here.
            </EmptyState>
          ) : (
            /* Interference pair panels cascade in (40ms steps, capped <300ms);
               StaggerItem carries the list key and the space-y rhythm applies
               to it, Panel keeps its own classes. */
            <Stagger className="space-y-4">
              {confusionPairs.map((pair) => (
                <StaggerItem key={`${pair.cardIdA}-${pair.cardIdB}`}>
                  <Panel className="p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-2 dark:border-(--hub-border)">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-status-warning-text" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-tertiary">
                          {pair.failCoOccurrenceCount} Co-Occurring Lapses
                        </span>
                      </div>
                      <span className="text-xs font-medium text-status-warning-text dark:text-status-warning-text">
                        Interference Probability: {Math.round(pair.interferenceProbability * 100)}%
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900/50">
                        <div className="text-xs font-medium text-faint">
                          Card A (#{pair.cardIdA})
                        </div>
                        <div className="mt-1 text-sm font-medium">{pair.previewA}</div>
                      </div>
                      <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900/50">
                        <div className="text-xs font-medium text-faint">
                          Card B (#{pair.cardIdB})
                        </div>
                        <div className="mt-1 text-sm font-medium">{pair.previewB}</div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-indigo-50/70 p-3 text-xs text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
                      <div className="flex items-center gap-1.5 font-semibold mb-1">
                        <Sparkles className="h-3.5 w-3.5 text-ac-text" />
                        Contrast Drill Cue:
                      </div>
                      {pair.contrastPrompt}
                    </div>
                  </Panel>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      )}

      {/* TAB 2: RETENTION FORECAST */}
      {activeTab === 'forecast' && (
        <div className="space-y-4">
          <Callout tone="accent" title="FSRS Retrievability Decay Trajectory">
            Projects forward memory retrievability R(t) = (1 + factor * t / S)^(-0.5) over 7, 14,
            and 30 days if no reviews take place. Use this to prioritize decks before retention
            drops below 80%.
          </Callout>

          {topicForecasts.length === 0 ? (
            <EmptyState title="No topics available">
              Create decks or import courses to view topic retention trajectories.
            </EmptyState>
          ) : (
            /* Forecast panels cascade in (40ms steps, capped <300ms). */
            <Stagger className="space-y-4">
              {topicForecasts.map((topic) => {
                const cur = Math.round(topic.currentRetention * 100)
                const d7 = Math.round(topic.projectedRetention7d * 100)
                const d14 = Math.round(topic.projectedRetention14d * 100)
                const d30 = Math.round(topic.projectedRetention30d * 100)

                return (
                  <StaggerItem key={topic.deckId}>
                    <Panel className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Layers className="h-4 w-4 text-ac-text" />
                          <span className="font-semibold">{topic.deckName}</span>
                        </div>
                        {topic.urgentCardsCount > 0 && (
                          <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-danger-text dark:bg-rose-950/60 dark:text-danger-text">
                            {topic.urgentCardsCount} due now
                          </span>
                        )}
                      </div>

                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-tertiary">Current Retention:</span>
                          <span
                            className={`font-semibold ${cur >= 85 ? 'text-status-success-text' : cur >= 70 ? 'text-status-warning-text' : 'text-danger-text'}`}
                          >
                            {cur}%
                          </span>
                        </div>
                        <ProgressBar value={cur} className="h-2" />

                        <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
                          <div className="rounded bg-neutral-50 p-2 dark:bg-neutral-900/50">
                            <div className="text-[10px] text-faint">In 7 Days</div>
                            <div
                              className={`font-semibold ${d7 >= 80 ? 'text-status-success-text' : 'text-status-warning-text'}`}
                            >
                              {d7}%
                            </div>
                          </div>
                          <div className="rounded bg-neutral-50 p-2 dark:bg-neutral-900/50">
                            <div className="text-[10px] text-faint">In 14 Days</div>
                            <div
                              className={`font-semibold ${d14 >= 75 ? 'text-status-success-text' : 'text-status-warning-text'}`}
                            >
                              {d14}%
                            </div>
                          </div>
                          <div className="rounded bg-neutral-50 p-2 dark:bg-neutral-900/50">
                            <div className="text-[10px] text-faint">In 30 Days</div>
                            <div
                              className={`font-semibold ${d30 >= 70 ? 'text-status-warning-text' : 'text-danger-text'}`}
                            >
                              {d30}%
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <Link
                          href={`/review?deckId=${topic.deckId}`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          Review Deck <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </Panel>
                  </StaggerItem>
                )
              })}
            </Stagger>
          )}
        </div>
      )}

      {/* TAB 3: LEECH ATOMIC DECOMPOSER */}
      {activeTab === 'leeches' && (
        <div className="space-y-4">
          <Callout tone="accent" title="Wozniak's Rule 1: Minimum Information Principle">
            Leeches occur when cards encode multiple facts simultaneously or lack clear retrieval
            cues. The decomposer breaks complex cards into single-fact atomic cards to eliminate
            cognitive bottlenecks.
          </Callout>

          {leechDecompositions.length === 0 ? (
            <EmptyState title="No leeches found">
              None of your cards have reached 5 lapses. Great retention!
            </EmptyState>
          ) : (
            /* Leech panels cascade in (40ms steps, capped <300ms). */
            <Stagger className="space-y-4">
              {leechDecompositions.map((leech) => {
                const isDone = appliedCards.has(leech.cardId)
                return (
                  <StaggerItem key={leech.cardId}>
                    <Panel className="p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-2 dark:border-(--hub-border)">
                        <div className="flex items-center gap-2">
                          <Split className="h-4 w-4 text-danger-text" />
                          <span className="text-xs font-semibold text-danger-text dark:text-danger-text">
                            Leech Card #{leech.cardId} · {leech.lapses} Lapses
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setGenerationTarget({
                                concept: leech.originalFront,
                                explanation: leech.originalBack,
                                cardId: leech.cardId,
                              })
                            }
                            className="px-2 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition"
                            title="Generate 4-tier ladder"
                          >
                            <Sparkles className="h-3 w-3 inline mr-1" />
                            Ladder
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDualCodingTarget({
                                concept: leech.originalFront,
                                explanation: leech.originalBack,
                                cardId: leech.cardId,
                              })
                            }
                            className="px-2 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition"
                            title="Create visual anchor sketch"
                          >
                            <Layers className="h-3 w-3 inline mr-1" />
                            Dual-Code
                          </button>
                          {isDone ? (
                            <span className="flex items-center gap-1 text-xs text-status-success-text dark:text-status-success-text font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Decomposed
                            </span>
                          ) : (
                            <Button
                              onClick={() =>
                                applyDecompMutation.mutate({
                                  cardId: leech.cardId,
                                  candidates: leech.candidates,
                                })
                              }
                              disabled={applyDecompMutation.isPending}
                            >
                              <GitFork className="h-3.5 w-3.5 mr-1" />
                              Apply Split ({leech.candidates.length} Cards)
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg bg-neutral-50 p-3 text-xs dark:bg-neutral-900/50">
                        <div className="font-semibold text-faint mb-1">Overloaded Leech:</div>
                        <div className="font-medium text-sm text-neutral-800 dark:text-neutral-200">
                          {leech.originalFront}
                        </div>
                        <div className="mt-1 text-neutral-600 dark:text-faint border-t border-neutral-200 pt-1 dark:border-neutral-800">
                          {leech.originalBack}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wider text-tertiary">
                          Proposed Atomic Replacements:
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {leech.candidates.map((cand, idx) => (
                            <div
                              key={idx}
                              className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-2.5 text-xs dark:border-indigo-950/60 dark:bg-indigo-950/20"
                            >
                              <div className="font-semibold text-indigo-700 dark:text-indigo-300">
                                {cand.front}
                              </div>
                              <div className="mt-1 text-neutral-700 dark:text-secondary">
                                {cand.back}
                              </div>
                              <div className="mt-1.5 text-[10px] text-faint italic">
                                {cand.rationale}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Panel>
                  </StaggerItem>
                )
              })}
            </Stagger>
          )}
        </div>
      )}

      {generationTarget && (
        <GenerationPracticeModal
          isOpen={true}
          onClose={() => setGenerationTarget(null)}
          initialConcept={generationTarget.concept}
          initialExplanation={generationTarget.explanation}
          cardId={generationTarget.cardId}
        />
      )}

      {dualCodingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <DualCodingCanvasStudio
              isOpen={true}
              onClose={() => setDualCodingTarget(null)}
              initialConcept={dualCodingTarget.concept}
              initialVerbalText={dualCodingTarget.explanation}
              cardId={dualCodingTarget.cardId}
            />
          </div>
        </div>
      )}
    </div>
  )
}
