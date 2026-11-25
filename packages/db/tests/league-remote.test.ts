import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  LeagueRemoteInputError,
  bumpSeqAtLeast,
  getRemoteLink,
  initDb,
  isValidRemoteLeagueId,
  leagueRemoteLinks,
  linkRemoteLeague,
  listRemoteLinks,
  normalizeRemoteServerUrl,
  recordRemoteOutcome,
  reserveNextSeq,
  setDb,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-remote-'))
  db = await initDb({ path: join(tmp, 'remote.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(leagueRemoteLinks).run()
})

describe('normalizeRemoteServerUrl', () => {
  it('keeps a bare https origin and drops the trailing slash', () => {
    expect(normalizeRemoteServerUrl('https://league.example.workers.dev/')).toBe(
      'https://league.example.workers.dev',
    )
    expect(normalizeRemoteServerUrl('https://league.example.workers.dev')).toBe(
      'https://league.example.workers.dev',
    )
  })

  it('allows plain http only for loopback development', () => {
    expect(normalizeRemoteServerUrl('http://localhost:8787')).toBe('http://localhost:8787')
    expect(normalizeRemoteServerUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787')
    expect(() => normalizeRemoteServerUrl('http://example.com')).toThrow(LeagueRemoteInputError)
  })

  it('rejects credentials, paths, queries, fragments and junk', () => {
    for (const bad of [
      'https://user:pw@example.com',
      'https://example.com/api',
      'https://example.com/?x=1',
      'https://example.com/#frag',
      'not a url',
      'ftp://example.com',
      '',
    ]) {
      expect(() => normalizeRemoteServerUrl(bad), bad).toThrow(LeagueRemoteInputError)
    }
  })
})

describe('isValidRemoteLeagueId', () => {
  it('matches the worker route pattern', () => {
    expect(isValidRemoteLeagueId('lg-spring26')).toBe(true)
    expect(isValidRemoteLeagueId('short')).toBe(false)
    expect(isValidRemoteLeagueId('Has-Upper')).toBe(false)
    expect(isValidRemoteLeagueId('-leading-dash')).toBe(false)
    expect(isValidRemoteLeagueId('a'.repeat(41))).toBe(false)
    expect(isValidRemoteLeagueId('has space here')).toBe(false)
  })
})

describe('linkRemoteLeague', () => {
  it('creates one link per server and league, idempotently', () => {
    const a = linkRemoteLeague({
      serverUrl: 'https://w.example.dev',
      remoteLeagueId: 'lg-spring26',
    })
    const b = linkRemoteLeague({
      serverUrl: 'https://w.example.dev/',
      remoteLeagueId: 'lg-spring26',
    })
    expect(b.id).toBe(a.id)
    expect(a.nextSeq).toBe(1)
    expect(listRemoteLinks()).toHaveLength(1)
  })

  it('keeps separate sequence counters for separate leagues and servers', () => {
    const a = linkRemoteLeague({
      serverUrl: 'https://w.example.dev',
      remoteLeagueId: 'lg-spring26',
    })
    const b = linkRemoteLeague({
      serverUrl: 'https://w.example.dev',
      remoteLeagueId: 'lg-summer26',
    })
    const c = linkRemoteLeague({
      serverUrl: 'https://other.example.dev',
      remoteLeagueId: 'lg-spring26',
    })
    reserveNextSeq(a.id)
    reserveNextSeq(a.id)
    expect(reserveNextSeq(b.id)).toBe(1)
    expect(reserveNextSeq(c.id)).toBe(1)
    expect(reserveNextSeq(a.id)).toBe(3)
  })

  it('rejects an invalid server or league id before writing anything', () => {
    expect(() =>
      linkRemoteLeague({ serverUrl: 'http://example.com', remoteLeagueId: 'lg-spring26' }),
    ).toThrow()
    expect(() =>
      linkRemoteLeague({ serverUrl: 'https://w.example.dev', remoteLeagueId: 'X' }),
    ).toThrow()
    expect(listRemoteLinks()).toHaveLength(0)
  })

  it('finds a link by normalized URL', () => {
    linkRemoteLeague({ serverUrl: 'https://w.example.dev', remoteLeagueId: 'lg-spring26' })
    expect(getRemoteLink('https://w.example.dev/', 'lg-spring26')).toBeDefined()
    expect(getRemoteLink('https://w.example.dev', 'lg-missing1')).toBeUndefined()
  })
})

describe('reserveNextSeq', () => {
  it('hands out strictly increasing numbers starting at 1', () => {
    const link = linkRemoteLeague({
      serverUrl: 'https://w.example.dev',
      remoteLeagueId: 'lg-spring26',
    })
    const seqs = Array.from({ length: 5 }, () => reserveNextSeq(link.id))
    expect(seqs).toEqual([1, 2, 3, 4, 5])
  })

  it('never hands out the same number twice across many calls', () => {
    const link = linkRemoteLeague({
      serverUrl: 'https://w.example.dev',
      remoteLeagueId: 'lg-spring26',
    })
    const seen = new Set<number>()
    for (let i = 0; i < 200; i++) {
      const n = reserveNextSeq(link.id)!
      expect(seen.has(n)).toBe(false)
      seen.add(n)
    }
  })

  it('returns undefined for an unknown link', () => {
    expect(reserveNextSeq(99999)).toBeUndefined()
  })
})

describe('bumpSeqAtLeast', () => {
  it('moves forward but never backward', () => {
    const link = linkRemoteLeague({
      serverUrl: 'https://w.example.dev',
      remoteLeagueId: 'lg-spring26',
    })
    bumpSeqAtLeast(link.id, 40)
    expect(reserveNextSeq(link.id)).toBe(40)
    bumpSeqAtLeast(link.id, 5)
    expect(reserveNextSeq(link.id)).toBe(41)
  })
})

describe('recordRemoteOutcome', () => {
  it('stores the last status and time, and truncates long codes', () => {
    const link = linkRemoteLeague({
      serverUrl: 'https://w.example.dev',
      remoteLeagueId: 'lg-spring26',
    })
    recordRemoteOutcome(link.id, 'x'.repeat(200), new Date('2026-03-02T10:00:00.000Z'))
    const row = getRemoteLink('https://w.example.dev', 'lg-spring26')!
    expect(row.lastStatus).toHaveLength(60)
    expect(row.lastSyncedAt).toBe('2026-03-02T10:00:00.000Z')
  })

  it('holds no key material in any column', () => {
    const cols = Object.keys(leagueRemoteLinks)
    expect(cols.join(',')).not.toMatch(/priv|secret|key/i)
  })
})
