import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * Actual-route visual check for the partial-import warning on /backup (real `next dev`, real
 * Chromium, the real page and file input). FIXTURE: the POST /api/import response is mocked
 * (a partial result: 3 cards imported, 2 rejected, 2 unsupported note types) because producing
 * a real partly-importable .apkg is not feasible in CI. Everything else on the page is real.
 * Screenshots land in visual-out/ and are uploaded as a CI artifact.
 */
const OUT = path.resolve(process.cwd(), 'visual-out')
mkdirSync(OUT, { recursive: true })

const PARTIAL = {
  ok: true,
  imported: 3,
  rejectedCards: 2,
  skippedModels: ['Image Occlusion Enhanced', 'Cloze (legacy add-on)'],
  deckName: 'Fixture deck',
}

const viewports = [
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 800 },
]

for (const vp of viewports) {
  for (const reduced of [false, true]) {
    test(`backup partial-import warning at ${vp.name}${reduced ? ' reduced-motion' : ''}`, async ({
      page,
      context,
    }) => {
      await context.addInitScript(() => {
        window.localStorage.setItem('lh-onboarding-dismissed', '1')
      })
      await page.setViewportSize({ width: vp.width, height: vp.height })
      if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.route('**/api/import', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(PARTIAL),
        }),
      )
      await page.goto('/backup')
      await page.locator('input[type="file"][accept=".apkg,.txt,.json"]').setInputFiles({
        name: 'fixture.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('front\tback\n'),
      })
      const alert = page.getByRole('alert').filter({ hasText: 'Partly imported.' })
      await expect(alert).toBeVisible()
      await expect(alert).toContainText('2 cards were not imported')
      await expect(alert).toContainText('2 unsupported note types were skipped')
      await expect(alert).toHaveAttribute('data-kind', 'warn')
      // The import invalidates the deck list; wait for the refetch so the counts are settled
      // before any screenshot (a capture mid-refetch showed 2 in the badge and 1 in the label).
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(/^2 decks$/i)).toBeVisible()
      await alert.scrollIntoViewIfNeeded()
      // No horizontal overflow of the page at this width.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
      const tag = `${vp.name}${reduced ? '-reduced' : ''}`
      await page.screenshot({ path: path.join(OUT, `backup-warning-${tag}.png`) })
      // Max scroll: the last control must clear a fixed bottom nav, if one is shown.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const clear = await page.evaluate(() => {
        const nav = document.querySelector(
          'nav[class*="fixed"][class*="bottom"], [data-bottom-nav]',
        )
        const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight
        const last = Array.from(document.querySelectorAll('main button, main a, main input')).pop()
        return last ? navTop - last.getBoundingClientRect().bottom : null
      })
      if (clear !== null) expect(clear).toBeGreaterThanOrEqual(0)
      await page.screenshot({ path: path.join(OUT, `backup-maxscroll-${tag}.png`) })
    })
  }
}

// Onboarding wizard (step 3 "Bring it in"): the same partial result shows as a warning toast.
for (const vp of viewports) {
  for (const reduced of [false, true]) {
    test(`wizard partial-import toast at ${vp.name}${reduced ? ' reduced-motion' : ''}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.route('**/api/import', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(PARTIAL),
        }),
      )
      // FIXTURE: the smoke DB is not a first run, so patch the real GET /api/settings reply to
      // make the wizard open (onboardingCompleted=false, isEmptyWorkspace=true).
      await page.route('**/api/settings', async (route) => {
        if (route.request().method() !== 'GET') return route.continue()
        const res = await route.fetch()
        const body = await res.json()
        body.settings = { ...body.settings, onboardingCompleted: false, isEmptyWorkspace: true }
        return route.fulfill({ response: res, json: body })
      })
      await page.goto('/')
      const dialog = page.getByRole('dialog', { name: /Welcome to Learning HUB/ })
      await expect(dialog).toBeVisible()
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.getByRole('button', { name: 'Continue' }).click()
      await expect(page.getByText('Step 3/5')).toBeVisible()
      await page.locator('input[type="file"][accept=".apkg,.txt"]').setInputFiles({
        name: 'fixture.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('front\tback\n'),
      })
      const toast = page.getByText('2 unsupported note types were skipped', { exact: false })
      await expect(toast).toBeVisible()
      await expect(page.getByText('Imported 3 cards')).toBeVisible()
      await page.waitForLoadState('networkidle')
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0)
      const tag = `${vp.name}${reduced ? '-reduced' : ''}`
      await page.screenshot({ path: path.join(OUT, `wizard-warning-${tag}.png`) })
      await page.getByText('Step 3/5').scrollIntoViewIfNeeded()
      await page.screenshot({ path: path.join(OUT, `wizard-step3-${tag}.png`) })
    })
  }
}
