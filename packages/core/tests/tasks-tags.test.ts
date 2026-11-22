/**
 * Unit tests for core tags (S3-06): normalization, create/update, and the
 * SP filter semantics (OR / AND / no-tags / Today virtual tag).
 */
import { describe, expect, it } from 'vitest'
import {
  createTag,
  filterTasksByTags,
  NO_TAGS_VIRTUAL_TAG_ID,
  normalizeTagName,
  TODAY_VIRTUAL_TAG_ID,
  updateTag,
  virtualTagMembers,
  type TaskLike,
} from '../src/tasks/tags'

const NOW = '2026-11-22T00:00:00.000Z'

function t(id: number, tagIds: number[]): TaskLike {
  return { id, tagIds }
}

describe('normalizeTagName / createTag / updateTag', () => {
  it('trims and collapses whitespace, preserves case, caps at 100', () => {
    expect(normalizeTagName('  work   stuff  ')).toBe('work stuff')
    expect(normalizeTagName('API')).toBe('API')
    expect(normalizeTagName('x'.repeat(120))).toHaveLength(100)
  })

  it('creates with defaults and rejects empty names', () => {
    const tag = createTag({ name: '  deep   work ' }, '2026-11-22T00:00:00.000Z')
    expect(tag).toEqual({
      id: 0,
      name: 'deep work',
      color: null,
      createdAt: '2026-11-22T00:00:00.000Z',
    })
    expect(() => createTag({ name: '   ' }, '2026-11-22T00:00:00.000Z')).toThrow(RangeError)
    expect(() => createTag({ name: '' }, '2026-11-22T00:00:00.000Z')).toThrow()
  })

  it('updates immutably; color can be cleared with null', () => {
    const tag = createTag({ name: 'work', color: 'sky' }, NOW)
    const next = updateTag(tag, { name: '  deep  work ', color: null })
    expect(next).toEqual({ id: 0, name: 'deep work', color: null, createdAt: tag.createdAt })
    expect(tag.color).toBe('sky')
    expect(() => updateTag(tag, { name: '' })).toThrow(RangeError)
  })
})

describe('filterTasksByTags (SP OR / AND semantics)', () => {
  const tasks = [t(1, [7]), t(2, [7, 8]), t(3, [8]), t(4, []), t(5, [9])]

  it('empty selection is a pass-through (copy, not reference)', () => {
    const out = filterTasksByTags(tasks, { tagIds: [], mode: 'or' })
    expect(out).toEqual(tasks)
    expect(out).not.toBe(tasks)
  })

  it('OR: any selected tag matches', () => {
    expect(filterTasksByTags(tasks, { tagIds: [7, 9], mode: 'or' }).map((x) => x.id)).toEqual([
      1, 2, 5,
    ])
  })

  it('AND: every selected tag must be present', () => {
    expect(filterTasksByTags(tasks, { tagIds: [7, 8], mode: 'and' }).map((x) => x.id)).toEqual([2])
    expect(filterTasksByTags(tasks, { tagIds: [7], mode: 'and' }).map((x) => x.id)).toEqual([1, 2])
  })

  it('"no tags" virtual chip joins OR selections; AND with it means untagged', () => {
    const or = filterTasksByTags(tasks, { tagIds: [9], mode: 'or', includeNoTags: true })
    expect(or.map((x) => x.id)).toEqual([4, 5])

    const andUntagged = filterTasksByTags(tasks, {
      tagIds: [NO_TAGS_VIRTUAL_TAG_ID],
      mode: 'and',
    })
    expect(andUntagged.map((x) => x.id)).toEqual([4])
  })

  it('Today virtual tag filters via caller-provided membership (S3-65 supplies the math)', () => {
    const todayIds = new Set([1, 4])
    expect(
      filterTasksByTags(tasks, { tagIds: [TODAY_VIRTUAL_TAG_ID], mode: 'or' }, todayIds).map(
        (x) => x.id,
      ),
    ).toEqual([1, 4])
    // AND across Today + a real tag: due today AND tagged.
    expect(
      filterTasksByTags(tasks, { tagIds: [TODAY_VIRTUAL_TAG_ID, 7], mode: 'and' }, todayIds).map(
        (x) => x.id,
      ),
    ).toEqual([1])
  })

  it('virtualTagMembers resolves no-tags and Today members', () => {
    expect(virtualTagMembers(NO_TAGS_VIRTUAL_TAG_ID, tasks, new Set()).has(4)).toBe(true)
    expect(virtualTagMembers(TODAY_VIRTUAL_TAG_ID, tasks, new Set([2])).has(2)).toBe(true)
    expect(virtualTagMembers(99, tasks, new Set()).size).toBe(0)
  })

  it('preserves input order', () => {
    const shuffled = [t(5, [9]), t(1, [7]), t(4, [])]
    expect(filterTasksByTags(shuffled, { tagIds: [7, 9], mode: 'or' }).map((x) => x.id)).toEqual([
      5, 1,
    ])
  })
})
