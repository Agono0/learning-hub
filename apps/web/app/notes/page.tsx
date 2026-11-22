'use client'

import React from 'react'

/**
 * Notes: list + markdown editor with toolbar, supertag picker (autofills
 * fields), backlinks panel, and the bullets list with "→ card" buttons that
 * cards service contract: POST /api/cards/bullet {noteId,bulletId,content,deckId,format}.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bold, FileText, Heading, Link2, List, Pickaxe, Save } from 'lucide-react'
// subpath import (NOT the barrel) — keeps the client bundle free of the AI/db graph
import { SUPERTAG_TEMPLATES, cornellLayout } from '@learning-hub/core/notes'
import type { SupertagKey } from '@learning-hub/core/notes'
import { apiGet, apiSend } from '@/lib/transport'
import { Callout, EmptyState, IconButton, PageHeader, RelatedPanel, Skeleton } from '@/ui'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CardMinerSheet } from '@/components/CardMinerSheet'
import { queryKeys } from '@/lib/query-keys'
import { ClayIn, Reveal, Stagger, StaggerItem } from '@/lib/motion'

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
  const {
    data: list,
    isPending: listPending,
    isError: listFailed,
    refetch: refetchList,
  } = useQuery<{ notes: Note[] }>({
    queryKey: queryKeys.notes,
    queryFn: () => apiGet<{ notes: Note[] }>('/api/notes'),
  })
  const [activeId, setActiveId] = useState<number | null>(null)
  const active = list?.notes.find((n) => n.id === activeId) ?? null

  const { data: detail, isPending: detailPending } = useQuery<{
    note: Note
    bullets: Bullet[]
    backlinks: Backlink[]
  }>({
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
  // S6: deletion is destructive — the toolbar button only arms this dialog.
  const [confirmDelete, setConfirmDelete] = useState(false)

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
      void qc.invalidateQueries({ queryKey: queryKeys.notes })
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
      void qc.invalidateQueries({ queryKey: queryKeys.notes })
      void qc.invalidateQueries({ queryKey: ['note', activeId] })
    },
  })

  const deleteNote = useMutation({
    mutationFn: (id: number) => apiSend(`/api/notes/${id}`, 'DELETE'),
    onSuccess: () => {
      setActiveId(null)
      void qc.invalidateQueries({ queryKey: queryKeys.notes })
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
      {/* Entrance: header beat, then the workspace grid reveals as one section;
          the notes list staggers its rows (40ms steps, capped by the
          foundation). SSR-safe — the motion components render the final state
          server-side and animate client-side only when motionOK() allows. */}
      <ClayIn>
        <PageHeader
          title="Notes"
          subtitle="Markdown notes with supertags, Cornell layouts, and backlinks."
        />
      </ClayIn>
      <Reveal>
        <div className="grid gap-4 lg:grid-cols-[240px_1fr_220px]">
          <aside className="space-y-2">
            <button className="btn w-full" onClick={() => createNote.mutate()}>
              New note
            </button>
            {listFailed ? (
              <Callout tone="danger" title="Couldn't load notes">
                <button className="underline underline-offset-2" onClick={() => void refetchList()}>
                  Retry
                </button>
              </Callout>
            ) : listPending ? (
              <div className="space-y-1" aria-hidden="true">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-4/5" />
                <Skeleton className="h-9 w-3/5" />
              </div>
            ) : (list?.notes ?? []).length === 0 ? (
              <EmptyState icon={<FileText className="h-7 w-7" />} title="No notes yet">
                Create your first note with the button above.
              </EmptyState>
            ) : (
              <Stagger className="space-y-1">
                {(list?.notes ?? []).map((n, i) => (
                  <StaggerItem key={n.id} index={i}>
                    <button
                      className={`w-full rounded-lg px-2 py-1.5 text-left text-sm [@media(pointer:coarse)]:min-h-11 ${activeId === n.id ? 'bg-indigo-600/10 font-medium text-indigo-600 dark:text-indigo-300' : 'hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)'}`}
                      onClick={() => setActiveId(n.id)}
                    >
                      {n.title}
                    </button>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </aside>

          <section className="space-y-3">
            {activeId == null ? (
              <EmptyState icon={<FileText className="h-8 w-8" />} title="No note selected">
                Pick a note from the list, or create a new one.
              </EmptyState>
            ) : detailPending ? (
              <div className="panel space-y-3" aria-hidden="true">
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="min-h-[40vh] w-full" />
              </div>
            ) : (
              <>
                <div className="panel space-y-3">
                  <input
                    className="input text-lg font-semibold"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <div className="flex flex-wrap items-center gap-1">
                    <IconButton label="Bold" onClick={() => wrapSelection('**')}>
                      <Bold className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Heading" onClick={() => setContent((c) => `${c}\n## `)}>
                      <Heading className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Wikilink" onClick={() => setContent((c) => `${c}[[title]]`)}>
                      <Link2 className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Bullet" onClick={() => setContent((c) => `${c}\n- `)}>
                      <List className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label="Mine cards from this note"
                      onClick={() => setMineText(content)}
                    >
                      <Pickaxe className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Paste text and mine cards" onClick={() => setMineText('')}>
                      <Pickaxe className="h-4 w-4 opacity-50" />
                    </IconButton>
                    <select
                      className="input ml-auto w-40 text-xs"
                      value={supertag}
                      onChange={(e) =>
                        e.target.value && applySupertag(e.target.value as SupertagKey)
                      }
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
                      onClick={() => setConfirmDelete(true)}
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
                  className="block w-full rounded px-1 py-0.5 text-left text-xs text-indigo-400 hover:underline [@media(pointer:coarse)]:min-h-11"
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
      </Reveal>
      {/* S6: destructive confirm — the DELETE request only fires from here. */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently removes “{active?.title ?? 'this note'}” and its bullets. Backlinks
              pointing here will disappear.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (activeId) deleteNote.mutate(activeId)
              }}
            >
              Delete note
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
