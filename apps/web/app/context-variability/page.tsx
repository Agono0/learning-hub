'use client'

/**
 * Context Variability: log where you study, see whether recall holds when the
 * place or time of day changes, and prepare for the place you must perform in.
 * Observational: the page says so. Data flows through @/lib/transport only.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { EmptyState, PageHeader, Panel } from '@/ui'
import type {
  CtxAudit,
  CtxGoal,
  CtxReport,
  CtxSession,
  GroupRate,
} from '@learning-hub/core/context-variability'

const API = '/api/context-variability'

interface Response {
  audit: CtxAudit
  report: CtxReport
  open: CtxSession | null
  sessions: CtxSession[]
  goals: CtxGoal[]
}

const pct = (n: number | null) => (n === null ? 'n/a' : `${Math.round(n * 100)}%`)

function RateTable({ title, rows }: { title: string; rows: GroupRate[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase text-neutral-500">{title}</h3>
      <table className="mt-1 w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="pr-2">{r.key}</td>
              <td className="pr-2 text-neutral-500">{r.n} reviews</td>
              <td>
                {r.rate === null
                  ? 'too few to show'
                  : `${pct(r.rate)} (${pct(r.low)} to ${pct(r.high)})`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ContextVariabilityPage() {
  const [data, setData] = useState<Response | null>(null)
  const [place, setPlace] = useState('')
  const [goal, setGoal] = useState({ label: '', place: '', startHour: 9, endHour: 12 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tz = typeof window === 'undefined' ? 0 : -new Date().getTimezoneOffset()

  const load = useCallback(async () => {
    try {
      setData(await apiGet<Response>(API, { windowDays: 60, tz }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the audit')
    }
  }, [tz])
  useEffect(() => {
    void load()
  }, [load])

  async function act(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      await apiSend(API, 'POST', body)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const btn = 'rounded border px-2 py-1 text-xs disabled:opacity-50'
  const input = 'rounded border p-1 text-sm'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Context Variability"
        subtitle="Memory is partly tied to where and when you learned it. Check whether yours travels."
      />
      {error ? (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      ) : null}

      <Panel>
        <h2 className="text-sm font-semibold">Where are you studying?</h2>
        {data?.open ? (
          <p className="mt-1 text-sm">
            Studying at <strong>{data.open.place}</strong> since {data.open.startedAt.slice(11, 16)}{' '}
            UTC.{' '}
            <button
              type="button"
              className={btn}
              disabled={busy}
              onClick={() => void act({ action: 'end' })}
            >
              End session
            </button>
          </p>
        ) : null}
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (place.trim().length >= 2)
              void act({ action: 'start', place }).then(() => setPlace(''))
          }}
        >
          <label className="text-sm">
            <span className="block text-xs text-neutral-500">Place</span>
            <input
              className={input}
              value={place}
              maxLength={60}
              placeholder="library, home, cafe"
              onChange={(e) => setPlace(e.target.value)}
            />
          </label>
          <button type="submit" className={btn} disabled={busy || place.trim().length < 2}>
            Start session
          </button>
        </form>
      </Panel>

      {data ? (
        <div aria-live="polite" className="space-y-4">
          <Panel>
            <p className="text-sm font-medium">{data.report.headline}</p>
            <p className="text-xs text-neutral-500">
              {data.audit.reviews} reviews in {data.audit.windowDays} days,{' '}
              {Math.round(data.audit.attributedShare * 100)}% inside a logged session, context
              spread {Math.round(data.audit.diversity * 100)}%.
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {data.report.advice.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <ul className="mt-2 list-disc pl-5 text-xs text-neutral-500">
              {data.report.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <h2 className="text-sm font-semibold">Home versus away</h2>
            {data.audit.transfer.verdict === 'insufficient' ? (
              <p className="mt-1 text-sm text-neutral-500">
                Not enough cards reviewed both at home and elsewhere yet (needs 3 cards and 10
                reviews each way).
              </p>
            ) : (
              <p className="mt-1 text-sm">
                At home {pct(data.audit.transfer.homeRate)}, away{' '}
                {pct(data.audit.transfer.awayRate)}. Gap {pct(data.audit.transfer.gap)} (95% range{' '}
                {pct(data.audit.transfer.gapLow)} to {pct(data.audit.transfer.gapHigh)}), over{' '}
                {data.audit.transfer.cardsCompared} cards.
              </p>
            )}
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <RateTable title="By place" rows={data.audit.byPlace} />
              <RateTable title="By time of day" rows={data.audit.byBucket} />
              <RateTable title="Weekday or weekend" rows={data.audit.byDayType} />
              <RateTable title="By noise" rows={data.audit.byNoise} />
            </div>
          </Panel>

          <Panel>
            <h2 className="text-sm font-semibold">Cards tied to one context</h2>
            {data.audit.boundCards.length === 0 ? (
              <EmptyState icon={<MapPin aria-hidden />} title="No context-bound cards">
                No card with four or more reviews has most of them in one place and time of day.
              </EmptyState>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {data.audit.boundCards.map((c) => (
                  <li key={c.cardId}>
                    Card #{c.cardId}: {Math.round(c.topShare * 100)}% of {c.reviews} reviews in{' '}
                    {c.home.replace('|', ' / ')}. {c.suggestion.why}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <h2 className="text-sm font-semibold">Where you must perform</h2>
            {data.goals.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-500">
                Add the place and hours of an exam or a talk to see how familiar they are.
              </p>
            ) : (
              <ul className="mt-2 space-y-3">
                {data.audit.goals.map((g) => (
                  <li key={g.goalId} className="text-sm">
                    <p className="font-medium">
                      {g.label}: {g.place}, {g.window} ({g.status}, {Math.round(g.matchShare * 100)}
                      % of reviews match)
                      <button
                        type="button"
                        className={`${btn} ml-2`}
                        disabled={busy}
                        onClick={() => void act({ action: 'goal-archive', id: g.goalId })}
                      >
                        Archive
                      </button>
                    </p>
                    {g.reviewsToFamiliar > 0 ? (
                      <p className="text-xs text-neutral-500">
                        About {g.reviewsToFamiliar} more reviews there would make it familiar.
                      </p>
                    ) : null}
                    <ol className="list-decimal pl-5 text-xs">
                      {g.reinstatement.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="mt-3 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void act({ action: 'goal-add', ...goal })
              }}
            >
              <label className="text-sm">
                <span className="block text-xs text-neutral-500">Label</span>
                <input
                  className={input}
                  value={goal.label}
                  maxLength={60}
                  onChange={(e) => setGoal({ ...goal, label: e.target.value })}
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-neutral-500">Place</span>
                <input
                  className={input}
                  value={goal.place}
                  maxLength={60}
                  onChange={(e) => setGoal({ ...goal, place: e.target.value })}
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-neutral-500">From hour</span>
                <input
                  className={`${input} w-16`}
                  type="number"
                  min={0}
                  max={23}
                  value={goal.startHour}
                  onChange={(e) => setGoal({ ...goal, startHour: Number(e.target.value) })}
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-neutral-500">To hour</span>
                <input
                  className={`${input} w-16`}
                  type="number"
                  min={0}
                  max={24}
                  value={goal.endHour}
                  onChange={(e) => setGoal({ ...goal, endHour: Number(e.target.value) })}
                />
              </label>
              <button
                type="submit"
                className={btn}
                disabled={busy || goal.label.trim().length < 2 || goal.place.trim().length < 2}
              >
                Add goal
              </button>
            </form>
          </Panel>

          {data.sessions.length > 0 ? (
            <Panel>
              <h2 className="text-sm font-semibold">Recent sessions</h2>
              <ul className="mt-1 text-xs text-neutral-600">
                {data.sessions.map((s) => (
                  <li key={s.id}>
                    {s.startedAt.slice(0, 16).replace('T', ' ')} UTC, {s.place}
                    {s.endedAt ? '' : ' (open)'}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">Loading…</p>
      )}
    </div>
  )
}
