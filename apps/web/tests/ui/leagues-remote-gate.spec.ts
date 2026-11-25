import { expect, test } from '@playwright/test'

/**
 * Remote leagues are inactive groundwork. With LH_REMOTE_LEAGUES unset (the
 * default test server) the API must refuse writes and the /leagues page must
 * not show the remote panel, so a default install never reaches a network
 * authority by accident.
 */

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

test.describe('remote leagues gate', () => {
  test('GET reports disabled with no links', async ({ request }) => {
    const res = await request.get('/api/leagues/remote')
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ ok: true, enabled: false, links: [] })
  })

  test('every write action is refused with 503 while disabled', async ({ request }) => {
    const target = { serverUrl: 'https://league.example', remoteLeagueId: 'gate-check' }
    for (const body of [
      { action: 'link', ...target },
      { action: 'sync', ...target },
      { action: 'queue', ...target },
      { action: 'enqueue', ...target, mutation: { type: 'leave' } },
      { action: 'enqueue', ...target, mutation: { type: 'remove-member', target: 'usr_x' } },
    ]) {
      const res = await request.post('/api/leagues/remote', { data: body })
      expect(res.status(), JSON.stringify(body)).toBe(503)
      expect(await res.json()).toMatchObject({ ok: false, enabled: false })
    }
  })

  test('the leagues page renders without a remote panel', async ({ page }) => {
    await page.goto('/leagues')
    await expect(page.getByRole('heading', { name: 'Leagues', level: 1 })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByTestId('remote-leagues-panel')).toHaveCount(0)
    await expect(page.getByTestId('remote-leagues-empty')).toHaveCount(0)
  })
})
