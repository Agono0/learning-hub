'use client'

/**
 * Project detail (S3-22) — /tasks/projects/[id].
 *
 * Editable fields (title, notes with a live sanitized-Markdown preview via
 * the kit `Markdown` — rule 11, no raw HTML), backlog flag, palette color,
 * and the project's task list with per-project TODAY time (S3-43 math).
 * Destructive actions (duplicate / archive / restore / delete) sit in the
 * footer row; delete moves the tasks to the inbox (SP semantics).
 */
import React, { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useIdParam } from '@/lib/use-id-param'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, Copy, Trash2 } from 'lucide-react'
import { workContextTotals } from '@learning-hub/core'
import { apiGet, apiSend } from '@/lib/transport'
import {
  Badge,
  Button,
  IconButton,
  Markdown,
  SelectField,
  Skeleton,
  TextArea,
  TextField,
} from '@/ui'
import { cx } from '@/ui/cx'
import {
  addBookmark,
  loadBookmarks,
  removeBookmark,
  type ProjectBookmark,
} from '@/lib/project-bookmarks'

interface ProjectRow {
  id: number
  title: string
  notes: string | null
  backlogFlag: boolean
  color: string | null
  archivedAt: string | null
}
interface ProjectResponse {
  project: ProjectRow
}
interface TasksResponse {
  tasks: Array<{
    id: number
    title: string
    projectId: number | null
    tagIds: number[]
    isDone: boolean
    wonthado: boolean
    due: string | null
    timeSpentOnDay: Record<string, number>
  }>
}

const PALETTE = ['neutral', 'indigo', 'teal', 'amber', 'rose', 'lime'] as const
type PaletteKey = (typeof PALETTE)[number]

function colorDot(color: string | null): string {
  const map: Record<string, string> = {
    neutral: 'bg-neutral-400',
    indigo: 'bg-indigo-500',
    teal: 'bg-teal-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    lime: 'bg-lime-500',
  }
  return map[color ?? 'neutral'] ?? 'bg-neutral-400'
}

export default function ProjectDetailPage() {
  // Static export cannot pre-render [id] segments — query params + Suspense
  // (house pattern: courses/course?id=). useSearchParams requires the boundary.
  return (
    <Suspense fallback={null}>
      <ProjectDetailPageInner />
    </Suspense>
  )
}

function ProjectDetailPageInner() {
  const search = useSearchParams()
  const router = useRouter()
  const qc = useQueryClient()
  const projectId = useIdParam() ?? 0
  const [today, setToday] = useState('')
  const [draft, setDraft] = useState<{
    title: string
    notes: string | null
    backlogFlag: boolean
    color: PaletteKey
  } | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10))
  }, [])

  // S3-74: bookmarks are device-local (no project-attachment table yet).
  const [bookmarks, setBookmarks] = useState<ProjectBookmark[]>([])
  const [bookmarkType, setBookmarkType] = useState<'file' | 'url' | 'command'>('url')
  const [bookmarkValue, setBookmarkValue] = useState('')
  useEffect(() => {
    if (Number.isInteger(projectId) && projectId > 0) {
      setBookmarks(loadBookmarks(projectId))
    }
  }, [projectId])

  const projectQ = useQuery({
    queryKey: ['tasks-projects', projectId],
    queryFn: () => apiGet<ProjectResponse>(`/api/tasks-projects/${projectId}`),
    enabled: Number.isInteger(projectId) && projectId > 0,
  })
  const tasksQ = useQuery({
    queryKey: ['tasks', 'project', projectId],
    queryFn: () =>
      apiGet<TasksResponse>(`/api/tasks?projectId=${projectId}&parentId=any&includeDone=1`),
    enabled: Number.isInteger(projectId) && projectId > 0,
  })

  useEffect(() => {
    const p = projectQ.data?.project
    if (p) {
      setDraft({
        title: p.title,
        notes: p.notes,
        backlogFlag: p.backlogFlag,
        color: (PALETTE.includes(p.color as PaletteKey) ? p.color : 'indigo') as PaletteKey,
      })
    }
  }, [projectQ.data])

  function invalidate(): void {
    void qc.invalidateQueries({ queryKey: ['tasks-projects'] })
    void qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  const saveM = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiSend(`/api/tasks-projects/${projectId}`, 'PATCH', body),
    onSuccess: invalidate,
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not save the project'),
  })

  const duplicateM = useMutation({
    mutationFn: () => apiSend(`/api/tasks-projects/${projectId}/duplicate`, 'POST'),
    onSuccess: invalidate,
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not duplicate'),
  })

  const archiveM = useMutation({
    mutationFn: () => apiSend(`/api/tasks-projects/${projectId}/archive`, 'POST'),
    onSuccess: invalidate,
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not archive'),
  })

  const restoreM = useMutation({
    mutationFn: () => apiSend(`/api/tasks-projects/${projectId}/restore`, 'POST'),
    onSuccess: invalidate,
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not restore'),
  })

  const deleteM = useMutation({
    mutationFn: () => apiSend(`/api/tasks-projects/${projectId}`, 'DELETE'),
    onSuccess: () => {
      invalidate()
      router.push('/tasks/projects')
    },
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not delete the project'),
  })

  const tasks = tasksQ.data?.tasks ?? []
  const totals = useMemo(() => workContextTotals(tasks, today), [tasks, today])
  const todayMs = totals.perProject.get(projectId) ?? 0
  const openCount = tasks.filter((t) => !t.isDone && !t.wonthado).length

  const loading = projectQ.isLoading
  const missing = !projectQ.isLoading && projectQ.data === undefined && projectQ.error !== null

  if (missing) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
        <p role="alert" className="text-sm text-danger-text">
          Project not found — it may have been deleted.{' '}
          <Link href="/tasks/projects" className="underline">
            Back to projects
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
      {loading || draft === null ? (
        <div className="flex flex-col gap-3" aria-hidden>
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span aria-hidden className={cx('size-3 rounded-full', colorDot(draft.color))} />
            <h1 className="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight text-strong">
              {draft.title}
            </h1>
            {draft.backlogFlag && <Badge tone="warning">backlog</Badge>}
            {projectQ.data?.project.archivedAt != null && <Badge tone="neutral">archived</Badge>}
            {todayMs > 0 && <Badge tone="neutral">{Math.round(todayMs / 60_000)}m today</Badge>}
            <Badge tone="neutral">{openCount} open</Badge>
          </div>

          <TextField
            label="Title"
            className="mb-3"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <TextArea
            label="Notes"
            className="mb-2"
            value={draft.notes ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, notes: e.target.value === '' ? null : e.target.value })
            }
            placeholder="What is this project for?"
          />
          {draft.notes !== null && draft.notes.trim() !== '' && (
            <div className="panel mb-3 rounded-xl px-3 py-2">
              {/* Sanitized kit Markdown — untrusted notes never render raw HTML. */}
              <Markdown>{draft.notes}</Markdown>
            </div>
          )}

          {/* S3-74: project bookmarks — links, files and commands (device-local). */}
          <div className="panel mb-4 rounded-xl px-3 py-2.5">
            <span className="label mb-1.5 block text-xs font-semibold text-tertiary">
              Bookmarks
            </span>
            <ul className="mb-2 flex flex-col gap-1">
              {bookmarks.map((b) => (
                <li key={b.id} className="flex items-center gap-2 text-sm">
                  <Badge tone="neutral">{b.type}</Badge>
                  {b.type === 'url' ? (
                    <a
                      href={b.value}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-body underline"
                    >
                      {b.title ?? b.value}
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-body">{b.title ?? b.value}</span>
                  )}
                  <IconButton
                    label="Remove bookmark"
                    size="sm"
                    onClick={() => {
                      setBookmarks(removeBookmark(projectId, b.id))
                    }}
                    className="text-danger-text"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </IconButton>
                </li>
              ))}
              {bookmarks.length === 0 && (
                <li className="text-sm text-tertiary">
                  No bookmarks yet — pin the spec, repo or command you always open for this project.
                </li>
              )}
            </ul>
            <div className="flex flex-wrap items-end gap-2">
              <SelectField
                label="Type"
                value={bookmarkType}
                onChange={(e) => setBookmarkType(e.target.value as 'file' | 'url' | 'command')}
              >
                <option value="url">URL</option>
                <option value="file">File</option>
                <option value="command">Command</option>
              </SelectField>
              <TextField
                label="Value"
                className="min-w-48 flex-1"
                value={bookmarkValue}
                onChange={(e) => setBookmarkValue(e.target.value)}
                placeholder="https://… or a file path"
              />
              <Button
                variant="secondary"
                className="min-h-[44px]"
                disabled={bookmarkValue.trim().length === 0}
                onClick={() => {
                  setBookmarks([
                    addBookmark({
                      projectId,
                      type: bookmarkType,
                      value: bookmarkValue.trim(),
                    }),
                  ])
                  setBookmarkValue('')
                }}
              >
                Pin
              </Button>
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-2">
            <span className="label block text-xs text-tertiary">Color</span>
            <div className="flex gap-1.5">
              {PALETTE.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={draft.color === key}
                  aria-label={`Color ${key}`}
                  onClick={() => setDraft({ ...draft, color: key })}
                  className={cx(
                    'size-11 rounded-lg border-2 p-2.5 transition-colors',
                    draft.color === key ? 'border-(--ac-strong)' : 'border-transparent',
                  )}
                >
                  <span className={cx('block size-5 rounded-full', colorDot(key))} />
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-pressed={draft.backlogFlag}
              onClick={() => setDraft({ ...draft, backlogFlag: !draft.backlogFlag })}
              className={cx(
                'min-h-[44px] w-fit rounded-lg px-3 text-sm transition-colors',
                draft.backlogFlag
                  ? 'bg-amber-500/15 font-semibold text-status-warning-text'
                  : 'text-tertiary hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)',
              )}
            >
              {draft.backlogFlag ? '★ In the backlog' : '☆ Park in the backlog'}
            </button>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            <Button
              className="min-h-[44px]"
              onClick={() =>
                saveM.mutate({
                  title: draft.title.trim(),
                  notes: draft.notes,
                  backlogFlag: draft.backlogFlag,
                  color: draft.color,
                })
              }
              loading={saveM.isPending}
              disabled={draft.title.trim().length === 0}
            >
              Save
            </Button>
            <Button
              variant="secondary"
              className="min-h-[44px]"
              onClick={() => duplicateM.mutate()}
            >
              <Copy className="size-4" aria-hidden />
              Duplicate
            </Button>
            {projectQ.data?.project.archivedAt == null ? (
              <Button
                variant="secondary"
                className="min-h-[44px]"
                onClick={() => archiveM.mutate()}
              >
                <Archive className="size-4" aria-hidden />
                Archive
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="min-h-[44px]"
                onClick={() => restoreM.mutate()}
              >
                <ArchiveRestore className="size-4" aria-hidden />
                Restore
              </Button>
            )}
            <Button
              variant="danger"
              className="min-h-[44px]"
              onClick={() => deleteM.mutate()}
              aria-label="Delete project (tasks move to the inbox)"
            >
              <Trash2 className="size-4" aria-hidden />
              Delete
            </Button>
          </div>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-tertiary">
            Tasks ({tasks.length})
          </h2>
          {tasks.length === 0 ? (
            <p className="text-sm text-tertiary">
              No tasks in this project yet — add them from the{' '}
              <Link href="/tasks" className="underline">
                Tasks page
              </Link>{' '}
              with <code>+{draft.title}</code>.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <Badge tone={t.isDone ? 'success' : t.wonthado ? 'danger' : 'neutral'}>
                    {t.isDone ? 'done' : t.wonthado ? "won't do" : 'open'}
                  </Badge>
                  <span
                    className={cx(
                      'min-w-0 flex-1 truncate',
                      t.isDone ? 'text-tertiary line-through' : 'text-body',
                    )}
                  >
                    {t.title}
                  </span>
                  {t.due !== null && <span className="text-tertiary">{t.due.slice(0, 10)}</span>}
                </li>
              ))}
            </ul>
          )}

          {pageError !== null && (
            <p role="alert" className="mt-4 text-sm text-danger-text">
              {pageError}
            </p>
          )}
        </>
      )}
    </div>
  )
}
