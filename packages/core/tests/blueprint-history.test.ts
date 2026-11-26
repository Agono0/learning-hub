import { describe, expect, it } from 'vitest'
import {
  MAX_HISTORY_ENTRIES,
  MAX_INSTALLED_BLUEPRINTS,
  MAX_STORED_CHARS,
  SAMPLE_BLUEPRINTS,
  addToHistory,
  completePhase,
  emptyState,
  entryFromSession,
  installIntoLibrary,
  loadStudioState,
  readHistory,
  readLibrary,
  resetUnreadable,
  saveStudioState,
  serializeState,
  startSession,
  abortSession,
  emptyLibrary,
  type Blueprint,
  type BlueprintSession,
  type HistoryEntry,
  type KeyValueStore,
} from '../src/blueprint'

const feynman = SAMPLE_BLUEPRINTS.find((b) => b.id === 'feynman-loop')!

function finished(bp: Blueprint, scores: number[]): BlueprintSession {
  let s = (startSession(bp) as { session: BlueprintSession }).session
  let i = 0
  while (s.status === 'running') {
    const phase = bp.phases.find((p) => p.id === s.phaseId)!
    const o = completePhase(
      bp,
      s,
      phase.scored ? { score: scores[i++] ?? 50, at: '2026-11-25T10:00:00.000Z' } : {},
    )
    if (!o.ok) throw new Error('step failed')
    s = o.session
  }
  return s
}

const entry = (id: string, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  ...entryFromSession(feynman, finished(feynman, [60, 95, 88]), {
    id,
    now: '2026-11-25T10:05:00.000Z',
  })!,
  ...over,
})

class FakeStore implements KeyValueStore {
  data = new Map<string, string>()
  failWith: Error | null = null
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    if (this.failWith) throw this.failWith
    this.data.set(k, v)
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
}

describe('entryFromSession', () => {
  it('returns null while the session is still running', () => {
    const s = (startSession(feynman) as { session: BlueprintSession }).session
    expect(entryFromSession(feynman, s, { id: 'x', now: 'n' })).toBeNull()
  })

  it('archives rounds, scores and provenance for a finished session', () => {
    const e = entry('e1')
    expect(e.status).toBe('finished')
    expect(e.blueprintName).toBe('Feynman Loop')
    expect(e.params).toEqual({ rounds: 2, audience: 'a 12 year old' })
    expect(e.steps.map((s) => [s.title, s.round, s.rounds])).toEqual([
      ['Pick one concept', 1, 1],
      ['Explain it simply', 1, 2],
      ['Explain it simply', 2, 2],
      ['Teach it back', 1, 1],
    ])
    const scored = e.steps.filter((s) => s.score !== undefined)
    expect(scored.map((s) => [s.score, s.source])).toEqual([
      [60, 'self-reported'],
      [95, 'self-reported'],
      [88, 'self-reported'],
    ])
    expect(e.steps[0]!.source).toBeUndefined()
    expect(e.scoreAverage).toBe(81)
    expect(e.scoreCount).toBe(3)
    expect(e.steps[1]!.at).toBe('2026-11-25T10:00:00.000Z')
  })

  it('archives a stopped session and skipped steps', () => {
    let s = (startSession(feynman) as { session: BlueprintSession }).session
    s = (completePhase(feynman, s, {}) as { session: BlueprintSession }).session
    s = (completePhase(feynman, s, { skipped: true }) as { session: BlueprintSession }).session
    const e = entryFromSession(feynman, abortSession(s), { id: 'a', now: 'n' })!
    expect(e.status).toBe('aborted')
    expect(e.endReason).toBe('aborted')
    expect(e.skipped).toBe(1)
    expect(e.scoreAverage).toBeNull()
    expect(e.steps[1]!.skipped).toBe(true)
  })

  it('output passes its own schema (round trip through readHistory)', () => {
    const r = readHistory(JSON.parse(JSON.stringify([entry('a'), entry('b')])))
    expect(r.dropped).toBe(0)
    expect(r.history).toHaveLength(2)
  })
})

describe('history list', () => {
  it('puts the newest first and replaces an entry with the same id', () => {
    let h: HistoryEntry[] = []
    h = addToHistory(h, entry('a'))
    h = addToHistory(h, entry('b'))
    h = addToHistory(h, entry('a', { endedAt: 'later' }))
    expect(h.map((x) => x.id)).toEqual(['a', 'b'])
    expect(h[0]!.endedAt).toBe('later')
  })

  it('is capped at the maximum, dropping the oldest', () => {
    let h: HistoryEntry[] = []
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 25; i++) h = addToHistory(h, entry(`e${i}`))
    expect(h).toHaveLength(MAX_HISTORY_ENTRIES)
    expect(h[0]!.id).toBe(`e${MAX_HISTORY_ENTRIES + 24}`)
    expect(h.some((x) => x.id === 'e0')).toBe(false)
  })

  it('readHistory drops invalid, duplicate and over-cap entries and counts them', () => {
    const many = Array.from({ length: MAX_HISTORY_ENTRIES + 3 }, (_, i) => entry(`e${i}`))
    const r = readHistory([...many, entry('e0'), { nope: 1 }, null, 'x'])
    expect(r.history).toHaveLength(MAX_HISTORY_ENTRIES)
    expect(r.dropped).toBe(3 + 1 + 3)
    expect(readHistory('nope')).toEqual({ history: [], dropped: 1 })
    expect(readHistory(undefined)).toEqual({ history: [], dropped: 0 })
  })

  it('rejects out-of-range scores, unknown keys and unknown score sources', () => {
    const good = entry('g')
    const bad1 = { ...good, steps: [{ ...good.steps[1]!, score: 101 }] }
    const bad2 = { ...good, extra: true }
    const bad3 = { ...good, steps: [{ ...good.steps[1]!, source: 'graded-by-ai' }] }
    expect(readHistory([bad1, bad2, bad3]).history).toEqual([])
  })
})

describe('loadStudioState', () => {
  const lib = (() => {
    const r = installIntoLibrary(emptyLibrary(), feynman)
    if (!r.ok) throw new Error('x')
    return r.library
  })()

  it('starts empty when nothing is stored', () => {
    const r = loadStudioState(null, null)
    expect(r.status).toBe('empty')
    expect(r.unreadable).toBe(false)
    expect(r.state).toEqual(emptyState())
  })

  it('round-trips the v2 envelope', () => {
    const state = { library: lib, history: [entry('a')] }
    const r = loadStudioState(serializeState(state), null)
    expect(r.status).toBe('loaded')
    expect(r.state.library.installed).toHaveLength(1)
    expect(r.state.history).toHaveLength(1)
    expect(r.dropped).toBe(0)
  })

  it('migrates a v1 library (bare, no envelope) with empty history', () => {
    const v1 = JSON.stringify(lib)
    const r = loadStudioState(null, v1)
    expect(r.status).toBe('migrated-v1')
    expect(r.state.library.installed.map((b) => b.id)).toEqual(['feynman-loop'])
    expect(r.state.history).toEqual([])
    expect(r.unreadable).toBe(false)
  })

  it('prefers v2 over v1 when both exist', () => {
    const r = loadStudioState(serializeState(emptyState()), JSON.stringify(lib))
    expect(r.status).toBe('loaded')
    expect(r.state.library.installed).toEqual([])
  })

  it('reports corrupt JSON as unreadable, never as empty-and-writable', () => {
    for (const raw of ['{oops', '[]', '42', 'null', '"text"']) {
      const r = loadStudioState(raw, null)
      expect(r.status).toBe('corrupt')
      expect(r.unreadable).toBe(true)
    }
    expect(loadStudioState(null, '{oops').status).toBe('corrupt')
    expect(loadStudioState(null, '[1]').unreadable).toBe(true)
  })

  it('reports unknown or newer versions as unreadable with the version found', () => {
    for (const version of [1, 3, '2', null, undefined]) {
      const r = loadStudioState(JSON.stringify({ version, library: lib, history: [] }), null)
      expect(r.status).toBe('unsupported-version')
      expect(r.unreadable).toBe(true)
      expect(r.foundVersion).toBe(version)
    }
  })

  it('refuses oversized stored values without parsing them', () => {
    const big = ' '.repeat(MAX_STORED_CHARS + 1)
    expect(loadStudioState(big, null).status).toBe('too-large')
    expect(loadStudioState(null, big).status).toBe('too-large')
  })

  it('drops invalid pieces of a valid envelope and counts them', () => {
    const raw = JSON.stringify({
      version: 2,
      library: { installed: [feynman, { bogus: true }], sessions: { ghost: {} } },
      history: [entry('a'), { bogus: true }],
    })
    const r = loadStudioState(raw, null)
    expect(r.status).toBe('loaded')
    expect(r.state.library.installed).toHaveLength(1)
    expect(r.state.history).toHaveLength(1)
    expect(r.dropped).toBe(3)
  })

  it('caps installed blueprints when loading', () => {
    const many = Array.from({ length: MAX_INSTALLED_BLUEPRINTS + 5 }, (_, i) => ({
      ...feynman,
      id: `m-${i}`,
    }))
    const r = readLibrary({ installed: many, sessions: {} })
    expect(r.library.installed).toHaveLength(MAX_INSTALLED_BLUEPRINTS)
    expect(r.dropped).toBe(5)
  })
})

describe('saving', () => {
  it('saves the envelope under the key', () => {
    const store = new FakeStore()
    expect(saveStudioState(store, 'k', emptyState())).toEqual({ ok: true })
    expect(JSON.parse(store.getItem('k')!).version).toBe(2)
  })

  it('reports a full store as quota without throwing', () => {
    const store = new FakeStore()
    const err = new Error('full')
    err.name = 'QuotaExceededError'
    store.failWith = err
    expect(saveStudioState(store, 'k', emptyState())).toEqual({ ok: false, reason: 'quota' })
  })

  it('reports other failures and a missing store as unavailable', () => {
    const store = new FakeStore()
    store.failWith = new Error('SecurityError')
    expect(saveStudioState(store, 'k', emptyState())).toEqual({ ok: false, reason: 'unavailable' })
    expect(saveStudioState(null, 'k', emptyState())).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('resetUnreadable keeps a backup copy before clearing', () => {
    const store = new FakeStore()
    store.setItem('k', '{corrupt')
    expect(resetUnreadable(store, 'k')).toEqual({ ok: true })
    expect(store.getItem('k')).toBeNull()
    expect(store.getItem('k.backup')).toBe('{corrupt')
  })

  it('resetUnreadable clears nothing when the backup cannot be written', () => {
    const store = new FakeStore()
    store.setItem('k', '{corrupt')
    const err = new Error('full')
    err.name = 'QuotaExceededError'
    store.failWith = err
    expect(resetUnreadable(store, 'k')).toEqual({ ok: false, reason: 'quota' })
    expect(store.getItem('k')).toBe('{corrupt')
  })
})
