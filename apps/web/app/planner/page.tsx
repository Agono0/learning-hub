'use client'

/**
 * Study planner (M4): minutes per week + rest day → a weekly template built
 * from the REAL course workload (remaining hours, exam pressure). Exportable
 * as an .ics calendar file (all-day study blocks for the next 8 weeks).
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, RefreshCw, Trash2 } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { PageHeader, Panel, EmptyState } from '@/ui'

interface PlannerCourse {
  courseId: number
  title: string
  estHours: number
  progressFraction: number
  examDate: string | null
}
interface PlannerBlock {
  day: number
  minutes: number
  courseId: number | null
  label: string
}
interface WeeklyPlanShape {
  weeks: number
  weeklyMinutes: number
  restDay: number | null
  blocks: PlannerBlock[]
}
interface PlannerData {
  saved: {
    weeklyMinutes: number
    restDay: number | null
    plan: WeeklyPlanShape
    updatedAt: string
  } | null
  courses: PlannerCourse[]
  exams: { id: number; title: string; date: string }[]
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function PlannerPage() {
  const qc = useQueryClient()
  const { data } = useQuery<PlannerData>({
    queryKey: ['study-plan'],
    queryFn: () => apiGet<PlannerData>('/api/study-plan'),
  })
  const [weeklyMinutes, setWeeklyMinutes] = useState(180)
  const [restDay, setRestDay] = useState<number | ''>('')
  const [touched, setTouched] = useState(false)

  const saved = data?.saved ?? null
  // seed the form from the saved plan once (the user may still edit it)
  useEffect(() => {
    if (saved && !touched) {
      setWeeklyMinutes(saved.weeklyMinutes)
      setRestDay(saved.restDay ?? '')
    }
  }, [saved, touched])

  const build = useMutation({
    mutationFn: () =>
      apiSend<{ ok: boolean; plan: WeeklyPlanShape }>('/api/study-plan', 'POST', {
        weeklyMinutes,
        restDay: restDay === '' ? null : restDay,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['study-plan'] }),
  })
  const remove = useMutation({
    mutationFn: () => apiSend('/api/study-plan', 'DELETE'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['study-plan'] }),
  })

  const plan = saved?.plan ?? null

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<CalendarPlus className="h-6 w-6 text-indigo-400" />}
        title="Study planner"
        subtitle="Course workload + exam dates → a weekly plan you can keep"
      />

      <Panel title="Build the plan">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="label mb-1">Minutes per week</div>
            <input
              type="number"
              className="input w-32"
              min={30}
              max={3000}
              step={15}
              value={weeklyMinutes}
              onChange={(e) => {
                setTouched(true)
                setWeeklyMinutes(Number(e.target.value))
              }}
            />
          </div>
          <div>
            <div className="label mb-1">Rest day</div>
            <select
              className="input w-32"
              value={restDay}
              onChange={(e) => {
                setTouched(true)
                setRestDay(e.target.value === '' ? '' : Number(e.target.value))
              }}
            >
              <option value="">none</option>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" onClick={() => build.mutate()} disabled={build.isPending}>
            <RefreshCw className="h-4 w-4" /> {saved ? 'Rebuild plan' : 'Build plan'}
          </button>
          {saved && (
            <>
              <a className="btn-ghost" href="/api/study-plan?format=ics" download>
                <CalendarPlus className="h-4 w-4" /> Export .ics
              </a>
              <button className="btn-ghost text-red-400" onClick={() => remove.mutate()}>
                <Trash2 className="h-4 w-4" /> Remove
              </button>
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          The split follows remaining course hours (exam within 30 days counts double) and spreads
          sittings across days — spaced and interleaved, never one marathon.
        </p>
      </Panel>

      {plan ? (
        <Panel title={`Weekly template — ~${plan.weeks} week(s) to done`}>
          <div className="grid gap-2 sm:grid-cols-7">
            {DAYS.map((d, i) => {
              const blocks = plan.blocks.filter((b) => b.day === i)
              const isRest = plan.restDay === i
              return (
                <div
                  key={d}
                  className="rounded-lg border border-neutral-200 p-2 text-xs dark:border-[#26262b]"
                >
                  <div className={`font-semibold ${isRest ? 'text-neutral-500' : ''}`}>
                    {d}
                    {isRest && ' · rest'}
                  </div>
                  <div className="mt-1 space-y-1">
                    {blocks.map((b, j) => (
                      <div key={j} className="rounded bg-indigo-600/10 px-1.5 py-1 text-indigo-300">
                        {b.label}
                        <span className="ml-1 text-[10px] text-neutral-500">{b.minutes}m</span>
                      </div>
                    ))}
                    {blocks.length === 0 && !isRest && (
                      <div className="text-neutral-600 dark:text-neutral-500">free</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      ) : (
        <EmptyState title="No plan yet">
          {(data?.courses.length ?? 0) > 0
            ? 'Pick your weekly minutes and build one — it uses your real course progress.'
            : 'Import a course first — the planner distributes its workload across your week.'}
        </EmptyState>
      )}

      {(data?.exams.length ?? 0) > 0 && (
        <Panel title="Upcoming exams considered">
          <ul className="space-y-1 text-sm text-neutral-400">
            {data!.exams.map((e) => (
              <li key={e.id}>
                {e.title} · <span className="text-neutral-500">{e.date}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
