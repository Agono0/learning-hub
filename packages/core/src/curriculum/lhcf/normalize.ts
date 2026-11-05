/**
 * Lenient pre-validation repair of AI-written curricula.
 *
 * Different AIs (and humans) phrase the same thing differently: "lessons"
 * directly under the course, `type: "multiple_choice"`, `estMinutes: "15 min"`,
 * theory as one string, missing slugs. Rejecting those would make "paste what
 * any AI gave you" frustrating, so we repair unambiguous variations here —
 * and report each repair as a {@link Fix} so nothing changes silently.
 *
 * Only clear-cut repairs belong here. Anything ambiguous is left for the
 * validator to report as an error with a hint.
 */
import { slugify, uniqueSlugger } from './slug'

/** One automatic repair, addressed by a JSON-ish path. */
export interface Fix {
  path: string
  message: string
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Exercise `type` spellings seen in the wild → LHCF type. */
const TYPE_ALIASES: Record<string, string> = {
  multiple_choice: 'mcq',
  'multiple-choice': 'mcq',
  multiplechoice: 'mcq',
  single_choice: 'mcq',
  choice: 'mcq',
  quiz: 'mcq',
  multiple_select: 'multi',
  'multiple-select': 'multi',
  select_all: 'multi',
  'select-all': 'multi',
  checkbox: 'multi',
  multiple_answer: 'multi',
  true_false: 'truefalse',
  'true-false': 'truefalse',
  boolean: 'truefalse',
  tf: 'truefalse',
  number: 'numeric',
  numerical: 'numeric',
  calculation: 'numeric',
  short_answer: 'typein',
  'short-answer': 'typein',
  text: 'typein',
  recall: 'typein',
  type_in: 'typein',
  'type-in': 'typein',
  fill_blank: 'cloze',
  'fill-in-the-blank': 'cloze',
  fill_in_the_blank: 'cloze',
  fill: 'cloze',
  blanks: 'cloze',
  order: 'ordering',
  sequence: 'ordering',
  sort: 'ordering',
  match: 'matching',
  pairs: 'matching',
  categorise: 'categorize',
  categories: 'categorize',
  classify: 'categorize',
  group: 'categorize',
  essay: 'freetext',
  open: 'freetext',
  open_ended: 'freetext',
  explain: 'freetext',
  free_text: 'freetext',
  written: 'freetext',
  coding: 'code',
  programming: 'code',
  parson: 'parsons',
  parsons_problem: 'parsons',
}

/** Parse "15", "15 min", "1.5h", "90 minutes" → minutes; undefined if unclear. */
export function parseMinutes(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value !== 'string') return undefined
  const m = /^\s*(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)?\s*$/i.exec(value)
  if (!m) return undefined
  const n = Number(m[1])
  return Math.round(/^h/i.test(m[2] ?? '') ? n * 60 : n)
}

function rename(o: Obj, from: string, to: string, path: string, fixes: Fix[]) {
  if (o[to] === undefined && o[from] !== undefined) {
    o[to] = o[from]
    delete o[from]
    fixes.push({ path, message: `renamed "${from}" to "${to}"` })
  }
}

function ensureSlug(
  o: Obj,
  slugger: (s: string) => string,
  path: string,
  fixes: Fix[],
  fallback: string,
) {
  if (typeof o.slug === 'string' && o.slug.trim()) {
    const clean = slugify(o.slug)
    if (clean !== o.slug)
      fixes.push({ path: `${path}.slug`, message: `normalized slug "${o.slug}" → "${clean}"` })
    o.slug = slugger(clean)
    return
  }
  const source =
    typeof o.title === 'string' ? o.title : typeof o.name === 'string' ? o.name : fallback
  o.slug = slugger(slugify(source))
  fixes.push({ path: `${path}.slug`, message: `generated slug "${o.slug}"` })
}

function normalizeExercise(raw: unknown, path: string, fixes: Fix[]): unknown {
  if (!isObj(raw)) return raw
  const e: Obj = { ...raw }
  rename(e, 'question', 'prompt', path, fixes)
  rename(e, 'statement', 'prompt', path, fixes)
  rename(e, 'choices', 'options', path, fixes)
  rename(e, 'rationale', 'explanation', path, fixes)
  if (typeof e.type === 'string') {
    const key = e.type.trim().toLowerCase()
    const mapped = TYPE_ALIASES[key] ?? key
    if (mapped !== e.type) {
      fixes.push({ path: `${path}.type`, message: `exercise type "${e.type}" read as "${mapped}"` })
      e.type = mapped
    }
  }
  // mcq answer given as the option text, or a letter ("B")
  if (e.type === 'mcq' && Array.isArray(e.options)) {
    if (typeof e.answer === 'string') {
      const text = e.answer.trim()
      const byText = (e.options as unknown[]).findIndex(
        (o) => typeof o === 'string' && o.trim().toLowerCase() === text.toLowerCase(),
      )
      const byLetter = /^[a-h]$/i.test(text) ? text.toUpperCase().charCodeAt(0) - 65 : -1
      const index = byText !== -1 ? byText : byLetter
      if (index !== -1 && index < e.options.length) {
        e.answer = index
        fixes.push({
          path: `${path}.answer`,
          message: `answer "${text}" converted to option index ${index}`,
        })
      }
    }
    if (e.answer === undefined && typeof e.correctIndex === 'number')
      rename(e, 'correctIndex', 'answer', path, fixes)
  }
  if (
    e.type === 'truefalse' &&
    typeof e.answer === 'string' &&
    /^(true|false)$/i.test(e.answer.trim())
  ) {
    e.answer = e.answer.trim().toLowerCase() === 'true'
    fixes.push({ path: `${path}.answer`, message: 'answer converted to a boolean' })
  }
  if (
    e.type === 'numeric' &&
    typeof e.answer === 'string' &&
    e.answer.trim() !== '' &&
    Number.isFinite(Number(e.answer))
  ) {
    e.answer = Number(e.answer)
    fixes.push({ path: `${path}.answer`, message: 'answer converted to a number' })
  }
  if (e.type === 'typein') {
    if (e.answers === undefined && (typeof e.answer === 'string' || typeof e.answer === 'number')) {
      e.answers = [String(e.answer)]
      delete e.answer
      fixes.push({ path: `${path}.answers`, message: 'single "answer" wrapped into "answers"' })
    }
  }
  return e
}

function normalizeLesson(
  raw: unknown,
  path: string,
  fixes: Fix[],
  slugger: (s: string) => string,
  index: number,
): unknown {
  if (!isObj(raw)) return raw
  const l: Obj = { ...raw }
  rename(l, 'name', 'title', path, fixes)
  rename(l, 'goal', 'objective', path, fixes)
  rename(l, 'learningObjective', 'objective', path, fixes)
  rename(l, 'content', 'theory', path, fixes)
  rename(l, 'examples', 'workedExamples', path, fixes)
  rename(l, 'glossary', 'keyTerms', path, fixes)
  for (const alias of ['quiz', 'questions', 'practice', 'exercise'])
    rename(l, alias, 'exercises', path, fixes)
  if (l.objective === undefined && typeof l.title === 'string') {
    l.objective = `Explain ${l.title}`
    fixes.push({
      path: `${path}.objective`,
      message: 'missing objective — defaulted to "Explain <title>"',
    })
  }
  if (typeof l.theory === 'string') {
    l.theory = [{ body: l.theory }]
    fixes.push({ path: `${path}.theory`, message: 'theory text wrapped into one section' })
  } else if (Array.isArray(l.theory)) {
    l.theory = l.theory.map((s) => (typeof s === 'string' ? { body: s } : s))
  }
  for (const alias of ['duration', 'minutes', 'time']) {
    if (l[alias] !== undefined && l.estMinutes === undefined) {
      l.estMinutes = parseMinutes(l[alias])
      delete l[alias]
      fixes.push({ path: `${path}.estMinutes`, message: `"${alias}" read as estMinutes` })
    }
  }
  if (typeof l.estMinutes === 'string') {
    l.estMinutes = parseMinutes(l.estMinutes)
    fixes.push({ path: `${path}.estMinutes`, message: 'duration text converted to minutes' })
  }
  if (Array.isArray(l.skills))
    l.skills = l.skills.map((s) => (typeof s === 'string' ? slugify(s) : s))
  if (Array.isArray(l.keyTerms)) {
    l.keyTerms = l.keyTerms.map((k) => {
      if (isObj(k) && k.definition === undefined && typeof k.meaning === 'string')
        return { term: k.term, definition: k.meaning }
      return k
    })
  }
  if (Array.isArray(l.exercises))
    l.exercises = l.exercises.map((e, i) => normalizeExercise(e, `${path}.exercises[${i}]`, fixes))
  ensureSlug(l, slugger, path, fixes, `lesson-${index + 1}`)
  return l
}

/**
 * Repair a raw (parsed JSON/YAML) curriculum object in place-safe fashion.
 * Returns the repaired object (not yet validated) and the list of fixes.
 */
export function normalizeLhcfInput(input: unknown): { value: unknown; fixes: Fix[] } {
  const fixes: Fix[] = []
  if (!isObj(input)) return { value: input, fixes }
  // Some AIs wrap the course: { course: {...} } or { curriculum: {...} }
  let c: Obj = { ...input }
  for (const wrapper of ['course', 'curriculum']) {
    if (isObj(c[wrapper]) && c.modules === undefined && c.title === undefined) {
      c = { ...(c[wrapper] as Obj) }
      fixes.push({ path: '', message: `unwrapped "${wrapper}" object` })
    }
  }

  if (c.lhcf === undefined) {
    c.lhcf = 1
    fixes.push({ path: 'lhcf', message: 'added format version "lhcf: 1"' })
  } else if (c.lhcf === '1') c.lhcf = 1

  rename(c, 'name', 'title', '', fixes)
  rename(c, 'units', 'modules', '', fixes)
  rename(c, 'chapters', 'modules', '', fixes)
  rename(c, 'sections', 'modules', '', fixes)
  rename(c, 'learningOutcomes', 'outcomes', '', fixes)
  rename(c, 'objectives', 'outcomes', '', fixes)
  if (typeof c.level === 'string') c.level = c.level.trim().toLowerCase()
  if (typeof c.estHours === 'string') {
    const minutes = parseMinutes(c.estHours.replace(/(\d)\s*$/, '$1h'))
    if (minutes !== undefined) c.estHours = Math.round((minutes / 60) * 10) / 10
  }

  // lessons directly on the course → one module
  if (c.modules === undefined && Array.isArray(c.lessons)) {
    c.modules = [{ title: typeof c.title === 'string' ? c.title : 'Lessons', lessons: c.lessons }]
    delete c.lessons
    fixes.push({ path: 'modules', message: 'course-level "lessons" wrapped into one module' })
  }

  ensureSlug(c, uniqueSlugger(), '', fixes, 'course')

  // skills: strings → objects; "prerequisites" alias for "requires"
  const skillSlugger = uniqueSlugger()
  if (Array.isArray(c.skills)) {
    c.skills = c.skills.map((s, i) => {
      const skill: Obj = typeof s === 'string' ? { name: s } : isObj(s) ? { ...s } : {}
      rename(skill, 'prerequisites', 'requires', `skills[${i}]`, fixes)
      rename(skill, 'dependsOn', 'requires', `skills[${i}]`, fixes)
      if (Array.isArray(skill.requires))
        skill.requires = skill.requires.map((r) => (typeof r === 'string' ? slugify(r) : r))
      ensureSlug(skill, skillSlugger, `skills[${i}]`, fixes, `skill-${i + 1}`)
      return skill
    })
  }

  const moduleSlugger = uniqueSlugger()
  const lessonSlugger = uniqueSlugger() // lesson slugs are unique across the whole course
  if (Array.isArray(c.modules)) {
    c.modules = c.modules.map((m, mi) => {
      if (!isObj(m)) return m
      const mod: Obj = { ...m }
      const path = `modules[${mi}]`
      rename(mod, 'name', 'title', path, fixes)
      ensureSlug(mod, moduleSlugger, path, fixes, `module-${mi + 1}`)
      if (Array.isArray(mod.lessons)) {
        mod.lessons = mod.lessons.map((l, li) =>
          normalizeLesson(l, `${path}.lessons[${li}]`, fixes, lessonSlugger, li),
        )
      }
      return mod
    })
  }

  const projectSlugger = uniqueSlugger()
  if (Array.isArray(c.projects)) {
    c.projects = c.projects.map((p, pi) => {
      if (!isObj(p)) return p
      const project: Obj = { ...p }
      rename(project, 'milestones', 'stages', `projects[${pi}]`, fixes)
      ensureSlug(project, projectSlugger, `projects[${pi}]`, fixes, `project-${pi + 1}`)
      if (Array.isArray(project.stages)) {
        const stageSlugger = uniqueSlugger()
        project.stages = project.stages.map((s, si) => {
          const stage: Obj =
            typeof s === 'string' ? { title: s, description: s } : isObj(s) ? { ...s } : {}
          if (stage.description === undefined && typeof stage.title === 'string')
            stage.description = stage.title
          ensureSlug(stage, stageSlugger, `projects[${pi}].stages[${si}]`, fixes, `stage-${si + 1}`)
          return stage
        })
      }
      return project
    })
  }

  if (isObj(c.finalExam)) {
    const exam: Obj = { ...c.finalExam }
    rename(exam, 'questions', 'exercises', 'finalExam', fixes)
    if (Array.isArray(exam.exercises)) {
      exam.exercises = exam.exercises.map((e, i) =>
        normalizeExercise(e, `finalExam.exercises[${i}]`, fixes),
      )
    }
    c.finalExam = exam
  }

  return { value: c, fixes }
}
