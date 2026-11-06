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
    // 29: the canonical set plus /search (Search Everything, M18)
    expect(ALL_NAV_ITEMS).toHaveLength(29)
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/search')).toBe(true)
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
