/**
 * `learning-hub curriculum …` — manage courses from the terminal.
 *
 *   curriculum import <file> [--dry-run]   import/update an LHCF course (.json/.yaml/.md)
 *   curriculum list                        courses with progress
 *   curriculum prompt "<topic>"            print the any-AI course prompt
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { buildCurriculumPrompt, lhcfStats, parseCurriculum } from '@learning-hub/core/curriculum'
import { importCurriculum, listCourses } from '@learning-hub/db'

const USAGE = `usage:
  curriculum import <file> [--dry-run]
  curriculum list
  curriculum prompt "<topic>"`

function importFile(path: string | undefined, dryRun: boolean): number {
  if (!path) {
    console.error(USAGE)
    return 2
  }
  const parsed = parseCurriculum(readFileSync(path, 'utf8'), { filename: basename(path) })
  for (const w of parsed.warnings) console.warn(`  ! ${w.path}: ${w.message}`)
  if (!parsed.ok) {
    console.error(`✖ ${basename(path)} is not a valid course (${parsed.format}):`)
    for (const e of parsed.errors)
      console.error(
        `  - ${e.path || '(document)'}: ${e.message}${e.hint ? `\n    → ${e.hint}` : ''}`,
      )
    return 1
  }
  const s = lhcfStats(parsed.course)
  console.log(
    `✔ ${parsed.course.title} — ${s.modules} modules, ${s.lessons} lessons, ${s.exercises} exercises, ${s.projects} project(s)`,
  )
  if (parsed.fixes.length)
    console.log(`  (${parsed.fixes.length} small issue(s) repaired automatically)`)
  if (dryRun) return 0
  const r = importCurriculum(parsed.course)
  console.log(
    `${r.created ? 'Imported' : 'Updated'} course #${r.courseId}: lessons +${r.lessons.added} ~${r.lessons.updated} -${r.lessons.removed}, ` +
      `exercises +${r.exercises.added} ~${r.exercises.updated} (suspended ${r.exercises.suspended})`,
  )
  return 0
}

function list(): number {
  const courses = listCourses()
  if (!courses.length) {
    console.log('No courses yet — try: curriculum import curricula/examples/sql-essentials.yaml')
    return 0
  }
  for (const c of courses) {
    const pct = Math.round(c.progress.fraction * 100)
    const next = c.nextLesson ? ` → next: ${c.nextLesson.title}` : c.certified ? ' ✓ certified' : ''
    console.log(
      `#${c.id}  ${c.emoji ?? '📘'} ${c.title}  ${pct}% (${c.progress.completed}/${c.progress.total})${next}`,
    )
  }
  return 0
}

/** Entry point for the CLI registry. Returns the process exit code. */
export function curriculumCommand(args: string[]): number {
  const [sub, ...rest] = args
  if (sub === 'import')
    return importFile(
      rest.find((a) => !a.startsWith('--')),
      rest.includes('--dry-run'),
    )
  if (sub === 'list') return list()
  if (sub === 'prompt') {
    const topic = rest.join(' ').trim()
    if (!topic) {
      console.error(USAGE)
      return 2
    }
    console.log(buildCurriculumPrompt({ topic }))
    return 0
  }
  console.log(USAGE)
  return sub ? 2 : 0
}

import { type RegisteredCommand } from './registry'

export const curriculumCommands: RegisteredCommand[] = [
  {
    name: 'curriculum',
    description: 'import/list courses, print AI prompt',
    usage: 'import|list|prompt',
    run: (runArgs) => {
      process.exitCode = curriculumCommand(runArgs)
    },
  },
]
