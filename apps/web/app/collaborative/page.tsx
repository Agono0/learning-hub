'use client'

import React from 'react'
import { PageHeader } from '@/ui'
import { CollaborativeScriptsStudio } from '@/components/CollaborativeScriptsStudio'

export default function CollaborativePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Collaborative Scripts & Transactive Discourse"
        subtitle="Structured CSCL scripts, Alison King guided reciprocal questioning, and Berkowitz & Gibbs transactive discourse analysis."
      />

      <CollaborativeScriptsStudio />
    </div>
  )
}
