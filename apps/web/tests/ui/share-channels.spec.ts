import { expect, test } from '@playwright/test'

/**
 * Shared Materials page browser coverage: the four flows render and the
 * publish form validates. Engine behavior is covered by the core vitest
 * suite; this spec checks the page wiring end to end.
 */

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

test('shared materials page renders its four flows', async ({ page }) => {
  await page.goto('/shared')
  await expect(page.getByRole('heading', { name: 'Shared Materials', level: 1 })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByRole('tab', { name: 'My subscriptions' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Publish' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Subscribe' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Apply update' })).toBeVisible()
})

test('subscriptions tab starts empty with guidance', async ({ page }) => {
  await page.goto('/shared')
  await expect(page.getByText(/No subscriptions yet/)).toBeVisible({ timeout: 60_000 })
})

test('publish tab exposes the channel form', async ({ page }) => {
  await page.goto('/shared')
  await page.getByRole('tab', { name: 'Publish' }).click()
  await expect(page.getByRole('textbox', { name: 'Channel id' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Your public handle' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create channel' })).toBeVisible()
})

test.describe('channel detail route (static-export safe, /shared/detail?channelId=)', () => {
  const manifest = {
    channelId: 'nav-test-channel',
    type: 'deck',
    title: 'Navigation Test Channel',
    description: 'seeded locally',
    authorHandle: 'tester',
    visibility: 'link',
    createdAt: '2026-01-01T00:00:00.000Z',
    currentVersion: 1,
    versions: [
      {
        version: 1,
        publishedAt: '2026-01-01T00:00:00.000Z',
        changelog: 'first',
        checksum: 'abcdef0123456789',
        items: [{ id: 'i1', content: { front: 'Q1', back: 'A1' }, revision: 1 }],
      },
    ],
  }

  test('loads a subscribed channel by query parameter', async ({ page }) => {
    await page.addInitScript((m) => {
      window.localStorage.setItem(
        'lh-share-channels-v1',
        JSON.stringify([{ manifest: m, localVersion: 1 }]),
      )
    }, manifest)
    await page.goto(`/shared/detail?channelId=${encodeURIComponent(manifest.channelId)}`)
    await expect(page.getByTestId('channel-detail')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('Navigation Test Channel')).toBeVisible()
    await expect(page.getByTestId('channel-item-i1')).toBeVisible()
  })

  test('shows the not-found state for an unknown or missing channel id', async ({ page }) => {
    await page.goto('/shared/detail?channelId=does-not-exist')
    await expect(page.getByText('Channel not found')).toBeVisible({ timeout: 60_000 })
    await page.goto('/shared/detail')
    await expect(page.getByText('Channel not found')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('No channel id was given.')).toBeVisible()
  })

  test('the old dynamic /shared/<id> route no longer exists', async ({ page }) => {
    const res = await page.goto('/shared/nav-test-channel')
    expect(res?.status()).toBe(404)
  })
})
