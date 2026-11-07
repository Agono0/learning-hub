/**
 * /api/sync — Serverless free Cloud Sync (Dropbox, GitHub Secret Gist / Private Repo,
 * Google Drive, WebDAV) + optional AES-256-GCM E2EE configuration and execution.
 *
 * Runtime-neutral: outbound HTTP goes exclusively through `networkFetch` from
 * `@learning-hub/ai-adapters` (Node `fetch` on web, `@tauri-apps/plugin-http`
 * in Windows/Android Web Worker). Sync credentials stay strictly device-local in
 * `sync_configs` and are masked on GET.
 */
import { z } from 'zod'
import { networkFetch } from '@learning-hub/ai-adapters'
import { executeCloudSync, getSyncConfig, listSyncDevices, saveSyncConfig } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const syncProviderSchema = z.enum(['none', 'dropbox', 'github', 'gdrive', 'webdav'])

const syncConfigSchema = z.object({
  provider: syncProviderSchema.optional(),
  config: z.record(z.string().max(64), z.string().max(4096)).optional(),
  encryptionEnabled: z.boolean().optional(),
  passphrase: z.string().max(512).nullable().optional(),
})

/** Client-side device descriptor (stable localStorage UUID — never DB-derived). */
const syncDeviceSchema = z.object({
  deviceId: z.string().min(8).max(64),
  name: z.string().min(1).max(80),
  platform: z.string().max(40).nullable().optional(),
})

const syncActionSchema = z.object({
  action: z.enum(['test', 'pull', 'push', 'sync']),
  override: syncConfigSchema.optional(),
  device: syncDeviceSchema.optional(),
})

export const GET = withRoute(async (req: Request) => {
  const thisDeviceId = new URL(req.url).searchParams.get('deviceId')
  return Response.json({
    ok: true,
    sync: getSyncConfig({ maskSecrets: true }),
    devices: listSyncDevices(thisDeviceId),
  })
})

export const PUT = withRoute(async (req: Request) => {
  const body = await readJson(req, syncConfigSchema)
  saveSyncConfig(body)
  return Response.json({
    ok: true,
    sync: getSyncConfig({ maskSecrets: true }),
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, syncActionSchema)
  try {
    const result = await executeCloudSync({
      action: body.action,
      override: body.override,
      device: body.device,
      fetchFn: networkFetch,
    })
    return Response.json({
      ...result,
      sync: getSyncConfig({ maskSecrets: true }),
      devices: listSyncDevices(body.device?.deviceId),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cloud sync failed'
    const isClientOrConfigError =
      /requires|passphrase|Select a Cloud Sync|format|URL must|Decryption|not valid JSON|No cloud sync/i.test(
        message,
      )
    return Response.json(
      { ok: false, error: message },
      { status: isClientOrConfigError ? 400 : 502 },
    )
  }
})
