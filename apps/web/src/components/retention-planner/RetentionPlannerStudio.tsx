'use client'

import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiSend } from '@/lib/transport'
import { Badge, Button, Callout, EmptyState, Panel, SelectField, TextField } from '@/ui'
import { ApplyPanel } from './ApplyPanel'
import { AssumptionsBlock } from './AssumptionsBlock'
import { RetentionCurve } from './RetentionCurve'
import { formatMinutes, pct, type PlannerResponse } from './types'

const HORIZONS = [30, 60, 90, 180]

export function RetentionPlannerStudio() {
  const [budget, setBudget] = useState('30')
  const [horizon, setHorizon] = useState('90')
  const budgetNum = Number(budget)
  const budgetOk = Number.isFinite(budgetNum) && budgetNum >= 1 && budgetNum <= 600
  const run = useMutation<PlannerResponse, Error, void>({
    mutationFn: () =>
      apiSend<PlannerResponse>('/api/retention-planner', 'POST', {
        budgetMinutes: budgetNum,
        horizonDays: Number(horizon),
      }),
  })
  const data = run.data
  const r = data?.result
  const candidate = useMemo(() => r?.recommendation?.retention ?? null, [r])

  return (
    <div className="space-y-6">
      <Panel className="space-y-4">
        <h2 className="text-base font-semibold">Your daily time budget</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Minutes per day for reviews"
            type="number"
            inputMode="numeric"
            min={1}
            max={600}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            error={budgetOk ? undefined : 'Enter 1 to 600.'}
          />
          <SelectField
            label="Look ahead"
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
          >
            {HORIZONS.map((h) => (
              <option key={h} value={h}>
                {h} days
              </option>
            ))}
          </SelectField>
        </div>
        <Button onClick={() => run.mutate()} disabled={!budgetOk || run.isPending}>
          {run.isPending ? 'Modeling...' : 'Model my cards'}
        </Button>
        <p className="text-xs text-tertiary">
          Read-only. Nothing is changed until you apply a value yourself below.
        </p>
      </Panel>

      {run.isError ? <Callout tone="danger">{run.error.message}</Callout> : null}

      {r ? (
        <>
          <Panel className="space-y-4" data-testid="rp-result">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">Modeled cost by retention</h2>
              <Badge tone={r.status === 'ok' ? 'success' : 'warning'}>{r.status}</Badge>
            </div>
            <p className="text-sm">{r.message}</p>
            {r.status === 'no-eligible-cards' ? (
              <EmptyState title="Nothing to model yet">Cards need to be in Review state before their future load can be modeled.</EmptyState>
            ) : null}
            {r.grid.length > 0 ? <RetentionCurve points={r.grid} budget={r.budgetMinutes} /> : null}
            {r.grid.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Modeled load by desired retention</caption>
                  <thead>
                    <tr className="text-tertiary">
                      <th scope="col" className="py-1 pr-3">
                        Retention
                      </th>
                      <th scope="col" className="py-1 pr-3">
                        Mean per day
                      </th>
                      <th scope="col" className="py-1 pr-3">
                        Peak day
                      </th>
                      <th scope="col" className="py-1 pr-3">
                        Reviews/day
                      </th>
                      <th scope="col" className="py-1">
                        Within budget
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.grid.map((p) => (
                      <tr key={p.retention}>
                        <th scope="row" className="py-1 pr-3 font-medium">
                          {pct(p.retention)}
                        </th>
                        <td className="py-1 pr-3">{formatMinutes(p.meanDailyMinutes)}</td>
                        <td className="py-1 pr-3">{formatMinutes(p.peakDailyMinutes)}</td>
                        <td className="py-1 pr-3">{p.meanDailyReviews.toFixed(1)}</td>
                        <td className="py-1">{p.fitsBudget ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {r.status === 'ok' ? (
              r.recommendation ? (
                <Callout tone="accent">
                  <strong>{pct(r.recommendation.retention)}</strong> is the highest tested retention
                  within your {r.budgetMinutes} min/day budget. {r.recommendation.basis}
                </Callout>
              ) : (
                <Callout tone="warning">
                  None of the tested retentions fit {r.budgetMinutes} min/day under this model. The
                  lowest tested load is{' '}
                  {formatMinutes(Math.min(...r.grid.map((p) => p.meanDailyMinutes)))}/day.
                </Callout>
              )
            ) : null}
            {r.status === 'incomplete' || r.status === 'rejected' ? (
              <Callout tone="warning">
                No budget recommendation is given for an unfinished run.
              </Callout>
            ) : null}
          </Panel>
          <Panel>
            <AssumptionsBlock r={r} truncated={data?.cardsTruncated ?? false} />
          </Panel>
          <Panel>
            <ApplyPanel candidate={candidate} />
          </Panel>
        </>
      ) : (
        <Panel>
          <p className="text-sm text-tertiary">
            Pick a daily budget and model your cards. The page then shows its assumptions next to
            the numbers.
          </p>
        </Panel>
      )}
    </div>
  )
}
