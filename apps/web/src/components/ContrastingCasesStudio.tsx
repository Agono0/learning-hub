/**
 * @file apps/web/src/components/ContrastingCasesStudio.tsx
 * @description Contrasting Cases & Inventing with Examples Interactive Studio.
 *
 * Grounded in Schwartz & Bransford (1998) "A Time for Telling" and Schwartz & Martin (2004).
 * Stages:
 * 1. Juxtaposed Contrasting Cases & Perceptual Feature Discrimination
 * 2. Invention of Metric / General Invariant Rule
 * 3. A Time for Telling (Canonical Lecture Reveal)
 * 4. Far Transfer Application & Calibrated FSRS-6 Review Deck
 *
 * Strict adherence to UI Signature: mode-aware tokens, zero ghost classes.
 */

'use client'

import React, { useState } from 'react'
import {
  CANONICAL_CONTRASTING_SETS,
  evaluateContrastingAttempt,
  generateContrastingFSRSDeck,
  type ContrastingCaseSet,
  type ContrastingEvaluation,
  type CalibratedContrastingDeck,
} from '@learning-hub/core/contrasting'
import { ContrastingCasesHUD } from '../ui/ContrastingCasesHUD'
import { Badge } from '../ui/Feedback'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { TextField } from '../ui/Field'
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileCheck,
  HelpCircle,
  Layers,
  Sliders,
  Sparkles,
} from 'lucide-react'

export function ContrastingCasesStudio() {
  const [selectedSetId, setSelectedSetId] = useState<string>(CANONICAL_CONTRASTING_SETS[0]!.id)
  const [activeTab, setActiveTab] = useState<'variants' | 'invention' | 'telling' | 'transfer'>(
    'variants',
  )

  const activeSet: ContrastingCaseSet =
    CANONICAL_CONTRASTING_SETS.find((s) => s.id === selectedSetId) ?? CANONICAL_CONTRASTING_SETS[0]!

  // Learner input state
  const [selectedDimensionIds, setSelectedDimensionIds] = useState<string[]>([])
  const [inventedMetricName, setInventedMetricName] = useState<string>('My Invented Rule')
  const [formulaDescription, setFormulaDescription] = useState<string>(
    'Divide mass by volume to see how tightly packed each unit of space is.',
  )
  const [orderedVariantIds, setOrderedVariantIds] = useState<string[]>(
    activeSet.variants.map((v) => v.id),
  )
  const [impasseEncountered, setImpasseEncountered] = useState<boolean>(true)
  const [reflectionNotes, setReflectionNotes] = useState<string>(
    'Comparing the extremes shows that heavy objects like large oak blocks can float if they occupy enough volume, while tiny lead sinks instantly.',
  )

  // Evaluation & Deck states
  const [evaluation, setEvaluation] = useState<ContrastingEvaluation>(() => {
    return evaluateContrastingAttempt(activeSet, {
      setId: activeSet.id,
      inventedMetricName: 'Initial Model',
      formulaDescription: 'Comparing mass and volume ratios.',
      selectedDimensionIds: ['dim-mass-vol-ratio'],
      variantRankings: activeSet.variants.map((v) => v.id),
      impasseEncountered: true,
      reflectionNotes: 'Initial exploration.',
    })
  })

  const [tellingRevealed, setTellingRevealed] = useState<boolean>(false)
  const [selectedTransferOption, setSelectedTransferOption] = useState<number | null>(null)
  const [transferSubmitted, setTransferSubmitted] = useState<boolean>(false)
  const [fsrsDeck, setFsrsDeck] = useState<CalibratedContrastingDeck | null>(null)

  const handleSelectSet = (setId: string) => {
    setSelectedSetId(setId)
    const nextSet =
      CANONICAL_CONTRASTING_SETS.find((s) => s.id === setId) ?? CANONICAL_CONTRASTING_SETS[0]!
    setSelectedDimensionIds([])
    setInventedMetricName('My Invariant Rule')
    setFormulaDescription('')
    setOrderedVariantIds(nextSet.variants.map((v) => v.id))
    setTellingRevealed(false)
    setSelectedTransferOption(null)
    setTransferSubmitted(false)
    setFsrsDeck(null)

    setEvaluation(
      evaluateContrastingAttempt(nextSet, {
        setId: nextSet.id,
        inventedMetricName: 'Exploratory Model',
        formulaDescription: 'Examining initial contrasting differences.',
        selectedDimensionIds: [],
        variantRankings: nextSet.variants.map((v) => v.id),
        impasseEncountered: true,
        reflectionNotes: 'Beginning case analysis.',
      }),
    )
  }

  const toggleDimension = (dimId: string) => {
    setSelectedDimensionIds((prev) =>
      prev.includes(dimId) ? prev.filter((id) => id !== dimId) : [...prev, dimId],
    )
  }

  const handleMoveVariant = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= orderedVariantIds.length) return
    const updated = [...orderedVariantIds]
    const temp = updated[index]!
    updated[index] = updated[targetIndex]!
    updated[targetIndex] = temp
    setOrderedVariantIds(updated)
  }

  const handleEvaluateInvention = () => {
    const evalResult = evaluateContrastingAttempt(activeSet, {
      setId: activeSet.id,
      inventedMetricName,
      formulaDescription,
      selectedDimensionIds,
      variantRankings: orderedVariantIds,
      impasseEncountered,
      reflectionNotes,
    })
    setEvaluation(evalResult)
  }

  const handleRevealTelling = () => {
    handleEvaluateInvention()
    setTellingRevealed(true)
    setActiveTab('telling')
  }

  const handleGenerateDeck = () => {
    const deck = generateContrastingFSRSDeck(activeSet, evaluation)
    setFsrsDeck(deck)
  }

  return (
    <div className="space-y-6">
      {/* Real-time Cognitive Telemetry HUD */}
      <ContrastingCasesHUD evaluation={evaluation} activeSetTitle={activeSet.title} />

      {/* Case Set Navigation & Mode Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
          {CANONICAL_CONTRASTING_SETS.map((set) => (
            <button
              key={set.id}
              onClick={() => handleSelectSet(set.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                selectedSetId === set.id
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-semibold'
                  : 'bg-surface hover:bg-surface-elevated text-secondary border border-neutral-200 dark:border-(--hub-border)'
              }`}
            >
              {set.title.split('&')[0]?.trim()}
            </button>
          ))}
        </div>

        <Badge tone="accent">PFL Preparation for Future Learning</Badge>
      </div>

      {/* Main Studio Navigation Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-(--hub-border) gap-2 text-xs">
        <button
          onClick={() => setActiveTab('variants')}
          className={`pb-2 px-3 font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
            activeTab === 'variants'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          1. Contrasting Cases &amp; Discrimination
        </button>

        <button
          onClick={() => setActiveTab('invention')}
          className={`pb-2 px-3 font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
            activeTab === 'invention'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <Sliders className="h-3.5 w-3.5" />
          2. Invent Metric / Rule
        </button>

        <button
          onClick={() => setActiveTab('telling')}
          className={`pb-2 px-3 font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
            activeTab === 'telling'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <BookOpen className="h-3.5 w-3.5" />
          3. A Time for Telling {tellingRevealed && '✓'}
        </button>

        <button
          onClick={() => setActiveTab('transfer')}
          className={`pb-2 px-3 font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
            activeTab === 'transfer'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
              : 'border-transparent text-secondary hover:text-strong'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          4. Far Transfer &amp; FSRS Deck
        </button>
      </div>

      {/* TAB 1: Juxtaposed Variants & Feature Discrimination */}
      {activeTab === 'variants' && (
        <div className="space-y-4">
          <Panel className="space-y-2">
            <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
              <Eye className="h-4 w-4 text-indigo-500" />
              Perceptual Feature Discrimination: Juxtaposed Case Variants
            </h3>
            <p className="text-xs text-secondary leading-relaxed">{activeSet.problemOverview}</p>
            <div className="rounded border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-950/20 p-2.5 text-xs text-secondary">
              <span className="font-semibold text-indigo-900 dark:text-indigo-200 block mb-0.5">
                Invention Challenge Prompt:
              </span>
              {activeSet.guidingInventionPrompt}
            </div>
          </Panel>

          {/* Variants Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeSet.variants.map((variant) => (
              <div
                key={variant.id}
                className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-strong">{variant.label}</span>
                  <Badge tone="neutral">
                    {variant.outcomeValue} {variant.outcomeUnit}
                  </Badge>
                </div>
                <p className="text-xs text-secondary leading-snug">{variant.description}</p>

                <div className="rounded bg-surface-elevated border border-neutral-200 dark:border-(--hub-border) p-2 text-[11px] space-y-1">
                  <span className="font-medium text-strong block">Measured Parameters:</span>
                  <div className="grid grid-cols-2 gap-1 text-secondary">
                    {Object.entries(variant.numericalParameters).map(([k, v]) => (
                      <span key={k}>
                        {k}: <strong className="text-strong">{v}</strong>
                      </span>
                    ))}
                  </div>
                </div>

                <p className="text-[11px] text-secondary italic border-l-2 border-indigo-500 pl-2">
                  &quot;{variant.visualHint}&quot;
                </p>
              </div>
            ))}
          </div>

          {/* Feature Dimensions Discrimination Checklist */}
          <Panel className="space-y-3">
            <h4 className="text-xs font-semibold text-strong flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-indigo-500" />
              Hypothesized Dimensions: Discriminate Deep Invariants from Surface Distractors
            </h4>
            <p className="text-xs text-secondary">
              Select which dimensions are mathematically critical for inventing your general rule:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeSet.dimensions.map((dim) => {
                const isSelected = selectedDimensionIds.includes(dim.id)
                return (
                  <div
                    key={dim.id}
                    onClick={() => toggleDimension(dim.id)}
                    className={`cursor-pointer rounded-lg border p-2.5 text-xs space-y-1 transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-neutral-200 dark:border-(--hub-border) bg-surface hover:bg-surface-elevated'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-strong">{dim.name}</span>
                      <Badge tone={isSelected ? 'accent' : 'neutral'}>
                        {isSelected ? 'Selected' : 'Unselected'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-secondary leading-snug">{dim.description}</p>
                  </div>
                )
              })}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setActiveTab('invention')} variant="primary">
                Next: Invent Rule &amp; Order Variants <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 2: Invent Metric / Rule */}
      {activeTab === 'invention' && (
        <div className="space-y-4">
          <Panel className="space-y-3">
            <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
              <Sliders className="h-4 w-4 text-indigo-500" />
              Invent Your Invariant Metric / Scoring Rule
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              Before learning the canonical textbook formula, invent your own mathematical index to
              coordinate all contrasting variants. Do not worry about matching the exact historical
              formula—the goal is to formulate a ratio or rule that orders the cases consistently.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField
                label="Invented Rule / Index Name"
                value={inventedMetricName}
                onChange={(e) => setInventedMetricName(e.target.value)}
                placeholder="e.g. Mass-to-Volume Density Ratio"
              />

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-strong">
                  Impasse &amp; Curiosity State
                </label>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="impasse-check"
                    checked={impasseEncountered}
                    onChange={(e) => setImpasseEncountered(e.target.checked)}
                    className="rounded border-neutral-300 dark:border-(--hub-border)"
                  />
                  <label htmlFor="impasse-check" className="text-xs text-secondary cursor-pointer">
                    Encountered genuine impasse or contradiction between cases (Essential for PFL)
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-strong">
                Mathematical Explanation of Your Invented Rule
              </label>
              <textarea
                value={formulaDescription}
                onChange={(e) => setFormulaDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-neutral-300 dark:border-(--hub-border) bg-surface px-3 py-2 text-xs text-strong"
                placeholder="Explain the mathematical operations (ratios, differences, thresholds) and why it works across edge cases..."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-strong">
                Curiosity &amp; Reflection Notes (What makes this hard?)
              </label>
              <textarea
                value={reflectionNotes}
                onChange={(e) => setReflectionNotes(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-neutral-300 dark:border-(--hub-border) bg-surface px-3 py-2 text-xs text-strong"
                placeholder="Document discrepancies you noticed between surface properties and true behavior..."
              />
            </div>
          </Panel>

          {/* Re-ordering Cases Stepper */}
          <Panel className="space-y-3">
            <h4 className="text-xs font-semibold text-strong flex items-center justify-between">
              <span>Order Variants from Lowest Value to Highest Value According to Your Rule:</span>
              <span className="text-[11px] text-secondary">
                Ranking Alignment: {evaluation.rankingAccuracy}%
              </span>
            </h4>

            <div className="space-y-1.5">
              {orderedVariantIds.map((varId, idx) => {
                const variant = activeSet.variants.find((v) => v.id === varId)!
                return (
                  <div
                    key={variant.id}
                    className="flex items-center justify-between rounded border border-neutral-200 dark:border-(--hub-border) p-2 bg-surface text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-secondary w-5">#{idx + 1}</span>
                      <span className="font-medium text-strong">{variant.label}</span>
                      <span className="text-secondary text-[11px]">
                        (
                        {Object.entries(variant.numericalParameters)
                          .map(([k, v]) => `${k}:${v}`)
                          .join(', ')}
                        )
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        onClick={() => handleMoveVariant(idx, 'up')}
                        disabled={idx === 0}
                        variant="secondary"
                      >
                        ↑
                      </Button>
                      <Button
                        onClick={() => handleMoveVariant(idx, 'down')}
                        disabled={idx === orderedVariantIds.length - 1}
                        variant="secondary"
                      >
                        ↓
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button onClick={handleEvaluateInvention} variant="secondary">
                Recalculate Telemetry
              </Button>

              <Button onClick={handleRevealTelling} variant="primary">
                Lock In &amp; Reveal &quot;A Time for Telling&quot;{' '}
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 3: A Time for Telling (Canonical Lecture Reveal) */}
      {activeTab === 'telling' && (
        <div className="space-y-4">
          <Panel className="space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <div>
                <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-emerald-500" />A Time for Telling:{' '}
                  {activeSet.canonicalTelling.lectureTitle}
                </h3>
                <p className="text-xs text-secondary">
                  {activeSet.canonicalTelling.historicalContext}
                </p>
              </div>

              <Badge tone="success">Optimal Schema Reception (PFL Active)</Badge>
            </div>

            {/* Formal Governing Equation */}
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                  {activeSet.canonicalTelling.formalLawName}
                </span>
                <span className="font-mono text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  {activeSet.canonicalTelling.formalEquation}
                </span>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                {activeSet.canonicalTelling.explanation}
              </p>
            </div>

            {/* Why Intuitive Rules Fail vs How Theory Coordinates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 p-3 space-y-1">
                <h4 className="text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1">
                  <HelpCircle className="h-3.5 w-3.5" />
                  Why Intuitive Additive Rules Fail
                </h4>
                <p className="text-xs text-secondary leading-snug">
                  {activeSet.canonicalTelling.whyIntuitiveMetricsFail}
                </p>
              </div>

              <div className="rounded-lg border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-950/20 p-3 space-y-1">
                <h4 className="text-xs font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  How The Theory Coordinates All Cases
                </h4>
                <p className="text-xs text-secondary leading-snug">
                  {activeSet.canonicalTelling.howItCoordinatesCases}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setActiveTab('transfer')} variant="primary">
                Proceed to Far Transfer Challenge <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 4: Far Transfer Challenge & FSRS Deck */}
      {activeTab === 'transfer' && (
        <div className="space-y-4">
          <Panel className="space-y-3">
            <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              Far Transfer Challenge: {activeSet.transferChallenge.scenarioTitle}
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              {activeSet.transferChallenge.description}
            </p>

            <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-3">
              <p className="text-xs font-medium text-strong">
                {activeSet.transferChallenge.question}
              </p>

              <div className="space-y-1.5">
                {activeSet.transferChallenge.options.map((opt, idx) => (
                  <div
                    key={idx}
                    onClick={() => !transferSubmitted && setSelectedTransferOption(idx)}
                    className={`cursor-pointer rounded border p-2.5 text-xs transition-colors ${
                      selectedTransferOption === idx
                        ? 'border-indigo-500 bg-indigo-500/10 text-strong font-medium'
                        : 'border-neutral-200 dark:border-(--hub-border) bg-surface hover:bg-surface-elevated text-secondary'
                    } ${
                      transferSubmitted && idx === activeSet.transferChallenge.correctOptionIndex
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-status-success-text'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold w-4">{String.fromCharCode(65 + idx)}.</span>
                      <span>{opt}</span>
                    </div>
                  </div>
                ))}
              </div>

              {!transferSubmitted ? (
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={() => setTransferSubmitted(true)}
                    disabled={selectedTransferOption === null}
                    variant="primary"
                  >
                    Submit Transfer Solution
                  </Button>
                </div>
              ) : (
                <div className="rounded border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-950/20 p-3 text-xs space-y-1">
                  <span className="font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Target Principle: {activeSet.transferChallenge.targetConcept}
                  </span>
                  <p className="text-secondary leading-relaxed">
                    {activeSet.transferChallenge.explanation}
                  </p>
                </div>
              )}
            </div>
          </Panel>

          {/* FSRS Review Deck Generation */}
          <Panel className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-strong flex items-center gap-1.5">
                  <FileCheck className="h-4 w-4 text-indigo-500" />
                  Calibrated FSRS-6 Review Deck (CDTS Scaled)
                </h4>
                <p className="text-xs text-secondary">
                  Generates spaced repetition cards with stability parameters scaled by perceptual
                  differentiation.
                </p>
              </div>

              <Button onClick={handleGenerateDeck} variant="primary">
                Generate FSRS Cards
              </Button>
            </div>

            {fsrsDeck && (
              <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-(--hub-border)">
                <div className="flex items-center justify-between text-xs text-secondary">
                  <span>Deck: {fsrsDeck.setTitle}</span>
                  <span>{fsrsDeck.cards.length} Calibrated Cards Generated</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {fsrsDeck.cards.map((card) => (
                    <div
                      key={card.id}
                      className="rounded border border-neutral-200 dark:border-(--hub-border) p-2.5 bg-surface text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <Badge tone="accent">{card.cardType}</Badge>
                        <span className="text-[11px] text-secondary">
                          S: {card.fsrsParameters.stability}d | D: {card.fsrsParameters.difficulty}
                        </span>
                      </div>
                      <p className="text-strong font-medium line-clamp-2">{card.front}</p>
                      <p className="text-secondary text-[11px] line-clamp-2">{card.back}</p>
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
