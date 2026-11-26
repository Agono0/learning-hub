'use client'

import React from 'react'
import { ListFilter } from 'lucide-react'
import { PageHeader } from '@/ui'
import { StudySessionStudio } from '@/components/study-session/StudySessionStudio'

export default function StudySessionPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Study session"
        subtitle="Pick exactly which cards to study by deck, tag, state, lapses, due date and estimated recall."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-300">
            <ListFilter className="h-3.5 w-3.5" />
            <span>Up to 100 cards</span>
          </span>
        }
      />
      <StudySessionStudio />
    </div>
  )
}
