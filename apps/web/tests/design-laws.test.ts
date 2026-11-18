import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Design-law gate (docs/ui-design-signature.md §3.4-3.6, §2 law 4/8;
 * ui-ux-next-plan.md Phase 1 acceptance 2-4 + Phase 2 acceptance 3).
 *
 * These greps encode the bans that are mechanically checkable:
 * 1. No ghost vocabulary — shadcn-style tokens that resolve to nothing in this
 *    Tailwind v4 @theme (bg-card, text-primary, text-muted-foreground, …).
 * 2. No red-* utilities — danger is rose, backed by --danger-* tokens.
 * 3. No dead animation classes — every animate-* class must exist in
 *    globals.css or the Tailwind core.
 * 4. No window.alert / window.confirm — calm error/confirm surfaces only.
 */

const here = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(here, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(name)) out.push(p)
  }
  return out
}

const files = walk(join(WEB, 'app')).concat(walk(join(WEB, 'src')))
const sourceOf = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]))

const rel = (f: string) => f.slice(WEB.length + 1)

describe('design laws (ui-design-signature §3.4-3.6)', () => {
  it('has source files to scan', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('renders zero ghost utility classes (§3.4 banned vocabulary)', () => {
    // The shadcn-style names that have no --color-* in this @theme, so the
    // generated utilities resolve to nothing (they were silently invisible).
    const banned =
      /\b(?:[\w-]+:)*(?:bg|text|border|ring|divide|fill|stroke)-(?:card|popover|background|muted|accent|destructive|ring)(?:-\w+)?(?:\/\d+)?(?=[\s"'`)}])|\b(?:[\w-]+:)*(?:text|fill|stroke)-(?:primary|foreground|muted-foreground|accent-foreground)(?:\/\d+)?(?=[\s"'`)}])|\b(?:[\w-]+:)*(?:bg|border|ring)-(?:primary|secondary)(?:\/\d+)?(?=[\s"'`)}])/
    const offenders: string[] = []
    for (const [file, src] of sourceOf) {
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        if (banned.test(line)) offenders.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 140)}`)
      })
    }
    expect(offenders, `ghost classes found:\n${offenders.join('\n')}`).toEqual([])
  })

  it('uses rose, never red, for danger (§3.2 one hue per meaning)', () => {
    const red =
      /\b(?:[\w-]+:)*(?:bg|text|border|ring|from|to|via|divide|fill|stroke)-red-\d+(?:\/\d+)?(?=[\s"'`)}])/
    const offenders: string[] = []
    for (const [file, src] of sourceOf) {
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        if (red.test(line)) offenders.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 140)}`)
      })
    }
    expect(offenders, `red-* classes found:\n${offenders.join('\n')}`).toEqual([])
  })

  it('never uses dead or undefined animation classes (§3.5)', () => {
    // classes that were written as intent but never defined anywhere
    const dead = /animate-in|animate-fadeIn|zoom-in-\d+|fade-in-\d+|slide-in-from-[\w-]+/
    // utilities that DO exist and are allowed
    const allowed = new Set([
      'animate-spin',
      'animate-ping',
      'animate-pulse',
      'animate-bounce',
      'animate-glow-pulse',
      'animate-fade-in',
      'animate-fade-in-up',
      'animate-scale-in',
    ])
    const offenders: string[] = []
    for (const [file, src] of sourceOf) {
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        if (dead.test(line)) {
          offenders.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 140)}`)
          return
        }
        for (const m of line.matchAll(/\b(animate-[\w-]+)/g)) {
          if (!allowed.has(m[1])) {
            offenders.push(`${rel(file)}:${i + 1}: unknown ${m[1]}`)
          }
        }
      })
    }
    expect(offenders, `animation-law violations:\n${offenders.join('\n')}`).toEqual([])
  })

  it('never calls window.alert or window.confirm (§2 law 4 — calm surfaces only)', () => {
    const banned = /(^|[^.\w])(window\.)?(alert|confirm)\s*\(/
    const offenders: string[] = []
    for (const [file, src] of sourceOf) {
      // strip comments so prose about the law doesn't trip the gate
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      const lines = code.split('\n')
      lines.forEach((line, i) => {
        if (banned.test(line)) offenders.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 140)}`)
      })
    }
    expect(offenders, `alert/confirm calls found:\n${offenders.join('\n')}`).toEqual([])
  })
})
