/**
 * Learning HUB — Multi-Representational Fluency & Representational Competence Studio Page
 *
 * Route: /representations
 */

'use client'

import React from 'react'
import { ClayIn } from '@/lib/motion'
import { RepresentationalFluencyStudio } from '@/components/RepresentationalFluencyStudio'

export default function RepresentationsPage() {
  return (
    <ClayIn as="div" className="min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <RepresentationalFluencyStudio />
    </ClayIn>
  )
}
