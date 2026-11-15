import { useState } from 'react'
import type { GenerationEvaluationResult, GenerationLadder } from '@learning-hub/core'
import { ArrowRight, Brain, CheckCircle2, HelpCircle, RotateCcw, Sparkles, Zap } from 'lucide-react'
import { Badge } from './Feedback'
import { StatCard } from './StatCard'
import { cx } from './cx'

export interface GenerationMatrixHUDProps {
  ladder: GenerationLadder
  onSubmitAttempt: (attempt: string) => Promise<GenerationEvaluationResult | void> | void
  evaluationResult?: GenerationEvaluationResult | null
  onAdvanceTier?: () => void
  className?: string
}

export function GenerationMatrixHUD({
  ladder,
  onSubmitAttempt,
  evaluationResult,
  onAdvanceTier,
  className,
}: GenerationMatrixHUDProps) {
  const [attempt, setAttempt] = useState('')
  const [selectedTokens, setSelectedTokens] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const tierColors: Record<
    GenerationLadder['tier'],
    { tone: 'cyan' | 'accent' | 'violet' | 'success'; label: string }
  > = {
    stem_completion: { tone: 'cyan', label: 'Tier 1: Stem Completion' },
    semantic_anagram: { tone: 'accent', label: 'Tier 2: Semantic Anagram' },
    reverse_query: { tone: 'violet', label: 'Tier 3: Reverse Query' },
    analogy_synthesis: { tone: 'success', label: 'Tier 4: Analogy Synthesis' },
  }

  const activeTier = tierColors[ladder.tier]

  const handleTokenClick = (token: string, _index: number) => {
    setSelectedTokens((prev) => [...prev, token])
    const newAttempt = [...selectedTokens, token].join(' ')
    setAttempt(newAttempt)
  }

  const handleResetTokens = () => {
    setSelectedTokens([])
    setAttempt('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!attempt.trim() || submitting) return
    setSubmitting(true)
    try {
      await onSubmitAttempt(attempt.trim())
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className={cx(
        'panel-elevated relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-white/80 p-5 backdrop-blur-md transition-all dark:border-(--hub-border) dark:bg-(--hub-panel)/90',
        className,
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4 dark:border-(--hub-border)">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Brain className="h-4 w-4" />
            </span>
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Generation Effect Matrix: {ladder.concept}
            </h3>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Slamecka & Graf (1978) Active Semantic Generation Ladder
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={activeTier.tone} dot pulse>
            {activeTier.label}
          </Badge>
          <Badge tone="success">
            {`+${Math.round((ladder.generationMultiplier - 1.0) * 100)}% Retention`}
          </Badge>
        </div>
      </div>

      {/* Metric Tiles */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Generation Tier"
          value={`Tier ${ladder.tierLevel} of 4`}
          hint={ladder.hint}
          accent="indigo"
          icon={<Zap className="h-4 w-4" />}
          badge={<Badge tone={activeTier.tone}>{ladder.tier.replace('_', ' ')}</Badge>}
        />

        <StatCard
          label="Retention Multiplier"
          value={`${ladder.generationMultiplier}x`}
          hint="Vs passive review"
          accent="emerald"
          icon={<Sparkles className="h-4 w-4" />}
          badge={
            <Badge tone="success">
              {`+${Math.round((ladder.generationMultiplier - 1.0) * 100)}% Gain`}
            </Badge>
          }
        />

        <StatCard
          label="Desirable Difficulty"
          value={
            ladder.tierLevel === 1
              ? 'Mild'
              : ladder.tierLevel === 2
                ? 'Moderate'
                : ladder.tierLevel === 3
                  ? 'High'
                  : 'Extreme'
          }
          hint="Bjork & Bjork (2011)"
          accent={ladder.tierLevel <= 2 ? 'amber' : 'rose'}
          icon={<HelpCircle className="h-4 w-4" />}
          badge={
            <Badge tone={ladder.tierLevel <= 2 ? 'warning' : 'danger'}>
              Level {ladder.tierLevel}
            </Badge>
          }
        />

        <StatCard
          label="Match Similarity"
          value={
            evaluationResult ? `${Math.round(evaluationResult.similarityScore * 100)}%` : 'Pending'
          }
          hint={evaluationResult?.feedback ?? 'Enter your solution below'}
          accent={evaluationResult?.isCorrect ? 'emerald' : 'neutral'}
          icon={<CheckCircle2 className="h-4 w-4" />}
          badge={
            evaluationResult ? (
              <Badge tone={evaluationResult.isCorrect ? 'success' : 'danger'}>
                {evaluationResult.isCorrect ? 'Mastered' : 'Needs Review'}
              </Badge>
            ) : undefined
          }
        />
      </div>

      {/* Challenge Box */}
      <div className="mt-5 rounded-xl border border-neutral-200/80 bg-neutral-50/70 p-4 dark:border-(--hub-border) dark:bg-(--hub-panel-2)/60">
        <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Generation Challenge
        </div>
        <p className="mt-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">
          {ladder.challengeText}
        </p>

        {/* Tier 1: Masked target display */}
        {ladder.maskedTarget && (
          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 font-mono text-sm tracking-widest text-indigo-900 select-all dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-200">
            {ladder.maskedTarget}
          </div>
        )}

        {/* Tier 2: Interactive Scrambled Token Chips */}
        {ladder.scrambledTokens && ladder.scrambledTokens.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>Click tokens in correct sequence:</span>
              {selectedTokens.length > 0 && (
                <button
                  type="button"
                  onClick={handleResetTokens}
                  className="flex items-center gap-1 text-neutral-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {ladder.scrambledTokens.map((token, i) => {
                const usedCount = selectedTokens.filter((t) => t === token).length
                const totalCount = ladder.scrambledTokens!.filter((t) => t === token).length
                const isExhausted = usedCount >= totalCount

                return (
                  <button
                    key={`${token}-${i}`}
                    type="button"
                    disabled={isExhausted || Boolean(evaluationResult)}
                    onClick={() => handleTokenClick(token, i)}
                    className={cx(
                      'rounded-lg border px-2.5 py-1 text-xs font-medium transition-all',
                      isExhausted
                        ? 'border-neutral-200 bg-neutral-100 text-neutral-400 opacity-40 dark:border-neutral-800 dark:bg-neutral-900'
                        : 'border-indigo-300 bg-white text-indigo-700 shadow-2xs hover:border-indigo-500 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-(--hub-panel) dark:text-indigo-300 dark:hover:bg-indigo-950/40',
                    )}
                  >
                    {token}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Submission Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <textarea
            className="input min-h-20 w-full text-sm"
            value={attempt}
            onChange={(e) => setAttempt(e.target.value)}
            placeholder="Type or assemble your generated answer here..."
            disabled={submitting || Boolean(evaluationResult?.isCorrect)}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="submit"
              disabled={!attempt.trim() || submitting || Boolean(evaluationResult?.isCorrect)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>{submitting ? 'Verifying...' : 'Submit Generation'}</span>
            </button>

            {evaluationResult?.isCorrect && onAdvanceTier && (
              <button
                type="button"
                onClick={onAdvanceTier}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
              >
                <span>Advance to Next Tier</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
