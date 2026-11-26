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
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(OUT, 'depth-search-hits.png') })
})

const MOCK_COURSES = [
  {
    id: 1,
    slug: 'memory-foundations',
    title: 'Memory Foundations',
    subtitle: 'Retrieval, spacing and interleaving',
    emoji: '🧠',
    level: 'Beginner',
    estHours: 6,
    track: { id: 1, title: 'Learning science', emoji: '🔬' },
    progress: { completed: 4, total: 10, fraction: 0.4 },
    nextLesson: { id: 5, title: 'Why retrieval beats rereading' },
    certified: false,
    lhcf: true,
    updatedAt: '2026-11-25T10:00:00Z',
  },
  {
    id: 2,
    slug: 'study-systems',
    title: 'Study Systems',
    subtitle: 'Plan a week that holds',
    emoji: '🗓️',
    level: 'Intermediate',
    estHours: 4,
    track: { id: 1, title: 'Learning science', emoji: '🔬' },
    progress: { completed: 8, total: 8, fraction: 1 },
    nextLesson: null,
    certified: true,
    lhcf: true,
    updatedAt: '2026-11-20T10:00:00Z',
  },
]

for (const vp of [
  { name: 'desktop-dark', width: 1280, height: 800, theme: 'dark' },
  { name: 'narrow-light', width: 390, height: 844, theme: 'light' },
]) {
  test(`courses hero + stats, ${vp.name} (mock-backed catalog)`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.addInitScript((t) => window.localStorage.setItem('lh-theme', t), vp.theme)
    await page.route('**/api/curriculum/courses', (route) =>
      route.fulfill({ json: { courses: MOCK_COURSES } }),
    )
    await page.goto('/courses')
    const hero = page.locator('#courses-continue-title')
    await expect(hero).toHaveText('Why retrieval beats rereading', { timeout: 60_000 })
    await expect(page.getByText('Lessons done', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /Resume/ })).toHaveAttribute(
      'href',
      '/courses/lesson?id=5',
    )
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(OUT, `depth-courses-${vp.name}.png`), fullPage: true })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

test('courses empty fixture state renders (real fixtures)', async ({ page }) => {
  await page.goto('/courses')
  await expect(page.getByRole('heading', { name: 'Courses', level: 1 }).first()).toBeVisible({
    timeout: 60_000,
  })
})

for (const vp of [
  { name: 'desktop-dark', width: 1280, height: 800, theme: 'dark' },
  { name: 'narrow-light', width: 390, height: 844, theme: 'light' },
]) {
  test(`decks card rows reflow, ${vp.name} (real fixtures)`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.addInitScript((t) => window.localStorage.setItem('lh-theme', t), vp.theme)
    await page.goto('/decks')
    const edit = page.getByRole('button', { name: /^Edit card:/ }).first()
    await expect(edit).toBeVisible({ timeout: 60_000 })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(OUT, `depth-decks-${vp.name}.png`), fullPage: true })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
}
