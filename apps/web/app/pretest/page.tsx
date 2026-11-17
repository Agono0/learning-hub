'use client'

/**
 * /pretest — Pretesting & Errorful Generation Lab.
 *
 * Renders the guess-before-study protocol over the learner's REAL young,
 * fragile cards (ranked by FSRS fragility). Every wrong guess is followed by
 * feedback and an immediate study episode — the pretesting effect lives in
 * that pairing, not in failing for its own sake.
 */
import { useQuery } from '@tanstack/react-query'
import { FlaskConical, Sparkles } from 'lucide-react'
import { PretestingLab, type PretestCandidate } from '@/components/PretestingLab'
import { PageHeader } from '@/ui'
import { apiGet } from '@/lib/transport'

interface PretestingPayload {
  ok: boolean
  candidates: PretestCandidate[]
  sampleSize: number
  protocol: {
    name: string
    citation: string
    note: string
  }
}

export default function PretestPage() {
  const q = useQuery({
    queryKey: ['cognitive-pretesting'],
    queryFn: () => apiGet<PretestingPayload>('/api/cognitive/pretesting'),
  })

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        title="Pretest Lab"
        subtitle="Guess before you study: failed retrieval attempts are encoding events, not wasted time (Kornell, Hays & Bjork 2009)."
        icon={<FlaskConical className="h-5 w-5" />}
      />

      {q.isError ? (
        <div className="panel text-sm text-rose-600 dark:text-danger-text">
          Could not load pretest candidates.
        </div>
      ) : q.isLoading || !q.data ? (
        <div className="panel text-sm text-tertiary dark:text-faint">
          Ranking your young, fragile cards…
        </div>
      ) : q.data.sampleSize === 0 ? (
        <div className="panel text-sm text-tertiary dark:text-faint">
          <Sparkles className="mr-1.5 inline h-4 w-4 text-indigo-400" />
          No young cards to pretest yet — the protocol targets new material (stability &lt; 3 days).
          Import or create cards, then come back.
        </div>
      ) : (
        <>
          <PretestingLab candidates={q.data.candidates} />
          <p className="px-1 text-xs text-tertiary dark:text-faint">
            Protocol: {q.data.protocol.name} · {q.data.protocol.citation}. {q.data.protocol.note}
          </p>
        </>
      )}
    </div>
  )
}
