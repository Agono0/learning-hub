import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { lhcfCourseSchema } from '@learning-hub/core/curriculum'
import { analyzeCourse, mergeCourses } from '@learning-hub/core/curriculum/authoring'
import {
  REFACTOR_KINDS,
  compareSources,
  courseToText,
  formatBytes,
  loadCourse,
  makePacket,
  mergeSources,
  opFromForm,
  resolveMerge,
  reviewMarkdown,
  runPreview,
} from '../src/components/course-authoring/analysis'
import { EXAMPLE_COURSE } from '../src/components/course-authoring/example-course'
import {
  ConflictCard,
  DiffList,
  ExportView,
  MergeView,
  PreviewView,
  RefactorForm,
} from '../src/components/course-authoring/ActionPanels'
import { CourseAuthoringStudio } from '../src/components/course-authoring/CourseAuthoringStudio'
import {
  AlignmentTable,
  Disclaimer,
  FindingCard,
  FindingList,
  IgnoredRules,
  LevelBars,
  OutcomeTable,
  ParseIssues,
  SummaryBadges,
  TimeTable,
} from '../src/components/course-authoring/panels'
import {
  AUTHORING_STORAGE_KEY,
  MAX_SOURCE_CHARS,
  defaultState,
  readState,
  serializeState,
  writeState,
} from '../src/components/course-authoring/state'

const text = courseToText(EXAMPLE_COURSE)
const edit = (fn: (c: ReturnType<typeof clone>) => void) => {
  const c = clone()
  fn(c)
  return JSON.stringify(c)
}
const clone = () =>
  JSON.parse(text) as {
    title: string
    modules: { lessons: { title: string; estMinutes?: number }[] }[]
  }

describe('state', () => {
  it('round-trips', () => {
    const s = {
      ...defaultState(),
      source: 'a',
      base: 'b',
      theirs: 'c',
      ignored: ['x.y'],
      tab: 'compare' as const,
    }
    expect(readState(serializeState(s))).toEqual({ state: s, unreadable: false })
  })
  it('falls back for missing, broken, wrong-version and oversized data', () => {
    expect(readState(null)).toEqual({ state: defaultState(), unreadable: false })
    expect(readState('{').unreadable).toBe(true)
    expect(readState('[]').unreadable).toBe(true)
    expect(readState('{"version":2}').unreadable).toBe(true)
    expect(readState('x'.repeat(MAX_SOURCE_CHARS * 3 + 200_000)).unreadable).toBe(true)
  })
  it('cleans odd fields instead of trusting them', () => {
    const r = readState(
      JSON.stringify({ version: 1, source: 5, tab: 'nope', ignored: ['ok', 3, 'x'.repeat(200)] }),
    )
    expect(r.state.source).toBe('')
    expect(r.state.tab).toBe('review')
    expect(r.state.ignored).toEqual(['ok'])
  })
  it('reports a failed save', () => {
    expect(writeState({ setItem: () => undefined }, defaultState())).toBe(true)
    expect(
      writeState(
        {
          setItem: () => {
            throw new Error('quota')
          },
        },
        defaultState(),
      ),
    ).toBe(false)
    expect(AUTHORING_STORAGE_KEY).toContain('course-authoring')
  })
})

describe('analysis glue', () => {
  it('loads empty, broken and valid sources', () => {
    expect(loadCourse('  ')).toMatchObject({ ok: false, empty: true })
    const bad = loadCourse('{"lhcf":1}')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors.length).toBeGreaterThan(0)
    expect(loadCourse(text).ok).toBe(true)
  })
  it('the example course parses and has something to review', () => {
    expect(lhcfCourseSchema.safeParse(EXAMPLE_COURSE).success).toBe(true)
    const r = analyzeCourse(EXAMPLE_COURSE)
    const ids = r.findings.map((f) => f.ruleId)
    expect(ids).toContain('align.outcome-uncovered')
    expect(ids).toContain('ex.mcq-all-none')
    expect(ids).toContain('time.hours-mismatch')
    expect(ids).toContain('dup.exam-copies-lesson')
    expect(reviewMarkdown(EXAMPLE_COURSE, [])).toContain('SQL starter: course review')
  })
  it('builds operations from form values and names what is missing', () => {
    expect(opFromForm('rename-skill', { from: 'a', to: 'b' })).toEqual({
      ok: true,
      op: { type: 'rename-skill', from: 'a', to: 'b' },
    })
    expect(opFromForm('rename-skill', { from: 'a' })).toEqual({
      ok: false,
      error: 'Fill in: New skill slug.',
    })
    expect(opFromForm('move-lesson', { slug: 'a', toModule: 'b', index: '2' })).toMatchObject({
      ok: true,
      op: { index: 2 },
    })
    expect(opFromForm('move-lesson', { slug: 'a', toModule: 'b', index: '-1' })).toMatchObject({
      ok: false,
    })
    expect(opFromForm('move-lesson', { slug: 'a', toModule: 'b', index: '1.5' })).toMatchObject({
      ok: false,
    })
    expect(opFromForm('reorder-modules', { order: 'a, b  c' })).toEqual({
      ok: true,
      op: { type: 'reorder-modules', order: ['a', 'b', 'c'] },
    })
    expect(opFromForm('remove-skill', { slug: 'a', detach: true })).toMatchObject({
      ok: true,
      op: { detach: true },
    })
    expect(opFromForm('stamp-exercise-ids', {})).toEqual({
      ok: true,
      op: { type: 'stamp-exercise-ids' },
    })
  })
  it('has a form for every operation type', () => {
    expect(new Set(REFACTOR_KINDS.map((k) => k.type)).size).toBe(11)
    for (const k of REFACTOR_KINDS) expect(k.help.length).toBeGreaterThan(10)
  })
  it('previews without changing the course', () => {
    const p = runPreview(EXAMPLE_COURSE, { type: 'rename-module', from: 'joining', to: 'joins' })
    expect(p.ok).toBe(true)
    expect(EXAMPLE_COURSE.modules[1]!.slug).toBe('joining')
  })
  it('compares two sources and explains failures', () => {
    const ok = compareSources(
      text,
      edit((c) => (c.title = 'Other')),
    )
    expect(ok.ok && ok.diff.counts.changed).toBe(1)
    expect(compareSources('', text)).toMatchObject({ ok: false, error: 'Load your course first.' })
    expect(compareSources(text, '')).toMatchObject({ ok: false, error: 'Paste the other version.' })
    expect(compareSources(text, '{"lhcf":1}')).toMatchObject({ ok: false })
  })
  it('merges three sources, and resolves only with choices', () => {
    const ours = edit((c) => (c.modules[0]!.lessons[0]!.title = 'Mine'))
    const theirs = edit((c) => (c.modules[0]!.lessons[0]!.title = 'Theirs'))
    const m = mergeSources(text, ours, theirs)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.result.conflicts).toHaveLength(1)
    const id = m.result.conflicts[0]!.id
    expect(resolveMerge(m.result, {}).validation).toBeNull()
    expect(resolveMerge(m.result, { [id]: 'theirs' }).validation?.ok).toBe(true)
    expect(mergeSources('', ours, theirs)).toMatchObject({
      ok: false,
      error: 'The base version is empty.',
    })
    expect(mergeSources(text, '{', theirs)).toMatchObject({ ok: false })
  })
  it('builds a packet and formats sizes', () => {
    const r = makePacket(EXAMPLE_COURSE, false)
    expect(r.ok).toBe(true)
    expect(formatBytes(900)).toBe('900 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})

describe('rendering', () => {
  const report = analyzeCourse(EXAMPLE_COURSE)
  it('renders the empty studio with no findings and a prompt to load a course', () => {
    const html = renderToString(React.createElement(CourseAuthoringStudio))
    expect(html).toContain('Course authoring')
    expect(html).toContain('No course yet')
    expect(html).toContain('Load example course')
    expect(html).toContain('Nothing is uploaded or published')
  })
  it('renders parse issues', () => {
    const html = renderToString(
      React.createElement(ParseIssues, {
        errors: [{ path: 'modules', message: 'needs one', hint: 'add it' }],
      }),
    )
    expect(html).toMatch(/modules.*needs one.*add it/)
  })
  it('renders findings with evidence and the false-positive line', () => {
    const f = report.findings[0]!
    const html = renderToString(
      React.createElement(FindingCard, { finding: f, onIgnore: () => undefined }),
    )
    expect(html).toContain(f.ruleId)
    expect(html).toContain('Could be wrong when')
    expect(html).toContain('Hide this rule')
  })
  it('lists findings, caps them and shows an empty state', () => {
    const html = renderToString(
      React.createElement(FindingList, { findings: report.findings, limit: 2 }),
    )
    expect((html.match(/data-testid="finding"/g) ?? []).length).toBe(2)
    expect(html).toContain(`Show all ${report.findings.length}`)
    expect(renderToString(React.createElement(FindingList, { findings: [] }))).toContain(
      'does not prove the course is good',
    )
  })
  it('renders summary, disclaimer and ignored rules', () => {
    expect(renderToString(React.createElement(SummaryBadges, { report }))).toContain('warning')
    expect(renderToString(React.createElement(Disclaimer, { text: report.disclaimer }))).toContain(
      'text heuristics',
    )
    expect(
      renderToString(
        React.createElement(IgnoredRules, { ignored: ['a.b'], onRestore: () => undefined }),
      ),
    ).toContain('a.b (show)')
    expect(
      renderToString(
        React.createElement(IgnoredRules, { ignored: [], onRestore: () => undefined }),
      ),
    ).toBe('')
  })
  it('renders the alignment table, outcomes, levels and time', () => {
    const t = renderToString(React.createElement(AlignmentTable, { matrix: report.alignment }))
    expect(t).toContain('select-where')
    expect(t).toContain('cell-matched')
    expect(
      renderToString(React.createElement(OutcomeTable, { matrix: report.alignment })),
    ).toContain('no lesson')
    expect(renderToString(React.createElement(LevelBars, { matrix: report.alignment }))).toContain(
      'create',
    )
    const time = renderToString(React.createElement(TimeTable, { report }))
    expect(time).toContain('not measured learner time')
    expect(time).toContain('sorting')
  })
  it('renders diffs and caps long lists', () => {
    const a = loadCourse(text)
    const b = loadCourse(edit((c) => c.modules[0]!.lessons.forEach((l, i) => (l.title = `T${i}`))))
    if (!a.ok || !b.ok) throw new Error('fixture')
    const html = renderToString(
      React.createElement(DiffList, {
        diff: compareSources(text, courseToText(b.course)).ok
          ? (compareSources(text, courseToText(b.course)) as unknown as { ok: true; diff: never })
              .diff
          : (null as never),
      }),
    )
    expect(html).toContain('2 changed')
    expect(
      renderToString(
        React.createElement(DiffList, {
          diff: {
            changes: [],
            counts: { added: 0, removed: 0, changed: 0, moved: 0, reordered: 0 },
            byEntity: {},
            identical: true,
          },
        }),
      ),
    ).toContain('the same')
  })
  it('renders conflicts and a merge that needs choices, with the use button disabled', () => {
    const o = loadCourse(edit((c) => (c.modules[0]!.lessons[0]!.title = 'Mine')))
    const t = loadCourse(edit((c) => (c.modules[0]!.lessons[0]!.title = 'Theirs')))
    const b = loadCourse(text)
    if (!o.ok || !t.ok || !b.ok) throw new Error('fixture')
    const result = mergeCourses(b.course, o.course, t.course)
    const html = renderToString(React.createElement(MergeView, { result, onUse: () => undefined }))
    expect(html).toContain('1 conflict(s) need your choice')
    expect(html).toContain('1 unresolved')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*Use the merged course/)
    const card = renderToString(
      React.createElement(ConflictCard, {
        conflict: result.conflicts[0]!,
        choice: undefined,
        onChoose: () => undefined,
      }),
    )
    expect(card).toContain('Keep yours')
    expect(card).toContain('Take theirs')
    expect(card).not.toContain('checked')
  })
  it('renders a clean merge with the use button', () => {
    const b = loadCourse(text)
    const o = loadCourse(edit((c) => (c.title = 'Mine')))
    if (!b.ok || !o.ok) throw new Error('fixture')
    const html = renderToString(
      React.createElement(MergeView, {
        result: mergeCourses(b.course, o.course, b.course),
        onUse: () => undefined,
      }),
    )
    expect(html).toContain('Merged without conflicts')
    expect(html).toContain('Use the merged course')
  })
  it('renders refactor previews: blocked, and ready with warnings', () => {
    const blocked = runPreview(EXAMPLE_COURSE, {
      type: 'rename-skill',
      from: 'select',
      to: 'joins',
    })
    const h1 = renderToString(
      React.createElement(PreviewView, {
        op: { type: 'rename-skill', from: 'select', to: 'joins' },
        preview: blocked,
        onApply: () => undefined,
      }),
    )
    expect(h1).toContain('This cannot be applied')
    expect(h1).not.toContain('Apply this change')
    const ok = runPreview(EXAMPLE_COURSE, {
      type: 'rename-lesson',
      from: 'sorting',
      to: 'ordering',
    })
    const h2 = renderToString(
      React.createElement(PreviewView, {
        op: { type: 'rename-lesson', from: 'sorting', to: 'ordering' },
        preview: ok,
        onApply: () => undefined,
      }),
    )
    expect(h2).toContain('Check before applying')
    expect(h2).toContain('Nothing changes until you apply')
    expect(h2).toContain('Apply this change')
  })
  it('renders the refactor form and the export view', () => {
    const f = renderToString(
      React.createElement(RefactorForm, { course: EXAMPLE_COURSE, onApply: () => undefined }),
    )
    expect(f).toContain('Rename a skill')
    expect(f).toContain('Preview')
    expect(f).not.toContain('Apply this change')
    expect(
      renderToString(React.createElement(ExportView, { course: EXAMPLE_COURSE, ready: false })),
    ).toContain('Load a course first')
    const e = renderToString(
      React.createElement(ExportView, { course: EXAMPLE_COURSE, ready: true }),
    )
    expect(e).toContain('no scripts')
    expect(e).toContain('Build packet')
  })
})
