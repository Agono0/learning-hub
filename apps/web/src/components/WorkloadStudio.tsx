'use client'

/**
 * Workload Balancer & Backlog Recovery Studio.
 *
 * Implements evidence-based spaced repetition workload management:
 * 1. 30–90 Day Review Load Histogram: Visualizes forecasted reviews with spike detection.
 * 2. Load Smoothing: Safe interval fuzzing (+/- 5% interval shift, max 2 days) to eliminate
 *    peaks without harming retention (adheres strictly to AGENTS.md Rule 7).
 * 3. Easy Days Scheduler: Marks designated rest days (e.g. Sat/Sun) and routes volume away.
 * 4. Backlog Catch-Up Engine: Reschedules overdue reviews in gentle daily quotas
 *    prioritizing lowest retrievability cards to salvage fading memory traces.
 */
import { useId, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Flame,
  Layers,
  Sliders,
  Sparkles,
  Zap,
} from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, Button, Callout, EmptyState, Panel } from '@/ui'

export interface ForecastItem {
  day: string // YYYY-MM-DD
  count: number
}

export interface WorkloadResponse {
  ok: boolean
  totalCards: number
  overdueCount: number
  forecast: ForecastItem[]
  shiftedCount?: number
}

export interface DeckOption {
  id: number
  name: string
  total?: number
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const FORECAST_DAY_OPTIONS = [14, 30, 60, 90]

export function WorkloadStudio() {
  const qc = useQueryClient()
  const [forecastDays, setForecastDays] = useState<number>(30)
  const [selectedDeckId, setSelectedDeckId] = useState<number | 'all'>('all')
  const [easyDays, setEasyDays] = useState<number[]>([0, 6]) // Default Sun, Sat
  const [maxPerDay, setMaxPerDay] = useState<number>(45)
  const [dailyBacklogCap, setDailyBacklogCap] = useState<number>(25)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Fetch available decks
  const decksQ = useQuery<{ decks: DeckOption[] }>({
    queryKey: ['decks'],
    queryFn: () => apiGet<{ decks: DeckOption[] }>('/api/decks'),
  })

  // Fetch live workload forecast
  const workloadQ = useQuery<WorkloadResponse>({
    queryKey: ['workload', forecastDays, selectedDeckId],
    queryFn: () => {
      const qs = new URLSearchParams({ days: String(forecastDays) })
      if (selectedDeckId !== 'all') qs.set('deckId', String(selectedDeckId))
      return apiGet<WorkloadResponse>(`/api/workload?${qs.toString()}`)
    },
  })

  // Balance reviews mutation
  const balanceMutation = useMutation({
    mutationFn: () =>
      apiSend<WorkloadResponse>('/api/workload', 'POST', {
        action: 'balance',
        deckId: selectedDeckId === 'all' ? undefined : selectedDeckId,
        days: forecastDays,
        maxPerDay,
        easyDays,
        dailyCap: dailyBacklogCap,
      }),
    onSuccess: (res) => {
      const count = res.shiftedCount ?? 0
      setFeedback(
        count > 0
          ? `Smoothed ${count} review spikes within safe retention fuzz windows!`
          : 'Workload is already well-balanced. No spikes detected.',
      )
      setTimeout(() => setFeedback(null), 4000)
      void qc.invalidateQueries({ queryKey: ['workload'] })
    },
  })

  // Backlog catch-up mutation
  const catchUpMutation = useMutation({
    mutationFn: () =>
      apiSend<WorkloadResponse>('/api/workload', 'POST', {
        action: 'catch_up',
        deckId: selectedDeckId === 'all' ? undefined : selectedDeckId,
        dailyCap: dailyBacklogCap,
        days: forecastDays,
        easyDays,
      }),
    onSuccess: (res) => {
      const count = res.shiftedCount ?? 0
      setFeedback(
        count > 0
          ? `Rescheduled ${count} overdue cards into gentle daily quotas of ${dailyBacklogCap}/day!`
          : 'No overdue cards to reschedule.',
      )
      setTimeout(() => setFeedback(null), 4000)
      void qc.invalidateQueries({ queryKey: ['workload'] })
    },
  })

  const forecast = workloadQ.data?.forecast ?? []
  const overdueCount = workloadQ.data?.overdueCount ?? 0
  const totalCards = workloadQ.data?.totalCards ?? 0

  // Forecast statistics
  const stats = useMemo(() => {
    if (forecast.length === 0) return { total: 0, avg: 0, max: 0, peakDay: null }
    const total = forecast.reduce((sum, d) => sum + d.count, 0)
    const avg = Math.round((total / forecast.length) * 10) / 10
    let max = 0
    let peakDay: string | null = null
    for (const d of forecast) {
      if (d.count > max) {
        max = d.count
        peakDay = d.day
      }
    }
    return { total, avg, max, peakDay }
  }, [forecast])

  function toggleEasyDay(dayIndex: number) {
    setEasyDays((prev) =>
      prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex].sort(),
    )
  }

  const maxPerDaySliderId = useId()
  const backlogCapSliderId = useId()

  return (
    <div className="space-y-6">
      {/* Top Telemetry / Status Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-1">
          <span className="text-[10px] font-semibold uppercase text-neutral-400 flex items-center gap-1">
            <Layers className="h-3 w-3 text-indigo-400" /> Total Active Cards
          </span>
          <div className="text-2xl font-bold font-mono text-white">{totalCards}</div>
          <p className="text-[10px] text-neutral-500">Scheduled in spaced repetition</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-1">
          <span className="text-[10px] font-semibold uppercase text-neutral-400 flex items-center gap-1">
            <BarChart3 className="h-3 w-3 text-emerald-400" /> {forecastDays}-Day Forecast
          </span>
          <div className="text-2xl font-bold font-mono text-white">{stats.total}</div>
          <p className="text-[10px] text-neutral-500">~{stats.avg} reviews / day average</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-1">
          <span className="text-[10px] font-semibold uppercase text-neutral-400 flex items-center gap-1">
            <Flame className="h-3 w-3 text-amber-400" /> Peak Day Volume
          </span>
          <div className="text-2xl font-bold font-mono text-amber-400">{stats.max}</div>
          <p className="text-[10px] text-neutral-500">
            {stats.peakDay ? `on ${stats.peakDay}` : 'None'}
          </p>
        </div>

        <div
          className={`rounded-xl border p-4 space-y-1 transition ${
            overdueCount > 0 ? 'border-rose-500/30 bg-rose-500/10' : 'border-white/10 bg-white/5'
          }`}
        >
          <span className="text-[10px] font-semibold uppercase text-neutral-400 flex items-center gap-1">
            <AlertTriangle
              className={`h-3 w-3 ${overdueCount > 0 ? 'text-rose-400' : 'text-neutral-500'}`}
            />{' '}
            Overdue Backlog
          </span>
          <div
            className={`text-2xl font-bold font-mono ${overdueCount > 0 ? 'text-rose-400' : 'text-white'}`}
          >
            {overdueCount}
          </div>
          <p className="text-[10px] text-neutral-500">
            {overdueCount > 0 ? 'Urgent attention needed' : 'Zero overdue cards'}
          </p>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <Callout tone="success">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{feedback}</span>
          </div>
        </Callout>
      )}

      {/* Overdue Backlog Recovery Warning & Action */}
      {overdueCount > 0 && (
        <Panel
          title={
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              <span>Overdue Backlog Recovery</span>
              <Badge tone="danger">{overdueCount} Cards Pending</Badge>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-xs text-neutral-300">
              When reviews accumulate, cramming causes cognitive fatigue and high relapse rates. The
              recovery engine gently spreads overdue cards across upcoming days by retrievability,
              protecting your retention.
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-rose-500/20 bg-rose-500/5">
              <div className="space-y-1.5 flex-1">
                <div className="flex justify-between items-center max-w-xs">
                  <label
                    htmlFor={backlogCapSliderId}
                    className="text-xs font-semibold text-neutral-200"
                  >
                    Daily Catch-up Quota:
                  </label>
                  <span className="text-xs font-mono font-bold text-rose-400">
                    {dailyBacklogCap} cards/day
                  </span>
                </div>
                <input
                  id={backlogCapSliderId}
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={dailyBacklogCap}
                  onChange={(e) => setDailyBacklogCap(Number(e.target.value))}
                  className="w-full max-w-xs accent-rose-400"
                />
                <p className="text-[10px] text-neutral-400">
                  Reschedules the backlog over approximately{' '}
                  {Math.ceil(overdueCount / dailyBacklogCap)} days.
                </p>
              </div>

              <Button
                variant="primary"
                onClick={() => catchUpMutation.mutate()}
                disabled={catchUpMutation.isPending}
              >
                <Zap className="h-4 w-4 mr-1.5 text-amber-300" />
                {catchUpMutation.isPending ? 'Rescheduling...' : 'Reschedule Backlog Gently'}
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {/* Review Load Forecast Histogram */}
      <Panel
        title={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-indigo-400" />
              <span>Upcoming Review Load Forecast</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Deck Filter */}
              <select
                aria-label="Filter forecast by deck"
                value={selectedDeckId}
                onChange={(e) =>
                  setSelectedDeckId(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="input text-xs py-1 px-2.5 bg-neutral-900 border-white/10"
              >
                <option value="all">All Decks</option>
                {decksQ.data?.decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name} ({deck.total ?? 0})
                  </option>
                ))}
              </select>

              {/* Horizon Selector */}
              <div className="flex rounded-lg border border-white/10 bg-black/20 p-0.5">
                {FORECAST_DAY_OPTIONS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setForecastDays(days)}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition ${
                      forecastDays === days
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {forecast.length > 0 ? (
            <div className="overflow-x-auto pb-2">
              <div className="min-w-[700px] space-y-2">
                <div className="grid grid-flow-col auto-cols-fr gap-1 items-end h-40 px-2 bg-black/20 rounded-xl p-2.5 border border-white/5">
                  {forecast.map((item) => {
                    const dateObj = new Date(item.day + 'T00:00:00')
                    const weekday = dateObj.getDay()
                    const isEasy = easyDays.includes(weekday)
                    const isSpike = item.count > maxPerDay
                    const isHeavy = item.count > 65
                    const heightPct =
                      stats.max > 0 ? Math.max(8, (item.count / stats.max) * 100) : 8

                    const barColor = isSpike
                      ? 'bg-rose-500'
                      : isHeavy
                        ? 'bg-amber-400'
                        : isEasy
                          ? 'bg-indigo-400/60'
                          : 'bg-emerald-400'

                    return (
                      <div
                        key={item.day}
                        className="flex flex-col items-center justify-end h-full group relative"
                      >
                        {/* Tooltip */}
                        <div className="absolute -top-12 z-20 hidden group-hover:flex flex-col items-center bg-neutral-900 border border-white/20 text-[10px] text-white px-2 py-1 rounded shadow-xl pointer-events-none whitespace-nowrap">
                          <span className="font-bold">
                            {item.day} ({WEEKDAYS[weekday]})
                          </span>
                          <span className="text-neutral-400">
                            {item.count} cards {isEasy ? '· Easy Day' : ''}
                          </span>
                        </div>

                        {/* Bar */}
                        <div
                          style={{ height: `${heightPct}%` }}
                          className={`w-full rounded-t transition-all ${barColor} group-hover:brightness-125`}
                        />

                        {/* Date label */}
                        <span className="text-[8px] mt-1 font-mono text-neutral-500 group-hover:text-white">
                          {item.day.slice(8)}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center justify-between text-xs text-neutral-400 pt-1 px-1">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Optimal Load (&lt;
                      {maxPerDay})
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Over Capacity Spike
                      (&gt;{maxPerDay})
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-indigo-400/60" /> Easy Day
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-neutral-500">
                    Target Cap: {maxPerDay} / day
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title="No workload data available">
              {workloadQ.isLoading
                ? 'Calculating forecast...'
                : 'Import or review cards to see workload forecasts.'}
            </EmptyState>
          )}
        </div>
      </Panel>

      {/* Load Smoothing & Easy Days Controls */}
      <Panel
        title={
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-emerald-400" />
            <span>Load Smoothing & Easy Days Configuration</span>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Easy Days Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-200 block">
                Select Easy Days (Reduced / Zero Weekend Volume):
              </label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((name, i) => {
                  const active = easyDays.includes(i)
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleEasyDay(i)}
                      className={`h-9 w-12 rounded-xl text-xs font-semibold transition ${
                        active
                          ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400'
                          : 'bg-white/5 text-neutral-400 border border-white/10 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {name}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-neutral-500">
                Spaced repetition reviews will be routed into adjacent weekdays to keep designated
                rest days calm.
              </p>
            </div>

            {/* Daily Maximum Capacity Target */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label
                  htmlFor={maxPerDaySliderId}
                  className="text-xs font-semibold text-neutral-200"
                >
                  Target Daily Review Cap:
                </label>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {maxPerDay} cards/day
                </span>
              </div>
              <input
                id={maxPerDaySliderId}
                type="range"
                min="15"
                max="150"
                step="5"
                value={maxPerDay}
                onChange={(e) => setMaxPerDay(Number(e.target.value))}
                className="w-full accent-emerald-400"
              />
              <p className="text-[11px] text-neutral-500">
                Spikes above this threshold will be smoothed within a safe +/- 5% interval fuzz
                window.
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-neutral-400">
              Retention Invariant: Only shifts due dates by at most 2 days or 5% of interval (Rule 7
              compliant).
            </span>

            <Button
              variant="primary"
              onClick={() => balanceMutation.mutate()}
              disabled={balanceMutation.isPending || forecast.length === 0}
            >
              <Sparkles className="h-4 w-4 mr-1.5 text-amber-300" />
              {balanceMutation.isPending ? 'Smoothing Spikes...' : 'Smooth Review Spikes'}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  )
}
