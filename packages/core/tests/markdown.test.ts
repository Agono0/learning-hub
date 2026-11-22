/**
 * Core tests for the markdown paste service (S3-36): markdown → task drafts
 * (checkboxes, bullets, ordered lists, bare lines, headings skipped, fences
 * skipped, indentation nesting with one-level flatten) and the inverse
 * renderer (`tasksToMarkdown`) with an exact round-trip.
 */
import { describe, expect, it } from 'vitest'
import {
  isMarkdownPaste,
  markdownToTaskDrafts,
  MAX_PASTE_TASKS,
  tasksToMarkdown,
  type MarkdownTaskLike,
} from '../src/tasks/markdown'

describe('markdownToTaskDrafts — lines to drafts', () => {
  it('parses checkbox items with done state', () => {
    const drafts = markdownToTaskDrafts('- [ ] open item\n- [x] done item\n- [X] DONE upper')
    expect(drafts).toEqual([
      { title: 'open item', isDone: false, subtasks: [] },
      { title: 'done item', isDone: true, subtasks: [] },
      { title: 'DONE upper', isDone: true, subtasks: [] },
    ])
  })

  it('parses bullets, ordered lists and bare lines as open tasks', () => {
    const drafts = markdownToTaskDrafts('* star\n+ plus\n1) ordered\n2. ordered dot\nbare line')
    expect(drafts.map((d) => d.title)).toEqual([
      'star',
      'plus',
      'ordered',
      'ordered dot',
      'bare line',
    ])
    expect(drafts.every((d) => d.isDone === false)).toBe(true)
  })

  it('skips headings and empty lines (document structure, not work)', () => {
    expect(markdownToTaskDrafts('# Title\n## Sub\n\nreal task\n')).toEqual([
      { title: 'real task', isDone: false, subtasks: [] },
    ])
  })

  it('skips fenced code blocks whole', () => {
    const md = 'before\n```\nnot a task\n- [x] also not\n```\nafter\n~~~\nalso skipped\n~~~'
    expect(markdownToTaskDrafts(md).map((d) => d.title)).toEqual(['before', 'after'])
  })

  it('is total: empty/junk input yields an empty list, never throws', () => {
    expect(markdownToTaskDrafts('')).toEqual([])
    expect(markdownToTaskDrafts('\n\n \n')).toEqual([])
    expect(markdownToTaskDrafts('- [ ] \n- \n*   ')).toEqual([])
    expect(markdownToTaskDrafts(undefined as unknown as string)).toEqual([])
  })
})

describe('markdownToTaskDrafts — nesting (one level, S3-04)', () => {
  it('indented lines become subtasks of the nearest shallower task', () => {
    const md = ['- parent', '  - [x] done child', '  - plain child', '- sibling'].join('\n')
    const drafts = markdownToTaskDrafts(md)
    expect(drafts).toEqual([
      {
        title: 'parent',
        isDone: false,
        subtasks: [
          { title: 'done child', isDone: true },
          { title: 'plain child', isDone: false },
        ],
      },
      { title: 'sibling', isDone: false, subtasks: [] },
    ])
  })

  it('deeper than one level flattens to siblings at level 2', () => {
    const md = ['- parent', '  - child', '    - grandchild', '    - grandchild 2'].join('\n')
    const drafts = markdownToTaskDrafts(md)
    expect(drafts[0].subtasks.map((s) => s.title)).toEqual(['child', 'grandchild', 'grandchild 2'])
    expect(drafts).toHaveLength(1)
  })

  it('a dedent closes the subtask scope — the next task is top-level', () => {
    const md = ['- a', '  - a-child', '- b', '  - b-child'].join('\n')
    const drafts = markdownToTaskDrafts(md)
    expect(drafts.map((d) => d.title)).toEqual(['a', 'b'])
    expect(drafts[0].subtasks.map((s) => s.title)).toEqual(['a-child'])
    expect(drafts[1].subtasks.map((s) => s.title)).toEqual(['b-child'])
  })

  it('tabs count as one indent level (normalized to two spaces)', () => {
    const drafts = markdownToTaskDrafts('- parent\n\t- child')
    expect(drafts[0].subtasks.map((s) => s.title)).toEqual(['child'])
  })
})

describe('markdownToTaskDrafts — caps', () => {
  it('caps the paste at MAX_PASTE_TASKS top-level tasks', () => {
    const md = Array.from({ length: MAX_PASTE_TASKS + 50 }, (_, i) => `- task ${i}`).join('\n')
    const drafts = markdownToTaskDrafts(md)
    expect(drafts).toHaveLength(MAX_PASTE_TASKS)
    expect(drafts[0].title).toBe('task 0')
  })

  it('truncates titles to the 500-char task cap', () => {
    const drafts = markdownToTaskDrafts(`- ${'x'.repeat(600)}`)
    expect(drafts[0].title).toHaveLength(500)
  })
})

describe('tasksToMarkdown (the inverse renderer)', () => {
  it('renders checkboxes with two-space-indented subtasks', () => {
    const tasks: MarkdownTaskLike[] = [
      { title: 'parent', isDone: true, subtasks: [{ title: 'child', isDone: false }] },
      { title: 'open', subtasks: [] },
    ]
    expect(tasksToMarkdown(tasks)).toBe('- [x] parent\n  - [ ] child\n- [ ] open')
  })

  it('round-trips through the parser exactly', () => {
    const tasks: MarkdownTaskLike[] = [
      {
        title: 'Write the essay',
        isDone: false,
        subtasks: [
          { title: 'Outline', isDone: true },
          { title: 'Draft', isDone: false },
        ],
      },
      { title: 'Submit form', isDone: true },
    ]
    const md = tasksToMarkdown(tasks)
    const drafts = markdownToTaskDrafts(md)
    expect(drafts).toEqual([
      {
        title: 'Write the essay',
        isDone: false,
        subtasks: [
          { title: 'Outline', isDone: true },
          { title: 'Draft', isDone: false },
        ],
      },
      { title: 'Submit form', isDone: true, subtasks: [] },
    ])
  })

  it('drops empty titles and truncates overlong ones', () => {
    expect(tasksToMarkdown([{ title: '   ' }, { title: 'ok' }])).toBe('- [ ] ok')
    expect(tasksToMarkdown([{ title: 'y'.repeat(600) }])).toHaveLength(500 + '- [ ] '.length)
  })
})

describe('isMarkdownPaste (the UI gate)', () => {
  it('multi-line text is a paste', () => {
    expect(isMarkdownPaste('one\ntwo')).toBe(true)
    expect(isMarkdownPaste('- a\n- b')).toBe(true)
  })

  it('a single line starting with a list marker is a paste', () => {
    expect(isMarkdownPaste('- only one')).toBe(true)
    expect(isMarkdownPaste('1) first')).toBe(true)
    expect(isMarkdownPaste('* star')).toBe(true)
  })

  it('a plain one-line sentence stays in the short-syntax input', () => {
    expect(isMarkdownPaste('Draft spec #work 1h @tom')).toBe(false)
    expect(isMarkdownPaste('')).toBe(false)
  })
})
