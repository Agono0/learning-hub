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
  Sparkles,
} from 'lucide-react'
import { curriculumApi, curriculumKeys, type LessonView } from '@/lib/curriculum-api'
import { useIdParam } from '@/lib/use-id-param'
import { Badge, Button, Callout, EmptyState, Markdown, Panel } from '@/ui'
import { ExercisePractice } from '@/ui/exercises'
import { ClayIn, staggerDelay } from '@/lib/motion'

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
  // ClayIn gives the panel a one-shot rise on mount; the step-reveal state below
  // never re-triggers it (delayS is stable). SSR-safe: final state rendered
  // server-side, hidden state applied imperatively client-side only when
  // motionOK() allows.
  return (
    <ClayIn delayS={staggerDelay(1 + index)}>
      <Panel title={example.title ?? `Worked example ${index + 1}`}>
        <Markdown>{example.problem}</Markdown>
        <ol className="space-y-2">
          {example.steps.slice(0, shown).map((step, i) => (
            <li
              key={i}
              className="flex gap-2 rounded-xl bg-neutral-50 px-3 py-2 text-sm dark:bg-(--hub-panel)"
            >
              <span className="font-semibold tabular-nums text-ac-text">{i + 1}.</span>
              <Markdown className="min-w-0 flex-1">{step}</Markdown>
            </li>
          ))}
        </ol>
        {!allShown ? (
          <div className="space-y-1">
            <p className="text-xs text-tertiary">
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
    </ClayIn>
  )
}

function KeyTerms({ terms }: { terms: NonNullable<Content['keyTerms']> }) {
  const [open, setOpen] = useState<Set<number>>(new Set())
  // One-shot panel rise on mount (ClayIn); term toggles below never re-trigger
  // it. SSR-safe: final state server-side, imperative hide client-side only
  // when motionOK() allows.
  return (
    <ClayIn delayS={staggerDelay(1)}>
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
                    ? 'mt-1 text-sm text-neutral-600 dark:text-secondary'
                    : 'mt-1 text-xs text-faint'
                }
              >
                {open.has(i) ? t.definition : 'What does it mean?'}
              </dd>
            </button>
          ))}
        </dl>
      </Panel>
    </ClayIn>
  )
}

function Lesson() {
  const id = useIdParam()
  const qc = useQueryClient()
  const pending = useStudyTimer(id)
  const [reflections, setReflections] = useState<string[]>([])
  const [answered, setAnswered] = useState(0)
  const [pretestOpen, setPretestOpen] = useState(false)
  const [pretestDone, setPretestDone] = useState(false)
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
  if (isLoading) return <p className="text-sm text-tertiary">Loading…</p>
  if (error || !data) return <Callout tone="danger">{error?.message ?? 'Lesson not found'}</Callout>

  const { lesson, course, module, exercises } = data
  const content = lesson.content ?? { body: '' }
  const done = data.status === 'completed' || complete.isSuccess

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <nav
        className="flex flex-wrap items-center gap-1 text-sm text-tertiary"
        aria-label="Breadcrumb"
      >
        <Link href={`/courses/course?id=${course.id}`} className="hover:underline">
          {course.emoji} {course.title}
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate">{module.title}</span>
      </nav>

      {/* Lesson rhythm: header is the first beat, then the step sections rise in
          sequence. The pretest and practice areas stay instant (they hold the
          interactive ExercisePractice components). SSR-safe: ClayIn renders the
          final state server-side and animates client-side only when motionOK(). */}
      <ClayIn>
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
      </ClayIn>

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
        <ClayIn delayS={staggerDelay(1)}>
          <Callout tone="accent" title="In a nutshell">
            <Markdown>{content.summary}</Markdown>
          </Callout>
        </ClayIn>
      )}

      {exercises.length > 0 && !done && (
        <section className="space-y-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 dark:border-indigo-500/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-indigo-300 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-status-warning-text" />
                Priming Pretest (Pretesting Effect)
              </h2>
              <p className="mt-0.5 text-xs text-faint">
                Attempting to answer before study boosts retention (d &approx; 0.30; Richland &amp;
                Kornell 2009) by opening curiosity gaps. Pretest guesses NEVER affect your Elo
                rating or mastery scores!
              </p>
            </div>
            {pretestOpen ? (
              <button
                type="button"
                onClick={() => setPretestOpen(false)}
                className="text-xs text-faint hover:text-neutral-200"
              >
                Skip pretest &darr;
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPretestOpen(true)}
                className="btn-ghost text-xs border border-indigo-500/40 text-indigo-300"
              >
                Take Priming Pretest
              </button>
            )}
          </div>

          {pretestOpen && (
            <div className="space-y-3 pt-2">
              <ExercisePractice
                cardId={exercises[0].cardId}
                exercise={exercises[0].exercise}
                isPretest
                onAnswered={() => setPretestDone(true)}
              />
              {pretestDone && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setPretestOpen(false)}
                    className="btn text-xs"
                  >
                    Continue to Lesson Theory &rarr;
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Theory sections rise in sequence (index-capped delays keep the total
          stagger under the motion law's 300ms budget). ClayIn as="section" keeps
          the original semantic tag and classes. */}
      {(content.theory ?? []).map((section, i) => (
        <ClayIn key={i} as="section" className="space-y-2" delayS={staggerDelay(1 + i)}>
          {section.heading && <h2 className="text-lg font-semibold">{section.heading}</h2>}
          <Markdown>{section.body}</Markdown>
        </ClayIn>
      ))}

      {(content.workedExamples ?? []).map((ex, i) => (
        <WorkedExample key={i} example={ex} index={i} />
      ))}

      {content.keyTerms && content.keyTerms.length > 0 && <KeyTerms terms={content.keyTerms} />}

      {exercises.length > 0 && (
        <section className="space-y-3" aria-label="Practice">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Practice</h2>
            <span className="text-xs text-tertiary">
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
        <ClayIn delayS={staggerDelay(1)}>
          <Panel title="Reflect">
            <p className="text-xs text-tertiary">
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
        </ClayIn>
      )}

      {content.resources && content.resources.length > 0 && (
        <ClayIn delayS={staggerDelay(2)}>
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
                  {r.kind && <span className="ml-1 text-xs text-tertiary">({r.kind})</span>}
                </li>
              ))}
            </ul>
          </Panel>
        </ClayIn>
      )}

      <Panel>
        {complete.isSuccess ? (
          <div className="flex items-center gap-2 text-sm">
            <PartyPopper className="h-5 w-5 text-status-warning-text" />
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
    <Suspense fallback={<p className="text-sm text-tertiary">Loading…</p>}>
      <Lesson />
    </Suspense>
  )
}
