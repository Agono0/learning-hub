'use client'

/**
 * Search Everything — the full-screen face of /api/search (FTS5 across all 17
 * knowledge surfaces) with an optional AI planner that turns a natural-language
 * question into a keyword plan (/api/search/nl). The AI never answers; it only
 * chooses what to look for, so results are always the user's own data.
 */
import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Search, Sparkles, X } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { EmptyState, IconButton, PageHeader, Panel } from '@/ui'
import { ClayIn, Stagger, StaggerItem, staggerDelay } from '@/lib/motion'

interface SearchHit {
  kind: string
  id: number
  title: string
  snippet: string
  href: string
}

interface SearchResponse {
  ok: boolean
  hits: SearchHit[]
  mode: 'fts5' | 'like'
}

interface NlSearchResponse extends SearchResponse {
  usedAI: boolean
  needsSetup: boolean
  plan?: { queries: string[]; kinds: string[] }
}

/** Manual-mode envelope from GET /api/ai/transport?feature=nl-search (rule 9). */
interface ManualEnvelope {
  manual: { title: string; summary: string; steps: string[] } | null
}

const KIND_LABELS: Record<string, string> = {
  note: 'Notes',
  card: 'Cards',
  lesson: 'Lessons',
  highlight: 'Highlights',
  idea: 'Ideas',
  journal: 'Journal',
  quote: 'Quotes',
  source: 'Reading',
  project: 'Projects',
  mindmap: 'Mind Maps',
  canvas: 'Canvases',
  palace: 'Palaces',
  goal: 'Goals',
  habit: 'Habits',
  capture: 'Captures',
  sq3r: 'SQ3R',
  chat: 'Tutor chats',
}

const ALL_KINDS = Object.keys(KIND_LABELS)

/**
 * Search tips (F-09, rule 9): the nl-search manual mode's guided steps,
 * shown alongside the keyword-split results when no AI planner is configured.
 * Guidance, never a gate — results stay visible above and below.
 */
function SearchTipsStrip() {
  const { data } = useQuery<ManualEnvelope>({
    queryKey: ['ai-transport-manual', 'nl-search'],
    queryFn: () => apiGet<ManualEnvelope>('/api/ai/transport?feature=nl-search'),
    staleTime: 60_000,
  })
  const m = data?.manual
  if (!m) return null
  return (
    <details className="mt-2 rounded-lg border border-neutral-200 p-2.5 text-xs dark:border-(--hub-border)">
      <summary className="cursor-pointer text-neutral-600 dark:text-secondary">
        Search tips — {m.title}
      </summary>
      <p className="mt-1.5 text-tertiary">{m.summary}</p>
      <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-tertiary">
        {m.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </details>
  )
}

function SearchPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const initial = params.get('q') ?? ''

  const [query, setQuery] = useState(initial)
  const [debounced, setDebounced] = useState(initial)
  const [activeKind, setActiveKind] = useState<string>('all')
  const [aiQuestion, setAiQuestion] = useState('')
  const [nl, setNl] = useState<NlSearchResponse | null>(null)
  const [nlLoading, setNlLoading] = useState(false)
  const [nlError, setNlError] = useState<string | null>(null)

  // Debounce the plain FTS query
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  const { data, isFetching } = useSearch(debounced)

  const presentKinds = useMemo(() => {
    const set = new Set<string>()
    for (const hit of data?.hits ?? []) set.add(hit.kind)
    return ALL_KINDS.filter((k) => set.has(k))
  }, [data?.hits])

  const shown = useMemo(() => {
    const hits = data?.hits ?? []
    return activeKind === 'all' ? hits : hits.filter((h) => h.kind === activeKind)
  }, [data?.hits, activeKind])

  async function runNlSearch() {
    const question = aiQuestion.trim()
    if (!question) return
    setNlLoading(true)
    setNlError(null)
    try {
      const res = await apiSend<NlSearchResponse>('/api/search/nl', 'POST', { question })
      setNl(res)
      if (res.plan?.queries?.length) {
        setQuery(res.plan.queries[0])
        setDebounced(res.plan.queries[0])
      }
    } catch (err) {
      setNlError((err as Error).message || 'Search planning failed')
    } finally {
      setNlLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Entrance beats: header → search panel. SSR-safe — ClayIn renders the
          final state server-side and animates client-side only when motionOK()
          allows (reduced-motion / e-ink never see it). */}
      <ClayIn>
        <PageHeader
          title="Search Everything"
          subtitle="Full-text search across all 17 knowledge surfaces — notes, cards, lessons, journal, quotes, reading, mind maps, canvases, palaces, goals, habits, captures and tutor chats."
        />
      </ClayIn>

      <ClayIn delayS={staggerDelay(1)}>
        <Panel>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              className="input pl-9 pr-9"
              placeholder="Search your entire library…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              aria-label="Search query"
            />
            {query && (
              <IconButton
                label="Clear search"
                onClick={() => {
                  setQuery('')
                  setDebounced('')
                  setNl(null)
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md"
              >
                <X className="h-4 w-4" />
              </IconButton>
            )}
          </div>

          {/* Ask mode — AI plans, the local index answers */}
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <input
              className="input flex-1"
              placeholder="Or ask a question — “what did I write about forgetting names?”"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runNlSearch()
              }}
              aria-label="Natural-language question"
            />
            <button
              type="button"
              onClick={() => void runNlSearch()}
              disabled={nlLoading || !aiQuestion.trim()}
              className="btn shrink-0"
            >
              <Sparkles className="h-4 w-4" />
              {nlLoading ? 'Planning…' : 'Ask'}
            </button>
          </div>

          {nlError && <p className="mt-2 text-xs text-danger-text">{nlError}</p>}
          {nl && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-tertiary">
              {nl.usedAI ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600/10 px-2 py-0.5 text-indigo-600 dark:text-indigo-300">
                  <Sparkles className="h-3 w-3" /> AI plan:{' '}
                  {nl.plan?.queries.map((q) => `“${q}”`).join(' · ')}
                </span>
              ) : nl.needsSetup ? (
                <span>Keyword search (add an AI provider in Settings for question planning)</span>
              ) : (
                <span>Keyword search</span>
              )}
            </div>
          )}
          {nl?.needsSetup && <SearchTipsStrip />}

          {/* Kind chips */}
          {presentKinds.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {presentKinds.map((k) => (
                <button
                  key={k}
                  onClick={() => setActiveKind(activeKind === k ? 'all' : k)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeKind === k || (activeKind === 'all' && presentKinds.length === 1)
                      ? 'border-indigo-500 bg-indigo-600/10 text-indigo-600 dark:text-indigo-300'
                      : 'border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-(--hub-border) dark:text-faint'
                  }`}
                >
                  {KIND_LABELS[k] ?? k}
                </button>
              ))}
            </div>
          )}
        </Panel>
      </ClayIn>

      {/* Results — the hit list staggers in per search (40ms steps, capped by
          the foundation). The Stagger is re-keyed per query+filter so every new
          result set runs the same deterministic choreography instead of
          inheriting a finished animation. Keys/classes/onClick stay on the hit
          buttons; StaggerItem only wraps them. */}
      {debounced ? (
        shown.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-tertiary">
              {shown.length} result{shown.length === 1 ? '' : 's'}
              {data?.mode === 'like' ? ' · substring fallback (FTS unavailable)' : ''}
              {isFetching ? ' · …' : ''}
            </p>
            <Stagger key={`${debounced}|${activeKind}`} className="space-y-2">
              {shown.map((hit, i) => (
                <StaggerItem key={`${hit.kind}:${hit.id}`} index={i}>
                  <button
                    onClick={() => router.push(hit.href)}
                    className="panel block w-full text-left transition-colors hover:border-indigo-400/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{hit.title || '(untitled)'}</span>
                      <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-tertiary dark:bg-(--hub-panel-2)">
                        {KIND_LABELS[hit.kind] ?? hit.kind}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-tertiary leading-relaxed">{hit.snippet}</p>
                  </button>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        ) : (
          !isFetching && (
            <EmptyState title="No matches" icon={<Search className="h-10 w-10 text-faint" />}>
              <p>
                Nothing found for “{debounced}”. Try fewer words, a synonym — or use Ask above to
                let the planner try several keyword angles.
              </p>
            </EmptyState>
          )
        )
      ) : (
        <EmptyState title="Search your library" icon={<Search className="h-10 w-10 text-faint" />}>
          <p>
            Every note, card, lesson, highlight, idea, journal entry, quote, source, project, mind
            map, canvas, palace, goal, habit, capture, SQ3R session and tutor chat — one box.
          </p>
        </EmptyState>
      )}
    </div>
  )
}

function useSearch(q: string): { data: SearchResponse | undefined; isFetching: boolean } {
  const [data, setData] = useState<SearchResponse | undefined>(undefined)
  const [isFetching, setIsFetching] = useState(false)
  useEffect(() => {
    let cancelled = false
    if (!q) {
      setData(undefined)
      return
    }
    setIsFetching(true)
    apiGet<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch(() => {
        /* keep previous results */
      })
      .finally(() => {
        if (!cancelled) setIsFetching(false)
      })
    return () => {
      cancelled = true
    }
  }, [q])
  return { data, isFetching }
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="animate-pulse text-sm text-faint">Loading…</div>}>
      <SearchPageInner />
    </Suspense>
  )
}
