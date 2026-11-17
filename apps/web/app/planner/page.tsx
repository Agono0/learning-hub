'use client'

/**
 * Study planner (M4): minutes per week + rest day → an optimal weekly template built
 * from the REAL course workload (remaining hours, exam pressure). Exportable
 * as an .ics calendar file (all-day study blocks for the next 8 weeks).
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { PageHeader } from '@/ui'
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
    <div className="space-y-6">
      <PageHeader
        icon={<CalendarPlus className="h-6 w-6 text-indigo-400" />}
        title="Study planner"
        subtitle="Course workload + exam pressure radar → an optimal weekly spaced plan you can keep"
      />

      {engagement.data?.engagement && engagement.data.engagement.sent > 0 && (
        <p className="text-xs text-neutral-500">
          Reminder engagement (7 days): {engagement.data.engagement.clicked} of{' '}
          {engagement.data.engagement.sent} notifications opened (
          {engagement.data.engagement.engagementPct}%).
        </p>
      )}

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
        onRemovePlan={() => removeMutation.mutate()}
        isRebuilding={buildMutation.isPending}
      />
    </div>
  )
}
