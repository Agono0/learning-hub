/**
 * Keyboard shortcuts (S3-35) — the configurable task-shortcut map.
 *
 * Defaults mirror what the tasks page ships (S3-73): `j`/`k` walk the list
 * cursor, `x` selects, `enter` opens the detail, `?` opens the cheat sheet,
 * `escape` cancels. Users override any binding per-device (the settings
 * section persists overrides via `@/lib/shortcut-overrides`); the core owns
 * the normalization, conflict detection and event matching so the page, the
 * cheat sheet and the settings section share one resolver.
 *
 * Combo grammar: lowercase `key` with ordered modifiers — `ctrl`, `alt`,
 * `shift` (e.g. `ctrl+shift+j`). Single letters/symbols only as the final
 * key. Pure: no event objects cross the boundary (a plain shape does).
 */
import { z } from 'zod'

/** One binding: a stable id, its default combo and its human label. */
export interface ShortcutBinding {
  id: string
  /** The default combo (combo grammar below). */
  defaultCombo: string
  /** Human label for the cheat sheet + settings rows. */
  label: string
  /** Where the binding applies (the page gates on this). */
  surface: 'task-list' | 'global'
}

/** The shipped defaults (S3-73's page behavior, promoted to the map). */
export const DEFAULT_SHORTCUTS: readonly ShortcutBinding[] = [
  {
    id: 'task.cursor-down',
    defaultCombo: 'j',
    label: 'Move the cursor down',
    surface: 'task-list',
  },
  { id: 'task.cursor-up', defaultCombo: 'k', label: 'Move the cursor up', surface: 'task-list' },
  {
    id: 'task.select',
    defaultCombo: 'x',
    label: 'Select / deselect the cursor row',
    surface: 'task-list',
  },
  { id: 'task.open', defaultCombo: 'enter', label: 'Open the cursor row', surface: 'task-list' },
  {
    id: 'task.complete',
    defaultCombo: 'shift+enter',
    label: 'Complete the cursor row',
    surface: 'task-list',
  },
  {
    id: 'app.cheat-sheet',
    defaultCombo: '?',
    label: 'Open the shortcut cheat sheet',
    surface: 'global',
  },
  { id: 'app.cancel', defaultCombo: 'escape', label: 'Cancel the held action', surface: 'global' },
]

/** Overrides: binding id → combo. zod-validated at every boundary. */
export const shortcutOverridesSchema = z.record(
  z.string().min(1).max(80),
  z.string().min(1).max(40),
)

export type ShortcutOverrides = z.infer<typeof shortcutOverridesSchema>

const MODIFIER_ORDER = ['ctrl', 'alt', 'shift'] as const
/** Keys the grammar accepts as the final press (letters, digits, symbols). */
const FINAL_KEY_RE = /^[a-z0-9?!.,;:='"()[\]{}\-_/\\`~@#$%^&*+=<>]$/i

/**
 * Normalize a combo into canonical grammar: lowercase, modifiers in
 * ctrl→alt→shift order, trimmed. Returns null when unparseable (empty
 * final key, unknown modifier, multi-char final key that isn't a symbol).
 */
export function normalizeCombo(raw: string): string | null {
  const parts = raw
    .trim()
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  if (parts.length === 0) return null
  const final = parts[parts.length - 1] ?? ''
  const modifiers = parts.slice(0, -1)
  for (const m of modifiers) {
    if (!(MODIFIER_ORDER as readonly string[]).includes(m)) return null
  }
  if (parts.length > 1 && !FINAL_KEY_RE.test(final)) return null
  const ordered = MODIFIER_ORDER.filter((m) => modifiers.includes(m))
  return [...ordered, final].join('+')
}

/** The effective map: defaults with overrides applied (invalid combos keep defaults). */
export function effectiveShortcuts(overrides: ShortcutOverrides): Record<string, string> {
  const map: Record<string, string> = {}
  for (const binding of DEFAULT_SHORTCUTS) {
    const override = overrides[binding.id]
    const combo = override !== undefined ? normalizeCombo(override) : binding.defaultCombo
    map[binding.id] = combo ?? binding.defaultCombo
  }
  return map
}

/** Combos claimed by MORE than one binding after overrides (conflict ids). */
export function detectConflicts(overrides: ShortcutOverrides): string[] {
  const effective = effectiveShortcuts(overrides)
  const byCombo = new Map<string, string[]>()
  for (const [id, combo] of Object.entries(effective)) {
    byCombo.set(combo, [...(byCombo.get(combo) ?? []), id])
  }
  return [...byCombo.values()].filter((ids) => ids.length > 1).flat()
}

/** The event shape the resolver consumes (KeyboardEvent projection). */
export interface ShortcutEvent {
  key: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/** Build the canonical combo for a keyboard event (null when unmatchable). */
export function comboFromEvent(event: ShortcutEvent): string | null {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase()
  if (key.length === 1 && !FINAL_KEY_RE.test(key)) return null
  const modifiers = MODIFIER_ORDER.filter((m) =>
    m === 'ctrl' ? event.ctrlKey : m === 'alt' ? event.altKey : event.shiftKey,
  )
  return [...modifiers, key].join('+')
}

/**
 * Resolve a keyboard event to a binding id using the effective map
 * (`?` matches shift+/ — the resolver normalizes both shapes).
 */
export function resolveShortcut(event: ShortcutEvent, overrides: ShortcutOverrides): string | null {
  const combo = comboFromEvent(event)
  if (combo === null) return null
  const effective = effectiveShortcuts(overrides)
  const direct = Object.entries(effective).find(([, c]) => c === combo)
  if (direct !== undefined) return direct[0]
  // `?` is shift+/ (or shift+?) on most layouts — match any of the shapes.
  if (combo === 'shift+/' || combo === '?' || combo === 'shift+?') {
    const cheat = effective['app.cheat-sheet']
    if (cheat === '?' || cheat === 'shift+/' || cheat === 'shift+?') return 'app.cheat-sheet'
  }
  return null
}
