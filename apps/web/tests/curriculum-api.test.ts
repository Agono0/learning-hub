/**
 * Curriculum v2 over HTTP: the same runtime-neutral handlers the Next.js
 * shims and the native hub worker serve, driven with real Requests against an
 * isolated, EMPTY temp database (initDb creates every table itself).
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-curriculum-api-')), 'api.db')

const example = (f: string) =>
  readFileSync(resolve(__dirname, '../../../curricula/examples', f), 'utf8')
const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const url = (p: string) => `http://localhost${p}`
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })

type Handlers = {
  importRoute: typeof import('@/server/handlers/curriculum/import/route')
  prompt: typeof import('@/server/handlers/curriculum/prompt/route')
  courses: typeof import('@/server/handlers/curriculum/courses/route')
  course: typeof import('@/server/handlers/curriculum/courses/[id]/route')
  exportRoute: typeof import('@/server/handlers/curriculum/courses/[id]/export/route')
  exam: typeof import('@/server/handlers/curriculum/courses/[id]/exam/route')
  certificate: typeof import('@/server/handlers/curriculum/courses/[id]/certificate/route')
  lesson: typeof import('@/server/handlers/curriculum/lessons/[id]/route')
  practice: typeof import('@/server/handlers/curriculum/practice/route')
  stage: typeof import('@/server/handlers/curriculum/stages/[id]/route')
  review: typeof import('@/server/handlers/review/route')
}
// Assigned in beforeAll, after LEARNING_HUB_DB points at the temp database.
let H: Handlers

beforeAll(async () => {
  H = {
    importRoute: await import('@/server/handlers/curriculum/import/route'),
    prompt: await import('@/server/handlers/curriculum/prompt/route'),
    courses: await import('@/server/handlers/curriculum/courses/route'),
    course: await import('@/server/handlers/curriculum/courses/[id]/route'),
    exportRoute: await import('@/server/handlers/curriculum/courses/[id]/export/route'),
    exam: await import('@/server/handlers/curriculum/courses/[id]/exam/route'),
    certificate: await import('@/server/handlers/curriculum/courses/[id]/certificate/route'),
    lesson: await import('@/server/handlers/curriculum/lessons/[id]/route'),
    practice: await import('@/server/handlers/curriculum/practice/route'),
    stage: await import('@/server/handlers/curriculum/stages/[id]/route'),
    review: await import('@/server/handlers/review/route'),
  }
})

let courseId = 0

describe('curriculum API', () => {
  it('builds a prompt from the wizard inputs and validates them', async () => {
    const ok = await H.prompt.GET(
      new Request(
        url('/api/curriculum/prompt?topic=Statistics&hoursPerWeek=3&weeks=4&format=yaml'),
      ),
    )
    expect(ok.status).toBe(200)
    expect((await ok.json()).prompt).toMatch(/Statistics[\s\S]*ONLY the YAML/)
    const bad = await H.prompt.GET(new Request(url('/api/curriculum/prompt?topic=x')))
    expect(bad.status).toBe(400)
  })

  it('previews (dry run) then imports a course, reporting errors as data', async () => {
    const invalid = await (
      await H.importRoute.POST(
        new Request(url('/api/curriculum/import'), json({ text: '{"title": 1}' })),
      )
    ).json()
    expect(invalid.ok).toBe(false)
    expect(invalid.errors.length).toBeGreaterThan(0)

    const dry = await (
      await H.importRoute.POST(
        new Request(
          url('/api/curriculum/import'),
          json({ text: example('sql-essentials.yaml'), dryRun: true }),
        ),
      )
    ).json()
    expect(dry).toMatchObject({
      ok: true,
      format: 'yaml',
      preview: { slug: 'sql-essentials', updatesExisting: false },
    })
    expect(dry.report).toBeUndefined()

    const done = await (
      await H.importRoute.POST(
        new Request(
          url('/api/curriculum/import'),
          json({ text: example('sql-essentials.yaml'), filename: 'sql.yaml' }),
        ),
      )
    ).json()
    expect(done.report.created).toBe(true)
    courseId = done.report.courseId

    const again = await (
      await H.importRoute.POST(
        new Request(
          url('/api/curriculum/import'),
          json({ text: example('sql-essentials.yaml'), dryRun: true }),
        ),
      )
    ).json()
    expect(again.preview.updatesExisting).toBe(true)
  })

  it('lists the catalog and serves the overview', async () => {
    const { courses } = await (
      await H.courses.GET(new Request(url('/api/curriculum/courses')))
    ).json()
    expect(courses).toHaveLength(1)
    const overview = await (
      await H.course.GET(new Request(url(`/api/curriculum/courses/${courseId}`)), ctx(courseId))
    ).json()
    expect(overview.modules).toHaveLength(2)
    expect(
      (await H.course.GET(new Request(url('/api/curriculum/courses/999')), ctx(999))).status,
    ).toBe(404)
    expect(
      (await H.course.GET(new Request(url('/api/curriculum/courses/abc')), ctx('abc'))).status,
    ).toBe(404)
  })

  it('runs a lesson: view, practice through the review pipeline, completion XP once', async () => {
    const overview = await (await H.course.GET(new Request(url('/x')), ctx(courseId))).json()
    const lessonId = overview.modules[0].lessons[0].id
    const view = await (await H.lesson.GET(new Request(url('/x')), ctx(lessonId))).json()
    expect(view.lesson.title).toBe('SELECT and FROM')
    const typein = view.exercises.find(
      (e: { exercise: { type: string } }) => e.exercise.type === 'typein',
    )

    // Lesson Pretesting (Richland et al. 2009): primes learner without counting as lesson attempt or updating FSRS
    const pretestRes = await (
      await H.practice.POST(
        new Request(
          url('/api/curriculum/practice'),
          json({ cardId: typein.cardId, answer: { text: 'wrong_guess' }, pretest: true }),
        ),
      )
    ).json()
    expect(pretestRes.pretest).toBe(true)
    expect(pretestRes.result.correct).toBe(false)
    expect(pretestRes.review).toBeNull()

    // Pretest did not count as an official attempt on the lesson
    const pretestLessonCheck = await (
      await H.lesson.GET(new Request(url('/x')), ctx(lessonId))
    ).json()
    expect(pretestLessonCheck.progress).toBeNull()

    const right = await (
      await H.practice.POST(
        new Request(
          url('/api/curriculum/practice'),
          json({ cardId: typein.cardId, answer: { text: 'from' }, timeMs: 3000 }),
        ),
      )
    ).json()
    expect(right.result.correct).toBe(true)
    expect(right.review.xpEarned).toBeGreaterThan(0)
    expect(new Date(right.review.due).getTime()).toBeGreaterThan(Date.now() - 1000)

    const wrong = await (
      await H.practice.POST(
        new Request(url('/x'), json({ cardId: typein.cardId, answer: { text: 'select' } })),
      )
    ).json()
    expect(wrong.result).toMatchObject({ correct: false, grade: 1 })

    const after = await (await H.lesson.GET(new Request(url('/x')), ctx(lessonId))).json()
    expect(after.progress).toMatchObject({ attempts: 2, correct: 1 })

    const first = await (
      await H.lesson.POST(
        new Request(
          url('/x'),
          json({ action: 'complete', reflections: ['It avoids extra columns.'] }),
        ),
        ctx(lessonId),
      )
    ).json()
    expect(first.xpEarned).toBeGreaterThan(0)
    const second = await (
      await H.lesson.POST(new Request(url('/x'), json({ action: 'complete' })), ctx(lessonId))
    ).json()
    expect(second.xpEarned).toBe(0)
  })

  it('rejects practice on unknown cards and malformed bodies', async () => {
    expect(
      (await H.practice.POST(new Request(url('/x'), json({ cardId: 999999, answer: {} })))).status,
    ).toBe(404)
    expect((await H.practice.POST(new Request(url('/x'), json({ cardId: 'nope' })))).status).toBe(
      400,
    )
  })

  it('grades the final exam on the server and gates the certificate', async () => {
    const exam = await (await H.exam.GET(new Request(url('/x')), ctx(courseId))).json()
    expect(exam.exercises).toHaveLength(3)
    const notYet = await H.certificate.POST(
      new Request(url('/x'), { method: 'POST' }),
      ctx(courseId),
    )
    expect(notYet.status).toBe(409)

    // finish everything, then pass the exam
    const overview = await (await H.course.GET(new Request(url('/x')), ctx(courseId))).json()
    for (const m of overview.modules)
      for (const l of m.lessons)
        await H.lesson.POST(new Request(url('/x'), json({ action: 'complete' })), ctx(l.id))
    for (const p of overview.projects)
      for (const s of p.stages)
        await H.stage.PATCH(
          new Request(url('/x'), {
            ...json({ checked: s.checklist.map(() => true) }),
            method: 'PATCH',
          }),
          ctx(s.id),
        )
    const graded = await (
      await H.exam.POST(
        new Request(
          url('/x'),
          json({ answers: [{ choice: 1 }, { text: 'left join' }, { value: true }] }),
        ),
        ctx(courseId),
      )
    ).json()
    expect(graded).toMatchObject({ score: 1, passed: true, certificate: { eligible: true } })

    const issued = await (
      await H.certificate.POST(new Request(url('/x'), { method: 'POST' }), ctx(courseId))
    ).json()
    expect(issued.issued.code).toMatch(/^LH-/)
  })

  it('exports JSON and YAML that re-import to the same course', async () => {
    const res = await H.exportRoute.GET(
      new Request(url(`/api/curriculum/courses/${courseId}/export`)),
      ctx(courseId),
    )
    expect(res.headers.get('content-disposition')).toMatch(/sql-essentials\.lhcf\.json/)
    const yaml = await (
      await H.exportRoute.GET(new Request(url(`/x?format=yaml`)), ctx(courseId))
    ).text()
    const reimport = await (
      await H.importRoute.POST(new Request(url('/x'), json({ text: yaml, dryRun: true })))
    ).json()
    expect(reimport).toMatchObject({
      ok: true,
      format: 'yaml',
      preview: { slug: 'sql-essentials', updatesExisting: true },
    })
    expect(reimport.warnings).toEqual([])
  })

  it('builds a mixed-practice session across lessons via ?courseId=', async () => {
    const imported = await (
      await H.importRoute.POST(
        new Request(url('/x'), json({ text: example('javascript-functions.json') })),
      )
    ).json()
    const mixedCourseId = imported.report.courseId as number

    const res = await H.review.GET(
      new Request(url(`/api/review?courseId=${mixedCourseId}&limit=100&mode=normal`)),
    )
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.course).toMatchObject({ id: mixedCourseId, title: 'JavaScript Functions' })
    expect(body.mode).toBe('cram')
    expect(body.cards.length).toBeGreaterThan(0)
    // interleaved: the first two cards come from DIFFERENT lessons when the
    // course has multiple lessons with cards
    const lessons = body.cards
      .map((c: { sourceKey: string | null }) => (c.sourceKey ?? '').split('/')[1] ?? '')
      .filter(Boolean)
    expect(new Set(lessons).size).toBeGreaterThan(1)
    expect(lessons[0]).not.toBe(lessons[1])

    // unknown courseId → empty session, no crash
    const missing = await (
      await H.review.GET(new Request(url('/api/review?courseId=999999')))
    ).json()
    expect(missing).toMatchObject({ ok: true, cards: [], course: null })
  })

  it('builds an improve-prompt from the exported course, then deletes the course', async () => {
    const { prompt } = await (
      await H.prompt.POST(
        new Request(url('/x'), json({ courseId, request: 'Add a module on indexes' })),
      )
    ).json()
    expect(prompt).toMatch(/KEEP every existing "slug"[\s\S]*"slug": "sql-essentials"/)
    expect(
      (await H.course.DELETE(new Request(url('/x'), { method: 'DELETE' }), ctx(courseId))).status,
    ).toBe(200)
    expect((await H.course.GET(new Request(url('/x')), ctx(courseId))).status).toBe(404)
  })
})
