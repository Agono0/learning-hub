'use client'

/**
 * Tag detail (S3-23) — /tasks/tags/[id].
 *
 * Rename + recolor (PATCH /api/tasks-tags/[id]; duplicate names 409),
 * the tag's TODAY time (S3-43 attribution), its open tasks, and delete
 * (unlinking every task — the repo owns that cascade).
 */
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { workContextTotals } from '@learning-hub/core'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, Button, Skeleton, TextField } from '@/ui'
import { cx } from '@/ui/cx'

interface TagResponse {
  tag: { id: number; name: string; color: string | null }
}
interface TasksResponse {
  tasks: Array<{
    id: number
    title: string
    projectId: number | null
    tagIds: number[]
    isDone: boolean
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

export default function TagDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const tagId = Number(params?.id)
  const [today, setToday] = useState('')
  const [draft, setDraft] = useState<{ name: string; color: PaletteKey } | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10))
  }, [])

  const tagQ = useQuery({
    queryKey: ['tasks-tags', 'one', tagId],
    queryFn: async () => {
      const { tags } = await apiGet<{ tags: TagResponse['tag'][] }>('/api/tasks-tags')
      const tag = tags.find((t) => t.id === tagId)
      if (!tag) throw new Error('Tag not found')
      return { tag }
    },
    enabled: Number.isInteger(tagId) && tagId > 0,
  })
  const tasksQ = useQuery({
    queryKey: ['tasks', 'all', 'tag-detail'],
    queryFn: () => apiGet<TasksResponse>('/api/tasks?parentId=any&includeDone=1'),
    enabled: Number.isInteger(tagId) && tagId > 0,
  })

  useEffect(() => {
    const tag = tagQ.data?.tag
    if (tag) {
      setDraft({
        name: tag.name,
        color: (PALETTE.includes(tag.color as PaletteKey) ? tag.color : 'indigo') as PaletteKey,
      })
    }
  }, [tagQ.data])

  function invalidate(): void {
    void qc.invalidateQueries({ queryKey: ['tasks-tags'] })
    void qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  const saveM = useMutation({
    mutationFn: () =>
      apiSend(`/api/tasks-tags/${tagId}`, 'PATCH', { name: draft?.name, color: draft?.color }),
    onSuccess: invalidate,
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not save the tag'),
  })

  const deleteM = useMutation({
    mutationFn: () => apiSend(`/api/tasks-tags/${tagId}`, 'DELETE'),
    onSuccess: () => {
      invalidate()
      router.push('/tasks/tags')
    },
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not delete the tag'),
  })

  const tasks = useMemo(
    () => (tasksQ.data?.tasks ?? []).filter((t) => t.tagIds.includes(tagId)),
    [tasksQ.data, tagId],
  )
  const totals = useMemo(
    () => workContextTotals(tasksQ.data?.tasks ?? [], today),
    [tasksQ.data, today],
  )
  const todayMs = totals.perTag.get(tagId) ?? 0

  const loading = tagQ.isLoading
  const missing = !tagQ.isLoading && tagQ.error !== null

  if (missing) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
        <p role="alert" className="text-sm text-danger-text">
          Tag not found — it may have been deleted.{' '}
          <Link href="/tasks/tags" className="underline">
            Back to tags
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
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span aria-hidden className={cx('size-3 rounded-full', colorDot(draft.color))} />
            <h1 className="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight text-strong">
              {draft.name}
            </h1>
            {todayMs > 0 && <Badge tone="neutral">{Math.round(todayMs / 60_000)}m today</Badge>}
            <Badge tone="neutral">{tasks.length} tasks</Badge>
          </div>

          <TextField
            label="Name"
            className="mb-3"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <span className="label mb-1 block text-xs text-tertiary">Color</span>
          <div className="mb-4 flex gap-1.5">
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

          <div className="mb-6 flex flex-wrap gap-2">
            <Button
              className="min-h-[44px]"
              onClick={() => saveM.mutate()}
              loading={saveM.isPending}
              disabled={draft.name.trim().length === 0}
            >
              Save
            </Button>
            <Button
              variant="danger"
              className="min-h-[44px]"
              onClick={() => deleteM.mutate()}
              aria-label="Delete tag (tasks are unlinked, not deleted)"
            >
              <Trash2 className="size-4" aria-hidden />
              Delete
            </Button>
          </div>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-tertiary">
            Open tasks ({tasks.filter((t) => !t.isDone).length})
          </h2>
          {tasks.length === 0 ? (
            <p className="text-sm text-tertiary">
              No tasks carry this tag yet — add <code>#{draft.name}</code> in the Tasks add-bar.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <Badge tone={t.isDone ? 'success' : 'neutral'}>
                    {t.isDone ? 'done' : 'open'}
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
