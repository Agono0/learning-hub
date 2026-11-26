/**
 * Ideas & Idea-Links repository — Zettelkasten incubator (Luhmann 1981), staged ideation
 * (seed -> growing -> validated -> project), and hybrid offspring evolutionary synthesis.
 */
import { rowLimit } from '../limits'
import { desc, eq, like, or } from 'drizzle-orm'
import {
  incubatorScore,
  promoteToProject,
  type IdeaLinkType,
  type IdeaStage,
} from '@learning-hub/core'
import { pendingTombstone } from '../sync'
import { getDb, type LearningHubDB } from '../index'
import { ideaLinks, ideas, projects } from '../schema'
import { withTransaction } from '../transaction'
import { awardXp } from './xp'

export type IdeaRow = typeof ideas.$inferSelect
export type IdeaLinkRow = typeof ideaLinks.$inferSelect
export type ProjectRow = typeof projects.$inferSelect
export type { IdeaLinkType, IdeaStage }

export interface CreateIdeaInput {
  title: string
  content?: string
  tags?: string[]
  stage?: IdeaStage
  projectId?: number | null
  resurfaceEveryDays?: number
  createdAt?: string
  linkedTo?: {
    ideaId: number
    type?: IdeaLinkType
    context?: string | null
  }
}

export interface PatchIdeaInput {
  title?: string
  content?: string
  stage?: IdeaStage
  tags?: string[]
  resurface?: boolean
  promote?: boolean
  projectId?: number | null
}

export interface IdeaDetail {
  idea: IdeaRow
  links: IdeaLinkRow[]
  incoming: IdeaLinkRow[]
  decayScore: number
}

export interface HybridOffspringResult {
  offspring: IdeaRow
  parents: [number, number]
  mode: 'ai' | 'manual'
}

/**
 * List ideas, optionally filtered by stage (seed|growing|validated|project).
 */
export function listIdeas(
  opts: {
    stage?: IdeaStage | null
    limit?: number
    db?: LearningHubDB
  } = {},
): { ideas: IdeaRow[]; links: IdeaLinkRow[] } {
  const db = opts.db ?? getDb()
  const limit = opts.limit ?? 200

  const ideasQuery = opts.stage
    ? db
        .select()
        .from(ideas)
        .where(eq(ideas.stage, opts.stage))
        .orderBy(desc(ideas.updatedAt))
        .limit(rowLimit(limit))
        .all()
    : db.select().from(ideas).orderBy(desc(ideas.updatedAt)).limit(rowLimit(limit)).all()

  const links = db.select().from(ideaLinks).all()

  return { ideas: ideasQuery, links }
}

/**
 * Get single idea by id.
 */
export function getIdea(id: number, opts: { db?: LearningHubDB } = {}): IdeaRow | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(ideas).where(eq(ideas.id, id)).limit(1).all()
  return row ?? null
}

/**
 * LIKE keyword search across idea titles and content, most recently updated
 * first. One definition, every host: the MCP `idea_search` tool previously
 * carried its own inline copy of this exact query.
 */
export function ideaSearch(
  query: string,
  opts: { limit?: number; db?: LearningHubDB } = {},
): IdeaRow[] {
  const db = opts.db ?? getDb()
  const pattern = `%${query}%`
  const limit = opts.limit ?? 25
  return db
    .select()
    .from(ideas)
    .where(or(like(ideas.title, pattern), like(ideas.content, pattern)))
    .orderBy(desc(ideas.updatedAt))
    .limit(rowLimit(limit))
    .all()
}

/**
 * Fetch idea detail including forward links, incoming links, and computed incubator decay score.
 */
export function getIdeaDetail(
  id: number,
  opts: {
    now?: Date
    db?: LearningHubDB
  } = {},
): IdeaDetail | null {
  const db = opts.db ?? getDb()
  const idea = getIdea(id, { db })
  if (!idea) return null

  const links = db.select().from(ideaLinks).where(eq(ideaLinks.fromIdeaId, id)).all()
  const incoming = db.select().from(ideaLinks).where(eq(ideaLinks.toIdeaId, id)).all()
  const decayScore = incubatorScore(idea, opts.now ?? new Date())

  return { idea, links, incoming, decayScore }
}

/**
 * Create a new idea with optional immediately wired link.
 */
export function createIdea(input: CreateIdeaInput, opts: { db?: LearningHubDB } = {}): IdeaRow {
  return withTransaction((tx) => {
    const [idea] = tx
      .insert(ideas)
      .values({
        title: input.title.trim(),
        content: input.content ?? '',
        tags: input.tags ?? [],
        stage: input.stage ?? 'seed',
        projectId: input.projectId ?? null,
        resurfaceEveryDays: input.resurfaceEveryDays ?? 14,
        createdAt: input.createdAt ?? new Date().toISOString(),
      })
      .returning()
      .all()

    if (input.linkedTo?.ideaId) {
      tx.insert(ideaLinks)
        .values({
          fromIdeaId: input.linkedTo.ideaId,
          toIdeaId: idea!.id,
          type: input.linkedTo.type ?? 'related',
          context: input.linkedTo.context ?? null,
        })
        .run()
    }

    return idea!
  }, opts.db)
}

/**
 * Update an idea: stage change, resurface, or promote-to-project.
 */
export function updateIdea(
  id: number,
  patch: PatchIdeaInput,
  opts: { now?: Date; db?: LearningHubDB } = {},
): { idea: IdeaRow | null; project?: ProjectRow } {
  return withTransaction((tx) => {
    const existing = tx.select().from(ideas).where(eq(ideas.id, id)).get()
    if (!existing) return { idea: null }

    const nowIso = (opts.now ?? new Date()).toISOString()
    let createdProject: ProjectRow | undefined

    if (patch.resurface) {
      tx.update(ideas)
        .set({
          lastResurfacedAt: nowIso,
          decayScore: 1.0,
          updatedAt: nowIso,
        })
        .where(eq(ideas.id, id))
        .run()
    }

    if (patch.promote) {
      const fields = promoteToProject(existing.id, {
        title: patch.title ?? existing.title,
        content: patch.content ?? existing.content,
      })
      const [proj] = tx.insert(projects).values(fields).returning().all()
      createdProject = proj
      tx.update(ideas)
        .set({
          stage: 'project',
          projectId: proj!.id,
          updatedAt: nowIso,
        })
        .where(eq(ideas.id, id))
        .run()
    }

    const next: Partial<typeof ideas.$inferInsert> = { updatedAt: nowIso }
    if (patch.title !== undefined) next.title = patch.title
    if (patch.content !== undefined) next.content = patch.content
    if (patch.stage !== undefined) next.stage = patch.stage
    if (patch.tags !== undefined) next.tags = patch.tags
    if (patch.projectId !== undefined) next.projectId = patch.projectId

    const [updated] = tx.update(ideas).set(next).where(eq(ideas.id, id)).returning().all()
    return { idea: updated ?? null, project: createdProject }
  }, opts.db)
}

/**
 * Delete an idea and cascade all incoming and outgoing idea_links atomically.
 */
export function deleteIdea(id: number, opts: { db?: LearningHubDB } = {}): boolean {
  const commit = pendingTombstone('ideas', id, Boolean(opts.db))
  const ok = withTransaction((tx) => {
    tx.delete(ideaLinks)
      .where(or(eq(ideaLinks.fromIdeaId, id), eq(ideaLinks.toIdeaId, id)))
      .run()
    const res = tx.delete(ideas).where(eq(ideas.id, id)).run()
    return (res.changes ?? 0) > 0
  }, opts.db)
  if (ok) commit()
  return ok
}

/**
 * List idea links with optional ideaId filter.
 */
export function listIdeaLinks(
  opts: {
    ideaId?: number
    limit?: number
    db?: LearningHubDB
  } = {},
): IdeaLinkRow[] {
  const db = opts.db ?? getDb()
  const limit = opts.limit ?? 400

  if (opts.ideaId) {
    return db
      .select()
      .from(ideaLinks)
      .where(or(eq(ideaLinks.fromIdeaId, opts.ideaId), eq(ideaLinks.toIdeaId, opts.ideaId)))
      .limit(rowLimit(limit))
      .all()
  }

  return db.select().from(ideaLinks).limit(rowLimit(limit)).all()
}

/**
 * Create a directed link between two ideas.
 */
export function createIdeaLink(
  input: {
    fromIdeaId: number
    toIdeaId: number
    type?: IdeaLinkType
    context?: string | null
  },
  opts: { db?: LearningHubDB } = {},
): IdeaLinkRow {
  const db = opts.db ?? getDb()
  const [created] = db
    .insert(ideaLinks)
    .values({
      fromIdeaId: input.fromIdeaId,
      toIdeaId: input.toIdeaId,
      type: input.type ?? 'related',
      context: input.context ?? null,
    })
    .returning()
    .all()

  return created!
}

/**
 * Delete an idea link by id.
 */
export function deleteIdeaLink(id: number, opts: { db?: LearningHubDB } = {}): boolean {
  const db = opts.db ?? getDb()
  const res = db.delete(ideaLinks).where(eq(ideaLinks.id, id)).run()
  return (res.changes ?? 0) > 0
}

/**
 * Combine two parent ideas into a hybrid offspring idea with parent-of links and canonical XP.
 */
export function createHybridIdea(
  input: {
    aId: number
    bId: number
    title: string
    content: string
    mode: 'ai' | 'manual'
  },
  opts: { db?: LearningHubDB } = {},
): HybridOffspringResult {
  return withTransaction((tx) => {
    const [offspring] = tx
      .insert(ideas)
      .values({
        title: input.title,
        content: input.content,
        stage: 'seed',
        tags: ['hybrid'],
      })
      .returning()
      .all()

    tx.insert(ideaLinks)
      .values([
        {
          fromIdeaId: input.aId,
          toIdeaId: offspring!.id,
          type: 'parent-of',
          context: 'evolution parent A',
        },
        {
          fromIdeaId: input.bId,
          toIdeaId: offspring!.id,
          type: 'parent-of',
          context: 'evolution parent B',
        },
      ])
      .run()

    awardXp(tx, {
      source: 'idea',
      meta: { parents: [input.aId, input.bId], offspring: offspring!.id, mode: input.mode },
    })

    return {
      offspring: offspring!,
      parents: [input.aId, input.bId],
      mode: input.mode,
    }
  }, opts.db)
}
