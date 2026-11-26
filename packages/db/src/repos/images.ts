/**
 * Images repository — registry and storage for card images and occlusion cards.
 */
import { rowLimit } from '../limits'
import { desc, eq } from 'drizzle-orm'
import { getDb, type LearningHubDB } from '../index'
import { images } from '../schema'

export type ImageRow = typeof images.$inferSelect

export interface CreateImageInput {
  filename: string
  mime?: string
  data?: string | null
  createdAt?: string
}

/**
 * Fetch an image record by its auto-increment ID.
 */
export function getImage(id: number, opts: { db?: LearningHubDB } = {}): ImageRow | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(images).where(eq(images.id, id)).limit(1).all()
  return row ?? null
}

/**
 * Fetch an image record by its stored filename (UUID.ext).
 */
export function getImageByFilename(
  filename: string,
  opts: { db?: LearningHubDB } = {},
): ImageRow | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(images).where(eq(images.filename, filename)).limit(1).all()
  return row ?? null
}

/**
 * Insert a new image registry record.
 */
export function createImage(input: CreateImageInput, opts: { db?: LearningHubDB } = {}): ImageRow {
  const db = opts.db ?? getDb()
  const [row] = db
    .insert(images)
    .values({
      filename: input.filename,
      mime: input.mime || 'application/octet-stream',
      data: input.data ?? null,
      createdAt: input.createdAt ?? new Date().toISOString(),
    })
    .returning()
    .all()
  return row!
}

/**
 * Delete an image record by its ID.
 */
export function deleteImage(id: number, opts: { db?: LearningHubDB } = {}): boolean {
  const db = opts.db ?? getDb()
  const res = db.delete(images).where(eq(images.id, id)).run()
  return (res?.changes ?? 0) > 0
}

/**
 * List image records with optional pagination.
 */
export function listImages(
  opts: {
    limit?: number
    offset?: number
    db?: LearningHubDB
  } = {},
): ImageRow[] {
  const db = opts.db ?? getDb()
  let query = db.select().from(images).orderBy(desc(images.createdAt)).$dynamic()
  if (typeof opts.limit === 'number') query = query.limit(rowLimit(opts.limit))
  if (typeof opts.offset === 'number') query = query.offset(opts.offset)
  return query.all()
}
