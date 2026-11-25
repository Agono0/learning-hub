'use client'

/**
 * Exam prep: pick an exam (or a date) and see a day-by-day review schedule the
 * memory model suggests. Read-only: nothing is scheduled or answered for you.
 * Every number sits next to its assumptions, and the baseline stays apart
 * from the scenario.
 */
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/transport'
import { Badge, Callout, EmptyState, Panel, SelectField, TextField } from '@/ui'
import { AssumptionsBlock } from '@/components/readiness/AssumptionsBlock'
import { PrepDay } from './PrepDay'
import { headline, pct, type ExamPrepResponse } from './types'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function ExamPrepStudio() {
  const [examId, setExamId] = useState('')
  const [date, setDate] = useState('')
  const [perDay, setPerDay] = useState('30')
  const [target, setTarget] = useState('85')
  const [rest, setRest] = useState<number[]>([])

  const exams = useQuery({
    queryKey: ['exam-prep', 'exams'],
    queryFn: () => apiGet<ExamPrepResponse>('/api/readiness'),
  })

  const chosen = examId !== '' || date !== ''
  const perDayN = Math.min(100, Math.max(0, Math.floor(Number(perDay) || 0)))
  const targetN = Math.min(99, Math.max(50, Math.floor(Number(target) || 85)))

  const prep = useQuery({
    queryKey: ['exam-prep', 'plan', examId, date, perDayN, targetN, rest],
    enabled: chosen,
    queryFn: () =>
      apiGet<ExamPrepResponse>('/api/exam-prep', {
        ...(examId !== '' ? { examId: Number(examId) } : { date, title: 'Exam' }),
        perDay: perDayN,
        target: targetN / 100,
        ...(rest.length ? { rest: rest.join(',') } : {}),
      }),
  })

  const plan = prep.data?.plan
  const examDay = plan?.exam.slice(0, 10) ?? ''
  const todayKey = plan?.from ?? ''

  return (
    <div className="space-y-4" data-testid="exam-prep-studio">
      <Panel title="Your exam" data-testid="prep-controls">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Saved exam"
            value={examId}
            onChange={(e) => {
              setExamId(e.target.value)
              if (e.target.value) setDate('')
            }}
            data-testid="prep-exam"
          >
            <option value="">Choose an exam date…</option>
            {(exams.data?.exams ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.title} · {x.date}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Or any date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              if (e.target.value) setExamId('')
            }}
            data-testid="prep-date"
          />
          <TextField
            label="Reviews per study day"
            inputMode="numeric"
            value={perDay}
            onChange={(e) => setPerDay(e.target.value)}
            data-testid="prep-perday"
          />
          <TextField
            label="Target recall (%)"
            inputMode="numeric"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            data-testid="prep-target"
          />
        </div>
        <fieldset className="mt-3">
          <legend className="text-sm font-medium">Rest days</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {DAYS.map((name, i) => (
              <label
                key={name}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-black/15 px-3 text-sm dark:border-white/20"
              >
                <input
                  type="checkbox"
                  checked={rest.includes(i)}
                  onChange={(e) =>
                    setRest(e.target.checked ? [...rest, i].sort() : rest.filter((d) => d !== i))
                  }
                  data-testid={`prep-rest-${i}`}
                />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-2 text-xs opacity-70">
          A date counts through the end of that day. The schedule is a suggestion from a model. It
          does not review anything for you.
        </p>
      </Panel>

      {!chosen && (
        <EmptyState title="Pick an exam date">
          Choose a saved exam or any date to see a day-by-day review schedule toward it.
        </EmptyState>
      )}
      {chosen && prep.isLoading && <Callout tone="neutral">Working it out…</Callout>}
      {chosen && prep.isError && (
        <Callout tone="danger">Could not build the schedule. Check the date and try again.</Callout>
      )}

      {plan && prep.data && (
        <>
          <Panel
            title={prep.data.title ?? 'Exam'}
            actions={
              <Badge tone={plan.expired ? 'danger' : 'accent'}>
                {plan.expired ? 'Date has passed' : `${plan.days.length} days before the exam`}
              </Badge>
            }
            data-testid="prep-summary"
          >
            {plan.summary.seenCards === 0 ? (
              <Callout tone="warning">
                You have not studied any of these cards yet, so there is nothing to schedule.
              </Callout>
            ) : plan.expired ? (
              <Callout tone="warning">This date has passed. There is nothing to schedule.</Callout>
            ) : (
              <div className="space-y-2">
                <p className="text-sm" data-testid="prep-headline">
                  {headline(plan, examDay)}
                </p>
                <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs opacity-70">No more reviews</dt>
                    <dd className="tabular-nums" data-testid="prep-baseline">
                      {pct(plan.summary.baseline)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs opacity-70">If all planned reviews are made</dt>
                    <dd className="tabular-nums" data-testid="prep-planned">
                      {pct(plan.summary.planned)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs opacity-70">Planned reviews</dt>
                    <dd className="tabular-nums">{plan.summary.plannedReviews}</dd>
                  </div>
                  <div>
                    <dt className="text-xs opacity-70">Cards below {pct(plan.targetRecall)}</dt>
                    <dd className="tabular-nums">{plan.summary.belowTarget}</dd>
                  </div>
                </dl>
                {plan.summary.unseenCards > 0 && (
                  <p className="text-xs opacity-70">
                    {plan.summary.unseenCards} new cards you have not studied are not in these
                    figures and not in the schedule.
                  </p>
                )}
                {plan.summary.truncated && (
                  <Callout tone="neutral">
                    You have a very large collection. The schedule only considers the{' '}
                    {plan.summary.consideredCards} cards the model expects you to remember least on
                    exam day. The other cards are counted at their no-review figure.
                  </Callout>
                )}
                {plan.summary.capacityBound && (
                  <Callout tone="neutral">
                    Some days had more useful reviews than the daily limit. Raising the limit would
                    add them.
                  </Callout>
                )}
              </div>
            )}
          </Panel>

          <AssumptionsBlock items={plan.assumptions} confidence={plan.confidence} />

          {plan.days.length > 0 && (
            <Panel title="Day by day" data-testid="prep-days">
              <p className="mb-2 text-xs opacity-70">
                The percentage on each day is the model's average exam-day recall after that day's
                reviews, if all of them are made and remembered.
              </p>
              <ol className="space-y-2">
                {plan.days.map((d) => (
                  <PrepDay key={d.date} day={d} today={d.date === todayKey} />
                ))}
              </ol>
            </Panel>
          )}
        </>
      )}
    </div>
  )
}
