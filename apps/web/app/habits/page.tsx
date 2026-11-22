'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, Coffee, Link2, PartyPopper, Plus, Trash2 } from 'lucide-react'
import { DOPAMINE_MENU, type DopamineType } from '@learning-hub/core/src/habits'
import { dayKey } from '@learning-hub/core/src/streaks'
import { apiGet, apiSend } from '@/lib/transport'
import { Callout, EmptyState, IconButton, PageHeader, Skeleton } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { ChipPicker } from '@/components/ui/chip-picker'
import { SectionHeader } from '@/components/ui/section-header'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useGsapCountUp } from '@/lib/useGsapCountUp'
import { SimpleCounters } from '@/components/tasks/SimpleCounters'

interface Habit {
  id: number
  name: string
  cue: string | null
  cueType: string | null
  craving: string | null
  response: string | null
  reward: string | null
  anchor: string | null
  order: number
  archived: boolean
  logDates: string[]
  todayDone: boolean
  solidifying: {
    days: number
    stage: 'forming' | 'solidifying' | 'automatic'
    daysToNext: number
    nextStage: string | null
  }
}

interface HabitsResponse {
  habits: Habit[]
  today: string
  stageThresholds: { solidifying: number; automatic: number }
}

const STAGE_COLOR: Record<string, string> = {
  forming: 'text-status-warning-text',
  solidifying: 'text-status-info-text',
  automatic: 'text-status-success-text',
}

const EMPTY_FORM = {
  name: '',
  cue: '',
  cueType: 'time',
  craving: '',
  response: '',
  reward: '',
  anchor: '',
}

export default function HabitsPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [celebrated, setCelebrated] = useState<number | null>(null)
  const [dopamineFilter, setDopamineFilter] = useState<DopamineType | 'all'>('all')
  // Habit id awaiting destructive confirmation (AlertDialog) — null = none.
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const habitsQ = useQuery({
    queryKey: ['habits'],
    queryFn: () => apiGet<HabitsResponse>(`/api/habits?tzOffset=${new Date().getTimezoneOffset()}`),
  })

  const createHabit = useMutation({
    mutationFn: () => apiSend('/api/habits', 'POST', form),
    onSuccess: () => {
      setForm(EMPTY_FORM)
      setFormError(null)
      void qc.invalidateQueries({ queryKey: ['habits'] })
    },
    onError: (e) => {
      setFormError(e instanceof Error ? e.message : 'Could not create habit')
    },
  })

  const checkin = useMutation({
    mutationFn: (habitId: number) =>
      apiSend<{ alreadyDone: boolean }>('/api/habits/checkin', 'POST', {
        habitId,
        tzOffset: new Date().getTimezoneOffset(),
      }),
    onSuccess: (_res, habitId) => {
      setCelebrated(habitId)
      setTimeout(() => setCelebrated(null), 1200)
      void qc.invalidateQueries({ queryKey: ['habits'] })
      void qc.invalidateQueries({ queryKey: ['streaks'] })
    },
  })

  const removeHabit = useMutation({
    mutationFn: (habitId: number) => apiSend(`/api/habits/${habitId}`, 'DELETE'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['habits'] }),
  })

  // 90-day column dates (oldest → today)
  const days = useMemo(() => {
    const now = Date.now()
    return Array.from({ length: 90 }, (_, i) => dayKey(new Date(now - (89 - i) * 86_400_000)))
  }, [])

  const habits = habitsQ.data?.habits ?? []
  const doneToday = habits.filter((h) => h.todayDone).length
  const dopamine =
    dopamineFilter === 'all'
      ? DOPAMINE_MENU
      : DOPAMINE_MENU.filter((d) => d.type === dopamineFilter)

  // GSAP count-up (per-page motion mandate): the "today: N/M" header counter.
  // Rewrites textContent in a client effect — SSR/tests keep the static number.
  const doneTodayRef = useGsapCountUp(doneToday)

  return (
    <ClayIn as="div" className="space-y-5">
      <PageHeader
        icon={<CalendarCheck className="h-6 w-6 text-indigo-400" />}
        title="Habits"
        subtitle="Cue → craving → response → reward. Tiny versions count."
        actions={
          <p className="text-sm text-tertiary">
            today:{' '}
            <span className="font-semibold text-indigo-400">
              <span ref={doneTodayRef}>{doneToday}</span>/{habits.length}
            </span>
          </p>
        }
      />

      {/* today's checklist with stacking-chain order + celebrate */}
      <div className="panel space-y-2">
        <SectionHeader icon={Link2} title="Today — the stack, in chain order" />
        {habitsQ.isLoading ? (
          <div className="space-y-2" aria-hidden>
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : habitsQ.isError ? (
          <Callout tone="danger" title="Couldn't load habits">
            {(habitsQ.error as Error | null)?.message ?? 'Please try again in a moment.'}
          </Callout>
        ) : habits.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck className="h-6 w-6" aria-hidden />}
            title="No habits yet"
          >
            Create the first tiny one below — two minutes counts as showing up.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {habits.map((h, i) => (
              <li key={h.id} className="flex items-center gap-3">
                <span className="w-5 text-center text-xs text-faint">{i === 0 ? '┌' : '└'}</span>
                <IconButton
                  label={`check in ${h.name}`}
                  size="sm"
                  variant="bare"
                  onClick={() => checkin.mutate(h.id)}
                  disabled={checkin.isPending}
                  className={`shrink-0 rounded-full border ${
                    h.todayDone
                      ? `border-emerald-500 bg-emerald-500/20 text-status-success-text ${celebrated === h.id ? 'celebrate' : ''}`
                      : 'border-neutral-300 text-tertiary hover:border-indigo-400 dark:border-(--hub-border)'
                  }`}
                >
                  {h.todayDone ? (
                    <PartyPopper className="h-4 w-4" />
                  ) : (
                    <Coffee className="h-4 w-4" />
                  )}
                </IconButton>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-700 dark:text-neutral-200">
                    {h.anchor ? (
                      <span className="text-xs text-indigo-400">After {h.anchor} → </span>
                    ) : null}
                    {h.name}
                  </p>
                  <p className="truncate text-xs text-tertiary">
                    {h.cue ? `cue: ${h.cue}` : 'no cue yet'} · {h.response ?? 'no tiny version yet'}
                  </p>
                </div>
                <div className="hidden w-28 sm:block">
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-(--hub-border)">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${Math.min(100, (h.solidifying.days / 60) * 100)}%` }}
                    />
                  </div>
                  <p className={`mt-0.5 text-right text-xs ${STAGE_COLOR[h.solidifying.stage]}`}>
                    {h.solidifying.stage} · {h.solidifying.days}d
                  </p>
                </div>
                <IconButton
                  label={`delete ${h.name}`}
                  onClick={() => setConfirmDeleteId(h.id)}
                  className="text-faint hover:text-danger-text"
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 90-day heatmap grid */}
      {habits.length > 0 && (
        <div className="panel space-y-2 scroll-x">
          <p className="label">Last 90 days</p>
          <div className="space-y-1">
            {habits.map((h) => (
              <div key={h.id} className="flex items-center gap-1">
                <span className="w-28 shrink-0 truncate text-xs text-tertiary">{h.name}</span>
                <div className="flex gap-px">
                  {days.map((d) => {
                    const done = h.logDates.includes(d)
                    return (
                      <span
                        key={d}
                        title={`${d}: ${done ? 'done' : '—'}`}
                        className={`h-3 w-3 rounded-[2px] ${done ? 'bg-emerald-500' : 'bg-neutral-200 dark:bg-(--hub-panel-2)'}`}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* create habit */}
      <div className="panel space-y-3">
        <SectionHeader icon={Plus} title="New habit (the full loop)" />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="input"
            placeholder="Name — e.g. Read 1 page"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select
            className="input"
            value={form.cueType}
            onChange={(e) => setForm({ ...form, cueType: e.target.value })}
          >
            {['time', 'location', 'preceding', 'emotional', 'people'].map((t) => (
              <option key={t} value={t}>
                {t} cue
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Cue — when/where (required)"
            value={form.cue}
            onChange={(e) => setForm({ ...form, cue: e.target.value })}
          />
          <input
            className="input"
            placeholder="Craving — the feeling you want"
            value={form.craving}
            onChange={(e) => setForm({ ...form, craving: e.target.value })}
          />
          <input
            className="input"
            placeholder="Response — the two-minute version (required)"
            value={form.response}
            onChange={(e) => setForm({ ...form, response: e.target.value })}
          />
          <input
            className="input"
            placeholder="Reward — immediate satisfaction"
            value={form.reward}
            onChange={(e) => setForm({ ...form, reward: e.target.value })}
          />
          <input
            className="input sm:col-span-2"
            placeholder="Anchor — 'After [existing habit]' for stacking"
            value={form.anchor}
            onChange={(e) => setForm({ ...form, anchor: e.target.value })}
          />
        </div>
        {formError && (
          <Callout tone="danger" title="Couldn't create habit">
            {formError}
          </Callout>
        )}
        <button
          className="btn"
          onClick={() => createHabit.mutate()}
          disabled={createHabit.isPending}
        >
          Create habit
        </button>
      </div>

      {/* dopamine menu */}
      <div className="panel space-y-3">
        <SectionHeader
          title="Dopamine menu"
          action={<span className="text-xs normal-case text-faint">pick before the urge hits</span>}
        />
        <ChipPicker<DopamineType | 'all'>
          label="Filter the dopamine menu"
          items={(['all', 'move', 'create', 'connect', 'soothe'] as const).map((t) => ({
            value: t,
            label: t,
          }))}
          value={dopamineFilter}
          onChange={setDopamineFilter}
        />
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {dopamine.map((d, i) => (
            <li
              key={i}
              className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-(--hub-border)"
            >
              <p className="text-neutral-700 dark:text-neutral-200">{d.label}</p>
              <p className="mt-1 text-xs text-tertiary">
                {d.type} · ~{d.minutes} min
              </p>
            </li>
          ))}
        </ul>
      </div>

      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this habit?</AlertDialogTitle>
            <AlertDialogDescription>
              The habit and its 90-day log are permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep habit</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmDeleteId !== null) removeHabit.mutate(confirmDeleteId)
                setConfirmDeleteId(null)
              }}
            >
              Delete habit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* S3-31: SP simple counters — free-floating tap counters with
          streaks, under the habits loop (habits stay untouched). */}
      <SimpleCounters today={null} />
    </ClayIn>
  )
}
