'use client'

/**
 * Feynman Teach-Back & Socratic Reflection Studio.
 *
 * Grounded in:
 * - Rozenblit & Keil (2002) Illusion of Explanatory Depth (IOED)
 * - Kincaid et al. (1975) Flesch-Kincaid Readability Metrics
 * - Chi et al. (1989) Self-Explanation Potentiation
 *
 * Provides real-time client-side readability, jargon highlighting, causal
 * mechanism density tracking, interactive Socratic follow-up probes, and
 * 1-click gap-card generation directly to deck.
 */
import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  BookOpen,
  Check,
  GraduationCap,
  MessageSquare,
  Plus,
  Sparkles,
  Star,
} from 'lucide-react'
import {
  evaluateFeynmanExplanation,
  type FeynmanDiagnosticReport,
  type GapCardCandidate,
} from '@learning-hub/core/feynman'
import { apiGet, apiSend } from '@/lib/transport'
import { hapticLight, hapticMedium } from '@/platform/haptics'
import { Badge } from '@/ui/Feedback'
import { cx } from '@/ui/cx'

export interface FeynmanSocraticStudioProps {
  initialConcept?: string
  initialExplanation?: string
  deckId?: number
  onGapCardsSaved?: (count: number) => void
  className?: string
}

type AudienceTier = 'ten_year_old' | 'high_school' | 'layperson'

const AUDIENCE_CONFIG: Record<
  AudienceTier,
  { label: string; ageRange: string; maxGrade: number; minEase: number; description: string }
> = {
  ten_year_old: {
    label: '10-Year-Old Child',
    ageRange: 'Elementary / Middle School',
    maxGrade: 5.5,
    minEase: 70,
    description:
      'Zero jargon allowed. Every concept must be translated into everyday physical toys or objects.',
  },
  high_school: {
    label: 'Curious Teenager',
    ageRange: 'High School',
    maxGrade: 8.5,
    minEase: 60,
    description:
      'Basic scientific intuition. Moderate vocabulary accepted if causal steps are explicit.',
  },
  layperson: {
    label: 'Intelligent Colleague',
    ageRange: 'Domain Outsider',
    maxGrade: 11.0,
    minEase: 45,
    description:
      'Smart adult from another field. Clarify acronyms and non-obvious domain abstractions.',
  },
}

export function FeynmanSocraticStudio({
  initialConcept = 'Spaced Repetition Decay',
  initialExplanation = 'When we learn something, memory traces fade exponentially over time. By forcing retrieval right before forgetting, the brain resets the stability to a higher interval.',
  deckId: propDeckId,
  onGapCardsSaved,
  className,
}: FeynmanSocraticStudioProps) {
  const [concept, setConcept] = useState(initialConcept)
  const [explanation, setExplanation] = useState(initialExplanation)
  const [initialConfidence, setInitialConfidence] = useState<number>(4) // 1 to 5 stars
  const [audience, setAudience] = useState<AudienceTier>('ten_year_old')
  const [probeAnswers, setProbeAnswers] = useState<Record<string, string>>({})
  const [savedCardFronts, setSavedCardFronts] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [selectedDeckId, setSelectedDeckId] = useState<number | ''>(propDeckId ?? '')

  // Fetch decks for 1-click card creation
  const { data: decksData } = useQuery<{ decks: { id: number; name: string }[] }>({
    queryKey: ['decks-for-feynman-studio'],
    queryFn: () => apiGet<{ decks: { id: number; name: string }[] }>('/api/decks'),
  })

  // Target deck ID
  const effectiveDeckId = useMemo(() => {
    if (typeof selectedDeckId === 'number') return selectedDeckId
    if (propDeckId) return propDeckId
    return decksData?.decks?.[0]?.id ?? 1
  }, [selectedDeckId, propDeckId, decksData])

  // Real-time client-side Feynman diagnostic report
  const report: FeynmanDiagnosticReport = useMemo(() => {
    const c = concept.trim() || 'Concept'
    const e = explanation.trim() || 'Mechanistic explanation text.'
    return evaluateFeynmanExplanation({
      concept: c,
      explanation: e,
      initialConfidence,
    })
  }, [concept, explanation, initialConfidence])

  const audienceCfg = AUDIENCE_CONFIG[audience]
  const meetsAudience =
    report.fleschKincaidGradeLevel <= audienceCfg.maxGrade &&
    report.fleschReadingEase >= audienceCfg.minEase

  // Handle probe answer edit
  const handleProbeAnswerChange = (probeId: string, text: string) => {
    setProbeAnswers((prev) => ({ ...prev, [probeId]: text }))
  }

  // Handle saving a single gap card to deck
  const handleSaveGapCard = async (card: GapCardCandidate) => {
    if (savedCardFronts.has(card.front) || isSaving) return
    setIsSaving(true)
    hapticLight()

    try {
      await apiSend('/api/cards?bulk=1', 'PUT', {
        deckId: effectiveDeckId,
        items: [
          {
            type: 'basic',
            content: { basic: { front: card.front, back: card.back } },
            tags: [...card.tags, 'feynman-gap', concept.toLowerCase().replace(/\s+/g, '-')],
          },
        ],
      })

      setSavedCardFronts((prev) => new Set([...prev, card.front]))
      hapticMedium()
      if (onGapCardsSaved) onGapCardsSaved(1)
    } catch {
      // offline fallback
    } finally {
      setIsSaving(false)
    }
  }

  // Handle saving all gap cards
  const handleSaveAllGapCards = async () => {
    const toSave = report.suggestedGapCards.filter((c) => !savedCardFronts.has(c.front))
    if (toSave.length === 0 || isSaving) return
    setIsSaving(true)
    hapticLight()

    try {
      await apiSend('/api/cards?bulk=1', 'PUT', {
        deckId: effectiveDeckId,
        items: toSave.map((card) => ({
          type: 'basic',
          content: { basic: { front: card.front, back: card.back } },
          tags: [...card.tags, 'feynman-gap', concept.toLowerCase().replace(/\s+/g, '-')],
        })),
      })

      setSavedCardFronts((prev) => new Set([...prev, ...toSave.map((c) => c.front)]))
      hapticMedium()
      if (onGapCardsSaved) onGapCardsSaved(toSave.length)
    } catch {
      // offline fallback
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className={cx(
        'rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 shadow-sm space-y-6',
        className,
      )}
    >
      {/* Studio Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Feynman Teach-Back &amp; Socratic Studio
              </h3>
              <Badge
                tone={meetsAudience ? 'success' : 'warning'}
                pulse={!meetsAudience && report.jargonDensity > 10}
              >
                {meetsAudience ? 'Audience Aligned' : 'Simplification Needed'}
              </Badge>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Rozenblit-Keil (2002) IOED Diagnostic · Flesch-Kincaid Readability Analysis
            </p>
          </div>
        </div>

        {/* Target Audience Pill Selector */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700">
          {(Object.keys(AUDIENCE_CONFIG) as AudienceTier[]).map((tierKey) => {
            const cfg = AUDIENCE_CONFIG[tierKey]
            const active = audience === tierKey
            return (
              <button
                key={tierKey}
                type="button"
                onClick={() => setAudience(tierKey)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition ${
                  active
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold'
                    : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
              >
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Target Concept & Initial Confidence Input */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-1.5">
          <label
            htmlFor="feynman-concept-input"
            className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
          >
            Target Concept to Explain
          </label>
          <input
            id="feynman-concept-input"
            type="text"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="e.g. Hebbian Learning, Proof by Induction, Docker Containers..."
            className="w-full px-3.5 py-2 text-sm rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Pre-Study Confidence
            </span>
            <span className="text-xs font-mono text-amber-500 font-bold">
              {initialConfidence}/5
            </span>
          </div>
          <div className="flex items-center gap-1.5 pt-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setInitialConfidence(star)}
                className="p-1 text-neutral-300 dark:text-neutral-600 hover:text-amber-400 transition"
                title={`${star} stars`}
              >
                <Star
                  className={`h-5 w-5 ${
                    star <= initialConfidence
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-neutral-300 dark:text-neutral-600'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live Explanation Textarea & Diagnostics */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <label
            htmlFor="feynman-explanation-input"
            className="font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5"
          >
            <BookOpen className="h-3.5 w-3.5 text-neutral-400" />
            Your Teach-Back Explanation (Explain to a {audienceCfg.label}):
          </label>
          <span className="text-neutral-400 text-[11px] font-mono">
            {report.wordCount} words · {report.sentenceCount} sentences
          </span>
        </div>

        <textarea
          id="feynman-explanation-input"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="Imagine you are talking to a student. How does it work? Why? Use analogies and simple language..."
          rows={5}
          className="w-full rounded-xl p-3.5 text-sm bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 resize-y leading-relaxed"
        />
      </div>

      {/* Real-Time Telemetry Bar (Readability, Causal, Depth, IOED) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Readability Ease */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/60">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Reading Ease
          </div>
          <div className="mt-1 text-xl font-mono font-bold text-neutral-900 dark:text-neutral-100 flex items-baseline gap-1.5">
            <span>{report.fleschReadingEase}</span>
            <span className="text-xs text-neutral-400 font-normal">/ 100</span>
          </div>
          <div className="text-[11px] text-neutral-500">
            Target: &gt;={audienceCfg.minEase} ({audienceCfg.label})
          </div>
        </div>

        {/* Grade Level */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/60">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Grade Level
          </div>
          <div
            className={cx(
              'mt-1 text-xl font-mono font-bold',
              report.fleschKincaidGradeLevel <= audienceCfg.maxGrade
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-500',
            )}
          >
            Grade {report.fleschKincaidGradeLevel}
          </div>
          <div className="text-[11px] text-neutral-500">Max: Grade {audienceCfg.maxGrade}</div>
        </div>

        {/* Causal Markers */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/60">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Causal Mechanism
          </div>
          <div className="mt-1 text-xl font-mono font-bold text-indigo-600 dark:text-indigo-400">
            {report.causalMarkerCount} markers
          </div>
          <div className="text-[11px] text-neutral-500">
            {report.causalDensity.toFixed(2)} per sentence
          </div>
        </div>

        {/* IOED Gap */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/60">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            IOED Illusion Gap
          </div>
          <div
            className={cx(
              'mt-1 text-xl font-mono font-bold',
              report.ioedGap > 30 ? 'text-rose-500' : 'text-emerald-500',
            )}
          >
            {report.ioedGap > 0 ? `-${report.ioedGap} pts` : 'Zero Gap'}
          </div>
          <div className="text-[11px] text-neutral-500">
            {report.ioedGap > 30 ? 'Fluency illusion exposed' : 'Genuinely mastered'}
          </div>
        </div>
      </div>

      {/* Jargon Highlighter Strip */}
      {report.jargonTerms.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-900 dark:text-amber-200">
            <span className="flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Detected Complex Vocabulary / Jargon ({report.jargonTerms.length} terms):
            </span>
            <span className="text-[11px] font-mono text-amber-700 dark:text-amber-300">
              {report.jargonDensity}% density
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {report.jargonTerms.map((term) => (
              <span
                key={term}
                className="px-2 py-0.5 text-xs font-mono font-medium rounded-md bg-white dark:bg-neutral-800 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shadow-2xs"
              >
                {term}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-amber-700 dark:text-amber-300/80 pt-0.5">
            Tip: Replace these polysyllabic words with tangible physical comparisons to pass the
            child test.
          </p>
        </div>
      )}

      {/* Interactive Socratic Probes Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-indigo-500" />
            Socratic Follow-Up Inquiries ({report.socraticProbes.length})
          </h4>
          <span className="text-[11px] text-neutral-400">
            Novice peer interrogations to expose hidden assumptions
          </span>
        </div>

        <div className="space-y-2.5">
          {report.socraticProbes.map((probe) => {
            const hasAnswer = Boolean(probeAnswers[probe.id]?.trim())
            return (
              <div
                key={probe.id}
                className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/60 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                    <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                      {probe.prompt}
                    </span>
                  </div>
                  <Badge tone={hasAnswer ? 'success' : 'neutral'}>
                    {hasAnswer ? 'Addressed' : 'Pending'}
                  </Badge>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={probeAnswers[probe.id] || ''}
                    onChange={(e) => handleProbeAnswerChange(probe.id, e.target.value)}
                    placeholder="Type your brief clarification..."
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Suggested Gap Cards (1-Click Save to Deck) */}
      {report.suggestedGapCards.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Automatic Gap-Cards ({report.suggestedGapCards.length})
              </h4>
              <p className="text-[11px] text-neutral-500">
                Extracted from missing causal links and unexplained jargon
              </p>
            </div>

            <div className="flex items-center gap-2">
              {decksData?.decks && (
                <select
                  value={selectedDeckId}
                  onChange={(e) => setSelectedDeckId(e.target.value ? Number(e.target.value) : '')}
                  className="text-xs py-1 px-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300"
                >
                  {decksData.decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={() => void handleSaveAllGapCards()}
                disabled={isSaving}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-xs flex items-center gap-1 transition disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Save All Gap Cards</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {report.suggestedGapCards.map((card, idx) => {
              const isSaved = savedCardFronts.has(card.front)
              return (
                <div
                  key={`gap-${idx}`}
                  className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/60 flex flex-col justify-between gap-2.5"
                >
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-neutral-400 flex items-center justify-between">
                      <span>Front (Cue)</span>
                      <span className="text-[10px] text-amber-500 italic font-normal">
                        {card.reason}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                      {card.front}
                    </div>
                    <div className="text-[11px] font-semibold text-neutral-400 pt-1">
                      Back (Canon)
                    </div>
                    <div className="text-xs text-neutral-700 dark:text-neutral-300">
                      {card.back}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-neutral-200/60 dark:border-neutral-700/40">
                    <div className="flex flex-wrap gap-1">
                      {card.tags.map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 text-[10px] rounded bg-neutral-200/60 dark:bg-neutral-700/60 text-neutral-600 dark:text-neutral-400 font-mono"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleSaveGapCard(card)}
                      disabled={isSaved || isSaving}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg flex items-center gap-1 transition ${
                        isSaved
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                          : 'bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-600 hover:border-amber-500'
                      }`}
                    >
                      {isSaved ? (
                        <>
                          <Check className="h-3 w-3" />
                          <span>Saved</span>
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3" />
                          <span>Add Card</span>
                        </>
                      )}
                    </button>
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
