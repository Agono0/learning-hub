'use client'

/**
 * Learning HUB — Feedback Literacy & Formative Assessment Studio page.
 *
 * Route: /feedback-studio
 * Grounded in:
 * - Hattie & Timperley (2007) — four feedback levels (task/process/self-regulation/self)
 * - Kluger & DeNisi (1996) — Feedback Intervention Theory
 * - Shute (2008) — formative feedback guidelines
 */

import React from 'react'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { PageHeader } from '@/ui'
import { FeedbackStudio } from '@/components/FeedbackStudio'

export default function FeedbackStudioPage() {
  // GSAP reveal (per-page motion mandate): the studio rises in on scroll —
  // motionOK-gated; SSR/tests keep the static content.
  const studioRef = useGsapReveal<HTMLDivElement>({ y: 12 })
  return (
    <ClayIn as="div" className="space-y-5">
      <PageHeader
        title="Feedback Studio"
        subtitle="Learn to give and receive feedback that teaches — task, process, and self-regulation, never the person."
      />
      <div ref={studioRef}>
        <FeedbackStudio />
      </div>
    </ClayIn>
  )
}
