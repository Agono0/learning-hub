'use client'

/**
 * Incremental reading: library + priority queue, reader (next 800-word
 * fragment + position slider), highlight extraction → triage queue
 * (keep/discard), daily resurfacing, one-tap Ghostreader prompts.
 */
import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Highlighter, Sparkles, Trash2, Upload } from 'lucide-react'
import { useAiStatus } from '@/components/TransportPanel'

interface Source { id: number; kind: string; title: string; content: string; priority: number; position: number; status: string }
interface Highlight { id: number; sourceId: number; text: string; triaged: number; strength: number }
interface Fragment { text: string; nextPosition: number; done: boolean; words: number }

/** Manual-mode (provider 'none') replacements for the Ghostreader actions — never dead-end the reader. */
function manualGhostHint(mode: 'define' | 'simplify' | 'flashcard', selected: string): string {
  const quote = selected.trim() ? `"${selected.trim().slice(0, 120)}…"` : 'the fragment'
  switch (mode) {
    case 'define':
      return `Manual mode — no AI configured. Write the definitions yourself in a note: list the key terms in ${quote}, one definition per line, in your own words (the effort IS the encoding).`
    case 'simplify':
      return `Manual mode — no AI configured. Self-explain: rewrite ${quote} for a smart 15-year-old, keeping every technical term but explaining it. Where you can't simplify is a gap — log it in the Journal.`
    case 'flashcard':
      return `Manual mode — no AI configured. Make the card by hand from ${quote}: pick the most load-bearing term, replace it with "____", and add the card via the Decks page (cloze format, answer must appear verbatim).`
  }
}

export default function ReadingPage() {
  const qc = useQueryClient()
  const { data: aiStatus } = useAiStatus()
  const manual = aiStatus?.configured === false
  const { data: lib } = useQuery<{ sources: Source[] }>({ queryKey: ['sources'], queryFn: () => fetch('/api/reading').then((r) => r.json()) })
  const [activeId, setActiveId] = useState<number | null>(null)
  const { data: detail } = useQuery<{ source: Source; highlights: Highlight[]; fragment: Fragment }>({
    queryKey: ['source', activeId],
    queryFn: () => fetch(`/api/reading/${activeId}`).then((r) => r.json()),
    enabled: Boolean(activeId),
  })
  const { data: resurfaceData } = useQuery<{ resurface: (Highlight & { sourceTitle: string | null })[] }>({
    queryKey: ['resurface'],
    queryFn: () => fetch('/api/reading/highlights?mode=resurface&limit=10').then((r) => r.json()),
  })
  const [selected, setSelected] = useState('')
  const [triageQueue, setTriageQueue] = useState<Highlight[]>([])
  const [ghostResult, setGhostResult] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['sources'] })
    void qc.invalidateQueries({ queryKey: ['source', activeId] })
    void qc.invalidateQueries({ queryKey: ['resurface'] })
  }

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/reading', { method: 'POST', body: form })
      if (!res.ok) throw new Error((await res.json()).error ?? 'upload failed')
      return res.json() as Promise<{ source: Source }>
    },
    onSuccess: (r) => { invalidate(); setActiveId(r.source.id) },
    onError: (e) => window.alert(e.message),
  })

  const addPaste = useMutation({
    mutationFn: async () => {
      const title = window.prompt('Title?')
      if (!title) throw new Error('cancelled')
      const content = window.prompt('Paste the text:')
      if (!content) throw new Error('cancelled')
      const res = await fetch('/api/reading', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, kind: 'paste', content }),
      })
      return res.json() as Promise<{ source: Source }>
    },
    onSuccess: (r) => { invalidate(); setActiveId(r.source.id) },
    onError: () => undefined,
  })

  const patchSource = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const res = await fetch(`/api/reading/${activeId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      return res.json()
    },
    onSuccess: invalidate,
  })

  const extractHighlights = useMutation({
    mutationFn: async (sourceId: number) => {
      const res = await fetch('/api/reading/highlights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceId, text: selected || undefined }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.error ?? 'extract failed')
      return body as { highlights: string[] }
    },
    onSuccess: (r) => {
      invalidate()
      // push freshly extracted highlights into the triage queue
      const res = r.highlights.map((text, i) => ({ id: -1 - i, sourceId: activeId ?? 0, text, triaged: 0, strength: 0.5 }))
      setTriageQueue((q) => [...res, ...q])
      setSelected('')
    },
    onError: (e) => window.alert(e.message),
  })

  const triage = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'keep' | 'discard' }) => {
      if (id < 0) return { action } // not yet persisted (extract preview) — drop locally
      const res = await fetch('/api/reading/highlights', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      return res.json()
    },
    onSuccess: invalidate,
  })

  // the resurface GET is read-only now — strength promotion is opt-in
  const markSeen = useMutation({
    mutationFn: async (ids: number[]) => {
      if (ids.length === 0) return { ok: true, seen: [] as number[] }
      const res = await fetch('/api/reading/highlights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seenIds: ids }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.error ?? 'mark-seen failed')
      return body as { ok: true; seen: number[] }
    },
    onSuccess: invalidate,
  })

  const ghost = useMutation({
    mutationFn: async (mode: 'define' | 'simplify' | 'flashcard') => {
      const text = selected || detail?.fragment.text.slice(0, 2000) || ''
      if (mode === 'flashcard') {
        const res = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'cloze', payload: { text, deckId: 1 } }),
        })
        const body = (await res.json()) as { ok?: boolean; cards?: number[]; error?: string }
        if (!res.ok || !body.ok) throw new Error(body.error ?? 'failed')
        return `Created ${body.cards!.length} cloze card(s) in deck #1.`
      }
      const prompt = mode === 'define'
        ? `Define the key terms in this text, one definition per line:\n"""${text.slice(0, 8000)}"""`
        : `Simplify this text for a smart 15-year-old, keeping every technical term but explaining it:\n"""${text.slice(0, 8000)}"""`
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'summary', payload: { text: prompt } }),
      })
      const body = (await res.json()) as { ok?: boolean; summary?: string; error?: string }
      if (!res.ok || !body.ok) throw new Error(body.error ?? 'failed')
      return body.summary!
    },
    onSuccess: (r) => setGhostResult(r),
    onError: (e) => setGhostResult(`⚠ ${e.message}`),
  })

  const source = detail?.source
  const fragment = detail?.fragment

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reading</h1>
          <p className="mt-1 text-sm text-neutral-500">Incremental reading: one fragment a day, highlights on the way, triage after.</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
          <button className="btn" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Upload PDF</button>
          <button className="btn-ghost" onClick={() => addPaste.mutate()}>Paste text</button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-2">
          <div className="label px-1">Queue (by priority)</div>
          {(lib?.sources ?? []).map((s) => (
            <button
              key={s.id}
              className={`panel w-full text-left text-sm ${activeId === s.id ? 'border-indigo-500' : ''}`}
              onClick={() => setActiveId(s.id)}
            >
              <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 shrink-0 opacity-50" />
                <span className="flex-1 truncate">{s.title}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-[#26262b]">
                <div className="h-full bg-indigo-500" style={{ width: `${s.position}%` }} />
              </div>
              <div className="mt-1 text-[10px] text-neutral-500">{s.kind} · {Math.round(s.position)}% · priority {s.priority}</div>
            </button>
          ))}
          {lib?.sources.length === 0 && <p className="px-1 text-sm text-neutral-500">Nothing queued yet.</p>}

          <div className="panel mt-4">
            <div className="label mb-2 flex items-center justify-between">
              <span>Daily resurfacing</span>
              {(resurfaceData?.resurface ?? []).length > 0 && (
                <button
                  className="text-[10px] normal-case text-indigo-400 hover:text-indigo-300"
                  onClick={() => markSeen.mutate((resurfaceData?.resurface ?? []).slice(0, 5).map((h) => h.id))}
                  disabled={markSeen.isPending}
                >
                  Mark seen
                </button>
              )}
            </div>
            {(resurfaceData?.resurface ?? []).slice(0, 5).map((h) => (
              <div key={h.id} className="mb-2 border-l-2 border-indigo-500/50 pl-2 text-xs">
                <div className="line-clamp-2 text-neutral-300">{h.text}</div>
                <div className="mt-0.5 text-[10px] text-neutral-500">{h.sourceTitle}</div>
              </div>
            ))}
            {(resurfaceData?.resurface ?? []).length === 0 && <p className="text-xs text-neutral-500">No highlights to resurface.</p>}
          </div>
        </aside>

        <section className="space-y-3">
          {source && fragment ? (
            <>
              <div className="panel">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">{source.title}</h2>
                  <button className="btn-ghost text-xs text-red-400" onClick={async () => { await fetch(`/api/reading/${source.id}`, { method: 'DELETE' }); setActiveId(null); invalidate() }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(source.position)}
                    onChange={(e) => patchSource.mutate({ position: Number(e.target.value) })}
                    className="flex-1 accent-indigo-500"
                  />
                  <span className="w-12 text-right text-xs text-neutral-500">{Math.round(source.position)}%</span>
                </div>
                <p
                  className="mt-3 max-h-[40vh] overflow-y-auto text-sm leading-relaxed selection:bg-indigo-500/30"
                  onMouseUp={() => setSelected(window.getSelection()?.toString() ?? '')}
                >
                  {fragment.text}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3 dark:border-[#26262b]">
                  <button className="btn" onClick={() => patchSource.mutate({ position: fragment.nextPosition })}>
                    {fragment.done ? 'Finish source' : 'Next fragment →'}
                  </button>
                  <button className="btn-ghost text-xs" disabled={!selected} onClick={() => extractHighlights.mutate(source.id)}>
                    <Highlighter className="h-3.5 w-3.5" /> Extract highlight{selected ? ' (from selection)' : 's (auto)'}
                  </button>
                  {(['define', 'simplify', 'flashcard'] as const).map((mode) => (
                    <button
                      key={mode}
                      className="btn-ghost text-xs"
                      onClick={() => (manual ? setGhostResult(manualGhostHint(mode, selected)) : ghost.mutate(mode))}
                      title={manual ? 'Manual mode — no AI configured; the hint shows the offline alternative' : undefined}
                    >
                      <Sparkles className="h-3.5 w-3.5" /> {mode === 'flashcard' ? 'Make flashcard' : mode}
                    </button>
                  ))}
                </div>
                {ghostResult && <div className="mt-2 rounded-lg bg-neutral-100 p-2 text-xs whitespace-pre-wrap dark:bg-[#1a1a1f]">{ghostResult}</div>}
              </div>

              {triageQueue.length > 0 && (
                <div className="panel space-y-3">
                  <div className="label">Triage queue ({triageQueue.length}) — keep or discard</div>
                  {triageQueue.slice(0, 3).map((h) => (
                    <div key={h.id} className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-[#26262b]">
                      <p className="text-neutral-300">{h.text}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          className="btn text-xs"
                          onClick={() => {
                            if (h.id > 0) triage.mutate({ id: h.id, action: 'keep' })
                            setTriageQueue((q) => q.filter((x) => x.id !== h.id))
                          }}
                        >
                          Keep
                        </button>
                        <button
                          className="btn-ghost text-xs text-red-400"
                          onClick={() => {
                            if (h.id > 0) triage.mutate({ id: h.id, action: 'discard' })
                            setTriageQueue((q) => q.filter((x) => x.id !== h.id))
                          }}
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="panel">
                <div className="label mb-2">Highlights of this source</div>
                {(detail?.highlights ?? []).map((h) => (
                  <div key={h.id} className="mb-2 flex items-center gap-2 text-sm">
                    <span className={`h-2 w-2 rounded-full ${h.triaged === 1 ? 'bg-emerald-500' : h.triaged === 2 ? 'bg-red-500' : 'bg-neutral-400'}`} />
                    <span className="flex-1 truncate text-neutral-300">{h.text}</span>
                    <span className="text-[10px] text-neutral-500">strength {Math.round(h.strength * 100)}</span>
                  </div>
                ))}
                {(detail?.highlights ?? []).length === 0 && <p className="text-xs text-neutral-500">None yet.</p>}
              </div>
            </>
          ) : (
            <div className="panel text-sm text-neutral-500">Pick a source, or upload a PDF to begin.</div>
          )}
        </section>
      </div>
    </div>
  )
}
