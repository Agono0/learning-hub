/**
 * @file apps/web/app/anchored/page.tsx
 * @description Anchored Instruction & Situated Macrocontext Studio Page.
 */

import React from 'react'
import { ClayIn } from '@/lib/motion'
import { AnchoredInstructionStudio } from '@/components/AnchoredInstructionStudio'

export const metadata = {
  title: 'Anchored Instruction Studio | Learning HUB',
  description:
    'Vanderbilt CTGV generative macrocontexts overcoming the inert knowledge problem through authentic problem solving, sub-goal hierarchies, and sensitivity simulation.',
}

export default function AnchoredInstructionPage() {
  return (
    <ClayIn as="div" className="container mx-auto space-y-5">
      <AnchoredInstructionStudio />
    </ClayIn>
  )
}
