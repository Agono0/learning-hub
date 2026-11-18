'use client'

/**
 * Ideas: inbox board by stage, evolve picker (select 2 → AI hybrid with a
 * deterministic manual merge fallback), council modal (4 persona columns —
 * AI or copy-envelope manual mode), brainwriting session (AI or 6-3-5 by
 * hand), incubator (decay + resurface), promote-to-project.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitMerge, Gavel, ListPlus, RefreshCcw, Rocket, Users } from 'lucide-react'
// subpath import (NOT the barrel) — keeps the client bundle free of the AI/db graph
import { brainwritingMerge, scamperLenses, scamperPrompt } from '@learning-hub/core/ideas'
import type { IdeaStage } from '@learning-hub/core/types'
import { TransportPanel, useAiStatus } from '@/components/TransportPanel'
import { apiGet, apiSend } from '@/lib/transport'
import { PageHeader, useToast } from '@/ui'

interface Idea {
  id: number
  title: string
  content: string
  stage: IdeaStage
  tags: string[]
  resurfaceEveryDays: number
  lastResurfacedAt: string | null
  decayScore: number
  projectId: number | null
}
interface IdeaLink {
  id: number
  fromIdeaId: number
  toIdeaId: number
  type: string
}

const STAGES: IdeaStage[] = ['seed', 'growing', 'validated', 'project']
const STAGE_LABEL: Record<IdeaStage, string> = {
  seed: 'Seeds',
  growing: 'Growing',
  validated: 'Validated',
  project: 'Projects',
}

export default function IdeasPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: aiStatus } = useAiStatus()
  const manual = aiStatus?.configured === false
  const { data } = useQuery<{ ideas: Idea[]; links: IdeaLink[] }>({
    queryKey: ['ideas'],
    queryFn: () => apiGet<{ ideas: Idea[]; links: IdeaLink[] }>('/api/ideas'),
  })
  const ideas = data?.ideas ?? []
  const [title, setTitle] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [councilIdea, setCouncilIdea] = useState<Idea | null>(null)
  const [council, setCouncil] = useState<{ key: string; name: string; response: string }[] | null>(
    null,
  )
  const [topic, setTopic] = useState('')
  const [userIdeasText, setUserIdeasText] = useState('')
  const [brainwrite, setBrainwrite] = useState<{ merged: string[]; dropped: string[] } | null>(null)
  const [manualBrainwriteText, setManualBrainwriteText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lensPrompt, setLensPrompt] = useState<string | null>(null)

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['ideas'] })
  }

  const createIdea = useMutation({
    mutationFn: () => apiSend('/api/ideas', 'POST', { title }),
    onSuccess: () => {
      setTitle('')
      invalidate()
    },
    onError: (e) => setError(e.message),
  })

  const evolve = useMutation({
    mutationFn: async (ids: number[]) => {
      const body = await apiSend<{ ok: boolean; mode?: string; offspring?: Idea; error?: string }>(
        '/api/ideas/evolve',
        'POST',
        { aId: ids[0], bId: ids[1] },
      )
      if (!body.ok) throw new Error(body.error ?? 'evolve failed')
      return body as { mode: string; offspring: Idea }
    },
    onSuccess: (r) => {
      setError(null)
      setSelected([])
      invalidate()
      setLensPrompt(null)
      toast({
        title: `Offspring created (${r.mode === 'ai' ? 'AI hybrid' : 'manual merge'})`,
        description: r.offspring.title,
        tone: 'success',
      })
    },
    onError: (e) => setError(e.message),
  })

  const runCouncil = useMutation({
    mutationFn: async (ideaId: number) => {
      const body = await apiSend<{
        ok: boolean
        responses?: { key: string; name: string; response: string }[]
        error?: string
      }>('/api/ideas/council', 'POST', { ideaId })
      if (!body.ok) throw new Error(body.error ?? 'council failed')
      return body as { responses: { key: string; name: string; response: string }[] }
    },
    onSuccess: (r) => {
      setError(null)
      setCouncil(r.responses)
    },
    onError: (e) => setError(e.message),
  })

  const runBrainwrite = useMutation({
    mutationFn: async () => {
      const userIdeas = userIdeasText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      const body = await apiSend<{
        ok: boolean
        merged?: string[]
        dropped?: string[]
        error?: string
      }>('/api/ideas/brainwrite', 'POST', { topic, userIdeas })
      if (!body.ok) throw new Error(body.error ?? 'brainwrite failed')
      return body as { merged: string[]; dropped: string[] }
    },
    onSuccess: (r) => {
      setError(null)
      setBrainwrite(r)
    },
    onError: (e) => setError(e.message),
  })

  const patchIdea = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Record<string, unknown> }) => {
      const body = await apiSend<{ ok: boolean; error?: string }>(
        `/api/ideas/${id}`,
        'PATCH',
        patch,
      )
      if (!body.ok) throw new Error(body.error ?? 'failed')
      return body
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (e) => setError(e.message),
  })

  const incubator = useMemo(() => {
    const now = Date.now()
    return ideas
      .filter((i) => i.stage !== 'project')
      .map((i) => {
        const since = i.lastResurfacedAt ? now - Date.parse(i.lastResurfacedAt) : Infinity
        const days = since === Infinity ? 14 : since / 86_400_000
        const score = Math.min(
          1,
          (i.decayScore ?? 1) * Math.exp(-days / Math.max(1, i.resurfaceEveryDays)),
        )
        return { idea: i, score }
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 5)
  }, [ideas])

  const toggleSelect = (id: number) => {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length >= 2 ? [s[1]!, id] : [...s, id],
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ideas"
        subtitle="Capture, combine, interrogate, and let stale ideas resurface themselves."
      />

      {error && <div className="panel text-sm text-status-warning-text">{error}</div>}

      <div className="panel flex flex-wrap gap-2">
        <input
          className="input flex-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Capture an idea…"
          onKeyDown={(e) => e.key === 'Enter' && title.trim() && createIdea.mutate()}
        />
        <button
          className="btn"
          onClick={() => createIdea.mutate()}
          disabled={!title.trim() || createIdea.isPending}
        >
          <ListPlus className="h-4 w-4" /> Capture
        </button>
      </div>

      <div className="panel flex flex-wrap items-center gap-2">
        <span className="text-sm text-tertiary">{selected.length}/2 selected for evolution</span>
        <button
          className="btn"
          disabled={selected.length !== 2 || evolve.isPending}
          onClick={() => evolve.mutate(selected)}
        >
          <GitMerge className="h-4 w-4" /> {evolve.isPending ? 'Evolving…' : 'Evolve into hybrid'}
        </button>
        <span className="ml-auto flex flex-wrap gap-1">
          {scamperLenses.map((l, i) => (
            <button
              key={l.key}
              className="btn-ghost text-xs"
              title={`SCAMPER: ${l.name} — ${l.prompt}`}
              onClick={() =>
                setLensPrompt(
                  scamperPrompt(
                    selected.length === 1
                      ? (ideas.find((x) => x.id === selected[0])?.title ?? 'your idea')
                      : 'your idea',
                    i,
                  ),
                )
              }
            >
              {l.emoji} {l.name.split(' ')[0]}
            </button>
          ))}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {STAGES.map((stage) => (
          <div key={stage} className="space-y-2">
            <div className="label px-1">
              {STAGE_LABEL[stage]} ({ideas.filter((i) => i.stage === stage).length})
            </div>
            {ideas
              .filter((i) => i.stage === stage)
              .map((idea) => (
                <div
                  key={idea.id}
                  className={`panel cursor-pointer transition-colors ${selected.includes(idea.id) ? 'border-indigo-500' : ''}`}
                  onClick={() => toggleSelect(idea.id)}
                >
                  <div className="text-sm font-medium">{idea.title}</div>
                  {idea.content && (
                    <div className="mt-1 line-clamp-2 text-xs text-tertiary">{idea.content}</div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                    <button className="btn-ghost text-[10px]" onClick={() => setCouncilIdea(idea)}>
                      <Users className="h-3 w-3" /> Council
                    </button>
                    {stage !== 'project' && (
                      <button
                        className="btn-ghost text-[10px]"
                        onClick={() =>
                          patchIdea.mutate({
                            id: idea.id,
                            patch: { stage: STAGES[Math.min(3, STAGES.indexOf(stage) + 1)] },
                          })
                        }
                      >
                        stage →
                      </button>
                    )}
                    <button
                      className="btn-ghost text-[10px]"
                      onClick={() => patchIdea.mutate({ id: idea.id, patch: { promote: true } })}
                    >
                      <Rocket className="h-3 w-3" /> Project
                    </button>
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="panel space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <RefreshCcw className="h-4 w-4" /> Incubator — most decayed
          </h2>
          {incubator.length === 0 && <p className="text-sm text-tertiary">Nothing stale. Good.</p>}
          {incubator.map(({ idea, score }) => (
            <div key={idea.id} className="flex items-center gap-3 text-sm">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-200 dark:bg-(--hub-border)">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{ width: `${Math.round(score * 100)}%` }}
                />
              </div>
              <span className="flex-1 truncate">{idea.title}</span>
              <button
                className="btn-ghost text-xs"
                onClick={() => patchIdea.mutate({ id: idea.id, patch: { resurface: true } })}
              >
                Resurface
              </button>
            </div>
          ))}
        </section>

        <section className="panel space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" /> Brainwriting session
          </h2>
          <input
            className="input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic…"
          />
          <textarea
            className="input min-h-24"
            value={userIdeasText}
            onChange={(e) => setUserIdeasText(e.target.value)}
            placeholder={
              'Your ideas, one per line…\nI will add different angles (deduped against yours).'
            }
          />
          {!manual && (
            <button
              className="btn"
              onClick={() => runBrainwrite.mutate()}
              disabled={!topic.trim() || runBrainwrite.isPending}
            >
              {runBrainwrite.isPending ? 'Thinking…' : 'Generate + merge'}
            </button>
          )}
          {manual && (
            <>
              <TransportPanel
                feature="brainwrite"
                params={{ topic: topic || undefined, ideas: userIdeasText || undefined }}
                onValidated={(data) => {
                  const ideas = (data as { ideas?: string[] }).ideas ?? []
                  setBrainwrite(
                    brainwritingMerge(
                      userIdeasText
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean),
                      ideas,
                    ),
                  )
                }}
              />
              <div className="space-y-1">
                <textarea
                  className="input min-h-16 text-xs"
                  placeholder={
                    'No chatbot either? Paste your own 6-3-5 rounds here, one idea per line — the same dedupe merge runs on them.'
                  }
                  value={manualBrainwriteText}
                  onChange={(e) => setManualBrainwriteText(e.target.value)}
                />
                <button
                  className="btn-ghost text-xs"
                  disabled={!manualBrainwriteText.trim() || !topic.trim()}
                  onClick={() =>
                    setBrainwrite(
                      brainwritingMerge(
                        userIdeasText
                          .split('\n')
                          .map((s) => s.trim())
                          .filter(Boolean),
                        manualBrainwriteText
                          .split('\n')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      ),
                    )
                  }
                >
                  Merge pasted ideas (no AI)
                </button>
              </div>
            </>
          )}
          {brainwrite && (
            <div className="space-y-2 text-sm">
              <div className="label">Merged list ({brainwrite.merged.length})</div>
              <ul className="list-disc space-y-1 pl-5">
                {brainwrite.merged.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
              {brainwrite.dropped.length > 0 && (
                <p className="text-xs text-tertiary">
                  {brainwrite.dropped.length} AI idea(s) dropped as near-duplicates of yours.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      {councilIdea && (
        <div
          className="fixed inset-0 z-30 grid place-items-center bg-black/60 p-4"
          onClick={() => {
            setCouncilIdea(null)
            setCouncil(null)
          }}
        >
          <div className="panel w-full max-w-4xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold">
                <Gavel className="h-4 w-4" /> Council on: {councilIdea.title}
              </h3>
              <button
                className="btn-ghost"
                onClick={() => {
                  setCouncilIdea(null)
                  setCouncil(null)
                }}
              >
                ×
              </button>
            </div>
            {!council && !manual && (
              <button
                className="btn"
                onClick={() => runCouncil.mutate(councilIdea.id)}
                disabled={runCouncil.isPending}
              >
                {runCouncil.isPending ? 'Convening…' : 'Convene the council'}
              </button>
            )}
            {!council && manual && (
              <div className="space-y-2">
                <p className="text-xs text-tertiary">
                  Manual mode: no AI configured. Copy each persona's envelope into any chatbot (or
                  answer on paper) and paste the reply — it lands in that persona's column. Each
                  persona is a separate prompt by design: independent voices beat one group chat.
                </p>
                {(
                  [
                    'council-optimist',
                    'council-skeptic',
                    'council-domain-expert',
                    'council-devils-advocate',
                  ] as const
                ).map((feature, i) => (
                  <TransportPanel
                    key={feature}
                    feature={feature}
                    params={{ ideaId: councilIdea.id }}
                    defaultOpen={i === 0}
                    onValidated={(text) => {
                      const persona = ['optimist', 'skeptic', 'domain-expert', 'devils-advocate'][
                        i
                      ]!
                      setCouncil((prev) => {
                        const base = prev ?? []
                        const names = [
                          'The Optimist',
                          'The Skeptic',
                          'The Domain Expert',
                          "The Devil's Advocate",
                        ]
                        return [
                          ...base.filter((p) => p.key !== persona),
                          { key: persona, name: names[i]!, response: String(text) },
                        ]
                      })
                    }}
                  />
                ))}
              </div>
            )}
            {council && (
              <div className="grid gap-3 md:grid-cols-4">
                {council.map((p) => (
                  <div
                    key={p.key}
                    className="rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)"
                  >
                    <div className="mb-1 text-xs font-bold uppercase tracking-wide text-indigo-400">
                      {p.name}
                    </div>
                    <div className="text-xs whitespace-pre-wrap text-secondary">{p.response}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {lensPrompt && (
        <div className="panel text-sm">
          <div className="label mb-1">SCAMPER prompt (copy into the Tutor chat)</div>
          <p className="whitespace-pre-wrap text-secondary">{lensPrompt}</p>
          <button
            className="btn-ghost mt-2 text-xs"
            onClick={() => {
              void navigator.clipboard?.writeText(lensPrompt)
              setLensPrompt(null)
            }}
          >
            Copy & close
          </button>
        </div>
      )}
    </div>
  )
}
