'use client'

/**
 * /arena-3d — the 3D Review Arena.
 *
 * A review session dressed as a colosseum duel. The queue comes from the
 * REAL review pipeline (GET /api/arena reuses buildSession over due cards);
 * every grade runs the canonical executeReview() on the server at settlement
 * (POST /api/arena), so FSRS scheduling, revlog, streaks and mastery update
 * exactly as in the normal review flow. The arena adds a thin motivational
 * layer on top — guardian, strikes, shield, combo — whose rewards are
 * recomputed server-side from the raw grade log and capped by the engine.
 *
 * The 3D canvas is decorative: the full session is playable from the DOM
 * HUD, and reduced-motion / e-ink users get the DOM version only (motion
 * law). The guardian's HP bar is the session queue rendered as progress —
 * the arena never invents a separate economy.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Coins, Flame, Heart, RotateCcw, Shield, Swords, Trophy } from 'lucide-react'
import {
  applyGrade,
  arenaConfig,
  buildArenaSummary,
  createArenaSession,
  type ArenaChallenge,
  type ArenaState,
} from '@learning-hub/core'
import type { CardContent, CardFormat, Grade } from '@learning-hub/core/types'
import { apiGet, apiSend } from '@/lib/transport'
import { useReducedMotion } from '@/lib/useReducedMotion'
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  PageHeader,
  Panel,
  ProgressBar,
  Skeleton,
  useToast,
} from '@/ui'
import { ChipPicker } from '@/components/ui/chip-picker'
import type { ArenaCanvasHandle } from '@/ui/ArenaCanvas'

const ArenaCanvas = dynamic(() => import('@/ui/ArenaCanvas').then((m) => m.ArenaCanvas), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center text-sm text-faint">
      Summoning the arena…
    </div>
  ),
})

// ─── Types ──────────────────────────────────────────────────────────────────

interface ArenaCard {
  id: number
  deckId: number
  type: CardFormat
  content: CardContent
  tags: string[]
  due: string
  previews?: Record<Grade, string>
}

interface DeckInfo {
  id: number
  name: string
  emoji: string | null
  due?: number
}

interface SessionPayload {
  ok: boolean
  cards: ArenaCard[]
  limit: number
}

interface SettlementResponse {
  ok: boolean
  summary: {
    result: 'victory' | 'defeat'
    rounds: number
    correct: number
    accuracy: number
    bestCombo: number
    crits: number
    score: number
    coins: number
    xp: number
  }
  reviewXp: number
  coinsAwarded: number
  coinBalance: number
  streak: { current: number; best: number } | null
}

type Phase = 'setup' | 'loading' | 'fighting' | 'settling' | 'results'

const GRADE_BUTTONS: { grade: Grade; label: string }[] = [
  { grade: 1, label: 'Again' },
  { grade: 2, label: 'Hard' },
  { grade: 3, label: 'Good' },
  { grade: 4, label: 'Easy' },
]

const CHALLENGE_OPTIONS = ['5', '10', '15', '20'] as const
const DEFAULT_CHALLENGES = '10'

// ─── Card text extraction (mirrors the review page's voice helpers) ─────────

function cardFront(card: ArenaCard): string {
  if (card.content.basic) return card.content.basic.front
  if (card.content.exercise?.prompt) return card.content.exercise.prompt
  if (card.content.typein?.question) return card.content.typein.question
  if (card.content.cloze?.text) return card.content.cloze.text
  if (card.content.mcq?.question) return card.content.mcq.question
  return 'Review item'
}

function cardBack(card: ArenaCard): string {
  if (card.content.basic) return card.content.basic.back
  if (card.content.typein) return card.content.typein.acceptedAnswers.join(' · ')
  if (card.content.mcq) return card.content.mcq.options[card.content.mcq.correctIndex] ?? ''
  if (card.content.cloze) return card.content.cloze.answers.join(' · ')
  return ''
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Arena3DPage() {
  const reducedMotion = useReducedMotion()
  const { toast } = useToast()
  const arenaHandle = useRef<ArenaCanvasHandle>(null)

  const [phase, setPhase] = useState<Phase>('setup')
  const [decks, setDecks] = useState<DeckInfo[]>([])
  const [selectedDeckIds, setSelectedDeckIds] = useState<number[]>([])
  const [challengeCount, setChallengeCount] = useState<string>(DEFAULT_CHALLENGES)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [cards, setCards] = useState<ArenaCard[]>([])
  const [challenges, setChallenges] = useState<ArenaChallenge[]>([])
  const [arena, setArena] = useState<ArenaState | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [confident, setConfident] = useState(false)
  const [shownAt, setShownAt] = useState<number>(0)
  const [settlement, setSettlement] = useState<SettlementResponse | null>(null)

  const cfg = useMemo(() => arenaConfig(), [])

  // Deck catalog for the setup picker.
  useEffect(() => {
    apiGet<{ decks: DeckInfo[] }>('/api/decks')
      .then((d) => setDecks(d.decks))
      .catch(() => setDecks([]))
  }, [])

  // Reduced-motion users never mount the canvas; the DOM HUD carries everything.
  const canvasEnabled = !reducedMotion

  function toggleDeck(id: number): void {
    setSelectedDeckIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]))
  }

  async function startSession(): Promise<void> {
    setPhase('loading')
    setLoadError(null)
    try {
      const query = selectedDeckIds.length
        ? `deckIds=${selectedDeckIds.join(',')}&limit=${challengeCount}`
        : `limit=${challengeCount}`
      const payload = await apiGet<SessionPayload>(`/api/arena?${query}`)
      if (!payload.cards.length) {
        setLoadError('No due cards found for that selection — try another deck or a longer run.')
        setPhase('setup')
        return
      }
      const nextChallenges = payload.cards.map((c) => ({
        cardId: c.id,
        prompt: cardFront(c),
        answer: cardBack(c),
      }))
      setCards(payload.cards)
      setChallenges(nextChallenges)
      setArena(createArenaSession(nextChallenges, cfg))
      setRevealed(false)
      setConfident(false)
      setSettlement(null)
      setPhase('fighting')
      setShownAt(performance.now())
      arenaHandle.current?.reset()
    } catch {
      setLoadError('The arena could not be reached. Check the connection and try again.')
      setPhase('setup')
    }
  }

  function driveScene(next: ArenaState, lastGrade: Grade): void {
    const handle = arenaHandle.current
    if (!handle) return
    const last = next.exchanges[next.exchanges.length - 1]
    handle.setProgress(1 - next.guardianHp / Math.max(1, next.guardianMaxHp))
    if (next.shield > 0 && last && last.counterShielded > 0) {
      handle.shieldRaise()
    } else if (next.shield === 0) {
      handle.shieldBreak()
    }
    if (last && last.counterTaken > 0) {
      handle.countered()
    } else if (lastGrade >= 3) {
      handle.strike({ crit: last?.crit ?? false })
    }
    if (next.status === 'victory') handle.guardianDefeated()
    if (next.status === 'defeat') handle.playerDefeated()
  }

  function grade(grade: Grade): void {
    if (!arena || arena.status !== 'fighting') return
    const current = challenges[arena.round]
    if (!current) return
    const timeMs = Math.max(0, Math.round(performance.now() - shownAt))
    const next = applyGrade(arena, current, grade, confident ? 1 : 0, timeMs, cfg)
    setArena(next)
    driveScene(next, grade)
    setRevealed(false)
    setConfident(false)
    setShownAt(performance.now())

    if (next.status !== 'fighting') {
      void settle(next)
    }
  }

  async function settle(final: ArenaState): Promise<void> {
    setPhase('settling')
    const summary = buildArenaSummary(final)
    const fallbackDeckIds = [...new Set(cards.map((c) => c.deckId))]
    try {
      const response = await apiSend<SettlementResponse>('/api/arena', 'POST', {
        deckIds: selectedDeckIds.length ? selectedDeckIds : fallbackDeckIds,
        exchanges: final.exchanges.map((e) => ({
          cardId: e.cardId,
          grade: e.grade,
          confidence: e.confidence,
          timeMs: e.timeMs,
        })),
        bestCombo: final.bestCombo,
        result: summary.result,
      })
      setSettlement(response)
    } catch {
      toast({
        tone: 'danger',
        title: 'Settlement failed',
        description:
          'The grades were not recorded. Reopen the arena to retry — the cards are still due, nothing was scheduled from this run.',
      })
      setSettlement(null)
    }
    setPhase('results')
  }

  function playAgain(): void {
    setPhase('setup')
    setArena(null)
    setCards([])
    setChallenges([])
    setSettlement(null)
    arenaHandle.current?.reset()
  }

  const currentChallenge = arena ? challenges[arena.round] : undefined
  const currentCard = currentChallenge
    ? cards.find((c) => c.id === currentChallenge.cardId)
    : undefined
  const lastExchange = arena?.exchanges[arena.exchanges.length - 1]
  const guardianProgress = arena ? 1 - arena.guardianHp / Math.max(1, arena.guardianMaxHp) : 0

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-6">
      <PageHeader
        title="Review Arena"
        subtitle="A colosseum run over your real due cards. Every strike is a grade; every grade schedules."
      />

      {/* 3D stage — decorative; never mounted for reduced motion. */}
      {canvasEnabled && phase !== 'setup' && phase !== 'loading' ? (
        <div
          className="relative h-64 w-full overflow-hidden rounded-2xl border border-(--hub-border) bg-neutral-950 sm:h-80"
          data-testid="arena-stage"
        >
          <ArenaCanvas ref={arenaHandle} className="h-full w-full" />
        </div>
      ) : null}

      {phase === 'setup' || phase === 'loading' ? (
        <Panel data-testid="arena-setup">
          <div className="flex flex-col gap-5 p-6">
            <div>
              <h2 className="text-lg font-semibold">Choose your ground</h2>
              <p className="mt-1 text-sm text-faint">
                Pick decks for the run, or leave every deck unselected to duel across all due cards.
                The queue is your normal weak-first review queue — the arena never changes what is
                due.
              </p>
            </div>

            {decks.length ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Arena decks">
                {decks.map((d) => {
                  const active = selectedDeckIds.includes(d.id)
                  return (
                    <button
                      key={d.id}
                      type="button"
                      role="checkbox"
                      aria-checked={active}
                      data-testid={`arena-deck-${d.id}`}
                      onClick={() => toggleDeck(d.id)}
                      className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--ac-strong) focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg) ${
                        active
                          ? 'border-transparent bg-hub-accent/10 text-hub-accent ring-2 ring-(--ac-strong)'
                          : 'border-(--hub-border) text-secondary hover:bg-hub-accent/5'
                      }`}
                    >
                      {d.emoji ? `${d.emoji} ` : ''}
                      {d.name}
                      {typeof d.due === 'number' ? (
                        <span className="text-xs text-tertiary">{d.due} due</span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ) : (
              <Skeleton className="h-10 w-full" />
            )}

            <div>
              <p className="mb-2 text-sm font-medium">Run length</p>
              <ChipPicker
                label="Challenges per run"
                items={CHALLENGE_OPTIONS.map((n) => ({ value: n, label: `${n} challenges` }))}
                value={challengeCount}
                onChange={setChallengeCount}
              />
            </div>

            {loadError ? (
              <div data-testid="arena-load-error">
                <Callout tone="warning">{loadError}</Callout>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                data-testid="arena-start"
                onClick={() => void startSession()}
                disabled={phase === 'loading'}
              >
                <Swords className="mr-2 h-4 w-4" aria-hidden="true" />
                {phase === 'loading' ? 'Entering…' : 'Enter the arena'}
              </Button>
              <p className="text-xs text-faint">
                Grades land in the same review log as a normal session.
              </p>
            </div>
          </div>
        </Panel>
      ) : null}

      {phase === 'fighting' || phase === 'settling' ? (
        arena && currentCard && currentChallenge ? (
          <div className="flex flex-col gap-4" data-testid="arena-session">
            {/* HUD */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="arena-hud">
              <Panel className="p-3">
                <div className="flex items-center gap-2 text-xs text-faint">
                  <Heart className="h-3.5 w-3.5" aria-hidden="true" /> Your HP
                </div>
                <div className="mt-1 flex items-center gap-2" data-testid="arena-hp-bar">
                  <ProgressBar
                    value={arena.hp / Math.max(1, arena.maxHp)}
                    label="Your HP"
                    className="flex-1"
                  />
                  <span className="text-xs font-semibold" data-testid="arena-hp">
                    {arena.hp}/{arena.maxHp}
                  </span>
                </div>
              </Panel>
              <Panel className="p-3">
                <div className="flex items-center gap-2 text-xs text-faint">
                  <Shield className="h-3.5 w-3.5" aria-hidden="true" /> Shield
                </div>
                <div
                  className="mt-1 text-sm font-semibold text-secondary"
                  data-testid="arena-shield"
                >
                  {arena.shield > 0 ? `${arena.shield}/${arena.maxShield} charges` : 'down'}
                </div>
              </Panel>
              <Panel className="p-3">
                <div className="flex items-center gap-2 text-xs text-faint">
                  <Flame className="h-3.5 w-3.5" aria-hidden="true" /> Combo
                </div>
                <div
                  className="mt-1 text-sm font-semibold text-secondary"
                  data-testid="arena-combo"
                >
                  ×{arena.combo}
                </div>
              </Panel>
              <Panel className="p-3">
                <div className="flex items-center gap-2 text-xs text-faint">
                  <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> Score
                </div>
                <div
                  className="mt-1 text-sm font-semibold text-secondary"
                  data-testid="arena-score"
                >
                  {arena.score}
                </div>
              </Panel>
            </div>

            {/* Guardian — the remaining queue as a progress bar. */}
            <Panel className="p-3" data-testid="guardian-panel">
              <div className="flex items-center justify-between text-xs text-faint">
                <span>Guardian — the queue you are clearing</span>
                <span data-testid="guardian-progress-label">
                  Round {arena.round + 1} of {challenges.length}
                </span>
              </div>
              <div className="mt-2" data-testid="guardian-progress">
                <ProgressBar value={guardianProgress} label="Guardian progress" />
              </div>
            </Panel>

            {/* Last exchange feedback */}
            {lastExchange && !revealed ? (
              <div data-testid="arena-exchange-feedback">
                {lastExchange.counterTaken > 0 ? (
                  <Callout tone="danger">The guardian countered — that one slipped.</Callout>
                ) : lastExchange.counterShielded > 0 ? (
                  <Callout tone="cyan">Your shield absorbed the counter.</Callout>
                ) : lastExchange.crit ? (
                  <Callout tone="success">Critical strike — fast and sure.</Callout>
                ) : null}
              </div>
            ) : null}

            {/* Card */}
            <Panel className="p-6" data-testid="arena-card">
              <p className="whitespace-pre-wrap text-base" data-testid="arena-card-front">
                {currentChallenge.prompt}
              </p>
              {revealed ? (
                <p
                  className="mt-4 whitespace-pre-wrap border-t border-(--hub-border) pt-4 text-base text-faint"
                  data-testid="arena-card-back"
                >
                  {currentChallenge.answer}
                </p>
              ) : null}
            </Panel>

            {/* Controls */}
            {revealed ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ChipPicker
                    label="Confidence"
                    items={[
                      { value: 'unsure', label: 'Not sure' },
                      { value: 'sure', label: 'Sure' },
                    ]}
                    value={confident ? 'sure' : 'unsure'}
                    onChange={(v) => setConfident(v === 'sure')}
                  />
                  <span className="text-xs text-faint">
                    Confidence feeds hypercorrection tracking, same as the review queue.
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {GRADE_BUTTONS.map((g) => (
                    <Button
                      key={g.grade}
                      variant="secondary"
                      data-testid={`arena-grade-${g.grade}`}
                      onClick={() => grade(g.grade)}
                      disabled={phase === 'settling'}
                    >
                      {g.label}
                      {currentCard.previews?.[g.grade] ? (
                        <span className="ml-2 text-xs opacity-70">
                          {currentCard.previews[g.grade]}
                        </span>
                      ) : null}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <Button
                variant="secondary"
                data-testid="arena-reveal"
                onClick={() => {
                  setRevealed(true)
                  setShownAt(performance.now())
                }}
              >
                Show answer
              </Button>
            )}
          </div>
        ) : null
      ) : null}

      {phase === 'results' ? (
        <Panel data-testid="arena-results">
          <div className="flex flex-col gap-4 p-6">
            {settlement ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge
                    tone={settlement.summary.result === 'victory' ? 'success' : 'danger'}
                    data-testid="arena-result-badge"
                  >
                    {settlement.summary.result === 'victory' ? 'Victory' : 'Defeat'}
                  </Badge>
                  <h2 className="text-lg font-semibold">
                    {settlement.summary.correct}/{settlement.summary.rounds} correct ·{' '}
                    {Math.round(settlement.summary.accuracy * 100)}% accuracy
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Panel className="p-3">
                    <p className="text-xs text-faint">Score</p>
                    <p className="mt-1 text-lg font-semibold" data-testid="results-score">
                      {settlement.summary.score}
                    </p>
                  </Panel>
                  <Panel className="p-3">
                    <p className="text-xs text-faint">Best combo</p>
                    <p className="mt-1 text-lg font-semibold" data-testid="results-combo">
                      ×{settlement.summary.bestCombo}
                    </p>
                  </Panel>
                  <Panel className="p-3">
                    <p className="text-xs text-faint">XP earned</p>
                    <p className="mt-1 text-lg font-semibold" data-testid="results-xp">
                      {settlement.reviewXp + settlement.summary.xp} XP
                    </p>
                  </Panel>
                  <Panel className="p-3">
                    <p className="text-xs text-faint">Coins</p>
                    <p
                      className="mt-1 flex items-center gap-1 text-lg font-semibold"
                      data-testid="results-coins"
                    >
                      <Coins className="h-4 w-4" aria-hidden="true" />+{settlement.coinsAwarded}
                    </p>
                  </Panel>
                </div>
                {settlement.streak ? (
                  <p className="text-sm text-faint" data-testid="results-streak">
                    Streak: {settlement.streak.current} day
                    {settlement.streak.current === 1 ? '' : 's'}. Every card was scheduled by the
                    same FSRS engine as the review queue.
                  </p>
                ) : null}
              </>
            ) : (
              <EmptyState
                title="Settlement did not complete"
                description="The run finished locally but the grades were not recorded. Start a new run to review those cards — they are still due."
              />
            )}
            <div>
              <Button onClick={playAgain} data-testid="arena-play-again">
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Back to the gate
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}
    </main>
  )
}
