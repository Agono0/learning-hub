/**
 * Prompt templates that make ANY AI (ChatGPT, Claude, Gemini, Copilot, a
 * local model…) produce a valid, pedagogically strong LHCF course.
 *
 * The prompt is self-contained (paste it into a chat) and encodes the course
 * design rules from learning science, so the AI builds a course the way the
 * best platforms do instead of a list of topics:
 * - measurable Bloom-verb objectives (Bloom 1956; Anderson & Krathwohl 2001)
 * - theory → worked example → practice (worked-example effect, Sweller 1985)
 * - many varied retrieval exercises (testing effect, Roediger & Karpicke 2006;
 *   desirable difficulties, Bjork 1994)
 * - interleaving and cumulative review lessons (Rohrer & Taylor 2007; spacing,
 *   Cepeda et al. 2006)
 * - self-explanation reflection prompts (Chi et al. 1994)
 * - projects in stages + prerequisite graph (Hyperskill / mastery learning, Bloom 1968)
 */
import { EXERCISE_CATALOG } from '../../practice/catalog'
import type { LhcfSourceFormat } from './parse'

/** What the learner tells the wizard. Only `topic` is required. */
export interface CurriculumRequest {
  topic: string
  /** Where the learner is now (e.g. "complete beginner", "I know basic algebra"). */
  currentLevel?: string
  /** What they want to be able to do at the end. */
  goal?: string
  hoursPerWeek?: number
  weeks?: number
  /** Content language (e.g. "English", "Arabic"). */
  language?: string
  /** Preferences: "lots of code", "visual examples", "exam prep"… */
  style?: string
  /** Include hands-on projects (default true). */
  projects?: boolean
  /** Output format the AI should use (default json — the most reliable). */
  format?: LhcfSourceFormat
}

/** Rough size targets from the time budget, so the AI scopes realistically. */
export function courseSizeFor(req: Pick<CurriculumRequest, 'hoursPerWeek' | 'weeks'>): {
  modules: string
  lessonsPerModule: string
  totalHours: number | null
} {
  const hours = req.hoursPerWeek && req.weeks ? req.hoursPerWeek * req.weeks : null
  if (hours === null) return { modules: '4–8', lessonsPerModule: '3–6', totalHours: null }
  if (hours <= 6) return { modules: '2–3', lessonsPerModule: '2–4', totalHours: hours }
  if (hours <= 20) return { modules: '3–5', lessonsPerModule: '3–5', totalHours: hours }
  if (hours <= 60) return { modules: '5–8', lessonsPerModule: '3–6', totalHours: hours }
  return { modules: '8–12', lessonsPerModule: '4–7', totalHours: hours }
}

const exerciseSpec = () =>
  EXERCISE_CATALOG.map(
    (e) =>
      `- \`${e.type}\` (${e.label}, trains ${e.trains}): ${e.description}\n  example: ${JSON.stringify(e.example)}`,
  ).join('\n')

const SHAPE = `{
  "lhcf": 1,
  "slug": "kebab-case-course-id",
  "title": "…", "subtitle": "…", "description": "markdown", "emoji": "🐍",
  "track": "optional catalog group, e.g. Programming",
  "level": "beginner | intermediate | advanced",
  "language": "en", "tags": ["…"], "estHours": 20,
  "outcomes": ["By the end you can … (measurable)"],
  "prerequisites": ["prior knowledge, free text"],
  "audience": "…", "generatedBy": "<your model name>",
  "skills": [ { "slug": "variables", "name": "Variables", "requires": ["other-skill-slug"] } ],
  "modules": [ {
    "slug": "basics", "title": "…", "description": "markdown",
    "lessons": [ {
      "slug": "what-is-a-variable",              // unique across the WHOLE course
      "title": "…",
      "objective": "Explain … (starts with a Bloom verb)",
      "type": "concept | practice | reading | video | project | review",
      "estMinutes": 20,
      "skills": ["variables"],
      "summary": "2–3 sentence advance organizer",
      "theory": [ { "heading": "…", "body": "markdown, KaTeX $math$ allowed" } ],
      "workedExamples": [ { "title": "…", "problem": "…", "steps": ["…", "…"], "answer": "…" } ],
      "keyTerms": [ { "term": "…", "definition": "…" } ],
      "resources": [ { "title": "…", "url": "https://…", "kind": "article | video | book | course | tool | paper | other" } ],
      "exercises": [ /* see exercise types below */ ],
      "reflection": ["Why does … work? Explain in your own words."]
    } ]
  } ],
  "projects": [ { "slug": "…", "title": "…", "description": "…", "skills": ["…"],
    "stages": [ { "slug": "stage-1", "title": "…", "description": "what to build", "checklist": ["acceptance criterion"], "estMinutes": 60 } ] } ],
  "finalExam": { "passScore": 0.8, "minutes": 45, "exercises": [ /* 10–25 exercises across all modules */ ] },
  "certificate": { "minLessonCompletion": 1, "requireFinalExam": true, "requireProjects": true }
}`

const DESIGN_RULES = `COURSE DESIGN RULES (follow all of them):
1. Sequence from fundamentals to advanced; every skill's "requires" lists only earlier skills (no cycles).
2. Every lesson objective starts with a measurable Bloom verb (Define, Explain, Calculate, Compare, Implement, Analyze, Evaluate, Design…). Climb Bloom's levels across the course.
3. Each concept lesson: a short "summary", 2–5 theory sections of clear, accurate, concrete markdown, and at least one worked example with explicit steps.
4. Each lesson has 4–10 exercises mixing at least 3 different types. Prefer production/recall (typein, cloze, numeric, code, freetext) over recognition (mcq, truefalse). Every exercise gets an "explanation". MCQs get plausible distractors and a "why" for every option.
5. Every module ends with a "review" lesson whose exercises interleave ALL earlier modules (spaced, mixed retrieval).
6. Add 1–3 "reflection" prompts per lesson that ask WHY/HOW (self-explanation), never yes/no.
7. Give 3–8 keyTerms per concept lesson. Only link resources you are confident exist (official docs, well-known books/videos); otherwise omit "resources".
8. Projects (if requested) are built in 2–5 stages, each a working increment with a concrete checklist.
9. The final exam samples every module, mixes types and difficulty (1–5).
10. Be factually precise. If something is debated or version-specific, say so in the theory.`

/**
 * Build the full copy-paste prompt for a new course.
 * Self-contained: includes the format spec, exercise types and design rules.
 */
export function buildCurriculumPrompt(req: CurriculumRequest): string {
  const format = req.format ?? 'json'
  const size = courseSizeFor(req)
  const profile = [
    `Topic: ${req.topic.trim()}`,
    req.currentLevel && `Learner's current level: ${req.currentLevel}`,
    req.goal && `Learner's goal: ${req.goal}`,
    size.totalHours !== null &&
      `Time budget: ~${size.totalHours} hours (${req.hoursPerWeek} h/week for ${req.weeks} weeks)`,
    req.language && `Write all content in: ${req.language}`,
    req.style && `Preferences: ${req.style}`,
    `Projects: ${req.projects === false ? 'none' : '1–3 hands-on projects built in stages'}`,
  ]
    .filter(Boolean)
    .join('\n')

  const output =
    format === 'json'
      ? 'Reply with ONLY the JSON document (no prose before or after). It must be valid JSON: double quotes, no comments, no trailing commas.'
      : format === 'yaml'
        ? 'Reply with ONLY the YAML document (no prose). Use the same field names as the JSON shape.'
        : `Reply with ONLY a Markdown document in this convention:
- YAML front-matter between --- lines holding course fields (lhcf, slug, title, level, outcomes, skills, projects, finalExam…).
- "## Module title" starts a module; "### Lesson title" starts a lesson.
- The line "Objective: <Bloom verb> …" right under a lesson heading.
- Theory as normal Markdown; "#### Heading" splits theory sections.
- Each exercise in its own fenced block: \`\`\`exercise (YAML using the exercise fields below) \`\`\`.
- Lesson extras (slug, type, estMinutes, skills, summary, workedExamples, keyTerms, reflection) in a fenced \`\`\`lesson YAML block.`

  return `You are an expert curriculum designer and subject-matter expert. Design a complete, rigorous course in the LHCF format (Learning HUB Curriculum Format) for this learner.

LEARNER PROFILE
${profile}

SCOPE
About ${size.modules} modules with ${size.lessonsPerModule} lessons each (adjust to the topic). Quality over quantity.

${DESIGN_RULES}

LHCF SHAPE (JSON; fields with "…" are yours to fill; optional fields may be omitted)
${SHAPE}

EXERCISE TYPES (use the exact "type" values; every exercise also has "prompt" (markdown), optional "explanation", "hint", "skill" (skill slug), "difficulty" 1–5)
${exerciseSpec()}

OUTPUT
${output}`
}

/**
 * Prompt to improve or extend an existing course (send its exported LHCF).
 * Keeps slugs stable so re-importing updates the course in place and keeps
 * the learner's progress and review history.
 */
export function buildImproveCurriculumPrompt(existingLhcfJson: string, request: string): string {
  return `You are an expert curriculum designer. Below is a course in the LHCF format (Learning HUB Curriculum Format). Improve it according to the request.

REQUEST
${request.trim()}

RULES
- KEEP every existing "slug" unchanged (they are stable ids — the learner's progress is attached to them). New items get new unique kebab-case slugs.
- Keep "lhcf": 1 and the same field names. Don't delete lessons unless the request asks for it.
${DESIGN_RULES}

EXERCISE TYPES
${exerciseSpec()}

OUTPUT
Reply with ONLY the complete updated JSON document (valid JSON, no prose).

CURRENT COURSE
${existingLhcfJson}`
}
