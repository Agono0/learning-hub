/**
 * Learning HUB headless server — CURRICULUM routes. Split from the former routes.ts
 * monolith (TD-11): same handlers, same zod validation, same Route[] table
 * pattern; composition lives in ./index.ts. Closes the curriculum parity gap:
 * the same repos already serve the web app (handlers/curriculum) and MCP
 * (curriculum_list / curriculum_course / curriculum_export / curriculum_import).
 */
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  deleteCourse,
  exportCurriculum,
  getCourseOverview,
  importCurriculum,
  listCourses,
} from '@learning-hub/db'
import { lhcfCourseSchema, lhcfStats } from '@learning-hub/core/curriculum'
import { ApiError, sendJson, readJson, readQuery } from '../http'
import type { Route } from './shared'

// ── Schemas ─────────────────────────────────────────────────────────────────

/** ?id= — the numeric course id (query values are strings, so coerce). */
const courseIdQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
})

// The import body IS the LHCF document: validated with the public-contract
// schema from core (AGENTS.md rule 5 — zod at every boundary) instead of a
// loose passthrough, so malformed courses are a 400 with path-addressed
// issues before the repo's transaction ever runs.

/** GET /curriculum/courses — courses with progress, next lesson and certificate status. */
async function listCatalog(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Shared catalog repo — identical rows to the web catalog and MCP curriculum_list.
  sendJson(res, 200, { courses: listCourses() })
}

/**
 * POST /curriculum/import — body is a full LHCF course document; imports (or
 * re-imports) it as an idempotent upsert keyed by slug: progress survives
 * re-imports, removed exercises are suspended (never deleted), and the whole
 * import lands in one transaction (repos/curriculum). Same operation as MCP
 * curriculum_import's JSON path, minus the text/YAML/Markdown parsing.
 */
async function postImport(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const course = await readJson(req, lhcfCourseSchema)
  const report = importCurriculum(course)
  sendJson(res, 200, {
    ok: true,
    slug: course.slug,
    title: course.title,
    stats: lhcfStats(course),
    report,
  })
}

/** GET /curriculum/course?id= — full course overview: syllabus with lesson statuses and soft prerequisite locks, projects, exam, certificate status. */
async function getCourse(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const q = readQuery(url, courseIdQuerySchema)
  const overview = getCourseOverview(q.id)
  if (!overview) throw new ApiError(404, 'course not found')
  sendJson(res, 200, overview)
}

/**
 * GET /curriculum/export?id= — the course as LHCF JSON (to improve it with an
 * AI and re-import — slugs keep the learner's progress). Stored documents come
 * back exactly; legacy courses are rebuilt from their rows (repos/curriculum).
 */
async function exportCourse(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const q = readQuery(url, courseIdQuerySchema)
  const course = exportCurriculum(q.id)
  if (!course) throw new ApiError(404, 'course not found')
  sendJson(res, 200, course)
}

/**
 * POST /curriculum/course/delete?id= — delete a course and its exercise deck.
 * Lessons, progress, stages, exam attempts and the certificate cascade with
 * the course; review history is append-only and survives (repos/curriculum).
 * The Route table has no DELETE method, so deletion is a POST on this path.
 */
async function postDeleteCourse(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const q = readQuery(url, courseIdQuerySchema)
  // false → 404: the course never existed (or was already deleted).
  if (!deleteCourse(q.id)) throw new ApiError(404, 'course not found')
  sendJson(res, 200, { ok: true })
}

/** Route table for this area — concatenated in ./index.ts in the original routes.ts order. */
export const curriculumRoutes: Route[] = [
  {
    method: 'GET',
    path: '/curriculum/courses',
    summary: 'courses with progress + certificate status',
    handler: listCatalog,
  },
  {
    method: 'POST',
    path: '/curriculum/import',
    summary: 'import an LHCF course (idempotent upsert by slug)',
    handler: postImport,
  },
  {
    method: 'GET',
    path: '/curriculum/course',
    summary: 'course overview with syllabus + locks (?id=)',
    handler: getCourse,
  },
  {
    method: 'GET',
    path: '/curriculum/export',
    summary: 'export one course as LHCF JSON (?id=)',
    handler: exportCourse,
  },
  {
    method: 'POST',
    path: '/curriculum/course/delete',
    summary: 'delete a course and its exercise deck (?id=)',
    handler: postDeleteCourse,
  },
]
