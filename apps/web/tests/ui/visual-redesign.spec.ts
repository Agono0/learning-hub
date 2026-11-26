import { mkdirSync, writeFileSync } from 'node:fs'
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
  { slug: 'online', url: '/online' },
  { slug: 'tasks', url: '/tasks' },
  { slug: 'notes', url: '/notes' },
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

async function settle(page: import('@playwright/test').Page, theme: 'dark' | 'light' = 'dark') {
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 60_000 })
  // Wait for skeletons to resolve so the shot shows loaded content (the first render captured
  // the planner's loading skeleton). A route that never resolves is still captured after 15s.
  await page
    .waitForFunction(() => document.querySelector('.animate-pulse') === null, undefined, {
      timeout: 15_000,
    })
    .catch(() => undefined)
  await page.waitForTimeout(900)
  // The persisted settings row (default dark) wins over localStorage after load, so the light
  // capture flips the root class directly. CSS variables are mode-scoped, so this is the real
  // light stylesheet, not a filter.
  if (theme === 'light') {
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark')
      document.documentElement.style.colorScheme = 'light'
    })
    await page.waitForTimeout(300)
  }
}

/**
 * Narrow, explicit allowlist of EXPECTED runtime errors (regex on the recorded line). Empty on
 * purpose: every route currently renders with zero errors, so any HTTP >= 400, pageerror or
 * console.error fails the test. Add an entry only with the reason next to it.
 */
const EXPECTED_ERRORS: RegExp[] = []

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
        // Record real runtime errors apart from the Next dev overlay badge.
        const errors: string[] = []
        page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 2500)}`))
        page.on('response', (r) => {
          if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url().slice(0, 200)}`)
        })
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(`console.error: ${m.text().slice(0, 2500)}`)
        })
        await page.goto(r.url)
        await settle(page, mode.theme)
        await noHorizontalOverflow(page)
        writeFileSync(
          path.join(OUT, `errors-${r.slug}-${mode.name}.json`),
          JSON.stringify(errors, null, 2),
        )
        await page.screenshot({ path: path.join(OUT, `redesign-${r.slug}-${mode.name}.png`) })
        if (mode.w < 500) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
          await page.waitForTimeout(300)
          await page.screenshot({
            path: path.join(OUT, `redesign-${r.slug}-${mode.name}-maxscroll.png`),
          })
        }
        // Artifacts are already saved above, so a failure still leaves the evidence to read.
        expect(errors.filter((e) => !EXPECTED_ERRORS.some((re) => re.test(e)))).toEqual([])
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

/**
 * Real theme selection: click the Settings control, then reload and confirm the root class still
 * matches. Records the outcome to theme-persistence.json instead of asserting, so the artifact
 * shows what actually happened.
 */
test.describe('theme persistence (real control)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  test('light via Settings survives reload', async ({ page, context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('lh-onboarding-dismissed', '1')
    })
    await page.goto('/settings')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 60_000 })
    // Clicks before hydration finishes hit inert buttons (the first diagnostic run proved it:
    // no PUT, aria-pressed unchanged). Wait for the app to be interactive first (networkidle never settles: the app polls).
    await page.waitForTimeout(4000)
    const result: Record<string, unknown> = {}
    const group = page.getByRole('group', { name: 'Theme preference' })
    const puts: string[] = []
    page.on('response', (r) => {
      if (r.url().includes('/api/settings') && r.request().method() !== 'GET') {
        puts.push(`${r.request().method()} ${r.status()}`)
      }
    })
    await group.getByRole('button', { name: 'Light' }).click()
    result.darkClassImmediately = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    )
    result.lightPressedImmediately = await group
      .getByRole('button', { name: 'Light' })
      .getAttribute('aria-pressed')
    await page.waitForTimeout(800)
    result.settingsWrites = puts
    result.lightPressedAfter = await group
      .getByRole('button', { name: 'Light' })
      .getAttribute('aria-pressed')
    result.darkClassAfterClick = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    )
    await page.reload()
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 60_000 })
    await page.waitForTimeout(1500)
    result.darkClassAfterReload = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    )
    result.storedTheme = await page.evaluate(() => window.localStorage.getItem('lh-theme'))
    writeFileSync(path.join(OUT, 'theme-persistence.json'), JSON.stringify(result, null, 2))
    await page.screenshot({ path: path.join(OUT, 'redesign-settings-after-light-reload.png') })
    // Asserted behaviour: the real control switches to light and it survives a reload.
    expect(result.darkClassAfterClick).toBe(false)
    expect(result.darkClassAfterReload).toBe(false)
    expect(result.storedTheme).toBe('light')
  })
})

/**
 * Computed (browser) contrast for the text the critique flagged, on Today in light. Colors are
 * resolved through a canvas so color-mix() values become real RGB. Written to contrast-probe.json.
 */
test.describe('computed contrast probe', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  test('light nav and recall button', async ({ page, context }) => {
    await prepare(page, context, 'light')
    await page.goto('/')
    await settle(page, 'light')
    const rows = await page.evaluate(() => {
      const cv = document.createElement('canvas')
      cv.width = cv.height = 1
      const ctx = cv.getContext('2d')!
      const rgba = (c: string): [number, number, number, number] => {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = '#000'
        ctx.fillStyle = c
        ctx.fillRect(0, 0, 1, 1)
        const d = ctx.getImageData(0, 0, 1, 1).data
        return [d[0], d[1], d[2], d[3] / 255]
      }
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => {
          const x = v / 255
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
      }
      const bgOf = (el: Element | null): number[] => {
        let cur: Element | null = el
        while (cur) {
          const c = rgba(getComputedStyle(cur).backgroundColor)
          if (c[3] > 0.95) return c.slice(0, 3)
          cur = cur.parentElement
        }
        return [255, 255, 255]
      }
      const probe = (label: string, el: Element | null) => {
        if (!el) return { label, missing: true }
        const fg = rgba(getComputedStyle(el).color).slice(0, 3)
        const bg = bgOf(el)
        const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
        return { label, fg, bg, ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100 }
      }
      const nav = Array.from(document.querySelectorAll('nav[aria-label="Main"] a'))
      const inactive = nav.find((a) => a.getAttribute('aria-current') !== 'page') ?? null
      const recall = Array.from(document.querySelectorAll('button')).find((b) =>
        /Try recall/.test(b.textContent ?? ''),
      )
      return [
        probe('sidebar inactive link', inactive),
        probe('recall button', recall ?? null),
        probe('body caption', document.querySelector('[data-testid="quick-review-widget"] p')),
      ]
    })
    writeFileSync(path.join(OUT, 'contrast-probe.json'), JSON.stringify(rows, null, 2))
  })
})

test.describe('nav disclosure', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  test('manually opened "More ways to learn" stays open across client-side navigation', async ({
    page,
    context,
  }) => {
    await prepare(page, context, 'dark')
    await page.goto('/')
    await settle(page)
    const details = page.locator('nav[aria-label="Main"] details').first()
    await expect(details).not.toHaveAttribute('open', /.*/)
    await details.locator('summary').click()
    await expect(details).toHaveAttribute('open', /.*/)
    // Client-side navigation to a daily item (a Link, no full reload) must not reset the toggle.
    await page.locator('nav[aria-label="Main"] a[href="/review"]').first().click()
    await expect(page).toHaveURL(/\/review$/)
    await page.waitForTimeout(500)
    await expect(details).toHaveAttribute('open', /.*/)
  })
})
