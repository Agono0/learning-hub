'use client'

/**
 * Memory Palace (Agent A): palace list, builder (loci items with vivid images
 * and card attachment) and a full-screen walk-through review mode that plays
 * the loci in walk order (ascending lociIndex, from core/memory).
 *
 * CLIENT component — core imports via SUBPATHS only (never the barrel).
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Map, MapPin, Play, Plus, Save, Trash2, X } from 'lucide-react'
import type { CardContent, CardFormat } from '@learning-hub/core/types'
import { palaceWalkOrder } from '@learning-hub/core/memory'
import { apiGet, apiSend } from '@/lib/transport'

interface PalaceRow {
  id: number
  name: string
  description: string | null
  layout: { rooms: { name: string; emoji: string }[] } | null
}
interface PalaceItemRow {
  id: number
  palaceId: number
  lociIndex: number
  name: string
  vividImage: string | null
  cardId: number | null
}
interface CardRow {
  id: number
  type: CardFormat
  content: CardContent
  deckId: number
}
interface PalaceFull {
  palace: PalaceRow
  items: PalaceItemRow[]
}

interface DraftItem {
  lociIndex: number
  name: string
  vividImage: string
  cardId: number | null
}

function cardFront(content: CardContent): string {
  if (content.basic) return content.basic.front
  if (content.cloze) return content.cloze.text.replace(/\{\{c\d+::.*?\}\}/g, '___')
  if (content.mcq) return content.mcq.question
  if (content.typein) return content.typein.question
  if (content.grammar) return content.grammar.sentence
  return '(card)'
}
function cardBack(content: CardContent): string {
  if (content.basic) return content.basic.back
  if (content.cloze) return content.cloze.answers.join(', ')
  if (content.mcq) return content.mcq.options[content.mcq.correctIndex] ?? ''
  if (content.typein) return content.typein.acceptedAnswers.join(', ')
  if (content.grammar) return content.grammar.target
  return ''
}

export default function MemoryPalacePage() {
  const qc = useQueryClient()
  const [activeId, setActiveId] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [walking, setWalking] = useState(false)

  const list = useQuery<{ palaces: PalaceFull[] }>({
    queryKey: ['palaces'],
    queryFn: () => apiGet<{ palaces: PalaceFull[] }>('/api/palace'),
  })
  const detail = useQuery<PalaceFull>({
    queryKey: ['palace', activeId],
    queryFn: () => apiGet<PalaceFull>(`/api/palace/${activeId}`),
    enabled: activeId !== null,
  })
  const cards = useQuery<{ cards: CardRow[] }>({
    queryKey: ['cards', 'palace-picker'],
    queryFn: () => apiGet<{ cards: CardRow[] }>('/api/cards?limit=100'),
  })

  const [name, setName] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  useEffect(() => {
    if (detail.data) {
      setName(detail.data.palace.name)
      setItems(
        detail.data.items.map((it) => ({
          lociIndex: it.lociIndex,
          name: it.name,
          vividImage: it.vividImage ?? '',
          cardId: it.cardId,
        })),
      )
    }
  }, [detail.data])

  const createPalace = useMutation({
    mutationFn: () =>
      apiSend<{ ok?: boolean; palace?: PalaceRow }>('/api/palace', 'POST', {
        name: newName,
        rooms: [],
      }),
    onSuccess: (data) => {
      setNewName('')
      void qc.invalidateQueries({ queryKey: ['palaces'] })
      if (data.palace) setActiveId(data.palace.id)
    },
  })

  const save = useMutation({
    mutationFn: () =>
      apiSend(`/api/palace/${activeId}`, 'PATCH', {
        name,
        items: items.map((it, i) => ({ ...it, lociIndex: i })),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['palaces'] })
      void qc.invalidateQueries({ queryKey: ['palace', activeId] })
    },
  })

  const deletePalace = useMutation({
    mutationFn: (id: number) => apiSend(`/api/palace/${id}`, 'DELETE'),
    onSuccess: () => {
      setActiveId(null)
      void qc.invalidateQueries({ queryKey: ['palaces'] })
    },
  })

  const cardLabel = (cardId: number | null) => {
    if (!cardId) return null
    const card = cards.data?.cards.find((c) => c.id === cardId)
    return card ? cardFront(card.content).slice(0, 60) : `card ${cardId}`
  }

  const active = list.data?.palaces.find((p) => p.palace.id === activeId)

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Map className="h-5 w-5" /> Memory Palace
      </h1>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* palace list */}
        <div className="space-y-3">
          <div className="panel space-y-2">
            <input
              className="input"
              placeholder="new palace name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button
              className="btn w-full"
              disabled={!newName.trim()}
              onClick={() => createPalace.mutate()}
            >
              <Plus className="h-4 w-4" /> Create palace
            </button>
          </div>
          <div className="panel space-y-1">
            {(list.data?.palaces ?? []).map((p) => (
              <div
                key={p.palace.id}
                className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${activeId === p.palace.id ? 'bg-indigo-600/10 text-indigo-300' : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-[#1a1a1f]'}`}
              >
                <button
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => setActiveId(p.palace.id)}
                >
                  {p.palace.name}
                  <span className="ml-2 text-xs text-neutral-500">{p.items.length} loci</span>
                </button>
                <button
                  className="opacity-0 hover:text-red-400 group-hover:opacity-100"
                  onClick={() => deletePalace.mutate(p.palace.id)}
                  title="delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {list.data && list.data.palaces.length === 0 && (
              <div className="py-4 text-center text-xs text-neutral-500">
                no palaces yet — method of loci beats re-reading
              </div>
            )}
          </div>
        </div>

        {/* builder */}
        <div className="panel space-y-4">
          {!active ? (
            <div className="py-10 text-center text-sm text-neutral-500">
              Pick or create a palace to edit its loci.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input max-w-xs"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <button className="btn" onClick={() => save.mutate()} disabled={save.isPending}>
                  <Save className="h-4 w-4" /> Save
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => setWalking(true)}
                  disabled={items.length === 0}
                >
                  <Play className="h-4 w-4" /> Walk through
                </button>
                <span className="ml-auto text-xs text-neutral-500">
                  loci are walked in list order
                </span>
              </div>

              <div className="space-y-2">
                {items.map((item, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-600/20 text-xs font-bold text-indigo-300">
                        {i + 1}
                      </span>
                      <input
                        className="input max-w-[200px]"
                        placeholder="locus (e.g. front door)"
                        value={item.name}
                        onChange={(e) =>
                          setItems(
                            items.map((it, j) => (j === i ? { ...it, name: e.target.value } : it)),
                          )
                        }
                      />
                      <select
                        className="input max-w-[260px]"
                        value={item.cardId ?? ''}
                        onChange={(e) =>
                          setItems(
                            items.map((it, j) =>
                              j === i
                                ? { ...it, cardId: e.target.value ? Number(e.target.value) : null }
                                : it,
                            ),
                          )
                        }
                      >
                        <option value="">no attached card</option>
                        {(cards.data?.cards ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            #{c.id} {cardFront(c.content).slice(0, 50)}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn-ghost ml-auto px-2 hover:text-red-400"
                        onClick={() => setItems(items.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <input
                      className="input mt-2"
                      placeholder="vivid image — the more absurd, the stickier (e.g. a singing doormat)"
                      value={item.vividImage}
                      onChange={(e) =>
                        setItems(
                          items.map((it, j) =>
                            j === i ? { ...it, vividImage: e.target.value } : it,
                          ),
                        )
                      }
                    />
                    {item.cardId && (
                      <div className="mt-1 text-xs text-neutral-500">
                        attached: {cardLabel(item.cardId)}
                      </div>
                    )}
                  </div>
                ))}
                <button
                  className="btn-ghost w-full justify-center border border-dashed border-neutral-300 dark:border-(--hub-border)"
                  onClick={() =>
                    setItems([
                      ...items,
                      { lociIndex: items.length, name: '', vividImage: '', cardId: null },
                    ])
                  }
                >
                  <MapPin className="h-4 w-4" /> Add locus
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {walking && active && (
        <WalkThrough
          items={palaceWalkOrder(items.map((it, i) => ({ ...it, lociIndex: i }))).map((it) => ({
            name: it.name,
            vividImage: it.vividImage,
            card: it.cardId ? (cards.data?.cards.find((c) => c.id === it.cardId) ?? null) : null,
          }))}
          onClose={() => setWalking(false)}
        />
      )}
    </div>
  )
}

/** Full-screen walk mode: locus → vivid image → card front → reveal → next. */
function WalkThrough({
  items,
  onClose,
}: {
  items: { name: string; vividImage: string; card: CardRow | null }[]
  onClose: () => void
}) {
  const [pos, setPos] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const item = items[pos]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        if (!revealed) setRevealed(true)
        else if (pos < items.length - 1) {
          setPos((p) => p + 1)
          setRevealed(false)
        } else onClose()
      }
      if (e.key === 'ArrowLeft' && pos > 0) {
        setPos((p) => p - 1)
        setRevealed(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pos, revealed, items.length, onClose])

  if (!item) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-8 text-center">
      <button className="btn-ghost absolute right-4 top-4" onClick={onClose}>
        <X className="h-4 w-4" /> exit (esc)
      </button>
      <div className="text-xs uppercase tracking-widest text-neutral-500">
        locus {pos + 1} / {items.length}
      </div>
      <div className="celebrate mt-2 text-3xl font-bold">{item.name}</div>
      {item.vividImage && (
        <div className="mt-3 max-w-xl text-sm text-amber-300/80">{item.vividImage}</div>
      )}
      {item.card && (
        <div className="panel mt-6 min-h-[120px] w-full max-w-xl space-y-3">
          <div className="text-lg">{cardFront(item.card.content)}</div>
          {revealed ? (
            <div className="text-lg font-medium text-emerald-400">
              {cardBack(item.card.content)}
            </div>
          ) : (
            <button className="btn-ghost" onClick={() => setRevealed(true)}>
              <Eye className="h-4 w-4" /> reveal (space)
            </button>
          )}
        </div>
      )}
      <div className="mt-8 flex items-center gap-3">
        <button
          className="btn-ghost"
          disabled={pos === 0}
          onClick={() => {
            setPos((p) => p - 1)
            setRevealed(false)
          }}
        >
          ← back
        </button>
        {revealed && item.card && (
          <button className="btn-ghost" onClick={() => setRevealed(false)}>
            <EyeOff className="h-4 w-4" /> hide
          </button>
        )}
        <button
          className="btn"
          onClick={() =>
            pos < items.length - 1 ? (setPos((p) => p + 1), setRevealed(false)) : onClose()
          }
        >
          {pos < items.length - 1 ? 'next locus →' : 'finish walk'}
        </button>
      </div>
    </div>
  )
}
