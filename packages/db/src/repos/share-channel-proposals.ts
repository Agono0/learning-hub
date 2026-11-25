import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import {
  ChannelProposalSchema,
  applyProposalOperations,
  type ChannelProposal,
  type ChannelProposalStatus,
  type ProposalOperation,
} from '@learning-hub/core'
import { channelProposals } from '../schema'
import { getDb, type LearningHubDB } from '../index'
import { getHostedChannel, publishHostedChannelVersion } from './share-channel-host'

type Db = LearningHubDB

function rowToProposal(r: typeof channelProposals.$inferSelect): ChannelProposal {
  return ChannelProposalSchema.parse({
    id: r.id,
    channelId: r.channelId,
    authorHandle: r.authorHandle,
    title: r.title,
    note: r.note,
    baseVersion: r.baseVersion,
    operations: JSON.parse(r.operationsJson),
    status: r.status,
    ...(r.acceptedVersion !== null ? { acceptedVersion: r.acceptedVersion } : {}),
    createdAt: r.createdAt,
  })
}

export interface CreateProposalInput {
  channelId: string
  authorHandle: string
  title: string
  note?: string
  operations: ProposalOperation[]
}

export function createChannelProposal(
  input: CreateProposalInput,
  db: Db = getDb(),
): { ok: boolean; error?: string; proposal?: ChannelProposal } {
  const manifest = getHostedChannel(input.channelId, db)
  if (!manifest) return { ok: false, error: `channel '${input.channelId}' is not hosted here` }
  const check = applyProposalOperations(manifest, input.operations)
  if (!check.ok) return { ok: false, error: check.error }
  const proposal: ChannelProposal = ChannelProposalSchema.parse({
    id: randomUUID(),
    channelId: input.channelId,
    authorHandle: input.authorHandle,
    title: input.title,
    note: input.note ?? '',
    baseVersion: manifest.currentVersion,
    operations: input.operations,
    status: 'open',
    createdAt: new Date().toISOString(),
  })
  db.insert(channelProposals)
    .values({
      id: proposal.id,
      channelId: proposal.channelId,
      authorHandle: proposal.authorHandle,
      title: proposal.title,
      note: proposal.note,
      baseVersion: proposal.baseVersion,
      operationsJson: JSON.stringify(proposal.operations),
      status: proposal.status,
      createdAt: proposal.createdAt,
    })
    .run()
  return { ok: true, proposal }
}

export function listChannelProposals(
  channelId: string,
  status?: ChannelProposalStatus,
  db: Db = getDb(),
): ChannelProposal[] {
  const rows = status
    ? db
        .select()
        .from(channelProposals)
        .where(and(eq(channelProposals.channelId, channelId), eq(channelProposals.status, status)))
        .orderBy(desc(channelProposals.createdAt))
        .all()
    : db
        .select()
        .from(channelProposals)
        .where(eq(channelProposals.channelId, channelId))
        .orderBy(desc(channelProposals.createdAt))
        .all()
  return rows.map(rowToProposal)
}

/**
 * Accepts or declines an open proposal. Accepting applies the operations onto
 * the CURRENT version (which may be newer than baseVersion) and publishes the
 * result as the next version; the proposal records the version it produced.
 */
export function decideChannelProposal(
  proposalId: string,
  decision: 'accept' | 'decline',
  db: Db = getDb(),
): { ok: boolean; error?: string; proposal?: ChannelProposal; version?: number } {
  return db.transaction((tx) => {
    const row = tx.select().from(channelProposals).where(eq(channelProposals.id, proposalId)).get()
    if (!row) return { ok: false, error: 'proposal not found' }
    if (row.status !== 'open') return { ok: false, error: `proposal already ${row.status}` }
    const now = new Date().toISOString()
    if (decision === 'decline') {
      tx.update(channelProposals)
        .set({ status: 'declined', decidedAt: now })
        .where(eq(channelProposals.id, proposalId))
        .run()
      return { ok: true, proposal: rowToProposal({ ...row, status: 'declined', decidedAt: now }) }
    }
    const manifest = getHostedChannel(row.channelId, db)
    if (!manifest) return { ok: false, error: 'channel manifest missing' }
    const operations = JSON.parse(row.operationsJson) as ProposalOperation[]
    const applied = applyProposalOperations(manifest, operations)
    if (!applied.ok) return { ok: false, error: applied.error }
    const published = publishHostedChannelVersion(
      {
        channelId: row.channelId,
        items: applied.items!,
        changelog: `Proposal: ${row.title}`,
      },
      db,
    )
    if (!published.ok) return { ok: false, error: published.error }
    const acceptedVersion = published.manifest!.currentVersion
    tx.update(channelProposals)
      .set({ status: 'accepted', acceptedVersion, decidedAt: now })
      .where(eq(channelProposals.id, proposalId))
      .run()
    return {
      ok: true,
      proposal: rowToProposal({ ...row, status: 'accepted', acceptedVersion, decidedAt: now }),
      version: acceptedVersion,
    }
  })
}
