import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * Critical-path browser smoke (M19 hardening basket). One spec, ordered by the
 * single-worker config: dashboard → review session → course lesson → backup
 * export → backup restore. Runs against `next dev` on an isolated DB clone
 * seeded with a fixture deck (tests/ui/setup/with-test-server.mjs).
 *
 * Note: no `import.meta` here — Playwright transpiles specs to CJS, where it
 * is illegal. Paths resolve from the cwd (apps/web).
 */

const sampleCurriculum = path.resolve(process.cwd(), '../../curricula/examples/sql-essentials.yaml')

test.beforeEach(async ({ context }) => {
  // Skip the first-run onboarding wizard — smoke tests assert app chrome, not onboarding.
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

test('dashboard renders the Today view', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible({
    timeout: 60_000,
  })
})

test('review session serves the fixture deck and grades a card', async ({ page }) => {
  await page.goto('/review')
  await expect(page.getByRole('heading', { name: 'Review', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: /Smoke Test Deck/ }).click()
  await page.getByRole('button', { name: /Start session/ }).click()

  // 5 fixture cards — after grading one, the next card's reveal prompt returns.
  const reveal = page.getByRole('button', { name: /Reveal/ })
  await expect(reveal).toBeVisible()
  await reveal.click()
  await page.getByRole('button', { name: /Good/ }).first().click()
  await expect(reveal).toBeVisible()
})

test('importing the sample curriculum yields an openable course lesson', async ({
  page,
  request,
}) => {
  const res = await request.post('/api/curriculum/import', {
    data: { text: readFileSync(sampleCurriculum, 'utf8'), filename: 'sql-essentials.yaml' },
  })
  expect(res.ok()).toBeTruthy()

  await page.goto('/courses')
  await expect(page.getByRole('heading', { name: 'Courses', level: 1 })).toBeVisible()
  await expect(page.getByText('SQL Essentials').first()).toBeVisible()

  await page
    .getByRole('link', { name: /SQL Essentials/ })
    .first()
    .click()
  await page.waitForURL(/\/courses\/course\?id=/)
  // The course overview's primary action opens the first/next lesson.
  await page.getByRole('link', { name: /^Start:/ }).click()
  await expect(page).toHaveURL(/\/courses\/lesson\?id=/)
})

test('backup export downloads a snapshot', async ({ page }) => {
  await page.goto('/backup')
  await expect(
    page.getByRole('heading', { name: 'Backup, Sync & Import/Export', level: 1 }),
  ).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download backup/ }).click()
  const download = await downloadPromise
  // The handler stamps the date: learning-hub-backup-YYYY-MM-DD.json
  expect(download.suggestedFilename()).toMatch(/^learning-hub-backup.*\.json$/)
})

test('backup snapshot round-trips through Smart Merge restore', async ({ page, request }) => {
  // Fetch a fresh snapshot via the same API the export button uses.
  const res = await request.get('/api/backup')
  expect(res.ok()).toBeTruthy()
  const snapshot = path.join(test.info().outputDir, 'restore-snapshot.json')
  mkdirSync(path.dirname(snapshot), { recursive: true })
  writeFileSync(snapshot, await res.body())

  await page.goto('/backup')
  await page
    .locator('input[type="file"][accept=".json,application/json"]')
    .last()
    .setInputFiles(snapshot)

  const dialog = page.getByRole('heading', { name: 'Import backup snapshot' })
  await expect(dialog).toBeVisible()
  await page.getByRole('button', { name: /Smart Merge/ }).click()
  await expect(dialog).toBeHidden({ timeout: 60_000 })
})
