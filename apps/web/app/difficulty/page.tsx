'use client'

/**
 * /difficulty — Desirable-Difficulty Audit Studio (Dunlosky et al. 2013).
 *
 * Left column: what the system can MEASURE (retrieval minutes, spacing,
 * interleaving — derived from your real review log). Right column: what only
 * you can report (rereading/highlighting minutes) → the technique mix audit
 * and substitution plan. The two streams never blur: the HUD banner labels
 * the data sources, and the server recomputes telemetry on every audit.
 */
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Sparkles } from 'lucide-react'
import { DifficultyAuditStudio, type MeasuredPayload } from '@/components/DifficultyAuditStudio'
import { PageHeader, Panel } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { apiGet, apiSend } from '@/lib/transport'
import type { DifficultyAuditReport } from '@learning-hub/core'

interface MeasuredAuditPayload {
  ok: boolean
  measured: MeasuredPayload
  spacing: { verdict: string; guidance: string; totalMinutes: number }
  interleaving: { verdict: string; guidance: string; totalReviews: number }
  techniqueMix: {
    measurable: false
    note: string
    prompts: { techniqueId: string; question: string; helper: string }[]
  }
  windowDays: number
}

interface AuditPostPayload {
  ok: boolean
  report: DifficultyAuditReport
}

export default function DifficultyPage() {
  const q = useQuery({
    queryKey: ['cognitive-difficulty-audit'],
    queryFn: () =>
      apiGet<MeasuredAuditPayload>(
        `/api/cognitive/difficulty-audit?tzOffset=${new Date().getTimezoneOffset()}`,
      ),
  })

  const submitReport = async (
    minutesByTechnique: Record<string, number>,
  ): Promise<DifficultyAuditReport | null> => {
    const res = await apiSend<AuditPostPayload>('/api/cognitive/difficulty-audit', 'POST', {
      windowDays: 7,
      minutesByTechnique,
      tzOffset: new Date().getTimezoneOffset(),
    })
    return res.ok ? res.report : null
  }

  return (
    <ClayIn as="div" className="space-y-4 pb-8">
      <PageHeader
        title="Difficulty Audit"
        subtitle="Dunlosky et al. (2013) technique utility vs what you actually did — measured where possible, self-reported where not, and honest about the difference."
      />

      {q.isError ? (
        <Panel title="Could not load telemetry">
          <p className="text-sm text-danger-text dark:text-danger-text">
            The measured audit failed to load. Review some cards and reload — the audit needs
            review-log telemetry for spacing and interleaving.
          </p>
        </Panel>
      ) : q.isLoading || !q.data ? (
        <Panel title="Reading your review log…">
          <div className="h-24 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
        </Panel>
      ) : (
        <DifficultyAuditStudio
          measured={q.data.measured}
          spacingVerdict={q.data.spacing.verdict}
          spacingGuidance={q.data.spacing.guidance}
          interleavingVerdict={q.data.interleaving.verdict}
          interleavingGuidance={q.data.interleaving.guidance}
          onSubmitReport={submitReport}
        />
      )}

      {/* Evidence reference */}
      <section className="space-y-3" aria-label="Evidence reference">
        <h2 className="flex items-center gap-2 px-1 text-sm font-bold text-neutral-700 dark:text-neutral-200">
          <ClipboardList className="h-4 w-4 text-tertiary" />
          The evidence table this audit scores against
        </h2>
        <div className="panel space-y-2 text-xs leading-relaxed text-neutral-600 dark:text-secondary">
          <p>
            <strong>High utility:</strong> practice testing and distributed practice — robust across
            ages, materials, and retention intervals.
          </p>
          <p>
            <strong>Moderate utility:</strong> interleaving, self-explanation, elaborative
            interrogation — strong in specific conditions.
          </p>
          <p>
            <strong>Low utility:</strong> rereading, highlighting, summarization, keyword mnemonics,
            imagery — the techniques that <em>feel</em> most productive while creating fluency
            illusions (Bjork &amp; Bjork 2011).
          </p>
          <p className="text-tertiary dark:text-faint">
            Source: Dunlosky, Rawson, Marsh, Nathan &amp; Wegner (2013),{' '}
            <em>Psychological Science in the Public Interest</em>. The audit maps each technique's
            rating to a utility score and weights your logged minutes — see{' '}
            <code>packages/core/src/difficulty-audit</code>.
          </p>
        </div>
      </section>

      {/* Honest data-source banner */}
      <div className="panel flex flex-wrap items-center gap-2 text-xs text-tertiary dark:text-faint">
        <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
        <span>
          Measured: retrieval minutes, session spacing, deck interleaving (review log).
          Self-reported: technique minutes (the studio log above).
        </span>
      </div>
    </ClayIn>
  )
}
