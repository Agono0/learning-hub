'use client'

import React from 'react'

/**
 * Study planner (M4): minutes per week + rest day → an optimal weekly template built
 * from the REAL course workload (remaining hours, exam pressure). Exportable
 * as an .ics calendar file (all-day study blocks for the next 8 weeks).
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, CalendarCheck, Copy, Check } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { PageHeader } from '@/ui'
import { ClayIn, staggerDelay } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
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
import {
  StudyPlannerMatrix,
  type PlannerCourse,
  type WeeklyPlanShape,
} from '@/components/StudyPlannerMatrix'

interface PlannerData {
  savedPlan: WeeklyPlanShape | null
  courses: PlannerCourse[]
  savedWeeklyMinutes: number
  savedRestDay: number | null
  exams?: { id: number; title: string; date: string }[]
}

export default function PlannerPage() {
  const qc = useQueryClient()
  // GSAP reveal ref for the planner matrix (see the wrapper below).
  const matrixRevealRef = useGsapReveal<HTMLDivElement>()
  const { data } = useQuery<PlannerData>({
    queryKey: ['study-plan'],
    queryFn: () => apiGet<PlannerData>('/api/study-plan'),
  })

  // Reminder engagement (F-08④): notification clicks vs sends, trailing week.
  const engagement = useQuery<{
    ok: boolean
    engagement?: { sent: number; clicked: number; engagementPct: number }
  }>({
    queryKey: ['reminder-engagement'],
    queryFn: () => apiGet('/api/reminders/log?limit=1'),
  })

  const [weeklyMinutes, setWeeklyMinutes] = useState(180)
  const [restDay, setRestDay] = useState<number | ''>('')
  const [touched, setTouched] = useState(false)
  // Destructive confirmation (S6): removing the saved plan goes through
  // an alert dialog before the DELETE mutation fires.
  const [confirmRemove, setConfirmRemove] = useState(false)

  const savedPlan = data?.savedPlan ?? null

  // seed the form from the saved plan once
  useEffect(() => {
    if (data && !touched) {
      setWeeklyMinutes(data.savedWeeklyMinutes ?? 180)
      setRestDay(data.savedRestDay ?? '')
    }
  }, [data, touched])

  const buildMutation = useMutation({
    mutationFn: () =>
      apiSend<{ ok: boolean; plan: WeeklyPlanShape }>('/api/study-plan', 'POST', {
        weeklyMinutes,
        restDay: restDay === '' ? null : restDay,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['study-plan'] }),
  })

  const removeMutation = useMutation({
    mutationFn: () => apiSend('/api/study-plan', 'DELETE'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['study-plan'] }),
  })

  const derivedExams = (data?.courses ?? [])
    .filter((c): c is PlannerCourse & { examDate: string } => !!c.examDate)
    .map((c) => ({
      id: c.courseId,
      title: `${c.title} Exam`,
      date: c.examDate,
    }))

  return (
    // Entrance choreography: the four blocks rise + fade in on the clay spring,
    // 40ms apart (`staggerDelay`), total <300ms (motion law: transform/opacity
    // only, gated by `motionOK`). SSR renders the final state; the animation is
    // client-only, so hydration output is unchanged. The engagement line is
    // wrapped inside its conditional so the wrapper only exists once the query
    // delivers data (no empty-div rhythm shift while it is absent).
    <div className="space-y-6">
      <ClayIn>
        <PageHeader
          icon={<CalendarPlus className="h-6 w-6 text-indigo-400" />}
          title="Study planner"
          subtitle="Course workload + exam pressure radar → an optimal weekly spaced plan you can keep"
        />
      </ClayIn>

      <ClayIn delayS={staggerDelay(1)}>
        <CalendarSubscriptionCard />
      </ClayIn>

      {engagement.data?.engagement && engagement.data.engagement.sent > 0 && (
        <ClayIn as="div" delayS={staggerDelay(2)}>
          <p className="text-xs text-tertiary">
            Reminder engagement (7 days): {engagement.data.engagement.clicked} of{' '}
            {engagement.data.engagement.sent} notifications opened (
            {engagement.data.engagement.engagementPct}%).
          </p>
        </ClayIn>
      )}

      <ClayIn delayS={staggerDelay(3)}>
        {/* GSAP moment for this page: the planner matrix rises in with a capped
            stagger when it scrolls into view — the wrapper above is the framer
            owner, this inner container is a different node. */}
        <div ref={matrixRevealRef}>
          <StudyPlannerMatrix
            plan={savedPlan}
            courses={data?.courses ?? []}
            exams={data?.exams && data.exams.length > 0 ? data.exams : derivedExams}
            weeklyMinutes={weeklyMinutes}
            restDay={restDay}
            onUpdateWeeklyMinutes={(mins) => {
              setTouched(true)
              setWeeklyMinutes(mins)
            }}
            onUpdateRestDay={(day) => {
              setTouched(true)
              setRestDay(day)
            }}
            onRebuildPlan={() => buildMutation.mutate()}
            onRemovePlan={() => setConfirmRemove(true)}
            isRebuilding={buildMutation.isPending}
          />
        </div>
      </ClayIn>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the saved study plan?</AlertDialogTitle>
            <AlertDialogDescription>
              The weekly template and its calendar blocks are deleted. You can rebuild a new plan
              any time — your courses and progress are not touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removeMutation.isPending}
              onClick={() => {
                setConfirmRemove(false)
                removeMutation.mutate()
              }}
            >
              Remove plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * "Add to calendar" card for the live `/api/calendar.ics` feed. The handler
 * was fully built (exams + weekly plan blocks + review forecast) but had no
 * UI entry point anywhere — this panel is that entry point. `webcal://` is
 * the scheme calendar apps register for; the https fallback covers browsers.
 */
function CalendarSubscriptionCard() {
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const feedUrl = origin ? `${origin}/api/calendar.ics` : '/api/calendar.ics'
  const webcalUrl = feedUrl.replace(/^https?:/, 'webcal:')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable (e.g. insecure context) — the anchor still works */
    }
  }

  return (
    <div className="panel flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-ac-text dark:text-indigo-400">
          <CalendarCheck className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-strong">Add to calendar</h3>
          <p className="text-xs text-tertiary dark:text-faint">
            Live feed: exam dates, this week&apos;s plan blocks, and the 7-day review forecast —
            updates automatically in your calendar app.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={webcalUrl}
          className="btn min-h-[44px]"
          aria-label="Subscribe to the study calendar feed"
        >
          Subscribe
        </a>
        <button
          type="button"
          onClick={() => void copy()}
          className="btn min-h-[44px]"
          aria-label="Copy the calendar feed URL"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy URL'}
        </button>
      </div>
    </div>
  )
}
