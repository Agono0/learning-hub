/**
 * Learning HUB — manual modes for every AI feature.
 *
 * 'none' is the DEFAULT provider, so each AI surface must have a manual
 * alternative that never dead-ends the UI. These definitions are pure data:
 * the web app renders them wherever AI is unavailable, and the prompt-transport
 * copy-paste flow (see transport.ts) is offered alongside for users who have
 * an external chatbot but no configured provider.
 */
import { getAIFeature, listAIFeatures } from './transport'

/** One manual (non-AI) alternative for a feature. */
export interface ManualMode {
  /** The transport feature this mode replaces (see {@link getAIFeature}). */
  feature: string
  /** Headline shown in the UI, e.g. "Self-explain mode". */
  title: string
  /** One-sentence description of what the manual path replaces. */
  summary: string
  /** Ordered steps the user performs instead of the AI call. */
  steps: string[]
  /**
   * Self-assessment rubric entries (Feynman grader): the user fills these in
   * themselves — same shape the AI grader would return.
   */
  rubric?: {
    key: 'coverage' | 'misconceptions' | 'gaps' | 'suggestedCards'
    label: string
    hint: string
  }[]
}

const TUTOR_SELF_EXPLAIN: ManualMode = {
  feature: 'tutor-grade',
  title: 'Self-explain mode',
  summary:
    'The Socratic ladder becomes self-questioning: you play the tutor, and the retrieval effect still applies.',
  steps: [
    '1 · RESTATE — write the problem/question in your own words. If you cannot, that IS the gap — go back to the source first.',
    '2 · INVENTORY — list everything you already know that connects to this. Prior knowledge is the hook new knowledge hangs on.',
    '3 · PREDICT — before looking anything up, write what you expect the answer to look like (a guess is an attempt — the generation effect does the learning).',
    '4 · ATTEMPT — work the problem fully, from memory, before opening notes. No peeking mid-attempt.',
    '5 · LOCATE — name the exact step or concept where you got stuck. "Stuck" is not an answer; "stuck at X" is.',
    '6 · SELF-NUDGE — ask yourself: what fact or definition does step X depend on? Re-derive it, then retry.',
    '7 · SELF-HINT — still stuck? Write a conceptual hint for yourself ("think about what happens when…") and retry.',
    '8 · WORKED EXAMPLE — work through an analogous problem step by step, close it, and redo your problem alone.',
    '9 · REVEAL — only now check the full solution, and immediately re-derive the key step from memory to close the loop.',
    '10 · LOG — write one sentence: what confused me and what resolved it. That sentence becomes a flashcard candidate.',
  ],
}

const FEYNMAN_STUDENT_MANUAL: ManualMode = {
  feature: 'feynman-student',
  title: 'Teach a real 12-year-old',
  summary:
    'The confused-student interviewer becomes a human (or a rubber duck) — the protégé effect is stronger with a live audience.',
  steps: [
    'Pick a real listener: a friend, a family member, or a rubber duck with strict rules.',
    'Explain the concept in plain words, no jargon — every fancy term must be replaced with an everyday one.',
    'The listener (or you, role-playing) asks: "But WHY does that happen?", "What would happen if…?", "How is that different from…?" — exactly one question at a time.',
    'Answer each question from memory before checking notes; mark every answer you had to look up.',
    'Where you stumbled or hand-waved ("kind of", "basically", "somehow") is a gap — log it for the self-grading rubric below.',
  ],
}

const FEYNMAN_GRADER_MANUAL: ManualMode = {
  feature: 'feynman-grader',
  title: 'Self-assessment rubric',
  summary:
    'Grade your own teach-back against the same rubric the AI grader uses — honesty here is the retrieval practice.',
  steps: [
    'Re-read (or recall) your teach-back transcript.',
    'Fill the rubric below yourself — grade substance, not style; empty sections are valid.',
    'Turn each gap or misconception into an atomic flashcard (one idea per card, front is a question) and save them to a deck.',
  ],
  rubric: [
    {
      key: 'coverage',
      label: 'Coverage (0–100)',
      hint: 'How much of the concept’s essential substance did your explanation actually cover? Estimate honestly.',
    },
    {
      key: 'misconceptions',
      label: 'Misconceptions (one per line)',
      hint: 'Statements you made that are factually WRONG — quote or paraphrase each, then add a one-phrase correction.',
    },
    {
      key: 'gaps',
      label: 'Gaps (one per line)',
      hint: 'Important parts that were MISSING or too vague — name what is missing.',
    },
    {
      key: 'suggestedCards',
      label: 'Gap-cards (front / back, one per line as "front :: back")',
      hint: '2–5 atomic cards that patch the biggest gaps or misconceptions.',
    },
  ],
}

const COURSE_MANUAL: ManualMode = {
  feature: 'course-generator',
  title: 'Manual curriculum builder',
  summary:
    'Build the course yourself with backward design — the AI path automates exactly these steps.',
  steps: [
    'START FROM THE END — write the exam-level question you want to be able to answer when the course is done.',
    'LIST SKILLS — name 3–7 skills that question requires, and draw prerequisite arrows between them (DAG, no cycles).',
    'SEQUENCE UNITS — order the skills from prerequisites to applications; each unit teaches one skill cluster.',
    'WRITE LESSONS — 2–5 lessons per unit; every lesson gets EXACTLY ONE measurable objective starting with ONE Bloom verb (define, explain, compute, derive, compare, critique, design). Never "learn about X".',
    'ADD CARDS — give each lesson 2–6 atomic retrieval-practice cards (basic Q&A, cloze, typein or MCQ) that test its objective.',
    'ENTER IT — use the "Build manually" form on the Curriculum page; it persists the same structure the AI generator would.',
  ],
}

const CLOZE_MANUAL: ManualMode = {
  feature: 'cloze-generator',
  title: 'Hand-made cloze cards',
  summary:
    'The AI only deletes load-bearing words — do the same by hand; the deletion choice is itself retrieval practice.',
  steps: [
    'Pick a sentence from your notes that carries ONE distinct idea.',
    'Delete the most conceptually load-bearing term — a definition’s term, a number, a name, a causal link — and replace it with "____".',
    'One deletion per card; the answer must appear VERBATIM in the sentence (never invent content).',
    'Optional: add a short hint that never reveals the answer.',
    'Enter the cards via the deck editor or "Bulk paste" (cloze format: the sentence with ____ and the answer list).',
  ],
}

const COACH_MANUAL: ManualMode = {
  feature: 'coach',
  title: 'Weekly self-review prompts',
  summary:
    'Answer these from your weekly numbers — the coach only ever reflects the metrics back at you.',
  steps: [
    'Read your weekly stats first (reviews, retention, focus minutes, XP, streak, missed days) — the numbers are the evidence.',
    'SUGGESTION 1 — name the metric that moved the most and ONE concrete behaviour change for next week.',
    'SUGGESTION 2 — name the metric that dropped (if any) and the smallest intervention that could move it.',
    'SUGGESTION 3 — one "keep doing": a metric that is working and deserves to be protected.',
    'Rule the AI follows that you should too: no generic advice — every suggestion must cite a specific number.',
    'Write the three suggestions into today’s journal entry; they are stored as the reflection for the week.',
  ],
}

const COUNCIL_MANUALS: Record<string, ManualMode> = {
  'council-optimist': {
    feature: 'council-optimist',
    title: 'Play the Optimist yourself',
    summary:
      'Answer the Optimist’s prompt in writing — or paste it into any chatbot via the copy-envelope box.',
    steps: [
      'Copy the envelope below into any chatbot, or answer on paper.',
      'Find the genuine upside: the strongest version of the idea, who it serves, why now, and the cheapest first experiment that could prove it.',
      'Be concrete and energetic — but never invent evidence. Under 150 words.',
    ],
  },
  'council-skeptic': {
    feature: 'council-skeptic',
    title: 'Play the Skeptic yourself',
    summary: 'Interrogate your own idea — every objection must be falsifiable.',
    steps: [
      'Copy the envelope below into any chatbot, or answer on paper.',
      'List assumptions, hidden costs, base rates and failure modes.',
      'Ask the single most dangerous question for this idea. No cynicism for its own sake.',
    ],
  },
  'council-domain-expert': {
    feature: 'council-domain-expert',
    title: 'Ground it like a Domain Expert',
    summary: 'Anchor the idea in how the domain actually works.',
    steps: [
      'Copy the envelope below into any chatbot, or research on paper.',
      'Find prior art; why similar attempts succeeded or failed; the practical constraints (time, skill, regulation, distribution).',
      'Flag clearly what you are uncertain about.',
    ],
  },
  'council-devils-advocate': {
    feature: 'council-devils-advocate',
    title: "Argue against it — Devil's Advocate",
    summary: 'Steelman the case AGAINST pursuing the idea at all.',
    steps: [
      'Copy the envelope below into any chatbot, or argue it out on paper.',
      'Argue the strongest case against pursuing this idea, including "do nothing".',
      'End with the one condition under which you would change your mind.',
    ],
  },
}

const BRAINWRITE_MANUAL: ManualMode = {
  feature: 'brainwrite',
  title: 'Brainwriting 6-3-5, by hand',
  summary:
    'The original 1948 method needs no AI: 6 people (or 3 timed rounds alone) write ideas, then the merge dedupes.',
  steps: [
    'Write the topic at the top of a sheet; list your existing ideas so you can steer clear of them.',
    'Round 1 — 3 new ideas in 5 minutes. Different ANGLES, not paraphrases: remote analogies, constraint-flips, adjacent fields.',
    'Round 2 — pass the sheet (or switch columns): build on someone else’s line in a different direction.',
    'Round 3 — one more pass, each idea one punchy sentence, no numbering.',
    'Paste the AI-participant output (or your rounds) into the "paste result" box — the same >0.85 near-duplicate merge runs on it.',
  ],
}

const FREETEXT_RUBRIC_MANUAL: ManualMode = {
  feature: 'freetext-rubric',
  title: 'Self-grade against the checklist',
  summary:
    'Compare your written explanation directly against each rubric criterion — self-scoring after retrieval builds metacognitive calibration (Dunlosky & Rawson 2012).',
  steps: [
    'Read your written answer aloud or line by line before looking at the model answer.',
    'Tick each rubric checkbox ONLY if your written text explicitly states that mechanism or distinction (not "I meant to say that").',
    'Open the reference model answer, spot any subtle nuance you missed, and submit your honest self-check.',
  ],
}

/** Manual modes keyed by feature name (every transport feature has one). */
export const MANUAL_MODES: Record<string, ManualMode> = {
  'tutor-session-summary': {
    feature: 'tutor-session-summary',
    title: 'Self-review the transcript',
    summary:
      'Read your own tutor transcript and mark the moments you stumbled — those are your gaps.',
    steps: [
      'Re-read the transcript and list every question you could not answer (or answered wrong) — those are your GAPS.',
      'List what you answered confidently — that is your UNDERSTOOD set.',
      'Write one card per gap: the question on the front, the answer the tutor eventually revealed on the back.',
    ],
  },
  'nl-search': {
    feature: 'nl-search',
    title: 'Keyword split search',
    summary:
      'No planner needed: your question is split into its meaningful words and searched across every collection at once.',
    steps: [
      'Open Search (or press ⌘K) and paste the key nouns of your question — drop filler like "what", "did", "about".',
      'Skim the grouped results; use the kind chips to narrow to one collection.',
      'No hits? Try one synonym per concept — the full-text index matches prefixes automatically.',
    ],
  },
  'tutor-grade': TUTOR_SELF_EXPLAIN,
  'feynman-student': FEYNMAN_STUDENT_MANUAL,
  'feynman-grader': FEYNMAN_GRADER_MANUAL,
  'course-generator': COURSE_MANUAL,
  'cloze-generator': CLOZE_MANUAL,
  coach: COACH_MANUAL,
  'council-optimist': COUNCIL_MANUALS['council-optimist']!,
  'council-skeptic': COUNCIL_MANUALS['council-skeptic']!,
  'council-domain-expert': COUNCIL_MANUALS['council-domain-expert']!,
  'council-devils-advocate': COUNCIL_MANUALS['council-devils-advocate']!,
  brainwrite: BRAINWRITE_MANUAL,
  'freetext-rubric': FREETEXT_RUBRIC_MANUAL,
}

/** The manual mode for a feature, or null for an unknown feature name. */
export function getManualMode(feature: string): ManualMode | null {
  return MANUAL_MODES[feature] ?? null
}

/** Every feature is required to have a manual mode — run in tests to keep the invariant. */
export function assertEveryFeatureHasManualMode(): string[] {
  return listAIFeatures().filter((f) => !MANUAL_MODES[f])
}

/** Convenience: the manual mode plus the feature's system prompt in one lookup. */
export function getManualModeWithPrompt(
  feature: string,
): { mode: ManualMode; system: string } | null {
  const mode = getManualMode(feature)
  const def = getAIFeature(feature)
  if (!mode || !def) return null
  return { mode, system: def.system }
}
