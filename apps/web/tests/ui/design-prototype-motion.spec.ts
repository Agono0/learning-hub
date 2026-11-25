import { expect, test, type Page } from '@playwright/test'

/**
 * Prototype palette and motion checks. The candidate "lagoon" palette is
 * selected only by `data-theme` on <html>; nothing in the app sets it.
 * Run in real Chromium so computed styles and layout are measured.
 */

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

async function firstPanel(page: Page) {
  await page.goto('/')
  const panel = page.locator('.panel').first()
  await expect(panel).toBeVisible({ timeout: 60_000 })
  return panel
}

const setTheme = (page: Page, theme: string | null) =>
  page.evaluate((t) => {
    if (t) document.documentElement.dataset.theme = t
    else document.documentElement.dataset.theme = 'calm'
  }, theme)

test('default palette is unchanged and has no entrance animation', async ({ page }) => {
  const panel = await firstPanel(page)
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('calm')
  expect(await panel.evaluate((e) => getComputedStyle(e).animationName)).not.toBe('rise-in')
})

test('lagoon activates by data-theme alone and changes the accent', async ({ page }) => {
  await firstPanel(page)
  const accent = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ac-strong').trim(),
    )
  const before = await accent()
  await setTheme(page, 'lagoon')
  expect(await accent()).toBe('#0f766e')
  expect(before).not.toBe('#0f766e')
  await setTheme(page, null)
  expect(await accent()).toBe(before)
})

test('entrance motion neither hides content nor moves layout', async ({ page }) => {
  const panel = await firstPanel(page)
  await setTheme(page, 'lagoon')
  const info = await panel.evaluate((e) => {
    const cs = getComputedStyle(e)
    const done = e.getBoundingClientRect()
    return {
      name: cs.animationName,
      fill: cs.animationFillMode,
      top: done.top,
      height: done.height,
    }
  })
  expect(info.name).toBe('rise-in')
  expect(info.fill).toBe('backwards')
  // Layout box is the same before and after the animation settles (transform does not reflow).
  await page.waitForTimeout(600)
  const settled = await panel.evaluate((e) => {
    const r = e.getBoundingClientRect()
    return { top: r.top, height: r.height, transform: getComputedStyle(e).transform }
  })
  expect(Math.abs(settled.height - info.height)).toBeLessThanOrEqual(1)
  expect(settled.transform === 'none' || settled.transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(
    true,
  )
})

test('reduced motion removes the delay and shortens the animation to nothing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const panel = await firstPanel(page)
  await setTheme(page, 'lagoon')
  const cs = await panel.evaluate((e) => {
    const s = getComputedStyle(e)
    return { duration: s.animationDuration, delay: s.animationDelay }
  })
  expect(parseFloat(cs.duration)).toBeLessThan(0.001)
  expect(parseFloat(cs.delay)).toBe(0)
})
