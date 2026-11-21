/**
 * Learning HUB — Spatial Cognition & Mental Rotation Model-Checking Studio Page
 *
 * Route: /spatial
 * Grounded in:
 * - Roger Shepard & Jacqueline Metzler (1971) - Mental Rotation of Three-Dimensional Objects
 * - Mary Hegarty (2004) - Mechanical Reasoning by Mental Simulation
 * - Barbara Tversky (1993, 2005) - Spatial Schemas & Spatial Mental Models
 * - David H. Uttal et al. (2013) - The Malleability of Spatial Skills
 */

'use client'

import React from 'react'
import { ClayIn } from '@/lib/motion'
import { SpatialCognitionStudio } from '@/components/SpatialCognitionStudio'

export default function SpatialCognitionPage() {
  return (
    <ClayIn as="div" className="min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <SpatialCognitionStudio />
    </ClayIn>
  )
}
