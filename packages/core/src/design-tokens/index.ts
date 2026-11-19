/**
 * WCAG contrast math over CSS design-token values — pure, dependency-free.
 *
 * Why this lives in core: the design system locks every text token to AA
 * (docs/ui-design-signature.md §3.1: "Every --text-* value must pass AA in
 * both modes, computed from the resolved OKLab token math"). The ramp in
 * `apps/web/app/globals.css` is expressed as `color-mix(in oklab, …)` chains,
 * so the only honest way to verify contrast is to resolve those values the
 * same way a browser does: sRGB → OKLab, mix in OKLab, back to sRGB, then
 * WCAG 2.1 relative luminance. Approximating with sRGB averages would compute
 * different colors than the browser ships.
 *
 * Scope: exactly the value formats `globals.css` actually uses — hex
 * (`#rrggbb`), `rgb()`/`rgba()` (comma and space syntax), the named colors
 * `white`/`black`/`transparent`, `var(…)` chains with fallbacks, and
 * `color-mix(in oklab, A p%, B q%)` (weights normalized like CSS does when
 * they don't sum to 100%, with premultiplied-alpha handling for
 * `transparent`). No `lab()`/`lch()`/`oklch()` — none appear in the token
 * file; extend the parser if one is added.
 *
 * Consumed by `apps/web/tests/design-token-contrast.test.ts`, which resolves
 * every mode-scoped text token against its real surfaces in both modes and
 * asserts AA.
 */

/** An sRGB color, channels 0–255 (values may be fractional after mixing). */
export interface Rgb {
  r: number
  g: number
  b: number
  /** Alpha 0–1; `transparent` mixes premultiplied, like CSS color-mix. */
  a?: number
}

/** An OKLab color (L 0–1, a/b unbounded). */
export type OkLab = [number, number, number]

const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 }
const BLACK: Rgb = { r: 0, g: 0, b: 0, a: 1 }
const TRANSPARENT: Rgb = { r: 0, g: 0, b: 0, a: 0 }

const NAMED: Record<string, Rgb> = { white: WHITE, black: BLACK, transparent: TRANSPARENT }

/** sRGB transfer function (channel 0–255 → linear 0–1). */
function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** Inverse sRGB transfer function (linear 0–1 → channel 0–255). */
function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, v)) * 255)
}

// Linear-sRGB → LMS (Ottosson 2020, oklab.rs reference implementation).
const LMS_FROM_LIN: number[][] = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
]
// LMS' → OKLab.
const LAB_FROM_LMS: number[][] = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
]
// OKLab → LMS'.
const LMS_FROM_LAB: number[][] = [
  [1.0, 0.3963377774, 0.2158037573],
  [1.0, -0.1055613458, -0.0638541728],
  [1.0, -0.0894841775, -1.291485548],
]
// LMS → linear-sRGB.
const LIN_FROM_LMS: number[][] = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
]

function mul(m: number[][], v: number[]): number[] {
  return m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2])
}

/** sRGB → OKLab (Björn Ottosson's reference math, the exact color space CSS
 * `color-mix(in oklab, …)` operates in). */
export function srgbToOklab({ r, g, b }: Rgb): OkLab {
  const [l, m, s] = mul(LMS_FROM_LIN, [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]).map(
    Math.cbrt,
  )
  return mul(LAB_FROM_LMS, [l, m, s]) as OkLab
}

/** OKLab → sRGB (channels clamped to 0–255 after gamut mapping). */
export function oklabToSrgb([L, a, b]: OkLab): Rgb {
  const [l, m, s] = mul(LMS_FROM_LAB, [L, a, b]).map((x) => x ** 3)
  const [r, g, bl] = mul(LIN_FROM_LMS, [l, m, s])
  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(bl), a: 1 }
}

/**
 * CSS `color-mix(in oklab, A wa, B wb)` in a function. Weights are normalized
 * the way CSS normalizes them (a 30%/52% pair scales to 36.6%/63.4% — the
 * token ramp relies on this), and mixing is premultiplied by alpha so
 * `transparent` behaves exactly like the browser's color-mix.
 */
export function mixOklab(c1: Rgb, c2: Rgb, w1: number, w2: number): Rgb {
  const total = w1 + w2
  if (total <= 0) return { ...BLACK, a: 0 }
  const p1 = w1 / total
  const p2 = w2 / total
  const a1 = c1.a ?? 1
  const a2 = c2.a ?? 1
  // Premultiply by alpha, mix, then un-premultiply (CSS color-mix § premultiplied
  // alpha): the mixed color carries (weight × alpha), alpha mixes plain, and the
  // stored channels are divided back out so compositing the result over a
  // surface paints exactly what the browser paints.
  const lab1 = srgbToOklab(c1)
  const lab2 = srgbToOklab(c2)
  const alpha = p1 * a1 + p2 * a2
  if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 }
  const mixed = [0, 1, 2].map((i) => (lab1[i] * p1 * a1 + lab2[i] * p2 * a2) / alpha) as OkLab
  const out = oklabToSrgb(mixed)
  return { ...out, a: alpha }
}

/**
 * Parse one CSS color value into sRGB. Supports the formats the token file
 * uses: hex (`#rgb`, `#rrggbb`, `#rrggbbaa`), `rgb()/rgba()` (comma or space
 * syntax, optional %), the named colors white/black/transparent, `var(…)`
 * references resolved against `vars`, and `color-mix(in oklab, …)` (the only
 * mix method the tokens use). Returns null for anything unparseable — callers
 * decide whether that's fatal.
 */
export function parseColor(
  value: string,
  vars: Record<string, string> = {},
  depth = 0,
): Rgb | null {
  if (depth > 32) return null // var() cycle or runaway nesting
  const v = value.trim()

  if (v.startsWith('var(')) {
    const inner = v.slice(4, v.lastIndexOf(')'))
    const comma = splitTopLevel(inner, ',')
    const name = comma[0].trim()
    const fallback = comma.length > 1 ? comma.slice(1).join(',') : undefined
    const resolved = vars[name]
    if (resolved !== undefined) return parseColor(resolved, vars, depth + 1)
    if (fallback !== undefined) return parseColor(fallback, vars, depth + 1)
    return null
  }

  if (v.startsWith('#')) {
    const hex = v.slice(1)
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a = 'f'] = hex.split('')
      return {
        r: parseInt(r + r, 16),
        g: parseInt(g + g, 16),
        b: parseInt(b + b, 16),
        a: parseInt(a + a, 16) / 255,
      }
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      }
    }
    return null
  }

  if (v in NAMED) return { ...NAMED[v] }

  if (v.startsWith('color-mix')) {
    const open = v.indexOf('(')
    const inner = v.slice(open + 1, v.lastIndexOf(')'))
    const args = splitTopLevel(inner, ',')
    if (args.length !== 3 || !args[0].trim().startsWith('in oklab')) return null
    const parseComponent = (s: string): { color: Rgb; weight: number | null } | null => {
      const pctMatch = s.match(/([\d.]+)%\s*$/)
      const weight = pctMatch ? parseFloat(pctMatch[1]) / 100 : null
      const colorPart = pctMatch ? s.slice(0, pctMatch.index).trim() : s.trim()
      const color = parseColor(colorPart, vars, depth + 1)
      return color ? { color, weight } : null
    }
    const a = parseComponent(args[1])
    const b = parseComponent(args[2])
    if (!a || !b) return null
    const w1 = a.weight ?? (b.weight !== null ? 1 - b.weight : 0.5)
    const w2 = b.weight ?? 1 - w1
    return mixOklab(a.color, b.color, w1, w2)
  }

  if (v.startsWith('rgb')) {
    const nums = (v.match(/-?[\d.]+/g) ?? []).map(Number)
    if (nums.length < 3) return null
    const pct = v.includes('%')
    const scale = (x: number) => (pct ? (x / 100) * 255 : x)
    return {
      r: scale(nums[0]),
      g: scale(nums[1]),
      b: scale(nums[2]),
      a: nums[3] !== undefined ? (nums[3] > 1 ? nums[3] / 255 : nums[3]) : 1,
    }
  }

  return null
}

/** Split on `sep` at paren-depth zero (so nested color-mix/var args survive). */
function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === sep && depth === 0) {
      parts.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  parts.push(cur)
  return parts
}

// ── WCAG 2.1 ────────────────────────────────────────────────────────────────

/** WCAG 2.1 relative luminance (spec constants: 0.03928 threshold, 2.2 weights). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const [R, G, B] = [r, g, b].map((c) => {
    const v = Math.min(1, Math.max(0, c / 255))
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

/**
 * WCAG 2.1 contrast ratio, 1:1 → 21:1. `((L1+0.05)/(L2+0.05))` with the
 * lighter color on top; alpha is ignored (callers composite soft/transparent
 * backgrounds over their real surface with mixOklab first — that is how the
 * browser paints them).
 */
export function contrastRatio(fg: Rgb, bg: Rgb): number {
  const l1 = relativeLuminance(fg)
  const l2 = relativeLuminance(bg)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * WCAG 2.1 AA check: 4.5:1 for body text, 3:1 for large text (≥18pt regular
 * or ≥14pt bold — ui-design-signature §3.1's two thresholds). Returns the
 * verdict so tests can assert per pairing instead of throwing on the first.
 */
export function assertAA(ratio: number, { large = false }: { large?: boolean } = {}): boolean {
  return ratio >= (large ? 3 : 4.5)
}

// ── CSS custom-property parsing (for reading a token file without a DOM) ────

export interface CssBlock {
  selector: string
  /** Custom properties only (`--*`); other declarations are dropped. */
  decls: Record<string, string>
}

/**
 * Extract custom-property declarations from a stylesheet string. Top-level
 * blocks only (media/at-rule bodies are intentionally ignored — the token
 * file defines everything on `:root`, `[data-theme=…]` and `.dark`).
 * Comments are stripped first so they can't glue selectors together.
 */
export function parseCssCustomProperties(css: string): CssBlock[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks: CssBlock[] = []
  const re = /(^|})\s*([^{}@]+)\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const selector = m[2].trim()
    const start = m.index + m[0].length
    let depth = 1
    let i = start
    while (depth > 0 && i < text.length) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') depth--
      i++
    }
    const decls: Record<string, string> = {}
    for (const decl of text.slice(start, i - 1).split(';')) {
      const idx = decl.indexOf(':')
      if (idx === -1) continue
      const name = decl.slice(0, idx).trim()
      if (name.startsWith('--')) decls[name] = decl.slice(idx + 1).trim()
    }
    blocks.push({ selector, decls })
    re.lastIndex = i - 1 // resume ON the closing brace so nothing is skipped
  }
  return blocks
}

/**
 * Merge the custom properties of every block whose selector list contains one
 * of `selectors` (later blocks win, mirroring the cascade). Selector lists are
 * split on commas, so `:root, [data-theme='calm']` matches either.
 */
export function collectVars(blocks: CssBlock[], selectors: string[]): Record<string, string> {
  const wanted = selectors.map((s) => s.trim())
  const vars: Record<string, string> = {}
  for (const block of blocks) {
    if (block.selector.split(',').some((s) => wanted.includes(s.trim()))) {
      Object.assign(vars, block.decls)
    }
  }
  return vars
}
