'use client'

import React from 'react'
import { PageHeader } from '@/ui'
import { PrototypeExemplarStudio } from '@/components/PrototypeExemplarStudio'

export default function CategorizationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Prototype & Exemplar Categorization"
        subtitle="Graded category structure, family resemblance, prototype abstraction and exemplar-based classification — Rosch (1975), Nosofsky (1986), Ashby COVIS (1998) and the models fit to your own responses."
      />

      <PrototypeExemplarStudio />
    </div>
  )
}
