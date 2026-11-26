'use client'

/**
 * Elaborative Interrogation: paste study text, get "why" prompts, write an
 * explanation, see a transparent rubric. Facts and per-fact state live in the
 * browser (localStorage) and are sent to the stateless handler on each call.
 * Data flows through @/lib/transport only.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { apiSend } from '@/lib/transport'
import { EmptyState, PageHeader, Panel } from '@/ui'
import type {
  CalibrationPoint,
  CalibrationReport,
  EiFact,
  EiFactState,
  EiGrade,
  EiPrompt,
  EiQueueItem,
  EiSummary,
  FactIssue,
} from '@learning-hub/core/elaborative-interrogation'

const KEY = 'lh.ei.v1'
const API = '/api/elaborative-interrogation'
const dayNumber = () => Math.floor(Date.now() / 86_400_000)

interface Saved {
  facts: EiFact[]
  states: EiFactState[]
  points?: CalibrationPoint[]
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Saved
  } catch {
    /* ignore corrupt storage */
  }
  return { facts: [], states: [] }
}

export default function ElaborativeInterrogationPage() {
  const [saved, setSaved] = useState<Saved>({ facts: [], states: [] })
  const [ready, setReady] = useState(false)
  const [text, setText] = useState('')
  const [queue, setQueue] = useState<EiQueueItem[]>([])
  const [summary, setSummary] = useState<EiSummary | null>(null)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<{ grade: EiGrade; nextPrompt: EiPrompt } | null>(null)
  const [predicted, setPredicted] = useState(60)
  const [calibration, setCalibration] = useState<CalibrationReport | null>(null)
  const [issues, setIssues] = useState<FactIssue[]>([])
  const [markdown, setMarkdown] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSaved(load())
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    localStorage.setItem(KEY, JSON.stringify(saved))
    if (saved.facts.length === 0) {
      setQueue([])
      setSummary(null)
      setIssues([])
      return
    }
    apiSend<{ issues: FactIssue[] }>(API, 'POST', { action: 'lint', facts: saved.facts })
      .then((r) => setIssues(r.issues))
      .catch(() => setIssues([]))
    if ((saved.points ?? []).length > 0) {
      apiSend<{ report: CalibrationReport }>(API, 'POST', {
        action: 'calibration',
        points: saved.points,
      })
        .then((r) => setCalibration(r.report))
        .catch(() => setCalibration(null))
    }
    apiSend<{ queue: EiQueueItem[]; summary: EiSummary }>(API, 'POST', {
      action: 'queue',
      facts: saved.facts,
      states: saved.states,
      today: dayNumber(),
    })
      .then((r) => {
        setQueue(r.queue)
        setSummary(r.summary)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not build the queue'))
  }, [saved, ready])

  const current = queue[0]
  const rubricTotal = useMemo(
    () => result?.grade.rubric.reduce((a, r) => a + r.max, 0) ?? 100,
    [result],
  )

  async function extract() {
    setBusy(true)
    setError(null)
    try {
      const r = await apiSend<{ facts: EiFact[] }>(API, 'POST', { action: 'extract', text })
      if (r.facts.length === 0)
        setError('No sentence-length facts found. Use full sentences of 8 to 40 words.')
      else
        setSaved((s) => ({
          facts: [
            ...s.facts,
            ...r.facts.map((f, i) => ({ ...f, id: `f${s.facts.length + i + 1}` })),
          ],
          states: s.states,
        }))
      setText('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction failed')
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!current) return
    setBusy(true)
    setError(null)
    try {
      const r = await apiSend<{ grade: EiGrade; state: EiFactState; nextPrompt: EiPrompt }>(
        API,
        'POST',
        {
          action: 'grade',
          fact: current.fact,
          state: current.state,
          style: current.prompt.style,
          answer,
          today: dayNumber(),
        },
      )
      setResult({ grade: r.grade, nextPrompt: r.nextPrompt })
      setSaved((s) => ({
        facts: s.facts,
        states: [...s.states.filter((x) => x.factId !== r.state.factId), r.state],
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Grading failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Elaborative Interrogation"
        subtitle="Explain why each fact is true. Explaining beats re-reading."
      />
      {error ? (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      ) : null}

      <Panel>
        <label htmlFor="ei-text" className="text-sm font-medium">
          Paste study text
        </label>
        <textarea
          id="ei-text"
          className="mt-2 w-full rounded border p-2 text-sm"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="button"
          className="mt-2 rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={busy || text.trim().length === 0}
          onClick={() => void extract()}
        >
          Turn into facts
        </button>
      </Panel>

      {summary ? (
        <Panel>
          <p className="text-sm">
            {summary.facts} facts, {summary.attempted} attempted, {summary.due} due, average best{' '}
            {summary.meanBest}/100, {summary.deep} deep.
          </p>
        </Panel>
      ) : null}

      {calibration && calibration.n > 0 ? (
        <Panel>
          <p className="text-sm font-medium">Calibration over {calibration.n} attempt(s)</p>
          <p className="text-sm">
            Mean bias {calibration.meanBias > 0 ? '+' : ''}
            {calibration.meanBias} points ({calibration.bias}), average error {calibration.mae}.
          </p>
          <p className="text-sm text-neutral-500">{calibration.advice}</p>
        </Panel>
      ) : null}

      {issues.length > 0 ? (
        <Panel>
          <p className="text-sm font-medium">Fact bank checks ({issues.length})</p>
          <ul className="list-disc pl-5 text-sm">
            {issues.slice(0, 8).map((i) => (
              <li key={`${i.factId}-${i.code}`}>
                {i.factId}: {i.message}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel>
        {!current ? (
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title={
              saved.facts.length === 0
                ? 'Add some study text to begin'
                : 'Nothing due. Come back later.'
            }
          />
        ) : (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-neutral-500">
              Level {current.prompt.level} · {current.prompt.style}
            </p>
            <p className="text-base">{current.prompt.text}</p>
            <label htmlFor="ei-predict" className="block text-sm">
              How well do you think you will explain it? {predicted}/100
              <input
                id="ei-predict"
                type="range"
                min={0}
                max={100}
                step={5}
                value={predicted}
                onChange={(e) => setPredicted(Number(e.target.value))}
                className="mt-1 block w-full"
                disabled={Boolean(result)}
              />
            </label>
            <label htmlFor="ei-answer" className="sr-only">
              Your explanation
            </label>
            <textarea
              id="ei-answer"
              className="w-full rounded border p-2 text-sm"
              rows={5}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
            {result ? (
              <div className="space-y-2" aria-live="polite">
                <p className="text-sm font-medium">
                  Score {result.grade.total}/{rubricTotal} ({result.grade.band})
                </p>
                <ul className="text-sm">
                  {result.grade.rubric.map((r) => (
                    <li key={r.key}>
                      {r.label}: {r.score}/{r.max}{' '}
                      <span className="text-neutral-500">({r.note})</span>
                    </li>
                  ))}
                </ul>
                <ul className="list-disc pl-5 text-sm">
                  {result.grade.feedback.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="rounded border px-3 py-1.5 text-sm"
                  onClick={() => {
                    setResult(null)
                    setAnswer('')
                  }}
                >
                  Next
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                disabled={busy || answer.trim().length === 0}
                onClick={() => void submit()}
              >
                Check my explanation
              </button>
            )}
          </div>
        )}
      </Panel>

      {saved.facts.length > 0 ? (
        <Panel>
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            onClick={() => {
              apiSend<{ markdown: string }>(API, 'POST', {
                action: 'export',
                facts: saved.facts,
                states: saved.states,
              })
                .then((r) => setMarkdown(r.markdown))
                .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Export failed'))
            }}
          >
            Export bank as Markdown
          </button>
          {markdown ? (
            <textarea
              readOnly
              aria-label="Exported Markdown"
              className="mt-2 w-full rounded border p-2 font-mono text-xs"
              rows={8}
              value={markdown}
            />
          ) : null}
        </Panel>
      ) : null}
    </div>
  )
}
