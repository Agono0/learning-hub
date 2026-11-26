import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * Actual-route screenshots of the redesign (real `next dev`, real Chromium, the real pages on the
 * seeded fixture DB; no API mocks in this spec). Matrix: dark and light at desktop (1280x800),
 * dark at narrow (390x844, plus a max-scroll shot per route to prove the last control clears the
 * bottom nav), and dark with prefers-reduced-motion on Today. Files land in visual-out/ and are
 * uploaded as the "visual-screenshots" CI artifact. Pass/fail only asserts the page rendered a
 * level-1 heading with no horizontal overflow; the pixels are inspected by eye.
 */
const OUT = path.resolve(process.cwd(), 'visual-out')
mkdirSync(OUT, { recursive: true })

const ROUTES: Array<{ slug: string; url: string }> = [
  { slug: 'today', url: '/' },
  { slug: 'review', url: '/review' },
  { slug: 'decks', url: '/decks' },
  { slug: 'courses', url: '/courses' },
  { slug: 'planner', url: '/planner' },
  { slug: 'metrics', url: '/metrics' },
  { slug: 'search', url: '/search' },
  { slug: 'settings', url: '/settings' },
  { slug: 'backup', url: '/backup' },
  { slug: 'focus', url: '/focus' },
]

async function prepare(
  page: import('@playwright/test').Page,
  context: import('@playwright/test').BrowserContext,
  theme: 'dark' | 'light',
) {
  await context.addInitScript((t) => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
    window.localStorage.setItem('lh-theme', t)
  }, theme)
  void page
}

async function settle(page: import('@playwright/test').Page) {
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(900)
}

async function noHorizontalOverflow(page: import('@playwright/test').Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(over).toBeLessThanOrEqual(1)
}

for (const mode of [
  { name: 'desktop-dark', w: 1280, h: 800, theme: 'dark' as const },
  { name: 'desktop-light', w: 1280, h: 800, theme: 'light' as const },
  { name: 'narrow-dark', w: 390, h: 844, theme: 'dark' as const },
]) {
  test.describe(mode.name, () => {
    test.use({ viewport: { width: mode.w, height: mode.h } })
    for (const r of ROUTES) {
      test(`${r.slug}`, async ({ page, context }) => {
        await prepare(page, context, mode.theme)
        await page.goto(r.url)
        await settle(page)
        await noHorizontalOverflow(page)
        await page.screenshot({ path: path.join(OUT, `redesign-${r.slug}-${mode.name}.png`) })
        if (mode.w < 500) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
          await page.waitForTimeout(300)
          await page.screenshot({
            path: path.join(OUT, `redesign-${r.slug}-${mode.name}-maxscroll.png`),
          })
        }
      })
    }
  })
}

test.describe('reduced motion', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
  test('today', async ({ page, context }) => {
    await prepare(page, context, 'dark')
    await page.goto('/')
    await settle(page)
    await page.screenshot({ path: path.join(OUT, 'redesign-today-reduced-motion.png') })
  })
})
