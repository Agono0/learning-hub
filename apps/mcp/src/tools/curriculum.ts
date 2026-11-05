/**
 * Curriculum tools — let an AI agent (Claude Desktop, Cursor, …) design a
 * course, import it, track the learner's progress and tutor the next lesson.
 * Same repositories as the web app, so results are identical everywhere.
 */
import { z } from 'zod'
import {
  buildCurriculumPrompt,
  LHCF_MAX_SOURCE_CHARS,
  lhcfStats,
  parseCurriculum,
} from '@learning-hub/core/curriculum'
import {
  exportCurriculum,
  getCourseOverview,
  getLessonView,
  importCurriculum,
  listCourses,
} from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

export const curriculumTools: RegisteredTool[] = [
  tool(
    'curriculum_prompt',
    'Get the prompt that makes an AI write a complete LHCF course (theory, 12 exercise types, projects, final exam). An agent can follow it itself, then call curriculum_import.',
    {
      topic: z.string().min(2).max(300),
      currentLevel: z.string().max(300).optional(),
      goal: z.string().max(500).optional(),
      hoursPerWeek: z.number().min(0.5).max(80).optional(),
      weeks: z.number().int().min(1).max(104).optional(),
      language: z.string().max(60).optional(),
    },
    (args) => json({ prompt: buildCurriculumPrompt({ ...args, format: 'json' }) }),
  ),
  tool(
    'curriculum_import',
    'Import (or update, matched by slug) a course from LHCF text in JSON, YAML or Markdown. Use dryRun to validate first; errors come back with paths and hints.',
    {
      text: z.string().min(1).max(LHCF_MAX_SOURCE_CHARS),
      filename: z.string().max(260).optional(),
      dryRun: z.boolean().optional(),
    },
    ({ text, filename, dryRun }) => {
      const parsed = parseCurriculum(text, { filename })
      if (!parsed.ok) return json({ ok: false, errors: parsed.errors, warnings: parsed.warnings })
      const summary = {
        slug: parsed.course.slug,
        title: parsed.course.title,
        stats: lhcfStats(parsed.course),
        warnings: parsed.warnings,
        fixes: parsed.fixes.length,
      }
      if (dryRun) return json({ ok: true, dryRun: true, ...summary })
      return json({ ok: true, ...summary, report: importCurriculum(parsed.course) })
    },
  ),
  tool(
    'curriculum_list',
    'List all courses with progress, next lesson and certificate status.',
    {},
    () => json({ courses: listCourses() }),
  ),
  tool(
    'curriculum_course',
    'Course overview: syllabus with lesson statuses and soft prerequisite locks, projects, final exam, certificate requirements.',
    { courseId: z.number().int().positive() },
    ({ courseId }) => {
      const overview = getCourseOverview(courseId)
      return json(overview ?? { error: 'course not found' })
    },
  ),
  tool(
    'curriculum_next',
    'The lesson the learner should study next (full theory, worked examples, key terms and exercises) — use it to tutor them. Without courseId, picks the most recently active course.',
    { courseId: z.number().int().positive().optional() },
    ({ courseId }) => {
      const courses = listCourses()
      const course = courseId
        ? courses.find((c) => c.id === courseId)
        : courses
            .filter((c) => c.nextLesson)
            .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]
      if (!course) return json({ error: 'no course with a next lesson' })
      if (!course.nextLesson)
        return json({ course: course.title, done: true, certified: course.certified })
      return json({
        course: { id: course.id, title: course.title, progress: course.progress },
        lesson: getLessonView(course.nextLesson.id),
      })
    },
  ),
  tool(
    'curriculum_export',
    'Export a course as LHCF JSON (to improve it with an AI and re-import — slugs keep the learner’s progress).',
    { courseId: z.number().int().positive() },
    ({ courseId }) => json(exportCurriculum(courseId) ?? { error: 'course not found' }),
  ),
]
