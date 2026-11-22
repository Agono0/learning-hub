'use client'

/**
 * Task-view customizer (S3-44) — the per-view show/hide/sort/group panel.
 * Controlled by the parent (which owns the settings + persistence via
 * `@/lib/task-view-settings`); "Save as view" hands the CURRENT settings
 * plus the parent's filter to {@link TaskViewCustomizerProps.onSaveView}
 * (the default wiring POSTs /api/tasks-views — S3-17's persisted rows).
 *
 * One primary action per state: the save flow opens on demand and is the
 * only prominent control; the toggles are quiet settings.
 */
import React, { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button, SelectField, TextField, Toggle } from '@/ui'
import type { TaskViewSettings } from '@/lib/task-view-settings'

/** The show/hide keys the panel renders (stable order for the rows). */
const SHOW_KEYS = [
  { key: 'showEstimate', label: 'Estimate vs spent' },
  { key: 'showPriority', label: 'Priority' },
  { key: 'showDeadline', label: 'Deadline' },
  { key: 'showTags', label: 'Tags' },
  { key: 'showProject', label: 'Project' },
] as const satisfies ReadonlyArray<{ key: keyof TaskViewSettings; label: string }>

export interface TaskViewCustomizerProps {
  /** The view's display name (used in labels + the default save name). */
  viewName: string
  settings: TaskViewSettings
  onSettingsChange: (next: TaskViewSettings) => void
  /** Persist a named view; receives the filter the parent captured. */
  onSaveView: (name: string, settings: TaskViewSettings, filter: Record<string, unknown>) => void
  /** The current list filter (rule chips) captured into the saved view. */
  filter: Record<string, unknown>
}

export function TaskViewCustomizer({
  viewName,
  settings,
  onSettingsChange,
  onSaveView,
  filter,
}: TaskViewCustomizerProps) {
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saved, setSaved] = useState(false)

  const patch = (partial: Partial<TaskViewSettings>) => {
    onSettingsChange({ ...settings, ...partial })
    setSaved(false)
  }

  return (
    <div className="panel space-y-3">
      <p className="label flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-indigo-400" /> View options — {viewName}
      </p>

      {/* Show/hide columns (S3-44). */}
      <div className="grid gap-2 sm:grid-cols-2">
        {SHOW_KEYS.map(({ key, label }) => (
          <Toggle
            key={key}
            label={`Show ${label.toLowerCase()}`}
            checked={settings[key] === true}
            onChange={(next) => patch({ [key]: next } as Partial<TaskViewSettings>)}
          />
        ))}
      </div>

      {/* Sort + group (S3-44). */}
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Sort by"
          value={settings.sortBy}
          onChange={(e) => patch({ sortBy: e.target.value as TaskViewSettings['sortBy'] })}
        >
          <option value="manual">Manual order</option>
          <option value="due">Due date</option>
          <option value="deadline">Deadline</option>
          <option value="priority">Priority</option>
          <option value="estimate">Estimate</option>
          <option value="title">Title</option>
        </SelectField>
        <SelectField
          label="Group by"
          value={settings.groupBy}
          onChange={(e) => patch({ groupBy: e.target.value as TaskViewSettings['groupBy'] })}
        >
          <option value="none">No grouping</option>
          <option value="project">Project</option>
          <option value="tag">Tag</option>
          <option value="priority">Priority</option>
          <option value="due">Due day</option>
        </SelectField>
      </div>

      {/* Save as view (S3-44/S3-85) — opens on demand, confirms in place. */}
      <div className="space-y-2">
        {saveOpen ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <TextField
                label="View name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={`${viewName} copy`}
                aria-label="Saved view name"
              />
            </div>
            <Button
              variant="primary"
              className="text-xs"
              disabled={saveName.trim().length === 0}
              onClick={() => {
                onSaveView(saveName.trim(), settings, filter)
                setSaved(true)
                setSaveOpen(false)
                setSaveName('')
              }}
            >
              Save view
            </Button>
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => {
                setSaveOpen(false)
                setSaveName('')
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Button variant="secondary" className="text-xs" onClick={() => setSaveOpen(true)}>
              Save as view
            </Button>
            {saved && (
              <span className="text-xs text-status-success-text" role="status">
                View saved
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default TaskViewCustomizer
