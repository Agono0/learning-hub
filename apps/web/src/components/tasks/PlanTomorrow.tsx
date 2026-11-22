'use client'

/**
 * Plan-for-tomorrow panel (S3-49) — the evening capture surface: add tasks
 * via the short syntax (same grammar as the Today bar, S3-09) that land due
 * TOMORROW, see tomorrow's planned list, and pull any of them back to
 * today. The Today/Planner exclusivity is the core's due-day rule (S3-65):
 * tomorrow-due tasks are structurally absent from Today, and after the day
 * rolls over they simply become today's — no sync step.
 *
 * The component owns only the create/move calls; the parent owns the task
 * list (it already fetches /api/tasks) and refetches on change.
 */
import React, { useMemo, useState } from 'react'
import { CalendarPlus, ChevronLeft } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { parseShortSyntax, type TaskItem } from '@learning-hub/core'
import { tomorrowsTasks } from '@learning-hub/core'
import { apiSend } from '@/lib/transport'
import { Button, TextField } from '@/ui'

export interface PlanTomorrowProps {
  /** Client `today` day-key (null until mounted — SSR-safe). */
  today: string | null
  /** The full fetched task list (the component filters tomorrow's subset). */
  tasks: TaskItem[]
  /** Tag id → name for the planned rows. */
  tagNames: Map<number, string>
  onAdded: () => void
}

/** The short-syntax create body the Today bar posts (shared grammar). */
interface CreateTaskBody {
  title: string
  tagIds: number[]
  projectId: number | null
  estimateMs: number | null
  due: string | null
  deadline: string | null
  priority: 'none' | 'low' | 'medium' | 'high'
  repeatCfgId: number | null
}

export function PlanTomorrow({ today, tasks, tagNames, onAdded }: PlanTomorrowProps) {
  const [input, setInput] = useState('')
  const tomorrow =
    today !== null
      ? new Date(Date.parse(`${today}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10)
      : null

  const parsed = useMemo(
    () =>
      today !== null && input.trim().length > 0
        ? parseShortSyntax(input, `${today}T12:00:00.000Z`)
        : null,
    [input, today],
  )

  const planned = today !== null ? tomorrowsTasks(tasks, today) : []

  const add = useMutation({
    mutationFn: async () => {
      if (!parsed || !tomorrow) return
      // #tag +project names are created on submit (SP behavior, S3-20).
      const tagIds: number[] = []
      for (const name of parsed.tags) {
        const created = await apiSend<{ tag: { id: number } }>('/api/tasks-tags', 'POST', { name })
        tagIds.push(created.tag.id)
      }
      let projectId: number | null = null
      if (parsed.project) {
        const created = await apiSend<{ project: { id: number } }>('/api/tasks-projects', 'POST', {
          title: parsed.project,
        })
        projectId = created.project.id
      }
      // The panel's whole point: due = tomorrow, regardless of any @due typed.
      const body: CreateTaskBody = {
        title: parsed.title.trim(),
        tagIds,
        projectId,
        estimateMs: parsed.estimateMs,
        due: tomorrow,
        deadline: parsed.deadline?.day ?? null,
        priority: parsed.priority ?? 'none',
        repeatCfgId: null,
      }
      return apiSend('/api/tasks', 'POST', body)
    },
    onSuccess: () => {
      setInput('')
      onAdded()
    },
  })

  const moveToToday = useMutation({
    mutationFn: (id: number) => apiSend(`/api/tasks/${id}`, 'PATCH', { due: today }),
    onSuccess: onAdded,
  })

  return (
    <div className="panel space-y-3">
      <p className="label flex items-center gap-2">
        <CalendarPlus className="h-4 w-4 text-indigo-400" /> Plan for tomorrow
        {tomorrow !== null && <span className="text-tertiary">· {tomorrow}</span>}
      </p>

      <div className="flex items-end gap-2">
        <TextField
          label="Task for tomorrow"
          className="flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Review PRs #work 30m p2"
          hint="Lands due tomorrow — the short-syntax fields still apply."
          disabled={tomorrow === null || add.isPending}
        />
        <Button
          className="min-h-[44px]"
          disabled={
            tomorrow === null ||
            add.isPending ||
            parsed === null ||
            parsed.title.trim().length === 0
          }
          onClick={() => add.mutate()}
        >
          Plan
        </Button>
      </div>
      {parsed !== null && parsed.title.trim().length > 0 && (
        <p className="text-xs text-tertiary" aria-live="polite">
          {parsed.title.trim()}
          {parsed.estimateMs !== null ? ` · ${Math.round(parsed.estimateMs / 60_000)}m` : ''}
          {parsed.priority !== null && parsed.priority !== 'none' ? ` · ${parsed.priority}` : ''}
        </p>
      )}
      {add.isError && (
        <p className="text-xs text-danger-text" role="alert">
          {add.error instanceof Error ? add.error.message : 'Could not plan the task — try again.'}
        </p>
      )}

      {planned.length === 0 ? (
        <p className="text-xs text-tertiary">
          Nothing planned for tomorrow yet — tomorrow stays calm by default.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 text-sm dark:divide-(--hub-border)">
          {planned.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate text-neutral-700 dark:text-neutral-200">
                {t.title}
                {t.tagIds.length > 0 && (
                  <span className="ml-2 text-xs text-tertiary">
                    {t.tagIds.map((id) => `#${tagNames.get(id) ?? id}`).join(' ')}
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                className="px-2 py-1 text-xs"
                disabled={moveToToday.isPending}
                onClick={() => moveToToday.mutate(t.id)}
                aria-label={`Move ${t.title} back to today`}
              >
                <ChevronLeft className="size-3.5" aria-hidden /> Today
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default PlanTomorrow
