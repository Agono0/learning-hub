'use client'

/**
 * Shared Material Channels page. Manual-mode first: manifests move as
 * copy-pasted JSON (works fully offline); subscriptions and local copies
 * persist in localStorage until a sync transport lands.
 */
import { PageHeader } from '@/ui'
import { ShareChannelsPanel } from '@/components/ShareChannelsPanel'

export default function SharedChannelsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Shared Materials"
        subtitle="Publish decks and courses as versioned channels. When the creator updates the material, subscribers merge the update without losing their own notes, progress or scheduling."
      />
      <ShareChannelsPanel />
    </div>
  )
}
