/**
 * /api/search — global search for the ⌘K palette (M5): FTS5 across notes,
 * cards, lessons, highlights and ideas, with a LIKE fallback.
 */
import { searchAll } from '@learning-hub/db'
import { db } from '@/lib/db'
import { withRoute } from '@/lib/api'

/** GET /api/search?q=… — top hits across every knowledge surface. */
export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').slice(0, 200)
  const result = searchAll(db, q)
  return Response.json({ ok: true, ...result })
})
