import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * Learning-science studio pages at 390px (real fixtures, no external network). The route survey
 * found these pages scrolling horizontally on a phone; this spec captures the worst ones and
 * FAILS if the document is wider than the viewport.
 */
const OUT = path.resolve(process.cwd(), process.env.VISUAL_OUT ?? 'visual-out')

for (const slug of ['productive-failure', 'peer-instruction']) {
  test(`${slug} fits 390px without horizontal page scroll`, async ({ page, context }) => {
    fs.mkdirSync(OUT, { recursive: true })
    await context.addInitScript(() => {
      window.localStorage.setItem('lh-onboarding-dismissed', '1')
      window.localStorage.setItem('lh-theme', 'light')
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/${slug}`)
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 60_000 })
    await page.waitForTimeout(1500)
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark')
      document.documentElement.style.colorScheme = 'light'
    })
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
      false,
    )
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
      false,
    )
    await page.screenshot({ path: path.join(OUT, `studio-${slug}-390.png`) })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
}
