'use client'

/**
 * Universal Ingest Page — turn a lecture transcript, an academic paper, code, or markdown notes
 * into review cards. Preview first, curate and edit cards, then save to any deck.
 */
import { Sparkles } from 'lucide-react'
import { PageHeader } from '@/ui'
import { UniversalIngestStudio } from '@/components/UniversalIngestStudio'

export default function UniversalIngestPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <PageHeader
        title="Universal Ingest"
        subtitle="Turn lecture transcripts, academic papers, source code, or markdown study notes into high-retention review cards. Curate, edit, and save directly to your review queue."
        icon={<Sparkles className="h-6 w-6 text-indigo-400" />}
      />

      <UniversalIngestStudio />
    </div>
  )
}
