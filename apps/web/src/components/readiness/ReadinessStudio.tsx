'use client'

/**
 * Exam readiness: pick an exam (or a date), pick a review scenario, and see
 * how much of your card memory the model expects you to still recall that day.
 * Read-only. Figures are model estimates, and the page says so next to them.
 */
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/transport'
import { Badge, Button, Callout, EmptyState, Panel, SelectField, TextField } from '@/ui'
import { AssumptionsBlock } from './AssumptionsBlock'
import { ReadinessGauge } from './ReadinessGauge'
import { ReadinessTable } from './ReadinessTable'
import { pct, type PlanKind, type ReadinessResponse } from './types'

const PLAN_LABEL: Record<PlanKind, string> = {
  'on-schedule': 'Review every card the day it is due',
  capacity: 'Review at most N cards a day',
  none: 'Stop reviewing today',
}

export function ReadinessStudio() {
  const [examId, setExamId] = useState<string>('')
  const [date, setDate] = useState('')
  const [plan, setPlan] = useState<PlanKind>('on-schedule')
  const [perDay, setPerDay] = useState('20')
  const [target, setTarget] = useState('85')
  const [budget, setBudget] = useState('20')

  const exams = useQuery({
    queryKey: ['readiness', 'exams'],
    queryFn: () => apiGet<ReadinessResponse>('/api/readiness'),
  })

  const chosen = examId !== '' || date !== ''
  const perDayN = Math.min(1000, Math.max(0, Math.floor(Number(perDay) || 0)))
  const targetN = Math.min(99, Math.max(50, Math.floor(Number(target) || 85)))
  const budgetN = Math.min(5000, Math.max(0, Math.floor(Number(budget) || 0)))

  const report = useQuery({
    queryKey: ['readiness', 'report', examId, date, plan, perDayN, targetN, budgetN],
    enabled: chosen,
    queryFn: () =>
      apiGet<ReadinessResponse>('/api/readiness', {
        ...(examId !== '' ? { examId: Number(examId) } : { date, title: 'Exam' }),
        plan,
        perDay: perDayN,
        target: targetN / 100,
        budget: budgetN,
      }),
  })

  const r = report.data?.report
  const review = report.data?.review

  return (
    <div className="space-y-4" data-testid="readiness-studio">
      <Panel title="Your exam" data-testid="readiness-controls">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Saved exam"
            value={examId}
            onChange={(e) => {
              setExamId(e.target.value)
              if (e.target.value) setDate('')
            }}
            data-testid="readiness-exam"
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
            data-testid="readiness-date"
          />
          <SelectField
            label="Review scenario"
            value={plan}
            onChange={(e) => setPlan(e.target.value as PlanKind)}
            data-testid="readiness-plan"
          >
            {(Object.keys(PLAN_LABEL) as PlanKind[]).map((k) => (
              <option key={k} value={k}>
                {PLAN_LABEL[k]}
              </option>
            ))}
          </SelectField>
          {plan === 'capacity' && (
            <TextField
              label="Cards per day"
              inputMode="numeric"
              value={perDay}
              onChange={(e) => setPerDay(e.target.value)}
              data-testid="readiness-perday"
            />
          )}
          <TextField
            label="Target recall (%)"
            inputMode="numeric"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            data-testid="readiness-target"
          />
          <TextField
            label="Reviews you can fit today"
            inputMode="numeric"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            data-testid="readiness-budget"
          />
        </div>
        <p className="mt-2 text-xs opacity-70">
          A date counts through the end of that day. Scenarios are hypothetical: they show what a
          plan could do, not what will happen.
        </p>
      </Panel>

      {!chosen && (
        <EmptyState title="Pick an exam date">
          Choose a saved exam or any date to see how much you are likely to recall on that day.
        </EmptyState>
      )}
      {chosen && report.isLoading && <Callout tone="neutral">Working it out…</Callout>}
      {chosen && report.isError && (
        <Callout tone="danger">Could not build the forecast. Check the date and try again.</Callout>
      )}

      {r && (
        <>
          <Panel
            title={r.target.title}
            actions={
              <Badge tone={r.expired ? 'danger' : 'accent'}>
                {r.expired ? 'Date has passed' : `${r.daysLeft} days left`}
              </Badge>
            }
            data-testid="readiness-summary"
          >
            {r.overall.cards - r.overall.unseen === 0 ? (
              <Callout tone="warning">
                You have not studied any of these cards yet, so there is nothing to forecast.
              </Callout>
            ) : (
              <ReadinessGauge
                baseline={r.overall.baselineRecall}
                planned={r.overall.plannedRecall}
                target={r.targetRecall}
                unseen={r.overall.unseen}
                cards={r.overall.cards}
              />
            )}
          </Panel>

          <AssumptionsBlock items={r.assumptions} confidence={r.confidence} />

          <ReadinessTable
            title="By deck, weakest first"
            rows={r.decks}
            target={r.targetRecall}
            testid="readiness-decks"
          />
          <ReadinessTable
            title="By skill, weakest first"
            rows={r.skills}
            target={r.targetRecall}
            testid="readiness-skills"
          />

          {review && !r.expired && (
            <Panel title="Where a review helps most" data-testid="readiness-gains">
              <p className="text-sm" data-testid="readiness-gain-summary">
                Reviewing the best {review.budget} cards today would move average recall from{' '}
                {pct(review.meanRecallBefore)} to {pct(review.meanRecallAfter)}.{' '}
                {review.reviewsNeededForTarget === null
                  ? `Reaching ${pct(r.targetRecall)} is not possible with one review each today.`
                  : review.reviewsNeededForTarget === 0
                    ? `You are already at ${pct(r.targetRecall)} if you stop.`
                    : `About ${review.reviewsNeededForTarget} reviews today would reach ${pct(r.targetRecall)}.`}
              </p>
              <p className="mt-1 text-xs opacity-70">
                Assumes each card is reviewed once and remembered.
              </p>
              <ol className="mt-2 space-y-1 text-sm">
                {review.top.slice(0, 10).map((g) => (
                  <li
                    key={g.cardId}
                    className="flex flex-wrap justify-between gap-2"
                    data-testid="readiness-gain-row"
                  >
                    <span>Card #{g.cardId}</span>
                    <span className="tabular-nums opacity-80">
                      {pct(g.baseline)} → {pct(g.afterReview)}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-3">
                <Button variant="secondary" onClick={() => (window.location.href = '/review')}>
                  Start reviewing
                </Button>
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  )
}
