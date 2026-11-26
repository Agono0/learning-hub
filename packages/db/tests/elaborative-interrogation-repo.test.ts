import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  addEiFact,
  archiveEiFact,
  eiAttempts,
  eiFactStates,
  eiFacts,
  getEiQueue,
  initDb,
  listEiAttempts,
  listEiCalibrationPoints,
  listEiFacts,
  listEiStates,
  parseEngineId,
  recordEiAttempt,
  setDb,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB

beforeAll(async () => {
  db = await initDb({ path: join(mkdtempSync(join(tmpdir(), 'lh-ei-')), 'ei.db') })
  setDb(db)
})
afterAll(() => undefined)
beforeEach(() => {
  db.delete(eiAttempts).run()
  db.delete(eiFactStates).run()
  db.delete(eiFacts).run()
})

const STATEMENT =
  'Spaced practice improves retention because each retrieval strengthens the memory trace.'
const GOOD =
  'Each retrieval takes effort, and that effort strengthens the memory so retention lasts, because forgetting makes recall harder and therefore more useful. For example vocabulary after a week.'

describe('elaborative interrogation repo', () => {
  it('adds, lists and validates facts', () => {
    const f = addEiFact({ statement: STATEMENT, keyTerms: ['retrieval'] })
    expect(parseEngineId(f.id)).toBeGreaterThan(0)
    expect(f.keyTerms).toEqual(['retrieval'])
    expect(listEiFacts()).toHaveLength(1)
    expect(() => addEiFact({ statement: 'short' })).toThrow()
  })

  it('records an attempt: attempt row, state upsert and queue update in one go', () => {
    const f = addEiFact({ statement: STATEMENT })
    const id = parseEngineId(f.id)!
    const first = recordEiAttempt({ factId: id, answer: GOOD, today: 100, predicted: 90 })
    expect(first.grade.total).toBeGreaterThan(40)
    expect([1, 2, 3, 4]).toContain(first.fsrsRating)
    expect(first.state.attempts).toBe(1)
    expect(first.state.dueDay).toBeGreaterThan(100)
    const second = recordEiAttempt({ factId: id, answer: GOOD, today: 105 })
    expect(second.state.attempts).toBe(2)
    expect(listEiStates()).toHaveLength(1)
    expect(listEiAttempts({ factId: id })).toHaveLength(2)
    expect(listEiAttempts({ limit: 1 })).toHaveLength(1)
    expect(listEiCalibrationPoints()).toEqual([{ predicted: 90, actual: first.grade.total }])
  })

  it('queue shows new facts first, hides not-due facts', () => {
    const a = addEiFact({ statement: STATEMENT })
    addEiFact({
      statement: 'Mitochondria make most of the cell energy through respiration.',
      priorKnowledge: 0.1,
    })
    expect(getEiQueue(0).queue).toHaveLength(2)
    recordEiAttempt({ factId: parseEngineId(a.id)!, answer: GOOD, today: 10 })
    const q = getEiQueue(10)
    expect(q.queue.map((i) => i.fact.id)).not.toContain(a.id)
    expect(q.summary).toMatchObject({ facts: 2, attempted: 1 })
  })

  it('archives facts, keeping history, and rejects attempts on them', () => {
    const f = addEiFact({ statement: STATEMENT })
    const id = parseEngineId(f.id)!
    recordEiAttempt({ factId: id, answer: GOOD, today: 1 })
    expect(archiveEiFact(id)).toBe(true)
    expect(archiveEiFact(id)).toBe(false)
    expect(listEiFacts()).toHaveLength(0)
    expect(listEiStates()).toHaveLength(0)
    expect(listEiAttempts({ factId: id })).toHaveLength(1)
    expect(() => recordEiAttempt({ factId: id, answer: GOOD, today: 2 })).toThrow(/not found/)
  })

  it('rolls back when the fact is missing and parses engine ids strictly', () => {
    expect(() => recordEiAttempt({ factId: 999, answer: GOOD, today: 1 })).toThrow()
    expect(db.select().from(eiAttempts).all()).toHaveLength(0)
    expect(parseEngineId('db12')).toBe(12)
    expect(parseEngineId('f12')).toBeNull()
    expect(parseEngineId('db1x')).toBeNull()
  })
})
