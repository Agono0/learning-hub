import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * Actual-route visual check of the worker-attested guest/verified labels on /online (real
 * `next dev`, real Chromium, the real page and components). FIXTURES (mocked): GET
 * /api/online/identity, POST /api/online/rooms, GET /api/online/library and the room WebSocket
 * (page.routeWebSocket) return synthetic data, with one verified and one guest participant,
 * chat sender and library author each. No real worker, no network beyond the local server.
 * Screenshots land in visual-out/ and are uploaded as a CI artifact.
 */
const OUT = path.resolve(process.cwd(), 'visual-out')
mkdirSync(OUT, { recursive: true })
const PORT = process.env.UI_SMOKE_PORT ?? 3100
const NOW = '2026-11-26T00:00:00.000Z'

const room = {
  code: 'ABC234',
  title: 'Fixture room',
  timerMode: 'pomodoro',
  pomodoroWorkMinutes: 25,
  pomodoroBreakMinutes: 5,
  isBreak: false,
  timerExpiresAt: null,
  participants: [
    {
      id: 'p1',
      alias: 'Verified Vera',
      status: 'studying',
      streak: 4,
      cardsReviewed: 12,
      joinedAt: NOW,
      verified: true,
    },
    {
      id: 'p2',
      alias: 'Guest Gus',
      status: 'studying',
      streak: 0,
      cardsReviewed: 3,
      joinedAt: NOW,
    },
  ],
}
const chat = (id: string, alias: string, verified?: boolean) => ({
  type: 'chat',
  message: {
    id,
    roomCode: 'ABC234',
    senderId: id,
    senderAlias: alias,
    senderVerified: verified,
    content: `Hello from ${alias}`,
    sentAt: NOW,
  },
})
const library = {
  ok: true,
  items: [
    {
      id: 'item_' + 'a'.repeat(32),
      type: 'deck',
      title: 'Verified author deck',
      description: 'Fixture',
      author: 'Verified Vera',
      authorVerified: true,
      downloads: 3,
      rating: 5,
      tags: ['fixture'],
      shareString: 'x',
      publishedAt: NOW,
    },
    {
      id: 'item_' + 'b'.repeat(32),
      type: 'course',
      title: 'Guest author course',
      description: 'Fixture',
      author: 'Guest Gus',
      downloads: 1,
      rating: 4,
      tags: [],
      shareString: 'x',
      publishedAt: NOW,
    },
  ],
}

const viewports = [
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 800 },
]

for (const vp of viewports) {
  for (const reduced of [false, true]) {
    test(`online guest labels at ${vp.name}${reduced ? ' reduced-motion' : ''}`, async ({
      page,
      context,
    }) => {
      await context.addInitScript(() => window.localStorage.setItem('lh-onboarding-dismissed', '1'))
      await page.setViewportSize({ width: vp.width, height: vp.height })
      if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
      const json = (body: unknown) => ({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
      await page.route('**/api/online/identity', (r) =>
        r.fulfill(
          json({
            ok: true,
            identity: {
              id: 1,
              mode: 'device_key',
              userId: 'u1',
              alias: 'Fixture Learner',
              pubKey: null,
              registeredAt: null,
            },
            prefs: { showOnLeaderboard: true, allowBuddyRequests: true, sharePresence: true },
            server: `http://localhost:${PORT}`,
          }),
        ),
      )
      await page.route('**/api/online/rooms', (r) =>
        r.fulfill(
          json({ ok: true, code: room.code, room, wsUrl: `ws://localhost:${PORT}/mock-room` }),
        ),
      )
      await page.route('**/api/online/library**', (r) => r.fulfill(json(library)))
      await page.routeWebSocket('**/mock-room', (ws) => {
        ws.send(JSON.stringify({ type: 'state', room }))
        ws.send(JSON.stringify(chat('c1', 'Verified Vera', true)))
        ws.send(JSON.stringify(chat('c2', 'Guest Gus')))
      })
      await page.goto('/online')
      await page.getByPlaceholder('e.g. Focus Sprint').fill('Fixture room')
      await page.getByRole('button', { name: 'Create Room' }).click()
      const tag = `${vp.name}${reduced ? '-reduced' : ''}`

      await expect(page.getByText('Active Participants (2)')).toBeVisible()
      const guests = page.getByTestId('guest-tag')
      // Guest Gus appears as a participant and as a chat sender; Verified Vera never carries the label.
      await expect(guests).toHaveCount(2)
      await expect(
        page
          .locator('span', { hasText: /^Verified Vera$/ })
          .locator('xpath=following-sibling::*[1][@data-testid="guest-tag"]'),
      ).toHaveCount(0)
      await expect(page.getByText('Guest Gus', { exact: false }).first()).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0)
      await page.getByText('Active Participants (2)').scrollIntoViewIfNeeded()
      await page.screenshot({ path: path.join(OUT, `online-room-${tag}.png`) })
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await page.screenshot({ path: path.join(OUT, `online-room-maxscroll-${tag}.png`) })

      await page.getByRole('tab', { name: /Community Library/ }).click()
      await expect(page.getByText('Guest author course')).toBeVisible()
      // Library: the guest-authored item carries the label, the verified one does not.
      await expect(page.getByTestId('guest-tag')).toHaveCount(1)
      await page.screenshot({ path: path.join(OUT, `online-library-${tag}.png`) })
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await page.screenshot({ path: path.join(OUT, `online-library-maxscroll-${tag}.png`) })
    })
  }
}
