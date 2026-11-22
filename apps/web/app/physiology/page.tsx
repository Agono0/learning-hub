'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, BedDouble, Coffee, Dumbbell, Gauge, Sun, Wind } from 'lucide-react'
import { dayKey } from '@learning-hub/core/src/streaks'
import { apiGet, apiSend } from '@/lib/transport'
import { CardiacCoherenceHUD, PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { BreathingCoherenceStudio } from '@/components/BreathingCoherenceStudio'
import { CircadianAlertnessStudio } from '@/components/CircadianAlertnessStudio'
import { KeyMetricRow } from '@/components/ui/key-metric-row'
import { useGsapReveal } from '@/lib/useGsapReveal'

interface PhysioLog {
  id: number
  date: string
  sleepHours: number | null
  sleepQuality: number | null
  exerciseMinutes: number | null
  exerciseHoursAfterLearning: number | null
  caffeineCutoffHour: number | null
  arousal: number | null
  notes: string | null
}

interface PhysioResponse {
  history: PhysioLog[]
  insights: {
    sleep: {
      shortSleepMean: number | null
      restMean: number | null
      deltaPct: number | null
      nShort: number
      nRest: number
      insight: string
    }
    exercise: { hoursAfterLearning: number | null; nudge: string }
    caffeine: { cutoffHour: number; advice: string }
    arousal: { value: number | null; zone: string; advice: string }
  }
  bedtimeHour: number
}

const numOrEmpty = (v: string): number | null => (v.trim() === '' ? null : Number(v))

export default function PhysiologyPage() {
  const qc = useQueryClient()
  const router = useRouter()
  const [activeView, setActiveView] = useState<'circadian' | 'coherence' | 'log'>('circadian')
  const [form, setForm] = useState({
    sleepHours: '',
    sleepQuality: '',
    exerciseMinutes: '',
    exerciseHoursAfterLearning: '',
    caffeineCutoffHour: '',
    arousal: '',
    notes: '',
  })
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const data = useQuery({
    queryKey: ['physio'],
    queryFn: () => apiGet<PhysioResponse>('/api/physio'),
  })

  const save = useMutation({
    mutationFn: () =>
      apiSend<{ created: boolean }>('/api/physio', 'POST', {
        date: dayKey(new Date()),
        sleepHours: numOrEmpty(form.sleepHours),
        sleepQuality: numOrEmpty(form.sleepQuality),
        exerciseMinutes: numOrEmpty(form.exerciseMinutes),
        exerciseHoursAfterLearning: numOrEmpty(form.exerciseHoursAfterLearning),
        caffeineCutoffHour: numOrEmpty(form.caffeineCutoffHour),
        arousal: numOrEmpty(form.arousal),
        notes: form.notes,
        tzOffset: new Date().getTimezoneOffset(),
      }),
    onSuccess: (res) => {
      setSavedMsg(res.created ? 'Logged' : 'Updated')
      setTimeout(() => setSavedMsg(null), 2500)
      void qc.invalidateQueries({ queryKey: ['physio'] })
    },
  })

  const i = data.data?.insights

  // GSAP reveal (per-page motion mandate): the view switcher's buttons rise in
  // on scroll — motionOK-gated; SSR/tests keep the static content.
  const switcherRef = useGsapReveal<HTMLDivElement>()

  return (
    <ClayIn as="div" className="space-y-5">
      <PageHeader
        icon={<Activity className="h-6 w-6 text-indigo-400" />}
        title="Physiology & Autonomic Resonance"
        subtitle="Cardiac coherence, 0.1 Hz baroreflex breathing, sleep, and physiological readiness."
      />

      {/* View Mode Switcher */}
      <div ref={switcherRef} className="flex gap-2 border-b border-(--hub-border) pb-3">
        <button
          type="button"
          onClick={() => setActiveView('circadian')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors [@media(pointer:coarse)]:min-h-11 ${
            activeView === 'circadian'
              ? 'bg-hub-accent/10 text-hub-accent ring-2 ring-(--ac-strong)'
              : 'text-tertiary hover:bg-hub-accent/5 hover:text-body'
          }`}
        >
          <Sun className="h-4 w-4" />
          <span>Circadian & Cognitive Peaks</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('coherence')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors [@media(pointer:coarse)]:min-h-11 ${
            activeView === 'coherence'
              ? 'bg-hub-accent/10 text-hub-accent ring-2 ring-(--ac-strong)'
              : 'text-tertiary hover:bg-hub-accent/5 hover:text-body'
          }`}
        >
          <Wind className="h-4 w-4" />
          <span>Coherence & Pacer Studio</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('log')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors [@media(pointer:coarse)]:min-h-11 ${
            activeView === 'log'
              ? 'bg-hub-accent/10 text-hub-accent ring-2 ring-(--ac-strong)'
              : 'text-tertiary hover:bg-hub-accent/5 hover:text-body'
          }`}
        >
          <Activity className="h-4 w-4" />
          <span>Daily Log & Correlations</span>
        </button>
      </div>

      {activeView === 'circadian' ? (
        <CircadianAlertnessStudio
          initialBedtime={data.data?.bedtimeHour ?? 23}
          onSyncWithPlanner={() => router.push('/planner')}
        />
      ) : activeView === 'coherence' ? (
        <div className="space-y-4">
          <CardiacCoherenceHUD onOpenStudio={() => {}} isBreathingActive={true} />
          <BreathingCoherenceStudio onNavigateToReview={() => router.push('/review')} />
        </div>
      ) : (
        <>
          {/* daily log form */}
          <div className="panel space-y-3">
            <div className="flex items-center justify-between">
              <p className="label">Today&apos;s log</p>
              {savedMsg && (
                <span className="celebrate text-xs text-status-success-text">{savedMsg}</span>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="label flex items-center gap-1">
                  <BedDouble className="h-3 w-3" /> sleep (h)
                </span>
                <input
                  className="input"
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  value={form.sleepHours}
                  onChange={(e) => setForm({ ...form, sleepHours: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="label">sleep quality (1-5)</span>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="5"
                  value={form.sleepQuality}
                  onChange={(e) => setForm({ ...form, sleepQuality: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="label flex items-center gap-1">
                  <Dumbbell className="h-3 w-3" /> exercise (min)
                </span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="600"
                  value={form.exerciseMinutes}
                  onChange={(e) => setForm({ ...form, exerciseMinutes: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="label">exercise — hours after learning</span>
                <input
                  className="input"
                  type="number"
                  step="0.5"
                  min="0"
                  max="48"
                  value={form.exerciseHoursAfterLearning}
                  onChange={(e) => setForm({ ...form, exerciseHoursAfterLearning: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="label flex items-center gap-1">
                  <Coffee className="h-3 w-3" /> caffeine cutoff (0-23h)
                </span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="23"
                  value={form.caffeineCutoffHour}
                  onChange={(e) => setForm({ ...form, caffeineCutoffHour: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="label flex items-center gap-1">
                  <Gauge className="h-3 w-3" /> arousal (1-10)
                </span>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="10"
                  value={form.arousal}
                  onChange={(e) => setForm({ ...form, arousal: e.target.value })}
                />
              </label>
              <input
                className="input sm:col-span-3"
                placeholder="Notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <button className="btn" onClick={() => save.mutate()} disabled={save.isPending}>
              Save log
            </button>
          </div>

          {/* insight cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="panel space-y-2">
              <p className="label">Sleep vs retention</p>
              <p className="text-sm text-body">{i?.sleep.insight ?? 'Loading…'}</p>
              <KeyMetricRow
                columns={3}
                metrics={[
                  { label: '<6h days', value: String(i?.sleep.nShort ?? 0) },
                  { label: 'Rested days', value: String(i?.sleep.nRest ?? 0) },
                  {
                    label: 'Retention gap',
                    value:
                      i?.sleep.deltaPct != null
                        ? `${Math.abs(i.sleep.deltaPct).toFixed(1)} pp`
                        : '—',
                  },
                ]}
              />
            </div>
            <div className="panel space-y-2">
              <p className="label">Exercise timing (van Dongen 2016)</p>
              <p className="text-sm text-body">{i?.exercise.nudge ?? 'Loading…'}</p>
              <p className="text-xs text-tertiary">
                {i?.exercise.hoursAfterLearning != null
                  ? `last logged: T+${i.exercise.hoursAfterLearning}h`
                  : 'no exercise logged yet'}
              </p>
            </div>
            <div className="panel space-y-2">
              <p className="label">Caffeine cutoff (8h rule)</p>
              <p className="text-sm text-body">{i?.caffeine.advice ?? 'Loading…'}</p>
              <p className="text-xs text-tertiary">
                assumes bedtime {data.data?.bedtimeHour ?? 23}:00 — keep your cutoff hour in the
                daily log for precision
              </p>
            </div>
            <div className="panel space-y-2">
              <p className="label">Yerkes-Dodson zone</p>
              <p className="text-sm capitalize text-body">
                {i?.arousal.zone ?? '—'}
                {i?.arousal.value != null ? ` (arousal ${i.arousal.value}/10)` : ''}
              </p>
              <p className="text-xs text-tertiary">
                {i?.arousal.advice ?? 'Log arousal to place yourself on the inverted-U.'}
              </p>
            </div>
          </div>

          {/* history */}
          <div className="panel">
            <p className="label mb-2">History</p>
            {(data.data?.history.length ?? 0) === 0 ? (
              <p className="text-sm text-tertiary">No logs yet — save today&apos;s numbers.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-tertiary">
                    <tr>
                      <th className="py-1 pr-3">date</th>
                      <th className="py-1 pr-3">sleep</th>
                      <th className="py-1 pr-3">quality</th>
                      <th className="py-1 pr-3">exercise</th>
                      <th className="py-1 pr-3">T+</th>
                      <th className="py-1 pr-3">arousal</th>
                      <th className="py-1">notes</th>
                    </tr>
                  </thead>
                  <tbody className="text-secondary">
                    {data.data?.history.slice(0, 14).map((h) => (
                      <tr
                        key={h.id}
                        className="border-t border-neutral-200 dark:border-(--hub-border)"
                      >
                        <td className="py-1.5 pr-3">{h.date}</td>
                        <td className="py-1.5 pr-3">{h.sleepHours ?? '—'}</td>
                        <td className="py-1.5 pr-3">{h.sleepQuality ?? '—'}</td>
                        <td className="py-1.5 pr-3">{h.exerciseMinutes ?? '—'}</td>
                        <td className="py-1.5 pr-3">
                          {h.exerciseHoursAfterLearning != null
                            ? `+${h.exerciseHoursAfterLearning}h`
                            : '—'}
                        </td>
                        <td className="py-1.5 pr-3">{h.arousal ?? '—'}</td>
                        <td className="py-1.5 max-w-40 truncate">{h.notes ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </ClayIn>
  )
}
