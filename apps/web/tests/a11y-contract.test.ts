import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { IconButton } from '../src/ui/IconButton'
import * as ui from '../src/ui'
import { NotificationBell } from '../src/components/NotificationBell'
import { PermissionNudge } from '../src/components/PermissionNudge'

/**
 * Accessibility wiring contract (docs/accessibility.md).
 *
 * Node-level, no DOM rendering: the components are imported to pin that the
 * modules exist and export their component (a broken export or a typo'd
 * circular import fails here), and the source files are scanned to pin the
 * wiring a11y depends on — the skip link target, the accessible names, and
 * the focus-visible standard. These greps are the mechanical half of the
 * 12-point review gate (ui-signature §6, points 3 and 4).
 */

const here = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(here, '..')
const src = (rel: string) => readFileSync(join(WEB, rel), 'utf8')

describe('IconButton kit component', () => {
  it('exists and exports the component (default ghost variant, md size)', () => {
    expect(typeof IconButton).toBe('function')
    expect(typeof ui.IconButton).toBe('function')
  })

  it('renders the accessible name as aria-label (label is the name, icon is decorative)', () => {
    const source = src('src/ui/IconButton.tsx')
    expect(source).toContain('aria-label={label}')
    // Glyph is the consumer's children (main API since #72); the loading spinner is aria-hidden.
    expect(source).toContain('aria-hidden') // loading spinner is decorative
  })

  it('follows the focus-visible standard — ring on --ac-strong, offset on --hub-bg', () => {
    const source = src('src/ui/IconButton.tsx')
    expect(source).toContain('focus-visible:ring-2')
    expect(source).toContain('focus-visible:ring-(--ac-strong)')
    expect(source).toContain('focus-visible:ring-offset-2')
    expect(source).toContain('focus-visible:ring-offset-(--hub-bg)')
    // Never outline-none without the replacement ring (ui-signature §4).
    expect(source).not.toContain('outline-none')
  })

  it('keeps press feedback and color-only transitions (never transition-all)', () => {
    const source = src('src/ui/IconButton.tsx')
    expect(source).toContain('active:scale-[0.98]')
    expect(source).toContain('transition-colors')
    expect(source).not.toContain('transition-all')
  })

  it('keeps a ≥44px touch target on coarse pointers in EVERY size', () => {
    const source = src('src/ui/IconButton.tsx')
    // Pin the merged size map (#83 review: the earlier draft pinned
    // "md: 'h-11 w-11'", an API that never shipped — main's md is h-9 w-9
    // behind a mouse and grows to 44px on coarse pointers via the shared law).
    expect(source).toContain("sm: 'h-8 w-8'")
    expect(source).toContain("md: 'h-9 w-9'")
    expect(source).toContain("lg: 'h-11 w-11'")
    expect(source).toContain('[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11')
    expect(source).toContain("size !== 'lg' && '[@media(pointer:coarse)]:h-11")
  })

  it('exposes the loading state (spinner replaces the glyph, aria-busy set)', () => {
    const source = src('src/ui/IconButton.tsx')
    expect(source).toContain('aria-busy={loading || undefined}')
    expect(source).toContain('animate-spin')
  })
})

describe('hand-rolled icon buttons retired by IconButton', () => {
  it('NotificationBell trigger keeps the accessible name with the count', () => {
    const source = src('src/components/NotificationBell.tsx')
    // The label carries the needs-attention count for screen readers.
    expect(source).toContain("label={`Notifications${count ? ` (${count} need attention)` : ''}`}")
    expect(source).toContain('<IconButton')
    // The hand-rolled 9x9 grid button is gone.
    expect(source).not.toContain('grid h-9 w-9 place-items-center')
    expect(typeof NotificationBell).toBe('function')
  })

  it('PermissionNudge dismiss keeps its aria-label and uses IconButton', () => {
    const source = src('src/components/PermissionNudge.tsx')
    expect(source).toContain('label={`Stop suggesting ${def.title}`}')
    expect(source).toContain('<IconButton')
    expect(source).not.toContain('inline-flex h-11 w-11')
    expect(typeof PermissionNudge).toBe('function')
  })

  it('Sheet close button keeps aria-label="Close" and uses IconButton', () => {
    // NOTE: the task also named apps/web/src/ui/OfflineBanner.tsx, which does
    // not exist on this branch (it lives on the unmerged feat/error-handling
    // branch) — the kit Sheet close button is migrated instead.
    const source = src('src/ui/Sheet.tsx')
    expect(source).toContain('label="Close"')
    expect(source).toContain('<IconButton')
    expect(source).not.toContain('grid h-10 w-10 place-items-center')
  })

  it('exercise reorder buttons keep their Move up / Move down names', () => {
    const source = src('src/ui/exercises/inputs.tsx')
    expect(source).toContain('label="Move up"')
    expect(source).toContain('label="Move down"')
    expect(source).not.toContain('grid h-9 w-9 place-items-center')
  })
})

describe('skip-to-content link (AppShell)', () => {
  const shell = src('src/components/AppShell.tsx')

  it('exposes a skip link to #main-content as the first focusable element', () => {
    expect(shell).toContain('href="#main-content"')
    expect(shell).toContain('Skip to content')
    // The link comes before any navigation chrome in the shell.
    expect(shell.indexOf('href="#main-content"')).toBeLessThan(shell.indexOf('<Sidebar'))
  })

  it('hides the link until focused, then shows it with the focus-visible ring', () => {
    expect(shell).toContain('sr-only')
    expect(shell).toContain('focus-visible:not-sr-only')
    expect(shell).toContain('focus-visible:ring-(--ac-strong)')
  })

  it('gives <main> the matching programmatic-focus target', () => {
    expect(shell).toContain('id="main-content"')
    expect(shell).toMatch(/<main\s+id="main-content"\s+tabIndex=\{-1\}/)
  })
})

describe('reduced-motion policy', () => {
  it('provides the SSR-safe useReducedMotion hook for JS motion', () => {
    const hookPath = join(WEB, 'src/lib/useReducedMotion.ts')
    expect(existsSync(hookPath)).toBe(true)
    expect(readFileSync(hookPath, 'utf8')).toContain('(prefers-reduced-motion: reduce)')
  })

  it('keeps the global CSS kill-switch for animation and transitions', () => {
    const css = src('app/globals.css')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('animation-duration: 0.01ms')
    expect(css).toContain('transition-duration: 0.01ms')
  })
})
