'use client'

/**
 * Universal Ingest Studio — Advanced multi-modal card extraction & curation workbench.
 * Supports lecture transcripts, academic papers, syntax codebases, and markdown study notes.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  BookOpen,
  CheckCircle2,
  Code2,
  Copy,
  Edit2,
  FileText,
  Save,
  Sparkles,
  Trash2,
  Video,
} from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, Button, Callout, Panel, SelectField, Tabs, TextArea, TextField } from '@/ui'

export type IngestMediaType = 'youtube' | 'pdf' | 'code' | 'notes'

export interface EditableIngestedCard {
  id: string
  front: string
  back: string
  format: 'basic' | 'cloze' | 'mcq'
  sourceReference?: string
  selected: boolean
}

export interface IngestResponse {
  ok: boolean
  kind: string
  cardCount: number
  segmentCount?: number
  cards: Array<{
    front: string
    back: string
    format: 'basic' | 'cloze' | 'mcq'
    sourceReference?: string
  }>
  items: Array<{ type: string; content: unknown }>
}

const KIND_MAP: Record<
  IngestMediaType,
  'youtube_transcript' | 'academic_paper' | 'code_files' | 'markdown_notes'
> = {
  youtube: 'youtube_transcript',
  pdf: 'academic_paper',
  code: 'code_files',
  notes: 'markdown_notes',
}

const SAMPLE_DATA: Record<IngestMediaType, { title: string; content: string; urlOrFile?: string }> =
  {
    youtube: {
      title: 'MIT 6.006 - Intro to Algorithms',
      urlOrFile: 'https://youtube.com/watch?v=ZaK6c0u3dYI',
      content: `00:00:30.000
In this lecture we formally define asymptotic notation and worst-case running time.

00:01:45.000
Merge sort operates by divide and conquer, recursively splitting arrays in halves.

00:03:10.000
The master theorem provides a cookbook solution for recurrences of the form T(n) = aT(n/b) + f(n).`,
    },
    pdf: {
      title: 'Attention Is All You Need (Vaswani et al.)',
      content: `In this work we propose the Transformer, a model architecture eschewing recurrence.

Definition 1.1: Scaled Dot-Product Attention is an attention mechanism computed by dividing dot products of queries and keys by the square root of their dimension.
$$Attention(Q, K, V) = softmax(\\frac{QK^T}{\\sqrt{d_k}})V$$

Theorem 2.1 (Multi-Head Projection): Multi-head attention allows the model to jointly attend to information from different representation subspaces.
$$MultiHead(Q, K, V) = Concat(head_1, ..., head_h)W^O$$`,
    },
    code: {
      title: 'FSRS-6 Algorithm Implementation',
      urlOrFile: 'fsrs.ts',
      content: `export interface FSRSCard {
  stability: number
  difficulty: number
  due: string
}

export function nextInterval(stability: number, desiredRetention: number): number {
  return Math.round(9 * stability * (1 / desiredRetention - 1))
}

export function retrievability(elapsedDays: number, stability: number): number {
  return Math.pow(1 + elapsedDays / (9 * stability), -1)
}`,
    },
    notes: {
      title: 'Cognitive Science & Memory Consolidation',
      content: `# Memory Consolidation Highlights

- **Long-term Potentiation**: A persistent strengthening of synapses based on recent patterns of activity.
- The neurotransmitter {{c1::Glutamate}} binds to AMPA and NMDA receptors to trigger synaptic plasticity.

Q: What is the testing effect according to Roediger & Karpicke (2006)?
A: Active retrieval practice produces stronger, longer-lasting memory traces than passive restudy.

Desirable Difficulties :: Learning tasks that require effortful processing and enhance long-term retention.`,
    },
  }

export function UniversalIngestStudio() {
  const [media, setMedia] = useState<IngestMediaType>('youtube')
  const [title, setTitle] = useState(SAMPLE_DATA.youtube.title)
  const [sourceUrl, setSourceUrl] = useState(SAMPLE_DATA.youtube.urlOrFile ?? '')
  const [filename, setFilename] = useState('main.ts')
  const [rawText, setRawText] = useState(SAMPLE_DATA.youtube.content)
  const [deckId, setDeckId] = useState<number | ''>('')
  const [customTags, setCustomTags] = useState('ingest')

  const [cards, setCards] = useState<EditableIngestedCard[]>([])
  const [editingCardId, setEditingCardId] = useState<string | null>(null)

  const decks = useQuery<{ decks: Array<{ id: number; name: string }> }>({
    queryKey: ['decks-for-ingest'],
    queryFn: () => apiGet('/api/decks'),
  })

  useEffect(() => {
    if (deckId === '' && decks.data?.decks[0]) {
      setDeckId(decks.data.decks[0].id)
    }
  }, [decks.data, deckId])

  const ingestMutation = useMutation({
    mutationFn: () =>
      apiSend<IngestResponse>('/api/ingest/multimodal', 'POST', {
        kind: KIND_MAP[media],
        rawContent: rawText,
        title: title.trim() || 'Ingested Source',
        sourceUrl: media === 'youtube' && sourceUrl.trim() ? sourceUrl.trim() : undefined,
        filename: media === 'code' ? filename.trim() || 'code.ts' : undefined,
      }),
    onSuccess: (data) => {
      const formatted: EditableIngestedCard[] = data.cards.map((c, index) => ({
        id: `ingest-${Date.now()}-${index}`,
        front: c.front,
        back: c.back,
        format: c.format,
        sourceReference: c.sourceReference,
        selected: true,
      }))
      setCards(formatted)
    },
  })

  const saveMutation = useMutation({
    mutationFn: (cardsToSave: EditableIngestedCard[]) => {
      const tagList = customTags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)

      const items = cardsToSave.map((c) => {
        if (c.format === 'cloze') {
          return {
            type: 'cloze',
            content: {
              cloze: {
                text: c.front,
                answers: [c.back],
                mode: 'basic',
              },
            },
            tags: [...tagList, media],
            source: c.sourceReference ?? (title.trim() || 'ingest'),
          }
        }
        return {
          type: 'basic',
          content: {
            basic: {
              front: c.front,
              back: c.back,
            },
          },
          tags: [...tagList, media],
          source: c.sourceReference ?? (title.trim() || 'ingest'),
        }
      })

      return apiSend<{ ok?: boolean; created: number; cardIds: number[]; rejected: unknown[] }>(
        '/api/cards?bulk=1',
        'PUT',
        {
          deckId: Number(deckId),
          items,
        },
      )
    },
  })

  const handleMediaChange = (newMedia: IngestMediaType) => {
    setMedia(newMedia)
    const sample = SAMPLE_DATA[newMedia]
    setTitle(sample.title)
    setRawText(sample.content)
    if (newMedia === 'youtube') setSourceUrl(sample.urlOrFile ?? '')
    if (newMedia === 'code') setFilename(sample.urlOrFile ?? 'code.ts')
    setCards([])
    ingestMutation.reset()
    saveMutation.reset()
  }

  const loadSample = () => {
    const sample = SAMPLE_DATA[media]
    setTitle(sample.title)
    setRawText(sample.content)
    if (media === 'youtube') setSourceUrl(sample.urlOrFile ?? '')
    if (media === 'code') setFilename(sample.urlOrFile ?? 'code.ts')
  }

  const toggleSelectCard = (id: string) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)))
  }

  const selectAll = (selected: boolean) => {
    setCards((prev) => prev.map((c) => ({ ...c, selected })))
  }

  const updateCardContent = (id: string, front: string, back: string) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, front, back } : c)))
  }

  const removeCard = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id))
  }

  const selectedCount = cards.filter((c) => c.selected).length
  const isYoutube = media === 'youtube'
  const isCode = media === 'code'

  return (
    <div className="space-y-6">
      <Tabs
        label="Source format"
        value={media}
        onChange={handleMediaChange}
        items={[
          { key: 'youtube', label: 'Video Transcript', icon: <Video className="h-4 w-4" /> },
          { key: 'pdf', label: 'Academic Paper / LaTeX', icon: <FileText className="h-4 w-4" /> },
          { key: 'code', label: 'Codebase / Syntax', icon: <Code2 className="h-4 w-4" /> },
          { key: 'notes', label: 'Markdown & Study Notes', icon: <BookOpen className="h-4 w-4" /> },
        ]}
      />

      <Panel>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Source Details & Raw Input
            </h3>
            <button
              type="button"
              onClick={loadSample}
              className="text-xs text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1"
            >
              <Copy className="h-3 w-3" /> Load Sample Material
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="Source Title"
              value={title}
              maxLength={200}
              placeholder="e.g. CS229 Lecture 1"
              onChange={(e) => setTitle(e.target.value)}
            />
            {isYoutube ? (
              <TextField
                label="YouTube Video URL (optional)"
                hint="Deep-links flashcards directly to video timestamp."
                type="url"
                value={sourceUrl}
                placeholder="https://youtube.com/watch?v=..."
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            ) : isCode ? (
              <TextField
                label="File Name"
                hint="Sets language syntax highlighting and cloze tags."
                value={filename}
                maxLength={200}
                placeholder="e.g. algorithms.ts"
                onChange={(e) => setFilename(e.target.value)}
              />
            ) : (
              <TextField
                label="Custom Subject Tags"
                hint="Comma-separated tags for generated cards."
                value={customTags}
                placeholder="biology, cells, exam2"
                onChange={(e) => setCustomTags(e.target.value)}
              />
            )}
          </div>

          <TextArea
            label={
              media === 'youtube'
                ? 'Video Transcript (VTT, SRT or timestamped cues)'
                : media === 'pdf'
                  ? 'Paper Text (Definitions, Theorems, LaTeX equations)'
                  : media === 'code'
                    ? 'Source Code (Functions, Interfaces, Classes)'
                    : 'Markdown Notes (Headings, Q&A blocks, Bold definitions, Clozes)'
            }
            className="font-mono text-xs leading-relaxed"
            value={rawText}
            rows={10}
            onChange={(e) => setRawText(e.target.value)}
          />

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-tertiary">
              {rawText.length.toLocaleString()} characters ·{' '}
              {rawText.split(/\r?\n/).filter(Boolean).length} lines
            </span>

            <Button
              icon={<Sparkles className="h-4 w-4" />}
              loading={ingestMutation.isPending}
              disabled={rawText.trim().length < 10}
              onClick={() => {
                saveMutation.reset()
                ingestMutation.mutate()
              }}
            >
              Extract & Generate Flashcards
            </Button>
          </div>

          {ingestMutation.isError ? (
            <Callout tone="danger" title="Ingestion Failed">
              {ingestMutation.error instanceof Error
                ? ingestMutation.error.message
                : 'Unable to parse provided input.'}
            </Callout>
          ) : null}
        </div>
      </Panel>

      {/* Generated Cards Curation HUD */}
      {cards.length > 0 ? (
        <Panel
          title={
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span>Generated Card Preview</span>
                <Badge tone="cyan">{cards.length} extracted</Badge>
                <Badge tone={selectedCount > 0 ? 'success' : 'neutral'}>
                  {selectedCount} selected
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => selectAll(true)}
                  className="text-xs text-indigo-500 hover:underline"
                >
                  Select All
                </button>
                <span className="text-faint">·</span>
                <button
                  type="button"
                  onClick={() => selectAll(false)}
                  className="text-xs text-tertiary hover:underline"
                >
                  Deselect All
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end rounded-xl bg-neutral-50 dark:bg-neutral-800/50 p-4 border border-neutral-200 dark:border-neutral-700">
              <SelectField
                label="Target Deck"
                className="flex-1"
                value={deckId}
                onChange={(e) => setDeckId(e.target.value ? Number(e.target.value) : '')}
              >
                {(decks.data?.decks ?? []).length === 0 ? (
                  <option value="">No decks found</option>
                ) : null}
                {(decks.data?.decks ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </SelectField>

              <TextField
                label="Tags"
                className="flex-1"
                value={customTags}
                placeholder="ingest, lecture1"
                onChange={(e) => setCustomTags(e.target.value)}
              />

              <Button
                icon={<Save className="h-4 w-4" />}
                loading={saveMutation.isPending}
                disabled={deckId === '' || selectedCount === 0 || saveMutation.isSuccess}
                onClick={() => saveMutation.mutate(cards.filter((c) => c.selected))}
              >
                Save {selectedCount} Cards to Deck
              </Button>
            </div>

            {saveMutation.isSuccess && saveMutation.data ? (
              <Callout tone="success" title="Flashcards Successfully Saved">
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-4 w-4 text-status-success-text" />
                  <span>
                    Saved <strong>{saveMutation.data.created} cards</strong> directly to your review
                    queue.
                  </span>
                </div>
              </Callout>
            ) : null}

            {saveMutation.isError ? (
              <Callout tone="danger" title="Save Failed">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : 'Failed to save cards.'}
              </Callout>
            ) : null}

            <div className="space-y-3">
              {cards.map((card, idx) => {
                const isEditing = editingCardId === card.id
                return (
                  <div
                    key={card.id}
                    className={`rounded-xl border p-4 transition text-xs space-y-2.5 ${
                      card.selected
                        ? 'border-indigo-300 dark:border-indigo-800/80 bg-white dark:bg-neutral-900 shadow-xs'
                        : 'border-neutral-200 dark:border-neutral-800 opacity-60 bg-neutral-50 dark:bg-neutral-900/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={card.selected}
                          onChange={() => toggleSelectCard(card.id)}
                          className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-semibold text-neutral-600 dark:text-faint">
                          Card #{idx + 1}
                        </span>
                        <Badge tone={card.format === 'cloze' ? 'accent' : 'neutral'}>
                          {card.format.toUpperCase()}
                        </Badge>
                        {card.sourceReference ? (
                          <span className="text-[10px] text-faint font-mono">
                            {card.sourceReference}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingCardId(isEditing ? null : card.id)}
                          className="p-1 text-tertiary hover:text-indigo-600 dark:hover:text-indigo-400 rounded"
                          title="Edit Card"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCard(card.id)}
                          className="p-1 text-faint hover:text-rose-600 dark:hover:text-danger-text rounded"
                          title="Remove Card"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2 pt-1 border-t border-neutral-100 dark:border-neutral-800">
                        <div>
                          <label className="text-[10px] font-semibold text-tertiary uppercase">
                            Question / Front
                          </label>
                          <textarea
                            value={card.front}
                            rows={2}
                            onChange={(e) => updateCardContent(card.id, e.target.value, card.back)}
                            className="w-full text-xs font-mono rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-2 text-neutral-900 dark:text-neutral-100"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-tertiary uppercase">
                            Answer / Back
                          </label>
                          <textarea
                            value={card.back}
                            rows={2}
                            onChange={(e) => updateCardContent(card.id, card.front, e.target.value)}
                            className="w-full text-xs font-mono rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-2 text-neutral-900 dark:text-neutral-100"
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="whitespace-pre-wrap break-words font-medium text-neutral-900 dark:text-neutral-100">
                          {card.front}
                        </div>
                        <div className="whitespace-pre-wrap break-words rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 p-2 font-mono text-emerald-800 dark:text-status-success-text">
                          {card.back}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  )
}
