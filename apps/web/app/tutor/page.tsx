'use client'

/**
 * Socratic tutor chat — streaming via fetch + ReadableStream reader (no
 * useChat, avoiding AI SDK UI version coupling). Guardrail UI: the "reveal"
 * button stays disabled until the student has made at least one attempt in
 * this session, mirroring the server-side SOCRATIC_SYSTEM ladder.
 *
 * Provider 'none' (the default) never dead-ends: the page switches to
 * self-explain mode — the same escalation ladder as structured self-questioning
 * prompts, no AI calls — with the prompt-transport flow alongside for users
 * who have an external chatbot.
 */
import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { History, Lightbulb, Save, Send, Settings2, Sparkles } from 'lucide-react'
import { TransportPanel, useAiStatus } from '@/components/TransportPanel'
import type { ManualModeInfo } from '@/components/TransportPanel'
import { apiGet, apiSend, apiStream } from '@/lib/transport'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

type LadderStep = 'nudge' | 'hint' | 'worked-example' | 'solution'

const LADDER: { step: LadderStep; label: string; prompt: string }[] = [
  {
    step: 'nudge',
    label: '1 · Nudge me',
    prompt: "I'm stuck — give me a nudge in the right direction (no answer).",
  },
  {
    step: 'hint',
    label: '2 · Hint',
    prompt: 'Still stuck — give me a conceptual hint (still no answer).',
  },
  {
    step: 'worked-example',
    label: '3 · Worked example',
    prompt:
      'Please walk through an analogous example step by step, then hand the next step back to me.',
  },
  {
    step: 'solution',
    label: '4 · Reveal solution',
    prompt:
      'I have made a genuine attempt and the ladder has not worked — please show the full solution.',
  },
]

interface NoteRow {
  id: number
  title: string
}

interface SessionRow {
  id: number
  title: string
  contextType: string | null
  contextId: number | null
  hintsUsed: number | null
  createdAt: string
}

interface SessionSummary {
  summary: string
  understood: string[]
  gaps: string[]
  cards: { front: string; back: string }[]
}

interface DeckRow {
  id: number
  name: string
}

/** The self-explain manual mode comes from the transport endpoint (same source the docs use). */
function useManualMode(feature: string, enabled: boolean) {
  return useQuery<{ manual: ManualModeInfo | null }>({
    queryKey: ['ai-transport-manual', feature],
    queryFn: () =>
      apiGet<{ manual: ManualModeInfo | null }>(`/api/ai/transport?feature=${feature}`),
    enabled,
    staleTime: 60_000,
  })
}

export default function TutorPage() {
  const [kind] = useState<'tutor'>('tutor')
  const [contextType, setContextType] = useState<'note' | 'lesson' | null>(null)
  const [contextId, setContextId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [attempts, setAttempts] = useState(0) // student attempts made
  const [ladderStep, setLadderStep] = useState(0) // escalation ladder position
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [scratchpad, setScratchpad] = useState('')
  const [summary, setSummary] = useState<(SessionSummary & { usedAI: boolean }) | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryDeck, setSummaryDeck] = useState<number | null>(null)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const streamBoxRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { data: aiStatus } = useAiStatus()
  const manual = aiStatus?.configured === false // provider 'none' → self-explain mode
  const { data: manualData } = useManualMode('tutor-grade', Boolean(manual))

  const { data: notesData } = useQuery<{ notes: NoteRow[] }>({
    queryKey: ['notes-for-tutor'],
    queryFn: () => apiGet<{ notes: NoteRow[] }>('/api/notes'),
  })

  interface LessonOpt {
    id: number
    title: string
    course: string
  }
  const { data: lessonsData } = useQuery<{ lessons: LessonOpt[] }>({
    queryKey: ['curriculum-tree-for-tutor'],
    queryFn: async () => {
      const tree = await apiGet<{
        tracks: Array<{
          courses: Array<{
            title?: string
            units: Array<{ lessons: Array<{ id: number; title: string }> }>
          }>
        }>
      }>('/api/curriculum')
      const lessons: LessonOpt[] = []
      for (const track of tree.tracks ?? []) {
        for (const course of track.courses ?? []) {
          for (const unit of course.units ?? []) {
            for (const lesson of unit.lessons ?? []) {
              lessons.push({ id: lesson.id, title: lesson.title, course: course.title ?? '' })
            }
          }
        }
      }
      return { lessons }
    },
    staleTime: 60_000,
  })

  const { data: decksData } = useQuery<{ decks: DeckRow[] }>({
    queryKey: ['decks-for-tutor'],
    queryFn: () => apiGet<{ decks: DeckRow[] }>('/api/decks'),
  })

  const { data: sessionsData, refetch: refetchSessions } = useQuery<{ sessions: SessionRow[] }>({
    queryKey: ['tutor-sessions'],
    queryFn: () => apiGet<{ sessions: SessionRow[] }>('/api/ai/chat/sessions'),
    enabled: sessionsOpen,
  })

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || streaming) return
    setError(null)
    const next: Msg[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')
    setStreaming(true)
    // a sent message that is NOT a ladder prompt counts as an attempt
    if (!LADDER.some((l) => l.prompt === content)) setAttempts((a) => a + 1)
    setMessages((m) => [...m, { role: 'assistant', content: '' }])
    try {
      await apiStream(
        '/api/ai/chat',
        { sessionId: sessionId ?? undefined, kind, contextType, contextId, messages: next },
        (chunk) => {
          setMessages((m) => {
            const copy = [...m]
            const last = copy[copy.length - 1]
            if (last?.role === 'assistant')
              copy[copy.length - 1] = { ...last, content: last.content + chunk }
            return copy
          })
          streamBoxRef.current?.scrollTo({ top: streamBoxRef.current.scrollHeight })
        },
        (sid) => setSessionId(Number(sid)),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStreaming(false)
    }
  }

  const loadSession = async (id: number) => {
    setError(null)
    setSummary(null)
    try {
      const res = await apiGet<{
        ok: boolean
        session: {
          id: number
          contextType: string | null
          contextId: number | null
          messages: Msg[]
        }
      }>(`/api/ai/chat/sessions?id=${id}`)
      setSessionId(res.session.id)
      setContextType((res.session.contextType as 'note' | 'lesson' | null) ?? null)
      setContextId(res.session.contextId)
      setMessages(
        (res.session.messages ?? []).filter(
          (m) => m && (m.role === 'user' || m.role === 'assistant'),
        ),
      )
      setAttempts(1)
      setLadderStep(1)
      setSessionsOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const runSummary = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error('Start a session first')
      setSummaryLoading(true)
      return apiSend<SessionSummary & { ok: boolean; usedAI: boolean; needsSetup?: boolean }>(
        '/api/ai/chat/summary',
        'POST',
        { sessionId },
      )
    },
    onSuccess: (data) => {
      setSummary({
        summary: data.summary,
        understood: data.understood ?? [],
        gaps: data.gaps ?? [],
        cards: data.cards ?? [],
        usedAI: data.usedAI,
      })
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    onSettled: () => setSummaryLoading(false),
  })

  const saveSummaryCards = useMutation({
    mutationFn: async () => {
      if (!summaryDeck || !summary) throw new Error('Pick a deck first')
      const items = summary.cards.map((c) => ({
        type: 'basic',
        content: { basic: { front: c.front, back: c.back } },
        tags: ['tutor', 'gap'],
      }))
      return apiSend('/api/cards?bulk=1', 'PUT', { deckId: summaryDeck, items })
    },
    onSuccess: () => {
      setSummary(null)
      void queryClient.invalidateQueries({ queryKey: ['decks'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const climbLadder = (idx: number) => {
    setLadderStep(Math.max(ladderStep, idx + 1))
    void send(LADDER[idx]!.prompt)
  }

  const canReveal = attempts >= 1 // guardrail: no reveal without an attempt

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Socratic Tutor</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {manual
              ? 'Self-explain mode: no AI configured — you play the tutor. The escalation ladder becomes self-questioning prompts.'
              : 'The tutor never gives the answer before your first attempt — nudge → hint → worked example → solution.'}
          </p>
        </div>
        {!manual && (
          <div className="flex items-center gap-2">
            <select
              className="input w-44"
              value={contextType ?? ''}
              onChange={(e) => {
                const v = e.target.value as 'note' | 'lesson' | ''
                setContextType(v || null)
                setContextId(null)
              }}
            >
              <option value="">No context</option>
              <option value="note">A note</option>
              <option value="lesson">A lesson</option>
            </select>
            {contextType === 'note' && (
              <select
                className="input w-52"
                value={contextId ?? ''}
                onChange={(e) => setContextId(Number(e.target.value) || null)}
              >
                <option value="">Pick note…</option>
                {(notesData?.notes ?? []).map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </select>
            )}
            {contextType === 'lesson' && (
              <select
                className="input w-52"
                value={contextId ?? ''}
                onChange={(e) => setContextId(Number(e.target.value) || null)}
              >
                <option value="">Pick lesson…</option>
                {(lessonsData?.lessons ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.course ? `${l.course} — ${l.title}` : l.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </header>

      {manual ? (
        <>
          <div className="panel space-y-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <Lightbulb className="h-3.5 w-3.5" />{' '}
              {manualData?.manual?.title ?? 'Self-explain mode'} — the ladder, asked to yourself
            </div>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-neutral-300">
              {(manualData?.manual?.steps ?? ['Loading self-questioning prompts…']).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <textarea
              className="input min-h-40"
              placeholder="Work through the steps here. Write RESTATE, INVENTORY, PREDICT, ATTEMPT… — the writing IS the retrieval practice."
              value={scratchpad}
              onChange={(e) => setScratchpad(e.target.value)}
            />
            <p className="text-xs text-neutral-500">
              Anything you wrote for step 10 (LOG) is a flashcard candidate — add it from the Decks
              page. Reveal from notes only after step 9.
            </p>
          </div>
          <TransportPanel
            feature="tutor-grade"
            params={{ topic: input || undefined, attempt: scratchpad.slice(0, 500) || undefined }}
            defaultOpen={false}
          />
        </>
      ) : (
        <div className="panel flex h-[55vh] flex-col">
          <div ref={streamBoxRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <div className="grid h-full place-items-center text-center text-sm text-neutral-500">
                <div>
                  <Settings2 className="mx-auto mb-2 h-6 w-6 opacity-40" />
                  Ask about anything you're learning. Answer first — the tutor will coach, not
                  solve.
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'ml-auto bg-indigo-600 text-white'
                    : 'bg-neutral-100 dark:bg-(--hub-panel-2)'
                }`}
              >
                {m.content || '…'}
              </div>
            ))}
          </div>
          {error && (
            <div className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
              {error}
            </div>
          )}
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void send(input)
            }}
          >
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Your attempt, question, or confusion…"
              disabled={streaming}
            />
            <button className="btn" type="submit" disabled={streaming || !input.trim()}>
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      {!manual && sessionId != null && messages.length >= 2 && (
        <div className="panel space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <Sparkles className="h-3.5 w-3.5" /> Session summary &amp; gap cards
            </div>
            <button
              type="button"
              className="btn text-xs"
              disabled={summaryLoading}
              onClick={() => runSummary.mutate()}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {summaryLoading ? 'Summarizing…' : 'Summarize session'}
            </button>
          </div>

          {summary && (
            <div className="space-y-3 text-sm">
              <p className="text-neutral-600 dark:text-neutral-300">{summary.summary}</p>
              {summary.gaps.length > 0 && (
                <div>
                  <div className="label mb-1">Gaps</div>
                  <ul className="list-disc space-y-0.5 pl-5 text-xs">
                    {summary.gaps.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.understood.length > 0 && (
                <div>
                  <div className="label mb-1">Understood</div>
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-neutral-500">
                    {summary.understood.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.cards.length > 0 && (
                <div className="space-y-2">
                  <div className="label">{summary.cards.length} starter cards</div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {summary.cards.map((c, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-neutral-200 p-2 text-xs dark:border-(--hub-border)"
                      >
                        <span className="block font-medium">{c.front}</span>
                        <span className="text-neutral-500">{c.back}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="input w-48"
                      value={summaryDeck ?? ''}
                      onChange={(e) => setSummaryDeck(Number(e.target.value) || null)}
                      aria-label="Deck to save cards into"
                    >
                      <option value="">Save to deck…</option>
                      {(decksData?.decks ?? []).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn text-xs"
                      disabled={!summaryDeck || saveSummaryCards.isPending}
                      onClick={() => saveSummaryCards.mutate()}
                    >
                      <Save className="h-3.5 w-3.5" /> Save {summary.cards.length} cards
                    </button>
                    {!summary.usedAI && (
                      <span className="text-[11px] text-neutral-400">
                        (no provider — add one in Settings for AI gap detection)
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!manual && (
        <div className="panel">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500"
            onClick={() => setSessionsOpen((v) => !v)}
          >
            <History className="h-3.5 w-3.5" /> Past sessions
            {sessionId != null && (
              <span className="ml-1 normal-case text-neutral-400">(session #{sessionId})</span>
            )}
            <span className="ml-auto">{sessionsOpen ? '−' : '+'}</span>
          </button>
          {sessionsOpen && (
            <ul className="mt-2 space-y-1">
              {(sessionsData?.sessions ?? []).map((s2) => (
                <li key={s2.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)"
                    onClick={() => void loadSession(s2.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {s2.title || `Session ${s2.id}`}
                    </span>
                    <span className="ml-2 shrink-0 text-[10px] text-neutral-400">
                      {new Date(s2.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
              {(sessionsData?.sessions ?? []).length === 0 && (
                <li className="px-2 py-1 text-xs text-neutral-400">No past sessions yet.</li>
              )}
            </ul>
          )}
        </div>
      )}

      {!manual && (
        <div className="panel">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <Lightbulb className="h-3.5 w-3.5" /> Hint ladder — one rung at a time
            {!canReveal && (
              <span className="ml-auto normal-case text-neutral-400">
                (make an attempt to unlock reveal)
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {LADDER.map((l, i) => {
              const locked = i === LADDER.length - 1 && !canReveal
              return (
                <button
                  key={l.step}
                  className="btn-ghost text-xs"
                  disabled={streaming || locked || i > ladderStep}
                  onClick={() => climbLadder(i)}
                  title={
                    locked
                      ? 'Make at least one attempt first — retrieval before reveal.'
                      : undefined
                  }
                >
                  {l.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
