'use client'

/**
 * Prototype & Exemplar Categorization Studio
 *
 * A 4-phase macro-script grounded in Rosch (1975), Rosch & Mervis (1975),
 * Posner & Keele (1968/1970), Medin & Schaffer (1978), Nosofsky (1986) and
 * Ashby & Gott (1988):
 *   Phase 1 — Study: exemplars of both categories with their features.
 *   Phase 2 — Rate: typicality ratings on Rosch's 1-7 scale (TSC).
 *   Phase 3 — Classify: old + never-seen transfer items (CTS).
 *   Phase 4 — Insight: formal model comparison, diagnostic trials, FSRS deck.
 *
 * No AI dependency: every computation is the pure core engine, computed by the
 * runtime-neutral handler and mirrored by an in-browser fallback so the
 * studio works with the API unreachable (manual-mode guarantee, AGENTS.md
 * rule 9). All transport goes through `@/lib/transport` only.
 */

import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  CANONICAL_CATEGORIZATION_SETS,
  evaluateCategorizationSession,
  generateCategorizationDeck,
  planDiscriminatingBlock,
  type CategorizationDeck,
  type CategorizationEvaluation,
  type CategorizationSubmissionInput,
  type Category,
  type CategorySet,
  type DiscriminatingTrialPlan,
} from '@learning-hub/core'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, Button, Callout, Panel, Skeleton, Tabs } from '@/ui'
import { PrototypeExemplarHud } from '../ui/PrototypeExemplarHud'
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Layers,
  Scale,
  Shapes,
  Sparkles,
  Target,
} from 'lucide-react'

type PhaseKey = 'study' | 'rate' | 'classify' | 'insight'

const RATING_LABELS: Record<number, string> = {
  1: 'very good',
  2: 'good',
  3: 'fair',
  4: 'moderate',
  5: 'poor',
  6: 'very poor',
  7: 'borderline',
}

interface EvaluateResponse {
  ok: boolean
  evaluation: CategorizationEvaluation
}
interface PlanResponse {
  ok: boolean
  plan: DiscriminatingTrialPlan
}
interface DeckResponse {
  ok: boolean
  deck: CategorizationDeck
}

export function PrototypeExemplarStudio() {
  // Canonical sets ship with the bundle; the GET call keeps the API surface
  // exercised and picks up server-side scenario data when available.
  const setsQuery = useQuery({
    queryKey: ['prototype-exemplar', 'sets'],
    queryFn: async (): Promise<CategorySet[]> => {
      try {
        const res = await apiGet<{ ok: boolean; scenarios: CategorySet[] }>(
          '/api/prototype-exemplar',
        )
        return res.scenarios ?? CANONICAL_CATEGORIZATION_SETS
      } catch {
        return CANONICAL_CATEGORIZATION_SETS
      }
    },
    initialData: CANONICAL_CATEGORIZATION_SETS,
  })
  const sets = setsQuery.data ?? CANONICAL_CATEGORIZATION_SETS

  const [selectedSetId, setSelectedSetId] = useState<string>(CANONICAL_CATEGORIZATION_SETS[0]!.id)
  const [activePhase, setActivePhase] = useState<PhaseKey>('study')
  const [typicalityRatings, setTypicalityRatings] = useState<Record<string, number>>({})
  const [classifications, setClassifications] = useState<Record<string, Category>>({})
  const [evaluation, setEvaluation] = useState<CategorizationEvaluation | null>(null)
  const [trialPlan, setTrialPlan] = useState<DiscriminatingTrialPlan | null>(null)
  const [deck, setDeck] = useState<CategorizationDeck | null>(null)

  const activeSet: CategorySet = useMemo(
    () => sets.find((s) => s.id === selectedSetId) ?? sets[0]!,
    [sets, selectedSetId],
  )
  const ratedCount = Object.keys(typicalityRatings).length
  const classifiedCount = Object.keys(classifications).length
  const hasSubmission = ratedCount > 0 || classifiedCount > 0

  const selectSet = (set: CategorySet) => {
    setSelectedSetId(set.id)
    setActivePhase('study')
    setTypicalityRatings({})
    setClassifications({})
    setEvaluation(null)
    setTrialPlan(null)
    setDeck(null)
  }

  const buildSubmission = (): CategorizationSubmissionInput => ({
    setId: activeSet.id,
    typicalityRatings,
    classifications,
  })

  // Evaluate — API first, pure-engine fallback (works with provider `none`).
  const evaluateMutation = useMutation({
    mutationFn: async (): Promise<CategorizationEvaluation> => {
      try {
        const res = await apiSend<EvaluateResponse>('/api/prototype-exemplar', 'POST', {
          action: 'evaluate',
          submission: buildSubmission(),
        })
        if (res?.evaluation) return res.evaluation
      } catch {
        // fall through to local computation
      }
      return evaluateCategorizationSession(activeSet, buildSubmission())
    },
    onSuccess: (result) => {
      setEvaluation(result)
      setActivePhase('insight')
    },
  })

  // Diagnostic trial plan — same API-first/fallback contract.
  const planMutation = useMutation({
    mutationFn: async (): Promise<DiscriminatingTrialPlan> => {
      try {
        const res = await apiSend<PlanResponse>('/api/prototype-exemplar', 'POST', {
          action: 'plan',
          setId: activeSet.id,
          maxTrials: 6,
        })
        if (res?.plan) return res.plan
      } catch {
        // fall through to local computation
      }
      return planDiscriminatingBlock(activeSet, 6)
    },
    onSuccess: (plan) => setTrialPlan(plan),
  })

  // FSRS deck synthesis — same API-first/fallback contract.
  const deckMutation = useMutation({
    mutationFn: async (): Promise<CategorizationDeck> => {
      const currentEvaluation =
        evaluation ?? evaluateCategorizationSession(activeSet, buildSubmission())
      try {
        const res = await apiSend<DeckResponse>('/api/prototype-exemplar', 'POST', {
          action: 'deck',
          setId: activeSet.id,
          criBaseline: currentEvaluation.cri,
        })
        if (res?.deck) return res.deck
      } catch {
        // fall through to local computation
      }
      return generateCategorizationDeck(activeSet, currentEvaluation)
    },
    onSuccess: (result) => setDeck(result),
  })

  const setRating = (stimulusId: string, rating: number) => {
    setTypicalityRatings((prev) => ({ ...prev, [stimulusId]: rating }))
  }
  const setClassification = (stimulusId: string, category: Category) => {
    setClassifications((prev) => ({ ...prev, [stimulusId]: category }))
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <Panel className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone="accent">
                Rosch (1975) · Rosch &amp; Mervis (1975) · Nosofsky (1986)
              </Badge>
              <span className="text-xs text-tertiary">Categorization Studio</span>
            </div>
            <h1 className="mt-1 text-lg font-bold text-strong sm:text-xl">
              Prototype &amp; Exemplar Categorization Studio
            </h1>
          </div>
          <Button
            variant="primary"
            onClick={() => evaluateMutation.mutate()}
            disabled={evaluateMutation.isPending || !hasSubmission}
          >
            {evaluateMutation.isPending ? 'Analyzing…' : 'Evaluate Session'}
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-secondary">
          Categories have internal structure: a robin is a better bird than a penguin, an unseen
          center can be abstracted from distorted patterns, and stored exceptions can outpredict a
          category average (Rosch 1975; Posner &amp; Keele 1970; Medin &amp; Schaffer 1978). Study
          the exemplars, rate typicality, classify old and never-seen items — the engine then fits
          both formal representations to YOUR responses.
        </p>
        {!hasSubmission && (
          <Callout tone="accent">
            Nothing submitted yet — rate at least three items in Phase 2 and classify a few in Phase
            3, then run the evaluation.
          </Callout>
        )}
        {evaluateMutation.isError && (
          <Callout tone="danger">
            Evaluation failed — the local engine fallback also errored. Check the console and try
            again.
          </Callout>
        )}
      </Panel>

      {/* Scenario selector */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {sets.map((set) => {
          const isSelected = set.id === activeSet.id
          return (
            <button
              key={set.id}
              type="button"
              onClick={() => selectSet(set)}
              aria-pressed={isSelected}
              className={`min-h-11 rounded-lg border p-3 text-left transition-colors ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                  : 'border-neutral-200 hover:bg-neutral-50 dark:border-(--hub-border) dark:hover:bg-(--hub-panel-2)'
              }`}
            >
              <span className="flex items-center justify-between text-[11px] font-medium text-tertiary">
                <span className="uppercase">{set.difficulty}</span>
                <span>{set.structureKind.replace(/_/g, ' ')}</span>
              </span>
              <span className="mt-1 block text-xs font-bold text-strong">{set.title}</span>
            </button>
          )
        })}
      </div>

      {/* Phase tabs */}
      <Tabs<PhaseKey>
        label="Categorization studio phases"
        value={activePhase}
        onChange={setActivePhase}
        items={[
          { key: 'study', label: '1 · Study', icon: <BookOpen className="h-3.5 w-3.5" /> },
          { key: 'rate', label: '2 · Rate Typicality', icon: <Sparkles className="h-3.5 w-3.5" /> },
          { key: 'classify', label: '3 · Classify', icon: <Target className="h-3.5 w-3.5" /> },
          { key: 'insight', label: '4 · Insight & Deck', icon: <Scale className="h-3.5 w-3.5" /> },
        ]}
      />

      {/* PHASE 1 — Study */}
      {activePhase === 'study' && (
        <div className="space-y-4">
          <Panel title={`Exemplar Study: ${activeSet.title}`} className="space-y-3">
            <p className="text-xs leading-relaxed text-secondary">{activeSet.pedagogicalFraming}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {(['A', 'B'] as const).map((category) => (
                <div
                  key={category}
                  className="rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)"
                >
                  <Badge tone={category === 'A' ? 'accent' : 'neutral'}>
                    {activeSet.categoryLabels[category]}
                  </Badge>
                  <div className="mt-2 space-y-2">
                    {activeSet.studyItems
                      .filter((s) => s.category === category)
                      .map((stimulus) => (
                        <div
                          key={stimulus.id}
                          className="rounded border border-neutral-200 p-2 text-xs dark:border-(--hub-border)"
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-strong">{stimulus.label}</span>
                            {stimulus.normativeTypicality !== undefined && (
                              <span className="text-tertiary">
                                Rosch norm {stimulus.normativeTypicality.toFixed(2)}
                              </span>
                            )}
                          </span>
                          <FeatureRow set={activeSet} features={stimulus.features} />
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setActivePhase('rate')}>
                Next: Rate Typicality <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* PHASE 2 — Rate typicality */}
      {activePhase === 'rate' && (
        <Panel
          title="Typicality Ratings (Rosch 1975 scale)"
          actions={<Badge tone={ratedCount >= 3 ? 'success' : 'warning'}>{ratedCount} rated</Badge>}
          className="space-y-3"
        >
          <p className="text-xs leading-relaxed text-secondary">
            Rate how good an example of its category each item is: 1 = very good example, 7 = very
            poor example (Rosch 1975). Rate at least 3 items — the engine correlates your gradient
            with the norms and with family-resemblance predictions.
          </p>
          <div className="space-y-2">
            {activeSet.testItems.map((stimulus) => (
              <div
                key={stimulus.id}
                className="rounded-lg border border-neutral-200 p-2.5 dark:border-(--hub-border)"
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-strong">{stimulus.label}</span>
                  <span className="text-[11px] text-tertiary">
                    {activeSet.categoryLabels[stimulus.category]}
                    {stimulus.isTransfer ? ' · never studied' : ''}
                  </span>
                </div>
                <div
                  className="mt-2 flex flex-wrap gap-1.5"
                  role="group"
                  aria-label={`Rate ${stimulus.label}`}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((rating) => {
                    const selected = typicalityRatings[stimulus.id] === rating
                    return (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => setRating(stimulus.id, rating)}
                        aria-pressed={selected}
                        title={`${rating} — ${RATING_LABELS[rating]}`}
                        className={`h-11 w-11 rounded-lg border text-xs font-semibold transition-colors ${
                          selected
                            ? 'border-indigo-500 bg-indigo-600 text-white'
                            : 'border-neutral-200 text-secondary hover:bg-neutral-50 dark:border-(--hub-border) dark:hover:bg-(--hub-panel-2)'
                        }`}
                      >
                        {rating}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => setActivePhase('classify')}>
              Next: Classify Items <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </Panel>
      )}

      {/* PHASE 3 — Classify */}
      {activePhase === 'classify' && (
        <Panel
          title="Classification Trials (old + transfer)"
          actions={
            <Badge tone={classifiedCount > 0 ? 'success' : 'warning'}>
              {classifiedCount} classified
            </Badge>
          }
          className="space-y-3"
        >
          <p className="text-xs leading-relaxed text-secondary">
            Assign each item to a category. Old items were studied; transfer items are NEW — your
            accuracy on them is the generalization metric (Posner &amp; Keele 1970). Response
            patterns are fitted against both formal models, so respond as you truly believe, not by
            pattern-matching to "correct" answers.
          </p>
          {setsQuery.isPending && (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}
          <div className="space-y-2">
            {activeSet.testItems.map((stimulus) => {
              const chosen = classifications[stimulus.id]
              return (
                <div
                  key={stimulus.id}
                  className="rounded-lg border border-neutral-200 p-2.5 dark:border-(--hub-border)"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-strong">{stimulus.label}</span>
                    <span className="text-[11px] text-tertiary">
                      {stimulus.isTransfer ? 'TRANSFER — never studied' : 'old item'}
                    </span>
                  </div>
                  <FeatureRow set={activeSet} features={stimulus.features} />
                  <div
                    className="mt-2 flex gap-2"
                    role="group"
                    aria-label={`Classify ${stimulus.label}`}
                  >
                    {(['A', 'B'] as const).map((category) => {
                      const selected = chosen === category
                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => setClassification(stimulus.id, category)}
                          aria-pressed={selected}
                          className={`min-h-11 flex-1 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                            selected
                              ? 'border-indigo-500 bg-indigo-600 text-white'
                              : 'border-neutral-200 text-secondary hover:bg-neutral-50 dark:border-(--hub-border) dark:hover:bg-(--hub-panel-2)'
                          }`}
                        >
                          {activeSet.categoryLabels[category]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => evaluateMutation.mutate()}
              disabled={evaluateMutation.isPending || classifiedCount === 0}
            >
              {evaluateMutation.isPending ? 'Analyzing…' : 'Submit & Analyze'}
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </Panel>
      )}

      {/* PHASE 4 — Insight & deck */}
      {activePhase === 'insight' && (
        <div className="space-y-4">
          {evaluation ? (
            <PrototypeExemplarHud evaluation={evaluation} setTitle={activeSet.title} />
          ) : (
            <Callout tone="accent">
              Run the evaluation (Phase 3 button or the header action) to unlock the model
              comparison, diagnostic items and telemetry.
            </Callout>
          )}

          <Panel
            title="Diagnostic Trial Planner"
            actions={
              <Button
                variant="secondary"
                onClick={() => planMutation.mutate()}
                disabled={planMutation.isPending}
              >
                {planMutation.isPending ? 'Planning…' : 'Plan 6 Trials'}
              </Button>
            }
            className="space-y-3"
          >
            <p className="text-xs leading-relaxed text-secondary">
              Trials where the prototype and exemplar models disagree are the only ones that can
              discriminate which representation you use (Medin &amp; Schaffer 1978 designed the 5-4
              structure exactly for this). Classify these first.
            </p>
            {planMutation.isPending && <Skeleton className="h-10 w-full" />}
            {planMutation.isError && (
              <Callout tone="danger">
                Trial planning failed — try again, or classify the transfer items directly in Phase
                3.
              </Callout>
            )}
            {trialPlan && (
              <div className="space-y-2">
                <p className="text-[11px] text-tertiary">{trialPlan.note}</p>
                {trialPlan.trials.map((trial, idx) => (
                  <div
                    key={trial.stimulusId}
                    className="rounded-lg border border-neutral-200 p-2.5 text-xs dark:border-(--hub-border)"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-semibold text-strong">
                        {idx + 1}. {trial.label}
                      </span>
                      <Badge tone={trial.isTransfer ? 'warning' : 'neutral'}>
                        {trial.isTransfer ? 'transfer' : 'old'} · split{' '}
                        {trial.divergence.toFixed(2)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-tertiary">
                      {trial.rationale}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="FSRS Review Deck"
            actions={
              <Button
                variant="secondary"
                onClick={() => deckMutation.mutate()}
                disabled={deckMutation.isPending}
              >
                {deckMutation.isPending ? 'Synthesizing…' : 'Generate Cards'}
              </Button>
            }
            className="space-y-3"
          >
            <p className="text-xs leading-relaxed text-secondary">
              Four cards — one per core phenomenon (typicality gradient, prototype abstraction,
              exemplar exceptions, attention strategy) — with stability scaled by your CRI.
            </p>
            {deckMutation.isPending && <Skeleton className="h-10 w-full" />}
            {deckMutation.isError && (
              <Callout tone="danger">
                Card synthesis failed — run the evaluation first, then try generating again.
              </Callout>
            )}
            {deck && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-[11px] text-tertiary">
                  <Layers className="h-3.5 w-3.5" aria-hidden />
                  {deck.cards.length} cards · CRI baseline {deck.criBaseline}/100
                </p>
                {deck.cards.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-lg border border-neutral-200 p-2.5 text-xs dark:border-(--hub-border)"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-semibold text-strong">
                        {card.cardType.replace(/_/g, ' ')}
                      </span>
                      <span className="text-tertiary">
                        S: {card.fsrsParameters.stability}d · D: {card.fsrsParameters.difficulty}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-secondary">{card.front}</p>
                    <p className="mt-1 whitespace-pre-line border-t border-neutral-200 pt-1 text-tertiary dark:border-(--hub-border)">
                      {card.back}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {evaluation && (
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => selectSet(activeSet)}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden /> Reset This Scenario
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Research footer — one quiet line, not a citation wall */}
      <p className="flex items-center gap-1.5 pb-2 text-[11px] text-tertiary">
        <Shapes className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Engine: family resemblance (Rosch &amp; Mervis 1975), GCM with attention fitting (Nosofsky
        1986), prototype abstraction (Posner &amp; Keele 1970), rule contrast (Ashby &amp; Gott
        1988).
      </p>
    </div>
  )
}

/** Compact feature readout: attribute pills for binary sets, labeled values otherwise. */
function FeatureRow({ set, features }: { set: CategorySet; features: number[] }) {
  const isBinary = features.every((v) => v === 0 || v === 1)
  if (!isBinary) {
    return (
      <div className="scroll-x mt-1 flex gap-2 text-[11px] text-tertiary">
        {features.map((value, dim) => (
          <span key={dim} className="shrink-0 whitespace-nowrap">
            {set.dimensionLabels[dim]?.split(' (')[0] ?? `dim ${dim + 1}`}: {value.toFixed(2)}
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {features.map((value, dim) => {
        const label = set.dimensionLabels[dim] ?? `dim ${dim + 1}`
        return (
          <span
            key={dim}
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              value >= 0.5
                ? 'bg-indigo-600/15 text-indigo-700 dark:text-indigo-300'
                : 'bg-neutral-100 text-neutral-500 dark:bg-(--hub-panel-2) dark:text-neutral-400'
            }`}
          >
            {value >= 0.5 ? '+' : '−'} {label}
          </span>
        )
      })}
    </div>
  )
}
