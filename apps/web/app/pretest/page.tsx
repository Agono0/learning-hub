'use client'

import React from 'react'

/**
 * /pretest — Pretesting & Errorful Generation Lab.
 *
 * Renders the guess-before-study protocol over the learner's REAL young,
 * fragile cards (ranked by FSRS fragility). Every wrong guess is followed by
 * feedback and an immediate study episode — the pretesting effect lives in
 * that pairing, not in failing for its own sake.
 */
import { useQuery } from '@tanstack/react-query'
import { FlaskConical, Lightbulb } from 'lucide-react'
import { PretestingLab, type PretestCandidate } from '@/components/PretestingLab'
import { Callout, EmptyState, PageHeader, Skeleton } from '@/ui'
import { apiGet } from '@/lib/transport'
import { useGsapReveal } from '@/lib/useGsapReveal'

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
  // GSAP moment: header + lab rise in as the page enters (SSR-safe).
  const pageRef = useGsapReveal()

  return (
    <div ref={pageRef} className="space-y-4 pb-8">
      <PageHeader
        title="Pretest Lab"
        subtitle="Guess before you study: failed retrieval attempts are encoding events, not wasted time (Kornell, Hays & Bjork 2009)."
        icon={<FlaskConical className="h-5 w-5" />}
      />

      {q.isError ? (
        <Callout tone="danger" title="Could not load pretest candidates">
          The ranking endpoint did not respond. Try again in a moment.
        </Callout>
      ) : q.isLoading || !q.data ? (
        <div className="space-y-3" aria-hidden="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : q.data.sampleSize === 0 ? (
        <EmptyState icon={<Lightbulb className="h-8 w-8" />} title="No young cards to pretest yet">
          The protocol targets new material (stability &lt; 3 days). Import or create cards, then
          come back.
        </EmptyState>
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
