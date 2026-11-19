import { readFileSync } from 'node:fs'
import { dirname, join, resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  assertAA,
  collectVars,
  contrastRatio,
  mixOklab,
  parseColor,
  parseCssCustomProperties,
  relativeLuminance,
  type Rgb,
} from '@learning-hub/core/design-tokens'

/**
 * Design-token contrast lock (ui-signature §3.1, review-gate point 1).
 *
 * Reads apps/web/app/globals.css — the source of truth for every token — and
 * resolves the mode-scoped text tokens the way the browser does: through the
 * pure OKLab `color-mix` math in @learning-hub/core/design-tokens. Every
 * pairing a reader actually sees must clear WCAG 2.1 AA (4.5:1 body, 3:1
 * large) in BOTH modes, across ALL six palettes (the ramp is derived from each
 * palette's tint, so a palette can regress alone).
 *
 * This is the mechanical half of the 12-point review gate, and the reason the
 * text ramp can't silently regress: if a pairing here fails, fix the token
 * value in globals.css — never this test (AGENTS.md rule 13).
 *
 * Node-only (fs) — CI runs it; locally only typecheck/lint/format run (rule 17).
 */

const here = dirname(fileURLToPath(import.meta.url))
const WEB = pathResolve(here, '..')
const css = readFileSync(join(WEB, 'app/globals.css'), 'utf8')
const blocks = parseCssCustomProperties(css)

const PALETTES = ['calm', 'forest', 'ocean', 'sunset', 'blossom', 'midnight'] as const

/** One palette+mode resolved the way the cascade resolves it:
 * :root base, then the palette block, then .dark overrides last. */
function varsFor(palette: (typeof PALETTES)[number], mode: 'light' | 'dark') {
  const selectors = [':root']
  if (palette !== 'calm') selectors.push(`[data-theme='${palette}']`)
  if (mode === 'dark') selectors.push('.dark')
  return collectVars(blocks, selectors)
}

const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 }
const BLACK: Rgb = { r: 0, g: 0, b: 0, a: 1 }

const resolve = (name: string, vars: Record<string, string>): Rgb => {
  const raw = vars[name]
  if (raw === undefined) throw new Error(`token ${name} not found in globals.css`)
  const color = parseColor(raw, vars)
  if (!color) throw new Error(`token ${name} = "${raw}" did not parse`)
  return color
}

/** Compose a translucent token (e.g. --danger-soft) over a surface in sRGB —
 * what actually gets painted when a color with alpha sits on a panel. */
function over(color: Rgb, surface: Rgb): Rgb {
  const a = color.a ?? 1
  return {
    r: color.r * a + surface.r * (1 - a),
    g: color.g * a + surface.g * (1 - a),
    b: color.b * a + surface.b * (1 - a),
    a: 1,
  }
}

function expectAA(fg: Rgb, bg: Rgb, label: string, large = false): void {
  const ratio = contrastRatio(fg, bg)
  expect(assertAA(ratio, { large }), `${label} = ${ratio.toFixed(2)}:1 (need ${large ? 3 : 4.5}:1)`).toBe(
    true,
  )
}

describe('design-token contrast (globals.css, both modes, every palette)', () => {
  it('math sanity: pure black on pure white is 21:1, identical colors are 1:1', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 1)
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5)
    // WCAG luminance reference points
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 5)
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 5)
  })

  it('color-mix math agrees with the CSS engine on a known mix', () => {
    // color-mix(in oklab, white 50%, black) is mid gray ≈ #777 per spec oklab mix
    const mixed = mixOklab(WHITE, BLACK, 0.5, 0.5)
    const ratio = contrastRatio(mixed, WHITE)
    // A mid gray must sit between the 4.5:1 and 3:1 bands, never below 3:1
    expect(ratio).toBeGreaterThan(3)
    expect(ratio).toBeLessThan(6)
  })

  for (const palette of PALETTES) {
    describe(`palette: ${palette}`, () => {
      const light = varsFor(palette, 'light')
      const dark = varsFor(palette, 'dark')

      // ── Light mode: text tokens on the surfaces they actually sit on ──
      const lightSurfaces: [string, Rgb][] = [
        ['white (panel)', WHITE],
        ['--n-50 (page bg)', resolve('--n-50', light)],
        ['--n-100 (fill)', resolve('--n-100', light)],
      ]
      for (const token of ['text-strong', 'text-body', 'text-secondary', 'text-tertiary']) {
        it(`light: --${token} clears AA on every light surface (4.5 body / 3 large)`, () => {
          const fg = resolve(`--${token}`, light)
          for (const [name, bg] of lightSurfaces) {
            expectAA(fg, bg, `light ${palette} --${token} on ${name}`)
            expectAA(fg, bg, `light ${palette} --${token} on ${name} (large)`, true)
          }
        })
      }

      it('light: --text-faint clears AA on white and the page background', () => {
        const fg = resolve('--text-faint', light)
        expectAA(fg, WHITE, `light ${palette} --text-faint on white`)
        expectAA(fg, resolve('--n-50', light), `light ${palette} --text-faint on --n-50`)
      })

      it('light: status + danger + accent text clear AA on white and --n-50', () => {
        for (const token of [
          'status-success-text',
          'status-warning-text',
          'status-info-text',
          'danger-text',
          'ac-text',
        ]) {
          const fg = resolve(`--${token}`, light)
          expectAA(fg, WHITE, `light ${palette} --${token} on white`)
          expectAA(fg, resolve('--n-50', light), `light ${palette} --${token} on --n-50`)
        }
      })

      it('light: danger text clears AA on its soft tint composited over white', () => {
        const soft = resolve('--danger-soft', light)
        expectAA(resolve('--danger-text', light), over(soft, WHITE), `light ${palette} --danger-text on --danger-soft/white`)
      })

      // ── Dark mode: text tokens on the --hub-* surfaces ──
      const darkSurfaces: [string, Rgb][] = (['--hub-bg', '--hub-panel', '--hub-panel-2', '--hub-sunken'] as const).map(
        (name) => [name, resolve(name, dark)],
      )
      for (const token of ['text-strong', 'text-body', 'text-secondary', 'text-tertiary']) {
        it(`dark: --${token} clears AA on every --hub-* surface (4.5 body / 3 large)`, () => {
          const fg = resolve(`--${token}`, dark)
          for (const [name, bg] of darkSurfaces) {
            expectAA(fg, bg, `dark ${palette} --${token} on ${name}`)
            expectAA(fg, bg, `dark ${palette} --${token} on ${name} (large)`, true)
          }
        })
      }

      it('dark: --text-faint clears AA on the page background and panels', () => {
        const fg = resolve('--text-faint', dark)
        for (const [name, bg] of darkSurfaces) {
          expectAA(fg, bg, `dark ${palette} --text-faint on ${name}`)
        }
      })

      it('dark: status + danger + accent text clear AA on page background and panels', () => {
        for (const token of [
          'status-success-text',
          'status-warning-text',
          'status-info-text',
          'danger-text',
          'ac-text',
        ]) {
          const fg = resolve(`--${token}`, dark)
          for (const name of ['--hub-bg', '--hub-panel'] as const) {
            expectAA(fg, resolve(name, dark), `dark ${palette} --${token} on ${name}`)
          }
        }
      })

      it('dark: danger text clears AA on its soft tint composited over the panel', () => {
        const soft = resolve('--danger-soft', dark)
        expectAA(
          resolve('--danger-text', dark),
          over(soft, resolve('--hub-panel', dark)),
          `dark ${palette} --danger-text on --danger-soft/panel`,
        )
      })
    })
  }
})
