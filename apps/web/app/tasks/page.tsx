'use client'

/**
 * Tasks — the Today/Inbox page (S3-20).
 *
 * The SP-parity quick-capture loop: add via short syntax (AddTaskBar),
 * scan the open list, complete / reorder / multi-select in place, and open
 * the detail panel for everything deeper. Sections are real list dividers
 * (migration 034's `task_items.section_id`): unsectioned tasks first, then
 * each section header with its tasks — dropping a row onto a header assigns
 * it (SP's drag-into-section).
 *
 * SSR-safe: all reads go through react-query (pending → skeleton), the
 * clock arrives in an effect (`today === ''` until hydration), and nothing
 * touches window/localStorage at render time (mirrors /boards).
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListChecks } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Callout, EmptyState, PageHeader, Panel, Skeleton } from '@/ui'
import { Button, TextField } from '@/ui'
import { AddTaskBar, type ProjectRow, type TagRow } from '@/components/tasks/AddTaskBar'
import { MultiSelectBar } from '@/components/tasks/MultiSelectBar'
import { TaskRow, type TaskRowTask } from '@/components/tasks/TaskRow'
import { WindowedTaskList } from '@/components/tasks/WindowedTaskList'
import { TaskDetail } from '@/components/tasks/TaskDetail'

/**
 * Windowing threshold (S3-99): below it plain rendering keeps today's
 * variable-height rows; at/above it the unsectioned list virtualizes.
 */
const WINDOW_THRESHOLD = 50

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
interface AssignmentsResponse {
  assignments: Array<{ taskId: number; sectionId: number }>
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
  const assignmentsQ = useQuery({
    queryKey: ['tasks-sections', 'assignments'],
    queryFn: () => apiGet<AssignmentsResponse>('/api/tasks-sections/assignments'),
  })

  function invalidate(): void {
    void qc.invalidateQueries({ queryKey: ['tasks'] })
    void qc.invalidateQueries({ queryKey: ['tasks-sections'] })
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

  const sectionAssignM = useMutation({
    mutationFn: (args: { id: number; sectionId: number | null }) =>
      apiSend(`/api/tasks/${args.id}/section`, 'PUT', { sectionId: args.sectionId }),
    onSuccess: invalidate,
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not move the task'),
  })

  const tasks = tasksQ.data?.tasks ?? []
  const tagNames = useMemo(() => {
    const map = new Map<number, string>()
    for (const t of tagsQ.data?.tags ?? []) map.set(t.id, t.name)
    return map
  }, [tagsQ.data])
  const ids = useMemo(() => tasks.map((t) => t.id), [tasks])
  const openTask = openTaskId !== null ? (tasks.find((t) => t.id === openTaskId) ?? null) : null
  const sectionOf = useMemo(() => {
    const map = new Map<number, number>()
    for (const a of assignmentsQ.data?.assignments ?? []) map.set(a.taskId, a.sectionId)
    return map
  }, [assignmentsQ.data])
  const sections = useMemo(
    () => (sectionsQ.data?.sections ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [sectionsQ.data],
  )
  const unsectioned = useMemo(() => tasks.filter((t) => !sectionOf.has(t.id)), [tasks, sectionOf])

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
        <div className="flex flex-col gap-2">
          {unsectioned.length === 0 ? null : unsectioned.length >= WINDOW_THRESHOLD ? (
            // 1000+-item lists window (S3-99): only the visible slice hits
            // the DOM. Rows are fixed-height here — long content truncates.
            <WindowedTaskList
              items={unsectioned}
              rowHeight={76}
              height={640}
              ariaLabel="Tasks"
              renderItem={(task) => (
                <div style={{ height: '100%', overflow: 'hidden' }}>
                  <TaskRow
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
                </div>
              )}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {unsectioned.map((task) => (
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
          {sections.map((section) => {
            const sectionTasks = tasks.filter((t) => sectionOf.get(t.id) === section.id)
            return (
              <section key={section.id} className="flex flex-col gap-2">
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Section ${section.name} — drop tasks here to assign`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggingId !== null) {
                      sectionAssignM.mutate({ id: draggingId, sectionId: section.id })
                      setDraggingId(null)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') e.preventDefault()
                  }}
                  className="flex min-h-[44px] items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-sm font-semibold text-body transition-colors dark:border-(--hub-border) hover:border-(--ac-strong)"
                >
                  {section.name}
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-tertiary dark:bg-(--hub-panel-2)">
                    {sectionTasks.length}
                  </span>
                </div>
                {sectionTasks.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {sectionTasks.map((task) => (
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
                        onUnsection={
                          sectionAssignM.isPending
                            ? undefined
                            : (id) => sectionAssignM.mutate({ id, sectionId: null })
                        }
                      />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
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

      <TaskDetail
        taskId={openTaskId ?? 0}
        open={openTask !== null}
        onClose={() => setOpenTaskId(null)}
        onChanged={invalidate}
        onDeleted={invalidate}
      />
    </div>
  )
}
