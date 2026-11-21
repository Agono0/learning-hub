/**
 * Learning HUB — Conceptual Change & Ontological Category Shift Studio Page
 *
 * Route: /conceptual-change
 */

'use client'

import React from 'react'
import { ClayIn } from '@/lib/motion'
import { OntologicalShiftStudio } from '@/components/OntologicalShiftStudio'

export default function ConceptualChangePage() {
  return (
    <ClayIn as="div" className="min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <OntologicalShiftStudio />
    </ClayIn>
  )
}
