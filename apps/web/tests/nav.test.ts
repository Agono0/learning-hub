import { describe, expect, it } from 'vitest'
import {
  ALL_NAV_ITEMS,
  DEFAULT_COLLAPSED_GROUPS,
  NAV,
  PRIMARY_NAV_ITEMS,
  isActive,
} from '../src/components/nav'
import { normalizeThemePreference } from '../src/components/ThemeSync'

describe('navigation model & theme helpers', () => {
  it('preserves all routes across the 4 canonical scaffolder groups', () => {
    expect(NAV.map((g) => g.group)).toEqual(['Learn', 'Explore', 'Discipline', 'Create & Analyze'])
    // Self-consistency instead of a magic count: every new page PR has to
    // remember to bump the old hardcoded number (it drifted twice), so assert
    // the invariants that actually matter — uniqueness, icons, primary
    // budget — and pin the historical routes below.
    const hrefs = ALL_NAV_ITEMS.map((i) => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    for (const item of ALL_NAV_ITEMS) {
      expect(item.href.startsWith('/')).toBe(true)
      expect(item.icon).toBeDefined() // lucide forwardRef components are objects
      expect(item.label.length).toBeGreaterThan(0)
    }
    expect(hrefs.length).toBeGreaterThanOrEqual(48)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/workload')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/generation')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/dual-coding')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/search')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/audio-commute')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/sleep-tmr')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/metacognition')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/self-explanation')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/interleaving')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/pretest')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/analogy')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/flexibility')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/equilibrium')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/interactivity')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/deliberate')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/skills')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/successive-relearning')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/apprenticeship')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/curiosity')).toBe(true)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/srl')).toBe(true)
    expect(PRIMARY_NAV_ITEMS.map((i) => i.href)).toEqual(['/', '/review', '/courses', '/focus'])
    expect(DEFAULT_COLLAPSED_GROUPS).toEqual(['Explore', 'Discipline', 'Create & Analyze'])
  })

  it('matches active routes with trailing-slash tolerance', () => {
    expect(isActive('/', '/')).toBe(true)
    expect(isActive('/courses/sql-essentials/', '/courses')).toBe(true)
    expect(isActive('/courses', '/')).toBe(false)
  })

  it('normalizes theme preferences safely to dark, light, or system', () => {
    expect(normalizeThemePreference('light')).toBe('light')
    expect(normalizeThemePreference('system')).toBe('system')
    expect(normalizeThemePreference('dark')).toBe('dark')
    expect(normalizeThemePreference('unknown')).toBe('dark')
    expect(normalizeThemePreference(null)).toBe('dark')
  })
})
