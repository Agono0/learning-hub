/**
 * Static-export guard: the native apps ship a static export, which cannot pre-render route
 * segments whose values only exist at runtime. Every dynamic `[param]` page under `app/`
 * must therefore define `generateStaticParams`, or use a flat route plus a query
 * parameter (see src/lib/use-id-param.ts). This reads source only; it changes nothing.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB_ROOT = resolve(__dirname, '..')
const APP_DIR = join(WEB_ROOT, 'app')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/^page\.(t|j)sx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('static-export route guard', () => {
  it('has no dynamic [param] page without generateStaticParams', () => {
    const offenders = walk(APP_DIR)
      .filter((f) => /[\\/]\[[^\]]+\][\\/]/.test(relative(APP_DIR, f)))
      .filter((f) => !readFileSync(f, 'utf8').includes('generateStaticParams'))
      .map((f) => relative(WEB_ROOT, f))
    expect(offenders).toEqual([])
  })

  it('serves channel detail from the flat /shared/detail route and links to it', () => {
    expect(existsSync(join(APP_DIR, 'shared', 'detail', 'page.tsx'))).toBe(true)
    const panel = readFileSync(join(WEB_ROOT, 'src/components/ShareChannelsPanel.tsx'), 'utf8')
    expect(panel).toContain('/shared/detail?channelId=${encodeURIComponent(')
    expect(panel).not.toMatch(/\/shared\/\$\{/)
  })
})
