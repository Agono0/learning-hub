/**
 * Canvas & Chat-Sessions repository — spatial infinite canvas boards (items + edges)
 * and AI multi-turn dialogue transcripts (tutor/feynman/council/brainwrite) with hint tracking.
 */
import { rowLimit } from '../limits'
import { desc, eq } from 'drizzle-orm'
import { getDb, type LearningHubDB } from '../index'
import { canvases, chatSessions } from '../schema'

export type CanvasRow = typeof canvases.$inferSelect
export type ChatSessionRow = typeof chatSessions.$inferSelect

export interface CanvasItem {
  id: string
  kind: 'note' | 'card' | 'excerpt'
  text: string
  x: number
  y: number
  w: number
}

export interface CanvasEdge {
  id: string
  from: string
  to: string
  label?: string
}

export interface CreateCanvasInput {
  title?: string
  scope?: string
  scopeId?: number | null
  items?: CanvasItem[] | unknown[]
  edges?: CanvasEdge[] | unknown[]
}

export interface PatchCanvasInput {
  title?: string
  items?: CanvasItem[] | unknown[]
  edges?: CanvasEdge[] | unknown[]
}

export interface CreateChatSessionInput {
  kind: string
  contextType?: string | null
  contextId?: number | null
  title?: string | null
  messages?: unknown[]
  score?: Record<string, unknown> | null
  hintsUsed?: number
}

/**
 * List canvas boards ordered newest first.
 */
export function listCanvases(
  opts: {
    limit?: number
    db?: LearningHubDB
  } = {},
): CanvasRow[] {
  const db = opts.db ?? getDb()
  const limit = opts.limit ?? 50
  return db.select().from(canvases).orderBy(desc(canvases.updatedAt)).limit(rowLimit(limit)).all()
}

/**
 * Get a single canvas board by id.
 */
export function getCanvas(id: number, opts: { db?: LearningHubDB } = {}): CanvasRow | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(canvases).where(eq(canvases.id, id)).limit(1).all()
  return row ?? null
}

/**
 * Create a new canvas board.
 */
export function createCanvas(
  input: CreateCanvasInput,
  opts: { db?: LearningHubDB } = {},
): CanvasRow {
  const db = opts.db ?? getDb()
  const [created] = db
    .insert(canvases)
    .values({
      title: input.title?.trim() || 'Untitled canvas',
      scope: input.scope ?? 'free',
      scopeId: input.scopeId ?? null,
      items: input.items ?? [],
      edges: input.edges ?? [],
    })
    .returning()
    .all()

  return created!
}

/**
 * Update canvas title, items, or edges.
 */
export function updateCanvas(
  id: number,
  patch: PatchCanvasInput,
  opts: { db?: LearningHubDB } = {},
): CanvasRow | null {
  const db = opts.db ?? getDb()
  const existing = getCanvas(id, { db })
  if (!existing) return null

  const values: Partial<typeof canvases.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  }
  if (patch.title !== undefined) values.title = patch.title.trim()
  if (patch.items !== undefined) values.items = patch.items
  if (patch.edges !== undefined) values.edges = patch.edges

  const [updated] = db.update(canvases).set(values).where(eq(canvases.id, id)).returning().all()
  return updated ?? null
}

/**
 * Delete a canvas board by id.
 */
export function deleteCanvas(id: number, opts: { db?: LearningHubDB } = {}): boolean {
  const db = opts.db ?? getDb()
  const res = db.delete(canvases).where(eq(canvases.id, id)).run()
  return (res.changes ?? 0) > 0
}

// ─── Chat Sessions ──────────────────────────────────────────────────────────

/**
 * Fetch a single chat session with its full transcript.
 */
export function getChatSession(
  id: number,
  opts: { db?: LearningHubDB } = {},
): ChatSessionRow | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(chatSessions).where(eq(chatSessions.id, id)).limit(1).all()
  return row ?? null
}

export type ChatSessionSummary = Omit<ChatSessionRow, 'messages'>

/**
 * List chat session summaries (excluding messages payload for fast navigation rosters).
 */
export function listChatSessions(
  opts: {
    kind?: string
    limit?: number
    db?: LearningHubDB
  } = {},
): ChatSessionSummary[] {
  const db = opts.db ?? getDb()
  const limit = opts.limit ?? 50

  const query = db
    .select({
      id: chatSessions.id,
      kind: chatSessions.kind,
      contextType: chatSessions.contextType,
      contextId: chatSessions.contextId,
      title: chatSessions.title,
      score: chatSessions.score,
      hintsUsed: chatSessions.hintsUsed,
      createdAt: chatSessions.createdAt,
    })
    .from(chatSessions)

  if (opts.kind) {
    return query
      .where(eq(chatSessions.kind, opts.kind))
      .orderBy(desc(chatSessions.id))
      .limit(rowLimit(limit))
      .all()
  }

  return query.orderBy(desc(chatSessions.id)).limit(rowLimit(limit)).all()
}

/**
 * Create a new chat session.
 */
export function createChatSession(
  input: CreateChatSessionInput,
  opts: { db?: LearningHubDB } = {},
): ChatSessionRow {
  const db = opts.db ?? getDb()
  const [created] = db
    .insert(chatSessions)
    .values({
      kind: input.kind,
      contextType: input.contextType ?? null,
      contextId: input.contextId ?? null,
      title: input.title ?? null,
      messages: input.messages ?? [],
      score: input.score ?? null,
      hintsUsed: input.hintsUsed ?? 0,
      createdAt: new Date().toISOString(),
    })
    .returning()
    .all()

  return created!
}

/**
 * Save updated messages transcript to a chat session, updating hintsUsed or title if provided.
 */
export function updateChatSessionMessages(
  id: number,
  input: {
    messages: unknown[]
    hintsUsed?: number
    title?: string
    score?: Record<string, unknown>
  },
  opts: { db?: LearningHubDB } = {},
): ChatSessionRow | null {
  const db = opts.db ?? getDb()
  const existing = getChatSession(id, { db })
  if (!existing) return null

  const values: Partial<typeof chatSessions.$inferInsert> = {
    messages: input.messages,
  }
  if (input.hintsUsed !== undefined) values.hintsUsed = input.hintsUsed
  if (input.title !== undefined) values.title = input.title
  if (input.score !== undefined) values.score = input.score

  const [updated] = db
    .update(chatSessions)
    .set(values)
    .where(eq(chatSessions.id, id))
    .returning()
    .all()

  return updated ?? null
}

/**
 * Update chat session title.
 */
export function updateChatSessionTitle(
  id: number,
  title: string,
  opts: { db?: LearningHubDB } = {},
): boolean {
  const db = opts.db ?? getDb()
  const res = db.update(chatSessions).set({ title }).where(eq(chatSessions.id, id)).run()
  return (res.changes ?? 0) > 0
}

/**
 * Grade a feynman / teachback chat session with score breakdown and feedback.
 */
export function gradeChatSession(
  id: number,
  score: Record<string, unknown>,
  opts: { db?: LearningHubDB } = {},
): boolean {
  const db = opts.db ?? getDb()
  const res = db.update(chatSessions).set({ score }).where(eq(chatSessions.id, id)).run()
  return (res.changes ?? 0) > 0
}

/**
 * Delete a chat session.
 */
export function deleteChatSession(id: number, opts: { db?: LearningHubDB } = {}): boolean {
  const db = opts.db ?? getDb()
  const res = db.delete(chatSessions).where(eq(chatSessions.id, id)).run()
  return (res.changes ?? 0) > 0
}
