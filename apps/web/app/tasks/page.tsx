'use client'

/**
 * Tasks — the Today/Inbox page (S3-20).
 *
 * The SP-parity quick-capture loop: add via short syntax (AddTaskBar),
 * scan the open list, complete / reorder / multi-select in place, and open
 * the detail panel for everything deeper. Sections render as a management
 * strip (the 031 schema has no task→section column yet — see the S3-20
 * handoff; the strip is honest about that).
 *
 * SSR-safe: all reads go through react-query (pending → skeleton), the
 * clock arrives in an effect (`today === ''` until hydration), and nothing
 * touches window/localStorage at render time (mirrors /boards).
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListChecks } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Callout, EmptyState, PageHeader, Panel, Sheet, Skeleton } from '@/ui'
import { Button, TextField } from '@/ui'
import { AddTaskBar, type ProjectRow, type TagRow } from '@/components/tasks/AddTaskBar'
import { MultiSelectBar } from '@/components/tasks/MultiSelectBar'
import { TaskRow, type TaskRowTask } from '@/components/tasks/TaskRow'

interface TasksResponse {
  tasks: TaskRowTask[]
}
interface TagsResponse {
  tags: TagRow[]
}
interface ProjectsResponse {
  projects: ProjectRow[]
}
interface SectionsResponse {
  sections: Array<{ id: number; name: string; sortOrder: number }>
}

export default function TasksPage() {
  const qc = useQueryClient()
  const [today, setToday] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [openTaskId, setOpenTaskId] = useState<number | null>(null)
  const [sectionName, setSectionName] = useState('')
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10))
  }, [])

  const tasksQ = useQuery({
    queryKey: ['tasks', 'today'],
    queryFn: () => apiGet<TasksResponse>('/api/tasks?parentId=top'),
  })
  const tagsQ = useQuery({
    queryKey: ['tasks-tags'],
    queryFn: () => apiGet<TagsResponse>('/api/tasks-tags'),
  })
  const projectsQ = useQuery({
    queryKey: ['tasks-projects'],
    queryFn: () => apiGet<ProjectsResponse>('/api/tasks-projects'),
  })
  const sectionsQ = useQuery({
    queryKey: ['tasks-sections'],
    queryFn: () => apiGet<SectionsResponse>('/api/tasks-sections'),
  })

  function invalidate(): void {
    void qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  const completeM = useMutation({
    mutationFn: (id: number) => apiSend(`/api/tasks/${id}/complete`, 'POST'),
    onSuccess: () => {
      invalidate()
      void qc.invalidateQueries({ queryKey: ['tasks-time'] })
    },
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not complete the task'),
  })

  const duplicateM = useMutation({
    mutationFn: (id: number) => apiSend(`/api/tasks/${id}/duplicate`, 'POST'),
    onSuccess: invalidate,
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not duplicate the task'),
  })

  const deleteM = useMutation({
    mutationFn: (id: number) => apiSend(`/api/tasks/${id}?via=task-row`, 'DELETE'),
    onSuccess: () => {
      invalidate()
      setSelected(new Set())
    },
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not delete the task'),
  })

  const bulkM = useMutation({
    mutationFn: (op: Record<string, unknown>) =>
      apiSend<{ applied: unknown[]; skipped: Array<{ id: number; reason: string }> }>(
        '/api/tasks/bulk',
        'POST',
        { ids: [...selected], op },
      ),
    onSuccess: (res) => {
      invalidate()
      setSelected(new Set())
      if (res.skipped.length > 0) {
        setPageError(
          `${res.skipped.length} task${res.skipped.length === 1 ? '' : 's'} could not be updated (${res.skipped[0]?.reason}).`,
        )
      }
    },
    onError: (e) => setPageError(e instanceof Error ? e.message : 'The bulk update failed'),
  })

  const orderM = useMutation({
    mutationFn: (body: { id: number; targetIndex: number; listIds: number[] }) =>
      apiSend('/api/tasks/order', 'POST', body),
    onSuccess: invalidate,
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not reorder the list'),
  })

  const sectionM = useMutation({
    mutationFn: (name: string) => apiSend('/api/tasks-sections', 'POST', { name }),
    onSuccess: () => {
      setSectionName('')
      void qc.invalidateQueries({ queryKey: ['tasks-sections'] })
    },
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not add the section'),
  })

  const tasks = tasksQ.data?.tasks ?? []
  const tagNames = useMemo(() => {
    const map = new Map<number, string>()
    for (const t of tagsQ.data?.tags ?? []) map.set(t.id, t.name)
    return map
  }, [tagsQ.data])
  const ids = useMemo(() => tasks.map((t) => t.id), [tasks])
  const openTask = openTaskId !== null ? (tasks.find((t) => t.id === openTaskId) ?? null) : null

  function move(id: number, direction: -1 | 1): void {
    const idx = ids.indexOf(id)
    if (idx < 0) return
    orderM.mutate({ id, targetIndex: idx + direction, listIds: ids })
  }

  function dropOnto(targetId: number): void {
    if (draggingId === null || draggingId === targetId) return
    orderM.mutate({ id: draggingId, targetIndex: ids.indexOf(targetId), listIds: ids })
    setDraggingId(null)
  }

  function toggleSelect(id: number): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const loading = tasksQ.isLoading || tagsQ.isLoading || projectsQ.isLoading || sectionsQ.isLoading
  const loadError = tasksQ.error ?? tagsQ.error ?? projectsQ.error ?? sectionsQ.error

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
      <PageHeader title="Tasks" subtitle="Today and Inbox — one calm list" />

      {loadError !== null && (
        <div className="mb-4">
          <Callout tone="danger" title="Tasks could not be loaded">
            Pull to refresh, or check your data folder.
          </Callout>
        </div>
      )}

      <Panel className="mb-4">
        <AddTaskBar
          todayIso={today === '' ? null : today}
          tags={tagsQ.data?.tags ?? []}
          projects={projectsQ.data?.projects ?? []}
          onCreated={invalidate}
        />
      </Panel>

      {(sectionsQ.data?.sections.length ?? 0) > 0 && (
        <div className="scroll-x mb-4 flex gap-2" aria-label="Sections">
          {sectionsQ.data?.sections.map((s) => (
            <span
              key={s.id}
              className="shrink-0 rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-medium text-body dark:bg-(--hub-panel-2)"
            >
              {s.name}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <ul className="flex flex-col gap-2" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-16 w-full rounded-xl" />
            </li>
          ))}
        </ul>
      ) : tasks.length === 0 ? (
        <EmptyState icon={<ListChecks className="size-8" aria-hidden />} title="Your list is empty">
          Add the first task above — #tags, +projects, 10m estimates and @due dates all work in one
          line.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              tagNames={tagNames}
              today={today}
              selected={selected.has(task.id)}
              onToggleSelect={toggleSelect}
              onComplete={(id) => completeM.mutate(id)}
              onOpen={setOpenTaskId}
              onDuplicate={(id) => duplicateM.mutate(id)}
              onDelete={(id) => deleteM.mutate(id)}
              onMove={move}
              onDragStart={setDraggingId}
              onDropOnto={dropOnto}
              dragging={draggingId === task.id}
            />
          ))}
        </ul>
      )}

      <div className="mt-6 flex items-end gap-2">
        <TextField
          label="New section"
          className="flex-1"
          value={sectionName}
          onChange={(e) => setSectionName(e.target.value)}
          placeholder="Morning routine"
        />
        <Button
          variant="secondary"
          className="min-h-[44px]"
          disabled={sectionName.trim().length === 0 || sectionM.isPending}
          loading={sectionM.isPending}
          onClick={() => sectionM.mutate(sectionName.trim())}
        >
          Add section
        </Button>
      </div>

      {pageError !== null && (
        <div className="mt-4">
          <Callout tone="danger" title="Something did not save">
            {pageError}
          </Callout>
        </div>
      )}

      <MultiSelectBar
        count={selected.size}
        busy={bulkM.isPending}
        onComplete={() => bulkM.mutate({ op: { op: 'complete' } })}
        onWontdo={() => bulkM.mutate({ op: { op: 'wontdo' } })}
        onClear={() => setSelected(new Set())}
      />

      <Sheet
        open={openTask !== null}
        onClose={() => setOpenTaskId(null)}
        title={openTask?.title ?? 'Task'}
        footer={
          openTask !== null ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="min-h-[44px] flex-1"
                onClick={() => {
                  duplicateM.mutate(openTask.id)
                  setOpenTaskId(null)
                }}
              >
                Duplicate
              </Button>
              <Button
                variant="danger"
                className="min-h-[44px] flex-1"
                onClick={() => {
                  deleteM.mutate(openTask.id)
                  setOpenTaskId(null)
                }}
              >
                Delete
              </Button>
            </div>
          ) : undefined
        }
      >
        {openTask !== null && (
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-tertiary">Priority</dt>
              <dd className="text-strong">{openTask.priority}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tertiary">Estimate</dt>
              <dd className="text-strong">
                {openTask.estimateMs !== null
                  ? `${Math.round(openTask.estimateMs / 60_000)}m`
                  : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tertiary">Due</dt>
              <dd className="text-strong">{openTask.due ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tertiary">Deadline</dt>
              <dd className="text-strong">{openTask.deadline ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tertiary">Tags</dt>
              <dd className="flex flex-wrap justify-end gap-1">
                {openTask.tagIds.length === 0
                  ? '—'
                  : openTask.tagIds.map((id) => (
                      <span
                        key={id}
                        className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-(--hub-panel-2)"
                      >
                        {tagNames.get(id) ?? `#${id}`}
                      </span>
                    ))}
              </dd>
            </div>
          </dl>
        )}
      </Sheet>
    </div>
  )
}
