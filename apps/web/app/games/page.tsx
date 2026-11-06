'use client'

/**
 * Games: matching pairs built with dnd-kit, Solo Boss Battles derived
 * from spaced repetition review log, and decentralized Gist friend leaderboard.
 *
 * CLIENT component — core imports via SUBPATHS only (never the barrel).
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  Brain,
  Check,
  Copy,
  Flame,
  Heart,
  PartyPopper,
  Plus,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  Swords,
  Timer,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react'
import { evaluateMatchingGame } from '@learning-hub/core/games'
import { BOSS_ROSTER, type BossProfile } from '@learning-hub/core/boss'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, Button, PageHeader, Panel, ProgressBar, Tabs, TextField } from '@/ui'

type GameTab = 'matching' | 'boss' | 'duels' | 'social'

interface DeckInfo {
  id: number
  name: string
  emoji: string | null
  total: number
  due: number
}
interface MatchingPair {
  cardId: number
  left: string
  right: string
}
interface GameData {
  pairs: MatchingPair[]
  lefts: MatchingPair[]
  rights: MatchingPair[]
}
interface GameResult {
  ok: boolean
  grade?: number
  accuracy?: number
  xp?: number
  streak?: { current: number; best: number }
  error?: string
}

interface BossBattleState {
  id: number
  bossKey: string
  bossName: string
  currentHp: number
  maxHp: number
  playerHp: number
  playerMaxHp: number
  status: 'active' | 'victory' | 'defeat'
  turnHistory: Array<{
    turn: number
    playerDamage: number
    bossDamage: number
    isCrit?: boolean
    description: string
  }>
}

interface FriendStatsData {
  v: number
  schema: string
  username: string
  streak: number
  weeklyXp: number
  totalReviews: number
  level: number
  updatedAt: string
}

interface SocialResponse {
  ok: boolean
  user: FriendStatsData
  friends: Array<{
    id: number
    alias: string
    gistUrl: string
    lastSyncedAt: string | null
    stats: FriendStatsData | null
  }>
}

export default function GamesPage() {
  const [activeTab, setActiveTab] = useState<GameTab>('matching')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Games & Challenges"
        subtitle="Turn memory review into rapid matching games, solo RPG boss battles, and decentralized friendly competition."
      />

      <Tabs<GameTab>
        label="Game modes"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'matching', label: 'Matching Pairs', icon: <Brain className="h-4 w-4" /> },
          { key: 'boss', label: 'Boss Battle', icon: <Swords className="h-4 w-4" /> },
          { key: 'duels', label: '1v1 Review Duels', icon: <Flame className="h-4 w-4" /> },
          { key: 'social', label: 'Friend Leaderboard', icon: <Users className="h-4 w-4" /> },
        ]}
      />

      {activeTab === 'matching' && <MatchingGameSection />}
      {activeTab === 'boss' && <BossBattleSection />}
      {activeTab === 'duels' && <DuelsArenaSection />}
      {activeTab === 'social' && <SocialLeaderboardSection />}
    </div>
  )
}

/* ========================================================================= */
/* Matching Pairs Game                                                       */
/* ========================================================================= */

function MatchingGameSection() {
  const qc = useQueryClient()
  const [deckId, setDeckId] = useState<number | null>(null)

  const decks = useQuery<{ decks: DeckInfo[] }>({
    queryKey: ['decks'],
    queryFn: () => apiGet<{ decks: DeckInfo[] }>('/api/decks'),
  })
  const game = useQuery<GameData>({
    queryKey: ['game', deckId],
    queryFn: () => apiGet<GameData>(`/api/games?deckId=${deckId}`),
    enabled: deckId !== null,
  })

  return (
    <div className="space-y-4">
      <Panel>
        <div className="label mb-2">Choose a deck to play its cards</div>
        <div className="flex flex-wrap gap-2">
          {(decks.data?.decks ?? []).map((d) => (
            <button
              key={d.id}
              onClick={() => setDeckId(d.id)}
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                deckId === d.id
                  ? 'border-indigo-500 bg-indigo-600/10 text-indigo-300 font-medium'
                  : 'border-neutral-200 text-neutral-600 dark:border-(--hub-border) dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-600'
              }`}
            >
              {d.emoji} {d.name}
            </button>
          ))}
        </div>
      </Panel>

      {deckId !== null && game.data?.pairs && (
        <MatchingBoard
          key={game.data.pairs.map((p) => p.cardId).join('-')}
          deckId={deckId}
          game={game.data}
          onPlayed={() => void qc.invalidateQueries({ queryKey: ['decks'] })}
        />
      )}
      {deckId !== null && game.data && game.data.pairs.length === 0 && (
        <Panel className="text-sm text-neutral-500">
          No playable (textual) cards in this deck — matching needs basic/cloze/mcq/typein cards.
        </Panel>
      )}
    </div>
  )
}

function MatchingBoard({
  deckId,
  game,
  onPlayed,
}: {
  deckId: number
  game: GameData
  onPlayed: () => void
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [matched, setMatched] = useState<Record<number, boolean>>({})
  const [misses, setMisses] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [posted, setPosted] = useState<GameResult | null>(null)
  const startedAt = useRef(Date.now())

  const done = Object.keys(matched).length === game.pairs.length && game.pairs.length > 0

  useEffect(() => {
    if (done) return
    const t = setInterval(
      () => setSeconds(Math.round((Date.now() - startedAt.current) / 1000)),
      500,
    )
    return () => clearInterval(t)
  }, [done])

  const submit = useMutation({
    mutationFn: async () => {
      const evaluation = evaluateMatchingGame({
        pairs: game.pairs.length,
        misses,
        timeMs: Date.now() - startedAt.current,
      })
      return apiSend<GameResult>('/api/games', 'POST', {
        deckId,
        correct: evaluation.pairs,
        total: evaluation.totalAttempts,
        misses: evaluation.misses,
        cardIds: game.pairs.map((p) => p.cardId),
        timeMs: Date.now() - startedAt.current,
      })
    },
    onSuccess: (data) => {
      setPosted(data)
      onPlayed()
    },
  })

  useEffect(() => {
    if (done && !posted && !submit.isPending) submit.mutate()
  }, [done])

  const onDragEnd = (e: DragEndEvent) => {
    const cardId = Number(e.active.id)
    const slotId = e.over?.id ? Number(e.over.id) : null
    if (slotId === cardId) setMatched((m) => ({ ...m, [cardId]: true }))
    else if (slotId !== null) setMisses((n) => n + 1)
  }

  const evaluation = evaluateMatchingGame({
    pairs: game.pairs.length,
    misses,
    timeMs: Date.now() - startedAt.current,
  })
  const score = evaluation.scorePct

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <Panel className="space-y-4">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1 text-neutral-400">
            <Timer className="h-4 w-4" /> {seconds}s
          </span>
          <span className="flex items-center gap-1 text-neutral-400">
            <Trophy className="h-4 w-4" /> {Object.keys(matched).length}/{game.pairs.length} matched
          </span>
          {misses > 0 && (
            <span className="text-red-400">
              {misses} miss{misses > 1 ? 'es' : ''}
            </span>
          )}
          <span className="ml-auto text-xs text-neutral-500">
            drag the answer chip onto its prompt
          </span>
        </div>

        {done ? (
          <div className="space-y-3 py-6 text-center">
            <PartyPopper className="mx-auto h-10 w-10 text-amber-400" />
            <div className="text-lg font-bold">
              Board cleared in {seconds}s — score {score}%
            </div>
            {posted?.ok && (
              <div className="text-sm text-neutral-400">
                graded as{' '}
                <span className="font-medium text-indigo-300">
                  {['', 'Again', 'Hard', 'Good', 'Easy'][posted.grade ?? 3]}
                </span>{' '}
                · +{posted.xp} XP · streak {posted.streak?.current}
              </div>
            )}
            <Button
              className="mx-auto"
              onClick={() => {
                setMatched({})
                setMisses(0)
                setPosted(null)
                setSeconds(0)
                startedAt.current = Date.now()
              }}
            >
              <RotateCcw className="h-4 w-4" /> Play again
            </Button>
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
                <Chip
                  key={`c-${pair.cardId}`}
                  pair={pair}
                  matched={Boolean(matched[pair.cardId])}
                />
              ))}
            </div>
          </div>
        )}
      </Panel>
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
            : 'border-neutral-200 text-neutral-700 dark:border-(--hub-border) dark:text-neutral-300'
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
          ? 'border-neutral-200 text-neutral-600 line-through opacity-40 dark:border-(--hub-border)'
          : isDragging
            ? 'z-10 border-indigo-400 bg-indigo-600/20 shadow-lg'
            : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-indigo-400 dark:border-(--hub-border) dark:bg-(--hub-sunken) dark:text-neutral-300'
      }`}
    >
      {pair.right}
    </div>
  )
}

/* ========================================================================= */
/* Solo Boss Battles Section                                                 */
/* ========================================================================= */

function BossBattleSection() {
  const qc = useQueryClient()
  const bossQuery = useQuery<{
    ok: boolean
    active: BossBattleState | null
    roster: BossProfile[]
  }>({
    queryKey: ['boss-battle'],
    queryFn: () => apiGet('/api/games/boss'),
  })

  const startMutation = useMutation({
    mutationFn: (bossKey: string) =>
      apiSend('/api/games/boss', 'POST', { action: 'start', bossKey }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['boss-battle'] })
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => apiSend('/api/games/boss', 'POST', { action: 'sync' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['boss-battle'] })
    },
  })

  const active = bossQuery.data?.active
  const roster = bossQuery.data?.roster ?? Object.values(BOSS_ROSTER)

  return (
    <div className="space-y-6">
      {active && (
        <Panel className="space-y-4 border-indigo-500/30">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-3xl">{BOSS_ROSTER[active.bossKey]?.avatar ?? '⚔️'}</span>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                    {active.bossName}
                  </h2>
                  <p className="text-xs text-neutral-500">
                    {BOSS_ROSTER[active.bossKey]?.title ?? 'Legendary Boss'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                tone={
                  active.status === 'victory'
                    ? 'success'
                    : active.status === 'defeat'
                      ? 'danger'
                      : 'neutral'
                }
              >
                {active.status.toUpperCase()}
              </Badge>
              {active.status === 'active' && (
                <Button
                  variant="primary"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`}
                  />
                  Sync Review Damage
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
              <div className="flex justify-between text-xs font-medium text-red-400">
                <span className="flex items-center gap-1">
                  <Swords className="h-3.5 w-3.5" /> Boss Health
                </span>
                <span>
                  {active.currentHp} / {active.maxHp} HP
                </span>
              </div>
              <ProgressBar
                value={Math.max(0, active.currentHp) / (active.maxHp || 1)}
                className="[&>div]:bg-red-500"
              />
            </div>

            <div className="space-y-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="flex justify-between text-xs font-medium text-emerald-400">
                <span className="flex items-center gap-1">
                  <Heart className="h-3.5 w-3.5" /> Your Health
                </span>
                <span>
                  {active.playerHp} / {active.playerMaxHp} HP
                </span>
              </div>
              <ProgressBar
                value={Math.max(0, active.playerHp) / (active.playerMaxHp || 1)}
                className="[&>div]:bg-emerald-500"
              />
            </div>
          </div>

          {active.status === 'active' ? (
            <p className="text-xs text-neutral-400">
              💡 Review cards normally in the Study tab. Correct answers (Good/Easy) deal damage and
              trigger critical strikes. Incorrect answers (Again) leave you open to boss
              counterattacks!
            </p>
          ) : active.status === 'victory' ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-amber-400" />
              <div className="mt-1 font-bold text-amber-300">
                Victory! You vanquished {active.bossName}!
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                Your spaced repetition mastery prevailed against the forces of forgetting.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center">
              <Shield className="mx-auto h-8 w-8 text-red-400" />
              <div className="mt-1 font-bold text-red-300">Defeat! You were overwhelmed!</div>
              <p className="text-xs text-neutral-400 mt-1">
                Review your weak cards and challenge the boss again.
              </p>
            </div>
          )}

          {active.turnHistory && active.turnHistory.length > 0 && (
            <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-(--hub-border)">
              <div className="label">Recent Combat Turns</div>
              <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1 text-xs text-neutral-400">
                {active.turnHistory
                  .slice(-5)
                  .reverse()
                  .map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded bg-neutral-100 p-2 dark:bg-(--hub-panel)"
                    >
                      <span>
                        Turn {t.turn}: {t.description}
                      </span>
                      <span className="font-mono text-emerald-400">
                        -{t.playerDamage} HP {t.isCrit ? '💥 CRIT' : ''}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </Panel>
      )}

      <div>
        <h3 className="mb-3 text-lg font-bold tracking-tight">
          {active?.status === 'active' ? 'Boss Roster' : 'Choose Your Boss Challenge'}
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {roster.map((boss) => (
            <Panel key={boss.key} className="flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{boss.avatar}</span>
                  <div>
                    <div className="font-bold">{boss.name}</div>
                    <div className="text-xs text-neutral-500">{boss.title}</div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-neutral-400 leading-relaxed">{boss.description}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
                  <span>
                    HP: <strong className="text-red-400">{boss.maxHp}</strong>
                  </span>
                  <span>
                    XP: <strong className="text-amber-400">+{boss.rewardXp}</strong>
                  </span>
                </div>
              </div>

              <Button
                variant={
                  active?.bossKey === boss.key && active.status === 'active' ? 'ghost' : 'primary'
                }
                disabled={
                  startMutation.isPending ||
                  (active?.bossKey === boss.key && active.status === 'active')
                }
                onClick={() => startMutation.mutate(boss.key)}
              >
                {active?.bossKey === boss.key && active.status === 'active'
                  ? 'Currently Fighting'
                  : 'Challenge Boss'}
              </Button>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ========================================================================= */
/* Decentralized Gist Friends Leaderboard                                    */
/* ========================================================================= */

function SocialLeaderboardSection() {
  const qc = useQueryClient()
  const [alias, setAlias] = useState('')
  const [gistUrl, setGistUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const socialQuery = useQuery<SocialResponse>({
    queryKey: ['social-leaderboard'],
    queryFn: () => apiGet('/api/social/leaderboard'),
  })

  const addFriendMutation = useMutation({
    mutationFn: (data: { alias: string; gistUrl: string }) =>
      apiSend('/api/social/leaderboard', 'POST', data),
    onSuccess: () => {
      setAlias('')
      setGistUrl('')
      void qc.invalidateQueries({ queryKey: ['social-leaderboard'] })
    },
  })

  const deleteFriendMutation = useMutation({
    mutationFn: (id: number) => apiSend(`/api/social/leaderboard?id=${id}`, 'DELETE'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['social-leaderboard'] })
    },
  })

  const syncFriendsMutation = useMutation({
    mutationFn: () =>
      apiSend<{ ok: boolean; synced: number; failed: { alias: string; reason: string }[] }>(
        '/api/social/leaderboard/sync',
        'POST',
        {},
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['social-leaderboard'] })
    },
  })

  const userStats = socialQuery.data?.user
  const friends = socialQuery.data?.friends ?? []
  const syncFailed = syncFriendsMutation.data?.failed ?? []

  // Combine user stats + friend stats for ranking
  const leaderboardEntries = [
    {
      id: 0,
      name: 'You',
      isSelf: true,
      xp: userStats?.weeklyXp ?? 0,
      streak: userStats?.streak ?? 0,
      reviews: userStats?.totalReviews ?? 0,
      level: userStats?.level ?? 1,
    },
    ...friends.map((f) => ({
      id: f.id,
      name: f.alias,
      isSelf: false,
      xp: f.stats?.weeklyXp ?? 0,
      streak: f.stats?.streak ?? 0,
      reviews: f.stats?.totalReviews ?? 0,
      level: f.stats?.level ?? 1,
    })),
  ].sort((a, b) => b.xp - a.xp)

  const handleCopyStats = () => {
    if (!userStats) return
    void navigator.clipboard.writeText(JSON.stringify(userStats, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* User Stats Card */}
      <Panel className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-bold text-neutral-900 dark:text-neutral-100">
              Decentralized Friends & Gist Sync
            </h3>
            <p className="text-xs text-neutral-500">
              No central server required. Share your signed study stats envelope via a GitHub Gist
              URL with friends.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleCopyStats} disabled={!userStats}>
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? 'Copied Stats JSON!' : 'Copy Gist Payload'}
            </Button>
            <Button
              variant="ghost"
              disabled={syncFriendsMutation.isPending || friends.length === 0}
              onClick={() => syncFriendsMutation.mutate()}
              title="Fetch each friend's gist and refresh their stats"
            >
              {syncFriendsMutation.isPending ? 'Syncing…' : 'Sync now'}
            </Button>
          </div>
        </div>

        {userStats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-neutral-100 p-3 dark:bg-(--hub-panel)">
              <div className="label">Weekly XP</div>
              <div className="text-xl font-bold text-amber-400">{userStats.weeklyXp}</div>
            </div>
            <div className="rounded-lg bg-neutral-100 p-3 dark:bg-(--hub-panel)">
              <div className="label">Current Streak</div>
              <div className="text-xl font-bold text-orange-400 flex items-center gap-1">
                <Flame className="h-4 w-4" /> {userStats.streak}d
              </div>
            </div>
            <div className="rounded-lg bg-neutral-100 p-3 dark:bg-(--hub-panel)">
              <div className="label">Cards Reviewed</div>
              <div className="text-xl font-bold text-indigo-400">{userStats.totalReviews}</div>
            </div>
            <div className="rounded-lg bg-neutral-100 p-3 dark:bg-(--hub-panel)">
              <div className="label">Learner Level</div>
              <div className="text-xl font-bold text-emerald-400">Lv. {userStats.level}</div>
            </div>
          </div>
        )}
      </Panel>

      {/* Add Friend Form */}
      <Panel className="space-y-3">
        <h4 className="font-bold text-sm">Add a Friend via Gist</h4>
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!alias.trim() || !gistUrl.trim()) return
            addFriendMutation.mutate({ alias: alias.trim(), gistUrl: gistUrl.trim() })
          }}
        >
          <TextField
            label="Friend Alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="e.g. Alice"
          />
          <TextField
            label="Raw Gist / JSON URL"
            value={gistUrl}
            onChange={(e) => setGistUrl(e.target.value)}
            placeholder="https://gist.githubusercontent.com/.../raw"
          />
          <div className="flex items-end">
            <Button
              variant="primary"
              className="w-full"
              disabled={!alias.trim() || !gistUrl.trim() || addFriendMutation.isPending}
            >
              <Plus className="h-4 w-4" /> Add Friend
            </Button>
          </div>
        </form>
      </Panel>

      {/* Leaderboard Table */}
      <Panel className="space-y-3">
        <h4 className="font-bold text-sm">Friends Leaderboard</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs text-neutral-500 dark:border-(--hub-border)">
                <th className="pb-2 font-medium">Rank</th>
                <th className="pb-2 font-medium">Learner</th>
                <th className="pb-2 font-medium">Streak</th>
                <th className="pb-2 font-medium">Reviews</th>
                <th className="pb-2 font-medium">XP</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-(--hub-border)">
              {leaderboardEntries.map((entry, idx) => (
                <tr
                  key={entry.id + entry.name}
                  className={entry.isSelf ? 'bg-indigo-500/5 font-medium' : ''}
                >
                  <td className="py-2.5">
                    {idx === 0 ? (
                      <span className="text-amber-400 font-bold">🥇 1</span>
                    ) : idx === 1 ? (
                      <span className="text-neutral-400 font-bold">🥈 2</span>
                    ) : idx === 2 ? (
                      <span className="text-amber-700 font-bold">🥉 3</span>
                    ) : (
                      <span className="text-neutral-500">#{idx + 1}</span>
                    )}
                  </td>
                  <td className="py-2.5 flex items-center gap-1.5">
                    <span>{entry.name}</span>
                    {entry.isSelf && <Badge tone="accent">You</Badge>}
                  </td>
                  <td className="py-2.5 text-neutral-400">{entry.streak}d</td>
                  <td className="py-2.5 text-neutral-400">{entry.reviews}</td>
                  <td className="py-2.5 font-bold text-amber-400">{entry.xp} XP</td>
                  <td className="py-2.5 text-right">
                    {!entry.isSelf && (
                      <button
                        title="Remove friend"
                        onClick={() => deleteFriendMutation.mutate(entry.id)}
                        className="text-neutral-500 hover:text-red-400 transition-colors p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {syncFailed.length > 0 && (
                <p className="px-1 text-[11px] text-amber-500">
                  Could not sync: {syncFailed.map((f) => `${f.alias} (${f.reason})`).join(', ')}
                </p>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

/* ========================================================================= */
/* 4. 1v1 Review Duels Arena                                                 */
/* ========================================================================= */

interface DuelRecord {
  id: number
  player1Alias: string
  player2Alias: string
  winnerAlias: string | null
  player1Score: number
  player2Score: number
  completedAt: string
}

function DuelsArenaSection() {
  const qc = useQueryClient()
  const [inMatch, setInMatch] = useState(false)
  const [round, setRound] = useState(1)
  const [playerScore, setPlayerScore] = useState(0)
  const [botScore, setBotScore] = useState(0)
  const [matchDone, setMatchDone] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)
  const [eloDelta, setEloDelta] = useState<number | null>(null)

  // Current round question
  const SAMPLE_DUEL_PROMPTS = [
    {
      q: 'Primary excitatory neurotransmitter in the mammalian brain?',
      a: 'Glutamate',
      options: ['GABA', 'Glutamate', 'Serotonin', 'Dopamine'],
    },
    {
      q: 'What is the powerhouse organelle of the eukaryotic cell?',
      a: 'Mitochondria',
      options: ['Ribosome', 'Mitochondria', 'Golgi', 'Nucleus'],
    },
    {
      q: 'Spaced repetition algorithm optimized by Learning HUB?',
      a: 'FSRS-6',
      options: ['SM-2', 'FSRS-6', 'Anki-Classic', 'Leitner'],
    },
    {
      q: 'Loss function used to optimize binary classification in ML?',
      a: 'Binary Cross-Entropy',
      options: ['Mean Squared Error', 'Binary Cross-Entropy', 'Hinge Loss', 'Huber Loss'],
    },
    {
      q: 'Brain structure essential for memory consolidation and spatial navigation?',
      a: 'Hippocampus',
      options: ['Amygdala', 'Hippocampus', 'Cerebellum', 'Thalamus'],
    },
  ]

  const currentPrompt = SAMPLE_DUEL_PROMPTS[(round - 1) % SAMPLE_DUEL_PROMPTS.length]!

  const duelsQuery = useQuery<{ ok: boolean; duels: DuelRecord[] }>({
    queryKey: ['duels-recent'],
    queryFn: () => apiGet<{ ok: boolean; duels: DuelRecord[] }>('/api/social/duels'),
  })

  const submitDuelMutation = useMutation({
    mutationFn: (data: {
      player1Alias: string
      player2Alias: string
      winnerAlias?: string
      player1Score: number
      player2Score: number
    }) => apiSend('/api/social/duels', 'POST', data),
    onSuccess: (data: any) => {
      if (data.ok && data.eloUpdates) {
        setEloDelta(data.eloUpdates.player1.next - data.eloUpdates.player1.previous)
      }
      void qc.invalidateQueries({ queryKey: ['duels-recent'] })
    },
  })

  const startNewDuel = () => {
    setInMatch(true)
    setRound(1)
    setPlayerScore(0)
    setBotScore(0)
    setMatchDone(false)
    setWinner(null)
    setEloDelta(null)
  }

  const handlePickOption = (option: string) => {
    const isCorrect = option === currentPrompt.a
    const pts = isCorrect ? 130 : 0
    const newPlayerScore = playerScore + pts

    // Simulated opponent answer (70% accuracy)
    const botCorrect = Math.random() < 0.75
    const botPts = botCorrect ? Math.floor(100 + Math.random() * 40) : 0
    const newBotScore = botScore + botPts

    setPlayerScore(newPlayerScore)
    setBotScore(newBotScore)

    if (round >= 5) {
      setInMatch(false)
      setMatchDone(true)
      const matchWinner =
        newPlayerScore > newBotScore
          ? 'You'
          : newPlayerScore < newBotScore
            ? 'Ada Lovelace (Bot)'
            : 'Tie'
      setWinner(matchWinner)

      submitDuelMutation.mutate({
        player1Alias: 'You',
        player2Alias: 'Ada Lovelace (Bot)',
        winnerAlias: matchWinner === 'Tie' ? undefined : matchWinner,
        player1Score: newPlayerScore,
        player2Score: newBotScore,
      })
    } else {
      setRound((r) => r + 1)
    }
  }

  const recentDuels = duelsQuery.data?.duels ?? []

  return (
    <div className="space-y-6">
      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">1v1 Rapid-Recall Arena</h2>
            <p className="text-xs text-neutral-400">
              Engage in fast 5-round recall duels. Correct answers earn points, with instant speed
              bonuses for rapid responses.
            </p>
          </div>
          {!inMatch && (
            <Button onClick={startNewDuel}>
              <Flame className="h-4 w-4 text-amber-400" /> Start 1v1 Duel
            </Button>
          )}
        </div>

        {/* Active Duel Arena */}
        {inMatch && (
          <div className="rounded-xl border border-indigo-500/40 bg-indigo-950/20 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-indigo-400">
                Round {round} of 5
              </span>
              <div className="flex items-center gap-4 text-sm font-bold">
                <span className="text-emerald-400">You: {playerScore}</span>
                <span className="text-neutral-500">vs</span>
                <span className="text-rose-400">Ada (Bot): {botScore}</span>
              </div>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 space-y-3">
              <div className="text-base font-medium text-neutral-100">{currentPrompt.q}</div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                {currentPrompt.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handlePickOption(opt)}
                    className="rounded-lg border border-neutral-700/80 bg-neutral-800/80 p-3 text-left text-xs font-medium text-neutral-200 hover:border-indigo-500 hover:bg-indigo-600/20 transition-all"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Duel Result Celebration */}
        {matchDone && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-5 text-center space-y-3">
            <div className="text-2xl font-bold flex items-center justify-center gap-2">
              <Trophy className="h-7 w-7 text-amber-400" />
              <span>{winner === 'You' ? 'Victory!' : winner === 'Tie' ? 'Draw!' : 'Defeat!'}</span>
            </div>
            <p className="text-xs text-neutral-300">
              Final score: <strong className="text-emerald-400">{playerScore}</strong> vs{' '}
              <strong className="text-rose-400">{botScore}</strong>
            </p>
            {eloDelta !== null && (
              <Badge tone={eloDelta >= 0 ? 'success' : 'neutral'}>
                {eloDelta >= 0 ? `+${eloDelta}` : eloDelta} Elo Rating
              </Badge>
            )}
            <div className="pt-2">
              <Button onClick={startNewDuel}>Rematch</Button>
            </div>
          </div>
        )}

        {/* Match History Table */}
        <div className="pt-2 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Recent Match History ({recentDuels.length})
          </h3>
          {recentDuels.length === 0 ? (
            <div className="rounded-lg border border-neutral-800 p-6 text-center text-xs text-neutral-500">
              No recent duels recorded. Start a 1v1 duel above to test your recall speed.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500">
                    <th className="pb-2 font-medium">Match</th>
                    <th className="pb-2 font-medium">Score</th>
                    <th className="pb-2 font-medium">Winner</th>
                    <th className="pb-2 font-medium text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {recentDuels.map((d) => (
                    <tr key={d.id} className="py-2.5">
                      <td className="py-2.5 font-medium">
                        {d.player1Alias} vs {d.player2Alias}
                      </td>
                      <td className="py-2.5 text-neutral-400 font-mono">
                        {d.player1Score} - {d.player2Score}
                      </td>
                      <td className="py-2.5">
                        <Badge tone={d.winnerAlias === 'You' ? 'success' : 'neutral'}>
                          {d.winnerAlias ?? 'Draw'}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right text-neutral-500">
                        {new Date(d.completedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}
