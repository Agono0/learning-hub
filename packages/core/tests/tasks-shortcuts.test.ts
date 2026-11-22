/**
 * Keyboard shortcuts core (S3-35): combo normalization, override conflicts,
 * event resolution (incl. the `?`/shift+/ duality), and the effective map.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHORTCUTS,
  comboFromEvent,
  detectConflicts,
  effectiveShortcuts,
  normalizeCombo,
  resolveShortcut,
  shortcutOverridesSchema,
} from '../src/tasks/shortcuts'

describe('normalizeCombo', () => {
  it('canonicalizes modifiers into ctrl→alt→shift order, lowercase', () => {
    expect(normalizeCombo('Shift+Ctrl+J')).toBe('ctrl+shift+j')
    expect(normalizeCombo(' alt + k ')).toBe('alt+k')
  })

  it('rejects unknown modifiers and junk finals', () => {
    expect(normalizeCombo('meta+j')).toBeNull()
    expect(normalizeCombo('')).toBeNull()
    expect(normalizeCombo('ctrl+shift+notakey!!')).toBeNull()
  })

  it('accepts symbol finals like ?', () => {
    expect(normalizeCombo('?')).toBe('?')
    expect(normalizeCombo('shift+?')).toBe('shift+?')
  })
})

describe('effectiveShortcuts', () => {
  it('defaults mirror the shipped S3-73 behavior', () => {
    const map = effectiveShortcuts({})
    expect(map['task.cursor-down']).toBe('j')
    expect(map['task.cursor-up']).toBe('k')
    expect(map['task.select']).toBe('x')
    expect(map['app.cheat-sheet']).toBe('?')
  })

  it('applies valid overrides and keeps defaults for invalid ones', () => {
    const map = effectiveShortcuts({ 'task.cursor-down': 'ctrl+j', 'task.select': 'meta+x' })
    expect(map['task.cursor-down']).toBe('ctrl+j')
    expect(map['task.select']).toBe('x') // meta isn't in the grammar → default
  })

  it('every default binding id is unique', () => {
    const ids = DEFAULT_SHORTCUTS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('detectConflicts', () => {
  it('flags two bindings on the same combo', () => {
    const conflicts = detectConflicts({ 'task.cursor-down': 'k' })
    expect(conflicts).toEqual(['task.cursor-down', 'task.cursor-up'])
  })

  it('no conflicts in the shipped defaults', () => {
    expect(detectConflicts({})).toEqual([])
  })
})

describe('resolveShortcut', () => {
  it('resolves plain key events against the map', () => {
    const map = effectiveShortcuts({})
    expect(resolveShortcut({ key: 'j', ctrlKey: false, shiftKey: false, altKey: false }, map)).toBe(
      'task.cursor-down',
    )
    expect(resolveShortcut({ key: 'x', ctrlKey: false, shiftKey: false, altKey: false }, map)).toBe(
      'task.select',
    )
  })

  it('resolves the ? cheat sheet from both shapes', () => {
    const map = effectiveShortcuts({})
    expect(resolveShortcut({ key: '?', ctrlKey: false, shiftKey: true, altKey: false }, map)).toBe(
      'app.cheat-sheet',
    )
    expect(resolveShortcut({ key: '/', ctrlKey: false, shiftKey: true, altKey: false }, map)).toBe(
      'app.cheat-sheet',
    )
  })

  it('honors overrides', () => {
    const map = effectiveShortcuts({ 'task.cursor-down': 'ctrl+alt+j' })
    expect(resolveShortcut({ key: 'j', ctrlKey: true, shiftKey: false, altKey: true }, map)).toBe(
      'task.cursor-down',
    )
    expect(
      resolveShortcut({ key: 'j', ctrlKey: false, shiftKey: false, altKey: false }, map),
    ).toBeNull()
  })

  it('schema rejects non-record overrides at the boundary', () => {
    expect(shortcutOverridesSchema.safeParse('j').success).toBe(false)
    expect(shortcutOverridesSchema.safeParse({ 'task.cursor-down': 5 }).success).toBe(false)
  })

  it('comboFromEvent drops unmatchable keys', () => {
    expect(comboFromEvent({ key: 'Dead', ctrlKey: false, shiftKey: false, altKey: false })).toBe(
      'dead',
    )
    expect(comboFromEvent({ key: 'F5', ctrlKey: false, shiftKey: false, altKey: false })).toBe('f5')
  })
})
