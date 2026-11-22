'use client'

/**
 * Shortcuts settings section (S3-35) — the task-shortcut map, per-device:
 * each row shows its effective combo, a capture button records the next
 * keypress, conflicts flag both rows (core `detectConflicts`), and reset
 * clears overrides one at a time (calm, per-row). Persisted via
 * `@/lib/shortcut-overrides` (device-local — no settings column needed).
 */
import React, { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import {
  DEFAULT_SHORTCUTS,
  detectConflicts,
  effectiveShortcuts,
  normalizeCombo,
  comboFromEvent,
  type ShortcutOverrides,
} from '@learning-hub/core'
import { loadShortcutOverrides, saveShortcutOverrides } from '@/lib/shortcut-overrides'
import { Button } from '@/ui'

/** The combo currently being captured (the settings row awaiting a key). */
type Capturing = string | null

export function ShortcutsSection() {
  const [overrides, setOverrides] = useState<ShortcutOverrides>({})
  const [capturing, setCapturing] = useState<Capturing>(null)
  const captureRef = useRef<Capturing>(null)

  // Device-local read on mount (hydration-safe: SSR shows defaults).
  useEffect(() => {
    setOverrides(loadShortcutOverrides())
  }, [])

  const conflicts = new Set(detectConflicts(overrides))
  const effective = effectiveShortcuts(overrides)

  // Global capture listener while a row is recording.
  useEffect(() => {
    captureRef.current = capturing
    if (capturing === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCapturing(null)
        return
      }
      const combo = comboFromEvent(event)
      if (combo === null) return
      event.preventDefault()
      const clean = normalizeCombo(combo)
      if (clean === null) return
      const next = { ...loadShortcutOverrides(), [capturing]: clean }
      saveShortcutOverrides(next)
      setOverrides(next)
      setCapturing(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [capturing])

  return (
    <div className="space-y-3">
      <p className="label">Keyboard shortcuts (this device)</p>
      <p className="text-xs text-tertiary">
        Click a row's combo to capture a replacement; Escape cancels. Conflicts flag both rows.
      </p>
      <ul className="divide-y divide-neutral-200 text-sm dark:divide-(--hub-border)">
        {DEFAULT_SHORTCUTS.map((binding) => {
          const combo = effective[binding.id] ?? binding.defaultCombo
          const isConflicted = conflicts.has(binding.id)
          const isRecording = capturing === binding.id
          const isOverridden = overrides[binding.id] !== undefined
          return (
            <li key={binding.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-neutral-700 dark:text-neutral-200">{binding.label}</p>
                {isConflicted && (
                  <p className="text-xs text-status-warning-text">
                    Duplicate combo — rebind one of these rows
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant={isRecording ? 'primary' : 'secondary'}
                  className="px-2 py-1 font-mono text-xs"
                  onClick={() => setCapturing(isRecording ? null : binding.id)}
                  aria-label={`Rebind ${binding.label}`}
                >
                  {isRecording ? 'Press a key…' : combo}
                </Button>
                {isOverridden && (
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-tertiary"
                    aria-label={`Reset ${binding.label} to the default`}
                    onClick={() => {
                      const { [binding.id]: _dropped, ...rest } = loadShortcutOverrides()
                      saveShortcutOverrides(rest)
                      setOverrides(rest)
                    }}
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default ShortcutsSection
