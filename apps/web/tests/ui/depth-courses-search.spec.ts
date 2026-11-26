import path from 'node:path'
import fs from 'node:fs'
import { expect, test } from '@playwright/test'

/**
 * Depth pass for /search and /courses. Search hits are MOCK-BACKED (the response of /api/search
 * is fulfilled in the browser, no external network) so the highlight/link behavior is
 * deterministic; the Courses page runs against the real fixture DB.
 */
const OUT = path.resolve(process.cwd(), process.env.VISUAL_OUT ?? 'visual-out')
test.beforeEach(async ({ context }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
    window.localStorage.setItem('lh-theme', 'light')
  })
})

test('search hits are links and highlight the query terms (mock-backed hits)', async ({ page }) => {
  await page.route('**/api/search?**', (route) =>
    route.fulfill({
      json: {
        ok: true,
        mode: 'fts5',
        hits: [
          {
            kind: 'note',
            id: 1,
            title: 'Spacing and forgetting',
            snippet: 'Spaced practice slows forgetting between reviews.',
            href: '/notes',
          },
          {
            kind: 'card',
            id: 2,
            title: 'Forgetting curve',
            snippet: 'Retrieval resets the curve.',
            href: '/decks',
          },
        ],
      },
    }),
  )
  await page.goto('/search')
  await page.getByLabel('Search query').fill('forgetting')
  const link = page.getByRole('link', { name: /Spacing and forgetting/ })
  await expect(link).toBeVisible({ timeout: 30_000 })
  await expect(link).toHaveAttribute('href', '/notes')
  expect(await page.locator('mark.search-mark').count()).toBeGreaterThanOrEqual(3)
  await expect(page.locator('mark.search-mark').first()).toHaveText(/forgetting/i)
  await page.screenshot({ path: path.join(OUT, 'depth-search-hits.png') })
})

test('courses page renders (real fixtures); hero tile appears when a course is resumable', async ({
  page,
}) => {
  await page.goto('/courses')
  await expect(page.getByRole('heading', { name: 'Courses', level: 1 }).first()).toBeVisible({
    timeout: 60_000,
  })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(OUT, 'depth-courses.png'), fullPage: true })
  const hero = page.locator('#courses-continue-title')
  if (await hero.count()) {
    await expect(hero).toBeVisible()
    await expect(page.getByText('Lessons done')).toBeVisible()
  }
})
