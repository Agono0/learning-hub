import type { ChannelManifest } from './engine'

/**
 * Channel analytics: everything derivable from the manifest alone. Subscriber-
 * side stats (sync outcomes) and proposal stats live in the db layer, which
 * composes this with its own tables.
 */
export interface ChannelManifestAnalytics {
  channelId: string
  currentVersion: number
  itemCount: number
  /** Totals across every published version. */
  lifetime: { added: number; removed: number; changed: number }
  /** Per-version activity, oldest first. */
  versions: {
    version: number
    publishedAt: string
    changelog: string
    itemCount: number
    added: number
    removed: number
    changed: number
  }[]
  /**
   * Item touches (adds + removes + changes) per published item-slot across
   * all versions. Below 1 means a stable channel; above 1 means items are
   * edited repeatedly between publishes.
   */
  churnRate: number
}

export function manifestAnalytics(manifest: ChannelManifest): ChannelManifestAnalytics {
  const versions = manifest.versions.map((v, idx) => {
    const prev = idx > 0 ? manifest.versions[idx - 1] : undefined
    const prevById = new Map((prev?.items ?? []).map((i) => [i.id, i]))
    const nextIds = new Set(v.items.map((i) => i.id))
    let added = 0
    let changed = 0
    for (const item of v.items) {
      const p = prevById.get(item.id)
      if (!p) added++
      else if (JSON.stringify(p.content) !== JSON.stringify(item.content)) changed++
    }
    const removed = prev ? prev.items.filter((i) => !nextIds.has(i.id)).length : 0
    return {
      version: v.version,
      publishedAt: v.publishedAt,
      changelog: v.changelog,
      itemCount: v.items.length,
      added,
      removed,
      changed,
    }
  })
  const lifetime = versions.reduce(
    (acc, v) => ({
      added: acc.added + v.added,
      removed: acc.removed + v.removed,
      changed: acc.changed + v.changed,
    }),
    { added: 0, removed: 0, changed: 0 },
  )
  const current = manifest.versions.find((v) => v.version === manifest.currentVersion)
  const touches = lifetime.added + lifetime.removed + lifetime.changed
  const publishedItems = versions.reduce((acc, v) => acc + v.itemCount, 0)
  return {
    channelId: manifest.channelId,
    currentVersion: manifest.currentVersion,
    itemCount: current?.items.length ?? 0,
    lifetime,
    versions,
    churnRate: publishedItems > 0 ? touches / publishedItems : 0,
  }
}
