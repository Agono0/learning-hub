'use client'

import React from 'react'
import { PageHeader } from '@/ui/PageHeader'
import { ComplexProblemSolvingStudio } from '@/components/ComplexProblemSolvingStudio'

export default function ComplexProblemSolvingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Complex Problem Solving & Micro-Worlds"
        subtitle="Dietrich Dörner (1996) The Logic of Failure, delayed side-effect cascades, and dynamic systems governor telemetry."
      />
      <ComplexProblemSolvingStudio />
    </div>
  )
}
