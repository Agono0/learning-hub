'use client'

/**
 * Tags (S3-23) — the SP-parity tag list at /tasks/tags.
 *
 * Every tag with its color dot, TODAY time (S3-43 per-tag attribution) and
 * a delete affordance, plus the SP filter row: select tags (multi via
 * aria-pressed buttons) and combine them OR (any match, default) or AND
 * (strict) — core `filterTasksByTags` is the semantics reference. The
 * filtered open-task list renders under the tags; creation is a name +
 * palette row at the top.
 */
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Tags as TagsIcon, Trash2 } from 'lucide-react'
import { filterTasksByTags, workContextTotals, type TagFilterMode } from '@learning-hub/core'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, Button, EmptyState, Skeleton, TextField } from '@/ui'
import { cx } from '@/ui/cx'
import { SectionHeader } from '@/components/ui/section-header'
import { ChipPicker } from '@/components/ui/chip-picker'

interface TagRow {
  id: number
  name: string
  color: string | null
}
interface TagsResponse {
  tags: TagRow[]
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

export default function TagsPage() {
  const qc = useQueryClient()
  const [today, setToday] = useState('')
  const [name, setName] = useState('')
  const [color, setColor] = useState<PaletteKey>('indigo')
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set())
  const [mode, setMode] = useState<TagFilterMode>('or')
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10))
  }, [])

  const tagsQ = useQuery({
    queryKey: ['tasks-tags'],
    queryFn: () => apiGet<TagsResponse>('/api/tasks-tags'),
  })
  const tasksQ = useQuery({
    queryKey: ['tasks', 'all', 'tags'],
    queryFn: () => apiGet<TasksResponse>('/api/tasks?parentId=any&includeDone=0&includeWontdo=0'),
  })

  function invalidate(): void {
    void qc.invalidateQueries({ queryKey: ['tasks-tags'] })
    void qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  const createM = useMutation({
    mutationFn: () => apiSend('/api/tasks-tags', 'POST', { name: name.trim(), color }),
    onSuccess: () => {
      setName('')
      invalidate()
    },
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not create the tag'),
  })

  const deleteM = useMutation({
    mutationFn: (id: number) => apiSend(`/api/tasks-tags/${id}`, 'DELETE'),
    onSuccess: invalidate,
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not delete the tag'),
  })

  const tags = tagsQ.data?.tags ?? []
  const tasks = tasksQ.data?.tasks ?? []
  const totals = useMemo(() => workContextTotals(tasks, today), [tasks, today])

  const filtered = useMemo(
    () =>
      filterTasksByTags(tasks, {
        tagIds: [...selectedTagIds],
        mode,
      }),
    [tasks, selectedTagIds, mode],
  )

  const loading = tagsQ.isLoading || tasksQ.isLoading

  function toggleTag(id: number): void {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-strong">
          <TagsIcon className="size-6" aria-hidden />
          Tags
        </h1>
        <p className="mt-1 text-sm text-tertiary">
          Color-code and filter tasks — a task&rsquo;s time counts toward every tag it carries
        </p>
      </header>

      {tagsQ.error !== null && (
        <p role="alert" className="mb-4 text-sm text-danger-text">
          Tags could not be loaded — try again.
        </p>
      )}

      <SectionHeader icon={TagsIcon} title="New tag" />
      <form
        className="mb-6 mt-2 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim().length > 0) createM.mutate()
        }}
      >
        <TextField
          label="Name"
          className="min-w-48 flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="deep work"
        />
        <div className="flex flex-col gap-1">
          <span className="label block text-xs text-tertiary">Color</span>
          <div className="flex gap-1.5">
            {PALETTE.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={color === key}
                aria-label={`Color ${key}`}
                onClick={() => setColor(key)}
                className={cx(
                  'size-11 rounded-lg border-2 p-2.5 transition-colors',
                  color === key ? 'border-(--ac-strong)' : 'border-transparent',
                )}
              >
                <span className={cx('block size-5 rounded-full', colorDot(key))} />
              </button>
            ))}
          </div>
        </div>
        <Button
          type="submit"
          className="min-h-[44px]"
          disabled={name.trim().length === 0 || createM.isPending}
          loading={createM.isPending}
        >
          <Plus className="size-4" aria-hidden />
          Create
        </Button>
      </form>

      {loading ? (
        <ul className="flex flex-col gap-2" aria-hidden>
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-14 w-full rounded-xl" />
            </li>
          ))}
        </ul>
      ) : tags.length === 0 ? (
        <EmptyState icon={<TagsIcon className="size-8" aria-hidden />} title="No tags yet">
          Create one above, or type <code>#name</code> straight into the Tasks page add-bar — tags
          color-code tasks and power the filters below.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {tags.map((tag) => {
            const ms = totals.perTag.get(tag.id) ?? 0
            return (
              <li key={tag.id} className="panel flex items-center gap-2 rounded-xl px-3 py-2">
                <span
                  aria-hidden
                  className={cx('size-3 shrink-0 rounded-full', colorDot(tag.color))}
                />
                <Link
                  href={`/tasks/tags/${tag.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-strong hover:underline"
                >
                  {tag.name}
                </Link>
                {ms > 0 && <Badge tone="neutral">{Math.round(ms / 60_000)}m today</Badge>}
                <Button
                  variant={selectedTagIds.has(tag.id) ? 'secondary' : 'ghost'}
                  onClick={() => toggleTag(tag.id)}
                  aria-pressed={selectedTagIds.has(tag.id)}
                  className="min-h-[44px] px-2 py-1 text-xs"
                >
                  {selectedTagIds.has(tag.id) ? 'Filtering' : 'Filter'}
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-[44px] px-2 py-1 text-xs text-danger-text"
                  onClick={() => deleteM.mutate(tag.id)}
                  aria-label={`Delete tag ${tag.name}`}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {tags.length > 0 && (
        <div className="mt-6">
          <SectionHeader
            title={`Filtered open tasks (${filtered.length})`}
            action={
              <ChipPicker
                label="Tag filter mode"
                items={[
                  { value: 'or' as TagFilterMode, label: 'OR — any tag' },
                  { value: 'and' as TagFilterMode, label: 'AND — every tag' },
                ]}
                value={mode}
                onChange={(next) => setMode(next)}
              />
            }
          />
          {selectedTagIds.size === 0 ? (
            <p className="mt-2 text-sm text-tertiary">
              Press “Filter” on one or more tags above — OR shows tasks with any of them, AND only
              tasks carrying every selected tag.
            </p>
          ) : filtered.length === 0 ? (
            <p className="mt-2 text-sm text-tertiary">
              No open tasks match this {mode === 'or' ? 'any-tag' : 'every-tag'} filter.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {filtered.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-body">{t.title}</span>
                  {t.due !== null && <span className="text-tertiary">{t.due.slice(0, 10)}</span>}
                  <span className="flex gap-1">
                    {t.tagIds.map((id) => (
                      <Badge key={id} tone="neutral">
                        {tags.find((tag) => tag.id === id)?.name ?? `#${id}`}
                      </Badge>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {pageError !== null && (
        <div className="mt-4">
          <p role="alert" className="text-sm text-danger-text">
            {pageError}
          </p>
        </div>
      )}
    </div>
  )
}
