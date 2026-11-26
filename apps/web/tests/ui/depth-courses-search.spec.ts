import path from 'node:path'
import fs from 'node:fs'
import { expect, test } from '@playwright/test'

/**
 * Depth pass for /search and /courses. Search hits are MOCK-BACKED (the response of /api/search
 * is fulfilled in the browser, no external network) so the highlight/link behavior is
 * deterministic; the Courses page runs against the real fixture DB.
 */
const OUT = path.resolve(process.cwd(), process.env.VISUAL_OUT ?? 'visual-out')
/** Set the intended mode on the root and ASSERT it, so a capture never carries a stale theme
 * (the persisted settings row can override localStorage after load). */
async function forceTheme(page: import('@playwright/test').Page, theme: 'dark' | 'light') {
  await page.evaluate((t) => {
    document.documentElement.classList.toggle('dark', t === 'dark')
    document.documentElement.style.colorScheme = t
  }, theme)
  await page.waitForTimeout(300)
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  expect(isDark).toBe(theme === 'dark')
}

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
  await forceTheme(page, 'light')
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
    await expect(page.getByText(/of 2 courses · 1 certified/)).toBeVisible()
    await expect(page.getByRole('link', { name: /Resume/ })).toHaveAttribute(
      'href',
      '/courses/lesson?id=5',
    )
    await forceTheme(page, vp.theme as 'dark' | 'light')
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
    await forceTheme(page, vp.theme as 'dark' | 'light')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(OUT, `depth-decks-${vp.name}.png`), fullPage: true })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    if (vp.width < 640) {
      // Browser-measured: the Leitner boxes are a compact strip at 390 wide (before: five stacked
      // tiles, ~90px each). Measured on the strip itself, not on the card row's page offset: that
      // offset also depends on how many decks other specs left in the shared test database.
      const strip = await page.evaluate(() => {
        const boxes = Array.from(document.querySelectorAll('button')).filter((b) =>
          /^Box \d,/.test(b.getAttribute('aria-label') ?? b.textContent ?? ''),
        )
        if (boxes.length < 2) return null
        const tops = boxes.map((b) => b.getBoundingClientRect().top)
        const bottoms = boxes.map((b) => b.getBoundingClientRect().bottom)
        return { count: boxes.length, height: Math.max(...bottoms) - Math.min(...tops) }
      })
      expect(strip).not.toBeNull()
      expect(strip!.height).toBeLessThan(200)
      await page.getByRole('button', { name: /^Box 1,/ }).click()
      await expect(page.getByRole('button', { name: /^Box 1,/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    }
  })
}

test('decks header actions: disabled with All decks, enabled with a deck (computed probe)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(() => window.localStorage.setItem('lh-theme', 'dark'))
  await page.goto('/decks')
  const newCard = page.getByRole('button', { name: /New card/ })
  const ai = page.getByRole('button', { name: /AI generate/ })
  await expect(newCard).toBeVisible({ timeout: 60_000 })
  await forceTheme(page, 'dark')
  const probe = (loc: import('@playwright/test').Locator) =>
    loc.evaluate((el) => {
      const cs = getComputedStyle(el)
      return {
        disabled: (el as HTMLButtonElement).disabled,
        opacity: cs.opacity,
        color: cs.color,
        background: cs.backgroundColor,
      }
    })
  await expect(page.locator('#decks-select-hint')).toBeVisible()
  await expect(newCard).toHaveAttribute('aria-describedby', 'decks-select-hint')
  const before = { newCard: await probe(newCard), ai: await probe(ai) }
  // Browser-measured computed values; not a contrast ratio, and disabled controls are exempt from WCAG text contrast.
  await page
    .getByRole('button', { name: /Smoke Test Deck/ })
    .first()
    .click()
  await expect(newCard).toBeEnabled()
  await page.waitForTimeout(400)
  const after = { newCard: await probe(newCard), ai: await probe(ai) }
  fs.writeFileSync(
    path.join(OUT, 'depth-decks-actions-probe.json'),
    JSON.stringify({ before, after }, null, 2),
  )
  await page.screenshot({ path: path.join(OUT, 'depth-decks-actions-enabled.png') })
  await expect(page.locator('#decks-select-hint')).toHaveCount(0)
  expect(before.newCard.disabled).toBe(true)
  expect(after.newCard.disabled).toBe(false)
  expect(after.ai.disabled).toBe(false)
  expect(Number(after.newCard.opacity)).toBe(1)
})
