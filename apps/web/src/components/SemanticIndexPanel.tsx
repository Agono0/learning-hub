'use client'

/**
 * Semantic search index — builds/refreshes the on-device embedding index over
 * every knowledge surface. The MiniLM model downloads once (WASM, cached) and
 * all inference is local; vectors are stored in the local SQLite database.
 */
import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Boxes, Loader2 } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { getEmbeddingEngine } from '@/lib/embeddings-client'

interface IndexStatus {
  ok: boolean
  model: string
  dims: number | null
  kinds: Array<{ kind: string; indexed: number; total: number }>
}

export function SemanticIndexPanel() {
  const statusQuery = useQuery<IndexStatus>({
    queryKey: ['embeddings-status'],
    queryFn: () => apiGet('/api/embeddings/index'),
  })

  const [running, setRunning] = React.useState(false)
  const [phase, setPhase] = React.useState<string | null>(null)
  const [progress, setProgress] = React.useState({ done: 0, total: 0 })

  const status = statusQuery.data
  const totalIndexed = status?.kinds.reduce((a, k) => a + k.indexed, 0) ?? 0
  const totalRows = status?.kinds.reduce((a, k) => a + k.total, 0) ?? 0
  const complete = totalRows > 0 && totalIndexed >= totalRows

  async function build() {
    setRunning(true)
    try {
      setPhase('Loading model (first run downloads ~25 MB, cached afterwards)…')
      const engine = await getEmbeddingEngine((info) => {
        if (typeof info.progress === 'number' && info.file) {
          setPhase(`Loading model — ${Math.round(info.progress)}%`)
        }
      })
      if (!engine.ready) {
        setPhase('This device cannot run the model. Semantic search stays unavailable.')
        return
      }

      let processed = 0
      // First pass count for the progress bar
      const pending0 = await apiSend<{ items: Array<{ kind: string; refId: number }> }>(
        '/api/embeddings/index',
        'POST',
        { action: 'pending' },
      )
      setProgress({ done: 0, total: pending0.items.length })

      for (let round = 0; round < 40; round++) {
        setPhase(`Embedding batch ${round + 1}…`)
        const pending = await apiSend<{
          items: Array<{ kind: string; refId: number; text: string }>
        }>('/api/embeddings/index', 'POST', { action: 'pending', limit: 120 })
        if (pending.items.length === 0) break
        const vectors = await engine.embed(pending.items.map((i) => i.text))
        await apiSend('/api/embeddings/index', 'POST', {
          action: 'store',
          items: pending.items.map((item, i) => ({
            kind: item.kind,
            refId: item.refId,
            vector: vectors[i],
          })),
        })
        processed += pending.items.length
        setProgress({ done: processed, total: Math.max(processed, pending0.items.length) })
      }
      setPhase(complete ? 'Index is up to date.' : 'Index build complete.')
      void statusQuery.refetch()
    } catch (err) {
      setPhase(`Indexing failed: ${(err as Error).message}`)
    } finally {
      setRunning(false)
    }
  }

  const pct =
    progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0

  return (
    <section className="panel space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="label flex items-center gap-1.5">
            <Boxes className="h-3.5 w-3.5" /> Semantic search index
          </div>
          <p className="mt-0.5 text-xs text-tertiary">
            Runs an on-device MiniLM model (nothing leaves this machine) to power &ldquo;related
            content&rdquo; panels and semantic search across notes, cards, lessons, journal, reading
            and more.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void build()}
          disabled={running}
          className="btn shrink-0"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {running ? 'Building…' : complete ? 'Refresh index' : 'Build index'}
        </button>
      </div>

      {running && progress.total > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-(--hub-sunken)">
          <div
            className="h-full rounded-full bg-indigo-500 transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {phase && <p className="text-xs text-tertiary">{phase}</p>}

      {status && (
        <div className="flex flex-wrap gap-1.5">
          {status.kinds
            .filter((k) => k.total > 0)
            .map((k) => (
              <span
                key={k.kind}
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  k.indexed >= k.total
                    ? 'bg-emerald-600/10 text-status-success-text dark:text-status-success-text'
                    : 'bg-neutral-200/70 text-neutral-600 dark:bg-(--hub-border) dark:text-faint'
                }`}
                title={`${k.indexed}/${k.total} indexed`}
              >
                {k.kind} {k.indexed}/{k.total}
              </span>
            ))}
          {totalRows === 0 && <span className="text-xs text-faint">Nothing to index yet.</span>}
        </div>
      )}
    </section>
  )
}
