'use client'

import React from 'react'
import { PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { KnowledgeSpaceStudio } from '@/components/KnowledgeSpaceStudio'

export default function KnowledgeSpacePage() {
  return (
    <ClayIn as="div" className="space-y-6">
      <PageHeader
        title="Knowledge Space Theory & Adaptive Prerequisite Studio"
        subtitle="Mathematical knowledge structures, surmise relations, well-graded learning spaces, and Markovian adaptive assessment (Doignon & Falmagne 1985, 1999)."
      />

      <KnowledgeSpaceStudio />
    </ClayIn>
  )
}
