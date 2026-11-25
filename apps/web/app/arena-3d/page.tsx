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
  ARENA_MODIFIER_INFO,
  BOSS_CHALLENGE_THRESHOLD,
  BOSS_PHASE_INFO,
  GUARDIANS,
  applyGrade,
  arenaModifierForDate,
  buildArenaSummary,
  createArenaSession,
  guardianForRun,
  type ArenaChallenge,
  type ArenaConfig,
  type ArenaModifier,
  type ArenaState,
  type GuardianArchetype,
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
import { ArenaCoachMarks, ArenaCoachReopenButton } from '@/components/arena/ArenaCoachMarks'
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
  /** Server-issued run identity — settlement is bound to this run. */
  runId: string | null
  cards: ArenaCard[]
  limit: number
  /** True when this queue is a weak-card drill from a settled run. */
  drill?: boolean
  /** True when the rematch run had no weak cards — nothing to drill. */
  drillEmpty?: boolean
  config: ArenaConfig
  guardian: {
    archetype: GuardianArchetype
    name: string
    tagline: string
    boss: boolean
  }
  /** The daily rule twist this run was issued under (server-authoritative). */
  modifier?: { key: ArenaModifier; name: string; description: string } | null
}

interface ScheduleEntry {
  cardId: number
  due: string
  state: number
  reps: number
  xpEarned: number
}

interface SettlementResponse {
  ok: boolean
  schedule?: ScheduleEntry[]
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
  achievements: string[]
  streak: { current: number; best: number } | null
}

type Phase = 'setup' | 'loading' | 'fighting' | 'settling' | 'results'

interface ArenaStats {
  runs: number
  victories: number
  defeats: number
  winRate: number
  rounds: number
  correct: number
  accuracy: number
  bestCombo: number
  bestScore: number
  totalCoins: number
  totalXp: number
  winStreak: number
}

interface ArenaRunRow {
  id: number
  result: 'victory' | 'defeat'
  rounds: number
  correct: number
  bestCombo: number
  score: number
  coins: number
  xp: number
  createdAt: string
}

interface HistoryPayload {
  ok: boolean
  stats: ArenaStats
  runs: ArenaRunRow[]
  perDeck: Array<{
    deckId: number
    name: string
    emoji: string | null
    runs: number
    victories: number
    winRate: number
    rounds: number
    correct: number
    accuracy: number
    bestCombo: number
    bestScore: number
  }>
}

interface RunDetailPayload {
  ok: boolean
  run: ArenaRunRow
  settledAt: string | null
  rounds: Array<{
    round: number
    cardId: number
    grade: number
    confidence: number
    timeMs: number
  }>
  cards: Array<{ id: number; content: ArenaCard['content'] | null }>
}

const GRADE_BUTTONS: { grade: Grade; label: string }[] = [
  { grade: 1, label: 'Again' },
  { grade: 2, label: 'Hard' },
  { grade: 3, label: 'Good' },
  { grade: 4, label: 'Easy' },
]

const CHALLENGE_OPTIONS = ['5', '10', '15', '20'] as const
const DEFAULT_CHALLENGES = '10'

const GRADE_LABEL: Record<number, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }
const GRADE_TONE: Record<number, 'danger' | 'warning' | 'accent' | 'success'> = {
  1: 'danger',
  2: 'warning',
  3: 'accent',
  4: 'success',
}

const STATE_LABEL: Record<number, string> = {
  0: 'New',
  1: 'Learning',
  2: 'Review',
  3: 'Relearning',
}

/** Compact "in 5m / in 2d" style label for a due timestamp. */
function dueLabel(dueIso: string, nowMs: number): string {
  const diffMs = Date.parse(dueIso) - nowMs
  if (diffMs <= 0) return 'due now'
  const mins = Math.round(diffMs / 60_000)
  if (mins < 60) return `in ${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `in ${hours}h`
  const days = Math.round(hours / 24)
  return `in ${days}d`
}

// ─── Card text extraction (mirrors the review page's voice helpers) ─────────

function cardFront(card: ArenaCard): string {
  if (card.content.basic) return card.content.basic.front
  if (card.content.exercise?.prompt) return card.content.exercise.prompt
  if (card.content.typein?.question) return card.content.typein.question
  if (card.content.cloze?.text) return card.content.cloze.text
  if (card.content.mcq?.question) return card.content.mcq.question
  return 'Review item'
}

/** Front text from a raw content payload (run-detail view, cards may be gone). */
function contentFront(content: ArenaCard['content'] | null): string {
  if (!content) return 'Card removed from the collection'
  if (content.basic) return content.basic.front
  if (content.exercise?.prompt) return content.exercise.prompt
  if (content.typein?.question) return content.typein.question
  if (content.cloze?.text) return content.cloze.text
  if (content.mcq?.question) return content.mcq.question
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
  const [runId, setRunId] = useState<string | null>(null)
  const [settledRunId, setSettledRunId] = useState<string | null>(null)
  const [weakCount, setWeakCount] = useState(0)
  const [challenges, setChallenges] = useState<ArenaChallenge[]>([])
  const [arena, setArena] = useState<ArenaState | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [confident, setConfident] = useState(false)
  const [shownAt, setShownAt] = useState<number>(0)
  const [settlement, setSettlement] = useState<SettlementResponse | null>(null)
  const [floater, setFloater] = useState<{
    id: number
    text: string
    tone: 'strike' | 'crit' | 'counter' | 'shield'
  } | null>(null)
  const [record, setRecord] = useState<HistoryPayload | null>(null)
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null)
  const [runDetail, setRunDetail] = useState<RunDetailPayload | null>(null)
  const [runDetailLoading, setRunDetailLoading] = useState(false)
  const [guardian, setGuardian] = useState<SessionPayload['guardian'] | null>(null)
  const [coachForced, setCoachForced] = useState(false)
  const [modifier, setModifier] = useState<SessionPayload['modifier'] | null>(null)

  // The tuned config arrives with the session payload (guardian-specific).
  const [cfg, setCfg] = useState<ArenaConfig | null>(null)

  // Deck catalog for the setup picker.
  useEffect(() => {
    apiGet<{ decks: DeckInfo[] }>('/api/decks')
      .then((d) => setDecks(d.decks))
      .catch(() => setDecks([]))
  }, [])

  // Floaters are ephemeral combat feedback.
  useEffect(() => {
    if (!floater) return
    const t = setTimeout(() => setFloater(null), 1200)
    return () => clearTimeout(t)
  }, [floater])

  // Keyboard controls: Space/Enter reveals, 1-4 grade while revealed.
  // Guarded to the fighting phase so typing elsewhere is never hijacked.
  useEffect(() => {
    if (phase !== 'fighting') return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setRevealed(true)
        setShownAt(performance.now())
        return
      }
      if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        grade(Number(e.key) as Grade)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // No react-hooks plugin in this config — deps listed by hand.
  }, [phase, revealed, arena, cfg, challenges, confident, shownAt])

  // The record book refreshes every time the gate screen is (re)shown.
  useEffect(() => {
    if (phase !== 'setup') return
    apiGet<HistoryPayload>('/api/arena/history', { limit: 5 })
      .then(setRecord)
      .catch(() => setRecord(null))
  }, [phase])

  // Reduced-motion users never mount the canvas; the DOM HUD carries everything.
  const canvasEnabled = !reducedMotion

  // Setup-screen preview of the guardian this run will face. The server picks
  // by the same rule (guardianForRun over the run count), so what the gate
  // announces is what the duel gets.
  const guardianPreview = useMemo(() => {
    if (!record) return null
    const archetype = guardianForRun(record.stats.runs)
    return {
      name: GUARDIANS[archetype].name,
      tagline: GUARDIANS[archetype].tagline,
      boss: Number(challengeCount) >= BOSS_CHALLENGE_THRESHOLD,
    }
  }, [record, challengeCount])

  // Today's modifier preview: same deterministic daily rule the server
  // applies when it issues the run, so the gate announces the twist the
  // duel will actually get.
  const todayModifier = useMemo(
    () => ARENA_MODIFIER_INFO[arenaModifierForDate(new Date().toISOString().slice(0, 10))],
    [],
  )

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
      setRunId(payload.runId)
      setCfg(payload.config)
      setGuardian(payload.guardian)
      setModifier(payload.modifier ?? null)
      setArena(createArenaSession(nextChallenges, payload.config, payload.guardian.archetype))
      arenaHandle.current?.setArchetype(payload.guardian.archetype)
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
    const last = next.exchanges[next.exchanges.length - 1]

    // Boss phase transitions: banner floater + the scene heats up. The
    // floater wins over ordinary combat feedback — a phase flip is rarer
    // and matters more than one strike's numbers.
    if (arena && next.boss && next.phase > arena.phase) {
      const info = BOSS_PHASE_INFO[next.phase]
      setFloater({
        id: Date.now(),
        text: `Phase ${next.phase} — ${info.name}!`,
        tone: 'counter',
      })
    } else if (last) {
      if (last.dodged) {
        setFloater({
          id: Date.now(),
          text: 'Dodged — the strike lands half',
          tone: 'counter',
        })
      } else if (last.counterTaken > 0) {
        setFloater({
          id: Date.now(),
          text: `-${last.counterTaken} HP`,
          tone: 'counter',
        })
      } else if (last.counterShielded > 0) {
        setFloater({ id: Date.now(), text: 'Shield held', tone: 'shield' })
      } else if (lastGrade >= 3) {
        setFloater({
          id: Date.now(),
          text: last.crit ? `CRIT ${last.damage}` : `${last.damage}`,
          tone: last.crit ? 'crit' : 'strike',
        })
      }
    }

    if (!handle) return
    handle.setProgress(1 - next.guardianHp / Math.max(1, next.guardianMaxHp))
    if (next.boss) handle.setPhase(next.phase)
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
    if (next.enraged) handle.setEnraged(true)
    if (next.status === 'victory') handle.guardianDefeated()
    if (next.status === 'defeat') handle.playerDefeated()
  }

  function grade(grade: Grade): void {
    if (!arena || arena.status !== 'fighting' || !cfg) return
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
    if (!runId) {
      // No server-issued run — the session never started server-side, so
      // there is nothing to settle against. Do not invent a payload.
      toast({
        tone: 'danger',
        title: 'Settlement unavailable',
        description:
          'This run has no server session. Start a new arena run to record your reviews.',
      })
      setSettlement(null)
      setPhase('results')
      return
    }
    try {
      const weak = final.exchanges.filter((e) => e.grade <= 2).length
      const response = await apiSend<SettlementResponse>('/api/arena', 'POST', {
        runId,
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
      setSettledRunId(runId)
      setWeakCount(weak)
      if (response.achievements.length > 0) {
        toast({
          tone: 'success',
          title: `${response.achievements.length} badge${response.achievements.length > 1 ? 's' : ''} unlocked`,
          description: response.achievements.join(', '),
        })
      }
    } catch {
      toast({
        tone: 'danger',
        title: 'Settlement failed',
        description:
          'The settlement could not be completed. If this run was already settled, your grades are recorded; otherwise nothing was scheduled and you can retry from the arena.',
      })
      setSettlement(null)
    }
    setPhase('results')
  }

  async function startDrill(): Promise<void> {
    if (!settledRunId) return
    setPhase('loading')
    setLoadError(null)
    try {
      const payload = await apiGet<SessionPayload>(`/api/arena?rematch=${settledRunId}`)
      if (payload.drillEmpty || !payload.cards.length || !payload.runId) {
        setLoadError('No weak cards left from that run — nothing to drill.')
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
      setRunId(payload.runId)
      setCfg(payload.config)
      setGuardian(payload.guardian)
      setModifier(payload.modifier ?? null)
      setArena(createArenaSession(nextChallenges, payload.config, payload.guardian!.archetype))
      arenaHandle.current?.setArchetype(payload.guardian!.archetype)
      setRevealed(false)
      setConfident(false)
      setSettlement(null)
      setSettledRunId(null)
      setWeakCount(0)
      setPhase('fighting')
      setShownAt(performance.now())
      arenaHandle.current?.reset()
    } catch {
      setLoadError('The drill could not be started. Check the connection and try again.')
      setPhase('setup')
    }
  }

  function toggleRunDetail(runId: number): void {
    if (expandedRunId === runId) {
      setExpandedRunId(null)
      setRunDetail(null)
      return
    }
    setExpandedRunId(runId)
    setRunDetail(null)
    setRunDetailLoading(true)
    apiGet<RunDetailPayload>(`/api/arena/history/${runId}`)
      .then((payload) => setRunDetail(payload))
      .catch(() => setRunDetail(null))
      .finally(() => setRunDetailLoading(false))
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

            {guardianPreview ? (
              <div
                className="flex flex-wrap items-center gap-2 text-sm"
                data-testid="guardian-preview"
              >
                <Badge tone={guardianPreview.boss ? 'violet' : 'neutral'}>
                  {guardianPreview.name}
                </Badge>
                <span className="text-faint">{guardianPreview.tagline}</span>
              </div>
            ) : null}

            <div
              className="flex flex-wrap items-center gap-2 text-sm"
              data-testid="modifier-preview"
            >
              <Badge tone="cyan">
                {'\u2726'} {todayModifier.name}
              </Badge>
              <span className="text-faint">{todayModifier.description}</span>
            </div>

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
              <ArenaCoachReopenButton onOpen={() => setCoachForced(true)} />
            </div>
          </div>
        </Panel>
      ) : null}

      {phase === 'setup' ? (
        <ArenaCoachMarks forceOpen={coachForced} onClose={() => setCoachForced(false)} />
      ) : null}

      {(phase === 'setup' || phase === 'loading') && record && record.stats.runs > 0 ? (
        <Panel title="Your record" data-testid="arena-record">
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
            data-testid="arena-stats"
          >
            <div>
              <p className="text-xs text-faint">Runs</p>
              <p className="mt-0.5 text-base font-semibold" data-testid="record-runs">
                {record.stats.runs}
              </p>
            </div>
            <div>
              <p className="text-xs text-faint">Win rate</p>
              <p className="mt-0.5 text-base font-semibold" data-testid="record-winrate">
                {Math.round(record.stats.winRate * 100)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-faint">Accuracy</p>
              <p className="mt-0.5 text-base font-semibold" data-testid="record-accuracy">
                {Math.round(record.stats.accuracy * 100)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-faint">Best combo</p>
              <p className="mt-0.5 text-base font-semibold" data-testid="record-best-combo">
                ×{record.stats.bestCombo}
              </p>
            </div>
            <div>
              <p className="text-xs text-faint">Best score</p>
              <p className="mt-0.5 text-base font-semibold" data-testid="record-best-score">
                {record.stats.bestScore}
              </p>
            </div>
            <div>
              <p className="text-xs text-faint">Win streak</p>
              <p className="mt-0.5 text-base font-semibold" data-testid="record-win-streak">
                {record.stats.winStreak}
              </p>
            </div>
          </div>
          {record.perDeck && record.perDeck.length > 0 ? (
            <div className="mt-1" data-testid="arena-perdeck">
              <p className="mb-2 text-xs font-medium text-faint">By deck</p>
              <ul className="flex flex-col gap-1.5">
                {record.perDeck.map((deck) => (
                  <li
                    key={deck.deckId}
                    className="flex flex-wrap items-center gap-2 text-sm"
                    data-testid={`arena-perdeck-row-${deck.deckId}`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {deck.emoji ? `${deck.emoji} ` : ''}
                      {deck.name}
                    </span>
                    <span className="text-faint">{deck.runs} runs</span>
                    <span className="text-faint">{Math.round(deck.winRate * 100)}% win</span>
                    <span className="text-faint">{Math.round(deck.accuracy * 100)}% acc</span>
                    <span className="text-faint">combo ×{deck.bestCombo}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-faint">
                A run counts toward every deck it drew cards from.
              </p>
            </div>
          ) : null}
          <ul className="flex flex-col gap-1.5" data-testid="arena-recent-runs">
            {record.runs.map((run) => (
              <li key={run.id} data-testid="arena-run-row">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-2 text-left text-sm"
                  onClick={() => toggleRunDetail(run.id)}
                  aria-expanded={expandedRunId === run.id}
                  data-testid={`arena-run-toggle-${run.id}`}
                >
                  <Badge tone={run.result === 'victory' ? 'success' : 'danger'}>
                    {run.result === 'victory' ? 'Victory' : 'Defeat'}
                  </Badge>
                  <span>
                    {run.correct}/{run.rounds} correct
                  </span>
                  <span className="text-faint">combo ×{run.bestCombo}</span>
                  <span className="text-faint">score {run.score}</span>
                  <span className="ml-auto text-xs text-faint">
                    {new Date(run.createdAt).toLocaleDateString()}
                  </span>
                </button>
                {expandedRunId === run.id ? (
                  <div className="mt-1.5 pl-4" data-testid="arena-run-detail">
                    {runDetailLoading ? (
                      <p className="text-xs text-faint">Loading the round log…</p>
                    ) : runDetail && runDetail.rounds.length > 0 ? (
                      <ul className="flex flex-col gap-1">
                        {runDetail.rounds.map((round) => {
                          const entry = runDetail.cards.find((c) => c.id === round.cardId)
                          return (
                            <li
                              key={`${round.cardId}-${round.round}`}
                              className="flex flex-wrap items-center gap-2 text-xs"
                              data-testid="arena-run-detail-row"
                            >
                              <span className="w-8 text-faint">#{round.round}</span>
                              <span className="min-w-0 flex-1 truncate">
                                {contentFront(entry?.content ?? null)}
                              </span>
                              <Badge tone={GRADE_TONE[round.grade] ?? 'neutral'}>
                                {GRADE_LABEL[round.grade] ?? round.grade}
                              </Badge>
                              <span className="ml-auto text-faint">
                                {(round.timeMs / 1000).toFixed(1)}s
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="text-xs text-faint">No round log recorded for this run.</p>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
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
                <span className="flex flex-wrap items-center gap-2">
                  <span data-testid="guardian-name">{guardian?.name ?? 'Guardian'}</span>
                  {modifier ? (
                    <Badge tone="cyan" data-testid="guardian-modifier-badge">
                      {'\u2726'} {modifier.name}
                    </Badge>
                  ) : null}
                  {arena.boss ? (
                    <Badge tone="violet" data-testid="guardian-boss-badge">
                      Boss
                    </Badge>
                  ) : null}
                  {arena.boss && arena.phase > 1 ? (
                    <Badge
                      tone={arena.phase === 3 ? 'danger' : 'warning'}
                      data-testid="guardian-phase-badge"
                    >
                      Phase {arena.phase} · {BOSS_PHASE_INFO[arena.phase].name}
                    </Badge>
                  ) : null}
                  {arena.enraged ? (
                    <Badge tone="danger" data-testid="guardian-enraged-badge">
                      Enraged
                    </Badge>
                  ) : null}
                </span>
                <span data-testid="guardian-progress-label">
                  Round {arena.round + 1} of {challenges.length}
                </span>
              </div>
              <div className="mt-2" data-testid="guardian-progress">
                <ProgressBar value={guardianProgress} label="Guardian progress" />
              </div>
              <div className="relative h-5" aria-live="polite">
                {floater ? (
                  <span
                    key={floater.id}
                    className={`absolute right-0 text-sm font-bold ${
                      floater.tone === 'crit'
                        ? 'text-amber-500'
                        : floater.tone === 'counter'
                          ? 'text-rose-500'
                          : floater.tone === 'shield'
                            ? 'text-sky-500'
                            : 'text-emerald-500'
                    }`}
                    data-testid="arena-floater"
                  >
                    {floater.text}
                  </span>
                ) : null}
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
                {modifier ? (
                  <p className="text-sm text-faint" data-testid="results-modifier">
                    {'\u2726'} {modifier.name}: {modifier.description}
                  </p>
                ) : null}
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
                {settlement.achievements.length > 0 ? (
                  <div
                    className="flex flex-wrap items-center gap-2"
                    data-testid="results-achievements"
                  >
                    <span className="text-xs text-faint">Unlocked:</span>
                    {settlement.achievements.map((key) => (
                      <Badge key={key} tone="accent" data-testid={`achievement-${key}`}>
                        {key.replace(/^arena_/, '').replaceAll('_', ' ')}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {arena && arena.exchanges.length > 0 ? (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Round by round</h3>
                    <ul
                      className="flex max-h-64 flex-col gap-1.5 overflow-y-auto"
                      data-testid="results-recap"
                    >
                      {arena.exchanges.map((ex, i) => {
                        const card = cards.find((c) => c.id === ex.cardId)
                        const sched = settlement.schedule?.find((sc) => sc.cardId === ex.cardId)
                        return (
                          <li
                            key={`${ex.cardId}-${i}`}
                            className="flex flex-wrap items-center gap-2 text-sm"
                            data-testid="recap-row"
                          >
                            <span className="w-8 text-xs text-faint">#{i + 1}</span>
                            <span className="min-w-0 flex-1 truncate">
                              {card ? cardFront(card) : `Card ${ex.cardId}`}
                            </span>
                            <Badge tone={GRADE_TONE[ex.grade] ?? 'neutral'}>
                              {GRADE_LABEL[ex.grade] ?? ex.grade}
                            </Badge>
                            {ex.crit ? (
                              <Badge tone="warning" data-testid="recap-crit">
                                Crit
                              </Badge>
                            ) : null}
                            {ex.dodged ? (
                              <Badge tone="violet" data-testid="recap-dodged">
                                Dodged
                              </Badge>
                            ) : null}
                            {ex.armorBlocked > 0 ? (
                              <Badge tone="cyan" data-testid="recap-armor">
                                -{ex.armorBlocked} armor
                              </Badge>
                            ) : null}
                            {ex.counterTaken > 0 ? (
                              <span className="text-xs text-rose-500">-{ex.counterTaken} HP</span>
                            ) : null}
                            <span className="ml-auto text-xs text-faint">
                              +{ex.scoreDelta} · {(ex.timeMs / 1000).toFixed(1)}s
                            </span>
                            {sched ? (
                              <span
                                className="text-xs text-faint"
                                data-testid="recap-schedule"
                                title={`${STATE_LABEL[sched.state] ?? 'Review'} · rep ${sched.reps}`}
                              >
                                → {STATE_LABEL[sched.state] ?? 'Review'}{' '}
                                {dueLabel(sched.due, Date.now())}
                              </span>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                    {arena.exchanges.some((e) => e.grade <= 2) ? (
                      <p className="mt-2 text-xs text-faint" data-testid="results-restudy-hint">
                        Missed cards are already rescheduled by FSRS — the review queue will bring
                        them back at the right time.
                      </p>
                    ) : null}
                  </div>
                ) : null}

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
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={playAgain} data-testid="arena-play-again">
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Back to the gate
              </Button>
              {settlement && settledRunId && weakCount > 0 ? (
                <Button
                  variant="secondary"
                  onClick={() => void startDrill()}
                  data-testid="arena-drill-weak"
                >
                  <Swords className="mr-2 h-4 w-4" aria-hidden="true" />
                  Drill the {weakCount} weak card{weakCount === 1 ? '' : 's'}
                </Button>
              ) : null}
            </div>
          </div>
        </Panel>
      ) : null}
    </main>
  )
}
