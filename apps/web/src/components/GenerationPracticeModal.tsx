'use client'

/**
 * Generation Practice Modal (Slamecka & Graf 1978, Bjork & Bjork 2011).
 *
 * Provides a 4-tier interactive generation effect practice studio:
 * - Tier 1: Stem Completion (phonemic & vowel masking)
 * - Tier 2: Semantic Anagram (interactive token unscrambling)
 * - Tier 3: Reverse Query (Jeopardy formulation)
 * - Tier 4: Analogy Synthesis (embodied metaphor & boundary condition)
 *
 * Fast, calm, accessible, keyboard-operable, and mobile-friendly.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Keyboard,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react'
import {
  createGenerationLadder,
  evaluateGenerationTrial,
  type GenerationEvaluationResult,
  type GenerationLadder,
  type GenerationTier,
} from '@learning-hub/core/generation'
import { apiSend } from '@/lib/transport'
import { playChime } from '@/lib/audio-engine'
import { hapticMedium, hapticLight, hapticWarning } from '@/platform/haptics'
import { Badge } from '@/ui/Feedback'

export interface GenerationPracticeModalProps {
  isOpen: boolean
  onClose: () => void
  initialConcept?: string
  initialExplanation?: string
  cardId?: number
  deckId?: number
  onComplete?: (result: GenerationEvaluationResult) => void
}

const TIER_CONFIG: Record<
  GenerationTier,
  {
    level: number
    label: string
    shortLabel: string
    multiplier: number
    description: string
    color: string
    bgLight: string
    bgDark: string
  }
> = {
  stem_completion: {
    level: 1,
    label: 'Tier 1: Stem Completion',
    shortLabel: 'T1: Stem',
    multiplier: 1.35,
    description: 'Reconstruct words from anchored phonetic stems and vowel masks.',
    color: 'text-status-info-text',
    bgLight: 'bg-sky-50',
    bgDark: 'dark:bg-sky-950/30',
  },
  semantic_anagram: {
    level: 2,
    label: 'Tier 2: Semantic Anagram',
    shortLabel: 'T2: Anagram',
    multiplier: 1.55,
    description: 'Assemble scrambled concept fragments into coherent syntactic order.',
    color: 'text-indigo-500',
    bgLight: 'bg-indigo-50',
    bgDark: 'dark:bg-indigo-950/30',
  },
  reverse_query: {
    level: 3,
    label: 'Tier 3: Reverse Query',
    shortLabel: 'T3: Reverse',
    multiplier: 1.8,
    description: 'Formulate the mechanistic core question this concept answers.',
    color: 'text-status-warning-text',
    bgLight: 'bg-amber-50',
    bgDark: 'dark:bg-amber-950/30',
  },
  analogy_synthesis: {
    level: 4,
    label: 'Tier 4: Analogy Synthesis',
    shortLabel: 'T4: Analogy',
    multiplier: 2.1,
    description: 'Map this abstract rule to a tangible real-world physical metaphor.',
    color: 'text-status-success-text',
    bgLight: 'bg-emerald-50',
    bgDark: 'dark:bg-emerald-950/30',
  },
}

export function GenerationPracticeModal({
  isOpen,
  onClose,
  initialConcept = 'Spaced Retrieval Potentiation',
  initialExplanation = 'Active retrieval produces durable consolidation by forcing schema reconstruction rather than passive recognition.',
  cardId,
  deckId,
  onComplete,
}: GenerationPracticeModalProps) {
  const [concept, setConcept] = useState(initialConcept)
  const [explanation, setExplanation] = useState(initialExplanation)
  const [currentTier, setCurrentTier] = useState<GenerationTier>('stem_completion')
  const [userAttempt, setUserAttempt] = useState('')
  const [selectedTokens, setSelectedTokens] = useState<string[]>([])
  const [availableTokens, setAvailableTokens] = useState<string[]>([])
  const [showHint, setShowHint] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [evaluation, setEvaluation] = useState<GenerationEvaluationResult | null>(null)
  const [trialsHistory, setTrialsHistory] = useState<
    Array<{ tier: GenerationTier; isCorrect: boolean; multiplier: number }>
  >([])
  const [startTime, setStartTime] = useState<number>(() => Date.now())

  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const modalRef = useRef<HTMLDivElement | null>(null)

  // Sync initial props
  useEffect(() => {
    if (initialConcept) setConcept(initialConcept)
    if (initialExplanation) setExplanation(initialExplanation)
  }, [initialConcept, initialExplanation])

  // Construct ladder whenever concept, explanation or tier changes
  const ladder: GenerationLadder = useMemo(() => {
    const c = concept.trim() || 'Core Principle'
    const e = explanation.trim() || 'Fundamental mechanistic rule that governs the concept.'
    return createGenerationLadder(c, e, currentTier)
  }, [concept, explanation, currentTier])

  // Reset attempt state when tier or ladder updates
  const resetAttemptForTier = useCallback((tier: GenerationTier) => {
    setCurrentTier(tier)
    setUserAttempt('')
    setSelectedTokens([])
    setEvaluation(null)
    setShowHint(false)
    setStartTime(Date.now())
  }, [])

  // Initialize anagram tokens when entering semantic_anagram tier
  useEffect(() => {
    if (ladder.tier === 'semantic_anagram' && ladder.scrambledTokens) {
      setAvailableTokens([...ladder.scrambledTokens])
      setSelectedTokens([])
    }
  }, [ladder])

  // Focus input when modal opens or tier changes
  useEffect(() => {
    if (isOpen) {
      setStartTime(Date.now())
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isOpen, currentTier])

  // Token interaction for Tier 2 Anagram
  const handleAddToken = (token: string, index: number) => {
    hapticLight()
    const nextAvailable = [...availableTokens]
    nextAvailable.splice(index, 1)
    setAvailableTokens(nextAvailable)

    const nextSelected = [...selectedTokens, token]
    setSelectedTokens(nextSelected)
    setUserAttempt(nextSelected.join(' '))
  }

  const handleRemoveToken = (token: string, index: number) => {
    hapticLight()
    const nextSelected = [...selectedTokens]
    nextSelected.splice(index, 1)
    setSelectedTokens(nextSelected)
    setUserAttempt(nextSelected.join(' '))

    setAvailableTokens((prev) => [...prev, token])
  }

  const handleResetTokens = () => {
    hapticLight()
    if (ladder.scrambledTokens) {
      setAvailableTokens([...ladder.scrambledTokens])
      setSelectedTokens([])
      setUserAttempt('')
    }
  }

  // Handle trial submission
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!userAttempt.trim() || isSubmitting) return

    setIsSubmitting(true)
    const latencyMs = Math.max(0, Date.now() - startTime)

    // Evaluate client-side instantly
    const result = evaluateGenerationTrial({
      concept: ladder.concept,
      tier: ladder.tier,
      expectedAnswer: ladder.expectedAnswer,
      userAttempt: userAttempt.trim(),
      latencyMs,
    })

    setEvaluation(result)
    setTrialsHistory((prev) => [
      ...prev,
      {
        tier: result.tier,
        isCorrect: result.isCorrect,
        multiplier: result.retentionMultiplier,
      },
    ])

    if (result.isCorrect) {
      hapticMedium()
      if (soundEnabled) {
        try {
          playChime('success')
        } catch {
          // audio fallback
        }
      }
    } else {
      hapticWarning()
    }

    // Persist trial to cognitive endpoint asynchronously
    try {
      await apiSend('/api/cognitive/generation', 'POST', {
        concept: ladder.concept,
        tier: ladder.tier,
        expectedAnswer: ladder.expectedAnswer,
        userAttempt: userAttempt.trim(),
        latencyMs,
        cardId,
        deckId,
      })
    } catch {
      // offline / client-only mode safe
    } finally {
      setIsSubmitting(false)
      if (onComplete) {
        onComplete(result)
      }
    }
  }

  // Advance to recommended next tier
  const handleAdvanceTier = () => {
    if (evaluation?.recommendedNextTier && evaluation.recommendedNextTier !== currentTier) {
      resetAttemptForTier(evaluation.recommendedNextTier)
    } else {
      // Rotate to next tier in sequence
      const tiers: GenerationTier[] = [
        'stem_completion',
        'semantic_anagram',
        'reverse_query',
        'analogy_synthesis',
      ]
      const nextIdx = (tiers.indexOf(currentTier) + 1) % tiers.length
      resetAttemptForTier(tiers[nextIdx]!)
    }
  }

  // Keyboard shortcut listener
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      // Ctrl+Enter or Cmd+Enter to submit
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        void handleSubmit()
        return
      }

      // 1-4 shortcuts if not focused on text input
      if (
        document.activeElement !== inputRef.current &&
        !['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName || '')
      ) {
        if (e.key === '1') resetAttemptForTier('stem_completion')
        if (e.key === '2') resetAttemptForTier('semantic_anagram')
        if (e.key === '3') resetAttemptForTier('reverse_query')
        if (e.key === '4') resetAttemptForTier('analogy_synthesis')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, userAttempt, isSubmitting, resetAttemptForTier])

  if (!isOpen) return null

  const activeTierConfig = TIER_CONFIG[currentTier]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generation-modal-title"
    >
      <div
        ref={modalRef}
        className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/80">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="generation-modal-title"
                className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2"
              >
                Generation Practice Studio
                <Badge tone="accent" pulse={evaluation?.isCorrect}>
                  {activeTierConfig.multiplier}x Multiplier
                </Badge>
              </h2>
              <p className="text-xs text-tertiary dark:text-faint">
                Slamecka &amp; Graf (1978) Desirable Difficulties Protocol
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-1.5 text-tertiary hover:text-neutral-700 dark:text-faint dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition"
              aria-label={soundEnabled ? 'Disable audio cues' : 'Enable audio cues'}
              title={soundEnabled ? 'Mute sound' : 'Unmute sound'}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-tertiary hover:text-neutral-700 dark:text-faint dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tier Selector Navigation */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-2 bg-neutral-100/70 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-800">
          {(Object.keys(TIER_CONFIG) as GenerationTier[]).map((tierKey) => {
            const cfg = TIER_CONFIG[tierKey]
            const isCurrent = currentTier === tierKey
            const hasPassed = trialsHistory.some((t) => t.tier === tierKey && t.isCorrect)

            return (
              <button
                key={tierKey}
                type="button"
                onClick={() => resetAttemptForTier(tierKey)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  isCurrent
                    ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-xs border border-neutral-200 dark:border-neutral-700'
                    : 'text-neutral-600 dark:text-faint hover:bg-white/50 dark:hover:bg-neutral-800/50'
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  {hasPassed && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-status-success-text shrink-0" />
                  )}
                  <span className="truncate">{cfg.shortLabel}</span>
                </span>
                <span
                  className={`text-[10px] font-mono px-1 py-0.5 rounded ${
                    isCurrent
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                      : 'text-faint'
                  }`}
                >
                  {cfg.multiplier}x
                </span>
              </button>
            )
          })}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Concept Header Card */}
          <div className="rounded-xl p-4 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-700/60">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-xs uppercase tracking-wider font-semibold text-tertiary dark:text-faint">
                Target Concept
              </span>
              <span className="text-xs font-mono text-faint">Tier {activeTierConfig.level}/4</span>
            </div>
            <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              {ladder.concept}
            </h3>
            <p className="mt-1 text-xs text-neutral-600 dark:text-faint">
              {activeTierConfig.description}
            </p>
          </div>

          {/* Active Tier Interactive Prompt */}
          <div className="space-y-3">
            <label
              htmlFor="user-generation-input"
              className="block text-sm font-medium text-neutral-800 dark:text-neutral-200"
            >
              {ladder.challengeText}
            </label>

            {/* Masked display for Tier 1 Stem Completion */}
            {ladder.tier === 'stem_completion' && ladder.maskedTarget && (
              <div className="p-3.5 rounded-xl bg-sky-50/70 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/40 text-sm font-mono text-sky-900 dark:text-status-info-text leading-relaxed select-all">
                {ladder.maskedTarget}
              </div>
            )}

            {/* Clickable Token Anagram for Tier 2 */}
            {ladder.tier === 'semantic_anagram' && (
              <div className="space-y-3">
                {/* Available tokens pool */}
                <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-neutral-100/60 dark:bg-neutral-800/40 border border-neutral-200/70 dark:border-neutral-700/50 min-h-[52px]">
                  {availableTokens.length === 0 ? (
                    <span className="text-xs text-faint italic">
                      All tokens placed in reconstruction.
                    </span>
                  ) : (
                    availableTokens.map((tok, idx) => (
                      <button
                        key={`${tok}-${idx}`}
                        type="button"
                        onClick={() => handleAddToken(tok, idx)}
                        className="px-2.5 py-1 text-xs font-medium rounded-md bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-600 shadow-2xs hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition"
                      >
                        {tok}
                      </button>
                    ))
                  )}
                </div>

                {/* Selected tokens assembly */}
                {selectedTokens.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-tertiary">
                      Arranged sequence (click word to return):
                    </span>
                    <button
                      type="button"
                      onClick={handleResetTokens}
                      className="text-xs text-tertiary hover:text-neutral-700 dark:hover:text-secondary flex items-center gap-1 transition"
                    >
                      <RotateCcw className="h-3 w-3" /> Reset tokens
                    </button>
                  </div>
                )}

                {selectedTokens.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40">
                    {selectedTokens.map((tok, idx) => (
                      <button
                        key={`sel-${tok}-${idx}`}
                        type="button"
                        onClick={() => handleRemoveToken(tok, idx)}
                        className="px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700 hover:bg-rose-100 hover:text-rose-700 hover:border-rose-300 transition"
                        title="Click to remove"
                      >
                        {tok}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Input textarea */}
            <div className="relative">
              <textarea
                id="user-generation-input"
                ref={inputRef}
                value={userAttempt}
                onChange={(e) => setUserAttempt(e.target.value)}
                placeholder={
                  currentTier === 'stem_completion'
                    ? 'Type the reconstructed text here...'
                    : currentTier === 'semantic_anagram'
                      ? 'Reconstruct or arrange with chips above...'
                      : currentTier === 'reverse_query'
                        ? 'Formulate the core research question...'
                        : 'Explain how this behaves like a concrete physical object...'
                }
                rows={3}
                disabled={isSubmitting}
                className="w-full rounded-xl p-3.5 text-sm bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition resize-none"
              />
              <div className="absolute right-2.5 bottom-2.5 text-[11px] text-faint font-mono flex items-center gap-1">
                <Keyboard className="h-3 w-3" />
                <span>Ctrl+Enter</span>
              </div>
            </div>

            {/* Hint reveal */}
            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={() => setShowHint(!showHint)}
                className="text-tertiary hover:text-neutral-700 dark:text-faint dark:hover:text-neutral-200 flex items-center gap-1 transition"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>{showHint ? 'Hide Hint' : 'Desirable Difficulty Hint'}</span>
              </button>
              <span className="text-faint text-[11px]">
                {userAttempt.trim().split(/\s+/).filter(Boolean).length} words
              </span>
            </div>

            {showHint && (
              <div className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-800 dark:text-status-warning-text animate-fade-in">
                {ladder.hint}
              </div>
            )}
          </div>

          {/* Evaluation Feedback Panel */}
          {evaluation && (
            <div
              className={`p-4 rounded-xl border animate-scale-in ${
                evaluation.isCorrect
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-100'
                  : 'bg-rose-50/80 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800/50 text-rose-900 dark:text-rose-100'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {evaluation.isCorrect ? (
                    <CheckCircle2 className="h-5 w-5 text-status-success-text dark:text-status-success-text shrink-0" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-rose-600 dark:text-danger-text shrink-0" />
                  )}
                  <div>
                    <h4 className="text-sm font-semibold">
                      {evaluation.isCorrect
                        ? 'Successful Active Generation!'
                        : 'Partial Reconstruction'}
                    </h4>
                    <p className="text-xs opacity-90">{evaluation.feedback}</p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xs font-mono font-bold">
                    {Math.round(evaluation.similarityScore * 100)}% match
                  </div>
                  <div className="text-[11px] font-mono text-status-success-text dark:text-status-success-text">
                    +{evaluation.retentionMultiplier.toFixed(2)}x boost
                  </div>
                </div>
              </div>

              {!evaluation.isCorrect && (
                <div className="mt-3 pt-3 border-t border-rose-200 dark:border-rose-900/40 text-xs">
                  <span className="font-semibold block text-neutral-700 dark:text-secondary mb-1">
                    Target Canon:
                  </span>
                  <div className="font-mono text-neutral-800 dark:text-neutral-200 bg-white/60 dark:bg-neutral-900/60 p-2 rounded border border-rose-100 dark:border-rose-950">
                    {ladder.expectedAnswer}
                  </div>
                </div>
              )}

              {/* Next Action Button */}
              <div className="mt-3.5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleAdvanceTier}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1.5 transition"
                >
                  <span>Advance to Next Tier</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Multi-trial Summary Strip */}
          {trialsHistory.length > 0 && (
            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center justify-between text-xs text-tertiary mb-2">
                <span className="flex items-center gap-1">
                  <Trophy className="h-3.5 w-3.5 text-status-warning-text" />
                  Session Generation Progress:
                </span>
                <span className="font-mono">
                  {trialsHistory.filter((t) => t.isCorrect).length}/{trialsHistory.length} Solved
                </span>
              </div>
              <div className="flex gap-1.5">
                {trialsHistory.map((trial, i) => (
                  <div
                    key={`hist-${i}`}
                    className={`h-2 flex-1 rounded-full ${
                      trial.isCorrect ? 'bg-emerald-500' : 'bg-rose-400'
                    }`}
                    title={`Trial ${i + 1}: ${trial.tier} (${trial.multiplier}x)`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-neutral-700 dark:text-secondary hover:bg-neutral-200/60 dark:hover:bg-neutral-800 rounded-lg transition"
          >
            Finish Practice
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!userAttempt.trim() || isSubmitting}
              onClick={() => void handleSubmit()}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-xs flex items-center gap-1.5 transition"
            >
              {isSubmitting ? (
                <>
                  <Sparkles className="h-3.5 w-3.5 animate-spin" />
                  <span>Evaluating...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Verify Generation</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
