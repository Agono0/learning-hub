/**
 * Per-task reminders dialog (S3-48) — offset label math, add-form
 * validation, and SSR of the closed/open dialog states. The wire paths
 * (POST/PATCH/DELETE over /api/tasks-reminders, settings PUT) are covered by
 * the handlers' own integration tests.
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  TaskRemindersDialog,
  offsetLabel,
  validateReminderForm,
} from '../src/components/tasks/TaskRemindersDialog'

const dialog = (open: boolean) =>
  renderToString(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(TaskRemindersDialog, {
        taskId: 7,
        taskTitle: 'Write docs',
        open,
        onClose: () => {},
      }),
    ),
  )

describe('offset labels', () => {
  it('names the preset offsets', () => {
    expect(offsetLabel(0)).toBe('At due time')
    expect(offsetLabel(-60 * 60_000)).toBe('1 hour before')
    expect(offsetLabel(-24 * 60 * 60_000)).toBe('1 day before')
    expect(offsetLabel(10 * 60_000)).toBe('10 min after')
  })

  it('labels arbitrary offsets by rounding', () => {
    expect(offsetLabel(-45 * 60_000)).toBe('45 min before')
    expect(offsetLabel(2 * 60 * 60_000)).toBe('2h after')
    expect(offsetLabel(90 * 60_000)).toBe('1h 30m after')
  })
})

describe('add-form validation', () => {
  it('at_time needs a parseable moment', () => {
    expect(validateReminderForm('at_time', '', 0)).toContain('Pick a date')
    expect(validateReminderForm('at_time', 'not-a-date', 0)).toContain('Pick a date')
    expect(validateReminderForm('at_time', '2026-11-23T09:00', 0)).toBe('')
  })

  it('relative needs an integer offset', () => {
    expect(validateReminderForm('relative', '', 0)).toBe('')
    expect(validateReminderForm('relative', '', Number.NaN)).toContain('Pick an offset')
    expect(validateReminderForm('relative', '', 1.5)).toContain('Pick an offset')
  })
})

describe('dialog rendering', () => {
  it('renders nothing while closed', () => {
    expect(dialog(false)).not.toContain('Reminders — Write docs')
  })

  it('renders the add surface and global policy section when open', () => {
    const html = dialog(true)
    expect(html).toContain('Reminders — Write docs')
    expect(html).toContain('At a specific time')
    expect(html).toContain('Relative to the due moment')
    expect(html).toContain('exact alarm')
    expect(html).toContain('Global reminder policy')
    expect(html).toContain('No reminders on this task yet.')
  })
})
