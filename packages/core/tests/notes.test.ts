import { describe, expect, it } from 'vitest'
import {
  SUPERTAG_TEMPLATES,
  extractBacklinks,
  parseBullets,
  bulletSyncPlan,
  wikilinkParse,
} from '../src/notes'

describe('supertag templates', () => {
  it('defines the five templates, each with fields', () => {
    const keys = Object.keys(SUPERTAG_TEMPLATES)
    expect(keys).toEqual(expect.arrayContaining(['BIBLIDEF', 'DEFINITION', 'THEOREM', 'PERSON', 'BOOK']))
    expect(keys).toHaveLength(5)
    for (const t of Object.values(SUPERTAG_TEMPLATES)) {
      expect(Object.keys(t.fields).length).toBeGreaterThan(0)
    }
    expect(SUPERTAG_TEMPLATES.THEOREM!.fields.statement).toBeTruthy()
  })
})

describe('extractBacklinks', () => {
  const notes = [
    { id: 1, title: 'Group theory' },
    { id: 2, title: 'Cosets' },
    { id: 3, title: 'Lagrange theorem' },
  ]
  const links = [
    { fromNoteId: 2, toNoteId: 1, type: 'prereq', context: 'cosets need groups' },
    { fromNoteId: 3, toNoteId: 1, type: 'related', context: null },
    { fromNoteId: 1, toNoteId: 2, type: 'related', context: 'forward link' },
  ]

  it('returns only incoming links with resolved titles', () => {
    const backlinks = extractBacklinks(notes, links, 1)
    expect(backlinks).toHaveLength(2)
    expect(backlinks.map((b) => b.fromTitle)).toEqual(['Cosets', 'Lagrange theorem'])
    expect(backlinks[0]).toMatchObject({ type: 'prereq', context: 'cosets need groups' })
  })

  it('returns [] for notes without backlinks and tolerates missing titles', () => {
    expect(extractBacklinks(notes, links, 99)).toEqual([])
    const orphan = extractBacklinks([{ id: 7, title: 'ghost' }], [{ fromNoteId: 404, toNoteId: 7 }], 7)
    expect(orphan[0]!.fromTitle).toContain('404')
  })
})

describe('wikilinkParse', () => {
  it('extracts unique targets in order', () => {
    const content = 'See [[Group theory]] and [[Group theory|groups]], also [[Cosets]].\nNested [[Lagrange theorem]] ref.'
    expect(wikilinkParse(content)).toEqual(['Group theory', 'Cosets', 'Lagrange theorem'])
  })

  it('returns [] with no links and ignores malformed pairs', () => {
    expect(wikilinkParse('plain text, no links')).toEqual([])
    expect(wikilinkParse('broken [[ [[x]] [[ ]] [[a|b]]')).toEqual(['x', 'a'])
  })
})

describe('parseBullets + bulletSyncPlan', () => {
  it('parses markdown bullets of every marker style', () => {
    const bullets = parseBullets('# Title\n- alpha\n* beta\n+ gamma\n1. delta\nnot a bullet')
    expect(bullets.map((b) => b.content)).toEqual(['alpha', 'beta', 'gamma', 'delta'])
    expect(bullets.map((b) => b.position)).toEqual([0, 1, 2, 3])
  })

  it('no-op plan when bullets unchanged', () => {
    const rows = [
      { id: 1, content: 'alpha', position: 0, cardId: 11 },
      { id: 2, content: 'beta', position: 1, cardId: null },
    ]
    const plan = bulletSyncPlan(rows, '- alpha\n- beta')
    expect(plan).toEqual({ create: [], update: [], remove: [] })
  })

  it('plans create for new bullets and update for reworded ones', () => {
    const rows = [{ id: 1, content: 'alpha', position: 0, cardId: 11 }]
    const plan = bulletSyncPlan(rows, '- alpha (with a caveat)\n- brand new bullet')
    expect(plan.create.map((c) => c.content)).toEqual(['brand new bullet'])
    expect(plan.update).toEqual([{ id: 1, content: 'alpha (with a caveat)' }])
    expect(plan.remove).toEqual([])
  })

  it('plans removal for bullets deleted from the note', () => {
    const rows = [
      { id: 1, content: 'alpha', position: 0, cardId: 11 },
      { id: 2, content: 'gone', position: 1, cardId: 12 },
    ]
    const plan = bulletSyncPlan(rows, '- alpha')
    expect(plan.remove).toEqual([{ id: 2, content: 'gone', cardId: 12 }])
  })
})
