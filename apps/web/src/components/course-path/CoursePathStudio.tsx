'use client'

import React, { useEffect, useMemo, useState } from 'react'
import type { Issue } from '@learning-hub/core/curriculum'
import type { LessonFrontier, LintFinding, PlanResult } from '@learning-hub/core/course-path'
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  PageHeader,
  Panel,
  SelectField,
  TextArea,
  TextField,
} from '@/ui'
import { analyze, type Analysis } from './analyze'
import { EXAMPLE_COURSE } from './example-course'
import {
  COURSE_PATH_STORAGE_KEY,
  MASTERY_LEVELS,
  defaultPrefs,
  readPrefs,
  writePrefs,
  type MasteryLevelId,
  type PathPrefs,
} from './state'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function localDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const STAGE_LABEL: Record<LessonFrontier['stage'], string> = {
  completed: 'Done',
  'in-progress': 'In progress',
  ready: 'Ready',
  'soft-locked': 'Better later',
}

export function ParseIssues({ errors }: { errors: Issue[] }) {
  return (
    <Callout tone="danger" title="This course could not be read">
      <ul className="list-disc pl-5" data-testid="course-issues">
        {errors.slice(0, 8).map((e, i) => (
          <li key={i}>
            {e.path ? `${e.path}: ` : ''}
            {e.message}
            {e.hint ? ` ${e.hint}` : ''}
          </li>
        ))}
      </ul>
      {errors.length > 8 && <p>{`${errors.length - 8} more problems not shown.`}</p>}
    </Callout>
  )
}

export function LessonList({
  analysis,
  onStatus,
}: {
  analysis: Analysis
  onStatus: (slug: string, done: boolean) => void
}) {
  const stages = new Map(analysis.frontier.lessons.map((l) => [l.slug, l]))
  const skillName = new Map(analysis.model.skills.map((s) => [s.slug, s.name]))
  const names = (slugs: string[]) => slugs.map((s) => skillName.get(s) ?? s).join(', ')
  return (
    <div className="space-y-4" data-testid="lesson-list">
      {analysis.course.modules.map((mod) => (
        <section key={mod.slug} aria-label={mod.title}>
          <h3 className="mb-2 text-sm font-semibold">{mod.title}</h3>
          <ul className="space-y-2">
            {mod.lessons.map((l) => {
              const f = stages.get(l.slug)
              if (!f) return null
              return (
                <li
                  key={l.slug}
                  className="rounded-lg border p-2 text-sm"
                  data-testid={`lesson-${l.slug}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={f.stage === 'completed'}
                        onChange={(e) => onStatus(l.slug, e.target.checked)}
                      />
                      <span className="font-medium">{l.title}</span>
                    </label>
                    <Badge>{STAGE_LABEL[f.stage]}</Badge>
                    <span className="text-xs opacity-70">{`${f.minutes} min`}</span>
                  </div>
                  {f.stage === 'soft-locked' && (
                    <p className="mt-1 text-xs opacity-80" data-testid={`why-${l.slug}`}>
                      {`Needs ${names(f.blockedBy)} first.`}
                      {f.fixFirst.length > 0 && !f.fixFirst.every((s) => f.blockedBy.includes(s))
                        ? ` Start with ${names(f.fixFirst)}.`
                        : ''}
                      {' You can still open it.'}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function PlanView({ plan, note }: { plan: PlanResult | null; note: string | null }) {
  if (!plan) return <EmptyState title="No plan yet">{note ?? ''}</EmptyState>
  const day = new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return (
    <div className="space-y-3" data-testid="plan">
      {plan.status === 'fits' && (
        <Callout tone="success" title="This fits before the deadline">
          {`${plan.totalRemainingMinutes} minutes of lessons across ${plan.days.filter((d) => d.entries.length).length} study days, with ${plan.reviewsScheduled} review(s) scheduled.`}
        </Callout>
      )}
      {plan.status === 'fits-without-reviews' && (
        <Callout tone="warning" title="Lessons fit, but only without reviews">
          <span data-testid="plan-no-reviews">
            No review slots are scheduled. This plan finishes the lessons; it does not mean you will
            remember them. Add study time or a later day to make room for reviews.
          </span>
        </Callout>
      )}
      {plan.status === 'does-not-fit' && (
        <Callout tone="warning" title="This does not fit before the deadline">
          <span data-testid="plan-shortfall">{`${plan.shortfallMinutes} minutes are left over. Add study time, move the deadline, or drop lessons.`}</span>
        </Callout>
      )}
      {!plan.prerequisiteSafe && (
        <Callout tone="warning" title="Some prerequisites are not covered by this course">
          <ul className="list-disc pl-5" data-testid="plan-unmet">
            {plan.unmetPrerequisites.slice(0, 5).map((u, i) => (
              <li
                key={i}
              >{`${u.lesson} builds on ${u.prerequisite}, which is not Solid yet and no remaining lesson teaches it.`}</li>
            ))}
            {plan.outOfOrder.map((o) => (
              <li key={o.lesson}>{`${o.lesson} could not be ordered after its prerequisites.`}</li>
            ))}
          </ul>
        </Callout>
      )}
      {plan.status === 'fits' &&
        (plan.reviewsOverdueUnscheduled > 0 || plan.reviewsAfterLastStudyDay > 0) && (
          <p className="text-xs opacity-80" data-testid="plan-review-counts">
            {`${plan.reviewsOverdueUnscheduled} review(s) had no room and ${plan.reviewsAfterLastStudyDay} fall after your last study day.`}
          </p>
        )}
      {plan.defaultEstimate.length > 0 && (
        <p className="text-xs opacity-80" data-testid="plan-defaults">
          {`${plan.defaultEstimate.length} lesson(s) have no time estimate and count as 20 minutes.`}
        </p>
      )}
      <ol className="space-y-2">
        {plan.days
          .filter((d) => d.entries.length)
          .map((d) => (
            <li key={d.date} className="rounded-lg border p-2 text-sm" data-testid="plan-day">
              <div className="flex justify-between font-medium">
                <span>{day.format(new Date(`${d.date}T00:00:00Z`))}</span>
                <span className="opacity-70">{`${d.minutes} min`}</span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {d.entries.map((e, i) => (
                  <li key={i}>
                    {e.kind === 'review' ? 'Review: ' : ''}
                    {e.title}
                    <span className="opacity-70">{` · ${e.minutes} min${e.continues ? ' (continues)' : ''}`}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ol>
      {plan.unfinished.length > 0 && (
        <p className="text-xs" data-testid="plan-unfinished">
          {`Not finished: ${plan.unfinished.map((u) => `${u.lesson} (${u.minutesLeft} min)`).join(', ')}.`}
        </p>
      )}
    </div>
  )
}

export function LintList({ findings }: { findings: LintFinding[] }) {
  if (!findings.length) return <p className="text-sm">No course problems found.</p>
  return (
    <ul className="space-y-2 text-sm" data-testid="lint-list">
      {findings.map((f, i) => (
        <li key={i} className="rounded-lg border p-2">
          <div className="flex items-center gap-2">
            <Badge>{f.severity}</Badge>
            <span>{f.message}</span>
          </div>
          <p className="mt-1 text-xs opacity-80">{f.hint}</p>
        </li>
      ))}
    </ul>
  )
}

export function CoursePathStudio() {
  const [prefs, setPrefs] = useState<PathPrefs>(defaultPrefs)
  const [loaded, setLoaded] = useState(false)
  const [unreadable, setUnreadable] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [today, setToday] = useState('')

  useEffect(() => {
    let raw: string | null = null
    try {
      raw = window.localStorage.getItem(COURSE_PATH_STORAGE_KEY)
    } catch {
      /* blocked storage: start empty */
    }
    const r = readPrefs(raw)
    setPrefs(r.prefs)
    setUnreadable(r.unreadable)
    setToday(localDateKey(new Date()))
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded || unreadable) return
    try {
      window.localStorage.setItem(COURSE_PATH_STORAGE_KEY, writePrefs(prefs))
      setSaveFailed(false)
    } catch {
      setSaveFailed(true)
    }
  }, [prefs, loaded, unreadable])

  const result = useMemo(() => (today ? analyze(prefs, today) : null), [prefs, today])
  const update = (patch: Partial<PathPrefs>) => setPrefs((p) => ({ ...p, ...patch }))
  const analysis = result?.ok ? result.value : null

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <PageHeader
        title="Course path"
        subtitle="See what to study next in a course and a plan that fits your deadline."
      />

      {unreadable && (
        <Callout tone="warning" title="Saved course path data could not be read">
          <p>Your changes will not be saved until you reset.</p>
          <Button
            variant="secondary"
            onClick={() => {
              try {
                const raw = window.localStorage.getItem(COURSE_PATH_STORAGE_KEY)
                if (raw !== null)
                  window.localStorage.setItem(`${COURSE_PATH_STORAGE_KEY}.backup`, raw)
                window.localStorage.removeItem(COURSE_PATH_STORAGE_KEY)
              } catch {
                /* ignore */
              }
              setUnreadable(false)
              setPrefs(defaultPrefs())
            }}
          >
            Reset saved data
          </Button>
        </Callout>
      )}
      {saveFailed && (
        <Callout tone="warning">
          Could not save in this browser. The page still works until you leave it.
        </Callout>
      )}

      <Panel title="Course">
        <TextArea
          label="Course file (JSON, YAML or Markdown)"
          rows={6}
          value={prefs.source}
          onChange={(e) => update({ source: e.target.value.slice(0, 1_000_000) })}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              update({ source: JSON.stringify(EXAMPLE_COURSE, null, 2), levels: {}, status: {} })
            }
          >
            Load example course
          </Button>
          {prefs.source && (
            <Button variant="ghost" onClick={() => update({ source: '', levels: {}, status: {} })}>
              Clear
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs opacity-80">
          Everything stays in this browser. Skill levels and done lessons are what you enter here.
        </p>
      </Panel>

      {result && !result.ok && prefs.source.trim() && <ParseIssues errors={result.errors} />}
      {!prefs.source.trim() && (
        <EmptyState title="No course yet">
          Paste a course file or load the example to begin.
        </EmptyState>
      )}

      {analysis && (
        <>
          <Callout tone="accent" title={analysis.course.title}>
            <span data-testid="next-lesson">
              {analysis.frontier.next
                ? `Next: ${analysis.model.lessons.find((l) => l.slug === analysis.frontier.next)?.title}`
                : 'All lessons are done.'}
            </span>
            {` · ${analysis.frontier.completed} of ${analysis.frontier.total} done`}
          </Callout>

          <Panel title="Your skill levels">
            <div className="grid gap-3 sm:grid-cols-2">
              {analysis.model.skills.map((s) => (
                <SelectField
                  key={s.slug}
                  label={s.name}
                  value={prefs.levels[s.slug] ?? 'new'}
                  onChange={(e) =>
                    update({
                      levels: { ...prefs.levels, [s.slug]: e.target.value as MasteryLevelId },
                    })
                  }
                >
                  {MASTERY_LEVELS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </SelectField>
              ))}
            </div>
            <p className="mt-2 text-xs opacity-80">
              A lesson is marked "better later" until the skills it builds on are Solid.
            </p>
          </Panel>

          {analysis.frontier.unlockers.length > 0 && (
            <Panel title="Work on these first">
              <ol className="list-decimal space-y-1 pl-5 text-sm" data-testid="unlockers">
                {analysis.frontier.unlockers.map((u) => (
                  <li key={u.skill}>
                    {`${u.name}: ${u.downstreamLessons} later lesson(s) depend on it, about ${u.minutesToTrain} min to train.`}
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          <Panel title="Lessons">
            <LessonList
              analysis={analysis}
              onStatus={(slug, done) =>
                update({ status: { ...prefs.status, [slug]: done ? 'completed' : 'not_started' } })
              }
            />
          </Panel>

          <Panel title="Plan to a last study day">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Last study day (included)"
                type="date"
                value={prefs.deadline}
                min={today}
                onChange={(e) => update({ deadline: e.target.value })}
              />
              <TextField
                label="Minutes per study day"
                type="number"
                min={1}
                max={1440}
                value={String(prefs.minutesPerDay)}
                onChange={(e) =>
                  update({ minutesPerDay: e.target.value === '' ? 0 : Number(e.target.value) })
                }
              />
            </div>
            <fieldset className="mt-3">
              <legend className="text-sm">Days off</legend>
              <div className="mt-1 flex flex-wrap gap-3 text-sm">
                {WEEKDAYS.map((name, d) => (
                  <label key={name} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={prefs.restWeekdays.includes(d)}
                      onChange={(e) =>
                        update({
                          restWeekdays: e.target.checked
                            ? [...prefs.restWeekdays, d]
                            : prefs.restWeekdays.filter((x) => x !== d),
                        })
                      }
                    />
                    {name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-3">
              <PlanView
                plan={analysis.plan}
                note={
                  prefs.minutesPerDay < 1
                    ? 'Minutes per day must be at least 1.'
                    : analysis.planNote
                }
              />
            </div>
          </Panel>

          <Panel title="Course checks">
            <LintList findings={analysis.lint} />
          </Panel>
        </>
      )}
    </div>
  )
}
