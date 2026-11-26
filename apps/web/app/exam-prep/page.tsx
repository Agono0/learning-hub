'use client'

import React from 'react'
import { CalendarClock } from 'lucide-react'
import { PageHeader } from '@/ui'
import { ExamPrepStudio } from '@/components/exam-prep/ExamPrepStudio'

export default function ExamPrepPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Exam prep"
        subtitle="A day-by-day review schedule toward your exam, built from the same memory model as exam readiness."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-300">
            <CalendarClock className="h-3.5 w-3.5" />
            <span>Model estimate</span>
          </span>
        }
      />
      <ExamPrepStudio />
    </div>
  )
}
