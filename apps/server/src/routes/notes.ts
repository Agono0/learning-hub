/**
 * Learning HUB headless server — NOTES routes (TD-11 parity gap): the same
 * handlers the web app and MCP expose over the shared notes repository, with
 * the same zod validation and Route[] table pattern; composition lives in
 * ./index.ts. Deletions are expressed as POST subpaths (Route.method is
 * 'GET' | 'POST' only).
 */
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  createNote,
  deleteNote,
  getNoteDetail,
  graphOverview,
  linkNoteBulletCard,
  listNotes,
  updateNote,
} from '@learning-hub/db'
import { jsonError, readJson, readQuery, sendJson } from '../http'
import type { Route } from './shared'

// ── Schemas ─────────────────────────────────────────────────────────────────

const notesQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

const noteIdQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
})

/** One note create (same shape the web app's POST /api/notes accepts). */
const createNoteBodySchema = z.object({
  title: z.string().trim().min(1, 'title required'),
  content: z.string().optional(),
  supertag: z.enum(['BIBLIDEF', 'DEFINITION', 'THEOREM', 'PERSON', 'BOOK', 'CORNELL']).optional(),
  fields: z.record(z.string(), z.string()).optional(),
  status: z.enum(['inbox', 'project', 'area', 'resource', 'archive']).optional(),
  deckId: z.number().int().positive().optional(),
})

/** One note patch (same shape the web app's PATCH /api/notes/[id] accepts). */
const updateNoteBodySchema = z.object({
  id: z.number().int().positive(),
  title: z.string().optional(),
  content: z.string().optional(),
  supertag: z
    .enum(['BIBLIDEF', 'DEFINITION', 'THEOREM', 'PERSON', 'BOOK', 'CORNELL'])
    .nullable()
    .optional(),
  fields: z.record(z.string(), z.string()).nullable().optional(),
  status: z.enum(['inbox', 'project', 'area', 'resource', 'archive']).optional(),
})

const noteIdBodySchema = z.object({
  id: z.number().int().positive(),
})

/** Bullet → flashcard association (repos/notes linkNoteBulletCard). */
const linkBulletCardBodySchema = z.object({
  bulletId: z.number().int().positive(),
  cardId: z.number().int().positive(),
})

// ── Handlers ────────────────────────────────────────────────────────────────

/** GET /notes?query=&limit= — list/search notes (LIKE on title and content). */
async function getNotes(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const q = readQuery(url, notesQuerySchema)
  // Shared notes repo — the same query the web /api/notes handler and the MCP
  // note_search tool run.
  const rows = listNotes({ query: q.query ?? null, limit: q.limit ?? 100 })
  sendJson(res, 200, { notes: rows })
}

/** GET /notes/detail?id= — one note with bullets, links, and computed backlinks. */
async function getNote(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const q = readQuery(url, noteIdQuerySchema)
  const detail = getNoteDetail(q.id)
  if (!detail) {
    jsonError(res, 404, 'Note not found')
    return
  }
  sendJson(res, 200, detail)
}

/** POST /notes {title, content?, supertag?, fields?, status?, deckId?} — create a note; [[wikilinks]] become note_links and markdown bullets become note_bullets. */
async function postNote(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, createNoteBodySchema)
  const result = createNote({
    title: body.title,
    content: body.content,
    supertag: body.supertag,
    fields: body.fields,
    status: body.status,
    deckId: body.deckId,
  })
  sendJson(res, 200, {
    ok: true,
    note: result.note,
    links: result.links,
    bullets: result.bulletsCount,
  })
}

/** POST /notes/update {id, title?, content?, supertag?, fields?, status?} — update a note with bullet-sync + wikilink re-plan (status 'archive' archives). */
async function patchNote(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, updateNoteBodySchema)
  const result = updateNote(body.id, {
    title: body.title,
    content: body.content,
    supertag: body.supertag,
    fields: body.fields,
    status: body.status,
  })
  if (!result.note) {
    jsonError(res, 404, 'Note not found')
    return
  }
  sendJson(res, 200, {
    ok: true,
    bulletsPlan: result.bulletsPlan,
    linksCreated: result.linksCreated,
  })
}

/** POST /notes/delete {id} — cascade-delete the note with its bullets and links (tombstoned for sync). */
async function removeNote(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, noteIdBodySchema)
  if (!deleteNote(body.id)) {
    jsonError(res, 404, 'Note not found')
    return
  }
  sendJson(res, 200, { ok: true })
}

/** POST /notes/link-bullet-card {bulletId, cardId} — associate an outline bullet with an auto-generated flashcard. */
async function linkBulletToCard(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, linkBulletCardBodySchema)
  if (!linkNoteBulletCard(body.bulletId, body.cardId)) {
    jsonError(res, 404, 'Note bullet not found')
    return
  }
  sendJson(res, 200, { ok: true })
}

/** GET /notes/graph — knowledge-graph overview: per-node-type counts plus the most-connected notes and ideas. */
async function getNotesGraph(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Shared knowledge-graph repo — the same aggregate the MCP graph://overview
  // resource serves.
  sendJson(res, 200, { ok: true, ...graphOverview() })
}

/** Route table for this area — concatenated in ./index.ts. */
export const notesRoutes: Route[] = [
  {
    method: 'GET',
    path: '/notes',
    summary: 'list/search notes (?query=&limit=)',
    handler: getNotes,
  },
  {
    method: 'GET',
    path: '/notes/detail',
    summary: 'one note with bullets, links, backlinks (?id=)',
    handler: getNote,
  },
  {
    method: 'POST',
    path: '/notes',
    summary: 'create a note ([[wikilinks]] + bullets parsed)',
    handler: postNote,
  },
  {
    method: 'POST',
    path: '/notes/update',
    summary: 'update a note + bullet/link re-sync (status archive archives)',
    handler: patchNote,
  },
  {
    method: 'POST',
    path: '/notes/delete',
    summary: 'delete a note and its bullets/links',
    handler: removeNote,
  },
  {
    method: 'POST',
    path: '/notes/link-bullet-card',
    summary: 'associate an outline bullet with a flashcard',
    handler: linkBulletToCard,
  },
  {
    method: 'GET',
    path: '/notes/graph',
    summary: 'knowledge-graph overview (counts + most-connected notes/ideas)',
    handler: getNotesGraph,
  },
]
