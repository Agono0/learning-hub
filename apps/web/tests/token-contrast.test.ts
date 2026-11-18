import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Token contrast gate (docs/ui-design-signature.md §3.1 / ui-ux-next-plan.md Phase 1).
 *
 * Parses apps/web/app/globals.css, resolves the OKLab `color-mix` ramp exactly
 * like the CSS engine does, and asserts WCAG AA (4.5:1) for every semantic
 * text token against the surfaces it can render on — in LIGHT, DARK (for all
 * six palettes) and E-INK modes. This is the regression lock: reintroducing a
 * failing step fails this test loudly.
 */

const here = dirname(fileURLToPath(import.meta.url))
const CSS = readFileSync(resolve(here, '../app/globals.css'), 'utf8')

// ── OKLab / sRGB math (Björn Ottosson's reference constants) ─────────────────
type RGB = [number, number, number]

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

function linearToOklab([r, g, b]: RGB): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToLinear([L, a, b]: [number, number, number]): RGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as RGB
}

/** CSS color-mix in oklab: weights normalised over the declared percentages. */
function oklabMix(a: RGB, pa: number, b: RGB, pb: number): RGB {
  const la = linearToOklab(a.map(srgbToLinear) as RGB)
  const lb = linearToOklab(b.map(srgbToLinear) as RGB)
  const wa = pa / (pa + pb)
  const wb = pb / (pa + pb)
  const mixed = [la[0] * wa + lb[0] * wb, la[1] * wa + lb[1] * wb, la[2] * wa + lb[2] * wb] as [
    number,
    number,
    number,
  ]
  // back to gamma-encoded sRGB so every resolved color is in one space
  return oklabToLinear(mixed).map(linearToSrgb) as RGB
}

function relativeLuminance(rgb: RGB): number {
  const [r, g, b] = rgb.map(srgbToLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: RGB, b: RGB): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// ── parse globals.css into per-mode var maps ─────────────────────────────────
function parseBlocks(css: string): Array<{ selectors: string[]; body: string }> {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '') // strip comments
  const blocks: Array<{ selectors: string[]; body: string }> = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stripped))) {
    blocks.push({
      selectors: m[1].split(',').map((s) => s.trim()),
      body: m[2],
    })
  }
  return blocks
}

function decls(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of body.split(';')) {
    const i = line.indexOf(':')
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

const blocks = parseBlocks(CSS)

const palettes: Record<string, Record<string, string>> = {}
let rootVars: Record<string, string> = {}
let darkVars: Record<string, string> = {}
let einkVars: Record<string, string> = {}
for (const b of blocks) {
  for (const sel of b.selectors) {
    const palette = sel.match(/^\[data-theme='(\w+)'\]$/)
    if (palette) {
      palettes[palette[1]] = { ...palettes[palette[1]], ...decls(b.body) }
      continue
    }
    if (sel === ':root') rootVars = { ...rootVars, ...decls(b.body) }
    else if (sel === '.dark') darkVars = { ...darkVars, ...decls(b.body) }
    else if (sel === 'html.theme-e-ink') einkVars = { ...einkVars, ...decls(b.body) }
  }
}

const PALETTE_NAMES = Object.keys(palettes)

// ── token resolver ───────────────────────────────────────────────────────────
function resolveColor(
  expr: string,
  ctx: { palette: string; mode: 'light' | 'dark' | 'eink' },
): RGB {
  const v = expr.trim()
  const paletteVars = palettes[ctx.palette] ?? {}
  const modeVars = ctx.mode === 'dark' ? { ...rootVars, ...darkVars } : rootVars

  if (v === 'white') return [1, 1, 1]
  if (v === 'black') return [0, 0, 0]
  if (v.startsWith('#')) return hexToRgb(v)

  const varRef = v.match(/^var\((--[\w-]+)\)$/)
  if (varRef) {
    const name = varRef[1]
    // e-ink overrides everything; per-palette vars (tint/ac-*/hub-*) next;
    // mode-scoped tokens (n-ramp, text/status/danger) last.
    const value =
      (ctx.mode === 'eink' ? einkVars[name] : undefined) ??
      paletteVars[name] ??
      modeVars[name] ??
      undefined
    if (!value) throw new Error(`unresolvable ${name} (palette ${ctx.palette}, mode ${ctx.mode})`)
    return resolveColor(value, ctx)
  }

  const mix = v.match(/^color-mix\(in oklab,\s*(.*)\)$/)
  if (mix) {
    // split "A p%, B q%" — an omitted percentage inherits the remainder
    const parts = mix[1].split(',').map((s) => s.trim())
    const parsed = parts.map((p) => {
      const m = p.match(/^(.+?)\s+(\d+(?:\.\d+)?)%$/)
      return m ? { color: m[1], pct: Number(m[2]) } : { color: p, pct: null }
    })
    if (parsed.length === 2) {
      const pa = parsed[0].pct ?? 100 - (parsed[1].pct ?? 50)
      const pb = parsed[1].pct ?? 100 - pa
      const a = resolveColor(parsed[0].color, ctx)
      const b = resolveColor(parsed[1].color, ctx)
      return oklabMix(a, pa, b, pb)
    }
  }
  throw new Error(`unsupported color expression: ${expr}`)
}

const TEXT_TOKENS = [
  '--text-strong',
  '--text-body',
  '--text-secondary',
  '--text-tertiary',
  '--text-faint',
]
const STATUS_TOKENS = [
  '--ac-text',
  '--status-success-text',
  '--status-warning-text',
  '--status-info-text',
  '--danger-text',
]

const AA = 4.5

describe('token contrast (WCAG AA, both modes — ui-design-signature §3.1)', () => {
  it('parses the expected token layer from globals.css', () => {
    for (const t of [...TEXT_TOKENS, ...STATUS_TOKENS]) {
      expect(rootVars[t], `light value for ${t}`).toBeTruthy()
      expect(darkVars[t] ?? rootVars[t], `dark value for ${t}`).toBeTruthy()
    }
    expect(PALETTE_NAMES.length).toBeGreaterThanOrEqual(6)
  })

  for (const palette of PALETTE_NAMES) {
    it(`every semantic text token passes 4.5:1 in light AND dark (${palette})`, () => {
      const ctx = { palette, mode: 'light' as const }
      const lightSurfaces: RGB[] = [[1, 1, 1], resolveColor('var(--n-50)', ctx)]

      const darkCtx = { palette, mode: 'dark' as const }
      const darkSurfaces: RGB[] = ['--hub-bg', '--hub-panel', '--hub-panel-2'].map((v) =>
        resolveColor(`var(${v})`, darkCtx),
      )

      for (const token of [...TEXT_TOKENS, ...STATUS_TOKENS]) {
        const light = resolveColor(`var(${token})`, ctx)
        const dark = resolveColor(`var(${token})`, darkCtx)
        for (const surface of lightSurfaces) {
          const ratio = contrast(light, surface)
          expect(
            ratio,
            `light: ${token} on ${palette} surface = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(AA)
        }
        for (const surface of darkSurfaces) {
          const ratio = contrast(dark, surface)
          expect(
            ratio,
            `dark: ${token} on ${palette} surface = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(AA)
        }
      }
    })

    it(`button contrast pairs pass AA (${palette})`, () => {
      const ctx = { palette, mode: 'light' as const }
      const white: RGB = [1, 1, 1]
      // primary: white on the accent fill
      expect(
        contrast(white, resolveColor('var(--ac-strong)', ctx)),
        'white on --ac-strong',
      ).toBeGreaterThanOrEqual(AA)
      // danger: white on the danger fill
      expect(
        contrast(white, resolveColor('var(--danger-strong)', ctx)),
        'white on --danger-strong',
      ).toBeGreaterThanOrEqual(AA)
      // ghost: text step on its surface, both modes
      const ghostLight = contrast(resolveColor('var(--n-700)', ctx), [1, 1, 1])
      expect(ghostLight, 'ghost text on white').toBeGreaterThanOrEqual(AA)
      const darkCtx = { palette, mode: 'dark' as const }
      const ghostDark = contrast(
        resolveColor('var(--n-300)', darkCtx),
        resolveColor('var(--hub-panel)', darkCtx),
      )
      expect(ghostDark, 'ghost text on dark panel').toBeGreaterThanOrEqual(AA)
    })
  }

  it('e-ink mode keeps every text token above 4.5:1 on white', () => {
    const ctx = { palette: 'calm', mode: 'eink' as const }
    for (const token of [...TEXT_TOKENS, ...STATUS_TOKENS]) {
      const ratio = contrast(resolveColor(`var(${token})`, ctx), [1, 1, 1])
      expect(ratio, `e-ink: ${token} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
    }
  })
})
