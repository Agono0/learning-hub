'use client'

/**
 * Notes: list + markdown editor with toolbar, supertag picker (autofills
 * fields), backlinks panel, and the bullets list with "→ card" buttons that
 * cards service contract: POST /api/cards/bullet {noteId,bulletId,content,deckId,format}.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bold, Heading, Link2, List, Pickaxe, Save } from 'lucide-react'
// subpath import (NOT the barrel) — keeps the client bundle free of the AI/db graph
import { SUPERTAG_TEMPLATES, cornellLayout } from '@learning-hub/core/notes'
import type { SupertagKey } from '@learning-hub/core/notes'
import { apiGet, apiSend } from '@/lib/transport'
import { PageHeader, RelatedPanel } from '@/ui'
import { CardMinerSheet } from '@/components/CardMinerSheet'

interface Note {
  id: number
  title: string
  content: string
  supertag: string | null
  fields: Record<string, string> | null
  status: string
  deckId: number | null
}
interface Bullet {
  id: number
  noteId: number
  content: string
  position: number
  cardId: number | null
}
interface Backlink {
  fromNoteId: number
  fromTitle: string
  type: string
  context: string | null
}

export default function NotesPage() {
  const qc = useQueryClient()
  const { data: list } = useQuery<{ notes: Note[] }>({
    queryKey: ['notes'],
    queryFn: () => apiGet<{ notes: Note[] }>('/api/notes'),
  })
  const [activeId, setActiveId] = useState<number | null>(null)
  const active = list?.notes.find((n) => n.id === activeId) ?? null

  const { data: detail } = useQuery<{ note: Note; bullets: Bullet[]; backlinks: Backlink[] }>({
    queryKey: ['note', activeId],
    queryFn: () =>
      apiGet<{ note: Note; bullets: Bullet[]; backlinks: Backlink[] }>(`/api/notes/${activeId}`),
    enabled: Boolean(activeId),
  })

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [supertag, setSupertag] = useState<SupertagKey | ''>('')
  // card miner: null = closed; string = the text to mine ('' = paste area)
  const [mineText, setMineText] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!detail) return
    setTitle(detail.note.title)
    setContent(detail.note.content)
    setSupertag((detail.note.supertag as SupertagKey) ?? '')
    setFields(detail.note.fields ?? {})
  }, [detail])

  const createNote = useMutation({
    mutationFn: () => apiSend<{ note: Note }>('/api/notes', 'POST', { title: 'Untitled note' }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['notes'] })
      setActiveId(r.note.id)
    },
  })

  const saveNote = useMutation({
    mutationFn: () =>
      apiSend(`/api/notes/${activeId}`, 'PATCH', {
        title,
        content,
        supertag: supertag || null,
        fields,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notes'] })
      void qc.invalidateQueries({ queryKey: ['note', activeId] })
    },
  })

  const deleteNote = useMutation({
    mutationFn: (id: number) => apiSend(`/api/notes/${id}`, 'DELETE'),
    onSuccess: () => {
      setActiveId(null)
      void qc.invalidateQueries({ queryKey: ['notes'] })
    },
  })

  const bulletToCard = useMutation({
    mutationFn: (bullet: Bullet) =>
      apiSend('/api/cards/bullet', 'POST', {
        noteId: bullet.noteId,
        bulletId: bullet.id,
        content: bullet.content,
        deckId: active?.deckId ?? 1,
        format: 'basic',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['note', activeId] })
    },
  })

  const applySupertag = (key: SupertagKey) => {
    setSupertag(key)
    setFields((f) => ({ ...SUPERTAG_TEMPLATES[key].fields, ...f }))
    // Cornell: seed the page layout on an empty note (cues/notes/summary)
    if (key === 'CORNELL') {
      setContent((c) => (c.trim() ? c : cornellLayout()))
    }
  }

  const wrapSelection = (before: string, after = before) => {
    // minimal toolbar: appends markers at cursor
    setContent((c) => `${c}${before}text${after}`)
  }

  const bullets = useMemo(() => detail?.bullets ?? [], [detail])
  const backlinks = useMemo(() => detail?.backlinks ?? [], [detail])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notes"
        subtitle="Markdown notes with supertags, Cornell layouts, and backlinks."
      />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr_220px]">
        <aside className="space-y-2">
          <button className="btn w-full" onClick={() => createNote.mutate()}>
            New note
          </button>
          <div className="space-y-1">
            {(list?.notes ?? []).map((n) => (
              <button
                key={n.id}
                className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${activeId === n.id ? 'bg-indigo-600/10 font-medium text-indigo-600 dark:text-indigo-300' : 'hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)'}`}
                onClick={() => setActiveId(n.id)}
              >
                {n.title}
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-3">
          {activeId == null ? (
            <div className="panel text-sm text-tertiary">Pick or create a note.</div>
          ) : (
            <>
              <div className="panel space-y-3">
                <input
                  className="input text-lg font-semibold"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-1">
                  <button className="btn-ghost" title="Bold" onClick={() => wrapSelection('**')}>
                    <Bold className="h-4 w-4" />
                  </button>
                  <button
                    className="btn-ghost"
                    title="Heading"
                    onClick={() => setContent((c) => `${c}\n## `)}
                  >
                    <Heading className="h-4 w-4" />
                  </button>
                  <button
                    className="btn-ghost"
                    title="Wikilink"
                    onClick={() => setContent((c) => `${c}[[title]]`)}
                  >
                    <Link2 className="h-4 w-4" />
                  </button>
                  <button
                    className="btn-ghost"
                    title="Bullet"
                    onClick={() => setContent((c) => `${c}\n- `)}
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    className="btn-ghost"
                    title="Mine cards from this note"
                    onClick={() => setMineText(content)}
                  >
                    <Pickaxe className="h-4 w-4" />
                  </button>
                  <button
                    className="btn-ghost"
                    title="Paste text and mine cards"
                    onClick={() => setMineText('')}
                  >
                    <Pickaxe className="h-4 w-4 opacity-50" />
                  </button>
                  <select
                    className="input ml-auto w-40 text-xs"
                    value={supertag}
                    onChange={(e) => e.target.value && applySupertag(e.target.value as SupertagKey)}
                  >
                    <option value="">Supertag…</option>
                    {Object.values(SUPERTAG_TEMPLATES).map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.emoji} {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn"
                    onClick={() => saveNote.mutate()}
                    disabled={saveNote.isPending}
                  >
                    <Save className="h-4 w-4" /> Save
                  </button>
                  <button
                    className="btn-ghost text-xs text-danger-text"
                    onClick={() => activeId && deleteNote.mutate(activeId)}
                  >
                    Delete
                  </button>
                </div>
                <textarea
                  className="input min-h-[40vh] font-mono text-sm"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>

              {supertag && SUPERTAG_TEMPLATES[supertag as SupertagKey] && (
                <div className="panel space-y-2">
                  <div className="label">
                    Supertag fields — {SUPERTAG_TEMPLATES[supertag as SupertagKey].name}
                  </div>
                  {Object.entries(SUPERTAG_TEMPLATES[supertag as SupertagKey].fields).map(
                    ([field, placeholder]) => (
                      <div key={field} className="flex items-center gap-2">
                        <span className="w-28 shrink-0 text-xs text-tertiary">{field}</span>
                        <input
                          className="input text-sm"
                          placeholder={placeholder}
                          value={fields[field] ?? ''}
                          onChange={(e) => setFields((f) => ({ ...f, [field]: e.target.value }))}
                        />
                      </div>
                    ),
                  )}
                </div>
              )}

              <div className="panel space-y-2">
                <div className="label">Bullets — any bullet can BE a card</div>
                {bullets.length === 0 && (
                  <p className="text-sm text-tertiary">
                    No bullets yet — write "- something" and save.
                  </p>
                )}
                {bullets.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">{b.content}</span>
                    {b.cardId ? (
                      <span className="text-xs text-status-success-text">card #{b.cardId}</span>
                    ) : (
                      <button
                        className="btn-ghost text-xs"
                        onClick={() => bulletToCard.mutate(b)}
                        disabled={bulletToCard.isPending}
                      >
                        → card
                      </button>
                    )}
                  </div>
                ))}
                {bulletToCard.isError && (
                  <p className="text-xs text-status-warning-text">
                    Card service not reachable (/api/cards/bullet may not be deployed yet).
                  </p>
                )}
              </div>
            </>
          )}
        </section>

        <aside className="space-y-3">
          <div className="panel">
            <div className="label mb-2">Backlinks</div>
            {backlinks.length === 0 && (
              <p className="text-xs text-tertiary">Nothing links here yet.</p>
            )}
            {backlinks.map((b) => (
              <button
                key={b.fromNoteId}
                className="block w-full rounded px-1 py-0.5 text-left text-xs text-indigo-400 hover:underline"
                onClick={() => setActiveId(b.fromNoteId)}
              >
                {b.fromTitle} <span className="text-tertiary">({b.type})</span>
              </button>
            ))}
          </div>
          <div className="panel">
            {activeId != null && <RelatedPanel kind="note" refId={activeId} />}
          </div>
        </aside>

        <CardMinerSheet
          open={mineText !== null}
          initialText={mineText ?? ''}
          onClose={() => setMineText(null)}
        />
      </div>
    </div>
  )
}
