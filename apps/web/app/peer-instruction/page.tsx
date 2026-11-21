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
import { PeerInstructionStudio } from '@/components/PeerInstructionStudio'

export default function PeerInstructionPage() {
  return (
    <ClayIn as="div" className="min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <PeerInstructionStudio />
    </ClayIn>
  )
}
