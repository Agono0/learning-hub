'use client'

import React from 'react'

/**
 * Final exam (?id= course). Answer everything, then submit once: the server
 * grades every question and returns per-question feedback. The time limit is
 * shown as guidance only — a calm exam measures knowledge, not panic.
 */
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { curriculumApi, curriculumKeys, type ExamResult } from '@/lib/curriculum-api'
import { useIdParam } from '@/lib/use-id-param'
import { Button, Callout, EmptyState, Markdown, PageHeader, Panel, Skeleton } from '@/ui'
import { ExerciseInput, defaultAnswer, isAnswerReady, type AnswerValue } from '@/ui/exercises'
import { ClayIn, Reveal } from '@/lib/motion'
import { useGsapCountUp } from '@/lib/useGsapCountUp'

/**
 * GSAP moment for this page: the exam score counts up from the previous value
 * on the result banner. SSR and reduced-motion render the final number (the
 * hook only rewrites textContent client-side when motionOK()).
 */
function CountUp({ value }: { value: number }) {
  const ref = useGsapCountUp(value)
  return <span ref={ref}>{value}</span>
}

/** Loading skeleton shaped like the exam page (header + question panels). */
function ExamSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}

function Exam() {
  const id = useIdParam()
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: curriculumKeys.exam(id ?? 0),
    queryFn: () => curriculumApi.exam(id!),
    enabled: id !== null,
  })
  const [answers, setAnswers] = useState<(AnswerValue | undefined)[]>([])
  const [result, setResult] = useState<ExamResult | null>(null)
  const submit = useMutation({
    mutationFn: () =>
      curriculumApi.submitExam(
        id!,
        data!.exercises.map((e, i) => answers[i] ?? defaultAnswer(e) ?? null),
      ),
    onSuccess: (r) => {
      setResult(r)
      void qc.invalidateQueries({ queryKey: curriculumKeys.all })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
  })

  if (id === null)
    return (
      <EmptyState
        title="No course selected"
        action={
          <Link className="btn" href="/courses">
            All courses
          </Link>
        }
      />
    )
  if (isLoading) return <ExamSkeleton />
  if (error || !data)
    return <Callout tone="danger">{error?.message ?? 'This course has no final exam.'}</Callout>

  const unanswered = data.exercises.filter(
    (e, i) => !isAnswerReady(e, answers[i] ?? defaultAnswer(e)),
  ).length

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/courses/course?id=${id}`} className="text-sm text-tertiary hover:underline">
        ← Back to course
      </Link>
      {/* Entrance beat: header first. SSR-safe — ClayIn renders the final state
          server-side and animates client-side only when motionOK() allows. */}
      <ClayIn>
        <PageHeader
          title="Final exam"
          subtitle={`${data.exercises.length} questions · pass with ${Math.round(data.passScore * 100)}%${data.bestScore !== null ? ` · your best so far: ${Math.round(data.bestScore * 100)}%` : ''}`}
          icon={
            data.minutes ? (
              <Clock className="h-5 w-5 text-faint" aria-label={`about ${data.minutes} minutes`} />
            ) : undefined
          }
        />
      </ClayIn>

      {result && (
        <ClayIn>
          <Callout
            tone={result.passed ? 'success' : 'warning'}
            title={
              result.passed ? (
                <>
                  Passed with <CountUp value={Math.round(result.score * 100)} />%
                </>
              ) : (
                <>
                  <CountUp value={Math.round(result.score * 100)} />% —{' '}
                  {Math.round(result.passScore * 100)}% needed
                </>
              )
            }
          >
            {result.passed ? (
              result.certificate?.eligible ? (
                <Link
                  href={`/courses/certificate?id=${id}`}
                  className="mt-2 inline-flex items-center gap-1 font-medium underline"
                >
                  <Award className="h-4 w-4" /> Claim your certificate
                </Link>
              ) : (
                <p>To get the certificate: {result.certificate?.missing.join('; ')}</p>
              )
            ) : (
              <p>
                Review the explanations below, practise the weak lessons, and try again — retesting
                after feedback is how this sticks.
              </p>
            )}
          </Callout>
        </ClayIn>
      )}

      {data.minutes && !result && (
        <p className="text-xs text-tertiary">
          Suggested time: about {data.minutes} minutes. There is no countdown — take the time you
          need.
        </p>
      )}

      {/* Question panels reveal on scroll (once) — a calm exam reads section by
          section; in-view panels reveal immediately, inputs stay fully
          interactive. SSR-safe via the foundation's imperative hiding. */}
      {data.exercises.map((exercise, i) => {
        const r = result?.results[i]
        return (
          <Reveal key={i}>
            <Panel
              title={<span className="text-tertiary">Question {i + 1}</span>}
              actions={
                r &&
                (r.correct ? (
                  <CheckCircle2 className="h-5 w-5 text-status-success-text" aria-label="correct" />
                ) : (
                  <XCircle className="h-5 w-5 text-danger-text" aria-label="incorrect" />
                ))
              }
            >
              <Markdown>{exercise.prompt}</Markdown>
              <ExerciseInput
                exercise={exercise}
                value={answers[i] ?? defaultAnswer(exercise)}
                disabled={Boolean(result) || submit.isPending}
                onChange={(v) =>
                  setAnswers((a) => {
                    const next = [...a]
                    next[i] = v
                    return next
                  })
                }
              />
              {r && (
                <div className="space-y-1 text-sm">
                  {r.feedback.map((f, j) => (
                    <p key={j}>{f}</p>
                  ))}
                  {exercise.explanation && (
                    <Markdown className="text-secondary">{exercise.explanation}</Markdown>
                  )}
                </div>
              )}
            </Panel>
          </Reveal>
        )
      })}

      {!result ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button loading={submit.isPending} onClick={() => submit.mutate()}>
            Submit exam
          </Button>
          {unanswered > 0 && (
            <span className="text-xs text-tertiary">
              {unanswered} question(s) unanswered — they count as wrong.
            </span>
          )}
          {submit.error && <Callout tone="danger">{submit.error.message}</Callout>}
        </div>
      ) : (
        <Button
          variant="ghost"
          onClick={() => {
            setResult(null)
            setAnswers([])
          }}
        >
          Retake
        </Button>
      )}
    </div>
  )
}

export default function ExamPage() {
  return (
    <Suspense fallback={<ExamSkeleton />}>
      <Exam />
    </Suspense>
  )
}
