/**
 * Notification Center repository tests — policy persistence, append-only
 * ledger, and the tz-aware daily counter, against an in-memory database.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  defaultNotificationPrefs,
  parseNotificationPrefs,
} from '@learning-hub/core/notification-center'
import {
  getNotificationPrefs,
  updateNotificationPrefs,
  initDb,
  setDb,
  logNotification,
  listNotificationLog,
  countNotificationsOnDay,
  notificationLog,
  userSettings,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-notification-center-'))
  db = await initDb({ path: join(tmp, 'center.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(userSettings).run()
  db.delete(notificationLog).run()
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('policy persistence', () => {
  it('returns catalog defaults before any customization', () => {
    expect(getNotificationPrefs(db)).toEqual(defaultNotificationPrefs())
  })

  it('round-trips updates and merges with defaults on read', () => {
    updateNotificationPrefs({ masterEnabled: false, dailyCap: 4 }, db)
    const prefs = getNotificationPrefs(db)
    expect(prefs.masterEnabled).toBe(false)
    expect(prefs.dailyCap).toBe(4)
    // untouched channel prefs survive as defaults
    expect(prefs.channels.review_due).toEqual({ enabled: true, viaOs: true })
    // the raw column was written
    const row = db.select().from(userSettings).all()[0]!
    expect(JSON.parse(JSON.stringify(row.notificationPrefs))).toMatchObject({
      masterEnabled: false,
    })
  })

  it('corrupt stored JSON degrades to defaults instead of crashing', () => {
    db.update(userSettings)
      .set({ notificationPrefs: { channels: { weird: true } } })
      .run()
    const prefs = getNotificationPrefs(db)
    expect(prefs.masterEnabled).toBe(true)
    expect(prefs.channels.weird).toBeUndefined()
    // unknown channels dropped, known ones defaulted (parseNotificationPrefs contract)
    expect(parseNotificationPrefs({ channels: { weird: true } }).channels.review_due).toBeDefined()
  })
})

describe('append-only ledger', () => {
  it('records delivered and suppressed decisions with reasons intact', () => {
    logNotification(
      {
        channel: 'review_due',
        title: 'Reviews ready',
        body: '5 cards',
        actionUrl: '/review',
        decision: 'deliver',
        createdAt: '2026-01-15T09:00:00.000Z',
      },
      db,
    )
    logNotification(
      {
        channel: 'review_due',
        title: 'Reviews ready',
        body: '5 cards',
        actionUrl: null,
        decision: 'suppress_quiet_hours',
        createdAt: '2026-01-15T23:00:00.000Z',
      },
      db,
    )
    const entries = listNotificationLog(10, db)
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.decision)).toEqual(['suppress_quiet_hours', 'deliver']) // newest first
    expect(entries[0]?.createdAt).toBe('2026-01-15T23:00:00.000Z')
  })

  it('rejects malformed entries via the shared schema', () => {
    const badChannel = 'nope' as unknown as Parameters<typeof logNotification>[0]['channel']
    expect(() =>
      logNotification(
        {
          channel: badChannel,
          title: 'x',
          body: '',
          actionUrl: null,
          decision: 'deliver',
          createdAt: '2026-01-15T09:00:00.000Z',
        },
        db,
      ),
    ).toThrow()
  })

  it('counts only delivered rows inside the caller day bounds', () => {
    logNotification(
      {
        channel: 'review_due',
        title: 'a',
        body: '',
        actionUrl: null,
        decision: 'deliver',
        createdAt: '2026-01-14T23:00:00.000Z',
      },
      db,
    )
    logNotification(
      {
        channel: 'review_due',
        title: 'b',
        body: '',
        actionUrl: null,
        decision: 'suppress_dnd',
        createdAt: '2026-01-14T23:10:00.000Z',
      },
      db,
    )
    logNotification(
      {
        channel: 'break_reminder',
        title: 'c',
        body: '',
        actionUrl: null,
        decision: 'deliver',
        createdAt: '2026-01-15T20:00:00.000Z',
      },
      db,
    )
    // local day [Jan14 22:00Z, Jan15 22:00Z): a (deliver) + c (deliver) = 2
    expect(
      countNotificationsOnDay(
        '2026-01-14T22:00:00.000Z',
        '2026-01-15T22:00:00.000Z',
        'deliver',
        db,
      ),
    ).toBe(2)
    // next local day: empty
    expect(
      countNotificationsOnDay(
        '2026-01-15T22:00:00.000Z',
        '2026-01-16T22:00:00.000Z',
        'deliver',
        db,
      ),
    ).toBe(0)
    // the held one is in the ledger under its own decision
    expect(
      countNotificationsOnDay(
        '2026-01-14T22:00:00.000Z',
        '2026-01-16T22:00:00.000Z',
        'suppress_dnd',
        db,
      ),
    ).toBe(1)
  })

  it('respects the list limit cap', () => {
    for (let i = 0; i < 5; i++) {
      logNotification(
        {
          channel: 'achievement',
          title: `n${i}`,
          body: '',
          actionUrl: null,
          decision: 'deliver',
          createdAt: `2026-01-10T0${i}:00:00.000Z`,
        },
        db,
      )
    }
    expect(listNotificationLog(3, db)).toHaveLength(3)
  })

  it('policy survives a repository re-read (single row, id=default)', () => {
    updateNotificationPrefs({ dailyCap: 6 }, db)
    const rows = db.select().from(userSettings).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('default')
  })
})
