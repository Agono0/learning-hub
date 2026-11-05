/**
 * LHCF Markdown — the most human (and chatbot) friendly way to write a course.
 *
 * ```md
 * ---
 * title: Intro to Python          # YAML front-matter: any course field
 * level: beginner                 # (slug, skills, projects, finalExam…)
 * ---
 *
 * Optional course description paragraphs.
 *
 * ## Basics                       ← "##" starts a MODULE (text before the first
 * Optional module description.       lesson is its description)
 *
 * ### Variables                   ← "###" starts a LESSON
 * Objective: Explain what a variable is      ← objective line (required-ish)
 *
 * Theory in Markdown…             ← everything else is theory;
 * #### Naming rules                  "####" headings split theory sections
 * …
 * ```exercise                     ← fenced YAML: one exercise per block
 * type: mcq
 * prompt: Which name is valid?
 * options: [2cool, cool_2, cool-2]
 * answer: 1
 * ```
 * ```lesson                       ← optional fenced YAML merged into the lesson
 * estMinutes: 15                     (skills, keyTerms, workedExamples, reflection…)
 * skills: [variables]
 * ```
 * ```
 *
 * A single `#` heading, if present, sets the course title.
 */
import { parse as parseYaml } from 'yaml'

/** Safe YAML parsing: no anchors explosion, plain JSON-compatible values. */
export function parseYamlSafe(text: string): unknown {
  return parseYaml(text, { maxAliasCount: 100, prettyErrors: true, logLevel: 'error' })
}

type Obj = Record<string, unknown>

interface Block {
  lang: string
  body: string
}

/** Split lines into prose and fenced blocks, so headings inside code are ignored. */
function scan(
  lines: string[],
): ({ kind: 'line'; text: string } | { kind: 'fence'; block: Block })[] {
  const out: ({ kind: 'line'; text: string } | { kind: 'fence'; block: Block })[] = []
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)(`{3,}|~{3,})\s*([\w-]*)\s*$/.exec(lines[i]!)
    if (!open) {
      out.push({ kind: 'line', text: lines[i]! })
      continue
    }
    const fence = open[2]!
    const body: string[] = []
    let j = i + 1
    for (
      ;
      j < lines.length && !new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(lines[j]!);
      j++
    )
      body.push(lines[j]!)
    out.push({ kind: 'fence', block: { lang: open[3]!.toLowerCase(), body: body.join('\n') } })
    i = j
  }
  return out
}

const OBJECTIVE =
  /^\s*(?:>\s*)?(?:\*\*|__)?(?:objective|goal|learning objective)(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*(.+)$/i

function stripPrefix(title: string): string {
  return title.replace(/^(?:module|unit|week|chapter|lesson|topic)\s*\d*\s*[:.\-–]\s*/i, '').trim()
}

/**
 * Parse LHCF Markdown into a raw curriculum object (validated afterwards by
 * validateLhcf). Throws with a line-aware message on malformed YAML blocks.
 */
export function parseLhcfMarkdown(source: string): unknown {
  const text = source.replace(/\r\n?/g, '\n')
  let course: Obj = {}
  let body = text
  const front = /^---\n([\s\S]*?)\n---\s*(?:\n|$)/.exec(text)
  if (front) {
    const meta = parseYamlSafe(front[1]!)
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) course = { ...(meta as Obj) }
    body = text.slice(front[0].length)
  }

  const modules: Obj[] = []
  let currentModule: Obj | null = null
  let currentLesson: Obj | null = null
  let theory: { heading?: string; body: string[] }[] = []
  const courseDescription: string[] = []
  const moduleDescription: string[] = []

  const flushLesson = () => {
    if (!currentLesson) return
    const sections = theory
      .map((s) => ({
        ...(s.heading ? { heading: s.heading } : {}),
        body: s.body.join('\n').trim(),
      }))
      .filter((s) => s.body.length > 0)
    if (sections.length) currentLesson.theory = sections
    theory = []
    currentLesson = null
  }
  const flushModuleDescription = () => {
    if (currentModule && moduleDescription.length && currentModule.description === undefined) {
      const d = moduleDescription.join('\n').trim()
      if (d) currentModule.description = d
    }
    moduleDescription.length = 0
  }

  for (const item of scan(body.split('\n'))) {
    if (item.kind === 'fence') {
      const { lang, body: blockBody } = item.block
      if ((lang === 'exercise' || lang === 'quiz') && currentLesson) {
        const parsed = parseYamlSafe(blockBody)
        const list = Array.isArray(parsed) ? parsed : [parsed]
        currentLesson.exercises = [...((currentLesson.exercises as unknown[]) ?? []), ...list]
        continue
      }
      if ((lang === 'lesson' || lang === 'meta') && currentLesson) {
        const parsed = parseYamlSafe(blockBody)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          Object.assign(currentLesson, parsed)
        continue
      }
      if ((lang === 'course' || lang === 'meta') && !currentModule) {
        const parsed = parseYamlSafe(blockBody)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          Object.assign(course, parsed)
        continue
      }
      // any other code block is theory content (keeps its fence)
      const fenced = `\`\`\`${lang}\n${blockBody}\n\`\`\``
      if (currentLesson) {
        if (!theory.length) theory.push({ body: [] })
        theory[theory.length - 1]!.body.push(fenced)
      } else if (currentModule) moduleDescription.push(fenced)
      else courseDescription.push(fenced)
      continue
    }

    const line = item.text
    const heading = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) {
      const level = heading[1]!.length
      const title = heading[2]!.trim()
      if (level === 1 && !currentModule) {
        if (course.title === undefined) course.title = title
        continue
      }
      if (level === 2) {
        flushLesson()
        flushModuleDescription()
        currentModule = { title: stripPrefix(title), lessons: [] }
        modules.push(currentModule)
        continue
      }
      if (level === 3) {
        flushLesson()
        flushModuleDescription()
        if (!currentModule) {
          currentModule = {
            title: typeof course.title === 'string' ? course.title : 'Lessons',
            lessons: [],
          }
          modules.push(currentModule)
        }
        currentLesson = { title: stripPrefix(title) }
        ;(currentModule.lessons as Obj[]).push(currentLesson)
        continue
      }
      if (level === 4 && currentLesson) {
        theory.push({ heading: title, body: [] })
        continue
      }
    }

    if (currentLesson) {
      const objective = OBJECTIVE.exec(line)
      if (objective && currentLesson.objective === undefined) {
        currentLesson.objective = objective[1]!.replace(/(\*\*|__)\s*$/, '').trim()
        continue
      }
      if (!theory.length) theory.push({ body: [] })
      theory[theory.length - 1]!.body.push(line)
    } else if (currentModule) {
      moduleDescription.push(line)
    } else {
      courseDescription.push(line)
    }
  }
  flushLesson()
  flushModuleDescription()

  const description = courseDescription.join('\n').trim()
  if (description && course.description === undefined) course.description = description
  if (modules.length && course.modules === undefined) course.modules = modules
  return course
}
