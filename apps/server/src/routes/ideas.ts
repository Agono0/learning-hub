/**
 * Learning HUB headless server — IDEAS routes. Split from the former routes.ts
 * monolith (TD-11): same handlers, same zod validation, same Route[] table
 * pattern; composition lives in ./index.ts. Closes the ideas parity gap: the
 * same repos already serve the web app (handlers/ideas) and MCP (idea_create /
 * idea_search / idea_connect / idea_list_inbox) — one set of queries, one XP
 * semantics.
 */
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  createIdea,
  createIdeaLink,
  deleteIdea,
  getIdeaDetail,
  ideaSearch,
  listIdeas,
  updateIdea,
} from '@learning-hub/db'
import { ApiError, sendJson, readJson, readQuery } from '../http'
import type { Route } from './shared'

// ── Schemas ─────────────────────────────────────────────────────────────────

const IDEA_STAGES = ['seed', 'growing', 'validated', 'project'] as const
const IDEA_LINK_TYPES = ['related', 'supports', 'contradicts', 'refines', 'parent-of'] as const

/** Capture an idea (same shape the web app and MCP idea_create accept). */
const createIdeaSchema = z.object({
  title: z.string().trim().min(1, 'title required').max(200),
  content: z.string().max(20_000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  stage: z.enum(IDEA_STAGES).optional(),
  /** Optional link wired to the new idea atomically (same idea the capture runs in). */
  linkedTo: z
    .object({
      ideaId: z.number().int().positive(),
      type: z.enum(IDEA_LINK_TYPES).optional(),
      context: z.string().max(1000).optional(),
    })
    .optional(),
})

/** ?stage= filters the incubator stage (canonical repo/web vocabulary); ?status= is an alias. */
const listIdeasQuerySchema = z.object({
  stage: z.enum(IDEA_STAGES).optional(),
  status: z.enum(IDEA_STAGES).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

const ideaIdQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
})

const searchIdeasQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

/** Stage change, incubator resurface (touch) or promote-to-project — the PATCH body of web /api/ideas/[id]. */
const updateIdeaSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().max(20_000).optional(),
  stage: z.enum(IDEA_STAGES).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  resurface: z.boolean().optional(),
  promote: z.boolean().optional(),
  projectId: z.number().int().positive().nullable().optional(),
})

/** Link two ideas (same shape MCP idea_connect accepts). */
const createIdeaLinkSchema = z.object({
  fromIdeaId: z.number().int().positive(),
  toIdeaId: z.number().int().positive(),
  type: z.enum(IDEA_LINK_TYPES).default('related'),
  context: z.string().max(1000).optional(),
})

/** POST /ideas {title, content?, tags?, stage?, linkedTo?} — capture an idea into the inbox (stage: seed by default). */
async function postIdea(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, createIdeaSchema)
  // Transactional repo path: the idea and its optional incoming link land together.
  const idea = createIdea({
    title: body.title,
    content: body.content,
    tags: body.tags,
    stage: body.stage,
    linkedTo: body.linkedTo,
  })
  sendJson(res, 200, { ok: true, idea })
}

/** GET /ideas?stage=&limit= — list ideas, most recently updated first, with all idea links. */
async function listIdeaRows(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const q = readQuery(url, listIdeasQuerySchema)
  // Shared list repo — same ordering and stage filter as the web inbox and MCP idea_list_inbox.
  const { ideas, links } = listIdeas({ stage: q.stage ?? q.status ?? null, limit: q.limit })
  sendJson(res, 200, { ideas, links })
}

/** GET /ideas/detail?id= — one idea with forward links, incoming links and the incubator decay score. */
async function getIdea(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const q = readQuery(url, ideaIdQuerySchema)
  const detail = getIdeaDetail(q.id)
  if (!detail) throw new ApiError(404, 'idea not found')
  sendJson(res, 200, detail)
}

/** GET /ideas/search?q=&limit= — keyword search over idea titles and content (LIKE), most recently updated first. */
async function searchIdeas(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const q = readQuery(url, searchIdeasQuerySchema)
  // Shared search repo — one definition for web, MCP and the headless server.
  const rows = ideaSearch(q.q, { limit: q.limit })
  sendJson(res, 200, { count: rows.length, ideas: rows })
}

/**
 * POST /ideas/update {id, title?, content?, stage?, tags?, resurface?, promote?, projectId?} —
 * update an idea: stage change (seed → growing → validated), incubator resurface
 * (resets the decay score to 1.0) or promote-to-project (creates the project row
 * and links it). Returns the created project when `promote` was set.
 */
async function postIdeaUpdate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, updateIdeaSchema)
  const { id, ...patch } = body
  const result = updateIdea(id, patch)
  if (!result.idea) throw new ApiError(404, 'idea not found')
  sendJson(res, 200, { ok: true, idea: result.idea, project: result.project ?? null })
}

/** POST /ideas/link {fromIdeaId, toIdeaId, type?, context?} — create a directed link between two ideas. */
async function postIdeaLink(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, createIdeaLinkSchema)
  const link = createIdeaLink(body)
  sendJson(res, 200, { ok: true, link })
}

/**
 * POST /ideas/delete?id= — delete an idea; its incoming and outgoing idea
 * links cascade atomically (repos/ideas). The Route table has no DELETE
 * method, so deletion is a POST on this path.
 */
async function postIdeaDelete(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const q = readQuery(url, ideaIdQuerySchema)
  // false → 404: the idea never existed (or was already deleted).
  if (!deleteIdea(q.id)) throw new ApiError(404, 'idea not found')
  sendJson(res, 200, { ok: true })
}

/** Route table for this area — concatenated in ./index.ts in the original routes.ts order. */
export const ideasRoutes: Route[] = [
  {
    method: 'POST',
    path: '/ideas',
    summary: 'capture an idea into the inbox (createIdea)',
    handler: postIdea,
  },
  {
    method: 'GET',
    path: '/ideas',
    summary: 'list ideas (?stage=|status=&limit=)',
    handler: listIdeaRows,
  },
  {
    method: 'GET',
    path: '/ideas/detail',
    summary: 'one idea with links + decay score (?id=)',
    handler: getIdea,
  },
  {
    method: 'GET',
    path: '/ideas/search',
    summary: 'keyword search over titles + content (?q=&limit=)',
    handler: searchIdeas,
  },
  {
    method: 'POST',
    path: '/ideas/update',
    summary: 'stage / resurface / promote-to-project (updateIdea)',
    handler: postIdeaUpdate,
  },
  {
    method: 'POST',
    path: '/ideas/link',
    summary: 'link two ideas (createIdeaLink)',
    handler: postIdeaLink,
  },
  {
    method: 'POST',
    path: '/ideas/delete',
    summary: 'delete an idea and its links (?id=)',
    handler: postIdeaDelete,
  },
]
