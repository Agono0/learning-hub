'use client'

/**
 * Workload Balancer & Easy Days Dialog:
 * Visualizes 30-day upcoming review load, smooths peaks using safe interval fuzz (+/-5%),
 * sets easy days (e.g. low-load weekends), and recovers from overdue backlogs.
 *
 * Adheres to AGENTS.md Rule 1 (apiGet/apiSend only), Rule 7 (only modifies card due dates),
 * and mobile-first design (works at 360px).
 */
import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, CheckCircle2, Flame, Sliders, Sparkles, X } from 'lucide-react'
import { IconButton } from '@/ui'
import { apiGet, apiSend } from '@/lib/transport'
import { queryKeys } from '@/lib/query-keys'

interface ForecastItem {
  day: string
  count: number
}

interface WorkloadResponse {
  ok: boolean
  totalCards: number
  overdueCount: number
  forecast: ForecastItem[]
  shiftedCount?: number
}

interface WorkloadBalancerModalProps {
  isOpen: boolean
  onClose: () => void
  deckId?: number
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function WorkloadBalancerModal({ isOpen, onClose, deckId }: WorkloadBalancerModalProps) {
  const queryClient = useQueryClient()
  const [easyDays, setEasyDays] = useState<number[]>([0, 6]) // Default weekends
  const [maxPerDay, setMaxPerDay] = useState<number>(50)
  const [dailyBacklogCap, setDailyBacklogCap] = useState<number>(30)
  const [feedback, setFeedback] = useState<string | null>(null)

  const { data, isLoading } = useQuery<WorkloadResponse>({
    queryKey: queryKeys.workload.forDeck(deckId),
    queryFn: () => {
      const qs = new URLSearchParams({ days: '30' })
      if (deckId) qs.set('deckId', String(deckId))
      return apiGet(`/api/workload?${qs.toString()}`)
    },
    enabled: isOpen,
  })

  const balanceMutation = useMutation({
    mutationFn: async () => {
      return apiSend<WorkloadResponse>('/api/workload', 'POST', {
        action: 'balance',
        deckId,
        days: 30,
        maxPerDay,
        easyDays,
      })
    },
    onSuccess: (res) => {
      setFeedback(`Smoothed ${res.shiftedCount ?? 0} reviews without compromising retention.`)
      void queryClient.invalidateQueries({ queryKey: queryKeys.workload.all })
      void queryClient.invalidateQueries({ queryKey: ['review'] })
      void queryClient.invalidateQueries({ queryKey: queryKeys.decks })
    },
  })

  const catchUpMutation = useMutation({
    mutationFn: async () => {
      return apiSend<WorkloadResponse>('/api/workload', 'POST', {
        action: 'catch_up',
        deckId,
        days: 30,
        dailyCap: dailyBacklogCap,
      })
    },
    onSuccess: (res) => {
      setFeedback(`Spread ${res.shiftedCount ?? 0} backlog cards lowest-stability first.`)
      void queryClient.invalidateQueries({ queryKey: queryKeys.workload.all })
      void queryClient.invalidateQueries({ queryKey: ['review'] })
      void queryClient.invalidateQueries({ queryKey: queryKeys.decks })
    },
  })

  if (!isOpen) return null

  const forecast = data?.forecast ?? []
  const maxForecast = Math.max(...forecast.map((f) => f.count), 1)
  const overdueCount = data?.overdueCount ?? 0

  const toggleEasyDay = (d: number) => {
    setEasyDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-neutral-100">Spaced Review Workload Balancer</h2>
          </div>
          <IconButton
            label="Close dialog"
            onClick={onClose}
            className="rounded-lg text-faint hover:bg-neutral-800 hover:text-neutral-100"
          >
            <X className="h-5 w-5" />
          </IconButton>
        </div>

        {feedback && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-950/60 border border-emerald-700/50 p-3 text-xs text-status-success-text">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* 30-Day Forecast Visualizer */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-faint">
            <span className="flex items-center gap-1.5 font-medium">
              <Calendar className="h-4 w-4" /> 30-Day Due Forecast ({data?.totalCards ?? 0} total
              active cards)
            </span>
            {overdueCount > 0 && (
              <span className="flex items-center gap-1 font-semibold text-danger-text">
                <Flame className="h-3.5 w-3.5" /> {overdueCount} Overdue
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="h-28 flex items-center justify-center text-xs text-tertiary">
              Calculating load distribution...
            </div>
          ) : (
            <div className="h-32 flex items-end gap-1 rounded-xl bg-neutral-950/80 p-3 border border-neutral-800/80 overflow-x-auto">
              {forecast.map((item, idx) => {
                const dateObj = new Date(item.day + 'T12:00:00Z')
                const isEasy = easyDays.includes(dateObj.getDay())
                const heightPct = Math.round((item.count / maxForecast) * 100)
                const isToday = idx === 0

                return (
                  <div
                    key={item.day}
                    className="flex-1 min-w-[14px] flex flex-col items-center gap-1 group relative"
                    title={`${item.day}: ${item.count} due`}
                  >
                    <div className="w-full flex items-end h-20">
                      <div
                        style={{ height: `${Math.max(heightPct, 4)}%` }}
                        className={`w-full rounded-t transition-all ${
                          isToday
                            ? 'bg-amber-400'
                            : isEasy
                              ? 'bg-neutral-600'
                              : item.count > maxPerDay
                                ? 'bg-rose-500'
                                : 'bg-indigo-500'
                        }`}
                      />
                    </div>
                    <span className="text-[9px] text-tertiary truncate select-none">
                      {idx % 5 === 0 ? item.day.slice(5) : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Controls: Easy Days & Smoothing */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
              Easy Days (Low / Zero Load)
            </h3>
            <p className="text-xs text-tertiary">
              Select days of the week when reviews should be smoothly rescheduled onto adjacent
              days.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((name, idx) => {
                const active = easyDays.includes(idx)
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleEasyDay(idx)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                      active
                        ? 'bg-indigo-600 text-white'
                        : 'bg-neutral-800 text-tertiary hover:bg-neutral-700'
                    }`}
                  >
                    {name}
                  </button>
                )
              })}
            </div>

            <div className="pt-2">
              <label className="text-xs text-faint block mb-1">
                Max Daily Cap: <span className="font-semibold text-neutral-200">{maxPerDay}</span>{' '}
                reviews
              </label>
              <input
                type="range"
                min="10"
                max="200"
                step="5"
                value={maxPerDay}
                onChange={(e) => setMaxPerDay(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>

            <button
              type="button"
              disabled={balanceMutation.isPending}
              onClick={() => balanceMutation.mutate()}
              className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {balanceMutation.isPending ? 'Smoothing Load...' : 'Smooth Load & Apply Easy Days'}
            </button>
          </div>

          {/* Backlog Recovery */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
              Overdue Backlog Recovery
            </h3>
            <p className="text-xs text-tertiary">
              Gradually spread accumulated overdue cards over future days. Prioritizes lowest
              stability cards first to salvage decaying memory traces.
            </p>

            <div>
              <label className="text-xs text-faint block mb-1">
                Daily Catch-Up Cap:{' '}
                <span className="font-semibold text-neutral-200">{dailyBacklogCap}</span> cards/day
              </label>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={dailyBacklogCap}
                onChange={(e) => setDailyBacklogCap(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>

            <div className="text-xs text-faint">
              Current Overdue:{' '}
              <span
                className={`font-semibold ${overdueCount > 0 ? 'text-danger-text' : 'text-status-success-text'}`}
              >
                {overdueCount} cards
              </span>
            </div>

            <button
              type="button"
              disabled={catchUpMutation.isPending || overdueCount === 0}
              onClick={() => catchUpMutation.mutate()}
              className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50"
            >
              <Flame className="h-4 w-4" />
              {catchUpMutation.isPending ? 'Rescheduling...' : 'Recover Overdue Backlog'}
            </button>
          </div>
        </div>

        <div className="text-right pt-2 border-t border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
