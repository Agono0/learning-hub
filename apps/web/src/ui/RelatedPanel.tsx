'use client'

/**
 * RelatedPanel — "related content" via the on-device embeddings index
 * (cosine top-K across every knowledge surface). Shows a calm hint when the
 * index hasn't been built yet; never blocks the host page.
 */
import React from 'react'
import { useRouter } from 'next/navigation'
import { Link2 } from 'lucide-react'
import { apiSend } from '@/lib/transport'

interface RelatedHit {
  kind: string
  refId: number
  title: string
  href: string
  score: number
}

const KIND_LABEL: Record<string, string> = {
  note: 'Note',
  card: 'Card',
  lesson: 'Lesson',
  highlight: 'Highlight',
  journal: 'Journal',
  source: 'Reading',
  idea: 'Idea',
  mindmap: 'Mind map',
  canvas: 'Canvas',
  palace: 'Palace',
  goal: 'Goal',
  capture: 'Capture',
}

export function RelatedPanel({
  kind,
  refId,
  title = 'Related',
}: {
  kind: string
  refId: number
  title?: string
}) {
  const router = useRouter()
  const [hits, setHits] = React.useState<RelatedHit[] | null>(null)
  const [notFound, setNotFound] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    setHits(null)
    setNotFound(false)
    apiSend<{ ok: boolean; found: boolean; hits: RelatedHit[] }>('/api/embeddings/index', 'POST', {
      action: 'related',
      kind,
      refId,
    })
      .then((res) => {
        if (cancelled) return
        if (!res.found) setNotFound(true)
        else setHits(res.hits)
      })
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })
    return () => {
      cancelled = true
    }
  }, [kind, refId])

  return (
    <div>
      <div className="label mb-2 flex items-center gap-1.5">
        <Link2 className="h-3 w-3" /> {title}
      </div>
      {hits === null && !notFound && <div className="text-xs text-neutral-400">…</div>}
      {notFound && (
        <p className="text-xs text-neutral-400 leading-relaxed">
          Semantic index hasn&apos;t seen this item yet. Build it in Settings → Semantic search
          index.
        </p>
      )}
      {hits !== null && hits.length === 0 && (
        <p className="text-xs text-neutral-400">No close neighbours yet.</p>
      )}
      {hits !== null && hits.length > 0 && (
        <ul className="space-y-1.5">
          {hits.map((h) => (
            <li key={`${h.kind}:${h.refId}`}>
              <button
                onClick={() => router.push(h.href)}
                className="block w-full rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)"
              >
                <span className="block truncate font-medium">{h.title}</span>
                <span className="text-[10px] uppercase tracking-wide text-neutral-400">
                  {KIND_LABEL[h.kind] ?? h.kind} · {Math.round(h.score * 100)}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
