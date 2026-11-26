import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * Motion and loading-state evidence on the real app (`next dev`/`next start`, seeded fixture DB).
 *  - skeleton frames: the REAL handlers with the dashboard responses artificially held back, so the
 *    loading state is on screen long enough to capture (delayed-response evidence, not an error).
 *  - entrance frames: PNGs of Today at fixed offsets after the content attaches, for normal motion
 *    and for prefers-reduced-motion.
 *  - a recorded .webm of Today -> Review -> Decks through the sidebar (viewed as sampled frames).
 * Files land in VISUAL_OUT (default visual-out). Pass/fail asserts that things rendered and, in
 * reduced motion, that the last-staggered block (Review loop) is already fully opaque at attach.
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
    test('today entrance frames', async ({ page }) => {
      await page.goto('/', { waitUntil: 'commit' })
      // Frames are timed from the moment the page content has attached.
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 60_000 })
      // The last-staggered block, measured on the real node chain: the lowest computed opacity of
      // the 'Review loop' panel and every ancestor, the instant the heading is visible.
      const loopOpacity = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll('main *')).find(
          (e) => e.children.length === 0 && /^review loop$/i.test((e.textContent ?? '').trim()),
        )
        let min = 1
        for (let n: Element | null = label ?? null; n && n !== document.body; n = n.parentElement) {
          min = Math.min(min, Number(getComputedStyle(n).opacity))
        }
        return label ? min : null
      })
      writeFileSync(
        path.join(OUT, `motion-loop-opacity-${mode}.json`),
        JSON.stringify({ loopOpacityAtAttach: loopOpacity }),
      )
      if (mode === 'reduced') expect(loopOpacity).toBe(1)
      let elapsed = 0
      for (const ms of [150, 350, 700, 1500]) {
        await page.waitForTimeout(ms - elapsed)
        elapsed = ms
        await page.screenshot({ path: path.join(OUT, `motion-entrance-${mode}-${ms}ms.png`) })
      }
      // Only the emulation itself is asserted. Whether the page animates is judged from the timed
      // frames above (no computed-style sampler: it measured the wrong nodes and proved nothing).
      const mq = await page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      )
      expect(mq).toBe(mode === 'reduced')
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

/**
 * E-ink theme captures. ThemeSync's persisted-settings path overrides localStorage after load, so
 * the e-ink class state is applied directly (the same classes ThemeSync toggles: theme-e-ink on,
 * dark off). The colored-pixel share is computed afterwards from the PNGs, not here.
 */
test.describe('e-ink theme captures', () => {
  for (const [slug, url] of [
    ['today', '/'],
    ['review', '/review'],
    ['settings', '/settings'],
    ['decks', '/decks'],
  ] as const) {
    for (const [vpName, vp] of [
      ['desktop', { width: 1280, height: 800 }],
      ['narrow', { width: 390, height: 844 }],
    ] as const) {
      test(`${slug} ${vpName}`, async ({ page }) => {
        await page.setViewportSize(vp)
        await page.goto(url)
        await expect(page.locator('h1').first()).toBeVisible({ timeout: 60_000 })
        await page
          .waitForFunction(() => document.querySelector('.animate-pulse') === null, undefined, {
            timeout: 15_000,
          })
          .catch(() => undefined)
        await page.waitForTimeout(900)
        await page.evaluate(() => {
          document.documentElement.classList.remove('dark')
          document.documentElement.classList.add('theme-e-ink')
          document.documentElement.style.colorScheme = 'light'
        })
        await page.waitForTimeout(300)
        const anim = await page.evaluate(
          () =>
            Array.from(document.querySelectorAll('*')).filter(
              (e) => getComputedStyle(e).animationName !== 'none',
            ).length,
        )
        await page.screenshot({ path: path.join(OUT, `eink-${slug}-${vpName}.png`) })
        writeFileSync(
          path.join(OUT, `eink-${slug}-${vpName}.json`),
          JSON.stringify({ animatedElements: anim }),
        )
        expect(anim).toBe(0)
        // Regression: a combined display:none rule once hid the whole hero tile in e-ink.
        if (slug === 'today') await expect(page.locator('#today-next-title')).toBeVisible()
      })
    }
  }
})
