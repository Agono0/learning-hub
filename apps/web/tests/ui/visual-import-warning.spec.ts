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
