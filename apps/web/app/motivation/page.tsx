'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Award,
  Check,
  CheckCircle2,
  Flame,
  Lock,
  ScrollText,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react'
import { isFreshStartMoment } from '@learning-hub/core/src/motivation'
import { apiGet, apiSend } from '@/lib/transport'
import { PageHeader } from '@/ui'

interface StreakResponse {
  streak: {
    current: number
    best: number
    lastActiveDate: string | null
    freezes: number
    weekendAmulet: boolean
  }
  xp: { total: number; level: number; progress: number; xpForNextLevel: number }
  freshStart: { fresh: boolean; reason: string | null }
  todayDone: boolean
}

interface QuestResponse {
  date: string
  items: { type: string; label: string; target: number; progress: number; done: boolean }[]
  allDone: boolean
  completed: boolean
  xpReward: number
}

interface Goal {
  id: number
  wish: string
  outcome: string | null
  obstacle: string | null
  ifThenPlan: string | null
  ifCondition: string | null
  thenAction: string | null
  status: string
  progressPct: number
  dueDate: string | null
}

interface AchievementRow {
  key: string
  title: string
  description: string
  unlocked: boolean
  unlockedAt: string | null
}

interface Commitment {
  id: number
  title: string
  metric: string
  threshold: number
  stakes: string | null
  status: string
}
interface CommitmentReport {
  commitments: Commitment[]
  report: {
    commitment: Commitment
    value: number
    threshold: number
    met: boolean
    week: { start: string; end: string }
  }[]
}

const freshStartCopy: Record<string, string> = {
  'new-week': 'New week — research says fresh starts stick on Mondays. Pick one quest and begin.',
  'new-month': 'New month, clean slate. Set a WOOP goal for the next 30 days.',
  'new-year': 'New year. The best moment to start was today, hour one.',
}

export default function MotivationPage() {
  const qc = useQueryClient()
  const [goalForm, setGoalForm] = useState({
    wish: '',
    outcome: '',
    obstacle: '',
    ifThenPlan: '',
    ifCondition: '',
    thenAction: '',
    dueDate: '',
  })
  const [goalError, setGoalError] = useState<string | null>(null)
  const [commitForm, setCommitForm] = useState({
    title: '',
    metric: 'reviews',
    threshold: 50,
    stakes: '',
  })

  // minutes to ADD to local time to get UTC — the API's tzOffset semantics
  const tz = new Date().getTimezoneOffset()
  const status = useQuery({
    queryKey: ['streaks'],
    queryFn: () => apiGet<StreakResponse>('/api/streaks'),
  })
  const quests = useQuery({
    queryKey: ['quests'],
    queryFn: () => apiGet<QuestResponse>(`/api/quests?tzOffset=${tz}`),
  })
  const goals = useQuery({
    queryKey: ['goals'],
    queryFn: () => apiGet<{ goals: Goal[] }>('/api/goals'),
  })
  const achievements = useQuery({
    queryKey: ['achievements'],
    queryFn: () => apiGet<{ catalog: AchievementRow[] }>('/api/achievements'),
  })
  const commitments = useQuery({
    queryKey: ['commitments'],
    queryFn: () => apiGet<CommitmentReport>(`/api/commitments?tzOffset=${tz}`),
  })

  const logActivity = useMutation({
    mutationFn: () => apiSend('/api/streaks', 'POST'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['streaks'] })
      void qc.invalidateQueries({ queryKey: ['quests'] })
    },
  })

  const completeQuest = useMutation({
    mutationFn: (index: number) =>
      apiSend('/api/quests', 'POST', { index, tzOffset: new Date().getTimezoneOffset() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['quests'] })
      void qc.invalidateQueries({ queryKey: ['streaks'] })
    },
  })

  const createGoal = useMutation({
    mutationFn: () => apiSend('/api/goals', 'POST', goalForm),
    onSuccess: () => {
      setGoalForm({
        wish: '',
        outcome: '',
        obstacle: '',
        ifThenPlan: '',
        ifCondition: '',
        thenAction: '',
        dueDate: '',
      })
      setGoalError(null)
      void qc.invalidateQueries({ queryKey: ['goals'] })
    },
    onError: (e) => setGoalError(e instanceof Error ? e.message : 'Could not save goal'),
  })

  const updateGoal = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiSend(`/api/goals/${id}`, 'PATCH', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['goals'] }),
  })
  const deleteGoal = useMutation({
    mutationFn: (id: number) => apiSend(`/api/goals/${id}`, 'DELETE'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['goals'] }),
  })

  const createCommitment = useMutation({
    mutationFn: () => apiSend('/api/commitments', 'POST', commitForm),
    onSuccess: () => {
      setCommitForm({ title: '', metric: 'reviews', threshold: 50, stakes: '' })
      void qc.invalidateQueries({ queryKey: ['commitments'] })
    },
  })

  const fresh = isFreshStartMoment(new Date())
  const unlockedCount = achievements.data?.catalog.filter((a) => a.unlocked).length ?? 0

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Flame className="h-6 w-6 text-indigo-400" />}
        title="Motivation"
        subtitle="XP for skill milestones, forgiving streaks, white-hat quests."
      />

      {fresh.fresh && (
        <div className="celebrate rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-200">
          <Sparkles className="mr-2 inline h-4 w-4" />
          {freshStartCopy[fresh.reason ?? 'new-week']}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* XP / level card */}
        <div className="panel space-y-2">
          <p className="label">Level</p>
          <div className="flex items-end justify-between">
            <p className="text-4xl font-bold tracking-tight">{status.data?.xp.level ?? 1}</p>
            <p className="text-sm text-tertiary">{status.data?.xp.total ?? 0} XP total</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-(--hub-border)">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-500"
              style={{ width: `${Math.round((status.data?.xp.progress ?? 0) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-tertiary">
            {Math.round((status.data?.xp.progress ?? 0) * 100)}% to level{' '}
            {(status.data?.xp.level ?? 1) + 1} ({status.data?.xp.xpForNextLevel ?? 0} XP)
          </p>
        </div>

        {/* streak card */}
        <div className="panel space-y-2">
          <p className="label">Streak</p>
          <div className="flex items-end gap-4">
            <p className="text-4xl font-bold tracking-tight text-status-warning-text">
              {status.data?.streak.current ?? 0}
            </p>
            <p className="text-sm text-tertiary">best {status.data?.streak.best ?? 0}</p>
          </div>
          <p className="text-xs text-tertiary">
            freezes: {status.data?.streak.freezes ?? 0} · weekend amulet:{' '}
            {status.data?.streak.weekendAmulet ? 'active' : '—'}
          </p>
          <button
            className="btn"
            onClick={() => logActivity.mutate()}
            disabled={status.data?.todayDone === true}
          >
            <CheckCircle2 className="h-4 w-4" />{' '}
            {status.data?.todayDone ? 'Today is logged' : "Log today's activity"}
          </button>
        </div>
      </div>

      {/* quests */}
      <div className="panel space-y-3">
        <p className="label flex items-center gap-2">
          <Target className="h-3.5 w-3.5" /> Daily quests — {quests.data?.date ?? '…'}
        </p>
        {quests.data?.items.map((q, i) => {
          const pct = Math.min(100, Math.round((q.progress / Math.max(1, q.target)) * 100))
          return (
            <div key={i} className="flex items-center gap-3">
              {q.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success-text" />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border border-neutral-400" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-700 dark:text-neutral-200">{q.label}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-(--hub-border)">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-tertiary">
                {q.type === 'focus' ? `${q.progress}/${q.target}m` : `${q.progress}/${q.target}`}
              </span>
              {!q.done && (
                <button className="btn-ghost text-xs" onClick={() => completeQuest.mutate(i)}>
                  mark done
                </button>
              )}
            </div>
          )
        })}
        <p className="text-xs text-tertiary">
          {quests.data?.allDone
            ? `All quests done — +${quests.data.xpReward} XP earned`
            : `Complete all three for +${quests.data?.xpReward ?? 50} XP`}
        </p>
      </div>

      {/* WOOP goals */}
      <div className="panel space-y-3">
        <p className="label flex items-center gap-2">
          <ScrollText className="h-3.5 w-3.5" /> WOOP goals — wish, outcome, obstacle, plan
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="input sm:col-span-2"
            placeholder="Wish — challenging but feasible"
            value={goalForm.wish}
            onChange={(e) => setGoalForm({ ...goalForm, wish: e.target.value })}
          />
          <input
            className="input"
            placeholder="Outcome — the best result"
            value={goalForm.outcome}
            onChange={(e) => setGoalForm({ ...goalForm, outcome: e.target.value })}
          />
          <input
            className="input"
            placeholder="Obstacle — the INNER barrier"
            value={goalForm.obstacle}
            onChange={(e) => setGoalForm({ ...goalForm, obstacle: e.target.value })}
          />
          {/* If–then section: an implementation intention pairs the cue with a
              concrete action (Gollwitzer & Sheeran 2006 meta-analysis, d = 0.65). */}
          <div className="space-y-2 rounded-lg border border-neutral-200 p-3 sm:col-span-2 dark:border-(--hub-border)">
            <p className="label">If … then … — plan the moment, not the goal</p>
            <input
              className="input"
              placeholder="If — the cue: 'it's 21:00 and I haven't studied'"
              maxLength={200}
              value={goalForm.ifCondition}
              onChange={(e) => setGoalForm({ ...goalForm, ifCondition: e.target.value })}
            />
            <input
              className="input"
              placeholder="Then — the action: 'I open the review queue first'"
              maxLength={200}
              value={goalForm.thenAction}
              onChange={(e) => setGoalForm({ ...goalForm, thenAction: e.target.value })}
            />
            <p className="text-xs text-tertiary">
              Naming the cue and the action in advance roughly doubles follow-through — Gollwitzer
              &amp; Sheeran 2006 meta-analysis (d&nbsp;=&nbsp;0.65).
            </p>
          </div>
          <input
            className="input sm:col-span-2"
            placeholder="Free-text if-then plan (optional) — 'If <obstacle>, then I will <action>'"
            value={goalForm.ifThenPlan}
            onChange={(e) => setGoalForm({ ...goalForm, ifThenPlan: e.target.value })}
          />
          <input
            className="input"
            type="date"
            value={goalForm.dueDate}
            onChange={(e) => setGoalForm({ ...goalForm, dueDate: e.target.value })}
          />
          <button
            className="btn justify-self-start"
            onClick={() => createGoal.mutate()}
            disabled={createGoal.isPending}
          >
            Create goal
          </button>
        </div>
        {goalError && <p className="text-sm text-danger-text">{goalError}</p>}
        <ul className="space-y-2">
          {goals.data?.goals.map((g) => (
            <li
              key={g.id}
              className="rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                    {g.wish}
                  </p>
                  {(g.ifCondition || g.thenAction) && (
                    <p className="mt-0.5 text-xs text-indigo-300">
                      {g.ifCondition ? `If ${g.ifCondition}` : 'If …'}
                      {g.thenAction ? ` — then ${g.thenAction}` : ' — then …'}
                    </p>
                  )}
                  {g.ifThenPlan && <p className="mt-0.5 text-xs text-indigo-300">{g.ifThenPlan}</p>}
                  {g.obstacle && <p className="text-xs text-tertiary">obstacle: {g.obstacle}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    className="btn-ghost text-xs"
                    onClick={() =>
                      updateGoal.mutate({
                        id: g.id,
                        body: { progressPct: Math.min(100, g.progressPct + 10) },
                      })
                    }
                  >
                    +10%
                  </button>
                  <button
                    className="btn-ghost text-xs"
                    onClick={() =>
                      updateGoal.mutate({
                        id: g.id,
                        body: {
                          status: g.status === 'done' ? 'active' : 'done',
                          progressPct: g.status === 'done' ? g.progressPct : 100,
                        },
                      })
                    }
                  >
                    {g.status === 'done' ? 'reopen' : 'done'}
                  </button>
                  <button
                    className="btn-ghost text-xs text-danger-text"
                    onClick={() => deleteGoal.mutate(g.id)}
                  >
                    del
                  </button>
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-(--hub-border)">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all"
                  style={{ width: `${g.progressPct}%` }}
                />
              </div>
              <p className="mt-1 text-right text-[10px] text-tertiary">
                {g.progressPct}% {g.dueDate ? `· due ${g.dueDate}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {/* achievements grid */}
      <div className="panel space-y-3">
        <p className="label flex items-center gap-2">
          <Award className="h-3.5 w-3.5" /> Achievements — {unlockedCount}/
          {achievements.data?.catalog.length ?? 15}
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {achievements.data?.catalog.map((a) => (
            <div
              key={a.key}
              className={`rounded-lg border p-3 ${a.unlocked ? 'border-amber-500/50 bg-amber-500/5' : 'border-neutral-200 opacity-60 dark:border-(--hub-border)'}`}
            >
              <p className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">
                {a.unlocked ? (
                  <Award className="h-4 w-4 text-status-warning-text" />
                ) : (
                  <Lock className="h-3.5 w-3.5 text-tertiary" />
                )}
                {a.title}
              </p>
              <p className="mt-1 text-xs text-tertiary">{a.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* commitment contracts */}
      <div className="panel space-y-3">
        <p className="label">Commitment contracts — stakes you chose on purpose</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <input
            className="input sm:col-span-2"
            placeholder="Contract — e.g. 100 reviews this week"
            value={commitForm.title}
            onChange={(e) => setCommitForm({ ...commitForm, title: e.target.value })}
          />
          <select
            className="input"
            value={commitForm.metric}
            onChange={(e) => setCommitForm({ ...commitForm, metric: e.target.value })}
          >
            <option value="reviews">reviews</option>
            <option value="focus_minutes">focus minutes</option>
            <option value="lessons">lessons</option>
          </select>
          <input
            className="input"
            type="number"
            min={1}
            value={commitForm.threshold}
            onChange={(e) =>
              setCommitForm({ ...commitForm, threshold: Number(e.target.value) || 1 })
            }
          />
          <input
            className="input sm:col-span-3"
            placeholder="Stakes — visible, honest (integrity stakes work)"
            value={commitForm.stakes}
            onChange={(e) => setCommitForm({ ...commitForm, stakes: e.target.value })}
          />
          <button
            className="btn"
            onClick={() => createCommitment.mutate()}
            disabled={createCommitment.isPending}
          >
            Sign contract
          </button>
        </div>
        <ul className="space-y-2">
          {commitments.data?.report.map((r) => (
            <li
              key={r.commitment.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3 text-sm dark:border-(--hub-border)"
            >
              <div className="min-w-0">
                <p className="truncate text-neutral-700 dark:text-neutral-200">
                  {r.commitment.title}
                </p>
                <p className="text-xs text-tertiary">
                  {r.week.start} → {r.week.end} · {r.commitment.stakes ?? 'no stakes declared'}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${r.met ? 'bg-emerald-500/15 text-status-success-text' : 'bg-amber-500/15 text-status-warning-text'}`}
              >
                {r.value}/{r.threshold} {r.met ? '· kept' : '· pending'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── 30-Tier Seasonal Study Pass ── */}
      <SeasonalStudyPassSection />
    </div>
  )
}

interface SeasonTierItem {
  tier: number
  xpThreshold: number
  rewardName: string
  rewardType: string
}

function SeasonalStudyPassSection() {
  const qc = useQueryClient()
  const seasonQuery = useQuery<{
    ok: boolean
    seasonId: string
    progress: {
      seasonXp: number
      tier: number
      currentTier: number
      nextTierXp: number
      percentToNext: number
      claimedRewards: number[]
    }
    tiers: SeasonTierItem[]
  }>({
    queryKey: ['season-progress'],
    queryFn: () => apiGet('/api/social/seasons'),
  })

  const claimMutation = useMutation({
    mutationFn: (tier: number) =>
      apiSend('/api/social/seasons', 'POST', {
        action: 'claim_reward',
        tier,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['season-progress'] })
    },
  })

  const data = seasonQuery.data
  const currentTier = data?.progress.currentTier ?? 0
  const seasonXp = data?.progress.seasonXp ?? 0
  const percentToNext = data?.progress.percentToNext ?? 0
  const claimed = data?.progress.claimedRewards ?? []
  const tiers = data?.tiers ?? []

  return (
    <div className="panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-status-warning-text">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Season 1: Dawn of Mastery</h2>
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-status-warning-text">
                Tier {currentTier} of 30
              </span>
            </div>
            <p className="text-xs text-faint">
              Earn study XP across reviews, lessons & focus sessions to unlock exclusive themes,
              sound packs, and perks.
            </p>
          </div>
        </div>

        <div className="text-right">
          <div className="text-sm font-bold text-status-warning-text">
            {seasonXp.toLocaleString()} Season XP
          </div>
          <div className="text-[11px] text-tertiary">
            {percentToNext}% toward Tier {currentTier + 1}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${percentToNext}%` }}
        />
      </div>

      {/* 30-Tier Roadmap Carousel / Scroll */}
      <div className="space-y-2 pt-2">
        <div className="flex justify-between items-center text-xs text-faint">
          <span className="font-semibold uppercase tracking-wider text-[11px]">
            30-Tier Reward Track
          </span>
          <span className="text-[11px] text-tertiary">Scroll horizontally to view tiers →</span>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-3 pt-1 scroll-smooth">
          {tiers.map((t) => {
            const isUnlocked = currentTier >= t.tier
            const isClaimed = claimed.includes(t.tier)
            return (
              <div
                key={t.tier}
                className={`flex-none w-44 rounded-xl border p-3.5 flex flex-col justify-between transition-all ${
                  isClaimed
                    ? 'border-emerald-500/30 bg-emerald-950/10 text-neutral-300'
                    : isUnlocked
                      ? 'border-amber-500/40 bg-amber-950/20 text-neutral-100 shadow-md'
                      : 'border-neutral-800 bg-neutral-900/40 opacity-60 text-tertiary'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] text-faint">
                    <span className="font-semibold">Tier {t.tier}</span>
                    <span className="font-mono">{t.xpThreshold} XP</span>
                  </div>
                  <div className="mt-2 text-xs font-semibold leading-tight">{t.rewardName}</div>
                  <div className="text-[10px] text-tertiary uppercase tracking-wider mt-0.5">
                    {t.rewardType.replace('_', ' ')}
                  </div>
                </div>

                <div className="pt-3">
                  {isClaimed ? (
                    <span className="flex items-center gap-1 text-[11px] text-status-success-text font-medium">
                      <Check className="h-3.5 w-3.5" /> Claimed
                    </span>
                  ) : isUnlocked ? (
                    <button
                      type="button"
                      disabled={claimMutation.isPending}
                      onClick={() => claimMutation.mutate(t.tier)}
                      className="w-full rounded-lg bg-amber-500 py-1 text-xs font-semibold text-neutral-950 hover:bg-amber-400 transition-colors"
                    >
                      Claim Reward
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-tertiary">
                      <Lock className="h-3 w-3" /> Locked
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
