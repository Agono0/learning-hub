'use client'

/**
 * Competitive Leagues page: seasonal leagues with five divisions and
 * promotion/relegation, head-to-head duels, and seeded tournaments. All data
 * flows through /api/leagues (the shared leagues repository) via apiGet /
 * apiSend — never raw fetch.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  PageHeader,
  Panel,
  Tabs,
  TextArea,
  TextField,
} from '@/ui'
import { apiGet, apiSend } from '@/lib/transport'

// ── Types mirroring the /api/leagues payloads ────────────────────────────────

type LeagueRow = {
  id: number
  slug: string
  title: string
  seasonStart: string
  roundLengthDays: number
  currentRound: number
  season: number
  seasonLengthRounds: number
  promotionSlots: number
  relegationSlots: number
}

type PlayerRow = {
  handle: string
  tier: string
  points: number
  seasonPoints: number
  roundsWon: number
  duelsWon: number
  duelsLost: number
  elo: number
}

type PlayerProfile = {
  player: PlayerRow
  record: { wins: number; losses: number; draws: number }
  recentDuels: DuelRow[]
  eloHistory: {
    handle: string
    opponent: string
    result: 'win' | 'loss' | 'draw'
    eloBefore: number
    eloAfter: number
    createdAt: string
  }[]
  rank: number
}

type Division = {
  tier: string
  standings: { handle: string; points: number; seasonPoints: number }[]
}

type RoundRow = {
  round: number
  closedAt: string
  promotionsJson: { handle: string; from: string; to: string }[]
  relegationsJson: { handle: string; from: string; to: string }[]
  winnersJson: { tier: string; handle: string }[]
}

type DuelRow = {
  slug: string
  playerA: string
  playerB: string
  status: string
  winner: string | null
  promptsJson: { id: string; question: string; answers: string[] }[]
  createdAt: string
}

type TournamentRow = {
  slug: string
  title: string
  status: string
  champion: string | null
  seedsJson: string[]
  matchesJson: {
    round: number
    position: number
    playerA?: string
    playerB?: string
    winner?: string
  }[]
}

type Detail = {
  league: LeagueRow
  players: PlayerRow[]
  champion: string | null
  divisions: Division[]
  rounds: RoundRow[]
  duels: DuelRow[]
  tournaments: TournamentRow[]
}

type HeadToHead = {
  summary: {
    playerA: string
    playerB: string
    duels: number
    winsA: number
    winsB: number
    draws: number
    winRateA: number
    winRateB: number
    accuracyA: number
    accuracyB: number
    avgCorrectMsA: number
    avgCorrectMsB: number
    streakA: number
    streakB: number
    lastResult: 'A' | 'B' | 'draw' | null
    lastDuelAt: string | null
  }
  leader: { leader: string | null; edge: number; even: boolean }
  elo: { eloA: number; eloB: number; gap: number; higher: 'A' | 'B' | null }
  recentDuels: { duelId: string; winner: string | null; completedAt: string }[]
}

const TIER_TONE: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'cyan' | 'violet'> =
  {
    bronze: 'warning',
    silver: 'neutral',
    gold: 'success',
    platinum: 'cyan',
    diamond: 'violet',
  }

// ── Page ────────────────────────────────────────────────────────────────────

export default function LeaguesPage() {
  const [tab, setTab] = useState('overview')
  const [leagues, setLeagues] = useState<LeagueRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refreshList = useCallback(async () => {
    const res = await apiGet<{ ok: boolean; leagues: LeagueRow[] }>('/api/leagues?view=list')
    setLeagues(res.leagues)
    return res.leagues
  }, [])

  const refreshDetail = useCallback(async (slug: string) => {
    const res = await apiGet<{ ok: boolean } & Detail>(
      `/api/leagues?view=detail&slug=${encodeURIComponent(slug)}`,
    )
    setDetail(res)
  }, [])

  useEffect(() => {
    refreshList()
      .then((rows) => {
        if (rows.length > 0) {
          setSelected((cur) => cur ?? rows[0]!.slug)
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'failed to load leagues'))
  }, [refreshList])

  useEffect(() => {
    if (selected) {
      refreshDetail(selected).catch((err) =>
        setError(err instanceof Error ? err.message : 'failed to load league'),
      )
    }
  }, [selected, refreshDetail])

  async function act(body: Record<string, unknown>, okMessage: string) {
    setError(null)
    setNotice(null)
    try {
      await apiSend('/api/leagues', 'POST', body)
      setNotice(okMessage)
      await refreshList()
      if (selected) await refreshDetail(selected)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'action failed')
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leagues"
        subtitle="Seasonal competition: climb from bronze to diamond across weekly rounds, win duels for Elo, and take the tournament bracket."
      />
      {error && (
        <Callout tone="danger" title="Something went wrong">
          {error}
        </Callout>
      )}
      {notice && <Callout tone="success">{notice}</Callout>}
      <Tabs
        items={[
          { key: 'overview', label: 'Overview' },
          { key: 'standings', label: 'Standings' },
          { key: 'duels', label: 'Duels' },
          { key: 'tournaments', label: 'Tournaments' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'overview' && (
        <OverviewTab
          leagues={leagues}
          selected={selected}
          onSelect={(slug) => {
            setSelected(slug)
            setTab('standings')
          }}
          act={act}
        />
      )}
      {tab === 'standings' && (
        <StandingsTab
          detail={detail}
          leagues={leagues}
          selected={selected}
          onSelect={setSelected}
          act={act}
        />
      )}
      {tab === 'duels' && <DuelsTab detail={detail} selected={selected} act={act} />}
      {tab === 'tournaments' && <TournamentsTab detail={detail} selected={selected} act={act} />}
    </div>
  )
}

// ── Overview ────────────────────────────────────────────────────────────────

type ActFn = (body: Record<string, unknown>, okMessage: string) => Promise<void>

function OverviewTab({
  leagues,
  selected,
  onSelect,
  act,
}: {
  leagues: LeagueRow[]
  selected: string | null
  onSelect: (slug: string) => void
  act: ActFn
}) {
  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [roundDays, setRoundDays] = useState('7')
  const [joinHandle, setJoinHandle] = useState('')
  const [joinLeague, setJoinLeague] = useState('')

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <h2 className="mb-2 text-base font-semibold">Your leagues</h2>
        {leagues.length === 0 ? (
          <EmptyState title="No leagues yet">
            Create a season and invite study partners — everyone starts in bronze.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {leagues.map((l) => (
              <li key={l.slug}>
                <button
                  type="button"
                  data-testid={`league-card-${l.slug}`}
                  onClick={() => onSelect(l.slug)}
                  className={`w-full rounded-lg border p-3 text-left transition hover:border-accent ${
                    selected === l.slug
                      ? 'border-accent bg-accent/5'
                      : 'border-neutral-200 dark:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{l.title}</span>
                    <Badge tone="accent">round {l.currentRound}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {l.slug} · season from {l.seasonStart} · {l.roundLengthDays}-day rounds · ↑
                    {l.promotionSlots} ↓{l.relegationSlots}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="space-y-4">
        <Panel>
          <h2 className="mb-2 text-base font-semibold">Create a league</h2>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void act(
                {
                  action: 'create',
                  slug: slug.trim(),
                  title: title.trim(),
                  roundLengthDays: Number(roundDays) || 7,
                },
                `League ${slug.trim()} created.`,
              ).then(() => {
                setSlug('')
                setTitle('')
              })
            }}
          >
            <TextField
              label="League id"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              data-testid="create-league-slug"
            />
            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="create-league-title"
            />
            <TextField
              label="Round length (days)"
              value={roundDays}
              onChange={(e) => setRoundDays(e.target.value)}
              data-testid="create-league-days"
            />
            <Button
              type="submit"
              data-testid="create-league-submit"
              disabled={!slug.trim() || !title.trim()}
            >
              Create league
            </Button>
          </form>
        </Panel>
        <Panel>
          <h2 className="mb-2 text-base font-semibold">Join a league</h2>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void act(
                { action: 'join', slug: joinLeague.trim(), handle: joinHandle.trim() },
                `${joinHandle.trim()} joined ${joinLeague.trim()} in bronze.`,
              ).then(() => setJoinHandle(''))
            }}
          >
            <TextField
              label="League id"
              value={joinLeague}
              onChange={(e) => setJoinLeague(e.target.value)}
              data-testid="join-league-slug"
            />
            <TextField
              label="Your handle"
              value={joinHandle}
              onChange={(e) => setJoinHandle(e.target.value)}
              data-testid="join-league-handle"
            />
            <Button
              type="submit"
              data-testid="join-league-submit"
              disabled={!joinLeague.trim() || !joinHandle.trim()}
            >
              Join in bronze
            </Button>
          </form>
        </Panel>
        <TransferPanel leagues={leagues} selected={selected} act={act} />
      </div>
    </div>
  )
}

function TransferPanel({
  leagues,
  selected,
  act,
}: {
  leagues: LeagueRow[]
  selected: string | null
  act: ActFn
}) {
  const [exportSlug, setExportSlug] = useState('')
  const [exportJson, setExportJson] = useState('')
  const [importText, setImportText] = useState('')
  const [transferError, setTransferError] = useState<string | null>(null)

  const effectiveSlug = exportSlug || selected || leagues[0]?.slug || ''

  async function doExport() {
    setTransferError(null)
    setExportJson('')
    try {
      const res = await apiGet<{ ok: boolean; transfer: unknown }>(
        `/api/leagues?view=export&slug=${encodeURIComponent(effectiveSlug)}`,
      )
      setExportJson(JSON.stringify(res.transfer, null, 2))
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'export failed')
    }
  }

  return (
    <Panel>
      <h2 className="mb-2 text-base font-semibold">Export / import</h2>
      <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
        Move a league between devices as a portable, tamper-checked file — players, rounds, duels,
        tournaments, seasons and Elo history travel together. Import always creates a new league; it
        never overwrites an existing one.
      </p>
      {transferError && (
        <Callout tone="danger" title="Transfer failed">
          {transferError}
        </Callout>
      )}
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextField
              label="League id to export"
              value={exportSlug}
              onChange={(e) => setExportSlug(e.target.value)}
              placeholder={selected ?? ''}
              data-testid="export-league-slug"
            />
          </div>
          <Button
            type="button"
            data-testid="export-league-submit"
            disabled={!effectiveSlug.trim()}
            onClick={() => void doExport()}
          >
            Export
          </Button>
        </div>
        {exportJson && (
          <TextArea
            label="Exported transfer file (copy and save as .json)"
            value={exportJson}
            onChange={() => undefined}
            data-testid="export-league-json"
          />
        )}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            let parsed: unknown
            try {
              parsed = JSON.parse(importText)
            } catch {
              setTransferError('That is not valid JSON — paste the exported transfer file.')
              return
            }
            void act(
              { action: 'import', transfer: parsed },
              'League imported as a new league.',
            ).then(() => setImportText(''))
          }}
        >
          <TextArea
            label="Import a transfer file (paste its JSON)"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            data-testid="import-league-json"
          />
          <Button type="submit" data-testid="import-league-submit" disabled={!importText.trim()}>
            Import as new league
          </Button>
        </form>
      </div>
    </Panel>
  )
}

// ── Standings ───────────────────────────────────────────────────────────────

function StandingsTab({
  detail,
  leagues,
  selected,
  onSelect,
  act,
}: {
  detail: Detail | null
  leagues: LeagueRow[]
  selected: string | null
  onSelect: (slug: string) => void
  act: ActFn
}) {
  const [handle, setHandle] = useState('')
  const [reviews, setReviews] = useState('')
  const [focusMinutes, setFocusMinutes] = useState('')
  const [profileHandle, setProfileHandle] = useState<string | null>(null)

  if (!selected) {
    return (
      <EmptyState title="Pick a league">
        Create or select a league on the Overview tab first.
      </EmptyState>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {leagues.map((l) => (
          <Button
            key={l.slug}
            variant={l.slug === selected ? 'primary' : 'secondary'}
            onClick={() => onSelect(l.slug)}
            data-testid={`standings-picker-${l.slug}`}
          >
            {l.title}
          </Button>
        ))}
      </div>
      {detail && (
        <>
          <Panel>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {detail.league.title} — season {detail.league.season} · round{' '}
                {detail.league.currentRound} of {detail.league.seasonLengthRounds}
              </h2>
              {detail.champion && (
                <Badge tone="success" data-testid="champion-badge">
                  Leader: {detail.champion}
                </Badge>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {detail.divisions.map((d) => (
                <div
                  key={d.tier}
                  className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Badge tone={TIER_TONE[d.tier] ?? 'neutral'}>{d.tier}</Badge>
                    <span className="text-xs text-neutral-500">{d.standings.length} players</span>
                  </div>
                  {d.standings.length === 0 ? (
                    <p className="text-xs text-neutral-400">empty</p>
                  ) : (
                    <ol className="space-y-1" data-testid={`standings-${d.tier}`}>
                      {d.standings.map((s, i) => (
                        <li key={s.handle}>
                          <button
                            type="button"
                            data-testid={`standings-row-${s.handle}`}
                            onClick={() =>
                              setProfileHandle((cur) => (cur === s.handle ? null : s.handle))
                            }
                            className={`flex w-full justify-between rounded px-1 py-0.5 text-left text-sm transition hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                              profileHandle === s.handle ? 'bg-accent/10' : ''
                            }`}
                          >
                            <span>
                              {i + 1}. {s.handle}
                            </span>
                            <span className="text-neutral-500">
                              {s.points} <span className="text-xs">({s.seasonPoints} season)</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </Panel>
          {profileHandle && <PlayerProfilePanel slug={selected} handle={profileHandle} />}
          <HeadToHeadPanel detail={detail} selected={selected} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <h2 className="mb-2 text-base font-semibold">Log study points</h2>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  const body: Record<string, unknown> = {
                    action: 'points',
                    slug: selected,
                    handle: handle.trim(),
                  }
                  if (reviews.trim()) body.reviews = Number(reviews)
                  if (focusMinutes.trim()) body.focusMinutes = Number(focusMinutes)
                  void act(body, `Points logged for ${handle.trim()}.`).then(() => {
                    setReviews('')
                    setFocusMinutes('')
                  })
                }}
              >
                <TextField
                  label="Handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  data-testid="points-handle"
                />
                <TextField
                  label="Reviews done"
                  value={reviews}
                  onChange={(e) => setReviews(e.target.value)}
                  data-testid="points-reviews"
                />
                <TextField
                  label="Focus minutes"
                  value={focusMinutes}
                  onChange={(e) => setFocusMinutes(e.target.value)}
                  data-testid="points-focus"
                />
                <Button
                  type="submit"
                  data-testid="points-submit"
                  disabled={!handle.trim() || (!reviews.trim() && !focusMinutes.trim())}
                >
                  Award points
                </Button>
              </form>
            </Panel>
            <Panel>
              <h2 className="mb-2 text-base font-semibold">Round control</h2>
              <p className="mb-3 text-sm text-neutral-500">
                Closing a round promotes the top {detail.league.promotionSlots} scorers in each
                division (you must score to advance) and relegates the bottom{' '}
                {detail.league.relegationSlots}.
              </p>
              <Button
                variant="secondary"
                data-testid="close-round"
                onClick={() =>
                  void act(
                    { action: 'close-round', slug: selected },
                    `Round closed for ${selected}.`,
                  )
                }
              >
                Close round {detail.league.currentRound}
              </Button>
              {detail.rounds.length > 0 && (
                <ul className="mt-3 space-y-1" data-testid="round-history">
                  {detail.rounds.map((r) => (
                    <li key={r.round} className="text-sm text-neutral-600 dark:text-neutral-300">
                      Round {r.round} · {r.closedAt.slice(0, 10)} · ↑{r.promotionsJson.length} ↓
                      {r.relegationsJson.length}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}

// ── Player profile ──────────────────────────────────────────────────────────

function PlayerProfilePanel({ slug, handle }: { slug: string; handle: string }) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setProfile(null)
    setError(null)
    apiGet<{ ok: boolean; profile: PlayerProfile }>(
      `/api/leagues?view=player&slug=${encodeURIComponent(slug)}&handle=${encodeURIComponent(handle)}`,
    )
      .then((res) => setProfile(res.profile))
      .catch((err) => setError(err instanceof Error ? err.message : 'failed to load profile'))
  }, [slug, handle])

  if (error) {
    return (
      <Callout tone="danger" title="Profile failed to load">
        {error}
      </Callout>
    )
  }
  if (!profile) return null

  const { player, record, recentDuels, eloHistory, rank } = profile
  // newest-first history → oldest-first sparkline of eloAfter values
  const trajectory = [...eloHistory].reverse().map((e) => e.eloAfter)

  return (
    <Panel>
      <div data-testid="player-profile" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">{handle}</h2>
          <Badge tone={TIER_TONE[player.tier] ?? 'neutral'}>{player.tier}</Badge>
          <Badge tone="accent">rank #{rank}</Badge>
          <Badge tone="violet">elo {player.elo}</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">This round</p>
            <p className="text-lg font-semibold" data-testid="profile-points">
              {player.points}
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {player.seasonPoints} season · {player.roundsWon} rounds won
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Duels</p>
            <p className="text-lg font-semibold" data-testid="profile-record">
              {record.wins}W · {record.draws}D · {record.losses}L
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              accuracy first, speed breaks ties
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Elo trajectory</p>
            {trajectory.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No league duels yet.</p>
            ) : (
              <EloSparkline values={trajectory} start={1000} />
            )}
          </div>
        </div>
        {recentDuels.length > 0 && (
          <ul className="space-y-1" data-testid="profile-duels">
            {recentDuels.map((d) => (
              <li
                key={d.slug}
                className="flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-300"
              >
                <span>
                  {d.slug} — {d.playerA} vs {d.playerB}
                </span>
                <span>{d.winner === null ? 'draw' : d.winner === handle ? 'won' : 'lost'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}

/** Tiny inline SVG sparkline (no chart dependency) for the Elo trajectory. */
function EloSparkline({ values, start }: { values: number[]; start: number }) {
  const all = [start, ...values]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = Math.max(1, max - min)
  const w = 160
  const h = 36
  const points = all
    .map(
      (v, i) =>
        `${((i / Math.max(1, all.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`,
    )
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-9 w-full text-indigo-500"
      data-testid="profile-elo-sparkline"
      role="img"
      aria-label={`Elo trajectory ending at ${all[all.length - 1]}`}
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function HeadToHeadPanel({ detail, selected }: { detail: Detail; selected: string }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [result, setResult] = useState<HeadToHead | null>(null)
  const [h2hError, setH2hError] = useState<string | null>(null)

  async function compare() {
    setH2hError(null)
    setResult(null)
    try {
      const res = await apiGet<{ ok: boolean; headToHead: HeadToHead }>(
        `/api/leagues?view=h2h&slug=${encodeURIComponent(selected)}&a=${encodeURIComponent(
          a.trim(),
        )}&b=${encodeURIComponent(b.trim())}`,
      )
      setResult(res.headToHead)
    } catch (err) {
      setH2hError(err instanceof Error ? err.message : 'head-to-head failed')
    }
  }

  return (
    <Panel>
      <h2 className="mb-2 text-base font-semibold">Head-to-head</h2>
      <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
        The full rivalry record between two players: every duel they played, accuracy, speed,
        streaks and the Elo gap.
      </p>
      {h2hError && (
        <Callout tone="danger" title="Head-to-head failed">
          {h2hError}
        </Callout>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <TextField
            label="Player A"
            value={a}
            onChange={(e) => setA(e.target.value)}
            data-testid="h2h-a"
            list="h2h-players"
          />
        </div>
        <div className="w-40">
          <TextField
            label="Player B"
            value={b}
            onChange={(e) => setB(e.target.value)}
            data-testid="h2h-b"
            list="h2h-players"
          />
        </div>
        <datalist id="h2h-players">
          {detail.players.map((p) => (
            <option key={p.handle} value={p.handle} />
          ))}
        </datalist>
        <Button
          type="button"
          data-testid="h2h-submit"
          disabled={!a.trim() || !b.trim() || a.trim() === b.trim()}
          onClick={() => void compare()}
        >
          Compare
        </Button>
      </div>
      {result && (
        <div className="mt-3 space-y-2" data-testid="h2h-result">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">
              {result.summary.duels} duel{result.summary.duels === 1 ? '' : 's'}
            </Badge>
            <Badge tone={result.leader.even ? 'neutral' : 'success'}>
              {result.leader.leader
                ? `${result.leader.leader} leads by ${result.leader.edge}`
                : 'All square'}
            </Badge>
            <Badge tone="cyan">
              Elo {result.elo.eloA} vs {result.elo.eloB}
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(['A', 'B'] as const).map((side) => {
              const name = side === 'A' ? result.summary.playerA : result.summary.playerB
              const wins = side === 'A' ? result.summary.winsA : result.summary.winsB
              const acc = side === 'A' ? result.summary.accuracyA : result.summary.accuracyB
              const speed =
                side === 'A' ? result.summary.avgCorrectMsA : result.summary.avgCorrectMsB
              const streak = side === 'A' ? result.summary.streakA : result.summary.streakB
              return (
                <div
                  key={side}
                  className="rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)"
                  data-testid={`h2h-side-${side}`}
                >
                  <div className="font-medium">{name}</div>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {wins} wins · {(acc * 100).toFixed(0)}% accuracy · {speed}ms avg correct ·{' '}
                    streak {streak}
                  </p>
                </div>
              )
            })}
          </div>
          {result.recentDuels.length > 0 && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Recent:{' '}
              {result.recentDuels.map((d) => `${d.duelId} → ${d.winner ?? 'draw'}`).join(' · ')}
            </p>
          )}
        </div>
      )}
    </Panel>
  )
}

// ── Duels ───────────────────────────────────────────────────────────────────

function DuelsTab({
  detail,
  selected,
  act,
}: {
  detail: Detail | null
  selected: string | null
  act: ActFn
}) {
  const [duelSlug, setDuelSlug] = useState('')
  const [playerA, setPlayerA] = useState('')
  const [playerB, setPlayerB] = useState('')
  const [promptsText, setPromptsText] = useState('')
  const [deckId, setDeckId] = useState('')
  const [deckLimit, setDeckLimit] = useState('10')
  const [answerDuel, setAnswerDuel] = useState('')
  const [answerSide, setAnswerSide] = useState<'A' | 'B'>('A')
  const [answersText, setAnswersText] = useState('')

  const openDuels = useMemo(() => detail?.duels.filter((d) => d.status === 'open') ?? [], [detail])

  if (!selected) {
    return <EmptyState title="Pick a league">Duels live inside a league season.</EmptyState>
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <h2 className="mb-2 text-base font-semibold">Duels in {selected}</h2>
        {detail && detail.duels.length === 0 ? (
          <EmptyState title="No duels yet">
            Challenge a rival to a recall duel — accuracy first, speed breaks ties.
          </EmptyState>
        ) : (
          <ul className="space-y-2" data-testid="duel-list">
            {detail?.duels.map((d) => (
              <li
                key={d.slug}
                className="flex items-center justify-between rounded-lg border border-neutral-200 p-2 text-sm dark:border-neutral-700"
              >
                <span>
                  <span className="font-medium">{d.slug}</span> — {d.playerA} vs {d.playerB}
                </span>
                <Badge tone={d.status === 'open' ? 'accent' : d.winner ? 'success' : 'neutral'}>
                  {d.status === 'open' ? 'open' : d.winner ? `won by ${d.winner}` : 'draw'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="space-y-4">
        <Panel>
          <h2 className="mb-2 text-base font-semibold">New duel</h2>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              const body: Record<string, unknown> = {
                slug: duelSlug.trim(),
                leagueSlug: selected,
                playerA: playerA.trim(),
                playerB: playerB.trim(),
              }
              if (deckId.trim()) {
                body.action = 'duel-create-from-deck'
                body.deckId = Number(deckId)
                body.limit = Number(deckLimit) || 10
              } else {
                body.action = 'duel-create'
                body.prompts = promptsText
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => {
                    const [id, question, answers] = line.split('::')
                    return {
                      id: id ?? '',
                      question: question ?? '',
                      answers: (answers ?? '').split('|').filter(Boolean),
                    }
                  })
              }
              void act(body, `Duel ${duelSlug.trim()} created.`).then(() => {
                setDuelSlug('')
                setPromptsText('')
              })
            }}
          >
            <TextField
              label="Duel id"
              value={duelSlug}
              onChange={(e) => setDuelSlug(e.target.value)}
              data-testid="duel-slug"
            />
            <TextField
              label="Challenger"
              value={playerA}
              onChange={(e) => setPlayerA(e.target.value)}
              data-testid="duel-player-a"
            />
            <TextField
              label="Opponent"
              value={playerB}
              onChange={(e) => setPlayerB(e.target.value)}
              data-testid="duel-player-b"
            />
            <TextField
              label="Deck id (optional — build prompts from its cards)"
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
              data-testid="duel-deck-id"
            />
            {deckId.trim() ? (
              <TextField
                label="Prompt count"
                value={deckLimit}
                onChange={(e) => setDeckLimit(e.target.value)}
                data-testid="duel-deck-limit"
              />
            ) : (
              <TextField
                label={'Prompts — one per line: id::question::answer1|answer2'}
                value={promptsText}
                onChange={(e) => setPromptsText(e.target.value)}
                data-testid="duel-prompts"
              />
            )}
            <Button
              type="submit"
              data-testid="duel-create"
              disabled={
                !duelSlug.trim() ||
                !playerA.trim() ||
                !playerB.trim() ||
                (!deckId.trim() && !promptsText.trim())
              }
            >
              Create duel
            </Button>
          </form>
        </Panel>
        <Panel>
          <h2 className="mb-2 text-base font-semibold">Answer a duel</h2>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              const answers = answersText
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                  const [promptId, answer, ms] = line.split('::')
                  return {
                    promptId: promptId ?? '',
                    answer: answer ?? '',
                    elapsedMs: Number(ms) || 0,
                  }
                })
              void act(
                { action: 'duel-answer', slug: answerDuel.trim(), side: answerSide, answers },
                `Answers submitted for ${answerDuel.trim()}.`,
              ).then(() => setAnswersText(''))
            }}
          >
            <TextField
              label="Duel id"
              value={answerDuel}
              onChange={(e) => setAnswerDuel(e.target.value)}
              data-testid="answer-duel-slug"
            />
            <div className="flex gap-2" data-testid="answer-side">
              <Button
                type="button"
                variant={answerSide === 'A' ? 'primary' : 'secondary'}
                onClick={() => setAnswerSide('A')}
              >
                Side A
              </Button>
              <Button
                type="button"
                variant={answerSide === 'B' ? 'primary' : 'secondary'}
                onClick={() => setAnswerSide('B')}
              >
                Side B
              </Button>
            </div>
            <TextField
              label={'Answers — one per line: promptId::answer::milliseconds'}
              value={answersText}
              onChange={(e) => setAnswersText(e.target.value)}
              data-testid="answer-text"
            />
            <Button
              type="submit"
              data-testid="answer-submit"
              disabled={!answerDuel.trim() || !answersText.trim()}
            >
              Submit answers
            </Button>
          </form>
          {openDuels.length > 0 && (
            <p className="mt-2 text-xs text-neutral-500">
              Waiting: {openDuels.map((d) => d.slug).join(', ')}
            </p>
          )}
        </Panel>
      </div>
    </div>
  )
}

// ── Tournaments ─────────────────────────────────────────────────────────────

function TournamentsTab({
  detail,
  selected,
  act,
}: {
  detail: Detail | null
  selected: string | null
  act: ActFn
}) {
  const [tSlug, setTSlug] = useState('')
  const [tTitle, setTTitle] = useState('')
  const [seeds, setSeeds] = useState('')
  const [rSlug, setRSlug] = useState('')
  const [rRound, setRRound] = useState('')
  const [rPosition, setRPosition] = useState('')
  const [rWinner, setRWinner] = useState('')

  if (!selected) {
    return <EmptyState title="Pick a league">Tournaments are seeded from league rivals.</EmptyState>
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <h2 className="mb-2 text-base font-semibold">Tournaments in {selected}</h2>
        {detail && detail.tournaments.length === 0 ? (
          <EmptyState title="No tournaments yet">
            Seed a single-elimination bracket — byes advance automatically.
          </EmptyState>
        ) : (
          <ul className="space-y-3" data-testid="tournament-list">
            {detail?.tournaments.map((t) => (
              <li
                key={t.slug}
                className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{t.title}</span>
                  <Badge tone={t.status === 'open' ? 'accent' : 'success'}>
                    {t.status === 'open' ? 'open' : `champion: ${t.champion}`}
                  </Badge>
                </div>
                <div className="mt-2 space-y-1" data-testid={`bracket-${t.slug}`}>
                  {t.matchesJson.map((m) => (
                    <p key={`${m.round}-${m.position}`} className="text-xs text-neutral-500">
                      R{m.round} #{m.position}: {m.playerA ?? '…'} vs {m.playerB ?? '…'}
                      {m.winner ? ` → ${m.winner}` : ''}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="space-y-4">
        <Panel>
          <h2 className="mb-2 text-base font-semibold">New tournament</h2>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              const seedList = seeds
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
              void act(
                {
                  action: 'tournament-create',
                  slug: tSlug.trim(),
                  leagueSlug: selected,
                  title: tTitle.trim(),
                  seeds: seedList,
                },
                `Tournament ${tSlug.trim()} created.`,
              ).then(() => {
                setTSlug('')
                setTTitle('')
                setSeeds('')
              })
            }}
          >
            <TextField
              label="Tournament id"
              value={tSlug}
              onChange={(e) => setTSlug(e.target.value)}
              data-testid="tournament-slug"
            />
            <TextField
              label="Title"
              value={tTitle}
              onChange={(e) => setTTitle(e.target.value)}
              data-testid="tournament-title"
            />
            <TextField
              label="Seeds (comma-separated handles)"
              value={seeds}
              onChange={(e) => setSeeds(e.target.value)}
              data-testid="tournament-seeds"
            />
            <Button
              type="submit"
              data-testid="tournament-create"
              disabled={
                !tSlug.trim() ||
                !tTitle.trim() ||
                seeds.split(',').filter((s) => s.trim()).length < 2
              }
            >
              Create bracket
            </Button>
          </form>
        </Panel>
        <Panel>
          <h2 className="mb-2 text-base font-semibold">Record a match result</h2>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void act(
                {
                  action: 'tournament-result',
                  slug: rSlug.trim(),
                  round: Number(rRound),
                  position: Number(rPosition),
                  winner: rWinner.trim(),
                },
                `Result recorded in ${rSlug.trim()}.`,
              )
            }}
          >
            <TextField
              label="Tournament id"
              value={rSlug}
              onChange={(e) => setRSlug(e.target.value)}
              data-testid="result-slug"
            />
            <TextField
              label="Round"
              value={rRound}
              onChange={(e) => setRRound(e.target.value)}
              data-testid="result-round"
            />
            <TextField
              label="Position"
              value={rPosition}
              onChange={(e) => setRPosition(e.target.value)}
              data-testid="result-position"
            />
            <TextField
              label="Winner handle"
              value={rWinner}
              onChange={(e) => setRWinner(e.target.value)}
              data-testid="result-winner"
            />
            <Button
              type="submit"
              data-testid="result-submit"
              disabled={!rSlug.trim() || !rRound.trim() || !rPosition.trim() || !rWinner.trim()}
            >
              Record result
            </Button>
          </form>
        </Panel>
      </div>
    </div>
  )
}
