'use client'

/**
 * SP first-run step (S3-40) — the onboarding addition: create a first
 * project and capture a task with the short syntax (the same grammar as the
 * Today bar, S3-09). Both fields are optional and the step is skippable —
 * the task system works empty (honest empty states, S3-98), this just
 * removes the blank-page moment.
 */
import React, { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ListPlus, Plus } from 'lucide-react'
import { parseShortSyntax } from '@learning-hub/core'
import { apiSend } from '@/lib/transport'
import { Button, TextField } from '@/ui'

export interface SpFirstRunStepProps {
  /** ISO day for date resolution; null until the client clock mounted. */
  todayIso: string | null
  onCreated?: () => void
}

export function SpFirstRunStep({ todayIso, onCreated }: SpFirstRunStepProps) {
  const [projectTitle, setProjectTitle] = useState('')
  const [taskInput, setTaskInput] = useState('')

  const parsed = useMemo(
    () =>
      todayIso !== null && taskInput.trim().length > 0
        ? parseShortSyntax(taskInput, `${todayIso}T12:00:00.000Z`)
        : null,
    [taskInput, todayIso],
  )

  const create = useMutation({
    mutationFn: async () => {
      if (projectTitle.trim().length > 0) {
        await apiSend('/api/tasks-projects', 'POST', { title: projectTitle.trim() })
      }
      if (parsed !== null && parsed.title.trim().length > 0 && todayIso !== null) {
        const tagIds: number[] = []
        for (const name of parsed.tags) {
          const created = await apiSend<{ tag: { id: number } }>('/api/tasks-tags', 'POST', {
            name,
          })
          tagIds.push(created.tag.id)
        }
        let projectId: number | null = null
        if (parsed.project) {
          const created = await apiSend<{ project: { id: number } }>(
            '/api/tasks-projects',
            'POST',
            { title: parsed.project },
          )
          projectId = created.project.id
        }
        await apiSend('/api/tasks', 'POST', {
          title: parsed.title.trim(),
          tagIds,
          projectId,
          estimateMs: parsed.estimateMs,
          due: parsed.due?.day ?? todayIso,
          deadline: parsed.deadline?.day ?? null,
          priority: parsed.priority ?? 'none',
          repeatCfgId: null,
        })
      }
    },
    onSuccess: () => {
      setProjectTitle('')
      setTaskInput('')
      onCreated?.()
    },
  })

  const nothingToDo =
    projectTitle.trim().length === 0 && (parsed === null || parsed.title.trim().length === 0)

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600 dark:text-secondary">
        Optional — set up the task side of the app (Super Productivity-style): one project, one
        first task. Skip freely; the pages stay honest when empty.
      </p>
      <TextField
        label="First project (optional)"
        value={projectTitle}
        onChange={(e) => setProjectTitle(e.target.value)}
        placeholder="e.g. Thesis"
      />
      <TextField
        label="First task (optional — short syntax)"
        value={taskInput}
        onChange={(e) => setTaskInput(e.target.value)}
        placeholder="Draft outline #thesis 45m p2"
        hint="Grammar: #tag +project 10m @today p1 !deadline"
        disabled={todayIso === null}
      />
      {parsed !== null && parsed.title.trim().length > 0 && (
        <p className="text-xs text-tertiary" aria-live="polite">
          {parsed.title.trim()}
          {parsed.tags.length > 0 ? ` · ${parsed.tags.map((t) => '#' + t).join(' ')}` : ''}
          {parsed.estimateMs !== null ? ` · ${Math.round(parsed.estimateMs / 60_000)}m` : ''}
        </p>
      )}
      {create.isError && (
        <p className="text-xs text-danger-text" role="alert">
          {create.error instanceof Error ? create.error.message : 'Could not create — try again.'}
        </p>
      )}
      <Button
        variant="secondary"
        className="text-xs"
        disabled={nothingToDo || create.isPending}
        onClick={() => create.mutate()}
      >
        <ListPlus className="size-3.5" aria-hidden /> Create project &amp; task
      </Button>
      {create.isSuccess && (
        <p className="text-xs text-status-success-text" role="status">
          Created — find them under Tasks in the sidebar.
        </p>
      )}
      <p className="text-xs text-tertiary">
        <Plus className="mr-0.5 inline size-3" aria-hidden /> More later: the Tasks page's add bar
        speaks the same grammar.
      </p>
    </div>
  )
}

/** parseShortSyntax over the optional task input (null while empty/unmounted). */
export function parsedSpTask(
  todayIso: string | null,
  input: string,
): ReturnType<typeof parseShortSyntax> {
  return todayIso !== null && input.trim().length > 0
    ? parseShortSyntax(input, `${todayIso}T12:00:00.000Z`)
    : null
}

export default SpFirstRunStep
