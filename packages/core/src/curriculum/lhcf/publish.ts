/**
 * Builders for the published curriculum artifacts (docs/curriculum/*), kept
 * in code so docs can never drift from the real schema and prompts.
 */
import { z } from 'zod'
import { buildCurriculumPrompt } from './prompts'
import { LHCF_VERSION, lhcfCourseSchema } from './schema'

/** JSON Schema (draft 2020-12) of the LHCF input — what authors/AIs write. */
export function lhcfJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(lhcfCourseSchema, {
    io: 'input',
    unrepresentable: 'any',
  }) as Record<string, unknown>
  return {
    $id: `lhcf-${LHCF_VERSION}.schema.json`,
    title: `LHCF v${LHCF_VERSION} — Learning HUB Curriculum Format`,
    description:
      'A complete course: modules of lessons (theory, worked examples, exercises), skills graph, projects and a final exam.',
    ...schema,
  }
}

/** The PROMPT.md document: how to get a course from any AI. */
export function renderPromptDoc(): string {
  const example = buildCurriculumPrompt({
    topic: '<WHAT YOU WANT TO LEARN>',
    currentLevel: '<e.g. complete beginner>',
    goal: '<e.g. build a small web app / pass my exam on June 1>',
    hoursPerWeek: 5,
    weeks: 6,
    language: 'English',
  })
  return `# Get a course from any AI

Learning HUB turns a course written by **any** AI — ChatGPT, Claude, Gemini,
Copilot, a local model — into a full study experience: lessons with theory and
worked examples, 12 kinds of exercises scheduled with spaced repetition,
skills that unlock in order, projects in stages, a final exam and a certificate.

## The fast way (in the app)

**Curriculum → Create with AI**: describe what you want to learn, copy the
generated prompt, paste it into any AI chat, then paste the reply (or drop the
file) back into the app. Learning HUB checks it, shows a preview, and imports it.

## The manual way

1. Copy the prompt below and replace the \`<…>\` placeholders.
2. Paste it into your AI chat of choice.
3. Save the reply as \`my-course.json\` (or paste it directly) and import it from
   **Curriculum → Import**.

Want YAML or Markdown instead of JSON? Ask the AI for it — all three formats
are accepted (see [examples](../../curricula/examples/)). The full field
reference is the JSON Schema in [lhcf.schema.json](lhcf.schema.json).

**Improving a course later:** export it from the course page, then ask the AI
to change it while keeping every \`slug\`. Re-importing updates the course in
place and keeps your progress and review history.

## The prompt

\`\`\`text
${example}
\`\`\`
`
}
