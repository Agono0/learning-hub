'use client'

/**
 * Boards (S3-24) — Kanban + Eisenhower built-ins + custom rule views.
 *
 * The engine is pure core (`@learning-hub/core/boards`): every column owns a
 * RULE CHIP (filter + apply), dragging a card into a column APPLIES that
 * chip's patch through `applyChip` and PATCHes the task (`/api/tasks/[id]`,
 * S3-16) — so moving a card and editing fields can never drift apart. Touch
 * fallback: each card also carries a "Move to" select (44px target) because
 * HTML5 drag is unreliable on touch — S3-82/S3-84 refine the interactions.
 *
 * Data: tasks come from `/api/tasks?includeDone=1&includeWontdo=1` (done +
 * won't-do included so chips that explicitly match them can show them);
 * built-in views are factories (no rows); custom views persist device-local
 * (`@/lib/board-views` — see its header for why not the task_views table).
 *
 * Honest empty states: no tasks at all renders the empty state; tasks no
 * column claims appear in a visible "Not on this board" row instead of
 * silently vanishing. SSR renders the loading skeleton (data + `today` are
 * client-only, so markup matches hydration).
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Columns3, GripVertical, Plus, Trash2 } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, Button, EmptyState, PageHeader, Tabs } from '@/ui'
import { ClayIn } from '@/lib/motion'
import {
  buildBoard,
  eisenhowerBoardView,
  kanbanBoardView,
  applyChip,
  type BoardRuleChip,
  type BoardView,
} from '@learning-hub/core/boards'
import { priorityBadge, type TaskItem } from '@learning-hub/core/tasks'
import {
  loadBoardViews,
  putBoardView,
  removeBoardView,
  type StoredBoardView,
} from '@/lib/board-views'

/** Local calendar day key (client-only — set after mount, SSR-safe). */
function localToday(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

type BuiltinKey = 'kanban' | 'eisenhower'

/** Preset rule chips for building custom views (label + the full chip). */
const PRESET_CHIPS: Array<{ preset: string; chip: BoardRuleChip }> = [
  {
    preset: 'High priority',
    chip: {
      id: 'preset:high',
      label: 'High',
      filter: { isDone: false, priority: ['high'] },
      apply: { priority: 'high' },
    },
  },
  {
    preset: 'Medium priority',
    chip: {
      id: 'preset:medium',
      label: 'Medium',
      filter: { isDone: false, priority: ['medium'] },
      apply: { priority: 'medium' },
    },
  },
  {
    preset: 'Overdue',
    chip: {
      id: 'preset:overdue',
      label: 'Overdue',
      filter: { isDone: false, overdue: true },
      apply: { dueInDays: 0 },
    },
  },
  {
    preset: 'Due this week',
    chip: {
      id: 'preset:week',
      label: 'Due soon',
      filter: { isDone: false, hasDue: true },
      apply: { dueInDays: 7 },
    },
  },
  {
    preset: 'Someday (no due)',
    chip: {
      id: 'preset:someday',
      label: 'Someday',
      filter: { isDone: false, hasDue: false },
      apply: { clearDue: true },
    },
  },
  {
    preset: 'Done',
    chip: {
      id: 'preset:done',
      label: 'Done',
      filter: { isDone: true },
      apply: { isDone: true },
    },
  },
]

/** A compact task card body (title + honest badges; overdue reads as danger). */
function TaskCard({ task, today }: { task: TaskItem; today: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-(--hub-border) dark:bg-(--hub-panel)">
      <p className="text-sm font-medium text-strong">{task.title}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{priorityBadge(task.priority)}</Badge>
        {task.due ? (
          <Badge tone={today !== '' && task.due.slice(0, 10) < today ? 'danger' : 'neutral'}>
            {task.dueWithTime ? task.due.replace('T', ' ') : task.due}
          </Badge>
        ) : null}
        {task.deadline ? <Badge tone="warning">deadline {task.deadline}</Badge> : null}
      </div>
    </div>
  )
}

export default function BoardsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<BuiltinKey | 'custom'>('kanban')
  const [customViews, setCustomViews] = useState<StoredBoardView[]>([])
  const [selectedCustom, setSelectedCustom] = useState<string>('')
  const [today, setToday] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftChips, setDraftChips] = useState<BoardRuleChip[]>([])
  const [dragOver, setDragOver] = useState<string | null>(null)
  // S3-84 keyboard quadrant nav (Eisenhower): the focused quadrant and the
  // task currently "carried" by the keyboard (pick with X/Enter, drop with
  // Enter, cancel with Escape — a full keyboard alternative to dragging).
  const [quadrantCursor, setQuadrantCursor] = useState<string | null>(null)
  const [held, setHeld] = useState<TaskItem | null>(null)

  // The cursor only means something on the Eisenhower grid.
  useEffect(() => {
    if (tab !== 'eisenhower') {
      setQuadrantCursor(null)
      setHeld(null)
    }
  }, [tab])

  useEffect(() => {
    setToday(localToday())
    setCustomViews(loadBoardViews())
  }, [])

  const tasksQuery = useQuery<{ tasks: TaskItem[] }>({
    queryKey: ['tasks', 'boards'],
    queryFn: () =>
      apiGet<{ tasks: TaskItem[] }>('/api/tasks', {
        includeDone: '1',
        includeWontdo: '1',
        limit: 500,
      }),
  })

  const view: BoardView | null = useMemo(() => {
    if (today === '') return null
    if (tab === 'kanban') return kanbanBoardView()
    if (tab === 'eisenhower') return eisenhowerBoardView()
    const custom = customViews.find((v) => v.id === selectedCustom) ?? customViews[0]
    return custom ?? null
  }, [tab, today, customViews, selectedCustom])

  const board = useMemo(() => {
    if (!view || !tasksQuery.data) return null
    return buildBoard(view, tasksQuery.data.tasks, today)
  }, [view, tasksQuery.data, today])

  /** Apply a chip and PATCH the row — optimistic core patch first. */
  const applyMove = useMutation({
    mutationFn: async ({ task, chip }: { task: TaskItem; chip: BoardRuleChip }) => {
      const patched = applyChip(task, chip, today)
      await apiSend(`/api/tasks/${task.id}`, 'PATCH', {
        priority: patched.priority,
        isDone: patched.isDone,
        due: patched.due,
        deadline: patched.deadline,
      })
      return patched
    },
    onSuccess: (patched) => {
      qc.setQueryData<{ tasks: TaskItem[] }>(['tasks', 'boards'], (old) =>
        old ? { tasks: old.tasks.map((t) => (t.id === patched.id ? patched : t)) } : old,
      )
    },
  })

  const saveCustomView = () => {
    const name = draftName.trim()
    if (name.length === 0 || draftChips.length === 0) return
    const id = `custom-${Date.now().toString(36)}`
    setCustomViews(
      putBoardView({
        id,
        name,
        columns: draftChips.map((chip, i) => ({ id: `${id}-c${i}`, label: chip.label, chip })),
      }),
    )
    setSelectedCustom(id)
    setTab('custom')
    setDraftName('')
    setDraftChips([])
  }

  const tasks = tasksQuery.data?.tasks ?? []

  /**
   * S3-84 — keyboard quadrant navigation over the Eisenhower grid (2×2,
   * columns ordered q1 q2 / q3 q4): arrows walk the grid, X/Enter picks up
   * the first task of the focused quadrant (or drops the held one), Escape
   * cancels. The per-column select remains the pointer-free path for
   * kanban/custom boards; the drag remains the pointer path here.
   */
  const onBoardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (tab !== 'eisenhower' || !board) return
    const columns = board.columns.map((c) => c.column)
    const idx = quadrantCursor === null ? -1 : columns.findIndex((c) => c.id === quadrantCursor)
    const move = (): void => {
      const base = idx < 0 ? 0 : idx
      // q1(0) q2(1) / q3(2) q4(3): left/right flip the low bit, up/down ±2.
      let next = base
      if (e.key === 'ArrowRight') next = base % 2 === 0 ? base + 1 : base - 1
      else if (e.key === 'ArrowLeft') next = base % 2 === 0 ? base + 1 : base - 1
      else if (e.key === 'ArrowDown') next = base < 2 ? base + 2 : base - 2
      else if (e.key === 'ArrowUp') next = base < 2 ? base + 2 : base - 2
      else return
      e.preventDefault()
      setQuadrantCursor(columns[Math.max(0, Math.min(columns.length - 1, next))]?.id ?? null)
    }
    if (e.key.startsWith('Arrow')) {
      move()
      return
    }
    if (e.key === 'Escape') {
      if (held) {
        e.preventDefault()
        setHeld(null)
      }
      return
    }
    if (e.key === 'x' || e.key === 'X' || e.key === 'Enter') {
      const targetId = columns[Math.max(0, idx)]?.id
      if (!targetId) return
      e.preventDefault()
      const bucket = board.columns.find((c) => c.column.id === targetId)
      if (!bucket) return
      if (held) {
        applyMove.mutate({ task: held, chip: bucket.column.chip })
        setHeld(null)
      } else if (bucket.tasks.length > 0) {
        setHeld(bucket.tasks[0])
      }
    }
  }

  return (
    <div className="space-y-6">
      <ClayIn>
        <PageHeader
          icon={<Columns3 className="h-6 w-6 text-indigo-400" />}
          title="Boards"
          subtitle="Drag a card into a column — the column's rule chip is applied to the task"
        />
      </ClayIn>

      <Tabs<BuiltinKey | 'custom'>
        label="Board view"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'kanban', label: 'Kanban' },
          { key: 'eisenhower', label: 'Eisenhower' },
          {
            key: 'custom',
            label: `Custom${customViews.length > 0 ? ` (${customViews.length})` : ''}`,
          },
        ]}
      />

      {tab === 'custom' && customViews.length > 0 ? (
        <div className="scroll-x flex items-center gap-2">
          {customViews.map((v) => (
            <Button
              key={v.id}
              variant={v.id === (selectedCustom || customViews[0]?.id) ? 'primary' : 'ghost'}
              onClick={() => setSelectedCustom(v.id)}
            >
              {v.name}
            </Button>
          ))}
          <Button
            variant="ghost"
            onClick={() => {
              setCustomViews(removeBoardView(selectedCustom || customViews[0]?.id))
              setSelectedCustom('')
            }}
            aria-label="Delete this custom view"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ) : null}

      {tasks.length === 0 && !tasksQuery.isLoading ? (
        <EmptyState icon={<Columns3 className="h-8 w-8" aria-hidden />} title="No tasks yet">
          Boards organize your tasks — add a few in Today, then drag them across columns to
          prioritize.
        </EmptyState>
      ) : board && view ? (
        <div
          className="scroll-x -mx-4 flex gap-3 px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-3 xl:grid-cols-5"
          onKeyDown={onBoardKeyDown}
        >
          {tab === 'eisenhower' ? (
            <p className="sr-only" aria-live="polite">
              {held
                ? `Carrying “${held.title}” — arrow keys move, Enter drops, Escape cancels.`
                : 'Arrow keys move between quadrants, X picks up the first task, Enter drops it, Escape cancels.'}
            </p>
          ) : null}
          {board.columns.map(({ column, tasks: colTasks }) => {
            const focused = tab === 'eisenhower' && quadrantCursor === column.id
            return (
              <section
                key={column.id}
                tabIndex={0}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(column.id)
                }}
                onDragLeave={() => setDragOver((cur) => (cur === column.id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(null)
                  const id = Number(e.dataTransfer.getData('text/plain'))
                  const task = tasks.find((t) => t.id === id)
                  if (task && !applyMove.isPending) applyMove.mutate({ task, chip: column.chip })
                }}
                className={`flex min-w-[240px] flex-1 flex-col gap-2 rounded-2xl border p-3 transition-opacity focus-visible:ring-2 focus-visible:ring-(--ac-strong) focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg) ${
                  dragOver === column.id ? 'opacity-80' : 'opacity-100'
                } ${
                  focused
                    ? 'border-indigo-500 dark:border-indigo-400'
                    : 'border-neutral-200 dark:border-(--hub-border)'
                } bg-neutral-50 dark:bg-(--hub-panel)`}
                aria-label={`${column.label} column, ${colTasks.length} task${colTasks.length === 1 ? '' : 's'}${focused ? ', focused' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-strong">{column.label}</h2>
                  <Badge tone="neutral">{colTasks.length}</Badge>
                </div>
                <p className="rounded-lg bg-white/60 px-2 py-1 text-[11px] leading-snug text-tertiary dark:bg-black/20">
                  chip: {column.chip.label}
                </p>
                <div role="list" className="flex flex-col gap-2">
                  {colTasks.map((task) => (
                    <div key={task.id} role="listitem" className="flex items-start gap-1">
                      <span className="mt-3 text-tertiary" aria-hidden>
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <div
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', String(task.id))}
                        tabIndex={0}
                        aria-label={`${task.title} — drag to a column, or use the Move select below`}
                        className={`min-w-0 flex-1 cursor-grab rounded-xl focus-visible:ring-2 focus-visible:ring-(--ac-strong) focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg) ${
                          held?.id === task.id ? 'opacity-60' : ''
                        }`}
                      >
                        <TaskCard task={task} today={today} />
                      </div>
                    </div>
                  ))}
                </div>
                {colTasks.length === 0 ? (
                  <p className="py-3 text-center text-xs text-tertiary">Drop tasks here</p>
                ) : null}
                <select
                  aria-label={`Move a task to ${column.label}`}
                  value=""
                  onChange={(e) => {
                    const task = tasks.find((t) => t.id === Number(e.target.value))
                    if (task && !applyMove.isPending) applyMove.mutate({ task, chip: column.chip })
                  }}
                  className="mt-auto min-h-[44px] rounded-lg border border-neutral-200 bg-white px-2 text-xs dark:border-(--hub-border) dark:bg-(--hub-panel)"
                >
                  <option value="">Move a task here…</option>
                  {tasks
                    .filter((t) => !colTasks.some((c) => c.id === t.id))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                </select>
              </section>
            )
          })}
          {board.unmatched.length > 0 ? (
            <section className="min-w-[240px] flex-1 rounded-2xl border border-dashed border-neutral-300 p-3 dark:border-(--hub-border)">
              <h2 className="text-sm font-semibold text-secondary">
                Not on this board ({board.unmatched.length})
              </h2>
              <p className="mt-1 text-xs text-tertiary">
                No column&apos;s rule matches these — drag from here isn&apos;t available; they live
                in Today.
              </p>
              <div className="mt-2 space-y-2">
                {board.unmatched.slice(0, 10).map((task) => (
                  <TaskCard key={task.id} task={task} today={today} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : tab === 'custom' ? (
        <EmptyState icon={<Columns3 className="h-8 w-8" aria-hidden />} title="No custom views yet">
          Build one below: pick rule chips as columns, name it, save. Dragging applies the chips.
        </EmptyState>
      ) : null}

      {tab === 'custom' ? (
        <section className="panel space-y-3" aria-label="Build a custom board view">
          <h2 className="text-sm font-semibold text-strong">Build a custom view</h2>
          <p className="text-xs text-tertiary">
            Tap chips to add them as columns (in order) — dropping a task onto a column applies its
            rule.
          </p>
          <div className="scroll-x flex gap-2 pb-1">
            {PRESET_CHIPS.map(({ preset, chip }) => (
              <Button
                key={chip.id}
                variant="secondary"
                onClick={() => setDraftChips((chips) => [...chips, chip])}
              >
                <Plus className="h-4 w-4" aria-hidden /> {preset}
              </Button>
            ))}
          </div>
          {draftChips.length > 0 ? (
            <p className="text-xs text-secondary">
              Columns: {draftChips.map((c) => c.label).join(' → ')}{' '}
              <button
                type="button"
                className="text-tertiary underline"
                onClick={() => setDraftChips((chips) => chips.slice(0, -1))}
              >
                undo last
              </button>
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-xs text-tertiary">View name</span>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Exam sprint"
                maxLength={80}
                className="min-h-[44px] w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm dark:border-(--hub-border) dark:bg-(--hub-panel)"
              />
            </label>
            <Button
              onClick={saveCustomView}
              disabled={draftChips.length === 0 || draftName.trim().length === 0}
            >
              Save view
            </Button>
          </div>
        </section>
      ) : null}

      {applyMove.isError ? (
        <p role="alert" className="text-sm text-secondary">
          That move didn&apos;t stick — try again.
        </p>
      ) : null}
    </div>
  )
}
