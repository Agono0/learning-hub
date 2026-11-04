/**
 * /api/backup — whole-database backup & restore.
 * GET  → backupAll() envelope as a JSON download ({version, exportedAt, tables}).
 * POST → restore the posted envelope: zod-validated, then truncate + reinsert
 *        inside ONE transaction (append-only revlog/xp_events/elo_events ids kept).
 */
import { z } from 'zod'
import { backupAll, restoreAll } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

/** Restore body cap — a full backup envelope for this app stays well below this. */
const MAX_BACKUP_BODY_BYTES = 64 * 1024 * 1024

export async function GET() {
  const backup = backupAll()
  return new Response(JSON.stringify(backup), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="learning-hub-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      'cache-control': 'no-store',
    },
  })
}

export const POST = withRoute(async (req: Request) => {
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BACKUP_BODY_BYTES) {
    throw new ApiError(413, 'backup payload exceeds the 64MB limit')
  }
  // restoreAll zod-validates the envelope itself and throws ValidationError → 400.
  const body = await readJson(req, z.unknown())
  const result = restoreAll(body)
  return Response.json({ ok: true, ...result })
})
