'use client'

/**
 * Decks & Cards: deck management, card browser with filters, a
 * full per-format card editor (incl. image-occlusion rect drawing with
 * normalized coords), Wozniak linter results panel on save, AI card
 * generation (degrades gracefully) and bulk paste import.
 *
 * CLIENT component — core imports via SUBPATHS only (never the barrel: it
 * drags ai.ts/better-sqlite3 into the client bundle).
 */
import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FilePlus2, Layers, Pencil, Plus, Sparkles, Trash2, Upload, Wand2, X } from 'lucide-react'
import type { CardContent, CardFormat } from '@learning-hub/core/types'
import type { LintResult } from '@learning-hub/core/linter'
import { parseCloze, validateCardContent } from '@learning-hub/core/cards'
import { leitnerBox, leitnerHistogram } from '@learning-hub/core/fsrs'
import { TransportPanel, useAiStatus } from '@/components/TransportPanel'
import { apiGet, apiSend, apiUpload } from '@/lib/transport'

interface DeckInfo {
  id: number
  name: string
  description: string | null
  emoji: string | null
  desiredRetention: number | null
  fsrsWeights: number[] | null
  hasCustomWeights: boolean
  total: number
  due: number
  newCards: number
}
interface CardRow {
  id: number
  deckId: number
  type: CardFormat
  content: CardContent
  tags: string[]
  source: string | null
  state: number
  reps: number
  lapses: number
  stability: number
  due: string
  suspended: boolean
}
interface OcclusionRect {
  id: string
  x: number
  y: number
  w: number
  h: number
  label?: string
}

const FORMATS: CardFormat[] = [
  'basic',
  'cloze',
  'mcq',
  'typein',
  'occlusion',
  'proof_step',
  'grammar',
]

const BOX_LABEL = ['new/learning', 'young', 'young', 'mature', 'mature'] as const
const BOX_TONE = [
  'bg-neutral-300 text-neutral-700 dark:bg-[#26262b] dark:text-neutral-400',
  'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  'bg-amber-500/30 text-amber-700 dark:text-amber-300',
  'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  'bg-emerald-500/40 text-emerald-800 dark:text-emerald-200',
] as const

/** Leitner box chip: the box number, tinted by maturity. */
function BoxChip({ box }: { box: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <span
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${BOX_TONE[box - 1]}`}
      title={`Leitner box ${box} (${BOX_LABEL[box - 1]})`}
    >
      {box}
    </span>
  )
}

export default function DecksPage() {
  const qc = useQueryClient()
  const [activeDeck, setActiveDeck] = useState<number | null>(null)
  const [newDeckName, setNewDeckName] = useState('')
  const [filterTags, setFilterTags] = useState('')
  const [filterState, setFilterState] = useState('')
  const [editing, setEditing] = useState<CardRow | 'new' | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  const decks = useQuery<{ decks: DeckInfo[] }>({
    queryKey: ['decks'],
    queryFn: () => apiGet<{ decks: DeckInfo[] }>('/api/decks'),
  })
  const cards = useQuery<{ cards: CardRow[] }>({
    queryKey: ['cards', activeDeck, filterTags, filterState],
    queryFn: () => {
      const params = new URLSearchParams()
      if (activeDeck) params.set('deckId', String(activeDeck))
      if (filterTags) params.set('tags', filterTags)
      if (filterState !== '') params.set('state', filterState)
      return apiGet<{ cards: CardRow[] }>(`/api/cards?${params}`)
    },
  })

  const createDeck = useMutation({
    mutationFn: () => apiSend('/api/decks', 'POST', { name: newDeckName }),
    onSuccess: () => {
      setNewDeckName('')
      void qc.invalidateQueries({ queryKey: ['decks'] })
    },
  })
  const patchDeck = useMutation({
    mutationFn: (payload: { id: number; desiredRetention?: number | null }) =>
      apiSend(`/api/decks/${payload.id}`, 'PATCH', {
        desiredRetention: payload.desiredRetention,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['decks'] })
    },
  })
  const optimizeDeck = useMutation({
    mutationFn: (payload: { deckId: number; mode: 'optimize' | 'reset' }) =>
      apiSend<{
        ok: boolean
        mode: string
        optimization?: { status: string; sampleCount: number; minRequired: number }
      }>('/api/fsrs/optimize', 'POST', payload),
    onSuccess: (res) => {
      if (res.mode === 'optimize' && res.optimization?.status === 'insufficient_data') {
        setDeckFsrsNote(
          `Need ≥${res.optimization.minRequired} deck reviews to optimize (${res.optimization.sampleCount} so far).`,
        )
      } else if (res.mode === 'reset') {
        setDeckFsrsNote('Reset deck to global FSRS-6 weights.')
      } else {
        setDeckFsrsNote('Deck FSRS-6 weights updated.')
      }
      void qc.invalidateQueries({ queryKey: ['decks'] })
    },
  })
  const [deckFsrsNote, setDeckFsrsNote] = useState<string | null>(null)
  const selectedDeckObj = useMemo(
    () => decks.data?.decks.find((d) => d.id === activeDeck) ?? null,
    [decks.data, activeDeck],
  )
  const deleteDeck = useMutation({
    mutationFn: (id: number) => apiSend(`/api/decks/${id}`, 'DELETE'),
    onSuccess: () => {
      setActiveDeck(null)
      void qc.invalidateQueries({ queryKey: ['decks'] })
    },
  })
  const deleteCard = useMutation({
    mutationFn: (id: number) => apiSend(`/api/cards/${id}`, 'DELETE'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cards'] }),
  })

  const deckName = (id: number) => decks.data?.decks.find((d) => d.id === id)?.name ?? `deck ${id}`
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['cards'] })
    void qc.invalidateQueries({ queryKey: ['decks'] })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Decks & Cards</h1>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setEditing('new')} disabled={!activeDeck}>
            <Plus className="h-4 w-4" /> New card
          </button>
          <button className="btn-ghost" onClick={() => setBulkOpen(true)} disabled={!activeDeck}>
            <FilePlus2 className="h-4 w-4" /> Bulk paste
          </button>
          <button className="btn-ghost" onClick={() => setAiOpen(true)} disabled={!activeDeck}>
            <Wand2 className="h-4 w-4" /> AI generate
          </button>
        </div>
      </div>

      {/* deck rail */}
      <div className="panel space-y-3">
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="new deck name…"
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
          />
          <button
            className="btn"
            disabled={!newDeckName.trim() || createDeck.isPending}
            onClick={() => createDeck.mutate()}
          >
            Create
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setActiveDeck(null)
              setDeckFsrsNote(null)
            }}
            className={`rounded-lg border px-3 py-2 text-sm ${
              activeDeck === null
                ? 'border-indigo-500 bg-indigo-600/10 text-indigo-300'
                : 'border-neutral-200 text-neutral-600 dark:border-[#26262b] dark:text-neutral-300'
            }`}
          >
            📚 All decks
          </button>
          {(decks.data?.decks ?? []).map((d) => (
            <span
              key={d.id}
              className={`group flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                activeDeck === d.id
                  ? 'border-indigo-500 bg-indigo-600/10 text-indigo-300'
                  : 'border-neutral-200 text-neutral-600 dark:border-[#26262b] dark:text-neutral-300'
              }`}
            >
              <button
                onClick={() => {
                  setActiveDeck(d.id)
                  setDeckFsrsNote(null)
                }}
              >
                {d.emoji} {d.name}
                <span className="ml-2 text-xs text-neutral-500">
                  {d.due}/{d.total} due
                </span>
                {d.desiredRetention !== null && (
                  <span className="ml-1.5 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-400">
                    {Math.round(d.desiredRetention * 100)}%
                  </span>
                )}
                {d.hasCustomWeights && (
                  <span className="ml-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
                    21w
                  </span>
                )}
              </button>
              <button
                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
                onClick={() => deleteDeck.mutate(d.id)}
                title="delete deck"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>

        {selectedDeckObj && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 p-2.5 text-xs dark:border-[#26262b]">
            <span className="font-medium text-neutral-700 dark:text-neutral-300">
              Deck FSRS-6 preset:
            </span>
            <label className="flex items-center gap-1.5 text-neutral-500">
              Retention
              <select
                className="input h-8 py-1 text-xs"
                value={
                  selectedDeckObj.desiredRetention === null
                    ? 'inherit'
                    : String(Math.round(selectedDeckObj.desiredRetention * 100))
                }
                onChange={(e) => {
                  const val = e.target.value
                  patchDeck.mutate({
                    id: selectedDeckObj.id,
                    desiredRetention: val === 'inherit' ? null : Number(val) / 100,
                  })
                }}
              >
                <option value="inherit">Global default</option>
                {[80, 85, 88, 90, 92, 95].map((pct) => (
                  <option key={pct} value={String(pct)}>
                    {pct}%
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn-ghost py-1 text-xs"
              disabled={optimizeDeck.isPending}
              onClick={() => optimizeDeck.mutate({ deckId: selectedDeckObj.id, mode: 'optimize' })}
            >
              <Sparkles className="h-3.5 w-3.5" /> Optimize deck weights
            </button>
            {selectedDeckObj.hasCustomWeights && (
              <button
                className="btn-ghost py-1 text-xs"
                disabled={optimizeDeck.isPending}
                onClick={() => optimizeDeck.mutate({ deckId: selectedDeckObj.id, mode: 'reset' })}
              >
                Reset weights
              </button>
            )}
            {deckFsrsNote && <span className="text-neutral-500">{deckFsrsNote}</span>}
          </div>
        )}
      </div>

      {/* browser */}
      <div className="panel space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Layers className="h-4 w-4 text-neutral-500" />
          <span className="text-sm font-medium">
            {activeDeck ? deckName(activeDeck) : 'All decks'}
          </span>
          <input
            className="input max-w-[200px]"
            placeholder="tag filter (comma-sep)"
            value={filterTags}
            onChange={(e) => setFilterTags(e.target.value)}
          />
          <select
            className="input max-w-[140px]"
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
          >
            <option value="">any state</option>
            <option value="0">new</option>
            <option value="1">learning</option>
            <option value="2">review</option>
            <option value="3">relearning</option>
          </select>
          <span className="ml-auto text-xs text-neutral-500">
            {cards.data?.cards.length ?? 0} cards
          </span>
        </div>
        {(cards.data?.cards.length ?? 0) > 0 && (
          <div
            className="flex flex-wrap gap-2"
            title="Leitner boxes: 1 new/learning · 2–3 young · 4–5 mature (Leitner 1972, as a view over FSRS state)"
          >
            {leitnerHistogram(cards.data?.cards ?? []).map((count, i) => (
              <span
                key={i}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${
                  count === 0
                    ? 'border-neutral-200 text-neutral-400 dark:border-[#26262b]'
                    : 'border-neutral-300 text-neutral-600 dark:border-[#3a3a42] dark:text-neutral-300'
                }`}
              >
                box {i + 1}
                <span className="font-semibold">{count}</span>
              </span>
            ))}
          </div>
        )}
        <div className="divide-y divide-neutral-100 dark:divide-[#1e1e23]">
          {(cards.data?.cards ?? []).map((card) => (
            <div key={card.id} className="flex items-center gap-3 py-2 text-sm">
              <BoxChip box={leitnerBox(card)} />
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500 dark:bg-[#1a1a1f]">
                {card.type}
              </span>
              <span className="min-w-0 flex-1 truncate">{cardPreview(card.content)}</span>
              <span className="text-xs text-neutral-500">
                {card.tags.length ? card.tags.map((t) => `#${t}`).join(' ') : ''}
              </span>
              <span className={`text-xs ${card.suspended ? 'text-amber-400' : 'text-neutral-500'}`}>
                {card.suspended ? 'suspended' : card.due.slice(0, 10)}
              </span>
              <button className="btn-ghost px-2 py-1" onClick={() => setEditing(card)}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                className="btn-ghost px-2 py-1 hover:text-red-400"
                onClick={() => deleteCard.mutate(card.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {cards.data && cards.data.cards.length === 0 && (
            <div className="py-6 text-center text-sm text-neutral-500">
              no cards match — create one or loosen the filters
            </div>
          )}
        </div>
      </div>

      {editing && activeDeck && (
        <CardEditorModal
          deckId={activeDeck}
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={invalidate}
        />
      )}
      {bulkOpen && activeDeck && (
        <BulkImportModal
          deckId={activeDeck}
          onClose={() => setBulkOpen(false)}
          onImported={invalidate}
        />
      )}
      {aiOpen && activeDeck && (
        <AiGenerateModal
          deckId={activeDeck}
          onClose={() => setAiOpen(false)}
          onGenerated={invalidate}
        />
      )}
    </div>
  )
}

function cardPreview(content: CardContent): string {
  if (content.basic) return `${content.basic.front} → ${content.basic.back}`
  if (content.cloze) return content.cloze.text
  if (content.mcq) return content.mcq.question
  if (content.typein) return content.typein.question
  if (content.occlusion)
    return `occlusion · image ${content.occlusion.imageId} · ${content.occlusion.rects.length} rects`
  if (content.proof_step)
    return `${content.proof_step.theorem} — step ${content.proof_step.stepIndex + 1}`
  if (content.grammar) return `${content.grammar.sentence} [${content.grammar.pattern}]`
  if (content.matching) return `matching set · ${content.matching.pairs.length} pairs`
  return '(empty)'
}

// ─── Editor modal ───────────────────────────────────────────────────────────

function CardEditorModal({
  deckId,
  existing,
  onClose,
  onSaved,
}: {
  deckId: number
  existing: CardRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [type, setType] = useState<CardFormat>(existing?.type ?? 'basic')
  const [draft, setDraft] = useState<CardContent>(existing?.content ?? {})
  const [tags, setTags] = useState((existing?.tags ?? []).join(', '))
  const [source, setSource] = useState(existing?.source ?? '')
  const [lint, setLint] = useState<LintResult[] | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        deckId,
        type,
        content: draft,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        source: source || null,
      }
      return existing
        ? apiSend<{ ok?: boolean; error?: string; issues?: string[]; lint?: LintResult[] }>(
            `/api/cards/${existing.id}`,
            'PATCH',
            payload,
          )
        : apiSend<{ ok?: boolean; error?: string; issues?: string[]; lint?: LintResult[] }>(
            '/api/cards',
            'POST',
            payload,
          )
    },
    onSuccess: (data) => {
      if (data.ok) {
        setLint(data.lint ?? [])
        setErrors([])
        onSaved()
      } else {
        setErrors(data.issues ?? [data.error ?? 'save failed'])
      }
    },
  })

  const clientValidation = useMemo(() => validateCardContent(type, draft), [type, draft])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="panel max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {existing ? `Edit card #${existing.id}` : 'New card'}
          </h2>
          <button className="btn-ghost px-2" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {FORMATS.map((f) => (
            <button
              key={f}
              className={`rounded-lg border px-2.5 py-1 text-xs ${type === f ? 'border-indigo-500 bg-indigo-600/10 text-indigo-300' : 'border-neutral-200 text-neutral-500 dark:border-[#26262b]'}`}
              onClick={() => {
                setType(f)
                setDraft({})
              }}
            >
              {f}
            </button>
          ))}
        </div>

        <FormatEditor type={type} draft={draft} setDraft={setDraft} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="label mb-1">tags (comma-separated)</div>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div>
            <div className="label mb-1">source</div>
            <input
              className="input"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="lecture-3 / pdf:…"
            />
          </div>
        </div>

        {errors.length > 0 && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
            {errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
        {!clientValidation.ok && errors.length === 0 && (
          <div className="text-xs text-neutral-500">incomplete: {clientValidation.errors[0]}</div>
        )}

        {lint && <LintPanel lint={lint} />}

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
          <button
            className="btn"
            disabled={!clientValidation.ok || save.isPending}
            onClick={() => save.mutate()}
          >
            {existing ? 'Save changes' : 'Create card'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LintPanel({ lint }: { lint: LintResult[] }) {
  if (lint.length === 0) return null
  const sevColor: Record<LintResult['severity'], string> = {
    error: 'border-red-500/40 bg-red-500/10 text-red-300',
    warn: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    info: 'border-neutral-500/30 bg-neutral-500/5 text-neutral-400',
  }
  return (
    <div className="space-y-1.5">
      <div className="label">Wozniak linter</div>
      {lint.map((l, i) => (
        <div key={i} className={`rounded-lg border p-2 text-xs ${sevColor[l.severity]}`}>
          <span className="font-medium">{l.ruleId}</span> — {l.message}
          {l.suggestion && <div className="mt-0.5 opacity-70">{l.suggestion}</div>}
        </div>
      ))}
    </div>
  )
}

// ─── Per-format editors ─────────────────────────────────────────────────────

function FormatEditor({
  type,
  draft,
  setDraft,
}: {
  type: CardFormat
  draft: CardContent
  setDraft: (c: CardContent) => void
}) {
  const patch = (key: keyof CardContent, value: unknown) =>
    setDraft({ [key]: value } as CardContent)

  if (type === 'basic') {
    const v = draft.basic ?? { front: '', back: '' }
    return (
      <div className="space-y-2">
        <input
          className="input"
          placeholder="front (question)"
          value={v.front}
          onChange={(e) => patch('basic', { ...v, front: e.target.value })}
        />
        <input
          className="input"
          placeholder="back (answer)"
          value={v.back}
          onChange={(e) => patch('basic', { ...v, back: e.target.value })}
        />
        <BasicImageAttach
          imageId={v.imageId}
          onChange={(imageId) => patch('basic', { ...v, imageId })}
        />
        <div>
          <textarea
            className="input min-h-[56px] text-sm"
            placeholder={
              'Alternate phrasings — one per line (optional).\nEach review shows the next phrasing so recall can\u2019t key on the wording.'
            }
            value={(v.variants ?? []).join('\n')}
            onChange={(e) => {
              const variants = e.target.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
              patch('basic', { ...v, variants: variants.length ? variants : undefined })
            }}
          />
          <p className="mt-1 text-xs text-neutral-500">
            {(v.variants?.length ?? 0) > 0
              ? `${v.variants!.length} alternate phrasing(s) — rotations every review`
              : 'desirable difficulty: vary how the question is asked'}
          </p>
        </div>
      </div>
    )
  }

  if (type === 'cloze') {
    const v = draft.cloze
    const parsed = v ? parseCloze(v.text) : null
    return (
      <div className="space-y-2">
        <textarea
          className="input min-h-[80px]"
          placeholder={
            'Use {{c1::answer}} markers — e.g. The capital of {{c1::France}} is {{c2::Paris}}.'
          }
          value={v?.text ?? ''}
          onChange={(e) => {
            const p = parseCloze(e.target.value)
            patch('cloze', { text: p.text, answers: p.answers, mode: p.mode })
          }}
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-[#1a1a1f]">
            {'{{c1::answer}}'}
          </code>
          <span>mark each deletion; hint with {'{{c1::answer::hint}}'}</span>
          {parsed && <span>{parsed.answers.length} answer(s) detected</span>}
        </div>
        {v?.mode && (
          <div className="flex gap-2 text-xs">
            {(['basic', 'typein', 'enumeration'] as const).map((m) => (
              <button
                key={m}
                className={`rounded border px-2 py-1 ${v.mode === m ? 'border-indigo-500 text-indigo-300' : 'border-neutral-200 text-neutral-500 dark:border-[#26262b]'}`}
                onClick={() => patch('cloze', { ...v, mode: m })}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (type === 'mcq') {
    const v = draft.mcq ?? { question: '', options: ['', ''], correctIndex: 0 }
    return (
      <div className="space-y-2">
        <input
          className="input"
          placeholder="question"
          value={v.question}
          onChange={(e) => patch('mcq', { ...v, question: e.target.value })}
        />
        {v.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="mcq-correct"
              checked={v.correctIndex === i}
              onChange={() => patch('mcq', { ...v, correctIndex: i })}
              title="correct answer"
            />
            <input
              className="input"
              placeholder={`option ${String.fromCharCode(65 + i)}`}
              value={opt}
              onChange={(e) => {
                const options = [...v.options]
                options[i] = e.target.value
                patch('mcq', { ...v, options })
              }}
            />
            {v.options.length > 2 && (
              <button
                className="btn-ghost px-2"
                onClick={() =>
                  patch('mcq', {
                    ...v,
                    options: v.options.filter((_, j) => j !== i),
                    correctIndex: Math.min(v.correctIndex, v.options.length - 2),
                  })
                }
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        <button
          className="btn-ghost"
          onClick={() => patch('mcq', { ...v, options: [...v.options, ''] })}
        >
          <Plus className="h-3.5 w-3.5" /> option
        </button>
        <input
          className="input"
          placeholder="rationale (optional)"
          value={v.rationale ?? ''}
          onChange={(e) => patch('mcq', { ...v, rationale: e.target.value })}
        />
      </div>
    )
  }

  if (type === 'typein') {
    const v = draft.typein ?? { question: '', acceptedAnswers: [''] }
    return (
      <div className="space-y-2">
        <input
          className="input"
          placeholder="question"
          value={v.question}
          onChange={(e) => patch('typein', { ...v, question: e.target.value })}
        />
        <input
          className="input"
          placeholder="accepted answers, comma-separated"
          value={v.acceptedAnswers.join(', ')}
          onChange={(e) =>
            patch('typein', {
              ...v,
              acceptedAnswers: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
    )
  }

  if (type === 'occlusion') {
    return <OcclusionEditor draft={draft} setDraft={setDraft} />
  }

  if (type === 'proof_step') {
    const v = draft.proof_step ?? { theorem: '', proofSteps: [''], stepIndex: 0, justification: '' }
    return (
      <div className="space-y-2">
        <input
          className="input"
          placeholder="theorem name"
          value={v.theorem}
          onChange={(e) => patch('proof_step', { ...v, theorem: e.target.value })}
        />
        <textarea
          className="input min-h-[80px]"
          placeholder="proof steps, one per line"
          value={v.proofSteps.join('\n')}
          onChange={(e) => {
            const steps = e.target.value.split('\n')
            patch('proof_step', {
              ...v,
              proofSteps: steps,
              stepIndex: Math.min(v.stepIndex, Math.max(0, steps.length - 1)),
            })
          }}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <div className="label mb-1">asked step (0-based)</div>
            <input
              type="number"
              min={0}
              className="input"
              value={v.stepIndex}
              onChange={(e) => patch('proof_step', { ...v, stepIndex: Number(e.target.value) })}
            />
          </div>
          <div>
            <div className="label mb-1">justification (lemma name)</div>
            <input
              className="input"
              value={v.justification}
              onChange={(e) => patch('proof_step', { ...v, justification: e.target.value })}
            />
          </div>
        </div>
        <input
          className="input"
          placeholder="source lemma (optional)"
          value={v.sourceLemma ?? ''}
          onChange={(e) => patch('proof_step', { ...v, sourceLemma: e.target.value })}
        />
      </div>
    )
  }

  if (type === 'grammar') {
    const v = draft.grammar ?? { sentence: '', pattern: '', target: '' }
    return (
      <div className="space-y-2">
        <input
          className="input"
          placeholder="example sentence"
          value={v.sentence}
          onChange={(e) => patch('grammar', { ...v, sentence: e.target.value })}
        />
        <input
          className="input"
          placeholder="pattern name (e.g. aller + au)"
          value={v.pattern}
          onChange={(e) => patch('grammar', { ...v, pattern: e.target.value })}
        />
        <input
          className="input"
          placeholder="target word blanked in the sentence"
          value={v.target}
          onChange={(e) => patch('grammar', { ...v, target: e.target.value })}
        />
        <input
          className="input"
          placeholder="translation (optional)"
          value={v.translation ?? ''}
          onChange={(e) => patch('grammar', { ...v, translation: e.target.value })}
        />
      </div>
    )
  }

  return <div className="text-sm text-neutral-500">Pick a format.</div>
}

// ─── Occlusion editor (upload → drag normalized rects) ──────────────────────

function OcclusionEditor({
  draft,
  setDraft,
}: {
  draft: CardContent
  setDraft: (c: CardContent) => void
}) {
  const occ = draft.occlusion
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [drawing, setDrawing] = useState<OcclusionRect | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const rects = occ?.rects ?? []

  const upload = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    const form = new FormData()
    form.set('file', file)
    try {
      const data = await apiUpload<{ ok?: boolean; id?: number; error?: string }>(
        '/api/images',
        form,
      )
      if (data.ok && data.id) {
        setDraft({ occlusion: { imageId: data.id, rects: [] } })
      } else {
        setUploadError(data.error ?? 'upload failed')
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'upload failed')
    } finally {
      setUploading(false)
    }
  }

  const toNorm = (e: React.MouseEvent): { x: number; y: number } => {
    const box = containerRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Upload className="h-4 w-4" />{' '}
          {uploading ? 'uploading…' : occ ? 'replace image' : 'upload image'}
        </button>
        {occ && (
          <span className="text-xs text-neutral-500">
            image #{occ.imageId} — drag on the image to draw an occlusion rect
          </span>
        )}
        {uploadError && <span className="text-xs text-red-400">{uploadError}</span>}
      </div>

      {occ && (
        <>
          <div
            ref={containerRef}
            className="relative max-w-xl cursor-crosshair select-none overflow-hidden rounded-lg border border-neutral-200 dark:border-[#26262b]"
            onMouseDown={(e) => {
              const start = toNorm(e)
              setDrawing({ id: `r${Date.now()}`, x: start.x, y: start.y, w: 0, h: 0 })
            }}
            onMouseMove={(e) => {
              if (!drawing) return
              const p = toNorm(e)
              setDrawing((d) =>
                d ? { ...d, w: Math.max(0, p.x - d.x), h: Math.max(0, p.y - d.y) } : d,
              )
            }}
            onMouseUp={() => {
              if (drawing && drawing.w > 0.01 && drawing.h > 0.01) {
                setDraft({ occlusion: { imageId: occ.imageId, rects: [...rects, drawing] } })
                setSelected(drawing.id)
              }
              setDrawing(null)
            }}
          >
            <img
              src={`/api/images/${occ.imageId}`}
              alt="occlusion target"
              className="pointer-events-none block w-full"
              draggable={false}
            />
            {[...rects, ...(drawing ? [drawing] : [])].map((rect) => (
              <div
                key={rect.id}
                className={`absolute border ${selected === rect.id ? 'border-amber-400 bg-amber-500/20' : 'border-indigo-400 bg-indigo-500/20'}`}
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelected(rect.id)
                }}
              />
            ))}
          </div>

          {rects.map((rect, i) => (
            <div key={rect.id} className="flex items-center gap-2 text-xs">
              <span className="text-neutral-500">rect {i + 1}</span>
              <input
                className="input max-w-[200px]"
                placeholder="label (the hidden answer)"
                value={rect.label ?? ''}
                onChange={(e) => {
                  const next = rects.map((r) =>
                    r.id === rect.id ? { ...r, label: e.target.value } : r,
                  )
                  setDraft({ occlusion: { imageId: occ.imageId, rects: next } })
                }}
              />
              <span className="text-neutral-600">
                x{rect.x.toFixed(2)} y{rect.y.toFixed(2)} w{rect.w.toFixed(2)} h{rect.h.toFixed(2)}
              </span>
              <button
                className="btn-ghost px-1 hover:text-red-400"
                onClick={() =>
                  setDraft({
                    occlusion: {
                      imageId: occ.imageId,
                      rects: rects.filter((r) => r.id !== rect.id),
                    },
                  })
                }
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ─── Dual-coding image attach (basic cards) ─────────────────────────────────

/**
 * Attach a picture to a basic card's front (dual coding, Paivio): upload via
 * the shared /api/images endpoint, preview, remove.
 */
function BasicImageAttach({
  imageId,
  onChange,
}: {
  imageId: number | undefined
  onChange: (imageId: number | undefined) => void
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File) => {
    setUploading(true)
    setError(null)
    const form = new FormData()
    form.set('file', file)
    try {
      const data = await apiUpload<{ ok?: boolean; id?: number; error?: string }>(
        '/api/images',
        form,
      )
      if (data.ok && data.id) onChange(data.id)
      else setError(data.error ?? 'upload failed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" /> {imageId ? 'Replace image' : 'Attach image'}
        </button>
        {imageId != null && (
          <button
            type="button"
            className="btn-ghost text-xs text-red-400"
            onClick={() => onChange(undefined)}
          >
            <X className="h-3.5 w-3.5" /> Remove
          </button>
        )}
        <span className="text-xs text-neutral-500">
          {uploading ? 'uploading…' : 'dual coding — picture + words'}
        </span>
      </div>
      {imageId != null && (
        <img
          src={`/api/images/${imageId}`}
          alt="card image"
          className="max-h-40 rounded-lg border border-neutral-200 dark:border-[#26262b]"
        />
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ─── Bulk paste import ──────────────────────────────────────────────────────

function BulkImportModal({
  deckId,
  onClose,
  onImported,
}: {
  deckId: number
  onClose: () => void
  onImported: () => void
}) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<string | null>(null)

  const parsed = useMemo(() => {
    const items: { type: CardFormat; content: CardContent }[] = []
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    for (const line of lines) {
      if (/\{\{c\d+::.*?\}\}/.test(line)) {
        const c = parseCloze(line)
        items.push({
          type: 'cloze',
          content: { cloze: { text: c.text, answers: c.answers, mode: c.mode } },
        })
        continue
      }
      const qa = line.match(
        /^(?:Q|question)\d*\s*[:.)]\s*(.+?)\s*(?:\||::)\s*(?:A|answer)?\d*\s*[:.)]?\s*(.+)$/i,
      )
      if (qa) {
        items.push({
          type: 'basic',
          content: { basic: { front: qa[1]!.trim(), back: qa[2]!.trim() } },
        })
        continue
      }
      const sep = line.includes('::') ? '::' : line.includes(' | ') ? ' | ' : null
      if (sep) {
        const idx = line.indexOf(sep)
        items.push({
          type: 'basic',
          content: {
            basic: { front: line.slice(0, idx).trim(), back: line.slice(idx + sep.length).trim() },
          },
        })
      }
    }
    return items
  }, [text])

  const importMutation = useMutation({
    mutationFn: () =>
      apiSend<{ ok?: boolean; created?: number; rejected?: { index: number; issues: string[] }[] }>(
        '/api/cards?bulk=1',
        'PUT',
        { deckId, items: parsed },
      ),
    onSuccess: (data) => {
      if (data.ok) {
        setResult(
          `created ${data.created ?? 0} cards${data.rejected?.length ? `, ${data.rejected.length} rejected` : ''}`,
        )
        onImported()
      }
    },
  })

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="panel w-full max-w-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Bulk create from pasted text</h2>
          <button className="btn-ghost px-2" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          One card per line. Supported: <code>front :: back</code>, <code>front | back</code>, cloze
          lines with <code>{'{{c1::…}}'}</code> markers.
        </p>
        <textarea
          className="input min-h-[200px] font-mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500">{parsed.length} cards detected</span>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>
              Close
            </button>
            <button
              className="btn"
              disabled={parsed.length === 0 || importMutation.isPending}
              onClick={() => importMutation.mutate()}
            >
              Import
            </button>
          </div>
        </div>
        {result && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-300">
            {result}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── AI generation (degrades gracefully) ────────────────────────────────────

function AiGenerateModal({
  deckId,
  onClose,
  onGenerated,
}: {
  deckId: number
  onClose: () => void
  onGenerated: () => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [created, setCreated] = useState<number | null>(null)
  const { data: aiStatus } = useAiStatus()
  const manual = aiStatus?.configured === false

  // manual mode: validated transport cards → regular bulk insert (no AI in the loop)
  const insertManual = useMutation({
    mutationFn: async (cards: { text: string; answers: string[]; hint?: string }[]) => {
      const body = await apiSend<{ ok?: boolean; created?: number[]; error?: string }>(
        '/api/cards?bulk=1',
        'PUT',
        {
          deckId,
          items: cards.map((c) => ({
            type: 'cloze',
            content: { cloze: { text: c.text, answers: c.answers, mode: 'basic', hint: c.hint } },
            tags: ['cloze', 'manual'],
            source: 'manual',
          })),
        },
      )
      if (!body.ok) throw new Error(body.error ?? 'saving cards failed')
      return body.created!.length
    },
    onSuccess: (n) => {
      setCreated(n)
      setError(null)
      onGenerated()
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const generate = useMutation({
    mutationFn: () =>
      apiSend<{ ok?: boolean; cards?: number[]; error?: string; needsSetup?: boolean }>(
        '/api/ai/generate',
        'POST',
        {
          kind: 'cloze',
          payload: { text, deckId },
        },
      ),
    onSuccess: (data) => {
      if (data.ok && data.cards) {
        setCreated(data.cards.length)
        setError(null)
        onGenerated()
      } else {
        setError(data.error ?? 'generation failed')
        setNeedsSetup(Boolean(data.needsSetup))
      }
    },
    onError: () => setError('network error'),
  })

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="panel w-full max-w-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="h-4 w-4 text-amber-400" /> Generate cloze cards
          </h2>
          <button className="btn-ghost px-2" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          Paste study material; the key facts become cloze deletions in this deck.
        </p>
        <textarea
          className="input min-h-[180px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="paste a paragraph from your notes…"
        />
        {manual ? (
          <>
            <TransportPanel
              feature="cloze-generator"
              params={{ text: text.slice(0, 4000) }}
              onValidated={(data) =>
                insertManual.mutate(
                  (data as { cards: { text: string; answers: string[]; hint?: string }[] }).cards,
                )
              }
            />
            <p className="text-xs text-neutral-500">
              Manual mode: no AI configured. Copy the envelope into any chatbot and paste the reply
              — or use “Bulk paste” in the deck to add cards by hand.
            </p>
          </>
        ) : (
          <>
            {error && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
                {needsSetup ? (
                  <>
                    {error}{' '}
                    <a href="/settings" className="underline">
                      Configure AI in Settings
                    </a>{' '}
                    — or use “Bulk paste” for manual import.
                  </>
                ) : (
                  error
                )}
              </div>
            )}
            {created !== null && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-300">
                {created} cards created
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={onClose}>
                Close
              </button>
              <button
                className="btn"
                disabled={!text.trim() || generate.isPending}
                onClick={() => generate.mutate()}
              >
                {generate.isPending ? 'generating…' : 'Generate'}
              </button>
            </div>
          </>
        )}
        {created !== null && manual && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-300">
            {created} cards created
          </div>
        )}
        {manual && (
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
