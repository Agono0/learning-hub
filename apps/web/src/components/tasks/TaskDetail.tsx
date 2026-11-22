'use client'

/**
 * TaskDetail (S3-21) — the full task panel behind a row click.
 *
 * One Sheet, five surfaces, every write through the S3-16..S3-19 routes:
 * - FIELDS: title/notes/priority/estimate/due(+timed)/deadline/project,
 *   saved with PATCH (the one Save button — one primary action).
 * - TAGS: chip toggles rewriting the whole set via PUT /api/tasks/[id]/tags.
 * - SUBTASKS: the one-nesting-level checklist (S3-04) — complete toggles
 *   and an inline add input (POST with parentId).
 * - REMINDERS: at_time (datetime) or relative (minutes from due), Android
 *   exact-alarm flag (S3-08), delete.
 * - ATTACHMENTS: file/URL/command rows (S3-37's bookmarks land here).
 * Duplicate/Delete stay in the footer. SSR-safe: all reads are react-query
 * (pending → skeleton), no clock reads at render.
 */
import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, Link2, ListPlus, Trash2 } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, Button, IconButton, SelectField, Sheet, Skeleton, TextArea, TextField } from '@/ui'

export interface TaskDetailTask {
  id: number
  title: string
  notes: string | null
  priority: 'none' | 'low' | 'medium' | 'high'
  estimateMs: number | null
  due: string | null
  dueWithTime: boolean
  deadline: string | null
  projectId: number | null
  tagIds: number[]
}

interface DetailTaskResponse {
  task: TaskDetailTask
}
interface SubtasksResponse {
  tasks: TaskDetailTask[]
}
interface RemindersResponse {
  reminders: Array<{
    id: number
    taskId: number
    type: 'at_time' | 'relative'
    remindAt: string | null
    offsetMs: number | null
    exactAlarm: boolean
  }>
}
interface AttachmentsResponse {
  attachments: Array<{
    id: number
    taskId: number
    type: 'file' | 'url' | 'command'
    value: string
    title: string | null
  }>
}
interface TagsResponse {
  tags: Array<{ id: number; name: string }>
}
interface ProjectsResponse {
  projects: Array<{ id: number; title: string }>
}

export interface TaskDetailProps {
  taskId: number
  open: boolean
  onClose: () => void
  /** Fired after any mutation — the page invalidates its list queries. */
  onChanged?: () => void
  onDeleted?: () => void
}

/** Core priority → label (SP ladder: p1 = high). */
const PRIORITY_OPTIONS: Array<{ value: TaskDetailTask['priority']; label: string }> = [
  { value: 'none', label: 'No priority' },
  { value: 'high', label: 'p1 — high' },
  { value: 'medium', label: 'p2 — medium' },
  { value: 'low', label: 'p3 — low' },
]

/** Editable copy of the task fields; null until loaded. */
type Draft = Omit<TaskDetailTask, 'estimateMs'> & { estimateMinutes: string }

function toDraft(task: TaskDetailTask): Draft {
  return {
    ...task,
    estimateMinutes: task.estimateMs !== null ? String(Math.round(task.estimateMs / 60_000)) : '',
  }
}

export function TaskDetail({ taskId, open, onClose, onChanged, onDeleted }: TaskDetailProps) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [reminderKind, setReminderKind] = useState<'at_time' | 'relative'>('at_time')
  const [reminderAt, setReminderAt] = useState('')
  const [reminderOffset, setReminderOffset] = useState('')
  const [attachmentType, setAttachmentType] = useState<'file' | 'url' | 'command'>('url')
  const [attachmentValue, setAttachmentValue] = useState('')

  const taskQ = useQuery({
    queryKey: ['tasks', 'detail', taskId],
    queryFn: () => apiGet<DetailTaskResponse>(`/api/tasks/${taskId}`),
    enabled: open,
  })
  const subtasksQ = useQuery({
    queryKey: ['tasks', 'subtasks', taskId],
    queryFn: () => apiGet<SubtasksResponse>(`/api/tasks?parentId=${taskId}&includeDone=1`),
    enabled: open,
  })
  const remindersQ = useQuery({
    queryKey: ['tasks-reminders', taskId],
    queryFn: () => apiGet<RemindersResponse>(`/api/tasks-reminders?taskId=${taskId}`),
    enabled: open,
  })
  const attachmentsQ = useQuery({
    queryKey: ['tasks-attachments', taskId],
    queryFn: () => apiGet<AttachmentsResponse>(`/api/tasks/${taskId}/attachments`),
    enabled: open,
  })
  const tagsQ = useQuery({
    queryKey: ['tasks-tags'],
    queryFn: () => apiGet<TagsResponse>('/api/tasks-tags'),
    enabled: open,
  })
  const projectsQ = useQuery({
    queryKey: ['tasks-projects'],
    queryFn: () => apiGet<ProjectsResponse>('/api/tasks-projects'),
    enabled: open,
  })

  // Reload the draft when a different task opens (client data only).
  useEffect(() => {
    if (taskQ.data?.task) setDraft(toDraft(taskQ.data.task))
  }, [taskQ.data])

  function invalidate(): void {
    void qc.invalidateQueries({ queryKey: ['tasks'] })
    void qc.invalidateQueries({ queryKey: ['tasks-reminders', taskId] })
    void qc.invalidateQueries({ queryKey: ['tasks-attachments', taskId] })
    onChanged?.()
  }

  const saveM = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiSend(`/api/tasks/${taskId}`, 'PATCH', body),
    onSuccess: () => {
      setSaveError(null)
      invalidate()
    },
    onError: (e) => setSaveError(e instanceof Error ? e.message : 'Could not save the task'),
  })

  const tagM = useMutation({
    mutationFn: (tagIds: number[]) => apiSend(`/api/tasks/${taskId}/tags`, 'PUT', { tagIds }),
    onSuccess: invalidate,
    onError: (e) => setSaveError(e instanceof Error ? e.message : 'Could not update the tags'),
  })

  const subtaskM = useMutation({
    mutationFn: (title: string) => apiSend('/api/tasks', 'POST', { title, parentId: taskId }),
    onSuccess: () => {
      setSubtaskTitle('')
      invalidate()
    },
    onError: (e) => setSaveError(e instanceof Error ? e.message : 'Could not add the subtask'),
  })

  const subtaskDoneM = useMutation({
    mutationFn: (id: number) => apiSend(`/api/tasks/${id}/complete`, 'POST'),
    onSuccess: invalidate,
    onError: (e) => setSaveError(e instanceof Error ? e.message : 'Could not complete the subtask'),
  })

  const reminderM = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiSend('/api/tasks-reminders', 'POST', body),
    onSuccess: invalidate,
    onError: (e) => setSaveError(e instanceof Error ? e.message : 'Could not add the reminder'),
  })

  const reminderDeleteM = useMutation({
    mutationFn: (id: number) => apiSend(`/api/tasks-reminders/${id}`, 'DELETE'),
    onSuccess: invalidate,
    onError: (e) => setSaveError(e instanceof Error ? e.message : 'Could not remove the reminder'),
  })

  const attachmentM = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiSend(`/api/tasks/${taskId}/attachments`, 'POST', body),
    onSuccess: () => {
      setAttachmentValue('')
      invalidate()
    },
    onError: (e) => setSaveError(e instanceof Error ? e.message : 'Could not attach'),
  })

  const attachmentDeleteM = useMutation({
    mutationFn: (id: number) => apiSend(`/api/tasks-attachments/${id}`, 'DELETE'),
    onSuccess: invalidate,
    onError: (e) =>
      setSaveError(e instanceof Error ? e.message : 'Could not remove the attachment'),
  })

  const duplicateM = useMutation({
    mutationFn: () => apiSend(`/api/tasks/${taskId}/duplicate`, 'POST'),
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: (e) => setSaveError(e instanceof Error ? e.message : 'Could not duplicate the task'),
  })

  const deleteM = useMutation({
    mutationFn: () => apiSend(`/api/tasks/${taskId}?via=context-menu`, 'DELETE'),
    onSuccess: () => {
      invalidate()
      onDeleted?.()
      onClose()
    },
    onError: (e) => setSaveError(e instanceof Error ? e.message : 'Could not delete the task'),
  })

  function save(): void {
    if (!draft) return
    const estimateTrim = draft.estimateMinutes.trim()
    saveM.mutate({
      title: draft.title.trim(),
      notes: draft.notes,
      priority: draft.priority,
      estimateMs: estimateTrim === '' ? null : Number(estimateTrim) * 60_000,
      due: draft.due,
      dueWithTime: draft.dueWithTime,
      deadline: draft.deadline,
      projectId: draft.projectId,
    })
  }

  const loading = taskQ.isLoading

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={draft?.title ?? 'Task'}
      footer={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="min-h-[44px] flex-1"
            onClick={() => duplicateM.mutate()}
            disabled={loading}
          >
            Duplicate
          </Button>
          <Button
            variant="danger"
            className="min-h-[44px] flex-1"
            onClick={() => deleteM.mutate()}
            disabled={loading}
          >
            Delete
          </Button>
          <Button
            className="min-h-[44px] flex-1"
            onClick={save}
            loading={saveM.isPending}
            disabled={loading || draft === null}
          >
            Save
          </Button>
        </div>
      }
    >
      {loading || draft === null ? (
        <div className="flex flex-col gap-3" aria-hidden>
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {saveError !== null && (
            <p role="alert" className="text-sm text-danger-text">
              {saveError}
            </p>
          )}

          {/* ── Fields ── */}
          <div className="flex flex-col gap-3">
            <TextField
              label="Title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <TextArea
              label="Notes"
              value={draft.notes ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, notes: e.target.value === '' ? null : e.target.value })
              }
              placeholder="What does done look like?"
            />
            <div className="flex gap-3">
              <TextField
                label="Estimate (minutes)"
                className="flex-1"
                inputMode="numeric"
                value={draft.estimateMinutes}
                onChange={(e) => setDraft({ ...draft, estimateMinutes: e.target.value })}
                placeholder="30"
              />
              <TextField
                label="Due"
                className="flex-1"
                type="date"
                value={draft.due?.slice(0, 10) ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, due: e.target.value === '' ? null : e.target.value })
                }
              />
            </div>
            <div className="flex gap-3">
              <TextField
                label="Deadline"
                className="flex-1"
                type="date"
                value={draft.deadline ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, deadline: e.target.value === '' ? null : e.target.value })
                }
              />
              <TextField
                label="Due time"
                className="flex-1"
                type="time"
                disabled={!draft.dueWithTime}
                value={draft.dueWithTime && draft.due?.includes('T') ? draft.due.slice(11, 16) : ''}
                onChange={(e) => {
                  const day = draft.due?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
                  const time = e.target.value === '' ? '00:00' : e.target.value
                  setDraft({ ...draft, due: `${day}T${time}:00.000Z` })
                }}
              />
            </div>
            <div className="flex gap-3">
              <SelectField
                label="Priority"
                className="flex-1"
                value={draft.priority}
                onChange={(e) =>
                  setDraft({ ...draft, priority: e.target.value as TaskDetailTask['priority'] })
                }
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Project"
                className="flex-1"
                value={draft.projectId === null ? '' : String(draft.projectId)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    projectId: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              >
                <option value="">Inbox</option>
                {(projectsQ.data?.projects ?? []).map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.title}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>

          {/* ── Tags ── */}
          <div>
            <p className="mb-1.5 text-sm font-medium">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {(tagsQ.data?.tags ?? []).map((t) => {
                const on = draft.tagIds.includes(t.id)
                return (
                  <Button
                    key={t.id}
                    variant={on ? 'secondary' : 'ghost'}
                    aria-pressed={on}
                    className="min-h-[44px] rounded-full px-3"
                    onClick={() =>
                      tagM.mutate(
                        on ? draft.tagIds.filter((id) => id !== t.id) : [...draft.tagIds, t.id],
                      )
                    }
                  >
                    {t.name}
                  </Button>
                )
              })}
              {(tagsQ.data?.tags.length ?? 0) === 0 && (
                <span className="text-sm text-tertiary">
                  No tags yet — add some from the list page.
                </span>
              )}
            </div>
          </div>

          {/* ── Subtasks ── */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <ListPlus className="size-4" aria-hidden />
              Subtasks
            </p>
            <ul className="mb-2 flex flex-col gap-1">
              {(subtasksQ.data?.tasks ?? []).map((sub) => (
                <li key={sub.id} className="flex items-center gap-2 text-sm">
                  <IconButton
                    label={`Mark “${sub.title}” done`}
                    size="sm"
                    onClick={() => subtaskDoneM.mutate(sub.id)}
                    className="text-status-success-text"
                  >
                    <Check className="size-4" aria-hidden />
                  </IconButton>
                  <span className="min-w-0 flex-1 truncate">{sub.title}</span>
                </li>
              ))}
              {(subtasksQ.data?.tasks.length ?? 0) === 0 && (
                <li className="text-sm text-tertiary">No subtasks yet.</li>
              )}
            </ul>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (subtaskTitle.trim().length > 0) subtaskM.mutate(subtaskTitle.trim())
              }}
            >
              <TextField
                label="Add subtask"
                className="flex-1"
                value={subtaskTitle}
                onChange={(e) => setSubtaskTitle(e.target.value)}
                placeholder="First step"
              />
              <Button
                type="submit"
                variant="secondary"
                className="min-h-[44px]"
                disabled={subtaskTitle.trim().length === 0 || subtaskM.isPending}
                loading={subtaskM.isPending}
              >
                Add
              </Button>
            </form>
          </div>

          {/* ── Reminders ── */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <Bell className="size-4" aria-hidden />
              Reminders
            </p>
            <ul className="mb-2 flex flex-col gap-1">
              {(remindersQ.data?.reminders ?? []).map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm">
                  <Badge tone="neutral">
                    {r.type === 'at_time'
                      ? (r.remindAt ?? '').slice(0, 16).replace('T', ' ')
                      : `${Math.round(Math.abs(r.offsetMs ?? 0) / 60_000)} min ${r.offsetMs !== null && r.offsetMs < 0 ? 'before' : 'after'} due`}
                  </Badge>
                  {r.exactAlarm && <Badge tone="accent">exact alarm</Badge>}
                  <span className="min-w-0 flex-1" />
                  <IconButton
                    label="Remove reminder"
                    size="sm"
                    onClick={() => reminderDeleteM.mutate(r.id)}
                    className="text-danger-text"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </IconButton>
                </li>
              ))}
              {(remindersQ.data?.reminders.length ?? 0) === 0 && (
                <li className="text-sm text-tertiary">No reminders yet.</li>
              )}
            </ul>
            <div className="flex flex-wrap items-end gap-2">
              <Button
                variant={reminderKind === 'at_time' ? 'secondary' : 'ghost'}
                onClick={() => setReminderKind('at_time')}
                aria-pressed={reminderKind === 'at_time'}
                className="min-h-[44px]"
              >
                At time
              </Button>
              <Button
                variant={reminderKind === 'relative' ? 'secondary' : 'ghost'}
                onClick={() => setReminderKind('relative')}
                aria-pressed={reminderKind === 'relative'}
                className="min-h-[44px]"
              >
                Before due
              </Button>
              {reminderKind === 'at_time' ? (
                <TextField
                  label="Fire at"
                  type="datetime-local"
                  className="flex-1"
                  value={reminderAt}
                  onChange={(e) => setReminderAt(e.target.value)}
                />
              ) : (
                <TextField
                  label="Minutes before due"
                  className="flex-1"
                  inputMode="numeric"
                  value={reminderOffset}
                  onChange={(e) => setReminderOffset(e.target.value)}
                  placeholder="30"
                />
              )}
              <Button
                variant="secondary"
                className="min-h-[44px]"
                disabled={
                  (reminderKind === 'at_time' && reminderAt === '') ||
                  (reminderKind === 'relative' && reminderOffset.trim() === '') ||
                  reminderM.isPending
                }
                loading={reminderM.isPending}
                onClick={() =>
                  reminderM.mutate(
                    reminderKind === 'at_time'
                      ? {
                          taskId,
                          type: 'at_time',
                          remindAt: new Date(reminderAt).toISOString(),
                          exactAlarm: true,
                        }
                      : { taskId, type: 'relative', offsetMs: -Number(reminderOffset) * 60_000 },
                  )
                }
              >
                Add
              </Button>
            </div>
          </div>

          {/* ── Attachments ── */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <Link2 className="size-4" aria-hidden />
              Attachments
            </p>
            <ul className="mb-2 flex flex-col gap-1">
              {(attachmentsQ.data?.attachments ?? []).map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <Badge tone="neutral">{a.type}</Badge>
                  <span className="min-w-0 flex-1 truncate text-body">{a.title ?? a.value}</span>
                  <IconButton
                    label="Remove attachment"
                    size="sm"
                    onClick={() => attachmentDeleteM.mutate(a.id)}
                    className="text-danger-text"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </IconButton>
                </li>
              ))}
              {(attachmentsQ.data?.attachments.length ?? 0) === 0 && (
                <li className="text-sm text-tertiary">Nothing attached yet.</li>
              )}
            </ul>
            <div className="flex flex-wrap items-end gap-2">
              <TextField
                label="Value"
                className="flex-1"
                value={attachmentValue}
                onChange={(e) => setAttachmentValue(e.target.value)}
                placeholder="https://… or a file path"
              />
              <SelectField
                label="Type"
                value={attachmentType}
                onChange={(e) => setAttachmentType(e.target.value as 'file' | 'url' | 'command')}
              >
                <option value="url">URL</option>
                <option value="file">File</option>
                <option value="command">Command</option>
              </SelectField>
              <Button
                variant="secondary"
                className="min-h-[44px]"
                disabled={attachmentValue.trim().length === 0 || attachmentM.isPending}
                loading={attachmentM.isPending}
                onClick={() =>
                  attachmentM.mutate({ type: attachmentType, value: attachmentValue.trim() })
                }
              >
                Attach
              </Button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  )
}
