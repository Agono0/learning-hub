/**
 * Learning HUB — Peer Instruction & Interactive ConcepTest Studio Page
 *
 * Route: /peer-instruction
 * Grounded in:
 * - Eric Mazur (Harvard University, 1997, 2001) - Peer Instruction & ConcepTests
 * - Michelle Smith et al. (Science 2009) - Isomorphic learning verification
 * - Richard Hake (1998) - Normalized learning gain <g>
 * - Nathaniel Lasry et al. (2008) - Active learning transfer
 */

'use client'

import React from 'react'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { PeerInstructionStudio } from '@/components/PeerInstructionStudio'

export default function PeerInstructionPage() {
  // GSAP reveal (per-page motion mandate): the studio rises in on scroll —
  // motionOK-gated; SSR/tests keep the static content.
  const studioRef = useGsapReveal<HTMLDivElement>({ y: 12 })
  return (
    <ClayIn as="div" className="space-y-5">
      <div ref={studioRef}>
        <PeerInstructionStudio />
      </div>
    </ClayIn>
  )
}
