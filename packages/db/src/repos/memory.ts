/**
 * Memory repository — mnemonic tables (Major system, PAO, Dominic system)
 * and memory palaces (loci ordering, room layouts, and card attachments).
 */
import { asc, eq, max } from 'drizzle-orm'
import { palaceWalkOrder } from '@learning-hub/core'
import { pendingTombstone } from '../sync'
import { getDb, withTransaction, type LearningHubDB } from '../index'
import { mnemonicTables, palaceItems, palaces } from '../schema'

export type MnemonicTableRow = typeof mnemonicTables.$inferSelect
export type PalaceRow = typeof palaces.$inferSelect
export type PalaceItemRow = typeof palaceItems.$inferSelect

export interface PalaceWithItems {
  palace: PalaceRow
  items: PalaceItemRow[]
}

export interface MnemonicEntryInput {
  kind: string
  code: string
  person?: string | null
  action?: string | null
  object?: string | null
  word?: string | null
  image?: string | null
}

export interface CreatePalaceInput {
  name: string
  description?: string | null
  rooms?: Array<{ name: string; emoji?: string }>
}

export interface UpdatePalaceInput {
  name?: string
  description?: string | null
  items?: Array<{
    lociIndex: number
    name: string
    cardId?: number | null
    vividImage?: string | null
  }>
}

export interface AddPalaceLocusInput {
  palaceId: number
  name: string
  lociIndex?: number
  cardId?: number | null
  vividImage?: string | null
}

// ─── Mnemonic Tables ────────────────────────────────────────────────────────

/**
 * List mnemonic code tables, optionally filtered by kind ('major' | 'pao' | 'dominic').
 */
export function listMnemonicTables(
  opts: { kind?: string; db?: LearningHubDB } = {},
): MnemonicTableRow[] {
  const db = opts.db ?? getDb()
  let query = db.select().from(mnemonicTables).$dynamic()
  if (opts.kind) {
    query = query.where(eq(mnemonicTables.kind, opts.kind))
  }
  return query.orderBy(asc(mnemonicTables.code)).all()
}

/**
 * Get a specific mnemonic code entry by kind and code.
 */
export function getMnemonicEntry(
  kind: string,
  code: string,
  opts: { db?: LearningHubDB } = {},
): MnemonicTableRow | null {
  const db = opts.db ?? getDb()
  const rows = db.select().from(mnemonicTables).all()
  const found = rows.find((r) => r.kind === kind && r.code === code)
  return found ?? null
}

/**
 * Upsert a mnemonic code table row (idempotent on (kind, code)).
 */
export function upsertMnemonicEntry(
  input: MnemonicEntryInput,
  opts: { db?: LearningHubDB } = {},
): MnemonicTableRow {
  const db = opts.db ?? getDb()
  const [row] = db
    .insert(mnemonicTables)
    .values({
      kind: input.kind,
      code: input.code,
      person: input.person ?? null,
      action: input.action ?? null,
      object: input.object ?? null,
      word: input.word ?? null,
      image: input.image ?? null,
    })
    .onConflictDoUpdate({
      target: [mnemonicTables.kind, mnemonicTables.code],
      set: {
        person: input.person ?? null,
        action: input.action ?? null,
        object: input.object ?? null,
        word: input.word ?? null,
        image: input.image ?? null,
      },
    })
    .returning()
    .all()

  return row!
}

/**
 * Delete a mnemonic entry by kind and code.
 */
export function deleteMnemonicEntry(
  kind: string,
  code: string,
  opts: { db?: LearningHubDB } = {},
): boolean {
  const db = opts.db ?? getDb()
  const existing = getMnemonicEntry(kind, code, { db })
  if (!existing) return false
  const res = db.delete(mnemonicTables).where(eq(mnemonicTables.id, existing.id)).run()
  return (res?.changes ?? 0) > 0
}

// ─── Memory Palaces & Loci ──────────────────────────────────────────────────

/**
 * Fetch a memory palace and its walk-ordered loci.
 */
export function getPalaceWithItems(
  palaceId: number,
  opts: { db?: LearningHubDB } = {},
): PalaceWithItems | null {
  const db = opts.db ?? getDb()
  const [palace] = db.select().from(palaces).where(eq(palaces.id, palaceId)).limit(1).all()
  if (!palace) return null

  const items = db
    .select()
    .from(palaceItems)
    .where(eq(palaceItems.palaceId, palaceId))
    .orderBy(asc(palaceItems.lociIndex))
    .all()

  return { palace, items: palaceWalkOrder(items) }
}

/**
 * List all memory palaces, each with its walk-ordered loci.
 */
export function listPalaces(opts: { db?: LearningHubDB } = {}): PalaceWithItems[] {
  const db = opts.db ?? getDb()
  const rows = db.select().from(palaces).orderBy(asc(palaces.name)).all()
  const result: PalaceWithItems[] = []
  for (const p of rows) {
    const withItems = getPalaceWithItems(p.id, { db })
    if (withItems) result.push(withItems)
  }
  return result
}

/**
 * Create a new memory palace container with optional room layout.
 */
export function createPalace(
  input: CreatePalaceInput,
  opts: { db?: LearningHubDB } = {},
): PalaceWithItems {
  const db = opts.db ?? getDb()
  const [palace] = db
    .insert(palaces)
    .values({
      name: input.name.trim(),
      description: input.description ?? null,
      layout: { rooms: (input.rooms ?? []).map((r) => ({ name: r.name, emoji: r.emoji ?? '🚪' })) },
    })
    .returning()
    .all()

  return { palace: palace!, items: [] }
}

/**
 * Update an existing memory palace metadata and replace its loci set when provided.
 */
export function updatePalace(
  palaceId: number,
  patch: UpdatePalaceInput,
  opts: { db?: LearningHubDB } = {},
): PalaceWithItems | null {
  return withTransaction((tx) => {
    const [existing] = tx.select().from(palaces).where(eq(palaces.id, palaceId)).limit(1).all()
    if (!existing) return null

    if (patch.name !== undefined || patch.description !== undefined) {
      tx.update(palaces)
        .set({
          name: patch.name !== undefined ? patch.name.trim() : existing.name,
          description: patch.description !== undefined ? patch.description : existing.description,
        })
        .where(eq(palaces.id, palaceId))
        .run()
    }

    if (patch.items) {
      tx.delete(palaceItems).where(eq(palaceItems.palaceId, palaceId)).run()
      if (patch.items.length > 0) {
        for (const item of patch.items) {
          tx.insert(palaceItems)
            .values({
              palaceId,
              lociIndex: item.lociIndex,
              name: item.name.trim(),
              vividImage: item.vividImage ?? null,
              cardId: item.cardId ?? null,
            })
            .run()
        }
      }
    }

    const [palace] = tx.select().from(palaces).where(eq(palaces.id, palaceId)).limit(1).all()
    const items = tx
      .select()
      .from(palaceItems)
      .where(eq(palaceItems.palaceId, palaceId))
      .orderBy(asc(palaceItems.lociIndex))
      .all()
    return { palace: palace!, items: palaceWalkOrder(items) }
  }, opts.db)
}

/**
 * Delete a memory palace and all its loci.
 */
export function deletePalace(palaceId: number, opts: { db?: LearningHubDB } = {}): boolean {
  const commit = pendingTombstone('palaces', palaceId, Boolean(opts.db))
  const ok = withTransaction((tx) => {
    tx.delete(palaceItems).where(eq(palaceItems.palaceId, palaceId)).run()
    const res = tx.delete(palaces).where(eq(palaces.id, palaceId)).run()
    return (res?.changes ?? 0) > 0
  }, opts.db)
  if (ok) commit()
  return ok
}

/**
 * Attach a new locus or card to the next available slot in a memory palace.
 */
export function addPalaceLocus(
  input: AddPalaceLocusInput,
  opts: { db?: LearningHubDB } = {},
): PalaceItemRow {
  const db = opts.db ?? getDb()

  let lociIndex = input.lociIndex
  if (lociIndex === undefined) {
    const [highest] = db
      .select({ maxIndex: max(palaceItems.lociIndex) })
      .from(palaceItems)
      .where(eq(palaceItems.palaceId, input.palaceId))
      .all()
    lociIndex = (highest?.maxIndex ?? -1) + 1
  }

  const [row] = db
    .insert(palaceItems)
    .values({
      palaceId: input.palaceId,
      lociIndex,
      name: input.name.trim(),
      cardId: input.cardId ?? null,
      vividImage: input.vividImage ?? null,
    })
    .returning()
    .all()

  return row!
}
