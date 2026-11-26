'use client'

/**
 * Embodied Learning & Gesture Studio page. Data flows through @/lib/transport
 * (HTTP on the web, the in-webview hub worker in the native apps).
 */
import { PageHeader } from '@/ui'
import { EmbodiedLearningStudio } from '@/components/EmbodiedLearningStudio'

export default function EmbodiedLearningPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Embodied Learning & Gesture Studio"
        subtitle="Learn with your hands first: gesture plans, gesture-speech mismatch checks, concreteness fading and enactment practice, grounded in Goldin-Meadow, Bruner and the enactment effect."
      />
      <EmbodiedLearningStudio />
    </div>
  )
}
