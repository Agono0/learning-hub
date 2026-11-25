'use client'

/**
 * Targeted study sessions: choose cards by deck, tag, state, lapses, due
 * window and estimated recall, check the list, then open exactly those cards
 * in the review queue. Read-only until you answer a card there yourself.
 *
 * Start re-runs the same filters first. If the set changed since the preview
 * you are looking at, it shows the new list and waits instead of opening a
 * different set than the one you checked.
 */
import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet } from '@/lib/transport'
import { Badge, Button, Callout, EmptyState, Panel, SelectField, TextField } from '@/ui'
import { SessionCard } from './SessionCard'
import {
  DUE_WINDOWS,
  EMPTY_FORM,
  MAX_SESSION_CARDS,
  SORTS,
  STATE_NAMES,
  buildSessionQuery,
  emptiedBy,
  type SessionForm,
  type StudySessionDto,
} from './types'

const ENDPOINT = '/api/study-session/preview'

export function StudySessionStudio() {
  const qc = useQueryClient()
  const [form, setForm] = useState<SessionForm>(EMPTY_FORM)
  const [applied, setApplied] = useState<Record<string, string> | null>(null)
  const [formError, setFormError] = useState('')
  const [checking, setChecking] = useState(false)
  const [changed, setChanged] = useState(false)
  const [startError, setStartError] = useState('')
  const set = <K extends keyof SessionForm>(k: K, v: SessionForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const decks = useQuery({
    queryKey: ['study-session', 'decks'],
    queryFn: () => apiGet<{ decks: { id: number; name: string }[] }>('/api/decks'),
  })

  const preview = useQuery({
    queryKey: ['study-session', 'preview', applied],
    enabled: applied !== null,
    queryFn: () => apiGet<StudySessionDto>(ENDPOINT, applied ?? undefined),
  })
  const data = preview.data

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const built = buildSessionQuery(form)
    if (!built.ok) {
      setFormError(built.error)
      return
    }
    setFormError('')
    setChanged(false)
    setStartError('')
    setApplied(built.query)
  }

  async function start() {
    if (!data || !applied || data.cards.length === 0) return
    setChecking(true)
    setStartError('')
    try {
      const fresh = await apiGet<StudySessionDto>(ENDPOINT, applied)
      if (fresh.fingerprint === data.fingerprint && fresh.startHref) {
        window.location.assign(fresh.startHref)
        return
      }
      qc.setQueryData(['study-session', 'preview', applied], fresh)
      setChanged(true)
    } catch {
      setStartError('Could not check the list. Preview again and try once more.')
    } finally {
      setChecking(false)
    }
  }

  const stuck = data ? emptiedBy(data.funnel) : null

  return (
    <div className="space-y-4" data-testid="study-session-studio">
      <form onSubmit={submit}>
        <Panel title="Choose cards" data-testid="session-controls">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Deck"
              value={form.deckId}
              onChange={(e) => set('deckId', e.target.value)}
              data-testid="session-deck"
            >
              <option value="">All decks</option>
              {(decks.data?.decks ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Tags (every one must match)"
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
              placeholder="biology, chapter-3"
              data-testid="session-tags"
            />
            <TextField
              label="At least this many lapses"
              inputMode="numeric"
              value={form.minLapses}
              onChange={(e) => set('minLapses', e.target.value)}
              data-testid="session-lapses"
            />
            <TextField
              label="Estimated recall below (%)"
              inputMode="numeric"
              value={form.recallBelowPct}
              onChange={(e) => set('recallBelowPct', e.target.value)}
              data-testid="session-recall"
            />
            <SelectField
              label="Due"
              value={form.dueBy}
              onChange={(e) => set('dueBy', e.target.value)}
              data-testid="session-due"
            >
              {DUE_WINDOWS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Order"
              value={form.sort}
              onChange={(e) => set('sort', e.target.value)}
              data-testid="session-sort"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </SelectField>
            <TextField
              label={`Cards per session (1 to ${MAX_SESSION_CARDS})`}
              inputMode="numeric"
              value={form.limit}
              onChange={(e) => set('limit', e.target.value)}
              data-testid="session-limit"
            />
          </div>
          <fieldset className="mt-3">
            <legend className="text-sm font-medium">States (none chosen means all)</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {STATE_NAMES.map((name, i) => (
                <label
                  key={name}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-black/15 px-3 text-sm dark:border-white/20"
                >
                  <input
                    type="checkbox"
                    checked={form.states.includes(i)}
                    onChange={(e) =>
                      set(
                        'states',
                        e.target.checked ? [...form.states, i] : form.states.filter((s) => s !== i),
                      )
                    }
                    data-testid={`session-state-${i}`}
                  />
                  {name}
                </label>
              ))}
            </div>
          </fieldset>
          {formError && (
            <div className="mt-3" data-testid="session-form-error">
              <Callout tone="danger">{formError}</Callout>
            </div>
          )}
          <div className="mt-3">
            <Button type="submit" loading={preview.isFetching} data-testid="session-preview">
              Preview cards
            </Button>
          </div>
          <p className="mt-2 text-xs opacity-70">
            Suspended and buried cards are never picked. Previewing changes nothing.
          </p>
        </Panel>
      </form>

      {applied === null && (
        <EmptyState title="Choose what to study">
          Pick filters and preview the cards. Nothing starts until you press Start.
        </EmptyState>
      )}
      {applied !== null && preview.isError && (
        <Callout tone="danger">
          Could not build the session. If you have a very large collection, choose one deck.
        </Callout>
      )}

      {data && (
        <>
          <Panel
            title="Your session"
            actions={<Badge tone="accent">{`${data.selected} of ${data.matched} matching`}</Badge>}
            data-testid="session-summary"
          >
            <div className="space-y-2">
              {changed && (
                <Callout tone="warning">
                  Your cards changed since the last preview, so the list below was updated. Check
                  it, then press Start again.
                </Callout>
              )}
              {data.cards.length === 0 ? (
                <Callout tone="warning">
                  {stuck
                    ? `No cards match. The list emptied at "${stuck.label}". Loosen that filter.`
                    : 'No cards match these filters.'}
                </Callout>
              ) : (
                <p className="text-sm" data-testid="session-headline">
                  {data.selected} {data.selected === 1 ? 'card' : 'cards'} picked from{' '}
                  {data.matched} that match, out of {data.scanned} scanned. Taken{' '}
                  {data.asOf.slice(0, 16).replace('T', ' ')} UTC.
                </p>
              )}
              {data.truncated && (
                <div data-testid="session-truncated">
                  <Callout tone="neutral">
                    {data.matched - data.selected} more cards match but a session holds at most{' '}
                    {data.selected}. The list is cut by your chosen order, not at random. Raise the
                    size (up to {MAX_SESSION_CARDS}) or narrow the filters.
                  </Callout>
                </div>
              )}
              <ol className="space-y-1 text-xs opacity-80" data-testid="session-funnel">
                {data.funnel.map((s) => (
                  <li key={s.key} className="flex justify-between gap-3">
                    <span>{s.label}</span>
                    <span className="tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ol>
              {(data.excluded.suspended > 0 ||
                data.excluded.buried > 0 ||
                data.excluded.unreadableDue > 0) && (
                <p className="text-xs opacity-70">
                  Left out: {data.excluded.suspended} suspended, {data.excluded.buried} buried
                  {data.excluded.unreadableDue > 0
                    ? `, ${data.excluded.unreadableDue} with an unreadable due date`
                    : ''}
                  .
                </p>
              )}
              {data.noRecallEstimate > 0 && (
                <p className="text-xs opacity-70">
                  {data.noRecallEstimate} cards were skipped by the recall filter because the model
                  has no estimate for them (new cards, or no stored review).
                </p>
              )}
            </div>
          </Panel>

          {data.cards.length > 0 && (
            <Panel title="Cards in this session" data-testid="session-list">
              <ol className="space-y-2">
                {data.cards.map((c) => (
                  <SessionCard key={c.id} card={c} />
                ))}
              </ol>
              <p className="mt-3 text-xs opacity-70">
                Start opens the review queue on exactly these cards, in this order. You answer each
                one yourself, and it counts as a real review.
              </p>
              {startError && (
                <div className="mt-2" data-testid="session-start-error">
                  <Callout tone="danger">{startError}</Callout>
                </div>
              )}
              <div className="mt-3">
                <Button onClick={start} loading={checking} data-testid="session-start">
                  {`Start ${data.cards.length} ${data.cards.length === 1 ? 'card' : 'cards'}`}
                </Button>
              </div>
            </Panel>
          )}

          <Panel title="How to read this" data-testid="session-assumptions">
            <ul className="list-disc space-y-1 pl-5 text-xs opacity-80">
              {data.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Panel>
        </>
      )}
    </div>
  )
}
