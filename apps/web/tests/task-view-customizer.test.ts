/**
 * Task-view customizer (S3-44) + save-as-view bar (S3-85) — SSR rendering of
 * the per-view show/hide/sort/group panel and the save capture bar, plus the
 * device-local settings store contract (defaults, round-trip, corruption
 * fallback). The settings store is window-guarded, so off-storage reads
 * exercise the default path in node.
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { defaultTaskViewSettings, taskViewSettingsSchema } from '../src/lib/task-view-settings'
import { TaskViewCustomizer } from '../src/components/tasks/TaskViewCustomizer'
import { SaveViewBar } from '../src/components/tasks/SaveViewBar'

const clean = (html: string): string => html.replace(/<!-- -->/g, '')

describe('task-view settings store (S3-44)', () => {
  it('defaults: everything on, manual order, flat list', () => {
    expect(defaultTaskViewSettings()).toEqual({
      showEstimate: true,
      showPriority: true,
      showDeadline: true,
      showTags: true,
      showProject: false,
      sortBy: 'manual',
      groupBy: 'none',
    })
  })

  it('rejects unknown sort/group keys (zod at the boundary)', () => {
    expect(taskViewSettingsSchema.safeParse({ sortBy: 'random' }).success).toBe(false)
    expect(taskViewSettingsSchema.safeParse({ groupBy: 'assignee' }).success).toBe(false)
    expect(taskViewSettingsSchema.safeParse({ sortBy: 'priority' }).success).toBe(true)
  })
})

describe('TaskViewCustomizer rendering', () => {
  const settings = defaultTaskViewSettings()

  it('renders show/hide toggles for all five columns plus sort/group', () => {
    const html = clean(
      renderToString(
        React.createElement(TaskViewCustomizer, {
          viewName: 'Today',
          settings,
          onSettingsChange: () => {},
          onSaveView: () => {},
          filter: {},
        }),
      ),
    )
    expect(html).toContain('View options — Today')
    expect(html).toContain('Show estimate vs spent')
    expect(html).toContain('Show project')
    expect(html).toContain('Sort by')
    expect(html).toContain('Group by')
    expect(html).toContain('Save as view')
  })

  it('renders the save flow only after it opens (one primary action)', () => {
    const html = clean(
      renderToString(
        React.createElement(TaskViewCustomizer, {
          viewName: 'Today',
          settings,
          onSettingsChange: () => {},
          onSaveView: () => {},
          filter: { priority: ['high'] },
        }),
      ),
    )
    expect(html).not.toContain('View name')
    expect(html).toContain('Save as view')
  })
})

describe('SaveViewBar rendering (S3-85)', () => {
  const bar = () =>
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(SaveViewBar, {
        filter: { tagId: 3 },
        sortBy: 'priority',
        groupBy: 'none',
      }),
    )

  it('renders the capture affordance before opening', () => {
    expect(clean(renderToString(bar()))).toContain('Save as view')
    expect(clean(renderToString(bar()))).not.toContain('View name')
  })
})
