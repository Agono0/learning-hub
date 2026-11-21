'use client'

/**
 * Study Planner Matrix — Interactive 7-day study block scheduler,
 * exam pressure radar, and spaced countdown pacing engine.
 *
 * Implements cognitive pacing principles:
 * - Distributed practice (Cepeda et al. 2006/2008): optimal review gaps
 * - Pre-exam expressive writing & mock checkpoint (Ramirez & Beilock 2011)
 * - Workload balancing based on real course progress and exam proximity
 */
import { useState } from 'react'
import {
  AlertTriangle,
  CalendarCheck,
  Clock,
  Download,
  GraduationCap,
  Minus,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react'
import { Badge, Button, IconButton, Panel } from '@/ui'

export interface PlannerCourse {
  courseId: number
  title: string
  estHours: number
  progressFraction: number
  examDate: string | null
}

export interface PlannerBlock {
  day: number
  minutes: number
  courseId: number | null
  label: string
}

export interface WeeklyPlanShape {
  weeks: number
  weeklyMinutes: number
  restDay: number | null
  blocks: PlannerBlock[]
}

export interface UpcomingExam {
  id: number
  title: string
  date: string
}

export interface StudyPlannerMatrixProps {
  plan: WeeklyPlanShape | null
  courses: PlannerCourse[]
  exams: UpcomingExam[]
  weeklyMinutes: number
  restDay: number | ''
  onUpdateWeeklyMinutes: (minutes: number) => void
  onUpdateRestDay: (day: number | '') => void
  onRebuildPlan: () => void
  onRemovePlan: () => void
  isRebuilding: boolean
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Calculate days between today and an ISO target date */
function calculateDaysUntil(dateString: string): number {
  const target = new Date(dateString)
  const today = new Date()
  const diffTime = target.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

/** Optimal spacing gap calculation based on Cepeda et al. (2006/2008) */
function calculateOptimalReviewGap(daysUntilExam: number): string {
  if (daysUntilExam <= 1) return 'Immediate final retrieval'
  if (daysUntilExam <= 7) return 'Review every 1–2 days'
  if (daysUntilExam <= 30) return 'Review every 3–5 days'
  if (daysUntilExam <= 90) return 'Review every 7–12 days'
  return 'Review every 14–21 days'
}

export function StudyPlannerMatrix({
  plan,
  courses,
  exams,
  weeklyMinutes,
  restDay,
  onUpdateWeeklyMinutes,
  onUpdateRestDay,
  onRebuildPlan,
  onRemovePlan,
  isRebuilding,
}: StudyPlannerMatrixProps) {
  const [activeDayAdjustment, setActiveDayAdjustment] = useState<Record<number, number>>({})

  const adjustDayMinutes = (day: number, delta: number) => {
    setActiveDayAdjustment((prev) => {
      const current = prev[day] ?? 0
      const next = Math.max(-60, Math.min(120, current + delta))
      return { ...prev, [day]: next }
    })
  }

  return (
    <div className="space-y-6">
      {/* Configuration & Quick Actions Panel */}
      <Panel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 dark:text-faint mb-1">
                Target Minutes / Week
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={30}
                  max={3000}
                  step={15}
                  value={weeklyMinutes}
                  onChange={(e) => onUpdateWeeklyMinutes(Number(e.target.value))}
                  className="w-32 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm font-mono text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/40"
                />
                <span className="text-xs text-tertiary font-mono">
                  (~{Math.round((weeklyMinutes / 60) * 10) / 10}h)
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 dark:text-faint mb-1">
                Designated Rest Day
              </label>
              <select
                value={restDay}
                onChange={(e) =>
                  onUpdateRestDay(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="">None (7 active days)</option>
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d} (Full Rest)
                  </option>
                ))}
              </select>
            </div>

            <Button
              icon={<Sparkles className="h-4 w-4" />}
              loading={isRebuilding}
              onClick={onRebuildPlan}
            >
              {plan ? 'Recompute Optimal Pacing' : 'Build Study Plan'}
            </Button>
          </div>

          {plan ? (
            <div className="flex items-center gap-2">
              <a
                href="/api/study-plan?format=ics"
                download="learning-hub-study-schedule.ics"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition"
              >
                <Download className="h-3.5 w-3.5" />
                Export 8-Week .ICS
              </a>
              <IconButton
                label="Remove Plan"
                onClick={onRemovePlan}
                className="rounded-lg hover:bg-rose-50 hover:text-danger-text dark:hover:bg-rose-950/30 dark:hover:text-danger-text"
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          ) : null}
        </div>
      </Panel>

      {/* Interactive 7-Day Visual Matrix */}
      {plan ? (
        <Panel
          title={
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span>Weekly Schedule Matrix</span>
                <Badge tone="accent">~{plan.weeks} Weeks to Full Mastery</Badge>
              </div>
              <span className="text-xs text-tertiary font-normal">
                Spaced and interleaved across active days
              </span>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-7">
            {DAYS.map((dayName, dayIndex) => {
              const blocks = plan.blocks.filter((b) => b.day === dayIndex)
              const isRest = plan.restDay === dayIndex
              const adjustment = activeDayAdjustment[dayIndex] ?? 0
              const totalBaseMinutes = blocks.reduce((acc, b) => acc + b.minutes, 0)
              const effectiveMinutes = Math.max(0, totalBaseMinutes + adjustment)

              return (
                <div
                  key={dayName}
                  className={`flex flex-col justify-between rounded-xl border p-3 transition min-h-[170px] ${
                    isRest
                      ? 'border-dashed border-neutral-300 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 opacity-75'
                      : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between pb-1.5 border-b border-neutral-100 dark:border-neutral-800/80">
                      <span
                        className={`text-xs font-bold ${isRest ? 'text-faint' : 'text-neutral-900 dark:text-neutral-100'}`}
                      >
                        {dayName}
                      </span>
                      {isRest ? (
                        <Badge tone="neutral">REST</Badge>
                      ) : (
                        <span className="text-[10px] font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                          {effectiveMinutes}m
                        </span>
                      )}
                    </div>

                    <div className="mt-2.5 space-y-1.5">
                      {isRest ? (
                        <div className="text-center py-6 text-[11px] text-faint italic">
                          Cognitive rest & synaptic consolidation
                        </div>
                      ) : blocks.length > 0 ? (
                        blocks.map((block, bIdx) => (
                          <div
                            key={bIdx}
                            className="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 p-2 text-xs"
                          >
                            <div className="font-semibold text-indigo-950 dark:text-indigo-200 truncate">
                              {block.label}
                            </div>
                            <div className="flex items-center justify-between mt-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-mono">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {block.minutes} min
                              </span>
                              <span>Block #{bIdx + 1}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 text-[11px] text-faint">Free Day</div>
                      )}
                    </div>
                  </div>

                  {!isRest ? (
                    <div className="pt-2 mt-2 border-t border-neutral-100 dark:border-neutral-800/80 flex items-center justify-between text-[10px] text-tertiary">
                      <span>Tune day:</span>
                      <div className="flex items-center gap-1">
                        <IconButton
                          label="-15 mins"
                          size="sm"
                          variant="bare"
                          onClick={() => adjustDayMinutes(dayIndex, -15)}
                          className="rounded hover:bg-neutral-100 text-neutral-600 dark:bg-transparent dark:hover:bg-neutral-800 dark:text-faint"
                        >
                          <Minus className="h-3 w-3" />
                        </IconButton>
                        <IconButton
                          label="+15 mins"
                          size="sm"
                          variant="bare"
                          onClick={() => adjustDayMinutes(dayIndex, 15)}
                          className="rounded hover:bg-neutral-100 text-neutral-600 dark:bg-transparent dark:hover:bg-neutral-800 dark:text-faint"
                        >
                          <Plus className="h-3 w-3" />
                        </IconButton>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </Panel>
      ) : null}

      {/* Exam Pressure & Spaced Countdown Radar */}
      {exams.length > 0 ? (
        <Panel
          title={
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-danger-text" />
              <span>Exam Pressure & Countdown Radar</span>
              <Badge tone="danger">{exams.length} Upcoming</Badge>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {exams.map((exam) => {
              const daysLeft = calculateDaysUntil(exam.date)
              const isUrgent = daysLeft >= 0 && daysLeft <= 7
              const isModerate = daysLeft > 7 && daysLeft <= 30
              const optimalGap = calculateOptimalReviewGap(daysLeft)

              return (
                <div
                  key={exam.id}
                  className={`rounded-xl border p-4 space-y-3 transition ${
                    isUrgent
                      ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20'
                      : isModerate
                        ? 'border-amber-300 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                        <GraduationCap className="h-4 w-4 text-ac-text" />
                        {exam.title}
                      </h4>
                      <p className="text-xs text-tertiary font-mono mt-0.5">
                        Scheduled for: {exam.date}
                      </p>
                    </div>

                    <Badge tone={isUrgent ? 'danger' : isModerate ? 'warning' : 'success'}>
                      {daysLeft < 0
                        ? 'Completed'
                        : daysLeft === 0
                          ? 'Today'
                          : daysLeft === 1
                            ? 'Tomorrow'
                            : `${daysLeft} Days Left`}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs text-neutral-600 dark:text-secondary border-t border-neutral-100 dark:border-neutral-800/80 pt-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-tertiary">Optimal Review Spacing:</span>
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        {optimalGap}
                      </span>
                    </div>

                    {isUrgent ? (
                      <div className="mt-2 rounded-lg bg-rose-100/60 dark:bg-rose-900/30 p-2.5 text-[11px] text-rose-800 dark:text-rose-200 space-y-1">
                        <div className="flex items-center gap-1 font-bold">
                          <AlertTriangle className="h-3.5 w-3.5" /> High Stakes Phase (Final Week)
                        </div>
                        <p>
                          Avoid massed cramming. Take a timed mock exam and complete a 10-minute
                          expressive writing bout to offload test anxiety (Ramirez & Beilock).
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      ) : null}

      {/* Active Enrolled Courses Overview */}
      {courses.length > 0 ? (
        <Panel
          title={
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-status-success-text" />
              <span>Enrolled Course Workloads</span>
              <Badge tone="neutral">{courses.length} Active</Badge>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {courses.map((c) => (
              <div
                key={c.courseId}
                className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 bg-neutral-50/50 dark:bg-neutral-900/50 space-y-2 text-xs"
              >
                <div className="font-bold text-neutral-900 dark:text-neutral-100 truncate">
                  {c.title}
                </div>
                <div className="flex items-center justify-between text-tertiary font-mono text-[11px]">
                  <span>Workload: ~{c.estHours}h</span>
                  <span>{Math.round(c.progressFraction * 100)}% done</span>
                </div>
                <div className="w-full bg-neutral-200 dark:bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.round(c.progressFraction * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  )
}
