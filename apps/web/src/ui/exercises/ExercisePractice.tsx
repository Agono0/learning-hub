'use client'

/**
 * One exercise in practice mode: prompt → (optional hint) → answer →
 * confidence → Check (graded on the server) → feedback + explanation.
 *
 * Learning-science built in:
 * - the hint is opt-in, so the learner attempts retrieval first;
 * - "How sure are you?" feeds hypercorrection (confident errors are
 *   corrected best — Butterfield & Metcalfe 2001) and calibration stats;
 * - after answering, a "why?" prompt invites elaborative interrogation
 *   (Pressley et al. 1987) before moving on.
 */
import { useState } from 'react'
import { CheckCircle2, CircleDashed, Lightbulb, XCircle } from 'lucide-react'
import type { Exercise, GradeResult } from '@learning-hub/core/practice'
import { apiSend } from '@/lib/transport'
import { Badge } from '../Feedback'
import { Button } from '../Button'
import { Markdown } from '../Markdown'
import { cx } from '../cx'
import { ExerciseInput, defaultAnswer, isAnswerReady, type AnswerValue } from './inputs'

export interface PracticeResponse {
  result: GradeResult
  explanation: string | null
  review: { due: string; xpEarned: number; streak: number | null } | null
}

const TYPE_LABEL: Record<Exercise['type'], string> = {
  mcq: 'Multiple choice',
  multi: 'Select all',
  truefalse: 'True / false',
  numeric: 'Numeric',
  typein: 'Recall',
  cloze: 'Fill the blanks',
  ordering: 'Put in order',
  parsons: 'Arrange the code',
  matching: 'Match',
  categorize: 'Sort',
  freetext: 'Explain',
  code: 'Code',
}

/** Days until a due date, phrased calmly ("tomorrow", "in 4 days"). */
function dueLabel(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (days <= 0) return 'later today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

export function ExercisePractice({
  cardId,
  exercise,
  index,
  total,
  onAnswered,
  isPretest,
}: {
  cardId: number
  exercise: Exercise
  /** 1-based position in the lesson (for "2 of 6"). */
  index?: number
  total?: number
  onAnswered?: (response: PracticeResponse) => void
  isPretest?: boolean
}) {
  const [value, setValue] = useState<AnswerValue | undefined>(() => defaultAnswer(exercise))
  const [confidence, setConfidence] = useState<0 | 1>(1)
  const [showHint, setShowHint] = useState(false)
  const [response, setResponse] = useState<PracticeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [startedAt] = useState(() => Date.now())

  const check = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await apiSend<PracticeResponse>('/api/curriculum/practice', 'POST', {
        cardId,
        answer: value ?? defaultAnswer(exercise),
        confidence,
        timeMs: Date.now() - startedAt,
        pretest: isPretest,
      })
      setResponse(r)
      onAnswered?.(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check the answer.')
    } finally {
      setBusy(false)
    }
  }

  const result = response?.result
  const tone = !result ? null : result.correct ? 'success' : result.score > 0 ? 'warning' : 'danger'

  return (
    <article className="panel space-y-4" aria-label={`Exercise ${index ?? ''}`}>
      <header className="flex flex-wrap items-center gap-2 text-xs text-tertiary">
        <Badge tone="accent">{TYPE_LABEL[exercise.type]}</Badge>
        {isPretest && <Badge tone="neutral">Priming Pretest</Badge>}
        {index !== undefined && total !== undefined && (
          <span>
            {index} of {total}
          </span>
        )}
        {exercise.difficulty && (
          <span aria-label={`difficulty ${exercise.difficulty} of 5`}>
            {'●'.repeat(exercise.difficulty)}
            {'○'.repeat(5 - exercise.difficulty)}
          </span>
        )}
      </header>

      <Markdown>{exercise.prompt}</Markdown>

      {exercise.hint &&
        !response &&
        (showHint ? (
          <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" /> {exercise.hint}
          </p>
        ) : (
          <button
            type="button"
            className="text-xs text-tertiary underline underline-offset-2"
            onClick={() => setShowHint(true)}
          >
            Need a hint? (try first — it helps you remember)
          </button>
        ))}

      <ExerciseInput
        exercise={exercise}
        value={value}
        onChange={setValue}
        disabled={Boolean(response) || busy}
      />

      {!response ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="radiogroup"
            aria-label="How sure are you?"
            className="flex items-center gap-1 text-xs"
          >
            <span className="mr-1 text-tertiary">How sure?</span>
            {([1, 0] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={confidence === c}
                onClick={() => setConfidence(c)}
                className={cx(
                  'rounded-full px-3 py-1',
                  confidence === c
                    ? 'bg-indigo-600 text-white'
                    : 'bg-neutral-100 dark:bg-(--hub-panel-2)',
                )}
              >
                {c ? 'Sure' : 'Guessing'}
              </button>
            ))}
          </div>
          <Button onClick={check} loading={busy} disabled={!isAnswerReady(exercise, value)}>
            Check
          </Button>
        </div>
      ) : (
        <div
          aria-live="polite"
          className={cx(
            'space-y-2 rounded-xl px-3 py-3 text-sm',
            tone === 'success' && 'bg-emerald-600/10',
            tone === 'warning' && 'bg-amber-500/10',
            tone === 'danger' && 'bg-rose-600/10',
          )}
        >
          <div className="flex items-center gap-2 font-medium">
            {result?.pending ? (
              <CircleDashed className="h-5 w-5" />
            ) : result?.correct ? (
              <CheckCircle2 className="h-5 w-5 text-status-success-text" />
            ) : (
              <XCircle className="h-5 w-5 text-rose-600" />
            )}
            {result?.pending
              ? 'Saved'
              : result?.correct
                ? 'Correct'
                : result && result.score > 0
                  ? `Partly right (${Math.round(result.score * 100)}%)`
                  : 'Not yet'}
            {response.review ? (
              <span className="ml-auto text-xs font-normal text-tertiary">
                Next review {dueLabel(response.review.due)}
              </span>
            ) : isPretest ? (
              <span className="ml-auto text-xs font-medium text-indigo-400">
                Mind primed for study (Excluded from Elo/BKT)
              </span>
            ) : null}
          </div>
          {/* the header already says "Correct" — don't repeat a bare "Correct." line */}
          {result?.feedback
            .filter((f) => f !== 'Correct.')
            .map((f, i) => (
              <p key={i}>{f}</p>
            ))}
          {response.explanation && (
            <Markdown className="border-t border-black/5 pt-2 dark:border-white/10">
              {response.explanation}
            </Markdown>
          )}
          {!result?.pending && (
            <p className="text-xs text-tertiary">
              Before moving on: why is this the answer? Say it in one sentence.
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </article>
  )
}
