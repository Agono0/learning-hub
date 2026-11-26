import { expect, test, type Page } from '@playwright/test'

/**
 * Course authoring page at a phone size (390x844): no page-level sideways
 * overflow, every tab reachable, and the last control on each tab clears the
 * bottom navigation at max scroll. Real Chromium, so layout is measured.
 */

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

const TABS = ['Review', 'Alignment', 'Restructure', 'Compare', 'Export']

async function open(page: Page) {
  await page.goto('/course-authoring')
  await expect(page.getByRole('heading', { name: 'Course authoring' })).toBeVisible({
    timeout: 60_000,
  })
  await page
    .getByRole('button', { name: 'Later' })
    .click({ timeout: 2000 })
    .catch(() => {})
  await page.getByRole('button', { name: 'Load example course' }).click()
  await expect(page.getByRole('tab', { name: 'Review' })).toBeVisible()
}

const noSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

/** Scroll to the very bottom and say whether `locator` ends above the fixed bottom bar. */
async function clearsBottomNav(page: Page, name: string | RegExp) {
  const target = page.getByRole('button', { name }).last()
  await target.scrollIntoViewIfNeeded()
  await page.evaluate(() => {
    for (const e of [document.scrollingElement, ...document.querySelectorAll('main')])
      if (e) e.scrollTop = e.scrollHeight
    window.scrollTo(0, document.body.scrollHeight)
  })
  const box = await target.boundingBox()
  const navTop = await page.evaluate(() => {
    const bars = [...document.querySelectorAll('nav, [role="navigation"]')]
      .map((n) => ({ n, r: n.getBoundingClientRect(), p: getComputedStyle(n).position }))
      .filter((x) => x.p === 'fixed' && x.r.bottom >= window.innerHeight - 2 && x.r.height < 140)
    return bars.length ? Math.min(...bars.map((b) => b.r.top)) : window.innerHeight
  })
  expect(box).not.toBeNull()
  expect(navTop, 'a fixed bottom bar was found').toBeLessThan(844)
  return box!.y + box!.height <= navTop + 1
}

test('every tab is reachable at 390px with no sideways page overflow', async ({ page }) => {
  await open(page)
  const tablist = page.getByRole('tablist', { name: 'Authoring tools' })
  for (const name of TABS) {
    const tab = page.getByRole('tab', { name })
    await tab.scrollIntoViewIfNeeded()
    const box = await tab.boundingBox()
    expect(box, name).not.toBeNull()
    expect(box!.x, `${name} starts on screen`).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width, `${name} ends on screen`).toBeLessThanOrEqual(390)
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(await noSideways(page), `${name}: page scrollWidth`).toBe(true)
  }
  const scrolls = await tablist.evaluate((el) => el.scrollWidth <= el.clientWidth)
  expect(scrolls).toBe(true)
})

test('merge and export controls clear the bottom navigation at max scroll', async ({ page }) => {
  await open(page)
  await page.getByRole('tab', { name: 'Compare' }).click()
  await page.getByRole('button', { name: 'Merge with a base' }).click()
  const box = await page.getByRole('button', { name: 'Merge with a base' }).boundingBox()
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  expect(await noSideways(page)).toBe(true)
  expect(await clearsBottomNav(page, 'Merge with a base')).toBe(true)

  await page.getByRole('tab', { name: 'Export' }).click()
  await page.getByRole('button', { name: 'Build packet' }).click()
  await expect(page.getByTestId('packet-info')).toBeVisible()
  expect(await noSideways(page)).toBe(true)
  expect(await clearsBottomNav(page, /^Download /)).toBe(true)
})

test('leaving answers out says that worked examples keep theirs', async ({ page }) => {
  await open(page)
  await page.getByRole('tab', { name: 'Export' }).click()
  await page.getByLabel(/Include answers/).uncheck()
  await expect(page.getByTestId('worked-example-note')).toContainText('always keep their answers')
})
