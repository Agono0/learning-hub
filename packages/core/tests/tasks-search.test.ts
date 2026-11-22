/**
 * Unit tests for task search (S3-14): ranking (prefix > substring > notes),
 * diacritics/case folding, scope options (done/archived), won't-do
 * exclusion, determinism and the empty-query rule.
 */
import { describe, expect, it } from 'vitest'
import { taskItemSchema, type TaskItem } from '../src/tasks'
import { searchTasks, taskToSearchDoc, type SearchDoc } from '../src/tasks/search'

const NOW = '2026-11-22T10:00:00.000Z'

function doc(overrides: Partial<SearchDoc> = {}): SearchDoc {
  return {
    id: 1,
    title: 'Write the parity matrix',
    notes: null,
    isDone: false,
    isArchived: false,
    updatedAt: NOW,
    ...overrides,
  }
}

function asDocs(tasks: TaskItem[]): SearchDoc[] {
  const mapped = tasks.map((t) => taskToSearchDoc(t))
  const out: SearchDoc[] = []
  for (const d of mapped) {
    if (d !== null) out.push(d)
  }
  return out
}

describe('ranking', () => {
  const docs = [
    doc({
      id: 1,
      title: 'Notes on parity in nature',
      notes: 'matrix multiplication',
      updatedAt: '2026-11-20T00:00:00.000Z',
    }),
    doc({ id: 2, title: 'Parity matrix review' }),
    doc({ id: 3, title: 'Write the parity matrix' }),
  ]

  it('title prefix beats substring beats notes', () => {
    const hits = searchTasks(docs, 'parity')
    expect(hits.map((h) => h.doc.id)).toEqual([3, 2, 1]) // prefix, substring, notes
    expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 0)
    expect(hits[1]?.score).toBeGreaterThan(hits[2]?.score ?? 0)
  })

  it('ties break by updatedAt desc, then id asc (fully stable)', () => {
    const tied = [
      doc({ id: 1, title: 'parity one', updatedAt: '2026-11-21T00:00:00.000Z' }),
      doc({ id: 2, title: 'parity two', updatedAt: '2026-11-22T00:00:00.000Z' }),
      doc({ id: 3, title: 'parity zero', updatedAt: '2026-11-22T00:00:00.000Z' }),
    ]
    expect(searchTasks(tied, 'parity').map((h) => h.doc.id)).toEqual([3, 2, 1])
  })
})

describe('folding', () => {
  it('matches case and diacritics insensitively', () => {
    const docs = [doc({ id: 1, title: 'Résumé José review' })]
    expect(searchTasks(docs, 'resume').map((h) => h.doc.id)).toEqual([1])
    expect(searchTasks(docs, 'JOSÉ').map((h) => h.doc.id)).toEqual([1])
  })
})

describe('scope options', () => {
  it('done and archived are opt-in; limit caps results', () => {
    const docs = [
      doc({ id: 1, title: 'parity done', isDone: true }),
      doc({ id: 2, title: 'parity archived', isArchived: true }),
      doc({ id: 3, title: 'parity live' }),
      doc({ id: 4, title: 'parity two' }),
    ]
    expect(searchTasks(docs, 'parity').map((h) => h.doc.id)).toEqual([3, 4])
    expect(searchTasks(docs, 'parity', { includeDone: true }).map((h) => h.doc.id)).toEqual([
      1, 3, 4,
    ])
    expect(searchTasks(docs, 'parity', { includeArchived: true }).map((h) => h.doc.id)).toEqual([
      2, 3, 4,
    ])
    expect(searchTasks(docs, 'parity', { limit: 1 }).map((h) => h.doc.id)).toEqual([3])
  })

  it('empty or whitespace queries return nothing (no match-all)', () => {
    expect(searchTasks([doc()], '')).toEqual([])
    expect(searchTasks([doc()], '   ')).toEqual([])
  })
})

describe('taskToSearchDoc', () => {
  it('maps a TaskItem; won\u2019t-do tasks are excluded unconditionally', () => {
    const t = taskItemSchema.parse({
      id: 5,
      parentId: null,
      projectId: null,
      tagIds: [],
      title: 'written off',
      notes: 'some notes',
      priority: 'none',
      estimateMs: null,
      timeSpentOnDay: {},
      due: null,
      dueWithTime: false,
      deadline: null,
      isDone: false,
      doneAt: null,
      wonthado: true,
      repeatCfgId: null,
      order: 0,
      createdAt: NOW,
      updatedAt: NOW,
    })
    expect(asDocs([t])).toEqual([])
    const live = taskItemSchema.parse({ ...t, wonthado: false })
    const mapped = asDocs([live])[0]
    expect(mapped).toMatchObject({
      id: 5,
      title: 'written off',
      notes: 'some notes',
      isDone: false,
    })
  })
})
