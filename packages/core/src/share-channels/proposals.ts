import { z } from 'zod'
import { type ChannelItem, type ChannelManifest } from './engine'

/**
 * Subscription pull requests: a subscriber (or any collaborator on a link
 * channel) proposes changes to a channel; the channel owner accepts or
 * declines. Accepting applies the operations onto the current version and
 * publishes the next version, so every subscriber receives the change through
 * the normal sync path.
 */

/** An upsert carries only id+content; revisions are assigned on publish. */
export const ProposalOperationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('upsert'),
    item: z.object({ id: z.string().min(1), content: z.record(z.string(), z.unknown()) }),
  }),
  z.object({ kind: z.literal('remove'), itemId: z.string().min(1) }),
])
export type ProposalOperation = z.infer<typeof ProposalOperationSchema>

export const ChannelProposalStatusSchema = z.enum(['open', 'accepted', 'declined'])
export type ChannelProposalStatus = z.infer<typeof ChannelProposalStatusSchema>

export const ChannelProposalSchema = z.object({
  id: z.string().min(1),
  channelId: z.string().min(1),
  authorHandle: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  note: z.string().max(2000).default(''),
  /** Version the proposal was written against. */
  baseVersion: z.number().int().positive(),
  operations: z.array(ProposalOperationSchema).min(1).max(500),
  status: ChannelProposalStatusSchema.default('open'),
  createdAt: z.string().min(1),
  /** Set when the proposal is accepted: the version it produced. */
  acceptedVersion: z.number().int().positive().optional(),
})
export type ChannelProposal = z.infer<typeof ChannelProposalSchema>

export interface ApplyProposalResult {
  ok: boolean
  error?: string
  /** Items of the next version after applying the operations. */
  items?: ChannelItem[]
  summary?: { added: number; updated: number; removed: number }
}

/**
 * Applies proposal operations onto the items of `manifest.currentVersion`.
 * Unknown removes and upserts whose item is identical to the current one are
 * reported and skipped; a proposal that would change nothing is rejected.
 */
export function applyProposalOperations(
  manifest: ChannelManifest,
  operations: ProposalOperation[],
): ApplyProposalResult {
  const current = manifest.versions.find((v) => v.version === manifest.currentVersion)
  if (!current) return { ok: false, error: 'current version not found in manifest' }
  const items = new Map<string, ChannelItem>(current.items.map((i) => [i.id, i]))
  let changed = 0
  for (const op of operations) {
    if (op.kind === 'remove') {
      if (items.delete(op.itemId)) changed++
    } else {
      const prev = items.get(op.item.id)
      if (prev && JSON.stringify(prev.content) === JSON.stringify(op.item.content)) continue
      items.set(op.item.id, {
        id: op.item.id,
        content: op.item.content,
        revision: prev ? prev.revision : 1,
      })
      changed++
    }
  }
  if (changed === 0) return { ok: false, error: 'proposal changes nothing' }
  const next = [...items.values()]
  const nextIds = new Set(next.map((i) => i.id))
  let added = 0
  let updated = 0
  for (const item of next) {
    const prev = current.items.find((i) => i.id === item.id)
    if (!prev) added++
    else if (JSON.stringify(prev.content) !== JSON.stringify(item.content)) updated++
  }
  return {
    ok: true,
    items: next,
    summary: {
      added,
      updated,
      removed: current.items.filter((i) => !nextIds.has(i.id)).length,
    },
  }
}
