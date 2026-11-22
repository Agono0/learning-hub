'use client'

/**
 * AddTaskBar (S3-20) — the SP-parity quick capture input.
 *
 * One input, one grammar: the core short-syntax parser (S3-09) turns
 * `Buy milk #errands +home 10m @tom p1 !2026-12-01 @every 3d` into
 * structured fields. Live token suggestions come from `suggestAt` (tags,
 * projects, due/deadline words, priorities, repeat cadences, estimates);
 * unknown tag/project names are CREATED on submit (SP behavior), so
 * capture never blocks on setup. Parsed fields render as preview chips +
 * warnings — the user always sees what the input meant before it lands.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import {
  parseShortSyntax,
  suggestAt,
  type ShortSyntaxSuggestion,
  type ShortSyntaxTokenKind,
} from '@learning-hub/core'
import { apiSend } from '@/lib/transport'
import { Badge, Button, TextField } from '@/ui'

export interface TagRow {
  id: number
  name: string
  color: string | null
}
export interface ProjectRow {
  id: number
  title: string
  color: string | null
}

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

/** Due/deadline words the grammar understands (autocomplete + hint chip). */
const DATE_WORDS = ['today', 'tom', '+1', '+3', '+7'] as const
/** Repeat cadence args for `@every`. */
const REPEAT_ARGS = ['d', 'w', 'm', 'y', '2w', '3d'] as const
/** Priority tokens (p1 = high on SP's ladder). */
const PRIORITY_ARGS = ['p1', 'p2', 'p3'] as const

interface AddTaskBarProps {
  /** ISO day for date resolution (`today`/`tom`); null until the client clock effect ran (SSR-safe). */
  todayIso: string | null
  tags: TagRow[]
  projects: ProjectRow[]
  /** Called after a task was created — the page invalidates its queries. */
  onCreated: () => void
}

/** Suggestion options for one token kind, filtered by the typed query. */
function optionsFor(
  kind: ShortSyntaxTokenKind,
  query: string,
  tags: TagRow[],
  projects: ProjectRow[],
): string[] {
  const q = query.toLowerCase()
  switch (kind) {
    case 'due':
    case 'deadline':
      return DATE_WORDS.filter((w) => w.startsWith(q))
    case 'tag':
      return tags.filter((t) => t.name.toLowerCase().includes(q)).map((t) => t.name)
    case 'project':
      return projects.filter((p) => p.title.toLowerCase().includes(q)).map((p) => p.title)
    case 'repeat':
      return REPEAT_ARGS.filter((a) => a.startsWith(q))
    case 'priority':
      return PRIORITY_ARGS.filter((a) => a.startsWith(q))
    default:
      return []
  }
}

export function AddTaskBar({ todayIso, tags, projects, onCreated }: AddTaskBarProps) {
  const [input, setInput] = useState('')
  const [caret, setCaret] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const suggestion: ShortSyntaxSuggestion | null = todayIso ? suggestAt(input, caret) : null
  const suggestionOptions = useMemo(
    () =>
      suggestion && todayIso ? optionsFor(suggestion.kind, suggestion.query, tags, projects) : [],
    [suggestion, todayIso, tags, projects],
  )

  const parsed = useMemo(
    () =>
      todayIso && input.trim().length > 0
        ? parseShortSyntax(input, `${todayIso}T12:00:00.000Z`)
        : null,
    [input, todayIso],
  )

  useEffect(() => {
    setError(null)
  }, [input])

  /** Apply a suggestion: replace the trailing token text with the chosen option. */
  function applySuggestion(option: string): void {
    if (!suggestion) return
    const before = input.slice(0, caret)
    const after = input.slice(caret)
    const replaced = before.replace(
      /(?:^|\s)(\S+)$/,
      (m) => `${m.slice(0, m.length - m.trimEnd().length)}${suggestion.trigger}${option} `,
    )
    setInput(`${replaced}${after}`)
  }

  async function ensureTag(name: string): Promise<number> {
    const existing = tags.find((t) => t.name === name)
    if (existing) return existing.id
    const { tag } = await apiSend<{ tag: TagRow }>('/api/tasks-tags', 'POST', { name })
    return tag.id
  }

  async function ensureProject(title: string): Promise<number | null> {
    const existing = projects.find((p) => p.title === title)
    if (existing) return existing.id
    const { project } = await apiSend<{ project: ProjectRow }>('/api/tasks-projects', 'POST', {
      title,
    })
    return project.id
  }

  async function ensureRepeat(
    repeat: { cycle: 'd' | 'w' | 'm' | 'y'; interval: number } | null,
  ): Promise<number | null> {
    if (!repeat || !todayIso) return null
    const { repeatCfg } = await apiSend<{ repeatCfg: { id: number } }>(
      '/api/tasks-repeat-cfgs',
      'POST',
      {
        cycle: repeat.cycle,
        interval: repeat.interval,
        startDate: todayIso,
        skipDates: [],
        reAnchor: 'completion',
      },
    )
    return repeatCfg.id
  }

  async function submit(): Promise<void> {
    if (!parsed || !todayIso || parsed.title.trim().length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const tagIds: number[] = []
      for (const name of parsed.tags) tagIds.push(await ensureTag(name))
      const projectId = parsed.project ? await ensureProject(parsed.project) : null
      const repeatCfgId = await ensureRepeat(parsed.repeat)
      const body: CreateTaskBody = {
        title: parsed.title.trim(),
        tagIds,
        projectId,
        estimateMs: parsed.estimateMs,
        due: parsed.due?.day ?? null,
        deadline: parsed.deadline?.day ?? null,
        priority: parsed.priority ?? 'none',
        repeatCfgId,
      }
      await apiSend('/api/tasks', 'POST', body)
      setInput('')
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the task — try again.')
    } finally {
      setBusy(false)
    }
  }

  const kindLabel: Record<ShortSyntaxTokenKind, string> = {
    text: 'Text',
    due: 'Due',
    tag: 'Tag',
    project: 'Project',
    estimate: 'Estimate',
    priority: 'Priority',
    deadline: 'Deadline',
    repeat: 'Repeat',
    quoted: 'Text',
    unknown: 'Token',
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <TextField
          label="Add a task"
          className="flex-1"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setCaret(e.target.selectionStart ?? e.target.value.length)
          }}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? input.length)}
          placeholder="Draft spec #work 1h @tom p1"
          hint="Short syntax: #tag +project 10m @today @every 3d p1 !2026-12-01"
          disabled={busy}
        />
        <Button
          type="submit"
          className="min-h-[44px]"
          disabled={busy || !parsed || parsed.title.trim().length === 0}
        >
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </form>

      {suggestion && suggestionOptions.length > 0 && (
        <div
          className="scroll-x -mx-1 flex gap-1.5 px-1"
          role="listbox"
          aria-label={`${kindLabel[suggestion.kind]} suggestions`}
        >
          {suggestionOptions.map((option) => (
            <Button
              key={option}
              variant="ghost"
              role="option"
              aria-selected={false}
              onClick={() => applySuggestion(option)}
              className="shrink-0 rounded-full border border-neutral-200 px-3 py-1.5 dark:border-(--hub-border)"
            >
              {option}
            </Button>
          ))}
        </div>
      )}

      {parsed && (
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{parsed.title.trim() || '…'}</Badge>
            {parsed.project && <Badge tone="neutral">+{parsed.project}</Badge>}
            {parsed.tags.map((t) => (
              <Badge key={t} tone="neutral">
                #{t}
              </Badge>
            ))}
            {parsed.due && <Badge tone="neutral">@{parsed.due.day}</Badge>}
            {parsed.deadline && <Badge tone="neutral">!{parsed.deadline.day}</Badge>}
            {parsed.estimateMs !== null && (
              <Badge tone="neutral">{Math.round(parsed.estimateMs / 60_000)}m</Badge>
            )}
            {parsed.priority && parsed.priority !== 'none' && (
              <Badge tone="neutral">{parsed.priority}</Badge>
            )}
            {parsed.repeat && (
              <Badge tone="neutral">
                @every {parsed.repeat.interval === 1 ? '' : parsed.repeat.interval}
                {parsed.repeat.cycle}
              </Badge>
            )}
          </div>
          {parsed.warnings.map((w) => (
            <p key={w} className="flex items-center gap-1 text-status-warning-text">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
              {w}
            </p>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  )
}
