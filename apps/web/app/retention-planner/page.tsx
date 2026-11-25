'use client'

import { PageHeader } from '@/ui'
import { RetentionPlannerStudio } from '@/components/retention-planner/RetentionPlannerStudio'

export default function RetentionPlannerPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Retention Planner"
        subtitle="See how many daily review minutes your current cards cost at different desired retentions, under a stated model. It is an estimate, not a learning-optimal answer."
      />
      <RetentionPlannerStudio />
    </div>
  )
}
