/**
 * @file apps/web/app/contrasting/page.tsx
 * @description Contrasting Cases & Inventing with Examples Studio Page.
 * Grounded in Schwartz & Bransford (1998) "A Time for Telling".
 */

'use client'

import React from 'react'
import { ContrastingCasesStudio } from '@/components/ContrastingCasesStudio'

export default function ContrastingCasesPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-strong">Contrasting Cases Studio</h1>
        <p className="text-sm text-secondary">
          Preparation for Future Learning (PFL): Invent mathematical invariants from contrasting
          examples before expert lecture delivery (Schwartz &amp; Bransford 1998, 2004).
        </p>
      </header>

      <ContrastingCasesStudio />
    </div>
  )
}
