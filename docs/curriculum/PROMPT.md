# Get a course from any AI

Learning HUB turns a course written by **any** AI — ChatGPT, Claude, Gemini,
Copilot, a local model — into a full study experience: lessons with theory and
worked examples, 12 kinds of exercises scheduled with spaced repetition,
skills that unlock in order, projects in stages, a final exam and a certificate.

## The fast way (in the app)

**Curriculum → Create with AI**: describe what you want to learn, copy the
generated prompt, paste it into any AI chat, then paste the reply (or drop the
file) back into the app. Learning HUB checks it, shows a preview, and imports it.

## The manual way

1. Copy the prompt below and replace the `<…>` placeholders.
2. Paste it into your AI chat of choice.
3. Save the reply as `my-course.json` (or paste it directly) and import it from
   **Curriculum → Import**.

Want YAML or Markdown instead of JSON? Ask the AI for it — all three formats
are accepted (see [examples](../../curricula/examples/)). The full field
reference is the JSON Schema in [lhcf.schema.json](lhcf.schema.json).

**Improving a course later:** export it from the course page, then ask the AI
to change it while keeping every `slug`. Re-importing updates the course in
place and keeps your progress and review history.

## The prompt

```text
You are an expert curriculum designer and subject-matter expert. Design a complete, rigorous course in the LHCF format (Learning HUB Curriculum Format) for this learner.

LEARNER PROFILE
Topic: <WHAT YOU WANT TO LEARN>
Learner's current level: <e.g. complete beginner>
Learner's goal: <e.g. build a small web app / pass my exam on June 1>
Time budget: ~30 hours (5 h/week for 6 weeks)
Write all content in: English
Projects: 1–3 hands-on projects built in stages

SCOPE
About 5–8 modules with 3–6 lessons each (adjust to the topic). Quality over quantity.

COURSE DESIGN RULES (follow all of them):
1. Sequence from fundamentals to advanced; every skill's "requires" lists only earlier skills (no cycles).
2. Every lesson objective starts with a measurable Bloom verb (Define, Explain, Calculate, Compare, Implement, Analyze, Evaluate, Design…). Climb Bloom's levels across the course.
3. Each concept lesson: a short "summary", 2–5 theory sections of clear, accurate, concrete markdown, and at least one worked example with explicit steps.
4. Each lesson has 4–10 exercises mixing at least 3 different types. Prefer production/recall (typein, cloze, numeric, code, freetext) over recognition (mcq, truefalse). Every exercise gets an "explanation". MCQs get plausible distractors and a "why" for every option.
5. Every module ends with a "review" lesson whose exercises interleave ALL earlier modules (spaced, mixed retrieval).
6. Add 1–3 "reflection" prompts per lesson that ask WHY/HOW (self-explanation), never yes/no.
7. Give 3–8 keyTerms per concept lesson. Only link resources you are confident exist (official docs, well-known books/videos); otherwise omit "resources".
8. Projects (if requested) are built in 2–5 stages, each a working increment with a concrete checklist.
9. The final exam samples every module, mixes types and difficulty (1–5).
10. Be factually precise. If something is debated or version-specific, say so in the theory.

LHCF SHAPE (JSON; fields with "…" are yours to fill; optional fields may be omitted)
{
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
}

EXERCISE TYPES (use the exact "type" values; every exercise also has "prompt" (markdown), optional "explanation", "hint", "skill" (skill slug), "difficulty" 1–5)
- `mcq` (Multiple choice, trains recognition): One correct option; `why[i]` explains each option.
  example: {"type":"mcq","prompt":"Which planet is largest?","options":["Mars","Jupiter","Venus"],"answer":1,"why":["Smaller than Earth","Largest planet","Similar to Earth"]}
- `multi` (Select all that apply, trains recognition): Several correct options (`answers` = indices).
  example: {"type":"multi","prompt":"Which are prime?","options":["2","4","5","9"],"answers":[0,2]}
- `truefalse` (True / false, trains recognition): Judge a statement.
  example: {"type":"truefalse","prompt":"Water boils at 100 °C at sea level.","answer":true}
- `numeric` (Numeric, trains production): A number with optional `tolerance` / `relTolerance` and `unit`.
  example: {"type":"numeric","prompt":"g on Earth (m/s²)?","answer":9.81,"tolerance":0.05,"unit":"m/s²"}
- `typein` (Type the answer, trains recall): Free recall; any of `answers` accepted, typo-tolerant.
  example: {"type":"typein","prompt":"Capital of Japan?","answers":["Tokyo"]}
- `cloze` (Fill in the blanks, trains recall): Blanks marked `{{answer|alternative}}` inside `text`.
  example: {"type":"cloze","prompt":"Complete the sentence.","text":"Mitochondria are the {{powerhouse}} of the {{cell}}."}
- `ordering` (Put in order, trains recall): `items` listed in the CORRECT order; shown shuffled.
  example: {"type":"ordering","prompt":"Order the steps of the scientific method.","items":["Question","Hypothesis","Experiment","Conclusion"]}
- `parsons` (Arrange the code, trains production): Code `lines` in correct order, optional wrong `distractors`.
  example: {"type":"parsons","prompt":"Sum a list.","language":"python","lines":["total = 0","for x in xs:","    total += x","print(total)"],"distractors":["total = 1"]}
- `matching` (Match pairs, trains recall): Match each `left` to its `right`.
  example: {"type":"matching","prompt":"Match the term to its definition.","pairs":[{"left":"Noun","right":"A thing"},{"left":"Verb","right":"An action"}]}
- `categorize` (Sort into groups, trains recall): Sort items into named `categories`.
  example: {"type":"categorize","prompt":"Sort the animals.","categories":[{"name":"Mammal","items":["Whale","Bat"]},{"name":"Bird","items":["Penguin"]}]}
- `freetext` (Explain in your words, trains production): Open answer judged against a `rubric` (AI or self-graded), with `modelAnswer`.
  example: {"type":"freetext","prompt":"Why do seasons happen?","rubric":["Mentions axial tilt","Explains angle of sunlight"],"modelAnswer":"Earth's axis is tilted ~23.5°…"}
- `code` (Write code, trains production): JS/TS graded by `tests` ({call, expected}); other languages self-checked vs `solution`.
  example: {"type":"code","prompt":"Write add(a, b).","language":"javascript","starter":"function add(a, b) {\n  \n}","tests":[{"call":"add(2, 3)","expected":5}]}

OUTPUT
Reply with ONLY the JSON document (no prose before or after). It must be valid JSON: double quotes, no comments, no trailing commas.
```
