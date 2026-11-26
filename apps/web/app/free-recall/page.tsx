'use client'

/**
 * Free Recall: paste a passage, study it, hide it, write what you remember,
 * then see recalled, partial and missed ideas. Missed ideas can be sent to the
 * Elaborative Interrogation bank. Data flows through @/lib/transport only.
 */
import React, { useState } from 'react'
import { Brain } from 'lucide-react'
import { apiSend } from '@/lib/transport'
import { EmptyState, PageHeader, Panel } from '@/ui'
import type { EiFact } from '@learning-hub/core/elaborative-interrogation'
import type { RecallReport, UnitResult } from '@learning-hub/core/free-recall'

const API = '/api/free-recall'

interface ScoreResponse {
  report: RecallReport
  gaps: UnitResult[]
  eiFacts: EiFact[]
  next: { action: 'retry' | 'explain' | 'done'; reason: string }
  delayMinutes: number
  round: number
}

type Phase = 'edit' | 'study' | 'recall' | 'result'

export default function FreeRecallPage() {
  const [phase, setPhase] = useState<Phase>('edit')
  const [passage, setPassage] = useState('')
  const [recall, setRecall] = useState('')
  const [history, setHistory] = useState<number[]>([])
  const [result, setResult] = useState<ScoreResponse | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function score() {
    setBusy(true)
    setError(null)
    try {
      const r = await apiSend<ScoreResponse>(API, 'POST', {
        action: 'score',
        passage: { text: passage },
        recall,
        history,
      })
      setResult(r)
      setHistory((h) => [...h, r.report.recallScore])
      setPhase('result')
      setSent(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scoring failed')
    } finally {
      setBusy(false)
    }
  }

  async function sendGaps() {
    if (!result) return
    setBusy(true)
    try {
      for (const f of result.eiFacts) {
        await apiSend(`/api/elaborative-interrogation/bank`, 'POST', {
          action: 'add',
          statement: f.statement,
          keyTerms: f.keyTerms,
          priorKnowledge: f.priorKnowledge,
        })
      }
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add facts')
    } finally {
      setBusy(false)
    }
  }

  const btn = 'rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Free Recall"
        subtitle="Study, close the page, write what you remember. Retrieval beats re-reading."
      />
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {phase === 'edit' ? (
        <Panel>
          <label htmlFor="fr-passage" className="text-sm font-medium">
            Passage to learn (at least 40 characters)
          </label>
          <textarea
            id="fr-passage"
            className="mt-2 w-full rounded border p-2 text-sm"
            rows={8}
            value={passage}
            onChange={(e) => setPassage(e.target.value)}
          />
          <button
            type="button"
            className={`${btn} mt-2`}
            disabled={passage.trim().length < 40}
            onClick={() => setPhase('study')}
          >
            Start studying
          </button>
        </Panel>
      ) : null}

      {phase === 'study' ? (
        <Panel>
          <p className="whitespace-pre-wrap text-sm">{passage}</p>
          <button
            type="button"
            className={`${btn} mt-3`}
            onClick={() => {
              setRecall('')
              setPhase('recall')
            }}
          >
            Hide it and recall
          </button>
        </Panel>
      ) : null}

      {phase === 'recall' ? (
        <Panel>
          <label htmlFor="fr-recall" className="text-sm font-medium">
            Write everything you remember
          </label>
          <textarea
            id="fr-recall"
            className="mt-2 w-full rounded border p-2 text-sm"
            rows={8}
            value={recall}
            onChange={(e) => setRecall(e.target.value)}
          />
          <button
            type="button"
            className={`${btn} mt-2`}
            disabled={busy}
            onClick={() => void score()}
          >
            Check my recall
          </button>
        </Panel>
      ) : null}

      {phase === 'result' && result ? (
        <Panel>
          <div className="space-y-3" aria-live="polite">
            <p className="text-sm font-medium">
              Round {result.round}: {result.report.recallScore}/100 ({result.report.band}).{' '}
              {result.report.recalled} recalled, {result.report.partial} partial,{' '}
              {result.report.missed} missed.
            </p>
            <ul className="space-y-1 text-sm">
              {result.report.units.map((u) => (
                <li key={u.unit.id}>
                  <span className="font-mono text-xs">[{u.status}]</span> {u.unit.text}
                </li>
              ))}
            </ul>
            {result.report.intrusions.length > 0 ? (
              <div>
                <p className="text-sm font-medium">Check these sentences</p>
                <ul className="list-disc pl-5 text-sm">
                  {result.report.intrusions.map((i) => (
                    <li key={i.text}>{i.text}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ul className="list-disc pl-5 text-sm">
              {result.report.feedback.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="text-sm text-neutral-500">
              Next: {result.next.action}. {result.next.reason} Suggested wait:{' '}
              {result.delayMinutes >= 60
                ? `${Math.round(result.delayMinutes / 60)} h`
                : `${result.delayMinutes} min`}
              .
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border px-3 py-1.5 text-sm"
                onClick={() => setPhase('study')}
              >
                Re-read and try again
              </button>
              {result.eiFacts.length > 0 ? (
                <button
                  type="button"
                  className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                  disabled={busy || sent}
                  onClick={() => void sendGaps()}
                >
                  {sent
                    ? 'Added to Elaborative Interrogation'
                    : `Explain the ${result.eiFacts.length} gap(s) (add to Elaborative Interrogation)`}
                </button>
              ) : null}
            </div>
          </div>
        </Panel>
      ) : null}

      {phase === 'edit' && passage.trim().length === 0 ? (
        <EmptyState icon={<Brain className="h-6 w-6" />} title="Paste a passage to begin" />
      ) : null}
    </div>
  )
}
