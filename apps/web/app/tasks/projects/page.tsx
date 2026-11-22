'use client'

/**
 * Projects (S3-22) — the SP-parity project list at /tasks/projects.
 *
 * Active projects first (core `activeProjects`: backlog last, creation
 * order), then the archived section (core `archivedProjects`, trophy
 * reopen). Each card shows the color dot, backlog flag, notes preview,
 * per-project TODAY time from the S3-43 work-context math, and the calm
 * actions: open (detail), backlog toggle, duplicate, archive/restore.
 * Creation is a title + palette row at the top.
 *
 * All writes go through the S3-17 routes; reads through react-query
 * (SSR renders the skeleton — no clock/storage reads at render).
 */
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, Copy, FolderKanban, Plus } from 'lucide-react'
import { type TaskItem, workContextTotals } from '@learning-hub/core'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, Button, EmptyState, Skeleton, TextField } from '@/ui'
import { cx } from '@/ui/cx'
import { SectionHeader } from '@/components/ui/section-header'

interface ProjectRow {
  id: number
  title: string
  notes: string | null
  backlogFlag: boolean
  color: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}
interface ProjectsResponse {
  projects: ProjectRow[]
}
/** GET /api/tasks payload — full task rows (the list consumes the core model). */
export interface TasksResponse {
  tasks: TaskItem[]
}

/** The palette the project color picker offers (same keys as tags/feeds). */
const PALETTE = ['neutral', 'indigo', 'teal', 'amber', 'rose', 'lime'] as const
type PaletteKey = (typeof PALETTE)[number]

/** Dot class per palette key; unknown keys fall back to neutral. */
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

export default function ProjectsPage() {
  const qc = useQueryClient()
  const [today, setToday] = useState('')
  const [title, setTitle] = useState('')
  const [color, setColor] = useState<PaletteKey>('indigo')
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10))
  }, [])

  const projectsQ = useQuery({
    queryKey: ['tasks-projects'],
    queryFn: () => apiGet<ProjectsResponse>('/api/tasks-projects'),
  })
  const tasksQ = useQuery({
    queryKey: ['tasks', 'all', 'totals'],
    queryFn: () => apiGet<TasksResponse>('/api/tasks?parentId=any&includeDone=1&includeWontdo=1'),
  })

  function invalidate(): void {
    void qc.invalidateQueries({ queryKey: ['tasks-projects'] })
    void qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  const createM = useMutation({
    mutationFn: () => apiSend('/api/tasks-projects', 'POST', { title: title.trim(), color }),
    onSuccess: () => {
      setTitle('')
      invalidate()
    },
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not create the project'),
  })

  const patchM = useMutation({
    mutationFn: (args: { id: number; body: Record<string, unknown> }) =>
      apiSend(`/api/tasks-projects/${args.id}`, 'PATCH', args.body),
    onSuccess: invalidate,
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not save the project'),
  })

  const archiveM = useMutation({
    mutationFn: (id: number) => apiSend(`/api/tasks-projects/${id}/archive`, 'POST'),
    onSuccess: invalidate,
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not archive the project'),
  })

  const restoreM = useMutation({
    mutationFn: (id: number) => apiSend(`/api/tasks-projects/${id}/restore`, 'POST'),
    onSuccess: invalidate,
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not restore the project'),
  })

  const duplicateM = useMutation({
    mutationFn: (id: number) => apiSend(`/api/tasks-projects/${id}/duplicate`, 'POST'),
    onSuccess: invalidate,
    onError: (e) => setPageError(e instanceof Error ? e.message : 'Could not duplicate'),
  })

  const projects = projectsQ.data?.projects ?? []
  const totals = useMemo(
    () => workContextTotals(tasksQ.data?.tasks ?? [], today),
    [tasksQ.data, today],
  )

  const active = useMemo(() => projects.filter((p) => p.archivedAt === null), [projects])
  const activeSorted = useMemo(
    () =>
      active
        .slice()
        .sort((a, b) =>
          a.backlogFlag === b.backlogFlag
            ? a.createdAt.localeCompare(b.createdAt)
            : a.backlogFlag
              ? 1
              : -1,
        ),
    [active],
  )
  const archived = useMemo(
    () =>
      projects
        .filter((p) => p.archivedAt !== null)
        .sort((a, b) => (a.archivedAt ?? '').localeCompare(b.archivedAt ?? '') * -1),
    [projects],
  )

  const loading = projectsQ.isLoading || tasksQ.isLoading

  function projectCard(project: ProjectRow): React.ReactNode {
    const todayMs = totals.perProject.get(project.id) ?? 0
    return (
      <li key={project.id} className="panel rounded-xl px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cx('size-3 shrink-0 rounded-full', colorDot(project.color))}
          />
          <Link
            href={`/tasks/projects/${project.id}`}
            className="min-w-0 flex-1 truncate text-sm font-semibold text-strong hover:underline"
          >
            {project.title}
          </Link>
          {project.backlogFlag && <Badge tone="warning">backlog</Badge>}
          {todayMs > 0 && <Badge tone="neutral">{Math.round(todayMs / 60_000)}m today</Badge>}
        </div>
        {project.notes !== null && project.notes.trim() !== '' && (
          <p className="mt-1 line-clamp-2 text-xs text-tertiary">{project.notes}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            variant="ghost"
            className="min-h-[44px] px-2 py-1 text-xs"
            onClick={() =>
              patchM.mutate({ id: project.id, body: { backlogFlag: !project.backlogFlag } })
            }
            aria-pressed={project.backlogFlag}
          >
            {project.backlogFlag ? 'Unmark backlog' : 'Backlog'}
          </Button>
          <Button
            variant="ghost"
            className="min-h-[44px] px-2 py-1 text-xs"
            onClick={() => duplicateM.mutate(project.id)}
          >
            <Copy className="size-3.5" aria-hidden />
            Duplicate
          </Button>
          {project.archivedAt === null ? (
            <Button
              variant="ghost"
              className="min-h-[44px] px-2 py-1 text-xs text-tertiary"
              onClick={() => archiveM.mutate(project.id)}
            >
              <Archive className="size-3.5" aria-hidden />
              Archive
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="min-h-[44px] px-2 py-1 text-xs text-status-success-text"
              onClick={() => restoreM.mutate(project.id)}
            >
              <ArchiveRestore className="size-3.5" aria-hidden />
              Restore
            </Button>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
      <PageHeader />

      {projectsQ.error !== null && (
        <p role="alert" className="mb-4 text-sm text-danger-text">
          Projects could not be loaded — try again.
        </p>
      )}

      <SectionHeader icon={FolderKanban} title="New project" />
      <form
        className="mb-6 mt-2 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim().length > 0) createM.mutate()
        }}
      >
        <TextField
          label="Title"
          className="min-w-48 flex-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Thesis"
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
          disabled={title.trim().length === 0 || createM.isPending}
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
              <Skeleton className="h-24 w-full rounded-xl" />
            </li>
          ))}
        </ul>
      ) : projects.length === 0 ? (
        <EmptyState icon={<FolderKanban className="size-8" aria-hidden />} title="No projects yet">
          Create one above — projects group tasks, carry notes and a color, and can be parked in the
          backlog or archived when done.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          <div>
            <SectionHeader
              title={`Active (${activeSorted.filter((p) => !p.backlogFlag).length})`}
              count={activeSorted.length}
            />
            <ul className="mt-2 flex flex-col gap-2">{activeSorted.map((p) => projectCard(p))}</ul>
          </div>
          {archived.length > 0 && (
            <div>
              <SectionHeader title="Archived" count={archived.length} />
              <ul className="mt-2 flex flex-col gap-2 opacity-80">
                {archived.map((p) => projectCard(p))}
              </ul>
            </div>
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

/** Page header (kept local — the page composes its own subtitle). */
function PageHeader(): React.ReactNode {
  return (
    <header className="mb-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-strong">
        <FolderKanban className="size-6" aria-hidden />
        Projects
      </h1>
      <p className="mt-1 text-sm text-tertiary">
        Group tasks, park ideas in the backlog, archive when done
      </p>
    </header>
  )
}
