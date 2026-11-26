'use client'

/**
 * Retrieval Forgetting Guard: practising some cards can make similar cards
 * (same cue, different answer) harder to recall. This page shows which cards
 * look suppressed, why, and how to rescue them. Data flows through
 * @/lib/transport only; nothing here changes a card or a schedule.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { EmptyState, PageHeader, Panel } from '@/ui'
import type { RescueItem, RifAudit, RifReport } from '@learning-hub/core/retrieval-forgetting'

const API = '/api/retrieval-forgetting'

interface AuditResponse {
  audit: RifAudit
  report: RifReport
  rescue: RescueItem[]
  dismissed: number[]
  history: { id: number; atRisk: number; watch: number; meanRisk: number; createdAt: string }[]
}

const BAND_STYLE: Record<string, string> = {
  high: 'bg-rose-100 text-rose-800',
  watch: 'bg-amber-100 text-amber-800',
  low: 'bg-neutral-100 text-neutral-700',
}

export default function RetrievalForgettingPage() {
  const [data, setData] = useState<AuditResponse | null>(null)
  const [windowDays, setWindowDays] = useState(21)
  const [decks, setDecks] = useState<{ id: number; name: string }[]>([])
  const [deckId, setDeckId] = useState<number | ''>('')
  const [probe, setProbe] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setData(
        await apiGet<AuditResponse>(API, {
          windowDays,
          deckId: deckId === '' ? undefined : deckId,
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run the audit')
    } finally {
      setBusy(false)
    }
  }, [windowDays, deckId])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    apiGet<{ decks: { id: number; name: string }[] }>('/api/decks')
      .then((r) => setDecks(r.decks))
      .catch(() => undefined)
  }, [])

  async function act(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      await apiSend(API, 'POST', body)
      if (body['action'] === 'save') setSaved(true)
      else await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const btn = 'rounded border px-2 py-1 text-xs disabled:opacity-50'
  const cardText = new Map<number, { cue: string; target: string }>()
  for (const cl of data?.audit.clusters ?? [])
    for (const m of cl.members) cardText.set(m.cardId, { cue: m.cue, target: m.target })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Retrieval Forgetting Guard"
        subtitle="Practising one card can push similar cards out of reach. Find them before they fade."
      />
      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-xs text-neutral-500">Deck</span>
            <select
              className="rounded border p-1 text-sm"
              value={deckId}
              onChange={(e) => setDeckId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">All decks</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs text-neutral-500">Look back</span>
            <select
              className="rounded border p-1 text-sm"
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
            >
              {[7, 14, 21, 45, 90].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={btn}
            disabled={busy || !data}
            onClick={() =>
              void act({ action: 'save', windowDays, ...(deckId === '' ? {} : { deckId }) })
            }
          >
            Save this audit
          </button>
          {saved ? <span className="text-xs text-neutral-500">Saved to history.</span> : null}
        </div>
      </Panel>

      {error ? (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      ) : null}

      {data ? (
        <div aria-live="polite" className="space-y-4">
          <Panel>
            <p className="text-sm font-medium">{data.report.headline}</p>
            <p className="text-xs text-neutral-500">
              {data.audit.scanned} cards scanned, {data.audit.clustered} in competing groups, mean
              risk {Math.round(data.audit.meanRisk * 100)}%.
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
            <h2 className="text-sm font-semibold">Rescue queue</h2>
            {data.rescue.length === 0 ? (
              <EmptyState icon={<ShieldAlert aria-hidden />} title="Nothing to rescue">
                No card looks crowded out by its siblings.
              </EmptyState>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.rescue.map((r) => (
                  <li key={r.cardId} className="rounded border p-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span
                          className={`mr-2 rounded px-1.5 py-0.5 text-xs ${BAND_STYLE[r.band] ?? ''}`}
                        >
                          {r.band} {Math.round(r.risk * 100)}%
                        </span>
                        {cardText.get(r.cardId)?.cue ?? `Card ${r.cardId}`}
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className={btn}
                          onClick={() => setProbe(probe === r.cardId ? null : r.cardId)}
                        >
                          {probe === r.cardId ? 'Hide probe' : 'Reverse probe'}
                        </button>
                        <button
                          type="button"
                          className={btn}
                          disabled={busy}
                          onClick={() => void act({ action: 'dismiss', cardId: r.cardId })}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">{r.reason}</p>
                    {probe === r.cardId ? <p className="mt-1 text-sm">{r.reverseProbe}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <h2 className="text-sm font-semibold">Competing groups</h2>
            {data.audit.clusters.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-500">
                No groups of cards share a cue and differ in answer.
              </p>
            ) : (
              <ul className="mt-2 space-y-3">
                {data.audit.clusters.map((cl) => (
                  <li key={cl.id}>
                    <p className="text-sm font-medium">
                      {cl.sharedCue.join(' ') || 'Shared cue'}{' '}
                      <span className="text-xs font-normal text-neutral-500">
                        balance {Math.round(cl.balance * 100)}%
                      </span>
                    </p>
                    <ul className="mt-1 space-y-1">
                      {cl.members.map((m) => (
                        <li key={m.cardId} className="flex items-center gap-2 text-xs">
                          <span className={`rounded px-1.5 py-0.5 ${BAND_STYLE[m.band] ?? ''}`}>
                            {Math.round(m.risk * 100)}%
                          </span>
                          <span className="flex-1">{m.cue}</span>
                          <span className="text-neutral-500">{m.successes} recent</span>
                          {m.dismissed ? (
                            <button
                              type="button"
                              className={btn}
                              disabled={busy}
                              onClick={() => void act({ action: 'restore', cardId: m.cardId })}
                            >
                              Restore
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {data.history.length > 0 ? (
            <Panel>
              <h2 className="text-sm font-semibold">Saved audits</h2>
              <ul className="mt-1 text-xs text-neutral-600">
                {data.history.map((h) => (
                  <li key={h.id}>
                    {h.createdAt.slice(0, 10)}: {h.atRisk} high, {h.watch} watch, mean{' '}
                    {Math.round(h.meanRisk * 100)}%
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">{busy ? 'Running the audit…' : ''}</p>
      )}
    </div>
  )
}
