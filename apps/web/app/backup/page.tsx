'use client'

/**
 * Backup & Import/Export — one page for moving data in and out:
 * - drag-drop import of all three kinds (.apkg / Anki .txt / our deck .json)
 * - per-deck export buttons (Anki txt + JSON)
 * - whole-database backup download + restore (with a confirm dialog)
 *
 * CLIENT component — talks to /api/import, /api/export and /api/backup only.
 */
import { useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDownload, apiGet, apiSend } from '@/lib/transport'
import { AlertTriangle, DatabaseBackup, Download, FileJson, FileUp, Upload, X } from 'lucide-react'

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
  tables?: number
  rows?: number
  error?: string
}

/** Line-based status feed shown under the drop zone. */
interface StatusLine {
  kind: 'ok' | 'error' | 'info'
  text: string
}

const APKG_MAX_BYTES = 50 * 1024 * 1024 // base64 cap mirrors the API contract

/** Shape-check a .json file as a whole-DB backup envelope ({version, exportedAt, tables}). */
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

export default function BackupPage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const restoreRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [deckName, setDeckName] = useState('')
  const [status, setStatus] = useState<StatusLine[]>([])
  const [downloading, setDownloading] = useState(false)
  const [pendingBackup, setPendingBackup] = useState<{
    name: string
    tables: number
    rows: number
    data: unknown
  } | null>(null)

  const decks = useQuery<{ decks: DeckInfo[] }>({
    queryKey: ['decks'],
    queryFn: () => apiGet<{ decks: DeckInfo[] }>('/api/decks'),
  })

  const log = (line: StatusLine) => setStatus((prev) => [line, ...prev].slice(0, 8))

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
    mutationFn: (backup: unknown) => apiSend<RestoreResult>('/api/backup', 'POST', backup),
    onSuccess: (data) => {
      setPendingBackup(null)
      if (data.ok) {
        log({
          kind: 'ok',
          text: `backup restored — ${data.rows} rows across ${data.tables} tables`,
        })
        void qc.invalidateQueries() // everything changed
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

  /** Route one dropped/picked file by extension (json is sniffed: backup vs deck). */
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

    // .json — either a whole-DB backup envelope or a deck JSON export
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      log({ kind: 'error', text: `${file.name} is not valid JSON` })
      return
    }
    if (isBackupEnvelope(parsed)) {
      const tables = Object.keys(parsed.tables)
      const rows = tables.reduce(
        (n, t) => n + (Array.isArray(parsed.tables[t]) ? parsed.tables[t]!.length : 0),
        0,
      )
      setPendingBackup({ name: file.name, tables: tables.length, rows, data: parsed })
      return
    }
    importMutation.mutate({ kind: 'json', payload: text, deckName: deckName || undefined })
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    for (const file of Array.from(e.dataTransfer.files)) void handleFile(file)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Backup & Import/Export</h1>
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
              : 'border-neutral-300 text-neutral-500 dark:border-[#26262b]'
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
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-[#1a1a1f]">.apkg</code>,{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-[#1a1a1f]">.txt</code> or{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-[#1a1a1f]">.json</code>{' '}
            here
          </div>
          <div className="text-xs text-neutral-500">
            Anki deck packages (≤50MB), Anki plain-text exports, deck JSON exports — a whole-DB
            backup .json asks for confirmation before restore
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
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : line.kind === 'error'
                      ? 'border-red-500/40 bg-red-500/10 text-red-300'
                      : 'border-neutral-500/30 bg-neutral-500/5 text-neutral-400'
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
          <Download className="h-4 w-4 text-neutral-500" />
          <span className="text-sm font-medium">Export decks</span>
          <span className="ml-auto text-xs text-neutral-500">
            {decks.data?.decks.length ?? 0} decks
          </span>
        </div>
        <div className="divide-y divide-neutral-100 dark:divide-[#1e1e23]">
          {(decks.data?.decks ?? []).map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {d.emoji} {d.name}
              </span>
              <span className="text-xs text-neutral-500">{d.total} cards</span>
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
            <div className="py-6 text-center text-sm text-neutral-500">
              no decks yet — import one above or create it on{' '}
              <Link href="/decks" className="underline">
                Decks & Cards
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* whole-db restore */}
      <div className="panel space-y-3">
        <div className="flex items-center gap-2">
          <DatabaseBackup className="h-4 w-4 text-neutral-500" />
          <span className="text-sm font-medium">Restore whole-database backup</span>
        </div>
        <p className="text-xs text-neutral-500">
          Replaces ALL data with the contents of a backup file (the kind “Download backup” above
          produces). Append-only history (reviews, XP, Elo) keeps its ids.
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
        {restoreMutation.isPending && <div className="text-xs text-neutral-500">restoring…</div>}
      </div>

      {/* confirm dialog */}
      {pendingBackup && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && setPendingBackup(null)}
        >
          <div className="panel w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <AlertTriangle className="h-5 w-5 text-amber-400" /> Restore backup?
              </h2>
              <button className="btn-ghost px-2" onClick={() => setPendingBackup(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-neutral-400">
              <span className="font-medium text-neutral-200">{pendingBackup.name}</span> contains{' '}
              {pendingBackup.rows} rows across {pendingBackup.tables} tables. Restoring{' '}
              <span className="font-medium text-red-300">deletes all current data</span> and
              replaces it with the backup. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setPendingBackup(null)}>
                Cancel
              </button>
              <button
                className="btn"
                disabled={restoreMutation.isPending}
                onClick={() => pendingBackup && restoreMutation.mutate(pendingBackup.data)}
              >
                {restoreMutation.isPending ? 'restoring…' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
