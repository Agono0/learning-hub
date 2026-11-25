import { expect, test, type Page } from '@playwright/test'

/**
 * Rendered check of the remote leagues panel. The server keeps the feature
 * gated off, so the API is mocked in the browser: this exercises the real
 * client UI (layout, roster, moderation log, membership actions) without any
 * remote authority. Screenshots go to ./ui-screenshots for review.
 */

const SERVER = 'https://league.example'
const LEAGUE = 'friends-practice'

const roster = {
  ok: true,
  remote: {
    league: {
      title: 'Friends practice league',
      currentRound: 2,
      players: [
        { handle: 'usr_fay', seasonPoints: 41, duelsWon: 2, duelsLost: 1 },
        { handle: 'usr_bo', seasonPoints: 18, duelsWon: 0, duelsLost: 1 },
        { handle: 'usr_cy', seasonPoints: 27, duelsWon: 1, duelsLost: 0 },
      ],
    },
    aliases: { usr_fay: 'Fay', usr_bo: 'Bo', usr_cy: 'Cy' },
    inviteOnly: true,
    liveInvites: 2,
    blocked: ['usr_eve'],
    modLog: [
      {
        at: Date.parse('2026-03-02T10:00:00Z'),
        by: 'usr_fay',
        action: 'remove',
        target: 'usr_eve',
      },
      {
        at: Date.parse('2026-03-02T11:30:00Z'),
        by: 'usr_fay',
        action: 'transfer',
        target: 'usr_cy',
      },
    ],
  },
}

async function mockRemote(page: Page) {
  const posted: Array<Record<string, unknown>> = []
  await page.route('**/api/leagues/remote', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      return route.fulfill({
        json: {
          ok: true,
          enabled: true,
          links: [
            {
              serverUrl: SERVER,
              remoteLeagueId: LEAGUE,
              nextSeq: 5,
              lastStatus: 'ok',
              lastSyncedAt: '2026-03-02T10:00:00.000Z',
            },
          ],
        },
      })
    }
    const body = req.postDataJSON() as Record<string, unknown>
    posted.push(body)
    if (body.action === 'state') return route.fulfill({ json: roster })
    if (body.action === 'sync') return route.fulfill({ json: { ok: true, queue: { pending: 0 } } })
    return route.fulfill({ json: { ok: true, queue: { pending: 1 } } })
  })
  return posted
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

/** Every visible control must be the topmost element at its own centre. */
async function expectNoOcclusion(page: Page) {
  const covered = await page
    .getByTestId('remote-leagues-panel')
    .locator('button, input')
    .evaluateAll((els) =>
      els
        .map((el) => {
          el.scrollIntoView({ block: 'center' })
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) return null
          const x = r.left + r.width / 2
          const y = r.top + r.height / 2
          if (y < 0 || y > window.innerHeight) return null
          const top = document.elementFromPoint(x, y)
          return top && (top === el || el.contains(top) || top.contains(el))
            ? null
            : (el.getAttribute('data-testid') ?? el.tagName)
        })
        .filter(Boolean),
    )
  expect(covered).toEqual([])
}

/** At maximum scroll, the last control on the page must sit wholly above the bottom nav. */
async function expectLastControlClearsBottomNav(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const nav = page.getByRole('navigation', { name: 'Primary' })
  if (!(await nav.isVisible())) return
  const navTop = (await nav.boundingBox())!.y
  const last = await page.evaluate(() => {
    const all = [...document.querySelectorAll('main button, main input, main a')].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    const el = all.at(-1)!
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { bottom: r.bottom, hit: hit === el || el.contains(hit) || !!hit?.contains(el) }
  })
  expect(last.bottom).toBeLessThanOrEqual(navTop)
  expect(last.hit).toBe(true)
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
}

for (const view of [
  { name: 'desktop', width: 1280, height: 900, reduced: false },
  { name: 'narrow', width: 390, height: 844, reduced: false },
  { name: 'reduced-motion', width: 1024, height: 800, reduced: true },
]) {
  test(`remote leagues panel renders cleanly (${view.name})`, async ({ page }) => {
    await page.setViewportSize({ width: view.width, height: view.height })
    if (view.reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
    const posted = await mockRemote(page)

    await page.goto('/leagues')
    const panel = page.getByTestId('remote-leagues-panel')
    await expect(panel).toBeVisible({ timeout: 60_000 })
    await expect(panel).toContainText('Practice only')
    await expect(panel).toContainText('local activity scoring')
    await expect(page.getByTestId('remote-league-link')).toHaveCount(1)

    await page.getByTestId('remote-roster-refresh').click()
    await expect(page.getByTestId('remote-roster-row')).toHaveCount(3)
    // Alphabetical, never ranked: Bo (18) before Cy (27) before Fay (41).
    await expect(page.getByTestId('remote-roster-row')).toContainText(['Bo', 'Cy', 'Fay'])
    await expect(page.getByTestId('remote-moderation-row')).toHaveCount(2)
    await expect(page.getByTestId('remote-moderation')).toContainText('1 blocked')
    await expect(page.getByTestId('remote-moderation-row').first()).toContainText('made founder')

    await expect(panel).not.toContainText(/leaderboard|competitive-ready/i)
    await expectNoHorizontalOverflow(page)
    await expectNoOcclusion(page)

    // A founder action goes out as a queued request, then a sync.
    await page.getByTestId('remote-mod-handle').fill('usr_bo')
    await page.getByTestId('remote-remove-member').click()
    await expect(page.getByTestId('remote-message')).toContainText('Done.')
    const enqueue = posted.find((b) => b.action === 'enqueue')
    expect(enqueue).toMatchObject({ mutation: { type: 'remove-member', target: 'usr_bo' } })

    // A new invite code appears once, and only its digest was sent.
    await page.getByTestId('remote-invite-new').click()
    const code = await page.getByTestId('remote-shown-code').textContent()
    expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(JSON.stringify(posted)).not.toContain(code as string)

    await panel.scrollIntoViewIfNeeded()
    await expectNoOcclusion(page)
    await expectLastControlClearsBottomNav(page)
    await page.screenshot({ path: `ui-screenshots/remote-leagues-${view.name}-bottom.png` })
    await panel.screenshot({ path: `ui-screenshots/remote-leagues-${view.name}.png` })
    await page.screenshot({ path: `ui-screenshots/remote-leagues-${view.name}-page.png` })
  })
}
