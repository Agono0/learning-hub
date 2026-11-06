'use client'

/**
 * Lesson player (?id=). The order is deliberate:
 *   summary (advance organizer, Ausubel 1960) → theory → worked examples
 *   revealed step by step, predicting each next step first (worked-example +
 *   self-explanation effects) → key terms hidden until tapped (retrieval, not
 *   re-reading) → practice (every exercise is a scheduled review card) →
 *   reflection prompts (elaboration) → complete.
 * Study time is counted only while the page is visible.
 */
import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookMarked,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Lock,
  PartyPopper,
} from 'lucide-react'
import { curriculumApi, curriculumKeys, type LessonView } from '@/lib/curriculum-api'
import { useIdParam } from '@/lib/use-id-param'
import { Badge, Button, Callout, EmptyState, Markdown, Panel } from '@/ui'
import { ExercisePractice } from '@/ui/exercises'

type Content = NonNullable<LessonView['lesson']['content']>

/** Report visible study time every minute (and on leave) while the lesson is open. */
function useStudyTimer(lessonId: number | null) {
  const pending = useRef(0)
  useEffect(() => {
    if (lessonId === null) return
    void curriculumApi.lessonAction(lessonId, { action: 'start' })
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') pending.current += 1
    }, 1000)
    const flush = () => {
      if (pending.current > 0) {
        const seconds = pending.current
        pending.current = 0
        void curriculumApi
          .lessonAction(lessonId, { action: 'time', timeSpentSec: seconds })
          .catch(() => undefined)
      }
    }
    const report = setInterval(flush, 60_000)
    return () => {
      clearInterval(tick)
      clearInterval(report)
      flush()
    }
  }, [lessonId])
  return pending
}

function WorkedExample({
  example,
  index,
}: {
  example: NonNullable<Content['workedExamples']>[number]
  index: number
}) {
  const [shown, setShown] = useState(0)
  const allShown = shown >= example.steps.length
  return (
    <Panel title={example.title ?? `Worked example ${index + 1}`}>
      <Markdown>{example.problem}</Markdown>
      <ol className="space-y-2">
        {example.steps.slice(0, shown).map((step, i) => (
          <li
            key={i}
            className="flex gap-2 rounded-xl bg-neutral-50 px-3 py-2 text-sm dark:bg-(--hub-panel)"
          >
            <span className="font-semibold tabular-nums text-indigo-500">{i + 1}.</span>
            <Markdown className="min-w-0 flex-1">{step}</Markdown>
          </li>
        ))}
      </ol>
      {!allShown ? (
        <div className="space-y-1">
          <p className="text-xs text-neutral-500">
            Predict step {shown + 1} in your head first, then check.
          </p>
          <Button
            variant="ghost"
            icon={<Eye className="h-4 w-4" />}
            onClick={() => setShown((s) => s + 1)}
          >
            Show step {shown + 1} of {example.steps.length}
          </Button>
        </div>
      ) : (
        example.answer && (
          <Callout tone="success" title="Answer">
            <Markdown>{example.answer}</Markdown>
          </Callout>
        )
      )}
    </Panel>
  )
}

function KeyTerms({ terms }: { terms: NonNullable<Content['keyTerms']> }) {
  const [open, setOpen] = useState<Set<number>>(new Set())
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <BookMarked className="h-4 w-4" /> Key terms — recall, then tap to check
        </span>
      }
    >
      <dl className="grid gap-2 sm:grid-cols-2">
        {terms.map((t, i) => (
          <button
            key={i}
            type="button"
            aria-expanded={open.has(i)}
            onClick={() =>
              setOpen((s) => new Set(s.has(i) ? [...s].filter((x) => x !== i) : [...s, i]))
            }
            className="rounded-xl border border-neutral-200 p-3 text-left dark:border-(--hub-border)"
          >
            <dt className="font-medium">{t.term}</dt>
            <dd
              className={
                open.has(i)
                  ? 'mt-1 text-sm text-neutral-600 dark:text-neutral-300'
                  : 'mt-1 text-xs text-neutral-400'
              }
            >
              {open.has(i) ? t.definition : 'What does it mean?'}
            </dd>
          </button>
        ))}
      </dl>
    </Panel>
  )
}

function Lesson() {
  const id = useIdParam()
  const qc = useQueryClient()
  const pending = useStudyTimer(id)
  const [reflections, setReflections] = useState<string[]>([])
  const [answered, setAnswered] = useState(0)
  const { data, isLoading, error } = useQuery({
    queryKey: curriculumKeys.lesson(id ?? 0),
    queryFn: () => curriculumApi.lesson(id!),
    enabled: id !== null,
  })

  const complete = useMutation({
    mutationFn: () => {
      const seconds = pending.current
      pending.current = 0
      return curriculumApi.lessonAction(id!, {
        action: 'complete',
        reflections,
        timeSpentSec: seconds,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: curriculumKeys.all }),
  })

  if (id === null)
    return (
      <EmptyState
        title="No lesson selected"
        action={
          <Link className="btn" href="/courses">
            All courses
          </Link>
        }
      />
    )
  if (isLoading) return <p className="text-sm text-neutral-500">Loading…</p>
  if (error || !data) return <Callout tone="danger">{error?.message ?? 'Lesson not found'}</Callout>

  const { lesson, course, module, exercises } = data
  const content = lesson.content ?? { body: '' }
  const done = data.status === 'completed' || complete.isSuccess

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <nav
        className="flex flex-wrap items-center gap-1 text-sm text-neutral-500"
        aria-label="Breadcrumb"
      >
        <Link href={`/courses/course?id=${course.id}`} className="hover:underline">
          {course.emoji} {course.title}
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate">{module.title}</span>
      </nav>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{lesson.title}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="accent">{lesson.type}</Badge>
          {lesson.estMinutes && <Badge>{lesson.estMinutes} min</Badge>}
          {done && (
            <Badge tone="success">
              <CheckCircle2 className="h-3 w-3" /> Completed
            </Badge>
          )}
        </div>
        {lesson.objective && (
          <p className="text-sm">
            <span className="font-medium">Goal:</span> {lesson.objective}
          </p>
        )}
      </header>

      {data.locked && !done && (
        <Callout
          tone="warning"
          title={
            <span className="flex items-center gap-1">
              <Lock className="h-4 w-4" /> Builds on skills you haven’t mastered yet
            </span>
          }
        >
          You can study it now — or do the earlier lessons first for an easier ride.
        </Callout>
      )}

      {content.summary && (
        <Callout tone="accent" title="In a nutshell">
          <Markdown>{content.summary}</Markdown>
        </Callout>
      )}

      {(content.theory ?? []).map((section, i) => (
        <section key={i} className="space-y-2">
          {section.heading && <h2 className="text-lg font-semibold">{section.heading}</h2>}
          <Markdown>{section.body}</Markdown>
        </section>
      ))}

      {(content.workedExamples ?? []).map((ex, i) => (
        <WorkedExample key={i} example={ex} index={i} />
      ))}

      {content.keyTerms && content.keyTerms.length > 0 && <KeyTerms terms={content.keyTerms} />}

      {exercises.length > 0 && (
        <section className="space-y-3" aria-label="Practice">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Practice</h2>
            <span className="text-xs text-neutral-500">
              {answered}/{exercises.length} answered · each one returns in your reviews
            </span>
          </div>
          {exercises.map((e, i) => (
            <ExercisePractice
              key={e.cardId}
              cardId={e.cardId}
              exercise={e.exercise}
              index={i + 1}
              total={exercises.length}
              onAnswered={() => setAnswered((n) => n + 1)}
            />
          ))}
        </section>
      )}

      {content.reflection && content.reflection.length > 0 && (
        <Panel title="Reflect">
          <p className="text-xs text-neutral-500">
            Explaining in your own words is one of the strongest ways to understand
            (self-explanation).
          </p>
          {content.reflection.map((q, i) => (
            <label key={i} className="block space-y-1">
              <span className="text-sm font-medium">{q}</span>
              <textarea
                className="input min-h-20"
                value={reflections[i] ?? data.progress?.reflections?.[i] ?? ''}
                onChange={(e) =>
                  setReflections((r) => {
                    const next = [...r]
                    next[i] = e.target.value
                    return next
                  })
                }
              />
            </label>
          ))}
        </Panel>
      )}

      {content.resources && content.resources.length > 0 && (
        <Panel title="Go deeper">
          <ul className="space-y-1 text-sm">
            {content.resources.map((r, i) => (
              <li key={i}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 underline underline-offset-2 dark:text-indigo-300"
                >
                  {r.title} <ExternalLink className="h-3 w-3" />
                </a>
                {r.kind && <span className="ml-1 text-xs text-neutral-500">({r.kind})</span>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel>
        {complete.isSuccess ? (
          <div className="flex items-center gap-2 text-sm">
            <PartyPopper className="h-5 w-5 text-amber-500" />
            Lesson complete{complete.data.xpEarned ? ` · +${complete.data.xpEarned} XP` : ''}. Its
            exercises will come back in your reviews right before you’d forget them.
          </div>
        ) : !done ? (
          <Button
            icon={<CheckCircle2 className="h-4 w-4" />}
            loading={complete.isPending}
            onClick={() => complete.mutate()}
          >
            Mark lesson complete
          </Button>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          {data.prevLessonId ? (
            <Link href={`/courses/lesson?id=${data.prevLessonId}`} className="btn-ghost">
              <ChevronLeft className="h-4 w-4" /> Previous
            </Link>
          ) : (
            <span />
          )}
          {data.nextLessonId ? (
            <Link href={`/courses/lesson?id=${data.nextLessonId}`} className="btn-ghost">
              Next lesson <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link href={`/courses/course?id=${course.id}`} className="btn-ghost">
              Back to course <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </Panel>
    </div>
  )
}

export default function LessonPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading…</p>}>
      <Lesson />
    </Suspense>
  )
}
