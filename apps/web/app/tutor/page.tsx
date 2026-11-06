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
import { useQuery } from '@tanstack/react-query'
import { Lightbulb, Send, Settings2 } from 'lucide-react'
import { TransportPanel, useAiStatus } from '@/components/TransportPanel'
import type { ManualModeInfo } from '@/components/TransportPanel'
import { apiGet, apiStream } from '@/lib/transport'

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
  const streamBoxRef = useRef<HTMLDivElement>(null)

  const { data: aiStatus } = useAiStatus()
  const manual = aiStatus?.configured === false // provider 'none' → self-explain mode
  const { data: manualData } = useManualMode('tutor-grade', Boolean(manual))

  const { data: notesData } = useQuery<{ notes: NoteRow[] }>({
    queryKey: ['notes-for-tutor'],
    queryFn: () => apiGet<{ notes: NoteRow[] }>('/api/notes'),
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
              <option value="lesson" disabled>
                A lesson (pick from Curriculum)
              </option>
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
