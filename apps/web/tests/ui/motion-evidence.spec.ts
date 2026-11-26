import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * Motion and loading-state evidence on the real app (`next dev`/`next start`, seeded fixture DB).
 *  - skeleton frames: the REAL handlers with the dashboard responses artificially held back, so the
 *    loading state is on screen long enough to capture (delayed-response evidence, not an error).
 *  - entrance frames: PNGs of Today at fixed offsets after navigation, plus a per-animation-frame
 *    sample of computed opacity/transform of the first panels (browser-computed values), for normal
 *    motion and for prefers-reduced-motion.
 *  - a recorded .webm of Today -> Review -> Decks through the sidebar (viewed as sampled frames).
 * Files land in VISUAL_OUT (default visual-out). Pass/fail asserts only that things rendered and
 * that reduced-motion produced no opacity/transform animation.
 */
const OUT = path.resolve(process.cwd(), process.env.VISUAL_OUT ?? 'visual-out')
mkdirSync(OUT, { recursive: true })

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
    window.localStorage.setItem('lh-theme', 'dark')
  })
})

test.describe('skeleton loading frames (responses held back)', () => {
  for (const [slug, vp] of [
    ['desktop', { width: 1280, height: 800 }],
    ['narrow', { width: 390, height: 844 }],
  ] as const) {
    test(`today ${slug}`, async ({ page }) => {
      await page.setViewportSize(vp)
      let release!: () => void
      const gate = new Promise<void>((r) => (release = r))
      await page.route('**/api/dashboard**', async (route) => {
        await gate
        await route.continue()
      })
      await page.goto('/', { waitUntil: 'commit' })
      await page.waitForSelector('.animate-pulse', { timeout: 60_000 })
      await page.waitForTimeout(400)
      const skeletons = await page.locator('.animate-pulse').count()
      await page.screenshot({ path: path.join(OUT, `motion-skeleton-today-${slug}.png`) })
      writeFileSync(
        path.join(OUT, `motion-skeleton-today-${slug}.json`),
        JSON.stringify({ skeletons, note: 'dashboard responses held back by the test' }),
      )
      expect(skeletons).toBeGreaterThan(0)
      release()
      await expect(page.locator('h1').first()).toBeVisible()
    })
  }
})

for (const mode of ['normal', 'reduced'] as const) {
  test.describe(`entrance motion, ${mode}`, () => {
    test.use({
      viewport: { width: 1280, height: 800 },
      reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference',
    })
    test('today entrance frames and computed samples', async ({ page }) => {
      await page.goto('/', { waitUntil: 'commit' })
      // Start sampling once the page content has attached, so the entrance (or its absence under
      // reduced motion) is inside the sampled window.
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 60_000 })
      // Install the sampler as early as the document allows, then capture timed frames.
      const samples = page.evaluate(
        () =>
          new Promise<Array<{ t: number; vals: Array<{ o: string; tr: string }> }>>((resolve) => {
            const out: Array<{ t: number; vals: Array<{ o: string; tr: string }> }> = []
            const t0 = performance.now()
            const tick = () => {
              const els = Array.from(
                document.querySelectorAll('main .panel, main [class*="bento"]'),
              )
                .filter((e) => e instanceof HTMLElement)
                .slice(0, 6)
              out.push({
                t: Math.round(performance.now() - t0),
                vals: els.map((e) => {
                  const cs = getComputedStyle(e)
                  return { o: cs.opacity, tr: cs.transform }
                }),
              })
              if (performance.now() - t0 < 1800) requestAnimationFrame(tick)
              else resolve(out)
            }
            requestAnimationFrame(tick)
          }),
      )
      let elapsed = 0
      for (const ms of [150, 350, 700, 1500]) {
        await page.waitForTimeout(ms - elapsed)
        elapsed = ms
        await page.screenshot({ path: path.join(OUT, `motion-entrance-${mode}-${ms}ms.png`) })
      }
      const rows = await samples
      const distinctOpacity = new Set(rows.flatMap((r) => r.vals.map((v) => v.o))).size
      const distinctTransform = new Set(rows.flatMap((r) => r.vals.map((v) => v.tr))).size
      writeFileSync(
        path.join(OUT, `motion-samples-${mode}.json`),
        JSON.stringify({ frames: rows.length, distinctOpacity, distinctTransform, rows }),
      )
      if (mode === 'reduced') {
        expect(distinctTransform).toBeLessThanOrEqual(1)
        expect(distinctOpacity).toBe(1)
      }
    })
  })
}

test.describe('recorded navigation', () => {
  // Video cannot be switched on inside a describe via test.use, so this test records through an
  // explicit context that mirrors the project's baseURL and service-worker setting.
  test('today to review to decks through the sidebar', async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      serviceWorkers: 'block',
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: path.join(OUT, 'video-tmp'), size: { width: 1280, height: 800 } },
    })
    await context.addInitScript(() => {
      window.localStorage.setItem('lh-onboarding-dismissed', '1')
      window.localStorage.setItem('lh-theme', 'dark')
    })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 60_000 })
    await page.waitForTimeout(1200)
    await page.getByRole('link', { name: 'Review', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: 'Review', level: 1 })).toBeVisible()
    await page.waitForTimeout(1200)
    await page.getByRole('link', { name: /Decks/ }).first().click()
    await expect(page.locator('h1').first()).toBeVisible()
    await page.waitForTimeout(1200)
    const video = page.video()
    await context.close()
    await video?.saveAs(path.join(OUT, 'motion-nav.webm'))
    rmSync(path.join(OUT, 'video-tmp'), { recursive: true, force: true })
  })
})

/**
 * 3D / canvas studio routes. Headless Chromium may have no GPU; this records what actually
 * happened (WebGL available, canvases present, console/page errors) next to the screenshot and
 * does NOT fail on WebGL-specific errors, so a blank canvas is classified, never claimed.
 */
test.describe('3D and canvas routes (classified, not asserted)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  for (const [slug, url] of [
    ['palace-3d', '/palace-3d'],
    ['graph', '/graph'],
    ['world', '/world'],
  ] as const) {
    test(slug, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`))
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`)
      })
      page.on('response', (r) => {
        if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url().slice(0, 160)}`)
      })
      await page.goto(url, { waitUntil: 'commit' })
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 60_000 })
      await page.waitForTimeout(3000)
      const info = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl')
        return {
          h1: document.querySelector('h1')?.textContent ?? '',
          webgl: !!gl,
          canvases: Array.from(document.querySelectorAll('canvas')).map((c) => ({
            w: c.width,
            h: c.height,
          })),
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        }
      })
      await page.screenshot({ path: path.join(OUT, `studio-${slug}-desktop-dark.png`) })
      writeFileSync(path.join(OUT, `studio-${slug}.json`), JSON.stringify({ ...info, errors }))
    })
  }
})
