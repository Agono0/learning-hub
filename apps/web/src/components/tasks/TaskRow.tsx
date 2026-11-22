'use client'

/**
 * TaskRow (S3-20) — one open task in the Today/Inbox list.
 *
 * Row anatomy: select checkbox (multi-select), complete button, title
 * (opens the detail panel), tag chips, due/deadline badges (overdue and
 * past-deadline in the danger hue, S3-63), subtask checklist progress
 * (`3/5`, S3-69), estimate-vs-tracked + priority indicators (S3-45),
 * reorder controls (touch-visible; HTML5 drag on fine pointers), and the
 * kebab CONTEXT MENU (S3-71): open details, duplicate, schedule to today,
 * archive, delete.
 */
import React from 'react'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  ListChecks,
  ListMinus,
  MoreVertical,
  Trash2,
} from 'lucide-react'
import { Badge, IconButton, Menu } from '@/ui'
import { cx } from '@/ui/cx'
import { DeadlineBadge, EstimateSpentBadge, PriorityBadge } from './TaskIndicators'

/** The task shape the S3-16 handler returns (core TaskItem over JSON). */
export type TaskRowTask = {
  id: number
  title: string
  priority: 'none' | 'low' | 'medium' | 'high'
  estimateMs: number | null
  timeSpentOnDay: Record<string, number>
  due: string | null
  deadline: string | null
  tagIds: number[]
  projectId: number | null
}

/** Checklist progress of this task's subtasks (S3-69; page-computed). */
export interface SubtaskProgress {
  done: number
  total: number
}

export interface TaskRowProps {
  task: TaskRowTask
  /** Tag id → display name (page-resolved from /api/tasks-tags). */
  tagNames: Map<number, string>
  selected: boolean
  /** Today's `YYYY-MM-DD` for tracked/overdue math (client clock). */
  today: string
  onToggleSelect: (id: number) => void
  onComplete: (id: number) => void
  onOpen: (id: number) => void
  onDuplicate: (id: number) => void
  onDelete: (id: number) => void
  onMove: (id: number, direction: -1 | 1) => void
  onDragStart: (id: number) => void
  onDropOnto: (targetId: number) => void
  dragging: boolean
  /** Present only for sectioned tasks — removes the section assignment. */
  onUnsection?: (id: number) => void
  /** S3-73: the keyboard cursor rests on this row (calm background tint). */
  cursor?: boolean
  /** S3-69: this task's subtask checklist progress (absent = no subtasks). */
  subtaskProgress?: SubtaskProgress
  /** S3-71 context-menu action: archive the task (young tier). */
  onArchive?: (id: number) => void
  /** S3-71 context-menu action: move the due date to today. */
  onScheduleToday?: (id: number) => void
}

/** Total tracked ms across days. */
function trackedTotal(task: TaskRowTask): number {
  return Object.values(task.timeSpentOnDay).reduce((a, b) => a + b, 0)
}

export function TaskRow({
  task,
  tagNames,
  selected,
  today,
  onToggleSelect,
  onComplete,
  onOpen,
  onDuplicate,
  onDelete,
  onMove,
  onDragStart,
  onDropOnto,
  dragging,
  onUnsection,
  subtaskProgress,
  onArchive,
  onScheduleToday,
  cursor,
}: TaskRowProps) {
  const overdue = task.due !== null && task.due.slice(0, 10) < today
  const tracked = trackedTotal(task)
  const hasTime = task.estimateMs !== null || tracked > 0

  const menuItems = [
    {
      label: 'Open details',
      icon: <ExternalLink className="size-3.5" aria-hidden />,
      onSelect: () => onOpen(task.id),
    },
    {
      label: 'Duplicate',
      icon: <Copy className="size-3.5" aria-hidden />,
      onSelect: () => onDuplicate(task.id),
    },
    ...(onScheduleToday !== undefined
      ? [
          {
            label: 'Schedule to today',
            icon: <CalendarClock className="size-3.5" aria-hidden />,
            onSelect: () => onScheduleToday(task.id),
          },
        ]
      : []),
    ...(onArchive !== undefined
      ? [
          {
            label: 'Archive',
            icon: <Archive className="size-3.5" aria-hidden />,
            onSelect: () => onArchive(task.id),
          },
        ]
      : []),
    {
      label: 'Delete',
      icon: <Trash2 className="size-3.5" aria-hidden />,
      onSelect: () => onDelete(task.id),
      danger: true,
    },
  ]

  return (
    <li
      draggable
      onDragStart={() => onDragStart(task.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDropOnto(task.id)}
      className={cx(
        'panel flex items-center gap-1 rounded-xl px-2 py-1.5',
        dragging && 'opacity-50',
        selected && 'ring-2 ring-(--ac-strong)',
        cursor && !selected && 'bg-neutral-100/70 dark:bg-(--hub-panel-2)',
      )}
    >
      <button
        type="button"
        onClick={() => onToggleSelect(task.id)}
        aria-pressed={selected}
        aria-label={selected ? `Deselect ${task.title}` : `Select ${task.title}`}
        className={cx(
          'flex size-11 shrink-0 items-center justify-center rounded-lg border transition-colors',
          selected
            ? 'border-(--ac-strong) bg-(--ac-strong) text-white'
            : 'border-neutral-300 dark:border-(--hub-border)',
        )}
      >
        {selected && <Check className="size-4" aria-hidden />}
      </button>

      <IconButton
        label={`Mark “${task.title}” done`}
        size="sm"
        onClick={() => onComplete(task.id)}
        className="shrink-0 text-status-success-text"
      >
        <Check className="size-4" aria-hidden />
      </IconButton>

      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="min-w-0 flex-1 rounded-lg px-1 py-2 text-left"
      >
        <span className="block truncate text-sm font-medium text-strong">{task.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1">
          {task.tagIds.map((id) => (
            <Badge key={id} tone="neutral">
              {tagNames.get(id) ?? `#${id}`}
            </Badge>
          ))}
          {subtaskProgress !== undefined && subtaskProgress.total > 0 && (
            <Badge tone={subtaskProgress.done === subtaskProgress.total ? 'success' : 'neutral'}>
              <ListChecks className="size-3" aria-hidden />
              {subtaskProgress.done}/{subtaskProgress.total}
            </Badge>
          )}
          {task.due !== null && (
            <Badge tone={overdue ? 'danger' : 'neutral'}>
              <CalendarClock className="size-3" aria-hidden />
              {overdue ? `Overdue · ${task.due.slice(0, 10)}` : task.due.slice(0, 10)}
            </Badge>
          )}
          {task.deadline !== null && <DeadlineBadge deadline={task.deadline} today={today} />}
          <PriorityBadge priority={task.priority} />
          {hasTime && <EstimateSpentBadge estimateMs={task.estimateMs} spentMs={tracked} />}
        </span>
      </button>

      <div className="flex shrink-0 flex-col">
        <IconButton label={`Move “${task.title}” up`} size="sm" onClick={() => onMove(task.id, -1)}>
          <ArrowUp className="size-3.5" aria-hidden />
        </IconButton>
        <IconButton
          label={`Move “${task.title}” down`}
          size="sm"
          onClick={() => onMove(task.id, 1)}
        >
          <ArrowDown className="size-3.5" aria-hidden />
        </IconButton>
      </div>

      {onUnsection !== undefined && (
        <IconButton
          label={`Remove “${task.title}” from its section`}
          size="sm"
          onClick={() => onUnsection(task.id)}
          className="text-tertiary"
        >
          <ListMinus className="size-3.5" aria-hidden />
        </IconButton>
      )}
      <Menu label={`Actions for “${task.title}”`} items={menuItems} className="shrink-0">
        <MoreVertical className="size-3.5" aria-hidden />
      </Menu>
    </li>
  )
}
