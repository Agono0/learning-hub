import path from 'node:path'
import fs from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/**
 * Delivery set captured at the final head: key routes in light and dark, plus the command palette
 * and the onboarding sheet. Routes run against the real fixture DB. The onboarding sheet is
 * MOCK-BACKED: /api/settings is patched in the browser so the first-run state shows (no external
 * network). The theme is forced and ASSERTED immediately before every screenshot.
 */
const OUT = path.resolve(process.cwd(), process.env.VISUAL_OUT ?? 'visual-out')
type Theme = 'dark' | 'light'

async function forceTheme(page: Page, theme: Theme) {
  await page.evaluate((t) => {
    document.documentElement.classList.toggle('dark', t === 'dark')
    document.documentElement.style.colorScheme = t
  }, theme)
  await page.waitForTimeout(350)
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
    theme === 'dark',
  )
}

async function shot(page: Page, name: string, theme: Theme) {
  await forceTheme(page, theme)
  await page.screenshot({ path: path.join(OUT, `final-${name}-${theme}.png`) })
}

test.beforeEach(async ({ context }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

const ROUTES: Array<[string, string]> = [
  ['today', '/'],
  ['review', '/review'],
  ['decks', '/decks'],
  ['courses', '/courses'],
  ['search', '/search'],
  ['planner', '/planner'],
  ['settings', '/settings'],
  ['studio-productive-failure', '/productive-failure'],
]

test.describe('routes, desktop 1280x800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  test.setTimeout(240_000)
  for (const [name, url] of ROUTES) {
    test(`${name} light and dark`, async ({ page }) => {
      await page.goto(url)
      await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 60_000 })
      await page
        .waitForFunction(() => document.querySelector('.animate-pulse') === null, undefined, {
          timeout: 15_000,
        })
        .catch(() => undefined)
      await page.waitForTimeout(1500)
      await shot(page, name, 'light')
      await shot(page, name, 'dark')
    })
  }
})

for (const [label, size] of [
  ['desktop', { width: 1280, height: 800 }],
  ['narrow', { width: 390, height: 844 }],
] as const) {
  test.describe(`palette and onboarding, ${label}`, () => {
    test.use({ viewport: size })
    test.setTimeout(240_000)

    test('command palette', async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 60_000 })
      await page.waitForTimeout(1500)
      await page.keyboard.press('Control+k')
      const dialog = page.getByRole('dialog', { name: /command palette/i })
      await expect(dialog).toBeVisible({ timeout: 15_000 })
      await page.waitForTimeout(600)
      await shot(page, `palette-${label}`, 'light')
      await shot(page, `palette-${label}`, 'dark')
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)
    })

    test('onboarding sheet (mock-backed first-run settings)', async ({ page, context }) => {
      await context.addInitScript(() => window.localStorage.removeItem('lh-onboarding-dismissed'))
      await page.addInitScript(() => window.localStorage.removeItem('lh-onboarding-dismissed'))
      await page.route('**/api/settings', async (route) => {
        if (route.request().method() !== 'GET') return route.continue()
        const res = await route.fetch()
        const json = (await res.json()) as { settings?: Record<string, unknown> }
        json.settings = {
          ...(json.settings ?? {}),
          onboardingCompleted: false,
          isEmptyWorkspace: true,
        }
        return route.fulfill({ response: res, json })
      })
      await page.goto('/')
      const dialog = page.getByRole('dialog').first()
      await expect(dialog).toBeVisible({ timeout: 60_000 })
      await page.waitForTimeout(900)
      await shot(page, `onboarding-${label}`, 'light')
      await shot(page, `onboarding-${label}`, 'dark')
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)
    })
  })
}
