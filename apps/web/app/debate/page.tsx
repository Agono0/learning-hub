'use client'

/**
 * Dialectic Debate Arena & Protégé Peer.
 *
 * - Pick a case from the built-in library (works offline, no AI provider needed).
 * - Flag the fallacy planted in a chosen turn — graded on the server against that
 *   turn's own answer key (Bloom level 6: evaluation).
 * - Write a closing ruling: a rule-based check scores it and the ruling is stored;
 *   the first substantive ruling per debate earns XP.
 * - Teach Alex (Protégé effect, Chase et al. 2009): Alex reacts to what your
 *   explanation actually covers instead of pretending to understand.
 * - No raw fetch: uses apiGet/apiSend from @/lib/transport.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, CheckCircle2, Gavel, Scale, User, XCircle } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import {
  Button,
  Callout,
  EmptyState,
  PageHeader,
  Panel,
  SelectField,
  Skeleton,
  Tabs,
  TextArea,
} from '@/ui'

type FallacyKey =
  | 'straw_man'
  | 'ad_hominem'
  | 'false_dichotomy'
  | 'circular_reasoning'
  | 'appeal_to_authority'
  | 'slippery_slope'

interface Turn {
  id: string
  speaker: 'thesis_agent' | 'antithesis_agent' | 'human_judge'
  speakerName: string
  argumentText: string
}

interface Debate {
  id: number
  topic: string
  thesisAgentRole: string
  antithesisAgentRole: string
  transcript: Turn[]
  learnerVerdict: string | null
  learnerScore: number | null
}

interface CaseMeta {
  slug: string
  coreConcepts: string[]
  protegeConcept: string
  protegeQuestion: string
}

interface ListResponse {
  debates: Debate[]
  cases: Array<{ slug: string; topic: string; domain: string }>
  fallacyCatalog: Record<FallacyKey, { label: string; description: string }>
}

interface DetailResponse {
  debate: Debate
  case: CaseMeta | null
  fallacyCatalog: Record<FallacyKey, { label: string; description: string }>
}

interface VerdictResponse {
  debate: Debate
  assessment: { score: number; feedback: string }
  xpAwarded: number
}

interface ProtegeReply {
  reply: string
  understood: boolean
  missingConcepts: string[]
}

const FALLACIES: FallacyKey[] = [
  'false_dichotomy',
  'ad_hominem',
  'straw_man',
  'circular_reasoning',
  'slippery_slope',
  'appeal_to_authority',
]

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')

export default function DebateArenaPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'arena' | 'protege'>('arena')
  const [debateId, setDebateId] = useState<number | null>(null)
  const [caseSlug, setCaseSlug] = useState('')
  const [turnId, setTurnId] = useState<string>('')
  const [flagResult, setFlagResult] = useState<{ correct: boolean; explanation: string } | null>(
    null,
  )
  const [verdict, setVerdict] = useState('')
  const [explanation, setExplanation] = useState('')

  const list = useQuery<ListResponse>({
    queryKey: ['dialectic-debates'],
    queryFn: () => apiGet<ListResponse>('/api/dialectic/arena'),
  })

  // Resume the most recent debate on first load.
  useEffect(() => {
    if (debateId === null && list.data?.debates[0]) setDebateId(list.data.debates[0].id)
    if (!caseSlug && list.data?.cases[0]) setCaseSlug(list.data.cases[0].slug)
  }, [list.data, debateId, caseSlug])

  const detail = useQuery<DetailResponse>({
    queryKey: ['dialectic-debate', debateId],
    queryFn: () => apiGet<DetailResponse>('/api/dialectic/arena', { id: debateId ?? undefined }),
    enabled: debateId !== null,
  })
  const debate = detail.data?.debate
  const caseMeta = detail.data?.case ?? null
  const catalog = detail.data?.fallacyCatalog ?? list.data?.fallacyCatalog

  const startCase = useMutation({
    mutationFn: (slug: string) =>
      apiSend<{ debate: Debate }>('/api/dialectic/arena', 'POST', { action: 'start_case', slug }),
    onSuccess: (res) => {
      setDebateId(res.debate.id)
      void queryClient.invalidateQueries({ queryKey: ['dialectic-debates'] })
    },
  })

  const flag = useMutation({
    mutationFn: (fallacy: FallacyKey) =>
      apiSend<{ correct: boolean; explanation: string }>('/api/dialectic/arena', 'POST', {
        action: 'evaluate_fallacy',
        id: debateId,
        turnId,
        fallacy,
      }),
    onSuccess: (res) => setFlagResult(res),
  })

  const submitVerdict = useMutation({
    mutationFn: () =>
      apiSend<VerdictResponse>('/api/dialectic/arena', 'POST', {
        action: 'submit_verdict',
        id: debateId,
        verdict: verdict.trim(),
      }),
    onSuccess: (res) => {
      queryClient.setQueryData<DetailResponse>(['dialectic-debate', debateId], (old) =>
        old ? { ...old, debate: res.debate } : old,
      )
    },
  })

  const protege = useMutation({
    mutationFn: () =>
      apiSend<ProtegeReply>('/api/dialectic/arena', 'POST', {
        action: 'protege_explain',
        slug: caseMeta?.slug,
        explanation: explanation.trim(),
      }),
  })

  // A different debate opened → reset the per-debate UI (only on id change).
  const openedId = debate?.id
  const firstTurnId = debate?.transcript[0]?.id ?? ''
  const resetProtege = protege.reset
  const resetVerdict = submitVerdict.reset
  useEffect(() => {
    setTurnId(firstTurnId)
    setFlagResult(null)
    setVerdict('')
    setExplanation('')
    resetProtege()
    resetVerdict()
  }, [openedId, firstTurnId, resetProtege, resetVerdict])

  const casePicker = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <SelectField
        label="Case"
        className="flex-1"
        value={caseSlug}
        onChange={(e) => setCaseSlug(e.target.value)}
      >
        {(list.data?.cases ?? []).map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.topic} ({c.domain})
          </option>
        ))}
      </SelectField>
      <Button
        variant={debate ? 'ghost' : 'primary'}
        loading={startCase.isPending}
        disabled={!caseSlug}
        onClick={() => startCase.mutate(caseSlug)}
      >
        {debate ? 'Start new case' : 'Open case'}
      </Button>
    </div>
  )

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <PageHeader
        title="Debate Arena & Protégé"
        subtitle="Judge two opposing arguments, expose their fallacies, rule on the case, then teach the idea to a peer."
        icon={<Gavel className="h-5 w-5" />}
      />

      {list.isLoading ? (
        <Skeleton className="h-64" />
      ) : list.isError ? (
        <Callout tone="danger" title="Could not load the arena">
          <Button variant="ghost" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </Callout>
      ) : (
        <>
          <Panel>{casePicker}</Panel>
          {startCase.isError ? (
            <p className="text-xs text-rose-600">{errorText(startCase.error)}</p>
          ) : null}

          {!debate ? (
            detail.isLoading ? (
              <Skeleton className="h-48" />
            ) : (
              <EmptyState icon={<Scale className="h-6 w-6" />} title="No case open">
                Choose a case above to start judging.
              </EmptyState>
            )
          ) : (
            <>
              <Tabs
                label="Arena mode"
                value={tab}
                onChange={setTab}
                items={[
                  { key: 'arena', label: 'Courtroom', icon: <Gavel className="h-4 w-4" /> },
                  {
                    key: 'protege',
                    label: 'Teach Alex',
                    icon: <User className="h-4 w-4" />,
                  },
                ]}
              />

              {tab === 'arena' ? (
                <div className="space-y-6">
                  <Panel title={debate.topic}>
                    <div className="space-y-3">
                      {debate.transcript.map((t, i) => {
                        const thesis = t.speaker === 'thesis_agent'
                        return (
                          <div
                            key={t.id}
                            className={`space-y-1 rounded-xl border p-3 ${
                              thesis
                                ? 'border-sky-500/30 bg-sky-500/5'
                                : 'border-violet-500/30 bg-violet-500/5'
                            }`}
                          >
                            <div className="text-xs font-semibold text-neutral-500">
                              Turn {i + 1} · {t.speakerName}
                            </div>
                            <p className="text-sm leading-relaxed">{t.argumentText}</p>
                          </div>
                        )
                      })}
                    </div>
                  </Panel>

                  <Panel title="Flag a fallacy">
                    <SelectField
                      label="Which argument?"
                      value={turnId}
                      onChange={(e) => {
                        setTurnId(e.target.value)
                        setFlagResult(null)
                      }}
                    >
                      {debate.transcript.map((t, i) => (
                        <option key={t.id} value={t.id}>
                          Turn {i + 1} — {t.speakerName}
                        </option>
                      ))}
                    </SelectField>
                    <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3">
                      {FALLACIES.map((f) => (
                        // Answer chips wrap (long labels); action buttons stay nowrap on mobile.
                        <button
                          type="button"
                          key={f}
                          disabled={!turnId || flag.isPending}
                          onClick={() => flag.mutate(f)}
                          className="min-h-[44px] rounded-xl border border-neutral-200 px-3 py-2 text-left text-sm font-medium transition hover:border-indigo-500 disabled:opacity-50 dark:border-(--hub-border)"
                        >
                          {catalog?.[f]?.label ?? f}
                        </button>
                      ))}
                    </div>
                    {flag.isError ? (
                      <p className="text-xs text-rose-600">{errorText(flag.error)}</p>
                    ) : null}
                    {flagResult ? (
                      <div
                        role="status"
                        className={`flex items-start gap-2 rounded-xl p-3 text-sm ${
                          flagResult.correct
                            ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {flagResult.correct ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        ) : (
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        )}
                        <span>{flagResult.explanation}</span>
                      </div>
                    ) : null}
                  </Panel>

                  <Panel title="Your ruling">
                    {debate.learnerVerdict && !submitVerdict.data ? (
                      <Callout
                        tone="neutral"
                        title={`Ruling on record (score ${debate.learnerScore ?? 0}/100)`}
                      >
                        <p className="italic">“{debate.learnerVerdict}”</p>
                      </Callout>
                    ) : null}
                    <TextArea
                      label="Synthesis"
                      hint="When is each side right? Name the conditions, not just a winner (15+ characters)."
                      value={verdict}
                      maxLength={5000}
                      onChange={(e) => setVerdict(e.target.value)}
                    />
                    <Button
                      icon={<Award className="h-4 w-4" />}
                      loading={submitVerdict.isPending}
                      disabled={verdict.trim().length < 15}
                      onClick={() => submitVerdict.mutate()}
                    >
                      {debate.learnerVerdict ? 'Revise ruling' : 'Submit ruling'}
                    </Button>
                    {submitVerdict.isError ? (
                      <p className="text-xs text-rose-600">{errorText(submitVerdict.error)}</p>
                    ) : null}
                    {submitVerdict.data ? (
                      <Callout
                        tone={submitVerdict.data.assessment.score >= 40 ? 'success' : 'warning'}
                        title={`Score ${submitVerdict.data.assessment.score}/100${
                          submitVerdict.data.xpAwarded > 0
                            ? ` · +${submitVerdict.data.xpAwarded} XP`
                            : ''
                        }`}
                      >
                        {submitVerdict.data.assessment.feedback}
                      </Callout>
                    ) : null}
                  </Panel>
                </div>
              ) : !caseMeta ? (
                <EmptyState
                  icon={<User className="h-6 w-6" />}
                  title="No protégé question for this debate"
                >
                  Open a library case to teach Alex about it.
                </EmptyState>
              ) : (
                <Panel title="Alex (a fellow learner)">
                  <p className="rounded-xl bg-violet-500/10 p-3 text-sm">
                    “{caseMeta.protegeQuestion}”
                  </p>
                  <TextArea
                    label="Your explanation"
                    hint="Plain language. Alex tells you which part is still unclear."
                    value={explanation}
                    maxLength={5000}
                    onChange={(e) => setExplanation(e.target.value)}
                  />
                  <Button
                    loading={protege.isPending}
                    disabled={!explanation.trim()}
                    onClick={() => protege.mutate()}
                  >
                    Explain to Alex
                  </Button>
                  {protege.isError ? (
                    <p className="text-xs text-rose-600">{errorText(protege.error)}</p>
                  ) : null}
                  {protege.data ? (
                    <Callout
                      tone={protege.data.understood ? 'success' : 'accent'}
                      title="Alex says"
                    >
                      {protege.data.reply}
                      <span className="mt-1 block text-xs opacity-75">
                        Rule-based check of key ideas, not AI grading.
                      </span>
                    </Callout>
                  ) : null}
                </Panel>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
