'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, CheckCircle2, Flame, Lock, ScrollText, Sparkles, Target } from 'lucide-react'
import { isFreshStartMoment } from '@learning-hub/core/src/motivation'

interface StreakResponse {
  streak: { current: number; best: number; lastActiveDate: string | null; freezes: number; weekendAmulet: boolean }
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
  report: { commitment: Commitment; value: number; threshold: number; met: boolean; week: { start: string; end: string } }[]
}

async function jget<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed`)
  return res.json() as Promise<T>
}
async function jsend<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  if (!res.ok) throw new Error(`${method} ${url} failed`)
  return res.json() as Promise<T>
}

const freshStartCopy: Record<string, string> = {
  'new-week': 'New week — research says fresh starts stick on Mondays. Pick one quest and begin.',
  'new-month': 'New month, clean slate. Set a WOOP goal for the next 30 days.',
  'new-year': 'New year. The best moment to start was today, hour one.',
}

export default function MotivationPage() {
  const qc = useQueryClient()
  const [goalForm, setGoalForm] = useState({ wish: '', outcome: '', obstacle: '', ifThenPlan: '', dueDate: '' })
  const [goalError, setGoalError] = useState<string | null>(null)
  const [commitForm, setCommitForm] = useState({ title: '', metric: 'reviews', threshold: 50, stakes: '' })

  // minutes to ADD to local time to get UTC — the API's tzOffset semantics
  const tz = new Date().getTimezoneOffset()
  const status = useQuery({ queryKey: ['streaks'], queryFn: () => jget<StreakResponse>('/api/streaks') })
  const quests = useQuery({ queryKey: ['quests'], queryFn: () => jget<QuestResponse>(`/api/quests?tzOffset=${tz}`) })
  const goals = useQuery({ queryKey: ['goals'], queryFn: () => jget<{ goals: Goal[] }>('/api/goals') })
  const achievements = useQuery({ queryKey: ['achievements'], queryFn: () => jget<{ catalog: AchievementRow[] }>('/api/achievements') })
  const commitments = useQuery({ queryKey: ['commitments'], queryFn: () => jget<CommitmentReport>(`/api/commitments?tzOffset=${tz}`) })

  const logActivity = useMutation({
    mutationFn: () => jsend('/api/streaks', 'POST'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['streaks'] })
      void qc.invalidateQueries({ queryKey: ['quests'] })
    },
  })

  const completeQuest = useMutation({
    mutationFn: (index: number) => jsend('/api/quests', 'POST', { index, tzOffset: new Date().getTimezoneOffset() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['quests'] })
      void qc.invalidateQueries({ queryKey: ['streaks'] })
    },
  })

  const createGoal = useMutation({
    mutationFn: () => jsend('/api/goals', 'POST', goalForm),
    onSuccess: () => {
      setGoalForm({ wish: '', outcome: '', obstacle: '', ifThenPlan: '', dueDate: '' })
      setGoalError(null)
      void qc.invalidateQueries({ queryKey: ['goals'] })
    },
    onError: (e) => setGoalError(e instanceof Error ? e.message : 'Could not save goal'),
  })

  const updateGoal = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => jsend(`/api/goals/${id}`, 'PATCH', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['goals'] }),
  })
  const deleteGoal = useMutation({
    mutationFn: (id: number) => jsend(`/api/goals/${id}`, 'DELETE'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['goals'] }),
  })

  const createCommitment = useMutation({
    mutationFn: () => jsend('/api/commitments', 'POST', commitForm),
    onSuccess: () => {
      setCommitForm({ title: '', metric: 'reviews', threshold: 50, stakes: '' })
      void qc.invalidateQueries({ queryKey: ['commitments'] })
    },
  })

  const fresh = isFreshStartMoment(new Date())
  const unlockedCount = achievements.data?.catalog.filter((a) => a.unlocked).length ?? 0

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Flame className="h-6 w-6 text-indigo-400" /> Motivation
        </h1>
        <p className="text-sm text-neutral-500">XP for skill milestones, forgiving streaks, white-hat quests.</p>
      </header>

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
            <p className="text-sm text-neutral-500">{status.data?.xp.total ?? 0} XP total</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-[#26262b]">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${Math.round((status.data?.xp.progress ?? 0) * 100)}%` }} />
          </div>
          <p className="text-xs text-neutral-500">
            {Math.round((status.data?.xp.progress ?? 0) * 100)}% to level {(status.data?.xp.level ?? 1) + 1} ({status.data?.xp.xpForNextLevel ?? 0} XP)
          </p>
        </div>

        {/* streak card */}
        <div className="panel space-y-2">
          <p className="label">Streak</p>
          <div className="flex items-end gap-4">
            <p className="text-4xl font-bold tracking-tight text-amber-400">{status.data?.streak.current ?? 0}</p>
            <p className="text-sm text-neutral-500">best {status.data?.streak.best ?? 0}</p>
          </div>
          <p className="text-xs text-neutral-500">
            freezes: {status.data?.streak.freezes ?? 0} · weekend amulet: {status.data?.streak.weekendAmulet ? 'active' : '—'}
          </p>
          <button className="btn" onClick={() => logActivity.mutate()} disabled={status.data?.todayDone === true}>
            <CheckCircle2 className="h-4 w-4" /> {status.data?.todayDone ? 'Today is logged' : 'Log today\'s activity'}
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
              {q.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <span className="h-4 w-4 shrink-0 rounded-full border border-neutral-400" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-700 dark:text-neutral-200">{q.label}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-[#26262b]">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-neutral-500">
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
        <p className="text-xs text-neutral-500">
          {quests.data?.allDone ? `All quests done — +${quests.data.xpReward} XP earned` : `Complete all three for +${quests.data?.xpReward ?? 50} XP`}
        </p>
      </div>

      {/* WOOP goals */}
      <div className="panel space-y-3">
        <p className="label flex items-center gap-2">
          <ScrollText className="h-3.5 w-3.5" /> WOOP goals — wish, outcome, obstacle, plan
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="input sm:col-span-2" placeholder="Wish — challenging but feasible" value={goalForm.wish} onChange={(e) => setGoalForm({ ...goalForm, wish: e.target.value })} />
          <input className="input" placeholder="Outcome — the best result" value={goalForm.outcome} onChange={(e) => setGoalForm({ ...goalForm, outcome: e.target.value })} />
          <input className="input" placeholder="Obstacle — the INNER barrier" value={goalForm.obstacle} onChange={(e) => setGoalForm({ ...goalForm, obstacle: e.target.value })} />
          <input className="input sm:col-span-2" placeholder="If-then plan — 'If <obstacle>, then I will <action>'" value={goalForm.ifThenPlan} onChange={(e) => setGoalForm({ ...goalForm, ifThenPlan: e.target.value })} />
          <input className="input" type="date" value={goalForm.dueDate} onChange={(e) => setGoalForm({ ...goalForm, dueDate: e.target.value })} />
          <button className="btn justify-self-start" onClick={() => createGoal.mutate()} disabled={createGoal.isPending}>
            Create goal
          </button>
        </div>
        {goalError && <p className="text-sm text-rose-400">{goalError}</p>}
        <ul className="space-y-2">
          {goals.data?.goals.map((g) => (
            <li key={g.id} className="rounded-lg border border-neutral-200 p-3 dark:border-[#26262b]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{g.wish}</p>
                  {g.ifThenPlan && <p className="mt-0.5 text-xs text-indigo-300">{g.ifThenPlan}</p>}
                  {g.obstacle && <p className="text-xs text-neutral-500">obstacle: {g.obstacle}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => updateGoal.mutate({ id: g.id, body: { progressPct: Math.min(100, g.progressPct + 10) } })}
                  >
                    +10%
                  </button>
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => updateGoal.mutate({ id: g.id, body: { status: g.status === 'done' ? 'active' : 'done', progressPct: g.status === 'done' ? g.progressPct : 100 } })}
                  >
                    {g.status === 'done' ? 'reopen' : 'done'}
                  </button>
                  <button className="btn-ghost text-xs text-rose-400" onClick={() => deleteGoal.mutate(g.id)}>del</button>
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-[#26262b]">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all" style={{ width: `${g.progressPct}%` }} />
              </div>
              <p className="mt-1 text-right text-[10px] text-neutral-500">{g.progressPct}% {g.dueDate ? `· due ${g.dueDate}` : ''}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* achievements grid */}
      <div className="panel space-y-3">
        <p className="label flex items-center gap-2">
          <Award className="h-3.5 w-3.5" /> Achievements — {unlockedCount}/{achievements.data?.catalog.length ?? 15}
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {achievements.data?.catalog.map((a) => (
            <div
              key={a.key}
              className={`rounded-lg border p-3 ${a.unlocked ? 'border-amber-500/50 bg-amber-500/5' : 'border-neutral-200 opacity-60 dark:border-[#26262b]'}`}
            >
              <p className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">
                {a.unlocked ? <Award className="h-4 w-4 text-amber-400" /> : <Lock className="h-3.5 w-3.5 text-neutral-500" />}
                {a.title}
              </p>
              <p className="mt-1 text-xs text-neutral-500">{a.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* commitment contracts */}
      <div className="panel space-y-3">
        <p className="label">Commitment contracts — stakes you chose on purpose</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <input className="input sm:col-span-2" placeholder="Contract — e.g. 100 reviews this week" value={commitForm.title} onChange={(e) => setCommitForm({ ...commitForm, title: e.target.value })} />
          <select className="input" value={commitForm.metric} onChange={(e) => setCommitForm({ ...commitForm, metric: e.target.value })}>
            <option value="reviews">reviews</option>
            <option value="focus_minutes">focus minutes</option>
            <option value="lessons">lessons</option>
          </select>
          <input className="input" type="number" min={1} value={commitForm.threshold} onChange={(e) => setCommitForm({ ...commitForm, threshold: Number(e.target.value) || 1 })} />
          <input className="input sm:col-span-3" placeholder="Stakes — visible, honest (integrity stakes work)" value={commitForm.stakes} onChange={(e) => setCommitForm({ ...commitForm, stakes: e.target.value })} />
          <button className="btn" onClick={() => createCommitment.mutate()} disabled={createCommitment.isPending}>
            Sign contract
          </button>
        </div>
        <ul className="space-y-2">
          {commitments.data?.report.map((r) => (
            <li key={r.commitment.id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3 text-sm dark:border-[#26262b]">
              <div className="min-w-0">
                <p className="truncate text-neutral-700 dark:text-neutral-200">{r.commitment.title}</p>
                <p className="text-xs text-neutral-500">
                  {r.week.start} → {r.week.end} · {r.commitment.stakes ?? 'no stakes declared'}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${r.met ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                {r.value}/{r.threshold} {r.met ? '· kept' : '· pending'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
