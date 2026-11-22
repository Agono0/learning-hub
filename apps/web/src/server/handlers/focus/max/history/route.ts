/**
 * /api/focus/max/history — Max Focus session + exit history (M2-04 / M2-25).
 *
 * GET ?limit= — recent Max Focus sessions (newest first) plus the exit
 * reflections from the append-only friction log (rule 8). Powers the focus
 * page's session-history section; the data lives in the repo so MCP/CLI can
 * reuse it unchanged.
 */
import { z } from 'zod'
import { listMaxFocusExits, listMaxFocusSessions } from '@learning-hub/db'
import { readQuery, withRoute } from '@/lib/api'

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export const GET = withRoute(async (req: Request) => {
  const query = readQuery(req, historyQuerySchema)
  const sessions = listMaxFocusSessions({ limit: query.limit })
  const exits = listMaxFocusExits({ limit: query.limit })
  return Response.json({ ok: true, sessions, exits })
})
