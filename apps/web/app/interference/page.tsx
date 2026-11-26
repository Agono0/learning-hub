'use client'

/**
 * Interference & Lookalikes: finds cards that are easy to confuse, shows
 * whether failures follow the lookalike, and offers a short discrimination
 * drill. Observational: the page says so. Data flows through @/lib/transport.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { EmptyState, PageHeader, Panel } from '@/ui'
import type { Drill, InfAudit, InfReport, PairReport } from '@learning-hub/core/interference'

const API = '/api/interference'

interface Response {
  audit: InfAudit
  report: InfReport
  drills: Array<{
    a: number
    b: number
    days: number
    correct: number
    total: number
    accuracy: number
  }>
}

const KIND: Record<PairReport['kind'], string> = {
  'same-cue-different-target': 'Same question, different answers',
  'same-target-different-cue': 'Different questions, same answer',
  lookalike: 'Look alike on both sides',
  'near-duplicate': 'Near duplicate',
}
const BAND_CLASS: Record<PairReport['band'], string> = {
  high: 'text-rose-600',
  watch: 'text-amber-600',
  low: 'text-neutral-500',
}
const pct = (n: number | null) => (n === null ? 'n/a' : `${Math.round(n * 100)}%`)

export default function InterferencePage() {
  const [data, setData] = useState<Response | null>(null)
  const [drill, setDrill] = useState<Drill | null>(null)
  const [step, setStep] = useState(0)
  const [right, setRight] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await apiGet<Response>(API, { windowDays: 90 }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the audit')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function act(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await apiSend<unknown>(API, 'POST', body)
      return res
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function startDrill(p: PairReport) {
    const res = await act({ action: 'drill', a: p.a, b: p.b })
    if (res) {
      setDrill((res as { drill: Drill }).drill)
      setStep(0)
      setRight(0)
      setRevealed(false)
    }
  }
  async function answer(correct: boolean) {
    if (!drill) return
    const r = right + (correct ? 1 : 0)
    if (step + 1 >= drill.items.length) {
      await act({
        action: 'drill-log',
        a: drill.a,
        b: drill.b,
        correct: r,
        total: drill.items.length,
      })
      setDrill(null)
      await load()
      return
    }
    setRight(r)
    setStep(step + 1)
    setRevealed(false)
  }
  async function decide(p: PairReport, action: 'confirm' | 'dismiss' | 'clear') {
    await act({ action, a: p.a, b: p.b })
    await load()
  }

  const btn = 'rounded border px-2 py-1 text-xs disabled:opacity-50'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Interference & Lookalikes"
        subtitle="Cards that look alike compete when you try to recall them. Find them, then make them distinct."
      />
      {error ? (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      ) : null}

      {drill ? (
        <Panel>
          <h2 className="text-sm font-semibold">
            Drill, item {step + 1} of {drill.items.length}
          </h2>
          <p className="mt-2 text-sm">{drill.items[step]?.prompt}</p>
          {revealed ? (
            <>
              <p className="mt-2 text-sm font-medium">{drill.items[step]?.expected}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className={btn}
                  disabled={busy}
                  onClick={() => void answer(true)}
                >
                  I had it
                </button>
                <button
                  type="button"
                  className={btn}
                  disabled={busy}
                  onClick={() => void answer(false)}
                >
                  I mixed it up
                </button>
              </div>
            </>
          ) : (
            <button type="button" className={`${btn} mt-2`} onClick={() => setRevealed(true)}>
              Show answer
            </button>
          )}
          <p className="mt-3 text-xs text-neutral-500">{drill.contrast}</p>
        </Panel>
      ) : null}

      {data ? (
        <div aria-live="polite" className="space-y-4">
          <Panel>
            <p className="text-sm font-medium">{data.report.headline}</p>
            <p className="text-xs text-neutral-500">
              {data.audit.scanned} cards compared, {data.audit.dismissed} pair(s) dismissed,{' '}
              {data.audit.confirmed} confirmed.
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

          {data.audit.pairs.length === 0 ? (
            <EmptyState icon={<Copy aria-hidden />} title="No lookalike pairs">
              No two usable cards are close enough in wording to be flagged.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {data.audit.pairs.map((p) => (
                <li key={`${p.a}:${p.b}`}>
                  <Panel>
                    <p className="text-sm font-medium">
                      Cards #{p.a} and #{p.b}: {KIND[p.kind]}{' '}
                      <span className={BAND_CLASS[p.band]}>
                        ({p.band}, {Math.round(p.severity * 100)}%)
                      </span>
                      {p.status ? (
                        <span className="ml-1 text-xs text-neutral-500">[{p.status}]</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-neutral-500">
                      Question similarity {pct(p.cueSimilarity)}, answer similarity{' '}
                      {pct(p.targetSimilarity)}.
                      {p.evidence.verdict === 'interfering'
                        ? ` Fails ${pct(p.evidence.exposedFailRate)} right after the other card versus ${pct(p.evidence.otherFailRate)} otherwise.`
                        : p.evidence.verdict === 'no-signal'
                          ? ' Review history shows no extra failures after the lookalike.'
                          : ' Not enough review history yet.'}
                    </p>
                    <p className="mt-1 text-sm">{p.advice.headline}</p>
                    <ul className="list-disc pl-5 text-xs">
                      {p.advice.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {p.kind !== 'near-duplicate' ? (
                        <button
                          type="button"
                          className={btn}
                          disabled={busy}
                          onClick={() => void startDrill(p)}
                        >
                          Drill this pair
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={btn}
                        disabled={busy}
                        onClick={() => void decide(p, 'confirm')}
                      >
                        I do confuse these
                      </button>
                      <button
                        type="button"
                        className={btn}
                        disabled={busy}
                        onClick={() => void decide(p, 'dismiss')}
                      >
                        Not a problem
                      </button>
                      {p.status ? (
                        <button
                          type="button"
                          className={btn}
                          disabled={busy}
                          onClick={() => void decide(p, 'clear')}
                        >
                          Undo choice
                        </button>
                      ) : null}
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
          )}

          {data.drills.length > 0 ? (
            <Panel>
              <h2 className="text-sm font-semibold">Drills in the last 30 days</h2>
              <ul className="mt-1 text-xs text-neutral-600">
                {data.drills.map((d) => (
                  <li key={`${d.a}:${d.b}`}>
                    #{d.a} and #{d.b}: {d.correct} of {d.total} right ({pct(d.accuracy)}) over{' '}
                    {d.days} day(s)
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
