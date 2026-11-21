/**
 * Learning HUB — Dual-Process Diagnostic & Cognitive Forcing Studio Page
 *
 * Route: /dual-process
 */

'use client'

import React from 'react'
import { ClayIn } from '@/lib/motion'
import { DualProcessStudio } from '@/components/DualProcessStudio'

export default function DualProcessPage() {
  return (
    <ClayIn as="div" className="min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <DualProcessStudio />
    </ClayIn>
  )
}
