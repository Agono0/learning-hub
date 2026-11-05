/**
 * /api/backup — whole-database backup, destructive restore, and non-destructive Smart Merge.
 * GET  → sanitized backupAll() envelope as a JSON download (secrets stripped).
 * POST → `?mode=merge` runs non-destructive `mergeBackup()` (unioning append-only
 *        logs + FSRS history replay); default `?mode=replace` runs `restoreAll()`.
 *        Accepts both plain `BackupFile` JSON and `EncryptedSyncEnvelope` (with
 *        `{ envelope, passphrase }` or stored sync passphrase).
 */
import { z } from 'zod'
import { decryptSyncPayload, isEncryptedSyncEnvelope } from '@learning-hub/core'
import { backupAll, getSyncConfig, mergeBackup, restoreAll } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

/** Restore body cap — a full backup envelope for this app stays well below this. */
const MAX_BACKUP_BODY_BYTES = 64 * 1024 * 1024

export const GET = withRoute(async () => {
  const backup = backupAll()
  return new Response(JSON.stringify(backup), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="learning-hub-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      'cache-control': 'no-store',
    },
  })
})

export const POST = withRoute(async (req: Request) => {
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BACKUP_BODY_BYTES) {
    throw new ApiError(413, 'backup payload exceeds the 64MB limit')
  }

  const rawBody = await readJson(req, z.unknown())
  let payload: unknown = rawBody
  let bodyPassphrase: string | undefined

  if (
    rawBody &&
    typeof rawBody === 'object' &&
    'envelope' in (rawBody as Record<string, unknown>)
  ) {
    const wrapped = rawBody as { envelope: unknown; passphrase?: unknown }
    payload = wrapped.envelope
    if (typeof wrapped.passphrase === 'string') {
      bodyPassphrase = wrapped.passphrase
    }
  }

  if (isEncryptedSyncEnvelope(payload)) {
    const pass = bodyPassphrase || getSyncConfig({ maskSecrets: false }).passphrase
    if (!pass) {
      throw new ApiError(400, 'Backup file is encrypted — enter its passphrase to restore')
    }
    try {
      const decryptedJson = await decryptSyncPayload(payload, pass)
      payload = JSON.parse(decryptedJson)
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : 'Decryption failed')
    }
  }

  const mode = new URL(req.url).searchParams.get('mode')
  if (mode === 'merge') {
    const mergeResult = await mergeBackup(payload)
    return Response.json({ ok: true, mode: 'merge', ...mergeResult })
  }

  // Default mode='replace' preserves backwards compatibility: zod-validates & replaces inside one tx.
  const result = restoreAll(payload)
  return Response.json({ ok: true, mode: 'replace', ...result })
})
