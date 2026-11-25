'use client'

import React from 'react'
import { Target } from 'lucide-react'
import { PageHeader } from '@/ui'
import { ReadinessStudio } from '@/components/readiness/ReadinessStudio'

export default function ReadinessPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Exam readiness"
        subtitle="See how much of what you have studied the memory model expects you to recall on exam day, and where a review helps most."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-300">
            <Target className="h-3.5 w-3.5" />
            <span>Model estimate</span>
          </span>
        }
      />
      <ReadinessStudio />
    </div>
  )
}
