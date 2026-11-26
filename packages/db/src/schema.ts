import type { LearnerProfile } from '@learning-hub/core'
/**
 * Learning HUB — complete SQLite schema (Drizzle ORM).
 * Dates are ISO-8601 strings; JSON payloads use text({ mode: 'json' }).
 * Append-only event tables are NEVER mutated — stats derive via SQL views.
 */
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable as table,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import type {
  AIProvider,
  BinauralMode,
  CardContent,
  CardFormat,
  Confidence,
  DebateTurn,
  FrictionTrigger,
  HandsFreeGradeEvent,
  HighlightTriage,
  IdeaLinkType,
  IdeaStage,
  NoteLinkType,
  PARStatus,
  QuestItem,
  SourceKind,
  SpatialLocus,
  TmrEarcon,
  XPSource,
} from '@learning-hub/core'
import type { LhcfCourse, LhcfLesson } from '@learning-hub/core/curriculum'

// ─── Content ────────────────────────────────────────────────────────────────

export const notes = table(
  'notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    content: text('content').notNull().default(''), // markdown
    supertag: text('supertag'), // typed note template (Tana-style)
    fields: text('fields', { mode: 'json' }).$type<Record<string, string>>(),
    status: text('status').$type<PARStatus>().notNull().default('inbox'),
    deckId: integer('deck_id'), // optional home deck for generated cards
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('notes_status_idx').on(t.status)],
)

/** Directed wiki-links between notes, with the WHY context (Zettelkasten). */
export const noteLinks = table(
  'note_links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fromNoteId: integer('from_note_id').notNull(),
    toNoteId: integer('to_note_id').notNull(),
    type: text('type').$type<NoteLinkType>().notNull().default('related'),
    context: text('context'), // WHY the connection matters (Zettelkasten rule)
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('note_links_from_idx').on(t.fromNoteId), index('note_links_to_idx').on(t.toNoteId)],
)

/** RemNote pattern: any note bullet can BE a card and stays linked. */
export const noteBullets = table(
  'note_bullets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    noteId: integer('note_id').notNull(),
    content: text('content').notNull(),
    position: integer('position').notNull().default(0),
    cardId: integer('card_id'), // set when the bullet becomes a card
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('note_bullets_note_idx').on(t.noteId)],
)

/** Card containers (Anki-style decks, unique by name). */
export const decks = table(
  'decks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    emoji: text('emoji').default('📚'),
    /** Optional per-deck retention override in [0.5, 0.97]; null inherits global setting. */
    desiredRetention: real('desired_retention'),
    /**
     * Per-deck delayed feedback (Butler & Roediger 2008 — delayed feedback beat
     * immediate feedback for final-test performance): when on, the review flow
     * hides the answer until the grade is committed blind and the blind-graded
     * misses (revlog rating 1–2 in the last 24h) surface for restudy at the
     * start of the next session. Off by default.
     */
    delayedFeedback: integer('delayed_feedback', { mode: 'boolean' }).notNull().default(false),
    /** Optional per-deck 21-parameter FSRS-6 weight vector; null inherits global weights. */
    fsrsWeights: text('fsrs_weights', { mode: 'json' }).$type<number[]>(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex('decks_name_idx').on(t.name)],
)

/** Reviewable cards with their full FSRS-6 memory state. */
export const cards = table(
  'cards',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    deckId: integer('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    noteId: integer('note_id'),
    bulletId: integer('bullet_id'),
    type: text('type').$type<CardFormat>().notNull(),
    content: text('content', { mode: 'json' }).$type<CardContent>().notNull(),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
    source: text('source'), // where it came from (pdf, ai, manual…)
    skillId: integer('skill_id'), // curriculum link
    /** Stable origin key, e.g. `lhcf:<course>/<lesson>/<n>` — re-imports update the card in place (keeping FSRS state). */
    sourceKey: text('source_key'),
    suspended: integer('suspended', { mode: 'boolean' }).notNull().default(false),
    buryUntil: text('bury_until'), // sibling burying
    // ── FSRS-6 memory state (ts-fsrs Card serialized) ──
    due: text('due').notNull(), // ISO
    stability: real('stability').notNull().default(0),
    difficulty: real('difficulty').notNull().default(0),
    elapsedDays: integer('elapsed_days').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    state: integer('state').notNull().default(0), // 0 New 1 Learning 2 Review 3 Relearning
    lastReview: text('last_review'),
    learningStep: integer('learning_step').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index('cards_due_idx').on(t.due),
    index('cards_deck_idx').on(t.deckId),
    index('cards_state_idx').on(t.state),
    index('cards_suspended_due_idx').on(t.suspended, t.due),
    uniqueIndex('cards_source_key_idx').on(t.sourceKey),
  ],
)

/** Anki-compatible append-only review log. id = epoch ms of the review. */
export const revlog = table(
  'revlog',
  {
    id: integer('id').primaryKey(), // epoch ms — like Anki
    cardId: integer('card_id').notNull(),
    rating: integer('rating').notNull(), // 1 Again / 2 Hard / 3 Good / 4 Easy
    state: integer('state').notNull(), // state BEFORE review
    elapsedDays: integer('elapsed_days').notNull(),
    scheduledDays: integer('scheduled_days').notNull(),
    timeMs: integer('time_ms').notNull(),
    confidence: integer('confidence').$type<Confidence>().notNull().default(1),
    retrievability: real('retrievability'), // Feature 10 (Addon 10)
    reviewedAt: text('reviewed_at').notNull(), // ISO
  },
  (t) => [index('revlog_card_idx').on(t.cardId), index('revlog_time_idx').on(t.reviewedAt)],
)

/**
 * Append-only undo tombstones for `revlog` (preserves Hard Rule #8: `revlog`
 * itself is never DELETEd or UPDATEd; derived views and FSRS optimizers filter
 * out `revlog.id IN (SELECT revlog_id FROM revlog_undos)`).
 */
export const revlogUndos = table(
  'revlog_undos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    revlogId: integer('revlog_id').notNull(),
    cardId: integer('card_id').notNull(),
    undoneAt: text('undone_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex('revlog_undos_revlog_idx').on(t.revlogId),
    index('revlog_undos_card_idx').on(t.cardId),
  ],
)

/** Registry of image files stored in the images dir on disk (or in `data` as base64). */
export const images = table('images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  data: text('data'), // base64-encoded image bytes (uploads persisted in the DB)
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// ─── Memory systems ─────────────────────────────────────────────────────────

export const palaces = table('palaces', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  layout: text('layout', { mode: 'json' }).$type<{ rooms: { name: string; emoji: string }[] }>(),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** Memory-palace loci: one named object per room slot, optionally card-linked. */
export const palaceItems = table(
  'palace_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    palaceId: integer('palace_id')
      .notNull()
      .references(() => palaces.id, { onDelete: 'cascade' }),
    lociIndex: integer('loci_index').notNull(),
    name: text('name').notNull(), // the object at this locus
    vividImage: text('vivid_image'), // user's encoded image description
    cardId: integer('card_id'),
  },
  (t) => [index('palace_items_palace_idx').on(t.palaceId)],
)

/** Major system / PAO code tables (user-configurable, seeded with defaults). */
export const mnemonicTables = table(
  'mnemonic_tables',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind').notNull(), // 'major' | 'pao' | 'dominic'
    code: text('code').notNull(), // e.g. '35' or '07'
    person: text('person'),
    action: text('action'),
    object: text('object'),
    word: text('word'),
    image: text('image'),
  },
  (t) => [uniqueIndex('mnemonic_kind_code_idx').on(t.kind, t.code)],
)

// ─── Reading pipeline ───────────────────────────────────────────────────────

export const sources = table(
  'sources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind').$type<SourceKind>().notNull(),
    title: text('title').notNull(),
    url: text('url'),
    content: text('content').notNull(), // extracted full text
    priority: real('priority').notNull().default(50), // SuperMemo-style 0-100
    position: integer('position').notNull().default(0), // reading position %
    status: text('status').notNull().default('queued'), // queued|reading|done
    addedAt: text('added_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    lastReadAt: text('last_read_at'),
  },
  (t) => [index('sources_priority_idx').on(t.priority)],
)

/** Reading highlights extracted from sources, triaged into cards. */
export const highlights = table(
  'highlights',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceId: integer('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    note: text('note'),
    triaged: integer('triaged').$type<HighlightTriage>().notNull().default(0),
    cardId: integer('card_id'),
    strength: real('strength').notNull().default(0.5), // Readwise-style resurfacing
    lastReviewedAt: text('last_reviewed_at'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('highlights_source_idx').on(t.sourceId)],
)

export interface Sq3rQuestionItem {
  id: string
  question: string
  answer: string
  cardId?: number
}

/**
 * Guided SQ3R study session per reading source (Robinson 1946, *Effective Study*):
 * Survey → Question → Read → Recite → Review.
 */
export const sq3rSessions = table(
  'sq3r_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceId: integer('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    surveyHeadings: text('survey_headings', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    questions: text('questions', { mode: 'json' })
      .$type<Sq3rQuestionItem[]>()
      .notNull()
      .default([]),
    reciteNotes: text('recite_notes').notNull().default(''),
    completedSteps: text('completed_steps', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex('sq3r_sessions_source_idx').on(t.sourceId)],
)

// ─── Curriculum ─────────────────────────────────────────────────────────────

/** Catalog groups of courses (e.g. "Data"); `slug` makes imports idempotent. */
export const tracks = table(
  'tracks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug'), // LHCF track key (slugified track name); null for legacy rows
    title: text('title').notNull(),
    description: text('description'),
    emoji: text('emoji').default('🎯'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex('tracks_slug_idx').on(t.slug)],
)

/** Curriculum tree: courses group units inside a track. */
export const courses = table(
  'courses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    trackId: integer('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    order: integer('order').notNull().default(0),
    // ── LHCF (null for legacy / hand-built courses) ──
    slug: text('slug'), // upsert key: re-importing the same slug updates in place
    subtitle: text('subtitle'),
    emoji: text('emoji'),
    level: text('level'), // beginner|intermediate|advanced
    language: text('language'),
    estHours: real('est_hours'),
    /** The full validated LHCF document — exact export + fields without columns. */
    spec: text('spec', { mode: 'json' }).$type<LhcfCourse>(),
    /** Deck holding this course's exercise cards. */
    deckId: integer('deck_id'),
    updatedAt: text('updated_at'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('courses_track_idx').on(t.trackId), uniqueIndex('courses_slug_idx').on(t.slug)],
)

/** Curriculum tree: units group lessons inside a course. */
export const units = table(
  'units',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    courseId: integer('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    order: integer('order').notNull().default(0),
    slug: text('slug'), // LHCF module slug (unique within its course)
    description: text('description'),
  },
  (t) => [index('units_course_idx').on(t.courseId)],
)

/** Curriculum leaves: lessons with a measurable Bloom-verb objective. */
export const lessons = table(
  'lessons',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    unitId: integer('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    type: text('type').notNull().default('concept'), // concept|reading|video|exercise|quiz|project|capstone
    objective: text('objective'), // measurable, one Bloom verb
    bloomVerb: text('bloom_verb'),
    content: text('content', { mode: 'json' }).$type<LessonContent>(),
    skillId: integer('skill_id'),
    order: integer('order').notNull().default(0),
    completedAt: text('completed_at'),
    slug: text('slug'), // LHCF lesson slug (unique within its course)
    estMinutes: integer('est_minutes'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('lessons_unit_idx').on(t.unitId)],
)

/**
 * Lesson payload. Legacy lessons only have `body`; LHCF lessons carry their
 * full study material. `cardIds` are the lesson's exercise cards, in order.
 */
export type LessonContent = {
  body: string
  cardIds?: number[]
  quiz?: unknown
} & Partial<
  Pick<
    LhcfLesson,
    'summary' | 'theory' | 'workedExamples' | 'keyTerms' | 'resources' | 'reflection' | 'skills'
  >
>

/** Skill-tree nodes; each gets its own BKT + Elo mastery row. */
export const skills = table(
  'skills',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    trackId: integer('track_id'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex('skills_name_idx').on(t.name)],
)

/** prerequisite DAG: `from` must be mastered before `to` unlocks */
export const skillEdges = table(
  'skill_edges',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fromSkillId: integer('from_skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    toSkillId: integer('to_skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('skill_edges_pair_idx').on(t.fromSkillId, t.toSkillId)],
)

/** Per-skill mastery state: BKT pKnown, attempt stats and puzzle-Elo. */
export const mastery = table(
  'mastery',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    skillId: integer('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    pKnown: real('p_known').notNull().default(0.1), // BKT
    attempts: integer('attempts').notNull().default(0),
    correct: integer('correct').notNull().default(0),
    elo: real('elo').notNull().default(1000), // puzzle-Elo ladder
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex('mastery_skill_idx').on(t.skillId)],
)

/** Countdown anchors that drive exam-day / cram planning. */
export const examDates = table('exam_dates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  courseId: integer('course_id'),
  title: text('title').notNull(),
  date: text('date').notNull(), // ISO date
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/**
 * Per-lesson study progress (Coursera-style "in progress / completed").
 * `lessons.completedAt` is kept in sync for older readers (quests, achievements).
 */
export const lessonProgress = table(
  'lesson_progress',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    lessonId: integer('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    status: text('status').$type<'in_progress' | 'completed'>().notNull().default('in_progress'),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    timeSpentSec: integer('time_spent_sec').notNull().default(0),
    /** Exercises answered in this lesson (all attempts) and how many fully correct. */
    attempts: integer('attempts').notNull().default(0),
    correct: integer('correct').notNull().default(0),
    /** Latest self-explanation answers (reflection prompts), in order. */
    reflections: text('reflections', { mode: 'json' }).$type<string[]>(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [uniqueIndex('lesson_progress_lesson_idx').on(t.lessonId)],
)

/** Hyperskill-style project stages of an LHCF course (one row per stage). */
export const courseProjectStages = table(
  'course_project_stages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    courseId: integer('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    projectSlug: text('project_slug').notNull(),
    projectTitle: text('project_title').notNull(),
    stageSlug: text('stage_slug').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    checklist: text('checklist', { mode: 'json' }).$type<string[]>().notNull().default([]),
    /** Ticked checklist items (parallel to `checklist`). */
    checked: text('checked', { mode: 'json' }).$type<boolean[]>().notNull().default([]),
    order: integer('order').notNull().default(0),
    completedAt: text('completed_at'),
  },
  (t) => [
    index('course_project_stages_course_idx').on(t.courseId),
    uniqueIndex('course_project_stages_key_idx').on(t.courseId, t.projectSlug, t.stageSlug),
  ],
)

/** Final-exam attempts of an LHCF course (append-only). */
export const courseExamAttempts = table(
  'course_exam_attempts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    courseId: integer('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    /** 0..1 fraction of points earned. */
    score: real('score').notNull(),
    passed: integer('passed', { mode: 'boolean' }).notNull(),
    /** Per-question score, in exam order. */
    results: text('results', { mode: 'json' }).$type<number[]>().notNull().default([]),
    takenAt: text('taken_at').notNull(),
  },
  (t) => [index('course_exam_attempts_course_idx').on(t.courseId)],
)

/** Issued course certificates (one per course; re-issue keeps the code). */
export const certificates = table(
  'certificates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    courseId: integer('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    /** Short human-checkable code printed on the certificate. */
    code: text('code').notNull(),
    issuedAt: text('issued_at').notNull(),
    /** What was achieved at issue time (title, hours, exam score…). */
    snapshot: text('snapshot', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  },
  (t) => [
    uniqueIndex('certificates_course_idx').on(t.courseId),
    uniqueIndex('certificates_code_idx').on(t.code),
  ],
)

/** Concrete projects with milestones, optionally promoted from ideas. */
export const projects = table('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  ideaId: integer('idea_id'), // promoted from the idea system
  trackId: integer('track_id'),
  status: text('status').notNull().default('active'), // active|done|dropped
  dueDate: text('due_date'),
  milestones: text('milestones', { mode: 'json' })
    .$type<{ label: string; done: boolean }[]>()
    .notNull()
    .default([]),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// ─── Human systems ──────────────────────────────────────────────────────────

export const goals = table('goals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  wish: text('wish').notNull(), // WOOP
  outcome: text('outcome'),
  obstacle: text('obstacle'),
  ifThenPlan: text('if_then_plan'), // "If <obstacle>, then I will <action>"
  // Structured implementation intention (Gollwitzer & Sheeran 2006, d = 0.65):
  ifCondition: text('if_condition'), // "If <situation/cue>" — trigger half, ≤ 200 chars
  thenAction: text('then_action'), // "then <action>" — response half, ≤ 200 chars
  status: text('status').notNull().default('active'),
  progressPct: real('progress_pct').notNull().default(0), // goal-gradient bar
  quoteId: integer('quote_id'),
  dueDate: text('due_date'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** Atomic habits: Clear's cue/craving/response/reward loop + stacking anchors. */
export const habits = table('habits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  cue: text('cue'),
  cueType: text('cue_type'), // time|location|preceding|emotional|people
  craving: text('craving'),
  response: text('response'), // the tiny version (two-minute rule)
  reward: text('reward'),
  anchor: text('anchor'), // habit stacking: "After [existing habit]"
  order: integer('order').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** One row per habit per day checked off (unique by habit+date). */
export const habitLogs = table(
  'habit_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    habitId: integer('habit_id')
      .notNull()
      .references(() => habits.id),
    date: text('date').notNull(), // YYYY-MM-DD
    note: text('note'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex('habit_logs_day_idx').on(t.habitId, t.date)],
)

/** Commitment devices: a weekly metric threshold plus visible stakes. */
export const commitments = table('commitments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  metric: text('metric').notNull(), // reviews|focus_minutes|lessons
  threshold: integer('threshold').notNull(), // weekly target
  stakes: text('stakes'), // visible social/integrity stakes
  status: text('status').notNull().default('active'),
  startedAt: text('started_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  endsAt: text('ends_at'),
})

/** Daily journal entry: mood, small wins, gratitude, worry dump. */
export const journalEntries = table(
  'journal_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(), // YYYY-MM-DD
    mood: integer('mood'), // 1-5 emoji scale (Daylio pattern)
    smallWins: text('small_wins'),
    gratitude: text('gratitude'),
    worryDump: text('worry_dump'), // exam-expressive-writing outlet
    aiInsight: text('ai_insight'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex('journal_date_idx').on(t.date)],
)

/** Motivational quotes (seeded or user-added) with who/when/why context. */
export const quotes = table('quotes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  text: text('text').notNull(),
  author: text('author').notNull(),
  context: text('context'), // who/when/why — quotes carry history
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  isUserAdded: integer('is_user_added', { mode: 'boolean' }).notNull().default(false),
  favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** Join table: a motivational quote pinned to a WOOP goal. */
export const goalsQuotes = table(
  'goals_quotes',
  {
    goalId: integer('goal_id').notNull(),
    quoteId: integer('quote_id').notNull(),
  },
  (t) => [uniqueIndex('goals_quotes_pair_idx').on(t.goalId, t.quoteId)],
)

/** Idea inbox: staged ideas with resurfacing cadence and decay score. */
export const ideas = table(
  'ideas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    stage: text('stage').$type<IdeaStage>().notNull().default('seed'),
    projectId: integer('project_id'),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
    resurfaceEveryDays: integer('resurface_every_days').notNull().default(14),
    lastResurfacedAt: text('last_resurfaced_at'),
    decayScore: real('decay_score').notNull().default(1.0),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('ideas_stage_idx').on(t.stage)],
)

/** Directed links between ideas (related/contradicts/…, Zettelkasten). */
export const ideaLinks = table(
  'idea_links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fromIdeaId: integer('from_idea_id')
      .notNull()
      .references(() => ideas.id, { onDelete: 'cascade' }),
    toIdeaId: integer('to_idea_id')
      .notNull()
      .references(() => ideas.id, { onDelete: 'cascade' }),
    type: text('type').$type<IdeaLinkType>().notNull().default('related'),
    context: text('context'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('idea_links_from_idx').on(t.fromIdeaId), index('idea_links_to_idx').on(t.toIdeaId)],
)

// ─── Motivation events ──────────────────────────────────────────────────────

export const xpEvents = table(
  'xp_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    source: text('source').$type<XPSource>().notNull(),
    amount: integer('amount').notNull(),
    meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('xp_created_idx').on(t.createdAt)],
)

/** Daily gamified quest list (one row per day, XP reward on completion). */
export const quests = table(
  'quests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(), // YYYY-MM-DD
    items: text('items', { mode: 'json' }).$type<QuestItem[]>().notNull(),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    xpReward: integer('xp_reward').notNull().default(50),
  },
  (t) => [uniqueIndex('quests_date_idx').on(t.date)],
)

/** Single-row streak state: current/best days, freezes and the weekend amulet. */
export const streaks = table('streaks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  current: integer('current').notNull().default(0),
  best: integer('best').notNull().default(0),
  lastActiveDate: text('last_active_date'), // YYYY-MM-DD
  freezes: integer('freezes').notNull().default(2),
  weekendAmulet: integer('weekend_amulet', { mode: 'boolean' }).notNull().default(false),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** Unlocked achievement badges (unique by key). */
export const achievements = table(
  'achievements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    unlockedAt: text('unlocked_at'),
  },
  (t) => [uniqueIndex('achievements_key_idx').on(t.key)],
)

/** Puzzle-Elo ladder (chess.com pattern): one rating per skill, per-item difficulty. */
export const eloEvents = table('elo_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  skillId: integer('skill_id'),
  ratingBefore: real('rating_before').notNull(),
  ratingAfter: real('rating_after').notNull(),
  itemDifficulty: real('item_difficulty'),
  outcome: real('outcome').notNull(), // 0-1 quality of the answer
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// ─── Addiction helper ───────────────────────────────────────────────────────

export const focusSessions = table(
  'focus_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at'),
    plannedMinutes: integer('planned_minutes').notNull(),
    actualMinutes: real('actual_minutes'),
    type: text('type').notNull().default('pomodoro'), // pomodoro|deep|custom
    task: text('task'),
    leaks: integer('leaks').notNull().default(0), // tab-switches away (Page Visibility)
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    mood: integer('mood'),
    notes: text('notes'),
    mode: text('mode').notNull().default('standard'), // standard|max
    lockedUntil: text('locked_until'),
    allowlistId: integer('allowlist_id'),
    allowSnapshot: text('allow_snapshot', { mode: 'json' }).$type<{
      domains: string[]
      apps: string[]
    }>(),
    exitRequestedAt: text('exit_requested_at'),
    endedEarly: integer('ended_early', { mode: 'boolean' }).notNull().default(false),
    /** M2-03: lock state-machine phase (locked|cooldown|can_confirm|ended). */
    state: text('state'),
    /** M2-03: enforcement tier reached (owner|accessibility|windows-admin|windows-basic). */
    tier: text('tier'),
    /** M2-03: logged reason when the session ended early (PIN-gated exit). */
    exitReason: text('exit_reason'),
    /** M2-03: absolute hard-cap timestamp (ISO) — the session auto-unlocks past it. */
    hardCapAt: text('hard_cap_at'),
  },
  (t) => [index('focus_started_idx').on(t.startedAt)],
)

/** User-defined allowlists for Max Focus sessions. */
export const focusAllowlists = table(
  'focus_allowlists',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    domains: text('domains', { mode: 'json' }).$type<string[]>().notNull(),
    apps: text('apps', { mode: 'json' }).$type<string[]>().notNull(),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex('focus_allowlist_name_idx').on(t.name)],
)

/** Device-local bridge credentials for the companion focus extension (stripped from sync/backup). */
export const focusBridge = table('focus_bridge', {
  id: text('id').primaryKey().default('default'),
  pairingToken: text('pairing_token').notNull(),
  extensionId: text('extension_id'),
  lastHeartbeatAt: text('last_heartbeat_at'),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** Friction-gate telemetry: trigger, delay, reflection text and outcome. */
export const frictionEvents = table('friction_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  trigger: text('trigger').$type<FrictionTrigger>().notNull(),
  delaySec: integer('delay_sec').notNull().default(10),
  reflection: text('reflection'), // "what will you do in the app?"
  proceeded: integer('proceeded', { mode: 'boolean' }).notNull().default(false),
  sessionId: integer('session_id'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** User-defined distraction apps/websites the friction gates reference. */
export const distractionApps = table(
  'distraction_apps',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('app'), // app|website|habit
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex('distraction_name_idx').on(t.name)],
)

/** Implementation intentions: "if <condition>, then <action>" plans. */
export const ifthenPlans = table('ifthen_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  condition: text('condition').notNull(), // "If it's late and I feel the urge to scroll…"
  action: text('action').notNull(), // "…then I will do 3 cards instead"
  context: text('context').notNull().default('focus'), // goal|habit|focus
  linkedId: integer('linked_id'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** Named routine containers (morning/evening ritual templates). */
export const routines = table('routines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** Ordered, time-boxed steps inside a routine. */
export const routineSteps = table(
  'routine_steps',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    routineId: integer('routine_id')
      .notNull()
      .references(() => routines.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    minutes: integer('minutes').notNull().default(5),
    order: integer('order').notNull().default(0),
  },
  (t) => [index('routine_steps_routine_idx').on(t.routineId)],
)

// ─── Physiology ─────────────────────────────────────────────────────────────

export const physioLog = table(
  'physio_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(), // YYYY-MM-DD
    sleepHours: real('sleep_hours'),
    sleepQuality: integer('sleep_quality'), // 1-5
    exerciseMinutes: integer('exercise_minutes'),
    exerciseHoursAfterLearning: real('exercise_hours_after_learning'),
    caffeineCutoffHour: integer('caffeine_cutoff_hour'), // hour of day (0-23)
    arousal: integer('arousal'), // 1-10 self-rating (Yerkes-Dodson context)
    notes: text('notes'),
  },
  (t) => [uniqueIndex('physio_date_idx').on(t.date)],
)

// ─── AI, canvas, chat ───────────────────────────────────────────────────────

export const userSettings = table('user_settings', {
  id: text('id').primaryKey().default('default'),
  aiProvider: text('ai_provider').$type<AIProvider>().notNull().default('none'),
  aiModel: text('ai_model'),
  aiBaseUrl: text('ai_base_url'),
  aiApiKey: text('ai_api_key'),
  /** JSON object of extra HTTP headers for the 'custom-endpoint' provider, e.g. {"Authorization":"Bearer …"}. */
  aiHeaders: text('ai_headers'),
  desiredRetention: real('desired_retention').notNull().default(0.9),
  /** Optional personalized 21-parameter FSRS-6 weight vector; null uses FSRS-6 defaults. */
  fsrsWeights: text('fsrs_weights', { mode: 'json' }).$type<number[]>(),
  sessionMinutes: integer('session_minutes').notNull().default(25),
  theme: text('theme').notNull().default('dark'),
  /** Tactile feedback (grading, session boundaries). Sensory features must be opt-out — calm by default. */
  hapticsEnabled: integer('haptics_enabled', { mode: 'boolean' }).notNull().default(true),
  detoxWizard: text('detox_wizard', { mode: 'json' })
    .$type<Record<string, boolean>>()
    .notNull()
    .default({}),
  /** Learner profile from onboarding (traits + archetype + applied-knob snapshot); migration 030. */
  learnerProfile: text('learner_profile', { mode: 'json' }).$type<LearnerProfile>(),
  valuesAffirmation: text('values_affirmation'), // Cohen & Sherman onboarding exercise
  dailyLoopState: text('daily_loop_state', { mode: 'json' })
    .$type<Record<string, boolean>>()
    .notNull()
    .default({}),
  onboardingCompleted: integer('onboarding_completed', { mode: 'boolean' })
    .notNull()
    .default(false),
  /** Notification Center policy JSON (per-channel enable/OS, quiet hours, cap, DND). */
  notificationPrefs: text('notification_prefs', { mode: 'json' })
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  remindersEnabled: integer('reminders_enabled', { mode: 'boolean' }).notNull().default(true),
  remindersQuietStart: text('reminders_quiet_start').notNull().default('22:00'),
  remindersQuietEnd: text('reminders_quiet_end').notNull().default('08:00'),
  remindersDailyCap: integer('reminders_daily_cap').notNull().default(3),
  remindersKinds: text('reminders_kinds', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(['daily_review', 'streak_saver', 'break_reminder', 'curriculum_nudge']),
  sidebarCollapsedGroups: text('sidebar_collapsed_groups', { mode: 'json' }).$type<string[]>(),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** Freeform spatial canvases: draggable items + edges persisted as JSON. */
export const canvases = table('canvases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  scope: text('scope').notNull().default('free'), // free|course|idea
  scopeId: integer('scope_id'),
  items: text('items', { mode: 'json' }).$type<unknown[]>().notNull().default([]),
  edges: text('edges', { mode: 'json' }).$type<unknown[]>().notNull().default([]),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** AI chat transcripts (tutor/feynman/council/brainwrite) with hints used. */
export const chatSessions = table('chat_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(), // tutor|feynman|council|brainwrite
  contextType: text('context_type'), // lesson|concept|idea|deck
  contextId: integer('context_id'),
  title: text('title'),
  messages: text('messages', { mode: 'json' }).$type<unknown[]>().notNull().default([]),
  score: text('score', { mode: 'json' }).$type<Record<string, unknown>>(), // feynman grading result
  hintsUsed: integer('hints_used').notNull().default(0), // mastery signal
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// ─── Infrastructure ─────────────────────────────────────────────────────────

/**
 * One saved study plan (M4 planner): the computed weekly template is stored so
 * it survives restarts and can be exported to calendar files. Regenerated
 * (upserted) whenever the learner rebuilds the plan; there is no history.
 */
/**
 * Web-push subscriptions (migration 020): browser push endpoints for the
 * reminder engine. One row per browser subscription; endpoints are unique.
 */
export const pushSubscriptions = table('push_subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  endpoint: text('endpoint').notNull().unique(),
  keysJson: text('keys_json', { mode: 'json' }).$type<Record<string, string>>().notNull(),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

export const studyPlans = table('study_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** minutes of study planned per week */
  weeklyMinutes: integer('weekly_minutes').notNull(),
  /** day of week rested (0=Sun … 6=Sat); null = no rest day */
  restDay: integer('rest_day'),
  /** the full weekly template: { weeks, blocks: [{day, minutes, courseId, label}] } */
  plan: text('plan', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/**
 * Applied schema migrations (see ./migrations). Declared here so drizzle-kit
 * push keeps the table; the runner creates it with identical DDL.
 */
export const schemaMigrations = table('schema_migrations', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  appliedAt: text('applied_at').notNull(),
})

/**
 * Synced deletion tombstones so non-destructive multi-device merge (`mergeBackup`)
 * does not resurrect intentionally deleted user entities.
 */
export const syncTombstones = table(
  'sync_tombstones',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tableName: text('table_name').notNull(),
    recordKey: text('record_key').notNull(),
    deletedAt: text('deleted_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex('sync_tombstones_key_idx').on(t.tableName, t.recordKey)],
)

/**
 * Device-local cloud sync configuration & credentials.
 *
 * SECURITY INVARIANT: `backupAll`, `restoreAll`, and `mergeBackup` NEVER export
 * or overwrite `sync_configs` rows — OAuth tokens, GitHub PATs, WebDAV passwords,
 * and E2EE passphrases never leave the local device.
 */
export const syncConfigs = table('sync_configs', {
  id: text('id').primaryKey().default('default'),
  provider: text('provider').notNull().default('none'), // none|dropbox|github|gdrive|webdav
  configJson: text('config_json').notNull().default('{}'),
  encryptionEnabled: integer('encryption_enabled', { mode: 'boolean' }).notNull().default(false),
  passphrase: text('passphrase'),
  lastSyncedAt: text('last_synced_at'),
  lastSyncRevision: text('last_sync_revision'),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// ─── Derived views (append-only stats — never mutate) ──────────────────────

/**
 * Append-only log of dispatched push/desktop/tray notifications.
 * Never edit or delete rows (Rule 8: append-only tables stay append-only).
 */
export const reminderLog = table(
  'reminder_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    actionUrl: text('action_url'),
    sentAt: text('sent_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('reminder_log_sent_at_idx').on(t.sentAt)],
)

/**
 * Append-only log of user interactions / clicks on reminders.
 */
export const reminderClicks = table(
  'reminder_clicks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reminderLogId: integer('reminder_log_id').references(() => reminderLog.id),
    kind: text('kind'),
    actionUrl: text('action_url'),
    clickedAt: text('clicked_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('reminder_clicks_clicked_at_idx').on(t.clickedAt)],
)

/**
 * Append-only ledger of EVERY notification decision (delivered AND
 * suppressed, with reason) — the Notification Center history feed. Append-only
 * per rule 8; there is no UPDATE/DELETE path anywhere.
 */
export const notificationLog = table(
  'notification_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Channel id from `@learning-hub/core/notification-center`. */
    channel: text('channel').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    actionUrl: text('action_url'),
    /** DeliveryDecision: 'deliver' | 'suppress_*' — honest, inspectable. */
    decision: text('decision').notNull(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index('notification_log_created_idx').on(t.createdAt),
    index('notification_log_channel_idx').on(t.channel, t.createdAt),
  ],
)

/** Mind-map diagrams: nodes and edges with hierarchical and radial coordinates. */
export const mindmaps = table('mindmaps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  nodesJson: text('nodes_json').notNull(),
  edgesJson: text('edges_json').notNull().default('[]'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** Append-only storage for handwriting / sketch attempts during review. */
export const cardAttemptImages = table(
  'card_attempt_images',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id),
    reviewId: integer('review_id'),
    imageData: text('image_data').notNull(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('card_attempt_images_card_id_idx').on(t.cardId)],
)

/** Solo boss encounters whose progress and damage derive from revlog. */
export const bossBattles = table('boss_battles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  bossKey: text('boss_key').notNull(),
  bossName: text('boss_name').notNull(),
  maxHp: integer('max_hp').notNull(),
  currentHp: integer('current_hp').notNull(),
  playerHp: integer('player_hp').notNull().default(100),
  status: text('status').notNull().default('active'), // active | victory | defeat
  startedAt: text('started_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  endedAt: text('ended_at'),
  revlogStartId: integer('revlog_start_id').notNull(),
})

/** Decentralized friend connections via public Gists. */
export const friends = table(
  'friends',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    alias: text('alias').notNull(),
    gistUrl: text('gist_url').notNull(),
    lastSyncedAt: text('last_synced_at'),
    lastDataJson: text('last_data_json'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex('friends_gist_url_idx').on(t.gistUrl)],
)

// ─── Online Engagement & Cloudflare Worker (M10) ────────────────────────────

export const onlineServers = table('online_servers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** Device-local identity table — stripped from sync/backup export for privacy. */
export const onlineIdentity = table('online_identity', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mode: text('mode').$type<'device_key' | 'magic_link' | 'offline'>().notNull().default('offline'),
  userId: text('user_id').notNull(),
  alias: text('alias').notNull().default('Learner'),
  pubKey: text('pub_key'),
  privKey: text('priv_key'),
  registeredAt: text('registered_at'),
})

export const onlinePrefs = table('online_prefs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  showOnLeaderboard: integer('show_on_leaderboard', { mode: 'boolean' }).notNull().default(true),
  allowBuddyRequests: integer('allow_buddy_requests', { mode: 'boolean' }).notNull().default(true),
  sharePresence: integer('share_presence', { mode: 'boolean' }).notNull().default(true),
  activeRoomCode: text('active_room_code'),
})

/** Append-only inbox for received nudges, invites, or system announcements. */
export const onlineInbox = table(
  'online_inbox',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind').$type<'nudge' | 'invite' | 'achievement'>().notNull(),
    senderAlias: text('sender_alias').notNull(),
    content: text('content').notNull(),
    meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>(),
    read: integer('read', { mode: 'boolean' }).notNull().default(false),
    receivedAt: text('received_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('online_inbox_received_idx').on(t.receivedAt)],
)

// ─── Audio & Voice Commute Mode (M11) ───────────────────────────────────────

export const audioSessions = table('audio_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deckId: integer('deck_id'),
  mode: text('mode')
    .$type<'handsfree_review' | 'audio_digest'>()
    .notNull()
    .default('handsfree_review'),
  cardCount: integer('card_count').notNull().default(0),
  durationSeconds: integer('duration_seconds').notNull().default(0),
  speechEngine: text('speech_engine').notNull().default('webspeech'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// ─── Desktop & Mobile Power Tools (M12) ───────────────────────────────────────

export const quickCaptures = table(
  'quick_captures',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    text: text('text').notNull(),
    sourceUrl: text('source_url'),
    sourceTitle: text('source_title'),
    tags: text('tags', { mode: 'json' }).$type<string[]>(),
    processed: integer('processed', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('quick_captures_processed_idx').on(t.processed)],
)

export const cardEmbeddings = table(
  'card_embeddings',
  {
    cardId: integer('card_id')
      .primaryKey()
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    embedding: text('embedding', { mode: 'json' }).$type<number[]>().notNull(),
    model: text('model').notNull().default('all-MiniLM-L6-v2'),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('card_embeddings_model_idx').on(t.model)],
)

/**
 * Omniverse embeddings (migration 019): one vector per (kind, refId) across
 * every knowledge surface — notes, cards, lessons, highlights, journal, ideas…
 * Vectors are produced on-device (MiniLM via transformers.js) and never leave
 * the machine; the table is a cache, safe to rebuild at any time.
 */
export const embeddings = table(
  'embeddings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind').notNull(),
    refId: integer('ref_id').notNull(),
    dim: integer('dim').notNull(),
    vector: text('vector', { mode: 'json' }).$type<number[]>().notNull(),
    model: text('model').notNull().default('all-MiniLM-L6-v2'),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex('embeddings_kind_ref_idx').on(t.kind, t.refId),
    index('embeddings_kind_model_idx').on(t.kind, t.model),
  ],
)

// ─── Adaptive Knowledge Graph & Anki Sync (M13) ──────────────────────────────

export const conceptDependencies = table(
  'concept_dependencies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceConcept: text('source_concept').notNull(),
    targetConcept: text('target_concept').notNull(),
    strength: real('strength').notNull().default(1.0),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index('concept_dep_source_idx').on(t.sourceConcept),
    index('concept_dep_target_idx').on(t.targetConcept),
  ],
)

export const ankiSyncMappings = table(
  'anki_sync_mappings',
  {
    cardId: integer('card_id')
      .primaryKey()
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    ankiNoteId: integer('anki_note_id').notNull(),
    ankiCardId: integer('anki_card_id'),
    syncMode: text('sync_mode')
      .$type<'live_loopback' | 'apkg_export' | 'mirror_readonly'>()
      .notNull()
      .default('live_loopback'),
    lastSyncAt: text('last_sync_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('anki_mappings_note_idx').on(t.ankiNoteId)],
)

// ─── Multiplayer Guilds, 1v1 Duels & Seasonal Progression (M14) ─────────────

export const guilds = table(
  'guilds',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    tag: text('tag').notNull(),
    description: text('description'),
    totalXp: integer('total_xp').notNull().default(0),
    level: integer('level').notNull().default(1),
    avatarEmoji: text('avatar_emoji').notNull().default('🛡️'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('guilds_total_xp_idx').on(t.totalXp)],
)

export const guildMembers = table(
  'guild_members',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    guildId: integer('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    role: text('role').$type<'leader' | 'officer' | 'member'>().notNull().default('member'),
    xpContributed: integer('xp_contributed').notNull().default(0),
    joinedAt: text('joined_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index('guild_members_guild_idx').on(t.guildId),
    index('guild_members_alias_idx').on(t.alias),
  ],
)

export const seasonalProgress = table(
  'seasonal_progress',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    seasonId: text('season_id').notNull().default('season-1'),
    seasonXp: integer('season_xp').notNull().default(0),
    tier: integer('tier').notNull().default(0),
    claimedRewards: text('claimed_rewards', { mode: 'json' }).$type<number[]>().default([]),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('seasonal_progress_season_idx').on(t.seasonId)],
)

export const reviewDuels = table(
  'review_duels',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    player1Alias: text('player1_alias').notNull(),
    player2Alias: text('player2_alias').notNull(),
    winnerAlias: text('winner_alias'),
    player1Score: integer('player1_score').notNull().default(0),
    player2Score: integer('player2_score').notNull().default(0),
    completedAt: text('completed_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('review_duels_completed_idx').on(t.completedAt)],
)

// ─── 3D Low-Poly World & Verified Study Coin Economy (M16) ────────────────

export const userAvatars = table(
  'user_avatars',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull().default('default').unique(),
    characterId: text('character_id').notNull().default('char_apprentice'),
    equippedHead: text('equipped_head'),
    equippedHand: text('equipped_hand'),
    equippedCompanion: text('equipped_companion'),
    equippedSkin: text('equipped_skin').notNull().default('default'),
    unlockedCharacters: text('unlocked_characters', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(['char_apprentice']),
    unlockedItems: text('unlocked_items', { mode: 'json' }).$type<string[]>().notNull().default([]),
    unlockedTrees: text('unlocked_trees', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(['tree_oak', 'tree_pine']),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('user_avatars_user_idx').on(t.userId)],
)

export const forestPlots = table(
  'forest_plots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull().default('default'),
    treeType: text('tree_type').notNull().default('tree_oak'),
    growthStage: text('growth_stage').notNull().default('mature'),
    posX: real('pos_x').notNull().default(0),
    posY: real('pos_y').notNull().default(0),
    posZ: real('pos_z').notNull().default(0),
    focusSessionId: text('focus_session_id'),
    durationMinutes: integer('duration_minutes').notNull().default(25),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index('forest_plots_user_idx').on(t.userId),
    index('forest_plots_created_idx').on(t.createdAt),
  ],
)

export const studyCoinLedger = table(
  'study_coin_ledger',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull().default('default'),
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    reason: text('reason').notNull(),
    referenceId: text('reference_id'),
    signature: text('signature').notNull(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index('study_coin_ledger_user_idx').on(t.userId),
    index('study_coin_ledger_created_idx').on(t.createdAt),
  ],
)

/**
 * Review Arena sessions — the server-issued run identity. GET /api/arena
 * inserts one row bound to the exact queue it dealt; the settlement POST
 * references it by id, and the status machine (open → settling → settled)
 * makes reward settlement exactly-once even under retries and concurrent
 * duplicates. `gradeLog`/`settlementJson` let an identical replay return the
 * stored response while an altered log on a settled run is rejected.
 */
export const arenaSessions = table(
  'arena_sessions',
  {
    id: text('id').primaryKey(), // server-issued uuid
    userId: text('user_id').notNull().default('default'),
    deckIds: text('deck_ids', { mode: 'json' }).$type<number[]>().notNull(),
    cardIds: text('card_ids', { mode: 'json' }).$type<number[]>().notNull(),
    archetype: text('archetype').notNull().default('warden'),
    boss: integer('boss', { mode: 'boolean' }).notNull().default(false),
    /** Daily modifier the run was issued under (null: none / pre-modifier run). */
    modifier: text('modifier'),
    /** Set when this run is a weak-card drill of an earlier settled run. */
    drillOfRunId: text('drill_of_run_id'),
    status: text('status').notNull().default('open'), // 'open' | 'settling' | 'settled'
    /**
     * Fencing token: increments on every settlement claim. The settlement
     * transaction commits its status flip with WHERE settleAttempt = the
     * claimant's token, so the original claimant of a stale-then-reclaimed
     * run can never commit over the new owner.
     */
    settleAttempt: integer('settle_attempt').notNull().default(0),
    gradeLog: text('grade_log', { mode: 'json' }).$type<unknown[]>(),
    settlementJson: text('settlement_json', { mode: 'json' }).$type<Record<string, unknown>>(),
    settlingStartedAt: text('settling_started_at'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    settledAt: text('settled_at'),
  },
  (t) => [
    index('arena_sessions_user_idx').on(t.userId),
    index('arena_sessions_status_idx').on(t.status),
  ],
)

/**
 * Review Arena run history — one row per settled session. `referenceId` is
 * the settlement idempotency key (FNV-1a over the grade log, shared with the
 * coin ledger), so a replayed settlement can never double-record a run.
 */
export const arenaRuns = table(
  'arena_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull().default('default'),
    deckIds: text('deck_ids', { mode: 'json' }).$type<number[]>().notNull(),
    result: text('result').notNull(), // 'victory' | 'defeat'
    archetype: text('archetype').notNull().default('warden'),
    boss: integer('boss', { mode: 'boolean' }).notNull().default(false),
    rounds: integer('rounds').notNull(),
    correct: integer('correct').notNull(),
    accuracy: real('accuracy').notNull(),
    bestCombo: integer('best_combo').notNull(),
    crits: integer('crits').notNull(),
    score: integer('score').notNull(),
    coins: integer('coins').notNull(),
    xp: integer('xp').notNull(),
    durationMs: integer('duration_ms').notNull().default(0),
    referenceId: text('reference_id').notNull().unique(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index('arena_runs_user_idx').on(t.userId),
    index('arena_runs_created_idx').on(t.createdAt),
  ],
)

export const marketItems = table(
  'market_items',
  {
    id: text('id').primaryKey(),
    category: text('category').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    priceCoins: integer('price_coins').notNull(),
    rarity: text('rarity').notNull().default('common'),
    previewProps: text('preview_props', { mode: 'json' }).$type<Record<string, unknown>>(),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('market_items_category_idx').on(t.category)],
)

export const userWorldSettings = table('user_world_settings', {
  userId: text('user_id').primaryKey(),
  viewMode: text('view_mode').notNull().default('hybrid'),
  timerTheme: text('timer_theme').notNull().default('tree'),
  integrationMode: text('integration_mode').notNull().default('dedicated'),
  soundscape: text('soundscape').notNull().default('none'),
  lowPolyQuality: text('low_poly_quality').notNull().default('high'),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/**
 * Multi-device sync registry (M19). One row per device that has synced against
 * the shared cloud target. Device identity lives client-side — a stable UUID
 * in localStorage that never travels with the DB — so rows merge cleanly:
 * each device's snapshot carries its own row, and after a merge every device
 * sees the full roster of who shares its sync target.
 */
export const syncDevices = table(
  'sync_devices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Stable client-generated UUID; the join key across snapshots. */
    deviceId: text('device_id').notNull(),
    /** Human label shown on other devices ("Desk PC", "Phone"). */
    name: text('name').notNull(),
    /** Client-declared platform hint ('web' | 'windows' | 'android'); advisory. */
    platform: text('platform'),
    lastPushAt: text('last_push_at'),
    lastPullAt: text('last_pull_at'),
    lastRevision: text('last_revision'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex('sync_devices_device_idx').on(t.deviceId)],
)

// ─── Ultimate Cognitive Expansion (Phases 1–5) ─────────────────────────────

export const circadianAudioSessions = table(
  'circadian_audio_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionMode: text('session_mode').notNull(), // 'commute' | 'sleep_tmr' | 'wind_down'
    deckId: integer('deck_id').references(() => decks.id, { onDelete: 'set null' }),
    cardsReviewed: integer('cards_reviewed').notNull().default(0),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    binauralMode: text('binaural_mode').$type<BinauralMode>(),
    handsFreeInputs: text('hands_free_inputs', { mode: 'json' }).$type<HandsFreeGradeEvent[]>(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index('circadian_audio_sessions_mode_idx').on(t.sessionMode),
    index('circadian_audio_sessions_created_idx').on(t.createdAt),
  ],
)

export const tmrCues = table(
  'tmr_cues',
  {
    cardId: integer('card_id')
      .primaryKey()
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    earconSignature: text('earcon_signature', { mode: 'json' }).$type<TmrEarcon>().notNull(),
    timesCuedAwake: integer('times_cued_awake').notNull().default(0),
    timesCuedSleep: integer('times_cued_sleep').notNull().default(0),
    lastSleepCueAt: text('last_sleep_cue_at'),
    overnightGainScore: real('overnight_gain_score'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('tmr_cues_card_idx').on(t.cardId)],
)

export const conceptDagNodes = table(
  'concept_dag_nodes',
  {
    id: text('id').primaryKey(),
    courseId: integer('course_id').references(() => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    masteryProb: real('mastery_prob').notNull().default(0.1),
    slipProb: real('slip_prob').notNull().default(0.1),
    guessProb: real('guess_prob').notNull().default(0.2),
    transitProb: real('transit_prob').notNull().default(0.15),
    lastAssessedAt: text('last_assessed_at'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('concept_dag_nodes_course_idx').on(t.courseId)],
)

export const conceptDagEdges = table(
  'concept_dag_edges',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    prerequisiteId: text('prerequisite_id')
      .notNull()
      .references(() => conceptDagNodes.id, { onDelete: 'cascade' }),
    dependentId: text('dependent_id')
      .notNull()
      .references(() => conceptDagNodes.id, { onDelete: 'cascade' }),
    weight: real('weight').notNull().default(1.0),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index('concept_dag_edges_prereq_idx').on(t.prerequisiteId),
    index('concept_dag_edges_dep_idx').on(t.dependentId),
    uniqueIndex('concept_dag_edges_pair_idx').on(t.prerequisiteId, t.dependentId),
  ],
)

export const cognitiveTelemetryEvents = table(
  'cognitive_telemetry_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cardId: integer('card_id').references(() => cards.id, { onDelete: 'cascade' }),
    responseLatencyMs: integer('response_latency_ms').notNull(),
    hesitationVariance: real('hesitation_variance'),
    editChurnCount: integer('edit_churn_count').notNull().default(0),
    estimatedCli: real('estimated_cli').notNull(),
    flowZone: text('flow_zone').notNull(), // 'underload' | 'optimal_flow' | 'overload'
    interventionApplied: text('intervention_applied'), // 'none' | 'scaffold_hint' | 'worked_example' | 'format_stepdown'
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index('cognitive_telemetry_card_idx').on(t.cardId),
    index('cognitive_telemetry_created_idx').on(t.createdAt),
  ],
)

export const palace3dScenes = table(
  'palace_3d_scenes',
  {
    palaceId: integer('palace_id')
      .primaryKey()
      .notNull()
      .references(() => palaces.id, { onDelete: 'cascade' }),
    environmentArchetype: text('environment_archetype').notNull().default('roman_villa'),
    cameraStartPos: text('camera_start_pos', { mode: 'json' }).$type<{
      x: number
      y: number
      z: number
      pitch: number
      yaw: number
    }>(),
    walkPath: text('walk_path', { mode: 'json' }).$type<Array<[number, number, number]>>(),
    spatialLoci: text('spatial_loci', { mode: 'json' })
      .$type<SpatialLocus[]>()
      .notNull()
      .default([]),
    audioPanningEnabled: integer('audio_panning_enabled', { mode: 'boolean' })
      .notNull()
      .default(true),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('palace_3d_scenes_palace_idx').on(t.palaceId)],
)

export const dialecticArenaDebates = table(
  'dialectic_arena_debates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    topic: text('topic').notNull(),
    thesisAgentRole: text('thesis_agent_role').notNull(),
    antithesisAgentRole: text('antithesis_agent_role').notNull(),
    transcript: text('transcript', { mode: 'json' }).$type<DebateTurn[]>().notNull().default([]),
    learnerVerdict: text('learner_verdict'),
    learnerScore: integer('learner_score'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('dialectic_arena_debates_created_idx').on(t.createdAt)],
)

/**
 * Ambient exposure ledger: records incidental encounters of vocabulary and technical
 * terms during reading, notes, and lessons for Krashen i+1 tracking and spaced promotion.
 * Append-only table (Rule 8).
 */
export const exposureEvents = table(
  'exposure_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    token: text('token').notNull(),
    normalized: text('normalized').notNull(),
    sourceType: text('source_type')
      .$type<'reading' | 'note' | 'lesson'>()
      .notNull()
      .default('reading'),
    sourceId: integer('source_id'),
    contextSnippet: text('context_snippet'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index('exposure_events_normalized_idx').on(t.normalized),
    index('exposure_events_created_idx').on(t.createdAt),
  ],
)

/**
 * Append-only ledger of completed Prototype & Exemplar categorization
 * sessions (one row per finished evaluate round-trip). A session is a
 * COMPLETED event — there is no resume and no update path: "start new" is the
 * only forward action, so the history feed stays an honest record of what the
 * learner actually did (AGENTS.md rule 8, like `revlog`/`xp_events`).
 *
 * - `trials_json`: the raw submission (typicality ratings + classifications).
 * - `metrics_json`: the engine's evaluation telemetry (TSC/CTS/MCD/CRI, model
 *   comparison, maturity band) — re-readable without re-running the fit.
 * - `accuracy`: overall classification accuracy (0-100), hoisted as a real
 *   column so day-bucket stats need no JSON parsing.
 */
export const prototypeExemplarSessions = table(
  'prototype_exemplar_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Canonical category set id (e.g. 'proto-bird-typicality'). */
    setId: text('set_id').notNull(),
    /** Lifecycle phase — always 'complete' today; future phases extend, never mutate. */
    phase: text('phase').notNull().default('complete'),
    /** The submitted ratings/classifications, JSON-encoded. */
    trialsJson: text('trials_json').notNull().default('[]'),
    /** The evaluation telemetry (CategorizationEvaluation), JSON-encoded. */
    metricsJson: text('metrics_json').notNull().default('{}'),
    /** Overall classification accuracy 0-100 (denormalized from metrics). */
    accuracy: real('accuracy').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('prototype_exemplar_sessions_created_idx').on(t.createdAt)],
)

/** ─── SP parity: task system (S3-01 batch A; Super Productivity model) ─── */

/** SP-parity task projects (S3-05 core): backlog flag, notes, color, archive. */
export const taskProjects = table('task_projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  notes: text('notes'),
  backlogFlag: integer('backlog_flag', { mode: 'boolean' }).notNull().default(false),
  color: text('color'),
  archivedAt: text('archived_at'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** SP-parity tags (S3-06): unique name + color; items link via task_item_tags. */
export const taskTags = table('task_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  color: text('color'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** SP repeat config (S3-07): cycle d|w|m|y, interval, start/end, skip dates, re-anchor. */
export const taskRepeatCfgs = table('task_repeat_cfgs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cycle: text('cycle').notNull(), // 'd' | 'w' | 'm' | 'y'
  interval: integer('interval').notNull().default(1),
  startDate: text('start_date'),
  endDate: text('end_date'),
  skipDates: text('skip_dates', { mode: 'json' }).$type<string[]>().notNull().default([]),
  reAnchor: text('re_anchor').notNull().default('completion'), // 'completion' | 'scheduled' | 'postponed'
  /** Optional UI title for the rule (SP generates these; user may rename). */
  title: text('title'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/**
 * SP-parity task item (S3-03): one nesting level via parent_id; per-day time
 * map; won't-do state; order = list ordinal (habits.'order' house style).
 */
export const taskItems = table('task_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  parentId: integer('parent_id'), // one nesting level (SP subtasks)
  projectId: integer('project_id'),
  title: text('title').notNull(),
  notes: text('notes'),
  priority: text('priority').notNull().default('none'), // 'none' | 'low' | 'medium' | 'high'
  estimateMs: integer('estimate_ms'),
  timeSpentOnDay: text('time_spent_on_day', { mode: 'json' })
    .$type<Record<string, number>>()
    .notNull()
    .default({}), // date (YYYY-MM-DD) → ms tracked that day
  due: text('due'), // YYYY-MM-DD, or full ISO when dueWithTime
  dueWithTime: integer('due_with_time', { mode: 'boolean' }).notNull().default(false),
  deadline: text('deadline'),
  isDone: integer('is_done', { mode: 'boolean' }).notNull().default(false),
  doneAt: text('done_at'),
  wonthado: integer('wonthado', { mode: 'boolean' }).notNull().default(false), // SP "won't do"
  repeatCfgId: integer('repeat_cfg_id'),
  /** S3-20: owning section header row within the list (null = unsectioned). */
  sectionId: integer('section_id'),
  order: integer('order').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** task_items ↔ task_tags many-to-many (composite PK covers item→tags). */
export const taskItemTags = table(
  'task_item_tags',
  {
    itemId: integer('item_id').notNull(),
    tagId: integer('tag_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.tagId] })],
)

/** SP per-task reminders (S3-08); exact_alarm flags the Android exact-alarm path. */
export const taskReminders = table('task_reminders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull(),
  remindAt: text('remind_at').notNull(),
  /** S3-08: relative-reminder offset from the due moment, in ms (at_time: null). */
  offsetMs: integer('offset_ms'),
  type: text('type').notNull().default('at_time'), // 'at_time' | 'relative'
  exactAlarm: integer('exact_alarm', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** ─── SP parity: task system batch B (S3-02; time logs, sections, views) ── */

/** SP time logs (S3-10): one row per tracked session per task per day. */
export const taskTimeLogs = table('task_time_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull(),
  day: text('day').notNull(), // YYYY-MM-DD
  sessionMs: integer('session_ms').notNull(),
  startedAt: text('started_at'),
  source: text('source').notNull().default('manual'), // 'manual' | 'focus' | 'idle'
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** SP task list sections (S3-02): ordered groupings inside a task list. */
export const taskSections = table('task_sections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** SP task attachments (S3-37): files, URLs and shell commands. */
export const taskAttachments = table('task_attachments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull(),
  type: text('type').notNull(), // 'file' | 'url' | 'command'
  value: text('value').notNull(),
  title: text('title'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** SP archive tiers (S3-11): young → old auto-archive state per archived task. */
export const taskArchiveTiers = table('task_archive_tiers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().unique(),
  tier: text('tier').notNull().default('young'), // 'young' | 'old'
  archivedAt: text('archived_at').notNull(),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** SP simple counters (S3-31): free-floating habit counters (habits kept). */
export const simpleCounters = table('simple_counters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull(),
  color: text('color'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** Daily counter taps (S3-90 streaks read these; unique per counter+day). */
export const simpleCounterLogs = table(
  'simple_counter_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    counterId: integer('counter_id').notNull(),
    day: text('day').notNull(), // YYYY-MM-DD
    count: integer('count').notNull().default(1),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex('simple_counter_logs_day_uniq').on(t.counterId, t.day)],
)

/** SP metric days (S3-30/S3-50): one row per day — metrics map + evaluation sheet. */
export const metricDays = table('metric_days', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  day: text('day').notNull().unique(), // YYYY-MM-DD
  metrics: text('metrics', { mode: 'json' }).$type<Record<string, number>>().notNull().default({}), // metric key → ms/count that day
  impact: integer('impact'), // 1–4 (evaluation sheet, S3-50)
  energy: integer('energy'), // 1–3 (evaluation sheet, S3-50)
  reflection: text('reflection'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** SP saved views / boards (S3-24/S3-44): built-ins are seeded, these are user views. */
export const taskViews = table('task_views', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('custom'), // 'kanban' | 'eisenhower' | 'custom'
  filter: text('filter', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}), // rule chips
  sortBy: text('sort_by'),
  groupBy: text('group_by'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})
