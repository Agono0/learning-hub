'use client'

/**
 * Feynman teach-back: pick a concept → explain it → the AI plays a confused
 * 12-year-old (2-3 follow-ups) → grade → coverage, misconceptions, and the
 * gap-cards it generated (.celebrate).
 *
 * Provider 'none' (the default) never dead-ends: manual mode = teach a real
 * person (or a rubber duck) + the self-assessment rubric the user fills in
 * themselves (coverage / misconceptions / gaps / gap-cards), with the
 * prompt-transport flow for any external chatbot. Gap-cards save via the
 * regular bulk card endpoint — no AI involved.
 */
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { GraduationCap, Send, Sparkles } from 'lucide-react'
import { TransportPanel, useAiStatus, type ManualModeInfo } from '@/components/TransportPanel'
import { apiGet, apiSend, apiStream } from '@/lib/transport'

interface Msg {
  /** stable client-side identity — the message list grows during a session */
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface GradeResult {
  coverage: number
  misconceptions: string[]
  gaps: string[]
}

function useManualMode(feature: string, enabled: boolean) {
  return useQuery<{ manual: ManualModeInfo | null }>({
    queryKey: ['ai-transport-manual', feature],
    queryFn: () =>
      apiGet<{ manual: ManualModeInfo | null }>(`/api/ai/transport?feature=${feature}`),
    enabled,
    staleTime: 60_000,
  })
}

export default function FeynmanPage() {
  const { data: aiStatus } = useAiStatus()
  const manual = aiStatus?.configured === false
  const { data: studentManual } = useManualMode('feynman-student', manual)
  const { data: graderManual } = useManualMode('feynman-grader', manual)

  const [concept, setConcept] = useState('')
  const [explanation, setExplanation] = useState('')
  const [started, setStarted] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [grade, setGrade] = useState<GradeResult | null>(null)
  const [gapCards, setGapCards] = useState<{ front: string; back: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [grading, setGrading] = useState(false)
  // manual-mode self-assessment state
  const [selfCoverage, setSelfCoverage] = useState<number | ''>('')
  const [selfMisconceptions, setSelfMisconceptions] = useState('')
  const [selfGaps, setSelfGaps] = useState('')
  const [selfCards, setSelfCards] = useState('')
  const [savedCards, setSavedCards] = useState<number | null>(null)
  const [followUps, setFollowUps] = useState(0)

  const { data: decksData } = useQuery<{ decks: { id: number; name: string }[] }>({
    queryKey: ['decks-for-teachback'],
    queryFn: () => apiGet<{ decks: { id: number; name: string }[] }>('/api/decks'),
    enabled: manual && started,
  })
  const [deckId, setDeckId] = useState<number | ''>('')

  const start = () => {
    if (!concept.trim() || !explanation.trim()) return
    const first: Msg = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `Let me explain "${concept.trim()}": ${explanation.trim()}`,
    }
    setStarted(true)
    setMessages([first])
    if (manual) {
      // no AI: the explanation sits in the transcript; follow-ups are self-asked
      setFollowUps(0)
      return
    }
    void chat([first])
  }

  const chat = async (history: Msg[]) => {
    setStreaming(true)
    setError(null)
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'assistant', content: '' }])
    try {
      await apiStream(
        '/api/ai/chat',
        {
          sessionId: sessionId ?? undefined,
          kind: 'feynman',
          contextType: 'concept',
          // send only the wire shape — ids are a client-side rendering concern
          messages: history.map(({ role, content }) => ({ role, content })),
        },
        (chunk) => {
          setMessages((m) => {
            const copy = [...m]
            const last = copy[copy.length - 1]
            if (last?.role === 'assistant')
              copy[copy.length - 1] = { ...last, content: last.content + chunk }
            return copy
          })
        },
        (sid) => setSessionId(Number(sid)),
      )
      setFollowUps((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStreaming(false)
    }
  }

  const send = async () => {
    const content = input.trim()
    if (!content || streaming) return
    const next: Msg[] = [...messages, { id: crypto.randomUUID(), role: 'user', content }]
    setMessages(next)
    setInput('')
    if (manual) {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            '(Manual mode — that answer is for your listener. Note where you hesitated: it goes in the rubric below.)',
        },
      ])
      setFollowUps((n) => n + 1)
      return
    }
    await chat(next)
  }

  const saveGapCards = useMutation({
    mutationFn: async () => {
      const items = selfCards
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [front, back] = line.split('::')
          return {
            type: 'basic',
            content: { basic: { front: (front ?? '').trim(), back: (back ?? '').trim() } },
            tags: ['teachback', 'gap', 'manual'],
          }
        })
        .filter((i) => i.content.basic.front && i.content.basic.back)
      const body = await apiSend<{ ok?: boolean; created?: number[]; error?: string }>(
        '/api/cards?bulk=1',
        'PUT',
        {
          deckId: Number(deckId),
          items,
        },
      )
      if (!body.ok) throw new Error(body.error ?? 'saving cards failed')
      return body.created!.length
    },
    onSuccess: (n) => setSavedCards(n),
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const doGrade = async () => {
    if (!sessionId) return
    setGrading(true)
    setError(null)
    try {
      const body = await apiSend<{
        ok?: boolean
        score?: GradeResult & { suggestedCards?: { front: string; back: string }[] }
        error?: string
      }>('/api/ai/feynman/grade', 'POST', { sessionId })
      if (!body.ok) {
        setError(body.error ?? 'grading failed')
        return
      }
      setGrade({
        coverage: body.score!.coverage,
        misconceptions: body.score!.misconceptions,
        gaps: body.score!.gaps,
      })
      setGapCards(body.score!.suggestedCards ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGrading(false)
    }
  }

  const applySelfGrade = () => {
    setGrade({
      coverage: typeof selfCoverage === 'number' ? selfCoverage : 0,
      misconceptions: selfMisconceptions
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      gaps: selfGaps
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    })
    setGapCards([])
  }

  const resetAll = () => {
    setStarted(false)
    setMessages([])
    setGrade(null)
    setSessionId(null)
    setConcept('')
    setExplanation('')
    setSelfCoverage('')
    setSelfMisconceptions('')
    setSelfGaps('')
    setSelfCards('')
    setSavedCards(null)
    setFollowUps(0)
  }

  if (!started) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Feynman Teach-back</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {manual
              ? 'Manual mode: no AI configured — explain to a real person (or a rubber duck), then grade yourself with the rubric below.'
              : 'Explain a concept as if to a 12-year-old. A confused student will ask follow-ups, then you get graded on coverage, misconceptions, and gaps — and gap-cards are born automatically.'}
          </p>
        </header>
        <div className="panel space-y-3">
          <div>
            <label className="label mb-1 block">Concept you're teaching</label>
            <input
              className="input"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="e.g. Bayesian updating"
            />
          </div>
          <div>
            <label className="label mb-1 block">
              Your explanation (start here — the student will interrupt)
            </label>
            <textarea
              className="input min-h-40"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Explain it plainly. Jargon will be questioned…"
            />
          </div>
          <button className="btn" onClick={start} disabled={!concept.trim() || !explanation.trim()}>
            <GraduationCap className="h-4 w-4" /> Start teaching
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teaching: {concept}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {manual
              ? 'Answer your listener from memory. Every stumble is rubric data.'
              : "Answer the student's questions. One question at a time — just like they'd ask."}
          </p>
        </div>
        {!manual && (
          <button className="btn" onClick={doGrade} disabled={grading || streaming || !sessionId}>
            <Sparkles className="h-4 w-4" /> {grading ? 'Grading…' : 'Grade my teach-back'}
          </button>
        )}
      </header>

      <div className="panel flex h-[45vh] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {manual && (
            <div className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 p-3 text-xs text-indigo-200">
              {studentManual?.manual?.title ?? 'Teach a real 12-year-old'}:{' '}
              {(studentManual?.manual?.steps ?? []).map((s, i) => (
                <div key={i}>{s}</div>
              ))}
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'ml-auto bg-indigo-600 text-white'
                  : 'bg-neutral-100 dark:bg-[#1a1a1f]'
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
            void send()
          }}
        >
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              manual ? 'Log your answers + the questions you got asked…' : 'Explain further…'
            }
            disabled={streaming || Boolean(grade)}
          />
          <button
            className="btn"
            type="submit"
            disabled={streaming || !input.trim() || Boolean(grade)}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {manual && !grade && graderManual?.manual && (
        <div className="panel space-y-3">
          <h2 className="text-sm font-semibold">
            Self-assessment rubric — grade substance, not style
          </h2>
          <p className="text-xs text-neutral-500">{graderManual.manual.summary}</p>
          {graderManual.manual.rubric?.map((r) => (
            <div key={r.key}>
              <label className="label mb-1 block">{r.label}</label>
              <p className="mb-1 text-[11px] text-neutral-500">{r.hint}</p>
              {r.key === 'coverage' ? (
                <input
                  className="input w-32"
                  type="number"
                  min={0}
                  max={100}
                  value={selfCoverage}
                  onChange={(e) =>
                    setSelfCoverage(
                      e.target.value === ''
                        ? ''
                        : Math.max(0, Math.min(100, Number(e.target.value))),
                    )
                  }
                  placeholder="0–100"
                />
              ) : (
                <textarea
                  className="input min-h-16 text-xs"
                  value={
                    r.key === 'misconceptions'
                      ? selfMisconceptions
                      : r.key === 'gaps'
                        ? selfGaps
                        : selfCards
                  }
                  onChange={(e) => {
                    if (r.key === 'misconceptions') setSelfMisconceptions(e.target.value)
                    else if (r.key === 'gaps') setSelfGaps(e.target.value)
                    else setSelfCards(e.target.value)
                  }}
                  placeholder={
                    r.key === 'suggestedCards'
                      ? 'What is ____? :: A single-idea answer'
                      : 'One per line…'
                  }
                />
              )}
            </div>
          ))}
          <button className="btn text-sm" disabled={selfCoverage === ''} onClick={applySelfGrade}>
            Apply my self-grade
          </button>
        </div>
      )}

      {grade && (
        <div className="celebrate panel space-y-4">
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold text-indigo-500">{grade.coverage}%</div>
            <div className="text-sm text-neutral-500">
              {manual ? 'concept coverage (self-graded)' : 'concept coverage'}
            </div>
          </div>
          {grade.misconceptions.length > 0 && (
            <div>
              <div className="label mb-1">Misconceptions</div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-red-400">
                {/* fixed list from one grade response — never reordered, index keys are safe */}
                {grade.misconceptions.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {grade.gaps.length > 0 && (
            <div>
              <div className="label mb-1">Gaps</div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-400">
                {/* fixed list from one grade response — never reordered, index keys are safe */}
                {grade.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}

          {manual ? (
            <div className="space-y-2">
              <div className="label">Save gap-cards ({followUps} answer(s) logged)</div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="input w-52"
                  value={deckId}
                  onChange={(e) => setDeckId(Number(e.target.value) || '')}
                >
                  <option value="">Pick a deck…</option>
                  {(decksData?.decks ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <textarea
                  className="input min-h-16 flex-1 text-xs"
                  placeholder={'One card per line: front :: back'}
                  value={selfCards}
                  onChange={(e) => setSelfCards(e.target.value)}
                />
                <button
                  className="btn text-xs"
                  disabled={!deckId || saveGapCards.isPending || !selfCards.trim()}
                  onClick={() => saveGapCards.mutate()}
                >
                  {saveGapCards.isPending ? 'Saving…' : 'Save gap-cards'}
                </button>
              </div>
              {savedCards !== null && (
                <p className="celebrate text-xs text-emerald-400">
                  {savedCards} card(s) created — scheduled for review.
                </p>
              )}
            </div>
          ) : (
            gapCards.length > 0 && (
              <div>
                <div className="label mb-2">Gap-cards created (scheduled for review)</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {/* fixed list from one grade response — never reordered, index keys are safe */}
                  {gapCards.map((c, i) => (
                    <div
                      key={i}
                      className="celebrate rounded-lg border border-neutral-200 p-3 text-sm dark:border-[#26262b]"
                    >
                      <div className="font-medium">{c.front}</div>
                      <div className="mt-1 text-neutral-500">{c.back}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
          <button className="btn-ghost" onClick={resetAll}>
            Teach another concept
          </button>
        </div>
      )}

      {manual && !grade && (
        <TransportPanel
          feature="feynman-grader"
          params={{ sessionId: sessionId ?? undefined }}
          onValidated={(data) => {
            const d = data as GradeResult & { suggestedCards?: { front: string; back: string }[] }
            setGrade({ coverage: d.coverage, misconceptions: d.misconceptions, gaps: d.gaps })
            setGapCards(d.suggestedCards ?? [])
          }}
          defaultOpen={false}
        />
      )}
    </div>
  )
}
