/**
 * Runtime-neutral Serverless Cloud Sync engine over an injectable `fetch`
 * (`networkFetch` in Web/Tauri Worker, `globalThis.fetch` in Node CLI/MCP).
 *
 * Supported free providers:
 * - Dropbox (`content.dropboxapi.com/2/files/download` & `upload`, optional refresh token)
 * - GitHub (`Secret Gist` or `Private Repo` Contents API via Personal Access Token)
 * - Google Drive (`drive/v3` `appDataFolder` or root Drive file, optional refresh token)
 * - WebDAV (Nextcloud, Koofr, Fastmail, Box, Synology, self-hosted `GET` / `PUT`)
 *
 * Security:
 * - Outbound payloads come from `backupAll()`, which strips `sync_configs`,
 *   `ai_api_key`, and `ai_headers`.
 * - When `encryptionEnabled` is true, payloads are encrypted before upload via
 *   `AES-256-GCM` (`PBKDF2-SHA256`, 210k iterations) in `@learning-hub/core`.
 */
import { decryptSyncPayload, encryptSyncPayload, isEncryptedSyncEnvelope } from '@learning-hub/core'
import { backupAll } from './backup'
import { getRawDb, type RawSqliteHandle } from './index'
import {
  getSyncConfig,
  mergeBackup,
  saveSyncConfig,
  type MergeResult,
  type SyncProviderKind,
} from './sync'

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface ProviderPullResult {
  content: string | null
  revision: string | null
  configPatch?: Record<string, string>
}

export interface ProviderPushResult {
  revision: string | null
  configPatch?: Record<string, string>
}

export interface CloudSyncExecutionResult {
  ok: true
  action: 'test' | 'pull' | 'push' | 'sync'
  provider: SyncProviderKind
  encrypted: boolean
  pulled: boolean
  pushed: boolean
  mergeResult: MergeResult | null
  revision: string | null
  syncedAt: string | null
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  if (typeof btoa === 'function') {
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
  }
  const G = globalThis as unknown as {
    Buffer?: { from(b: Uint8Array): { toString(enc: 'base64'): string } }
  }
  if (G.Buffer) return G.Buffer.from(bytes).toString('base64')
  throw new Error('Base64 encoder unavailable')
}

function base64ToUtf8(b64: string): string {
  const clean = b64.replace(/\s+/g, '')
  if (typeof atob === 'function') {
    const bin = atob(clean)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  }
  const G = globalThis as unknown as {
    Buffer?: { from(s: string, enc: 'base64'): Uint8Array }
  }
  if (G.Buffer) return new TextDecoder().decode(G.Buffer.from(clean, 'base64'))
  throw new Error('Base64 decoder unavailable')
}

// ─── Dropbox adapter ────────────────────────────────────────────────────────

async function resolveDropboxToken(
  cfg: Record<string, string>,
  fetchFn: FetchLike,
): Promise<string> {
  if (cfg['refreshToken'] && cfg['appKey']) {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cfg['refreshToken'],
      client_id: cfg['appKey'],
    })
    if (cfg['clientSecret']) params.set('client_secret', cfg['clientSecret'])
    const res = await fetchFn('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!res.ok) {
      throw new Error(`Dropbox token refresh failed (${res.status}): ${await res.text()}`)
    }
    const json = (await res.json()) as { access_token?: string }
    if (!json.access_token) throw new Error('Dropbox token refresh returned no access_token')
    return json.access_token
  }
  if (cfg['accessToken']) return cfg['accessToken']
  throw new Error('Dropbox requires an Access Token (or App Key + Refresh Token)')
}

function normalizeDropboxPath(raw?: string): string {
  const trimmed = (raw || '/learning-hub-sync.json').trim()
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

async function dropboxPull(
  cfg: Record<string, string>,
  fetchFn: FetchLike,
): Promise<ProviderPullResult> {
  const token = await resolveDropboxToken(cfg, fetchFn)
  const path = normalizeDropboxPath(cfg['path'])
  const res = await fetchFn('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path }),
    },
  })
  if (res.status === 409) {
    const errText = await res.text()
    if (errText.includes('not_found')) {
      return { content: null, revision: null }
    }
    throw new Error(`Dropbox download conflict: ${errText}`)
  }
  if (!res.ok) {
    throw new Error(`Dropbox download failed (${res.status}): ${await res.text()}`)
  }
  const metaHeader = res.headers.get('dropbox-api-result')
  let revision: string | null = null
  if (metaHeader) {
    try {
      revision = (JSON.parse(metaHeader) as { rev?: string }).rev ?? null
    } catch {
      revision = null
    }
  }
  return { content: await res.text(), revision }
}

async function dropboxPush(
  cfg: Record<string, string>,
  payload: string,
  fetchFn: FetchLike,
): Promise<ProviderPushResult> {
  const token = await resolveDropboxToken(cfg, fetchFn)
  const path = normalizeDropboxPath(cfg['path'])
  const res = await fetchFn('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path,
        mode: 'overwrite',
        mute: true,
      }),
    },
    body: payload,
  })
  if (!res.ok) {
    throw new Error(`Dropbox upload failed (${res.status}): ${await res.text()}`)
  }
  const meta = (await res.json()) as { rev?: string }
  return { revision: meta.rev ?? null }
}

// ─── GitHub (Secret Gist / Private Repo) adapter ────────────────────────────

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function githubPull(
  cfg: Record<string, string>,
  fetchFn: FetchLike,
): Promise<ProviderPullResult> {
  const token = cfg['token']
  if (!token) throw new Error('GitHub sync requires a Personal Access Token')
  const target = cfg['target'] === 'repo' ? 'repo' : 'gist'
  const filename = (cfg['filename'] || 'learning-hub-sync.json').trim()

  if (target === 'gist') {
    const gistId = cfg['gistId']?.trim()
    if (!gistId) {
      // Verify token validity when testing before first push
      const userRes = await fetchFn('https://api.github.com/user', {
        headers: githubHeaders(token),
      })
      if (!userRes.ok) {
        throw new Error(`GitHub authentication failed (${userRes.status}): ${await userRes.text()}`)
      }
      return { content: null, revision: null }
    }
    const res = await fetchFn(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
      headers: githubHeaders(token),
    })
    if (res.status === 404) return { content: null, revision: null }
    if (!res.ok) throw new Error(`GitHub Gist fetch failed (${res.status}): ${await res.text()}`)
    const data = (await res.json()) as {
      updated_at?: string
      files?: Record<
        string,
        { content?: string; truncated?: boolean; raw_url?: string } | undefined
      >
    }
    const fileObj = data.files?.[filename] ?? Object.values(data.files ?? {})[0]
    if (!fileObj) return { content: null, revision: data.updated_at ?? null }
    if (fileObj.truncated && fileObj.raw_url) {
      const rawRes = await fetchFn(fileObj.raw_url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!rawRes.ok) throw new Error(`GitHub Gist raw download failed (${rawRes.status})`)
      return { content: await rawRes.text(), revision: data.updated_at ?? null }
    }
    return { content: fileObj.content ?? null, revision: data.updated_at ?? null }
  }

  // Private repo Contents API
  const repo = cfg['repo']?.trim()
  if (!repo || !repo.includes('/')) {
    throw new Error('GitHub Repo mode requires repo in "owner/name" format')
  }
  const path = (cfg['path'] || filename).replace(/^\/+/, '')
  const branch = (cfg['branch'] || 'main').trim()
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const res = await fetchFn(
    `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    { headers: githubHeaders(token) },
  )
  if (res.status === 404) return { content: null, revision: null }
  if (!res.ok) throw new Error(`GitHub Repo fetch failed (${res.status}): ${await res.text()}`)
  const data = (await res.json()) as {
    sha?: string
    content?: string
    encoding?: string
    download_url?: string
  }
  if (data.content && data.encoding === 'base64') {
    return { content: base64ToUtf8(data.content), revision: data.sha ?? null }
  }
  if (data.download_url) {
    const rawRes = await fetchFn(data.download_url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!rawRes.ok) throw new Error(`GitHub Repo raw download failed (${rawRes.status})`)
    return { content: await rawRes.text(), revision: data.sha ?? null }
  }
  return { content: null, revision: data.sha ?? null }
}

async function githubPush(
  cfg: Record<string, string>,
  payload: string,
  fetchFn: FetchLike,
): Promise<ProviderPushResult> {
  const token = cfg['token']
  if (!token) throw new Error('GitHub sync requires a Personal Access Token')
  const target = cfg['target'] === 'repo' ? 'repo' : 'gist'
  const filename = (cfg['filename'] || 'learning-hub-sync.json').trim()

  if (target === 'gist') {
    const gistId = cfg['gistId']?.trim()
    if (!gistId) {
      const createRes = await fetchFn('https://api.github.com/gists', {
        method: 'POST',
        headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Learning HUB encrypted/private cloud sync snapshot',
          public: false,
          files: { [filename]: { content: payload } },
        }),
      })
      if (!createRes.ok) {
        throw new Error(
          `GitHub Gist creation failed (${createRes.status}): ${await createRes.text()}`,
        )
      }
      const created = (await createRes.json()) as { id: string; updated_at?: string }
      return { revision: created.updated_at ?? created.id, configPatch: { gistId: created.id } }
    }

    const patchRes = await fetchFn(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
      method: 'PATCH',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: { [filename]: { content: payload } },
      }),
    })
    if (!patchRes.ok) {
      throw new Error(`GitHub Gist update failed (${patchRes.status}): ${await patchRes.text()}`)
    }
    const updated = (await patchRes.json()) as { updated_at?: string }
    return { revision: updated.updated_at ?? gistId }
  }

  // Private repo Contents API
  const repo = cfg['repo']?.trim()
  if (!repo || !repo.includes('/')) {
    throw new Error('GitHub Repo mode requires repo in "owner/name" format')
  }
  const path = (cfg['path'] || filename).replace(/^\/+/, '')
  const branch = (cfg['branch'] || 'main').trim()
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const url = `https://api.github.com/repos/${repo}/contents/${encodedPath}`

  let existingSha: string | undefined
  const headRes = await fetchFn(`${url}?ref=${encodeURIComponent(branch)}`, {
    headers: githubHeaders(token),
  })
  if (headRes.ok) {
    const meta = (await headRes.json()) as { sha?: string }
    existingSha = meta.sha
  }

  const putRes = await fetchFn(url, {
    method: 'PUT',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `sync: update Learning HUB snapshot (${new Date().toISOString()})`,
      content: utf8ToBase64(payload),
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  })
  if (!putRes.ok) {
    throw new Error(`GitHub Repo upload failed (${putRes.status}): ${await putRes.text()}`)
  }
  const resJson = (await putRes.json()) as { content?: { sha?: string } }
  return { revision: resJson.content?.sha ?? null }
}

// ─── Google Drive adapter ───────────────────────────────────────────────────

async function resolveGDriveToken(
  cfg: Record<string, string>,
  fetchFn: FetchLike,
): Promise<string> {
  if (cfg['refreshToken'] && cfg['clientId']) {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cfg['refreshToken'],
      client_id: cfg['clientId'],
    })
    if (cfg['clientSecret']) params.set('client_secret', cfg['clientSecret'])
    const res = await fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!res.ok) {
      throw new Error(`Google Drive token refresh failed (${res.status}): ${await res.text()}`)
    }
    const json = (await res.json()) as { access_token?: string }
    if (!json.access_token) throw new Error('Google OAuth refresh returned no access_token')
    return json.access_token
  }
  if (cfg['accessToken']) return cfg['accessToken']
  throw new Error('Google Drive requires an Access Token (or Client ID + Refresh Token)')
}

async function findGDriveFile(
  token: string,
  cfg: Record<string, string>,
  fetchFn: FetchLike,
): Promise<{ id: string; modifiedTime?: string } | null> {
  if (cfg['fileId']) {
    const check = await fetchFn(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cfg['fileId'])}?fields=id,modifiedTime,trashed`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (check.ok) {
      const meta = (await check.json()) as { id: string; modifiedTime?: string; trashed?: boolean }
      if (!meta.trashed) return meta
    }
  }
  const space = cfg['space'] === 'drive' ? 'drive' : 'appDataFolder'
  const filename = (cfg['filename'] || 'learning-hub-sync.json').replace(/'/g, "\\'")
  const q = `name='${filename}' and trashed=false`
  const listUrl = `https://www.googleapis.com/drive/v3/files?spaces=${space}&q=${encodeURIComponent(q)}&fields=files(id,modifiedTime)&pageSize=1`
  const listRes = await fetchFn(listUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (!listRes.ok) {
    throw new Error(`Google Drive file lookup failed (${listRes.status}): ${await listRes.text()}`)
  }
  const data = (await listRes.json()) as { files?: { id: string; modifiedTime?: string }[] }
  return data.files?.[0] ?? null
}

async function gdrivePull(
  cfg: Record<string, string>,
  fetchFn: FetchLike,
): Promise<ProviderPullResult> {
  const token = await resolveGDriveToken(cfg, fetchFn)
  const file = await findGDriveFile(token, cfg, fetchFn)
  if (!file) return { content: null, revision: null }
  const dlRes = await fetchFn(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (dlRes.status === 404) return { content: null, revision: null }
  if (!dlRes.ok) {
    throw new Error(`Google Drive download failed (${dlRes.status}): ${await dlRes.text()}`)
  }
  return {
    content: await dlRes.text(),
    revision: file.modifiedTime ?? file.id,
    configPatch: cfg['fileId'] === file.id ? undefined : { fileId: file.id },
  }
}

async function gdrivePush(
  cfg: Record<string, string>,
  payload: string,
  fetchFn: FetchLike,
): Promise<ProviderPushResult> {
  const token = await resolveGDriveToken(cfg, fetchFn)
  const existing = await findGDriveFile(token, cfg, fetchFn)
  let fileId = existing?.id
  const space = cfg['space'] === 'drive' ? 'drive' : 'appDataFolder'
  const filename = (cfg['filename'] || 'learning-hub-sync.json').trim()

  if (!fileId) {
    const createRes = await fetchFn('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: filename,
        mimeType: 'application/json',
        ...(space === 'appDataFolder' ? { parents: ['appDataFolder'] } : {}),
      }),
    })
    if (!createRes.ok) {
      throw new Error(
        `Google Drive file creation failed (${createRes.status}): ${await createRes.text()}`,
      )
    }
    const created = (await createRes.json()) as { id: string }
    fileId = created.id
  }

  const uploadRes = await fetchFn(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,modifiedTime`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: payload,
    },
  )
  if (!uploadRes.ok) {
    throw new Error(`Google Drive upload failed (${uploadRes.status}): ${await uploadRes.text()}`)
  }
  const uploaded = (await uploadRes.json()) as { id: string; modifiedTime?: string }
  return {
    revision: uploaded.modifiedTime ?? uploaded.id,
    configPatch: cfg['fileId'] === fileId ? undefined : { fileId },
  }
}

// ─── WebDAV adapter ─────────────────────────────────────────────────────────

function webdavHeaders(cfg: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {}
  if (cfg['username'] || cfg['password']) {
    const cred = utf8ToBase64(`${cfg['username'] ?? ''}:${cfg['password'] ?? ''}`)
    headers['Authorization'] = `Basic ${cred}`
  } else if (cfg['token']) {
    headers['Authorization'] = `Bearer ${cfg['token']}`
  }
  return headers
}

function validateWebdavUrl(raw?: string): string {
  const trimmed = (raw || '').trim()
  if (!trimmed)
    throw new Error('WebDAV requires a target file URL (e.g. https://.../learning-hub-sync.json)')
  const parsed = new URL(trimmed)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('WebDAV URL must use https:// or http://')
  }
  return parsed.toString()
}

async function webdavPull(
  cfg: Record<string, string>,
  fetchFn: FetchLike,
): Promise<ProviderPullResult> {
  const url = validateWebdavUrl(cfg['url'])
  const res = await fetchFn(url, {
    method: 'GET',
    headers: webdavHeaders(cfg),
  })
  if (res.status === 404) return { content: null, revision: null }
  if (!res.ok) {
    throw new Error(`WebDAV GET failed (${res.status}): ${await res.text()}`)
  }
  const rev = res.headers.get('etag') ?? res.headers.get('last-modified') ?? null
  return { content: await res.text(), revision: rev }
}

async function webdavPush(
  cfg: Record<string, string>,
  payload: string,
  fetchFn: FetchLike,
): Promise<ProviderPushResult> {
  const url = validateWebdavUrl(cfg['url'])
  const res = await fetchFn(url, {
    method: 'PUT',
    headers: {
      ...webdavHeaders(cfg),
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: payload,
  })
  if (!res.ok) {
    throw new Error(`WebDAV PUT failed (${res.status}): ${await res.text()}`)
  }
  const rev = res.headers.get('etag') ?? new Date().toISOString()
  return { revision: rev }
}

// ─── Unified Cloud Sync Orchestrator ────────────────────────────────────────

async function pullFromProvider(
  provider: SyncProviderKind,
  cfg: Record<string, string>,
  fetchFn: FetchLike,
): Promise<ProviderPullResult> {
  switch (provider) {
    case 'dropbox':
      return dropboxPull(cfg, fetchFn)
    case 'github':
      return githubPull(cfg, fetchFn)
    case 'gdrive':
      return gdrivePull(cfg, fetchFn)
    case 'webdav':
      return webdavPull(cfg, fetchFn)
    default:
      throw new Error('No cloud sync provider configured')
  }
}

async function pushToProvider(
  provider: SyncProviderKind,
  cfg: Record<string, string>,
  payload: string,
  fetchFn: FetchLike,
): Promise<ProviderPushResult> {
  switch (provider) {
    case 'dropbox':
      return dropboxPush(cfg, payload, fetchFn)
    case 'github':
      return githubPush(cfg, payload, fetchFn)
    case 'gdrive':
      return gdrivePush(cfg, payload, fetchFn)
    case 'webdav':
      return webdavPush(cfg, payload, fetchFn)
    default:
      throw new Error('No cloud sync provider configured')
  }
}

/**
 * Execute a Cloud Sync operation (`test`, `pull`, `push`, or bidirectional `sync`)
 * against the configured provider (or an explicit override during `test`).
 */
export async function executeCloudSync(opts: {
  action: 'test' | 'pull' | 'push' | 'sync'
  override?: {
    provider?: SyncProviderKind
    config?: Record<string, string>
    encryptionEnabled?: boolean
    passphrase?: string | null
  }
  fetchFn?: FetchLike
  database?: RawSqliteHandle
  pbkdf2Iterations?: number
}): Promise<CloudSyncExecutionResult> {
  const database = opts.database ?? getRawDb()
  const fetchFn = opts.fetchFn ?? globalThis.fetch
  const stored = getSyncConfig({ maskSecrets: false, database })

  const provider = opts.override?.provider ?? stored.provider
  if (provider === 'none') {
    throw new Error('Select a Cloud Sync provider (Dropbox, GitHub, Google Drive, or WebDAV) first')
  }

  // Merge non-empty override fields over stored config so testing unsaved edits works
  const effectiveConfig: Record<string, string> = { ...stored.config }
  if (opts.override?.config) {
    for (const [k, v] of Object.entries(opts.override.config)) {
      if (k.startsWith('has_')) continue
      if (v !== '' && !v.includes('••••')) effectiveConfig[k] = v
    }
  }
  const encryptionEnabled = opts.override?.encryptionEnabled ?? stored.encryptionEnabled
  const passphrase =
    opts.override?.passphrase && !opts.override.passphrase.includes('••••')
      ? opts.override.passphrase
      : stored.passphrase

  if (encryptionEnabled && !passphrase) {
    throw new Error('End-to-end encryption is enabled — provide your encryption passphrase')
  }

  if (opts.action === 'test') {
    const pullRes = await pullFromProvider(provider, effectiveConfig, fetchFn)
    return {
      ok: true,
      action: 'test',
      provider,
      encrypted: encryptionEnabled,
      pulled: pullRes.content !== null,
      pushed: false,
      mergeResult: null,
      revision: pullRes.revision,
      syncedAt: stored.lastSyncedAt,
    }
  }

  let pulled = false
  let pushed = false
  let mergeResult: MergeResult | null = null
  let latestRevision = stored.lastSyncRevision
  const configPatches: Record<string, string> = {}

  if (opts.action === 'pull' || opts.action === 'sync') {
    const pullRes = await pullFromProvider(provider, effectiveConfig, fetchFn)
    if (pullRes.configPatch) {
      Object.assign(configPatches, pullRes.configPatch)
      Object.assign(effectiveConfig, pullRes.configPatch)
    }
    if (pullRes.content !== null && pullRes.content.trim().length > 0) {
      let rawEnvelope: unknown
      try {
        rawEnvelope = JSON.parse(pullRes.content)
      } catch {
        throw new Error('Remote sync file is not valid JSON')
      }
      if (isEncryptedSyncEnvelope(rawEnvelope)) {
        if (!passphrase) {
          throw new Error(
            'Remote sync snapshot is encrypted — enter your E2EE passphrase in Cloud Sync settings',
          )
        }
        const decryptedText = await decryptSyncPayload(rawEnvelope, passphrase)
        rawEnvelope = JSON.parse(decryptedText)
      }
      mergeResult = await mergeBackup(rawEnvelope, database)
      pulled = true
      latestRevision = pullRes.revision ?? latestRevision
    }
  }

  if (opts.action === 'push' || opts.action === 'sync') {
    const snapshot = backupAll(database)
    const plainJson = JSON.stringify(snapshot)
    const wirePayload = encryptionEnabled
      ? JSON.stringify(
          await encryptSyncPayload(plainJson, passphrase!, {
            iterations: opts.pbkdf2Iterations,
          }),
        )
      : plainJson

    const pushRes = await pushToProvider(provider, effectiveConfig, wirePayload, fetchFn)
    if (pushRes.configPatch) {
      Object.assign(configPatches, pushRes.configPatch)
    }
    pushed = true
    latestRevision = pushRes.revision ?? latestRevision
  }

  const syncedAt = new Date().toISOString()
  saveSyncConfig(
    {
      config: Object.keys(configPatches).length > 0 ? configPatches : undefined,
      lastSyncedAt: syncedAt,
      lastSyncRevision: latestRevision,
    },
    database,
  )

  return {
    ok: true,
    action: opts.action,
    provider,
    encrypted: encryptionEnabled,
    pulled,
    pushed,
    mergeResult,
    revision: latestRevision,
    syncedAt,
  }
}
