'use client'

/**
 * Backup, Cloud Sync & Import/Export — one calm hub for data portability:
 * - Serverless free Cloud Sync (Dropbox, GitHub Secret Gist / Private Repo,
 *   Google Drive, WebDAV) with optional client-side AES-256-GCM E2EE
 * - Non-destructive Smart Merge (`?mode=merge`) alongside full Replace restore
 * - Drag-drop import (.apkg / Anki .txt / deck .json / whole-DB backup .json)
 * - Per-deck export buttons (Anki txt + JSON)
 *
 * CLIENT component — talks exclusively via `@/lib/transport` (Hard Rule #1).
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDownload, apiGet, apiSend } from '@/lib/transport'
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  DatabaseBackup,
  Download,
  FileJson,
  FileUp,
  GitMerge,
  Laptop,
  Lock,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react'
import { PageHeader } from '@/ui'
import { getDeviceIdentity } from '@/lib/device'

type SyncProviderKind = 'none' | 'dropbox' | 'github' | 'gdrive' | 'webdav'

interface SyncDeviceRow {
  deviceId: string
  name: string
  platform: string | null
  lastPushAt: string | null
  lastPullAt: string | null
  lastRevision: string | null
  isThisDevice: boolean
}

interface SyncConfigState {
  provider: SyncProviderKind
  config: Record<string, string>
  encryptionEnabled: boolean
  hasPassphrase: boolean
  lastSyncedAt: string | null
  lastSyncRevision: string | null
  updatedAt: string
}

interface SyncActionResponse {
  ok: boolean
  action?: 'test' | 'pull' | 'push' | 'sync'
  provider?: SyncProviderKind
  encrypted?: boolean
  pulled?: boolean
  pushed?: boolean
  mergeResult?: {
    tablesProcessed: number
    inserted: number
    updated: number
    tombstoned: number
    rescheduledCards: number
  } | null
  revision?: string | null
  syncedAt?: string | null
  sync?: SyncConfigState
  devices?: SyncDeviceRow[]
  error?: string
}

interface DeckInfo {
  id: number
  name: string
  emoji: string | null
  total: number
  due: number
  newCards: number
}

interface ImportResult {
  ok?: boolean
  deckId?: number
  deckName?: string
  imported?: number
  rejectedCards?: number
  skippedModels?: string[]
  error?: string
}

interface RestoreResult {
  ok?: boolean
  mode?: 'merge' | 'replace'
  tables?: number
  rows?: number
  tablesProcessed?: number
  inserted?: number
  updated?: number
  tombstoned?: number
  rescheduledCards?: number
  error?: string
}

interface StatusLine {
  kind: 'ok' | 'error' | 'info'
  text: string
}

const APKG_MAX_BYTES = 50 * 1024 * 1024

function isBackupEnvelope(
  parsed: unknown,
): parsed is { version: number; exportedAt: string; tables: Record<string, unknown[]> } {
  if (!parsed || typeof parsed !== 'object') return false
  const candidate = parsed as { tables?: unknown; exportedAt?: unknown }
  return (
    typeof candidate.tables === 'object' &&
    candidate.tables !== null &&
    !Array.isArray(candidate.tables) &&
    typeof candidate.exportedAt === 'string'
  )
}

function isEncryptedEnvelope(
  parsed: unknown,
): parsed is { encrypted: true; cipher: string; exportedAt: string } {
  if (!parsed || typeof parsed !== 'object') return false
  const candidate = parsed as { encrypted?: unknown; cipher?: unknown; ciphertext?: unknown }
  return candidate.encrypted === true && typeof candidate.ciphertext === 'string'
}

export default function BackupPage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const restoreRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [deckName, setDeckName] = useState('')
  const [status, setStatus] = useState<StatusLine[]>([])
  const [downloading, setDownloading] = useState(false)
  const [restorePassphrase, setRestorePassphrase] = useState('')
  const [pendingBackup, setPendingBackup] = useState<{
    name: string
    tables: number
    rows: number
    encrypted: boolean
    data: unknown
  } | null>(null)

  // Cloud sync form state
  const [provider, setProvider] = useState<SyncProviderKind>('none')
  const [cfg, setCfg] = useState<Record<string, string>>({})
  const [encryptionEnabled, setEncryptionEnabled] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [syncFeedback, setSyncFeedback] = useState<StatusLine | null>(null)

  const syncQuery = useQuery<{ ok: boolean; sync: SyncConfigState; devices: SyncDeviceRow[] }>({
    queryKey: ['sync-config'],
    queryFn: () => {
      // Client-side device id marks the roster's "this device" row (hydration-safe:
      // the localStorage read happens inside the query fn, after mount).
      const { deviceId } = getDeviceIdentity()
      return apiGet<{ ok: boolean; sync: SyncConfigState; devices: SyncDeviceRow[] }>(
        `/api/sync${deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : ''}`,
      )
    },
  })

  useEffect(() => {
    const s = syncQuery.data?.sync
    if (!s) return
    setProvider(s.provider)
    setCfg(s.config ?? {})
    setEncryptionEnabled(s.encryptionEnabled)
  }, [syncQuery.data])

  const decks = useQuery<{ decks: DeckInfo[] }>({
    queryKey: ['decks'],
    queryFn: () => apiGet<{ decks: DeckInfo[] }>('/api/decks'),
  })

  const log = (line: StatusLine) => setStatus((prev) => [line, ...prev].slice(0, 8))

  const updateCfg = (key: string, value: string) => {
    setCfg((prev) => ({ ...prev, [key]: value }))
  }

  const saveSyncMutation = useMutation({
    mutationFn: () =>
      apiSend<{ ok: boolean; sync: SyncConfigState }>('/api/sync', 'PUT', {
        provider,
        config: cfg,
        encryptionEnabled,
        ...(passphrase.trim() ? { passphrase: passphrase.trim() } : {}),
      }),
    onSuccess: (res) => {
      setPassphrase('')
      void qc.invalidateQueries({ queryKey: ['sync-config'] })
      setSyncFeedback({
        kind: 'ok',
        text: `Cloud Sync settings saved (${res.sync.provider === 'none' ? 'disabled' : res.sync.provider}).`,
      })
    },
    onError: (e) =>
      setSyncFeedback({
        kind: 'error',
        text: e instanceof Error ? e.message : 'Could not save Cloud Sync settings',
      }),
  })

  const runSyncMutation = useMutation({
    mutationFn: async (action: 'test' | 'pull' | 'push' | 'sync') => {
      // Save unsaved config changes first if running a live sync/pull/push
      if (action !== 'test') {
        await apiSend('/api/sync', 'PUT', {
          provider,
          config: cfg,
          encryptionEnabled,
          ...(passphrase.trim() ? { passphrase: passphrase.trim() } : {}),
        })
      }
      return apiSend<SyncActionResponse>('/api/sync', 'POST', {
        action,
        device: getDeviceIdentity(),
        override: {
          provider,
          config: cfg,
          encryptionEnabled,
          ...(passphrase.trim() ? { passphrase: passphrase.trim() } : {}),
        },
      })
    },
    onSuccess: (res, action) => {
      if (!res.ok) {
        setSyncFeedback({ kind: 'error', text: res.error ?? 'Cloud sync failed' })
        return
      }
      setPassphrase('')
      void qc.invalidateQueries()
      if (action === 'test') {
        setSyncFeedback({
          kind: 'ok',
          text: `Connection verified (${res.provider})${res.pulled ? ' — existing remote snapshot found' : ' — ready for first push'}.`,
        })
        return
      }
      const m = res.mergeResult
      const mergeSummary = m
        ? `merged +${m.inserted} new, ${m.updated} updated${m.rescheduledCards ? `, ${m.rescheduledCards} FSRS cards replayed` : ''}`
        : 'no remote snapshot yet'
      const label =
        action === 'sync'
          ? `Synced (${mergeSummary} → pushed${res.encrypted ? ' E2EE' : ''})`
          : action === 'pull'
            ? `Pulled (${mergeSummary})`
            : `Pushed snapshot${res.encrypted ? ' (AES-256-GCM E2EE)' : ''}`
      setSyncFeedback({ kind: 'ok', text: label })
    },
    onError: (e) =>
      setSyncFeedback({
        kind: 'error',
        text: e instanceof Error ? e.message : 'Cloud sync request failed',
      }),
  })

  const importMutation = useMutation({
    mutationFn: (body: { kind: 'apkg' | 'txt' | 'json'; payload: string; deckName?: string }) =>
      apiSend<ImportResult>('/api/import', 'POST', body),
    onSuccess: (data, vars) => {
      if (data.ok) {
        log({
          kind: 'ok',
          text: `imported "${vars.deckName || data.deckName}": ${data.imported} cards${data.rejectedCards ? `, ${data.rejectedCards} rejected` : ''}${data.skippedModels?.length ? `, skipped models: ${data.skippedModels.join(', ')}` : ''}`,
        })
        void qc.invalidateQueries({ queryKey: ['decks'] })
      } else {
        log({ kind: 'error', text: data.error ?? 'import failed' })
      }
    },
    onError: (e) => log({ kind: 'error', text: e instanceof Error ? e.message : 'import failed' }),
  })

  const restoreMutation = useMutation({
    mutationFn: (vars: { mode: 'merge' | 'replace'; data: unknown; passphrase?: string }) => {
      const url = vars.mode === 'merge' ? '/api/backup?mode=merge' : '/api/backup'
      const body = vars.passphrase
        ? { envelope: vars.data, passphrase: vars.passphrase }
        : vars.data
      return apiSend<RestoreResult>(url, 'POST', body)
    },
    onSuccess: (data, vars) => {
      setPendingBackup(null)
      setRestorePassphrase('')
      if (data.ok) {
        if (vars.mode === 'merge') {
          log({
            kind: 'ok',
            text: `smart merge complete — +${data.inserted ?? 0} inserted, ${data.updated ?? 0} updated${data.rescheduledCards ? `, ${data.rescheduledCards} cards rescheduled` : ''}`,
          })
        } else {
          log({
            kind: 'ok',
            text: `backup restored — ${data.rows} rows across ${data.tables} tables`,
          })
        }
        void qc.invalidateQueries()
      } else {
        log({ kind: 'error', text: data.error ?? 'restore failed' })
      }
    },
    onError: (e) => log({ kind: 'error', text: e instanceof Error ? e.message : 'restore failed' }),
  })

  const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
  }

  /** Route one dropped/picked file by extension (json is sniffed: backup vs encrypted vs deck). */
  const handleFile = async (file: File) => {
    if (file.name.endsWith('.apkg')) {
      if (file.size > APKG_MAX_BYTES) {
        log({ kind: 'error', text: `${file.name} exceeds the 50MB .apkg limit` })
        return
      }
      const payload = bytesToBase64(new Uint8Array(await file.arrayBuffer()))
      importMutation.mutate({ kind: 'apkg', payload, deckName: deckName || undefined })
      return
    }

    const text = await file.text()
    if (file.name.endsWith('.txt')) {
      importMutation.mutate({ kind: 'txt', payload: text, deckName: deckName || undefined })
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      log({ kind: 'error', text: `${file.name} is not valid JSON` })
      return
    }
    if (isEncryptedEnvelope(parsed)) {
      setPendingBackup({
        name: file.name,
        tables: 0,
        rows: 0,
        encrypted: true,
        data: parsed,
      })
      return
    }
    if (isBackupEnvelope(parsed)) {
      const tables = Object.keys(parsed.tables)
      const rows = tables.reduce(
        (n, t) => n + (Array.isArray(parsed.tables[t]) ? parsed.tables[t]!.length : 0),
        0,
      )
      setPendingBackup({
        name: file.name,
        tables: tables.length,
        rows,
        encrypted: false,
        data: parsed,
      })
      return
    }
    importMutation.mutate({ kind: 'json', payload: text, deckName: deckName || undefined })
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    for (const file of Array.from(e.dataTransfer.files)) void handleFile(file)
  }

  const lastSynced = syncQuery.data?.sync.lastSyncedAt

  return (
    <div className="space-y-4">
      <PageHeader
        title="Backup, Sync & Import/Export"
        subtitle="Free multi-device Cloud Sync, non-destructive Smart Merge, Anki import, and full snapshots"
        actions={
          <button
            className="btn"
            disabled={downloading}
            onClick={() => {
              setDownloading(true)
              apiDownload('/api/backup', 'learning-hub-backup.json')
                .catch((e: unknown) =>
                  log({ kind: 'error', text: e instanceof Error ? e.message : 'download failed' }),
                )
                .finally(() => setDownloading(false))
            }}
          >
            <DatabaseBackup className="h-4 w-4" /> {downloading ? 'preparing…' : 'Download backup'}
          </button>
        }
      />

      {/* Free Serverless Cloud Sync */}
      <div className="panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-indigo-400" />
            <span className="text-sm font-semibold">Free Cloud Sync</span>
            {encryptionEnabled && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-status-success-text">
                <Lock className="h-3 w-3" /> AES-256-GCM E2EE
              </span>
            )}
          </div>
          <span className="text-xs text-tertiary">
            {lastSynced
              ? `Last synced ${new Date(lastSynced).toLocaleString()}`
              : 'Not synced yet — choose a free provider below'}
          </span>
        </div>

        {(syncQuery.data?.devices?.length ?? 0) > 0 && (
          <div className="rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)">
            <div className="text-xs font-semibold text-tertiary">
              Devices on this target ({syncQuery.data!.devices.length})
            </div>
            <ul className="mt-2 space-y-1.5">
              {syncQuery.data!.devices.map((d) => (
                <li
                  key={d.deviceId}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Laptop className="h-3.5 w-3.5 shrink-0 text-faint" />
                    <span className="truncate font-medium">{d.name}</span>
                    {d.platform && (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-tertiary dark:bg-(--hub-panel-2)">
                        {d.platform}
                      </span>
                    )}
                    {d.isThisDevice && (
                      <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-400">
                        this device
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-tertiary">
                    {d.lastPushAt
                      ? `pushed ${new Date(d.lastPushAt).toLocaleString()}`
                      : d.lastPullAt
                        ? `pulled ${new Date(d.lastPullAt).toLocaleString()}`
                        : 'registered'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="font-medium text-faint">Cloud provider (100% serverless)</span>
            <select
              className="input w-full"
              value={provider}
              onChange={(e) => setProvider(e.target.value as SyncProviderKind)}
            >
              <option value="none">Disabled (local files only)</option>
              <option value="github">GitHub — Free Secret Gist or Private Repo</option>
              <option value="dropbox">Dropbox — Free 2GB App/File Sync</option>
              <option value="gdrive">Google Drive — Free 15GB AppData / Drive</option>
              <option value="webdav">WebDAV — Nextcloud / Koofr / Fastmail / NAS</option>
            </select>
          </label>

          <div className="space-y-1 text-xs">
            <label className="flex items-center gap-2 font-medium text-faint">
              <input
                type="checkbox"
                checked={encryptionEnabled}
                onChange={(e) => setEncryptionEnabled(e.target.checked)}
              />
              End-to-end encrypt snapshot (`AES-256-GCM`)
            </label>
            <input
              type="password"
              className="input w-full"
              disabled={!encryptionEnabled}
              placeholder={
                syncQuery.data?.sync.hasPassphrase
                  ? '•••• passphrase saved locally (enter to change)'
                  : 'Encryption passphrase (never leaves your devices)'
              }
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </div>
        </div>

        {provider === 'github' && (
          <div className="grid gap-3 rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border) sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="text-faint">Personal Access Token (`gist` or `repo` scope)</span>
              <input
                type="password"
                className="input w-full"
                placeholder={cfg['token'] || 'ghp_... or github_pat_...'}
                value={cfg['token']?.includes('••••') ? '' : (cfg['token'] ?? '')}
                onChange={(e) => updateCfg('token', e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-faint">Storage target</span>
              <select
                className="input w-full"
                value={cfg['target'] || 'gist'}
                onChange={(e) => updateCfg('target', e.target.value)}
              >
                <option value="gist">Secret Gist (auto-created on first push)</option>
                <option value="repo">Private Repository file</option>
              </select>
            </label>
            {(cfg['target'] || 'gist') === 'gist' ? (
              <>
                <label className="space-y-1 text-xs">
                  <span className="text-faint">
                    Gist ID (leave blank on first device — copy to second device)
                  </span>
                  <input
                    className="input w-full"
                    placeholder="Auto-created on first Sync/Push"
                    value={cfg['gistId'] ?? ''}
                    onChange={(e) => updateCfg('gistId', e.target.value)}
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-faint">Filename</span>
                  <input
                    className="input w-full"
                    placeholder="learning-hub-sync.json"
                    value={cfg['filename'] ?? ''}
                    onChange={(e) => updateCfg('filename', e.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="space-y-1 text-xs">
                  <span className="text-faint">Private repo (`owner/name`)</span>
                  <input
                    className="input w-full"
                    placeholder="alice/my-learning-sync"
                    value={cfg['repo'] ?? ''}
                    onChange={(e) => updateCfg('repo', e.target.value)}
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-faint">File path in repo</span>
                  <input
                    className="input w-full"
                    placeholder="learning-hub-sync.json"
                    value={cfg['path'] ?? ''}
                    onChange={(e) => updateCfg('path', e.target.value)}
                  />
                </label>
              </>
            )}
          </div>
        )}

        {provider === 'dropbox' && (
          <div className="grid gap-3 rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border) sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="text-faint">Dropbox Access Token</span>
              <input
                type="password"
                className="input w-full"
                placeholder={cfg['accessToken'] || 'sl....'}
                value={cfg['accessToken']?.includes('••••') ? '' : (cfg['accessToken'] ?? '')}
                onChange={(e) => updateCfg('accessToken', e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-faint">Dropbox file path</span>
              <input
                className="input w-full"
                placeholder="/learning-hub-sync.json"
                value={cfg['path'] ?? ''}
                onChange={(e) => updateCfg('path', e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-faint">Optional App Key (for long-lived refresh token)</span>
              <input
                className="input w-full"
                placeholder="Dropbox App Key (optional)"
                value={cfg['appKey'] ?? ''}
                onChange={(e) => updateCfg('appKey', e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-faint">Optional Refresh Token</span>
              <input
                type="password"
                className="input w-full"
                placeholder={cfg['refreshToken'] || 'Refresh token (optional)'}
                value={cfg['refreshToken']?.includes('••••') ? '' : (cfg['refreshToken'] ?? '')}
                onChange={(e) => updateCfg('refreshToken', e.target.value)}
              />
            </label>
          </div>
        )}

        {provider === 'gdrive' && (
          <div className="grid gap-3 rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border) sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="text-faint">Google OAuth Access Token</span>
              <input
                type="password"
                className="input w-full"
                placeholder={cfg['accessToken'] || 'ya29....'}
                value={cfg['accessToken']?.includes('••••') ? '' : (cfg['accessToken'] ?? '')}
                onChange={(e) => updateCfg('accessToken', e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-faint">Drive space</span>
              <select
                className="input w-full"
                value={cfg['space'] || 'appDataFolder'}
                onChange={(e) => updateCfg('space', e.target.value)}
              >
                <option value="appDataFolder">Hidden appDataFolder (`drive.appdata`)</option>
                <option value="drive">My Drive (`drive.file`)</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-faint">Optional OAuth Client ID (for auto-refresh)</span>
              <input
                className="input w-full"
                placeholder="...apps.googleusercontent.com"
                value={cfg['clientId'] ?? ''}
                onChange={(e) => updateCfg('clientId', e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-faint">Optional OAuth Refresh Token</span>
              <input
                type="password"
                className="input w-full"
                placeholder={cfg['refreshToken'] || '1//...'}
                value={cfg['refreshToken']?.includes('••••') ? '' : (cfg['refreshToken'] ?? '')}
                onChange={(e) => updateCfg('refreshToken', e.target.value)}
              />
            </label>
          </div>
        )}

        {provider === 'webdav' && (
          <div className="grid gap-3 rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border) sm:grid-cols-2">
            <label className="space-y-1 text-xs sm:col-span-2">
              <span className="text-faint">WebDAV target file URL</span>
              <input
                className="input w-full"
                placeholder="https://cloud.example.com/remote.php/dav/files/me/learning-hub-sync.json"
                value={cfg['url'] ?? ''}
                onChange={(e) => updateCfg('url', e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-faint">Username</span>
              <input
                className="input w-full"
                placeholder="username"
                value={cfg['username'] ?? ''}
                onChange={(e) => updateCfg('username', e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-faint">App password</span>
              <input
                type="password"
                className="input w-full"
                placeholder={cfg['password'] || 'app-specific password'}
                value={cfg['password']?.includes('••••') ? '' : (cfg['password'] ?? '')}
                onChange={(e) => updateCfg('password', e.target.value)}
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn"
            disabled={provider === 'none' || runSyncMutation.isPending}
            onClick={() => runSyncMutation.mutate('sync')}
          >
            <RefreshCw className={`h-4 w-4 ${runSyncMutation.isPending ? 'animate-spin' : ''}`} />{' '}
            {runSyncMutation.isPending ? 'Syncing…' : 'Sync now (Pull + Merge + Push)'}
          </button>
          <button
            className="btn-ghost"
            disabled={saveSyncMutation.isPending}
            onClick={() => saveSyncMutation.mutate()}
          >
            {saveSyncMutation.isPending ? 'Saving…' : 'Save config'}
          </button>
          {provider !== 'none' && (
            <>
              <button
                className="btn-ghost"
                disabled={runSyncMutation.isPending}
                onClick={() => runSyncMutation.mutate('test')}
              >
                Test connection
              </button>
              <button
                className="btn-ghost"
                disabled={runSyncMutation.isPending}
                onClick={() => runSyncMutation.mutate('pull')}
              >
                Pull & Merge
              </button>
              <button
                className="btn-ghost"
                disabled={runSyncMutation.isPending}
                onClick={() => runSyncMutation.mutate('push')}
              >
                Push only
              </button>
            </>
          )}
        </div>

        {syncFeedback && (
          <div
            className={`flex items-center gap-2 rounded-lg border p-2.5 text-xs ${
              syncFeedback.kind === 'ok'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-status-success-text'
                : 'border-rose-500/40 bg-rose-500/10 text-danger-text'
            }`}
          >
            {syncFeedback.kind === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{syncFeedback.text}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px] text-tertiary">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-status-success-text" />
          <span>
            Sync tokens, passphrases, and AI API keys stay strictly on this device and are stripped
            from every backup & cloud snapshot. Append-only review logs union-merge without data
            loss.
          </span>
        </div>
      </div>

      {/* import drop zone */}
      <div className="panel space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">Import</span>
          <input
            className="input max-w-[240px]"
            placeholder="deck name override (optional)"
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
          />
        </div>
        <div
          className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            dragging
              ? 'border-indigo-500 bg-indigo-600/10'
              : 'border-neutral-300 text-tertiary dark:border-(--hub-border)'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <Upload className="h-6 w-6" />
          <div className="text-sm">
            Drop{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-(--hub-panel-2)">
              .apkg
            </code>
            ,{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-(--hub-panel-2)">
              .txt
            </code>{' '}
            or{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-(--hub-panel-2)">
              .json
            </code>{' '}
            here
          </div>
          <div className="text-xs text-tertiary">
            Anki deck packages (≤50MB), Anki plain-text exports, deck JSON exports — a whole-DB
            backup .json lets you choose Smart Merge or Full Replace
          </div>
          <button
            className="btn-ghost"
            onClick={() => fileRef.current?.click()}
            disabled={importMutation.isPending}
          >
            <FileUp className="h-4 w-4" /> {importMutation.isPending ? 'importing…' : 'choose file'}
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".apkg,.txt,.json"
            onChange={(e) => {
              for (const file of Array.from(e.target.files ?? [])) void handleFile(file)
              e.target.value = ''
            }}
          />
        </div>
        {status.length > 0 && (
          <div className="space-y-1">
            {status.map((line, i) => (
              <div
                key={i}
                className={`rounded-lg border p-2 text-xs ${
                  line.kind === 'ok'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-status-success-text'
                    : line.kind === 'error'
                      ? 'border-rose-500/40 bg-rose-500/10 text-danger-text'
                      : 'border-neutral-500/30 bg-neutral-500/5 text-faint'
                }`}
              >
                {line.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* per-deck export */}
      <div className="panel space-y-3">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-tertiary" />
          <span className="text-sm font-medium">Export decks</span>
          <span className="ml-auto text-xs text-tertiary">
            {decks.data?.decks.length ?? 0} decks
          </span>
        </div>
        <div className="divide-y divide-neutral-100 dark:divide-(--hub-panel-2)">
          {(decks.data?.decks ?? []).map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {d.emoji} {d.name}
              </span>
              <span className="text-xs text-tertiary">{d.total} cards</span>
              <button
                className="btn-ghost"
                onClick={() =>
                  void apiDownload(`/api/export?deckId=${d.id}&format=txt`, `${d.name}.anki.txt`)
                }
              >
                <FileUp className="h-3.5 w-3.5" /> Anki txt
              </button>
              <button
                className="btn-ghost"
                onClick={() =>
                  void apiDownload(`/api/export?deckId=${d.id}&format=json`, `${d.name}.deck.json`)
                }
              >
                <FileJson className="h-3.5 w-3.5" /> JSON
              </button>
            </div>
          ))}
          {decks.data && decks.data.decks.length === 0 && (
            <div className="py-6 text-center text-sm text-tertiary">
              no decks yet — import one above or create it on{' '}
              <Link href="/decks" className="underline">
                Decks & Cards
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* whole-db merge / restore */}
      <div className="panel space-y-3">
        <div className="flex items-center gap-2">
          <DatabaseBackup className="h-4 w-4 text-tertiary" />
          <span className="text-sm font-medium">Smart Merge or Restore whole-database backup</span>
        </div>
        <p className="text-xs text-tertiary">
          Pick any backup <code className="rounded px-1">.json</code> (plain or E2EE encrypted).
          <strong> Smart Merge</strong> unions your offline reviews, XP, notes, and decks without
          wiping local progress; <strong>Replace All</strong> performs a clean destructive restore.
        </p>
        <div>
          <button
            className="btn-ghost"
            onClick={() => restoreRef.current?.click()}
            disabled={restoreMutation.isPending}
          >
            <Upload className="h-4 w-4" /> choose backup .json
          </button>
          <input
            ref={restoreRef}
            type="file"
            className="hidden"
            accept=".json,application/json"
            onChange={(e) => {
              for (const file of Array.from(e.target.files ?? [])) void handleFile(file)
              e.target.value = ''
            }}
          />
        </div>
        {restoreMutation.isPending && <div className="text-xs text-tertiary">processing…</div>}
      </div>

      {/* confirm dialog with Smart Merge (Recommended) + Replace All */}
      {pendingBackup && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && setPendingBackup(null)}
        >
          <div className="panel w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <GitMerge className="h-5 w-5 text-indigo-400" /> Import backup snapshot
              </h2>
              <button className="btn-ghost px-2" onClick={() => setPendingBackup(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {pendingBackup.encrypted ? (
              <div className="space-y-2 text-sm text-faint">
                <p>
                  <span className="font-medium text-neutral-200">{pendingBackup.name}</span> is
                  protected with <span className="text-status-success-text">AES-256-GCM E2EE</span>.
                </p>
                <input
                  type="password"
                  className="input w-full"
                  placeholder="Enter encryption passphrase to unlock"
                  value={restorePassphrase}
                  onChange={(e) => setRestorePassphrase(e.target.value)}
                />
              </div>
            ) : (
              <p className="text-sm text-faint">
                <span className="font-medium text-neutral-200">{pendingBackup.name}</span> contains{' '}
                {pendingBackup.rows} rows across {pendingBackup.tables} tables. Choose how to apply
                it:
              </p>
            )}

            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3 text-xs text-secondary">
              <div className="font-semibold text-indigo-300">
                Smart Merge (Recommended — Non-Destructive)
              </div>
              <div className="mt-1 text-faint">
                Unions append-only review logs & XP, replays FSRS-6 intervals on cards reviewed on
                both devices, and remaps colliding offline IDs without deleting local work.
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button className="btn-ghost" onClick={() => setPendingBackup(null)}>
                Cancel
              </button>
              <button
                className="btn-ghost text-danger-text hover:text-danger-text"
                disabled={restoreMutation.isPending}
                onClick={() =>
                  pendingBackup &&
                  restoreMutation.mutate({
                    mode: 'replace',
                    data: pendingBackup.data,
                    passphrase: restorePassphrase || undefined,
                  })
                }
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Replace All (Destructive)
              </button>
              <button
                className="btn"
                disabled={restoreMutation.isPending}
                onClick={() =>
                  pendingBackup &&
                  restoreMutation.mutate({
                    mode: 'merge',
                    data: pendingBackup.data,
                    passphrase: restorePassphrase || undefined,
                  })
                }
              >
                <GitMerge className="h-4 w-4" />{' '}
                {restoreMutation.isPending ? 'Merging…' : 'Smart Merge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
