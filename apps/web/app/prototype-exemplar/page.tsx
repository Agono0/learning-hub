'use client'

import React from 'react'
import { PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { PrototypeExemplarStudio } from '@/components/PrototypeExemplarStudio'

export default function PrototypeExemplarPage() {
  return (
    <ClayIn as="div" className="space-y-6">
      <PageHeader
        title="Prototype & Exemplar Categorization"
        subtitle="Graded category structure, family resemblance, prototype abstraction and exemplar-based classification — Rosch (1975), Nosofsky (1986) and the models fit to your own responses."
      />

      <PrototypeExemplarStudio />
    </ClayIn>
  )
}
