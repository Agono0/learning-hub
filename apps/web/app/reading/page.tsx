'use client'

/**
 * Reading Studio — Incremental Reading + Guided SQ3R Mode + Multi-Format Ingestion:
 * - Ingest PDF, EPUB, Markdown/TXT files, Web Article URLs, YouTube transcripts,
 *   or pasted Markdown via a calm `@/ui` Sheet (zero `window.prompt`/`window.alert`)
 * - Real SQLite highlight IDs in the triage queue (`keep` / `discard` / `→ cards`)
 * - Full SQ3R workflow (Survey → Question → Read → Recite → Review → 1-click FSRS cards)
 *
 * CLIENT component — uses `@/lib/transport` and `<Markdown>` exclusively (Hard Rules #1, #11).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Highlighter,
  ListChecks,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from 'lucide-react'
import { extractIncidentalGlossTokens } from '@learning-hub/core'
import { tokenizeText } from '@learning-hub/core/exposure'
import { useAiStatus } from '@/components/TransportPanel'
import { CardMinerSheet } from '@/components/CardMinerSheet'
import { apiGet, apiSend, apiUpload } from '@/lib/transport'
import { Badge, Markdown, PageHeader, Sheet, Tabs } from '@/ui'

interface Source {
  id: number
  kind: string
  title: string
  url?: string | null
  content: string
  priority: number
  position: number
  status: string
}

interface Highlight {
  id: number
  sourceId: number
  text: string
  triaged: number
  strength: number
}

interface Fragment {
  text: string
  nextPosition: number
  done: boolean
  words: number
}

interface Sq3rQuestion {
  id: string
  question: string
  answer: string
  cardId?: number
}

interface Sq3rSession {
  id: number
  sourceId: number
  surveyHeadings: string[]
  questions: Sq3rQuestion[]
  reciteNotes: string
  completedSteps: ('survey' | 'question' | 'read' | 'recite' | 'review')[]
  updatedAt: string
}

type IngestTab = 'file' | 'url' | 'youtube' | 'markdown'
type StudyMode = 'incremental' | 'sq3r' | 'exposure'
type Sq3rStep = 'survey' | 'question' | 'read' | 'recite' | 'review'

function manualGhostHint(mode: 'define' | 'simplify' | 'flashcard', selected: string): string {
  const quote = selected.trim() ? `"${selected.trim().slice(0, 120)}…"` : 'the fragment'
  switch (mode) {
    case 'define':
      return `Manual mode — no AI configured. Write the definitions yourself in a note: list the key terms in ${quote}, one definition per line, in your own words (the effort IS the encoding).`
    case 'simplify':
      return `Manual mode — no AI configured. Self-explain: rewrite ${quote} for a smart 15-year-old, keeping every technical term but explaining it. Where you can't simplify is a gap — log it in the Journal.`
    case 'flashcard':
      return `Manual mode — no AI configured. Make the card by hand from ${quote}: click "→ cards" on any highlight below or use SQ3R Review mode to convert your Q&As directly into cards.`
  }
}

/** Response of GET /api/reading/exposure (+ coverage from POST action 'analyze'). */
type ExposureLedger = {
  ok: boolean
  words: Array<{
    normalized: string
    sampleToken: string
    encounterCount: number
    distinctDays: number
    eligibleForPromotion: boolean
    isAlreadyCard: boolean
  }>
  coverageAnalysis?: {
    totalTokens: number
    knownCount: number
    coveragePercent: number
    zone: 'optimal' | 'frustration' | 'effortless'
    unknownTokens: Array<{ token: string; count: number }>
  } | null
}

export default function ReadingPage() {
  const qc = useQueryClient()
  const { data: aiStatus } = useAiStatus()
  const manual = aiStatus?.configured === false

  const { data: lib } = useQuery<{ sources: Source[] }>({
    queryKey: ['sources'],
    queryFn: () => apiGet<{ sources: Source[] }>('/api/reading'),
  })

  const [activeId, setActiveId] = useState<number | null>(null)
  const [studyMode, setStudyMode] = useState<StudyMode>('incremental')
  const [sq3rStep, setSq3rStep] = useState<Sq3rStep>('survey')
  const [peekDuringRecite, setPeekDuringRecite] = useState(false)

  // Add Source Sheet state
  const [ingestOpen, setIngestOpen] = useState(false)
  const [ingestTab, setIngestTab] = useState<IngestTab>('file')
  const [urlInput, setUrlInput] = useState('')
  const [titleInput, setTitleInput] = useState('')
  const [markdownInput, setMarkdownInput] = useState('')
  const [priorityInput, setPriorityInput] = useState(50)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const { data: detail } = useQuery<{
    source: Source
    highlights: Highlight[]
    fragment: Fragment
  }>({
    queryKey: ['source', activeId],
    queryFn: () =>
      apiGet<{ source: Source; highlights: Highlight[]; fragment: Fragment }>(
        `/api/reading/${activeId}`,
      ),
    enabled: Boolean(activeId),
  })

  const sq3rQuery = useQuery<{ ok: boolean; session: Sq3rSession }>({
    queryKey: ['sq3r', activeId],
    queryFn: () =>
      apiGet<{ ok: boolean; session: Sq3rSession }>(`/api/reading/sq3r?sourceId=${activeId}`),
    enabled: Boolean(activeId) && studyMode === 'sq3r',
  })

  // Local editable SQ3R state synced with server
  const [questions, setQuestions] = useState<Sq3rQuestion[]>([])
  const [newQuestion, setNewQuestion] = useState('')
  const [reciteNotes, setReciteNotes] = useState('')
  const [completedSteps, setCompletedSteps] = useState<Sq3rStep[]>([])

  useEffect(() => {
    const s = sq3rQuery.data?.session
    if (!s) return
    setQuestions(s.questions ?? [])
    setReciteNotes(s.reciteNotes ?? '')
    setCompletedSteps((s.completedSteps ?? []) as Sq3rStep[])
  }, [sq3rQuery.data])

  const { data: resurfaceData } = useQuery<{
    resurface: (Highlight & { sourceTitle: string | null })[]
  }>({
    queryKey: ['resurface'],
    queryFn: () =>
      apiGet<{ resurface: (Highlight & { sourceTitle: string | null })[] }>(
        '/api/reading/highlights?mode=resurface&limit=10',
      ),
  })

  const { data: vocabCards } = useQuery<{
    cards: Array<{ id: number; front?: string; back?: string; content?: Record<string, unknown> }>
  }>({
    queryKey: ['vocab-cards'],
    queryFn: () => apiGet('/api/cards?limit=200'),
  })

  const incidentalGloss = useMemo(() => {
    const text = detail?.source?.content || detail?.fragment?.text || ''
    if (!text || !vocabCards?.cards) return []
    const map = new Map<string, { cardId: number; definition: string }>()
    for (const c of vocabCards.cards) {
      const front = (c.front || (c.content?.front as string) || '').trim().toLowerCase()
      const back = (c.back || (c.content?.back as string) || '').trim()
      if (front && back && front.length > 2) {
        map.set(front, { cardId: c.id, definition: back })
      }
    }
    const tokens = extractIncidentalGlossTokens(text, map)
    const matched = tokens.filter((t) => !t.isKnown && t.definition)
    const unique = new Map<string, { word: string; cardId: number; definition: string }>()
    for (const m of matched) {
      if (!unique.has(m.normalized)) {
        unique.set(m.normalized, { word: m.word, cardId: m.cardId!, definition: m.definition! })
      }
    }
    return Array.from(unique.values())
  }, [detail?.source?.content, detail?.fragment?.text, vocabCards?.cards])

  const recordedFragmentRef = useRef<string>('')
  useEffect(() => {
    const text = detail?.fragment?.text
    if (!text || !detail?.source?.id || recordedFragmentRef.current === text) return
    recordedFragmentRef.current = text
    // Same tokenizer (incl. stop-words) the server uses for coverage, capped per fragment.
    const words = tokenizeText(text).slice(0, 100)
    if (words.length > 0) {
      void apiSend('/api/reading/exposure', 'POST', {
        action: 'record_batch',
        tokens: words,
        sourceType: 'reading',
        sourceId: detail.source.id,
        contextSnippet: text.slice(0, 200),
      })
    }
  }, [detail?.fragment?.text, detail?.source?.id])

  const exposureQuery = useQuery<ExposureLedger>({
    queryKey: ['reading-exposure', detail?.source?.id, detail?.fragment?.text?.slice(0, 50)],
    queryFn: async () => {
      const ledger = await apiGet<ExposureLedger>('/api/reading/exposure?limit=40')
      const text = detail?.fragment?.text
      if (!text) return ledger
      // POST so the whole fragment is analysed — a query string would truncate it.
      const { coverageAnalysis } = await apiSend<Pick<ExposureLedger, 'coverageAnalysis'>>(
        '/api/reading/exposure',
        'POST',
        { action: 'analyze', text },
      )
      return { ...ledger, coverageAnalysis }
    },
  })

  const promoteWord = useMutation({
    mutationFn: async ({ token, snippet }: { token: string; snippet?: string }) => {
      return apiSend('/api/reading/exposure', 'POST', {
        action: 'promote',
        token,
        contextSnippet: snippet,
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reading-exposure'] })
      void qc.invalidateQueries({ queryKey: ['vocab-cards'] })
      void qc.invalidateQueries({ queryKey: ['cards'] })
      setFeedback({ kind: 'ok', text: 'Word promoted to FSRS flashcard!' })
    },
    onError: (e) =>
      setFeedback({
        kind: 'error',
        text: e instanceof Error ? e.message : 'Could not create card',
      }),
  })

  const [selected, setSelected] = useState('')
  const [triageQueue, setTriageQueue] = useState<Highlight[]>([])
  const [ghostResult, setGhostResult] = useState<string | null>(null)
  const [mineText, setMineText] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['sources'] })
    void qc.invalidateQueries({ queryKey: ['source', activeId] })
    void qc.invalidateQueries({ queryKey: ['resurface'] })
    void qc.invalidateQueries({ queryKey: ['sq3r', activeId] })
  }

  const resetIngestForm = () => {
    setUrlInput('')
    setTitleInput('')
    setMarkdownInput('')
    setPriorityInput(50)
  }

  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      if (titleInput.trim()) form.append('title', titleInput.trim())
      form.append('priority', String(priorityInput))
      return apiUpload<{ ok: boolean; source: Source; chapters?: number; error?: string }>(
        '/api/reading',
        form,
      )
    },
    onSuccess: (r) => {
      invalidate()
      setActiveId(r.source.id)
      setIngestOpen(false)
      resetIngestForm()
      setFeedback({
        kind: 'ok',
        text: `Added "${r.source.title}"${r.chapters ? ` (${r.chapters} chapters)` : ''}.`,
      })
    },
    onError: (e) =>
      setFeedback({ kind: 'error', text: e instanceof Error ? e.message : 'Upload failed' }),
  })

  const ingestRemoteOrMarkdown = useMutation({
    mutationFn: async () => {
      if (ingestTab === 'url') {
        return apiSend<{ ok: boolean; source?: Source; error?: string }>(
          '/api/reading/ingest',
          'POST',
          {
            mode: 'url',
            url: urlInput.trim(),
            title: titleInput.trim() || undefined,
            priority: priorityInput,
          },
        )
      }
      if (ingestTab === 'youtube') {
        return apiSend<{ ok: boolean; source?: Source; error?: string }>(
          '/api/reading/ingest',
          'POST',
          {
            mode: 'youtube',
            url: urlInput.trim(),
            title: titleInput.trim() || undefined,
            priority: priorityInput,
          },
        )
      }
      return apiSend<{ ok: boolean; source?: Source; error?: string }>(
        '/api/reading/ingest',
        'POST',
        {
          mode: 'markdown',
          title: titleInput.trim() || 'Untitled Note',
          content: markdownInput.trim(),
          priority: priorityInput,
        },
      )
    },
    onSuccess: (r) => {
      if (!r.ok || !r.source) {
        setFeedback({ kind: 'error', text: r.error ?? 'Could not import source' })
        return
      }
      invalidate()
      setActiveId(r.source.id)
      setIngestOpen(false)
      resetIngestForm()
      setFeedback({ kind: 'ok', text: `Imported "${r.source.title}".` })
    },
    onError: (e) =>
      setFeedback({ kind: 'error', text: e instanceof Error ? e.message : 'Import failed' }),
  })

  const patchSource = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      apiSend(`/api/reading/${activeId}`, 'PATCH', patch),
    onSuccess: invalidate,
  })

  const extractHighlights = useMutation({
    mutationFn: async (sourceId: number) => {
      const body = await apiSend<{
        ok: boolean
        highlights?: string[]
        createdRows?: Highlight[]
        error?: string
      }>('/api/reading/highlights', 'POST', {
        sourceId,
        text: selected || undefined,
      })
      if (!body.ok) throw new Error(body.error ?? 'extract failed')
      return body
    },
    onSuccess: (r) => {
      invalidate()
      // Use real persisted SQLite highlight rows so Keep/Discard triage persists!
      const persistedRows: Highlight[] =
        r.createdRows && r.createdRows.length > 0
          ? r.createdRows
          : (r.highlights ?? []).map((text, i) => ({
              id: -1 - i,
              sourceId: activeId ?? 0,
              text,
              triaged: 0,
              strength: 0.5,
            }))
      setTriageQueue((q) => [...persistedRows, ...q])
      setSelected('')
      setFeedback({
        kind: 'ok',
        text: `Extracted ${persistedRows.length} highlight candidate(s) into triage queue.`,
      })
    },
    onError: (e) =>
      setFeedback({ kind: 'error', text: e instanceof Error ? e.message : 'Extraction failed' }),
  })

  const triage = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'keep' | 'discard' }) => {
      if (id < 0) return { action }
      return apiSend(`/api/reading/highlights`, 'PATCH', { id, action })
    },
    onSuccess: invalidate,
  })

  const markSeen = useMutation({
    mutationFn: async (ids: number[]) => {
      if (ids.length === 0) return { ok: true, seen: [] as number[] }
      return apiSend<{ ok: boolean; seen?: number[]; error?: string }>(
        '/api/reading/highlights',
        'POST',
        { seenIds: ids },
      )
    },
    onSuccess: invalidate,
  })

  const saveSq3r = useMutation({
    mutationFn: (patch: {
      questions?: Sq3rQuestion[]
      reciteNotes?: string
      completedSteps?: Sq3rStep[]
    }) =>
      apiSend<{ ok: boolean; session: Sq3rSession }>('/api/reading/sq3r', 'PUT', {
        sourceId: activeId,
        ...patch,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sq3r', activeId] }),
  })

  const convertSq3rCards = useMutation({
    mutationFn: () =>
      apiSend<{ ok: boolean; createdCards: number; deckId: number; session: Sq3rSession }>(
        '/api/reading/sq3r',
        'POST',
        { sourceId: activeId },
      ),
    onSuccess: (res) => {
      invalidate()
      void qc.invalidateQueries({ queryKey: ['decks'] })
      setFeedback({
        kind: 'ok',
        text:
          res.createdCards > 0
            ? `Created ${res.createdCards} FSRS flashcard(s) from your SQ3R Q&As!`
            : 'All answered SQ3R questions are already linked to flashcards.',
      })
    },
    onError: (e) =>
      setFeedback({
        kind: 'error',
        text: e instanceof Error ? e.message : 'Could not create flashcards',
      }),
  })

  const ghost = useMutation({
    mutationFn: async (mode: 'define' | 'simplify' | 'flashcard') => {
      const text = selected || detail?.fragment.text.slice(0, 2000) || ''
      if (mode === 'flashcard') {
        const body = await apiSend<{ ok?: boolean; cards?: number[]; error?: string }>(
          '/api/ai/generate',
          'POST',
          {
            kind: 'cloze',
            payload: { text, deckId: 1 },
          },
        )
        if (!body.ok) throw new Error(body.error ?? 'failed')
        return `Created ${body.cards!.length} cloze card(s) in deck #1.`
      }
      const prompt =
        mode === 'define'
          ? `Define the key terms in this text, one definition per line:\n"""${text.slice(0, 8000)}"""`
          : `Simplify this text for a smart 15-year-old, keeping every technical term but explaining it:\n"""${text.slice(0, 8000)}"""`
      const body = await apiSend<{ ok?: boolean; summary?: string; error?: string }>(
        '/api/ai/generate',
        'POST',
        {
          kind: 'summary',
          payload: { text: prompt },
        },
      )
      if (!body.ok) throw new Error(body.error ?? 'failed')
      return body.summary!
    },
    onSuccess: (r) => setGhostResult(r),
    onError: (e) => setGhostResult(`⚠ ${e.message}`),
  })

  const markStepDone = (step: Sq3rStep) => {
    const next = completedSteps.includes(step) ? completedSteps : [...completedSteps, step]
    setCompletedSteps(next)
    saveSq3r.mutate({ questions, reciteNotes, completedSteps: next })
  }

  const addGuidingQuestion = (qText: string) => {
    const trimmed = qText.trim()
    if (!trimmed) return
    const item: Sq3rQuestion = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      question: trimmed.endsWith('?') ? trimmed : `${trimmed}?`,
      answer: '',
    }
    const next = [...questions, item]
    setQuestions(next)
    setNewQuestion('')
    saveSq3r.mutate({ questions: next })
  }

  const updateQuestionAnswer = (id: string, answer: string) => {
    const next = questions.map((q) => (q.id === id ? { ...q, answer } : q))
    setQuestions(next)
  }

  const source = detail?.source
  const fragment = detail?.fragment
  const surveyHeadings = sq3rQuery.data?.session.surveyHeadings ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reading Studio"
        subtitle="PDF, EPUB, Web Articles, YouTube transcripts & Markdown — incremental reading or guided SQ3R."
        actions={
          <button
            className="btn"
            onClick={() => {
              setFeedback(null)
              setIngestOpen(true)
            }}
          >
            <Plus className="h-4 w-4" /> Add source
          </button>
        }
      />

      {feedback && (
        <div
          className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
            feedback.kind === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
          }`}
        >
          <span>{feedback.text}</span>
          <button className="opacity-70 hover:opacity-100" onClick={() => setFeedback(null)}>
            ✕
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-2">
          <div className="label px-1">Queue (by priority)</div>
          {(lib?.sources ?? []).map((s) => (
            <button
              key={s.id}
              className={`panel w-full text-left text-sm ${activeId === s.id ? 'border-indigo-500' : ''}`}
              onClick={() => setActiveId(s.id)}
            >
              <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 shrink-0 opacity-50" />
                <span className="flex-1 truncate">{s.title}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-(--hub-border)">
                <div className="h-full bg-indigo-500" style={{ width: `${s.position}%` }} />
              </div>
              <div className="mt-1 text-[10px] text-neutral-500">
                {s.kind} · {Math.round(s.position)}% · priority {s.priority}
              </div>
            </button>
          ))}
          {lib?.sources.length === 0 && (
            <p className="px-1 text-sm text-neutral-500">
              Nothing queued yet — click “Add source” to import a PDF, EPUB, URL, YouTube video, or
              Markdown note.
            </p>
          )}

          <div className="panel mt-4">
            <div className="label mb-2 flex items-center justify-between">
              <span>Daily resurfacing</span>
              {(resurfaceData?.resurface ?? []).length > 0 && (
                <button
                  className="text-[10px] normal-case text-indigo-400 hover:text-indigo-300"
                  onClick={() =>
                    markSeen.mutate((resurfaceData?.resurface ?? []).slice(0, 5).map((h) => h.id))
                  }
                  disabled={markSeen.isPending}
                >
                  Mark seen
                </button>
              )}
            </div>
            {(resurfaceData?.resurface ?? []).slice(0, 5).map((h) => (
              <div key={h.id} className="mb-2 border-l-2 border-indigo-500/50 pl-2 text-xs">
                <div className="line-clamp-2 text-neutral-300">{h.text}</div>
                <div className="mt-0.5 text-[10px] text-neutral-500">{h.sourceTitle}</div>
              </div>
            ))}
            {(resurfaceData?.resurface ?? []).length === 0 && (
              <p className="text-xs text-neutral-500">No highlights to resurface.</p>
            )}
          </div>
        </aside>

        <section className="space-y-3">
          {source && fragment ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Tabs<StudyMode>
                  label="Reading workflow mode"
                  value={studyMode}
                  onChange={setStudyMode}
                  items={[
                    {
                      key: 'incremental',
                      label: 'Incremental Reader',
                      icon: <BookOpen className="h-3.5 w-3.5" />,
                    },
                    {
                      key: 'sq3r',
                      label: 'SQ3R Guided Study',
                      icon: <ListChecks className="h-3.5 w-3.5" />,
                    },
                    {
                      key: 'exposure',
                      label: 'Vocabulary Ledger',
                      icon: <Sparkles className="h-3.5 w-3.5" />,
                    },
                  ]}
                />
                <div className="flex items-center gap-2">
                  <Badge>{source.kind}</Badge>
                  <button
                    className="btn-ghost text-xs text-red-400"
                    title="Delete source"
                    onClick={async () => {
                      await apiSend(`/api/reading/${source.id}`, 'DELETE')
                      setActiveId(null)
                      invalidate()
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {studyMode === 'incremental' ? (
                <div className="panel">
                  <h2 className="font-semibold">{source.title}</h2>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(source.position)}
                      onChange={(e) => patchSource.mutate({ position: Number(e.target.value) })}
                      className="flex-1 accent-indigo-500"
                    />
                    <span className="w-12 text-right text-xs text-neutral-500">
                      {Math.round(source.position)}%
                    </span>
                  </div>
                  {exposureQuery.data?.coverageAnalysis && (
                    <div className="mt-2.5 flex items-center gap-2 text-xs">
                      <span className="text-neutral-400">Lexical Coverage:</span>
                      <span
                        className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                          exposureQuery.data.coverageAnalysis.zone === 'optimal'
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                            : exposureQuery.data.coverageAnalysis.zone === 'frustration'
                              ? 'bg-rose-950/80 text-rose-300 border border-rose-700/50'
                              : 'bg-indigo-950/80 text-indigo-300 border border-indigo-700/50'
                        }`}
                      >
                        {exposureQuery.data.coverageAnalysis.coveragePercent}% (
                        {exposureQuery.data.coverageAnalysis.zone === 'optimal'
                          ? 'Optimal Krashen i+1 (95–98%)'
                          : exposureQuery.data.coverageAnalysis.zone === 'frustration'
                            ? 'Frustration (<95% - gloss recommended)'
                            : 'Effortless (>98%)'}
                        )
                      </span>
                    </div>
                  )}
                  {incidentalGloss.length > 0 && (
                    <div className="mt-3 rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-2.5 text-xs">
                      <div className="flex items-center justify-between font-medium text-indigo-300">
                        <span>Incidental Vocabulary (Krashen i+1)</span>
                        <span className="text-[10px] opacity-75">
                          {incidentalGloss.length} in text
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {incidentalGloss.map((item) => (
                          <span
                            key={item.word}
                            className="inline-flex items-center gap-1 rounded bg-black/30 px-2 py-0.5 text-[11px]"
                            title={`Definition: ${item.definition}`}
                          >
                            <span className="font-semibold text-neutral-200">{item.word}</span>
                            <span className="max-w-[120px] truncate text-[10px] text-neutral-400">
                              — {item.definition}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div
                    className="mt-3 max-h-[48vh] overflow-y-auto text-sm leading-relaxed selection:bg-indigo-500/30"
                    onMouseUp={() => setSelected(window.getSelection()?.toString() ?? '')}
                  >
                    <Markdown>{fragment.text}</Markdown>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3 dark:border-(--hub-border)">
                    <button
                      className="btn"
                      onClick={() => patchSource.mutate({ position: fragment.nextPosition })}
                    >
                      {fragment.done ? 'Finish source' : 'Next fragment →'}
                    </button>
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => extractHighlights.mutate(source.id)}
                      disabled={extractHighlights.isPending}
                    >
                      <Highlighter className="h-3.5 w-3.5" /> Extract highlight
                      {selected ? ' (from selection)' : 's (auto)'}
                    </button>
                    {(['define', 'simplify', 'flashcard'] as const).map((mode) => (
                      <button
                        key={mode}
                        className="btn-ghost text-xs"
                        onClick={() =>
                          manual
                            ? setGhostResult(manualGhostHint(mode, selected))
                            : ghost.mutate(mode)
                        }
                        title={
                          manual
                            ? 'Manual mode — no AI configured; shows offline active-learning prompt'
                            : undefined
                        }
                      >
                        <Sparkles className="h-3.5 w-3.5" />{' '}
                        {mode === 'flashcard' ? 'Make flashcard' : mode}
                      </button>
                    ))}
                  </div>
                  {ghostResult && (
                    <div className="mt-2 rounded-lg bg-neutral-100 p-2 text-xs whitespace-pre-wrap dark:bg-(--hub-panel-2)">
                      {ghostResult}
                    </div>
                  )}
                </div>
              ) : studyMode === 'sq3r' ? (
                /* ─── Guided SQ3R Mode (Robinson 1946) ─── */
                <div className="panel space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{source.title}</h2>
                      <p className="text-xs text-neutral-500">
                        Robinson’s SQ3R method turns passive reading into retrieval-ready encoding.
                      </p>
                    </div>
                    <span className="text-xs text-indigo-400">
                      {completedSteps.length}/5 SQ3R steps completed
                    </span>
                  </div>

                  <Tabs<Sq3rStep>
                    label="SQ3R stages"
                    value={sq3rStep}
                    onChange={setSq3rStep}
                    items={(
                      [
                        ['survey', '1. Survey'],
                        ['question', '2. Question'],
                        ['read', '3. Read'],
                        ['recite', '4. Recite'],
                        ['review', '5. Review'],
                      ] as const
                    ).map(([k, lbl]) => ({
                      key: k,
                      label: (
                        <span className="inline-flex items-center gap-1">
                          {completedSteps.includes(k) && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          )}
                          {lbl}
                        </span>
                      ),
                    }))}
                  />

                  {sq3rStep === 'survey' && (
                    <div className="space-y-3">
                      <p className="text-xs text-neutral-400">
                        Scan the structural outline first so your brain builds hooks before diving
                        into prose. Click any heading to turn it into a guiding question.
                      </p>
                      <div className="space-y-1.5">
                        {surveyHeadings.map((h, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs dark:border-(--hub-border)"
                          >
                            <span className="font-medium text-neutral-200">{h}</span>
                            <button
                              className="btn-ghost px-2 py-1 text-[11px]"
                              onClick={() =>
                                addGuidingQuestion(
                                  `How or why does "${h}" work, and what is its key takeaway?`,
                                )
                              }
                            >
                              + Question
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end">
                        <button
                          className="btn"
                          onClick={() => {
                            markStepDone('survey')
                            setSq3rStep('question')
                          }}
                        >
                          Survey done → Formulate Questions
                        </button>
                      </div>
                    </div>
                  )}

                  {sq3rStep === 'question' && (
                    <div className="space-y-3">
                      <p className="text-xs text-neutral-400">
                        Write 2–5 explicit questions you intend to answer while reading. Searching
                        for answers turns passive eye movement into active foraging.
                      </p>
                      <div className="flex gap-2">
                        <input
                          className="input flex-1"
                          placeholder="e.g. Why does spacing outperform massed practice after 7 days?"
                          value={newQuestion}
                          onChange={(e) => setNewQuestion(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addGuidingQuestion(newQuestion)}
                        />
                        <button className="btn" onClick={() => addGuidingQuestion(newQuestion)}>
                          Add
                        </button>
                      </div>
                      <div className="space-y-2">
                        {questions.map((q) => (
                          <div
                            key={q.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs dark:border-(--hub-border)"
                          >
                            <span className="text-neutral-200">{q.question}</span>
                            <button
                              className="text-neutral-500 hover:text-rose-400"
                              onClick={() => {
                                const next = questions.filter((x) => x.id !== q.id)
                                setQuestions(next)
                                saveSq3r.mutate({ questions: next })
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        {questions.length === 0 && (
                          <p className="text-xs text-neutral-500">
                            No guiding questions yet — add one above or click “+ Question” on a
                            Survey heading.
                          </p>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <button
                          className="btn"
                          onClick={() => {
                            markStepDone('question')
                            setSq3rStep('read')
                          }}
                        >
                          Start Active Reading →
                        </button>
                      </div>
                    </div>
                  )}

                  {sq3rStep === 'read' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(source.position)}
                          onChange={(e) => patchSource.mutate({ position: Number(e.target.value) })}
                          className="flex-1 accent-indigo-500"
                        />
                        <span className="w-12 text-right text-xs text-neutral-500">
                          {Math.round(source.position)}%
                        </span>
                      </div>
                      <div className="max-h-[42vh] overflow-y-auto rounded-xl border border-neutral-200 p-3 text-sm leading-relaxed dark:border-(--hub-border)">
                        <Markdown>{fragment.text}</Markdown>
                      </div>
                      {questions.length > 0 && (
                        <div className="space-y-2 rounded-xl bg-neutral-100 p-3 dark:bg-(--hub-panel)">
                          <div className="text-xs font-semibold text-neutral-400">
                            Answer your guiding questions as you read:
                          </div>
                          {questions.map((q) => (
                            <div key={q.id} className="space-y-1">
                              <div className="text-xs font-medium text-neutral-200">
                                {q.question}
                              </div>
                              <textarea
                                rows={2}
                                className="input w-full text-xs"
                                placeholder="Capture the concise answer in your own words…"
                                value={q.answer}
                                onChange={(e) => updateQuestionAnswer(q.id, e.target.value)}
                                onBlur={() => saveSq3r.mutate({ questions })}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap justify-between gap-2">
                        <button
                          className="btn-ghost"
                          onClick={() => patchSource.mutate({ position: fragment.nextPosition })}
                        >
                          {fragment.done ? 'At end of source' : 'Next fragment →'}
                        </button>
                        <button
                          className="btn"
                          onClick={() => {
                            setPeekDuringRecite(false)
                            markStepDone('read')
                            setSq3rStep('recite')
                          }}
                        >
                          Hide text & Recite from memory →
                        </button>
                      </div>
                    </div>
                  )}

                  {sq3rStep === 'recite' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-neutral-400">
                          <strong>Closed-book Recitation:</strong> Without looking at the text,
                          write everything you remember from this section.
                        </p>
                        <button
                          className="btn-ghost text-xs"
                          onClick={() => setPeekDuringRecite((p) => !p)}
                        >
                          {peekDuringRecite ? (
                            <>
                              <EyeOff className="h-3.5 w-3.5" /> Hide text
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5" /> Peek text to check gaps
                            </>
                          )}
                        </button>
                      </div>
                      {peekDuringRecite && (
                        <div className="max-h-48 overflow-y-auto rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                          <Markdown>{fragment.text}</Markdown>
                        </div>
                      )}
                      <textarea
                        rows={6}
                        className="input w-full text-sm"
                        placeholder="Summarize the core mechanisms, examples, and connections from memory…"
                        value={reciteNotes}
                        onChange={(e) => setReciteNotes(e.target.value)}
                        onBlur={() => saveSq3r.mutate({ reciteNotes })}
                      />
                      <div className="flex justify-end">
                        <button
                          className="btn"
                          onClick={() => {
                            markStepDone('recite')
                            setSq3rStep('review')
                          }}
                        >
                          Proceed to Review & Flashcard Minting →
                        </button>
                      </div>
                    </div>
                  )}

                  {sq3rStep === 'review' && (
                    <div className="space-y-3">
                      <p className="text-xs text-neutral-400">
                        Lock in long-term retention: convert your answered SQ3R questions directly
                        into FSRS-6 flashcards in one click.
                      </p>
                      <div className="space-y-2">
                        {questions.map((q) => (
                          <div
                            key={q.id}
                            className="rounded-xl border border-neutral-200 p-3 text-xs space-y-1.5 dark:border-(--hub-border)"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-neutral-200">{q.question}</span>
                              {q.cardId ? (
                                <Badge tone="success">Card #{q.cardId}</Badge>
                              ) : q.answer.trim() ? (
                                <Badge>Ready to mint</Badge>
                              ) : (
                                <Badge>Needs answer</Badge>
                              )}
                            </div>
                            <textarea
                              rows={2}
                              className="input w-full text-xs"
                              placeholder="Write or refine the answer before minting card…"
                              value={q.answer}
                              onChange={(e) => updateQuestionAnswer(q.id, e.target.value)}
                              onBlur={() => saveSq3r.mutate({ questions })}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        {reciteNotes.trim() && (
                          <button
                            className="btn-ghost text-xs"
                            onClick={() => setMineText(reciteNotes)}
                          >
                            Mine cards from Recite summary
                          </button>
                        )}
                        <button
                          className="btn ml-auto"
                          disabled={
                            convertSq3rCards.isPending ||
                            questions.filter((q) => !q.cardId && q.answer.trim()).length === 0
                          }
                          onClick={async () => {
                            await saveSq3r.mutateAsync({ questions, reciteNotes })
                            convertSq3rCards.mutate()
                          }}
                        >
                          <Sparkles className="h-4 w-4" />{' '}
                          {convertSq3rCards.isPending
                            ? 'Creating cards…'
                            : 'Convert Q&As to FSRS Flashcards'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ─── Ambient Exposure Ledger & Lexical Coverage ─── */
                <div className="panel space-y-4">
                  <div>
                    <h2 className="font-semibold text-neutral-100 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-400" />
                      Ambient Vocabulary &amp; Incidental Exposure Ledger
                    </h2>
                    <p className="mt-1 text-xs text-neutral-400">
                      Grounded in Krashen&apos;s comprehensible input (1985) and incidental
                      vocabulary research (Nation 2001, Webb 2007). Words encountered naturally
                      across 5+ spaced sessions over &ge;3 distinct days acquire deep conceptual
                      anchoring.
                    </p>
                  </div>

                  {exposureQuery.data?.coverageAnalysis && (
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-neutral-200">
                          Current Reading Text Lexical Coverage
                        </span>
                        <span className="font-bold text-neutral-100">
                          {exposureQuery.data.coverageAnalysis.coveragePercent}%
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
                        <div
                          style={{
                            width: `${Math.min(100, exposureQuery.data.coverageAnalysis.coveragePercent)}%`,
                          }}
                          className={`h-full ${
                            exposureQuery.data.coverageAnalysis.zone === 'optimal'
                              ? 'bg-emerald-500'
                              : exposureQuery.data.coverageAnalysis.zone === 'frustration'
                                ? 'bg-rose-500'
                                : 'bg-indigo-500'
                          }`}
                        />
                      </div>
                      <p className="text-[11px] text-neutral-400">
                        {exposureQuery.data.coverageAnalysis.zone === 'optimal'
                          ? 'Optimal Krashen i+1 band (95–98% known): reading flows smoothly while unfamiliar words are inferred from context.'
                          : exposureQuery.data.coverageAnalysis.zone === 'frustration'
                            ? 'Frustration band (<95% known): density of novel terms may hinder comprehension. Consider checking gloss definitions.'
                            : 'Fluency band (>98% known): effortless extensive reading for consolidation.'}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-neutral-300">
                      <span>Words You Keep Meeting ({exposureQuery.data?.words?.length ?? 0})</span>
                      <span className="text-[11px] text-neutral-500">
                        Threshold: &ge;5 encounters across &ge;3 days
                      </span>
                    </div>

                    {(exposureQuery.data?.words ?? []).length === 0 ? (
                      <p className="py-6 text-center text-xs text-neutral-500">
                        No vocabulary encounters recorded yet. Start reading to build your ambient
                        exposure ledger!
                      </p>
                    ) : (
                      <div className="divide-y divide-neutral-800/60 rounded-xl border border-neutral-800 bg-neutral-950/40">
                        {(exposureQuery.data?.words ?? []).map((word) => (
                          <div
                            key={word.normalized}
                            className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs hover:bg-neutral-900/40 transition-colors"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-neutral-200 text-sm">
                                  {word.normalized}
                                </span>
                                {word.eligibleForPromotion ? (
                                  <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-medium">
                                    Ready for SRS ({word.encounterCount}x / {word.distinctDays}d)
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-neutral-500">
                                    {word.encounterCount} encounters &bull; {word.distinctDays} days
                                  </span>
                                )}
                              </div>
                            </div>

                            {word.isAlreadyCard ? (
                              <span className="text-[11px] text-emerald-400">Already a card</span>
                            ) : (
                              <button
                                type="button"
                                disabled={promoteWord.isPending}
                                onClick={() =>
                                  promoteWord.mutate({
                                    token: word.normalized,
                                    snippet: `Encountered ${word.encounterCount} times across reading.`,
                                  })
                                }
                                className="btn-ghost text-xs flex items-center gap-1 border border-neutral-700/60 hover:border-indigo-500/60"
                              >
                                <Plus className="h-3.5 w-3.5 text-indigo-400" />
                                Turn into Card
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {triageQueue.length > 0 && (
                <div className="panel space-y-3">
                  <div className="label">Triage queue ({triageQueue.length}) — keep or discard</div>
                  {triageQueue.slice(0, 3).map((h) => (
                    <div
                      key={h.id}
                      className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-(--hub-border)"
                    >
                      <p className="text-neutral-300">{h.text}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          className="btn text-xs"
                          onClick={() => {
                            if (h.id > 0) triage.mutate({ id: h.id, action: 'keep' })
                            setTriageQueue((q) => q.filter((x) => x.id !== h.id))
                          }}
                        >
                          Keep
                        </button>
                        <button className="btn-ghost text-xs" onClick={() => setMineText(h.text)}>
                          → cards
                        </button>
                        <button
                          className="btn-ghost text-xs text-red-400"
                          onClick={() => {
                            if (h.id > 0) triage.mutate({ id: h.id, action: 'discard' })
                            setTriageQueue((q) => q.filter((x) => x.id !== h.id))
                          }}
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="panel">
                <div className="label mb-2">Highlights of this source</div>
                {(detail?.highlights ?? []).map((h) => (
                  <div key={h.id} className="mb-2 flex items-center gap-2 text-sm">
                    <span
                      className={`h-2 w-2 rounded-full ${h.triaged === 1 ? 'bg-emerald-500' : h.triaged === 2 ? 'bg-red-500' : 'bg-neutral-400'}`}
                    />
                    <span className="flex-1 truncate text-neutral-300">{h.text}</span>
                    <button
                      className="btn-ghost px-2 py-1 text-xs"
                      onClick={() => setMineText(h.text)}
                    >
                      → cards
                    </button>
                    <span className="text-[10px] text-neutral-500">
                      strength {Math.round(h.strength * 100)}
                    </span>
                  </div>
                ))}
                {(detail?.highlights ?? []).length === 0 && (
                  <p className="text-xs text-neutral-500">None yet.</p>
                )}
              </div>
            </>
          ) : (
            <div className="panel text-sm text-neutral-500">
              Pick a source on the left, or click <strong>Add source</strong> to import a PDF, EPUB,
              Web article, YouTube transcript, or Markdown note.
            </div>
          )}
        </section>
      </div>

      {/* Multi-Format Ingestion Sheet */}
      <Sheet
        open={ingestOpen}
        onClose={() => setIngestOpen(false)}
        title="Add Reading Source"
        footer={
          ingestTab !== 'file' ? (
            <>
              <button className="btn-ghost" onClick={() => setIngestOpen(false)}>
                Cancel
              </button>
              <button
                className="btn"
                disabled={
                  ingestRemoteOrMarkdown.isPending ||
                  (ingestTab === 'markdown' ? !markdownInput.trim() : !urlInput.trim())
                }
                onClick={() => ingestRemoteOrMarkdown.mutate()}
              >
                {ingestRemoteOrMarkdown.isPending ? 'Importing…' : 'Import source'}
              </button>
            </>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <Tabs<IngestTab>
            label="Import format"
            value={ingestTab}
            onChange={setIngestTab}
            items={[
              {
                key: 'file',
                label: 'File (PDF / EPUB / MD)',
                icon: <Upload className="h-3.5 w-3.5" />,
              },
              { key: 'url', label: 'Web URL', icon: <Globe className="h-3.5 w-3.5" /> },
              { key: 'youtube', label: 'YouTube', icon: <Video className="h-3.5 w-3.5" /> },
              {
                key: 'markdown',
                label: 'Paste / Markdown',
                icon: <FileText className="h-3.5 w-3.5" />,
              },
            ]}
          />

          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <label className="space-y-1 text-xs">
              <span className="text-neutral-400">Custom title (optional)</span>
              <input
                className="input w-full"
                placeholder="Auto-detected when left blank"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-neutral-400">Priority (0–100)</span>
              <input
                type="number"
                min={0}
                max={100}
                className="input w-full"
                value={priorityInput}
                onChange={(e) => setPriorityInput(Number(e.target.value))}
              />
            </label>
          </div>

          {ingestTab === 'file' && (
            <div className="rounded-xl border-2 border-dashed border-neutral-300 p-6 text-center space-y-2 dark:border-(--hub-border)">
              <Upload className="mx-auto h-6 w-6 text-neutral-400" />
              <div className="text-sm font-medium">
                Choose a <code>.pdf</code>, <code>.epub</code>, <code>.md</code>, or{' '}
                <code>.txt</code> file
              </div>
              <p className="text-xs text-neutral-500">
                Extracted locally inside Learning HUB — works offline on desktop & mobile.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.epub,.md,.markdown,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) uploadFile.mutate(f)
                  e.target.value = ''
                }}
              />
              <button
                className="btn"
                disabled={uploadFile.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {uploadFile.isPending ? 'Extracting…' : 'Select file'}
              </button>
            </div>
          )}

          {ingestTab === 'url' && (
            <label className="block space-y-1 text-xs">
              <span className="text-neutral-400">Article URL</span>
              <input
                type="url"
                className="input w-full"
                placeholder="https://example.com/essay"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
              <span className="block text-[11px] text-neutral-500">
                Strips navigation, ads, and scripts into clean Markdown headings & paragraphs.
              </span>
            </label>
          )}

          {ingestTab === 'youtube' && (
            <label className="block space-y-1 text-xs">
              <span className="text-neutral-400">YouTube video URL</span>
              <input
                className="input w-full"
                placeholder="https://www.youtube.com/watch?v=..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
              <span className="block text-[11px] text-neutral-500">
                Imports caption tracks grouped into timestamped 1-minute sections ready for SQ3R.
              </span>
            </label>
          )}

          {ingestTab === 'markdown' && (
            <label className="block space-y-1 text-xs">
              <span className="text-neutral-400">Markdown or plain text</span>
              <textarea
                rows={8}
                className="input w-full font-mono text-xs"
                placeholder="# Chapter Title&#10;&#10;Paste notes, book excerpts, or lecture transcripts here…"
                value={markdownInput}
                onChange={(e) => setMarkdownInput(e.target.value)}
              />
            </label>
          )}
        </div>
      </Sheet>

      <CardMinerSheet
        open={mineText !== null}
        initialText={mineText ?? ''}
        onClose={() => setMineText(null)}
      />
    </div>
  )
}
