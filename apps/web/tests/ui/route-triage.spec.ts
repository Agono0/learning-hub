import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * Route inventory, not a pass/fail gate per route. Visits EVERY static `app/**\/page.tsx` route
 * once (real fixtures, no external network) at 390px and records, per route: HTTP status of the
 * document, console/page errors, whether an h1 rendered, and horizontal overflow. The JSON is
 * uploaded with the screenshots so "not covered" can be split into "ran clean", "ran with
 * problems" and "never ran". The only hard assertion is that the survey itself completed.
 */
const OUT = path.resolve(process.cwd(), process.env.VISUAL_OUT ?? 'visual-out')
const APP = path.resolve(process.cwd(), 'app')

function pageRoutes(dir: string, base = ''): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('_') || e.name === 'api') continue
    const next = path.join(dir, e.name)
    if (e.name.startsWith('[') || e.name.startsWith('(')) continue
    if (fs.existsSync(path.join(next, 'page.tsx'))) out.push(`${base}/${e.name}`)
    out.push(...pageRoutes(next, `${base}/${e.name}`))
  }
  return out
}

test('route survey at 390px records status, errors, h1 and overflow', async ({ page, context }) => {
  test.setTimeout(25 * 60_000)
  fs.mkdirSync(OUT, { recursive: true })
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
    window.localStorage.setItem('lh-theme', 'light')
  })
  await page.setViewportSize({ width: 390, height: 844 })
  const routes = pageRoutes(APP).sort()
  const rows: Array<Record<string, unknown>> = []
  for (const url of routes) {
    const errors: string[] = []
    const onErr = (m: import('@playwright/test').ConsoleMessage) => {
      if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 700)}`)
    }
    const onPage = (e: Error) => errors.push(`pageerror: ${e.message.slice(0, 160)}`)
    page.on('console', onErr)
    page.on('pageerror', onPage)
    let status = 0
    let h1 = false
    let overflow = -1
    let note = ''
    let culprits: string[] = []
    let firstHeading = ''
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      status = res?.status() ?? 0
      h1 = await page
        .locator('h1')
        .first()
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => true)
        .catch(() => false)
      await page.waitForTimeout(500)
      overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      if (overflow > 0) {
        culprits = await page.evaluate(() => {
          const w = document.documentElement.clientWidth
          const out: Array<{ right: number; d: string }> = []
          const clipped = (el: Element) => {
            for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
              const ox = getComputedStyle(p).overflowX
              if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true
            }
            return false
          }
          for (const el of Array.from(document.body.querySelectorAll('*'))) {
            const r = el.getBoundingClientRect()
            if (r.width > 0 && r.right > w + 1 && !clipped(el)) {
              const cls = (el.getAttribute('class') ?? '').slice(0, 70)
              const par = el.parentElement
              out.push({
                right: Math.round(r.right),
                d: `${el.tagName.toLowerCase()}.${cls} w=${Math.round(r.width)} < ${par?.tagName.toLowerCase()}.${(par?.getAttribute('class') ?? '').slice(0, 60)}`,
              })
            }
          }
          out.sort((a, b) => b.right - a.right)
          return out.slice(0, 4).map((o) => `right=${o.right} ${o.d}`)
        })
      }
      if (!h1) {
        firstHeading = await page.evaluate(
          () => document.querySelector('h2,h3,[role=heading]')?.textContent?.slice(0, 60) ?? '',
        )
      }
    } catch (e) {
      note = `did not load: ${(e as Error).message.slice(0, 120)}`
    }
    page.off('console', onErr)
    page.off('pageerror', onPage)
    rows.push({
      url,
      status,
      h1,
      firstHeading,
      overflow,
      culprits,
      errors: errors.slice(0, 4),
      note,
    })
  }
  fs.writeFileSync(path.join(OUT, 'route-triage.json'), JSON.stringify(rows, null, 2))
  expect(rows.length).toBeGreaterThan(50)
})
