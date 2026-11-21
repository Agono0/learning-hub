'use client'

import React from 'react'
import { PageHeader } from '@/ui/PageHeader'
import { ClayIn } from '@/lib/motion'
import { SystemDynamicsStudio } from '@/components/SystemDynamicsStudio'

export default function SystemDynamicsPage() {
  return (
    <ClayIn as="div" className="space-y-6">
      <PageHeader
        title="System Dynamics & Feedback Modeling"
        subtitle="Forrester (1968), Sterman (2000) & Meadows (2008) stock-flow simulation, causal loops, and systemic leverage points."
      />
      <SystemDynamicsStudio />
    </ClayIn>
  )
}
