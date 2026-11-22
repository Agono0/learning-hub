'use client'

import React from 'react'
import { PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'
import { useGsapReveal } from '@/lib/useGsapReveal'
import { CollaborativeScriptsStudio } from '@/components/CollaborativeScriptsStudio'

export default function CollaborativePage() {
  // GSAP moment for this page: the studio workbench rises in with a capped
  // stagger when it scrolls into view (a different node from the ClayIn
  // container — one animation owner per element).
  const studioRevealRef = useGsapReveal<HTMLDivElement>()
  return (
    <ClayIn as="div" className="space-y-6">
      <PageHeader
        title="Collaborative Scripts & Transactive Discourse"
        subtitle="Structured CSCL scripts, Alison King guided reciprocal questioning, and Berkowitz & Gibbs transactive discourse analysis."
      />

      <div ref={studioRevealRef}>
        <CollaborativeScriptsStudio />
      </div>
    </ClayIn>
  )
}
