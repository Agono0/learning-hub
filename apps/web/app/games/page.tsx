'use client'

/**
 * Games (Agent A): matching pairs built with dnd-kit (PointerSensor
 * distance:5), a run timer, and score submission to /api/games which derives
 * a grade and runs the standard review pipeline on the played cards.
 *
 * CLIENT component — core imports via SUBPATHS only (never the barrel).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Brain, PartyPopper, RotateCcw, Timer, Trophy } from 'lucide-react'
import { evaluateMatchingGame } from '@learning-hub/core/games'

interface DeckInfo { id: number; name: string; emoji: string | null; total: number; due: number }
interface MatchingPair { cardId: number; left: string; right: string }
interface GameData { pairs: MatchingPair[]; lefts: MatchingPair[]; rights: MatchingPair[] }
interface GameResult { ok: boolean; grade?: number; accuracy?: number; xp?: number; streak?: { current: number; best: number }; error?: string }

export default function GamesPage() {
  const qc = useQueryClient()
  const [deckId, setDeckId] = useState<number | null>(null)

  const decks = useQuery<{ decks: DeckInfo[] }>({ queryKey: ['decks'], queryFn: () => fetch('/api/decks').then((r) => r.json()) })
  const game = useQuery<GameData>({
    queryKey: ['game', deckId],
    queryFn: () => fetch(`/api/games?deckId=${deckId}`).then((r) => r.json()),
    enabled: deckId !== null,
  })

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Brain className="h-5 w-5" /> Games</h1>

      <div className="panel">
        <div className="label mb-2">Choose a deck to play its cards</div>
        <div className="flex flex-wrap gap-2">
          {(decks.data?.decks ?? []).map((d) => (
            <button
              key={d.id}
              onClick={() => setDeckId(d.id)}
              className={`rounded-lg border px-3 py-2 text-sm ${
                deckId === d.id ? 'border-indigo-500 bg-indigo-600/10 text-indigo-300' : 'border-neutral-200 text-neutral-600 dark:border-[#26262b] dark:text-neutral-300'
              }`}
            >
              {d.emoji} {d.name}
            </button>
          ))}
        </div>
      </div>

      {deckId !== null && game.data?.pairs && <MatchingBoard key={game.data.pairs.map((p) => p.cardId).join('-')} deckId={deckId} game={game.data} onPlayed={() => void qc.invalidateQueries({ queryKey: ['decks'] })} />}
      {deckId !== null && game.data && game.data.pairs.length === 0 && (
        <div className="panel text-sm text-neutral-500">No playable (textual) cards in this deck — matching needs basic/cloze/mcq/typein cards.</div>
      )}
    </div>
  )
}

function MatchingBoard({ deckId, game, onPlayed }: { deckId: number; game: GameData; onPlayed: () => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [matched, setMatched] = useState<Record<number, boolean>>({})
  const [misses, setMisses] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [posted, setPosted] = useState<GameResult | null>(null)
  const startedAt = useRef(Date.now())

  const done = Object.keys(matched).length === game.pairs.length && game.pairs.length > 0

  useEffect(() => {
    if (done) return
    const t = setInterval(() => setSeconds(Math.round((Date.now() - startedAt.current) / 1000)), 500)
    return () => clearInterval(t)
  }, [done])

  const submit = useMutation({
    mutationFn: async () => {
      // grade the round through the shared core evaluator: attempts are
      // pairs + misses, so the server derives a real accuracy instead of 1.0
      const evaluation = evaluateMatchingGame({
        pairs: game.pairs.length,
        misses,
        timeMs: Date.now() - startedAt.current,
      })
      const res = await fetch('/api/games', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deckId,
          correct: evaluation.pairs,
          total: evaluation.totalAttempts,
          misses: evaluation.misses,
          cardIds: game.pairs.map((p) => p.cardId),
          timeMs: Date.now() - startedAt.current,
        }),
      })
      return res.json() as Promise<GameResult>
    },
    onSuccess: (data) => {
      setPosted(data)
      onPlayed()
    },
  })

  useEffect(() => {
    if (done && !posted && !submit.isPending) submit.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  const onDragEnd = (e: DragEndEvent) => {
    const cardId = Number(e.active.id)
    const slotId = e.over?.id ? Number(e.over.id) : null
    if (slotId === cardId) setMatched((m) => ({ ...m, [cardId]: true }))
    else if (slotId !== null) setMisses((n) => n + 1)
  }

  // board score comes from the same core evaluator that grades the submission
  const evaluation = evaluateMatchingGame({ pairs: game.pairs.length, misses, timeMs: Date.now() - startedAt.current })
  const score = evaluation.scorePct

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="panel space-y-4">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1 text-neutral-400"><Timer className="h-4 w-4" /> {seconds}s</span>
          <span className="flex items-center gap-1 text-neutral-400"><Trophy className="h-4 w-4" /> {Object.keys(matched).length}/{game.pairs.length} matched</span>
          {misses > 0 && <span className="text-red-400">{misses} miss{misses > 1 ? 'es' : ''}</span>}
          <span className="ml-auto text-xs text-neutral-500">drag the answer chip onto its prompt</span>
        </div>

        {done ? (
          <div className="celebrate space-y-3 py-6 text-center">
            <PartyPopper className="mx-auto h-10 w-10 text-amber-400" />
            <div className="text-lg font-bold">Board cleared in {seconds}s — score {score}%</div>
            {posted?.ok && (
              <div className="text-sm text-neutral-400">
                graded as <span className="font-medium text-indigo-300">{['', 'Again', 'Hard', 'Good', 'Easy'][posted.grade ?? 3]}</span> · +{posted.xp} XP · streak {posted.streak?.current}
              </div>
            )}
            <button className="btn mx-auto" onClick={() => { setMatched({}); setMisses(0); setPosted(null); setSeconds(0); startedAt.current = Date.now() }}>
              <RotateCcw className="h-4 w-4" /> Play again
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="label">prompts</div>
              {game.lefts.map((pair) => (
                <Slot key={pair.cardId} pair={pair} matched={Boolean(matched[pair.cardId])} />
              ))}
            </div>
            <div className="space-y-2">
              <div className="label">answers</div>
              {game.rights.map((pair) => (
                <Chip key={`c-${pair.cardId}`} pair={pair} matched={Boolean(matched[pair.cardId])} />
              ))}
            </div>
          </div>
        )}
      </div>
    </DndContext>
  )
}

function Slot({ pair, matched }: { pair: MatchingPair; matched: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: pair.cardId })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border p-3 text-sm transition-colors ${
        matched
          ? 'border-emerald-600/50 bg-emerald-600/10 text-emerald-300'
          : isOver
            ? 'border-indigo-400 bg-indigo-500/10'
            : 'border-neutral-200 text-neutral-700 dark:border-[#26262b] dark:text-neutral-300'
      }`}
    >
      {pair.left}
      {matched && <span className="ml-2 text-xs text-emerald-400/70">✓ {pair.right}</span>}
    </div>
  )
}

function Chip({ pair, matched }: { pair: MatchingPair; matched: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: pair.cardId })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-lg border p-3 text-sm transition-colors select-none ${
        matched
          ? 'border-neutral-200 text-neutral-600 line-through opacity-40 dark:border-[#26262b]'
          : isDragging
            ? 'z-10 border-indigo-400 bg-indigo-600/20 shadow-lg'
            : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-indigo-400 dark:border-[#26262b] dark:bg-[#101014] dark:text-neutral-300'
      }`}
    >
      {pair.right}
    </div>
  )
}
