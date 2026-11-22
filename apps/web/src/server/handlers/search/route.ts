/**
 * /api/search — global search for the ⌘K palette (M5): FTS5 across notes,
 * cards, lessons, highlights and ideas, with a LIKE fallback — UNIFIED with
 * the SP task list since S3-38: open (and done) tasks rank in the same
 * result set through the core search engine (`searchTasks`: title-prefix >
 * title-substring > notes, won't-do work excluded per S3-66), so one box
 * finds both your knowledge and your work.
 */
import { listTaskItems, searchAll } from '@learning-hub/db'
import { searchTasks, taskToSearchDoc } from '@learning-hub/core'
import { db } from '@/lib/db'
import { withRoute } from '@/lib/api'

/** GET /api/search?q=… — top hits across every knowledge surface + tasks. */
export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').slice(0, 200)
  const result = searchAll(db, q)

  // Task hits ride the SAME envelope (kind `task`) so palette and /search
  // render them like any other surface. Done tasks are included (the hit
  // carries `done: true` — searching "did I already do X?" is a real query)
  // and cap at 8 so a task pile can't drown the knowledge surfaces.
  const taskHits = q.trim()
    ? searchTasks(
        listTaskItems({
          projectId: 'any',
          parentId: 'any',
          includeDone: true,
          includeWontdo: false,
          limit: 1000,
        })
          .map((task) => taskToSearchDoc(task))
          .filter((doc) => doc !== null),
        q,
        { includeDone: true, limit: 8 },
      ).map((hit) => ({
        kind: 'task',
        id: hit.doc.task.id,
        title: hit.doc.task.title,
        snippet: hit.doc.task.notes ?? '',
        href: '/tasks',
        done: hit.doc.task.isDone,
      }))
    : []

  return Response.json({ ok: true, hits: [...taskHits, ...result.hits], mode: result.mode })
})
