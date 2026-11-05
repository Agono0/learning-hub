/**
 * Learning HUB — shared domain types.
 * This file is the CONTRACT between all subsystems. Change deliberately.
 */

import type { Exercise } from './practice/schema'

// ─── Card content (stored as JSON in cards.content) ────────────────────────

export type CardFormat =
  | 'basic' // Q&A
  | 'cloze' // fill-in-the-blank (basic | typein | enumeration variants)
  | 'mcq' // stepwise multiple choice: question first, options revealed after commit
  | 'typein' // type the answer — max retrieval effort
  | 'occlusion' // image occlusion: normalized 0-1 rects over an image
  | 'proof_step' // math: "which lemma justifies step k" / fill-in-proof-step
  | 'grammar' // language: example-sentence cloze of a grammar pattern
  | 'matching' // pair-matching set (used by games; also schedulable)
  | 'exercise' // any practice-engine exercise (12 types) — see ./practice

/** Normalized 0-1 rectangle (image occlusion regions). */
export interface Rect {
  /** normalized 0-1 coordinates — resize-proof (Anki's model) */
  x: number
  y: number
  w: number
  h: number
}

/** Per-format card payload stored as JSON in `cards.content` (one key set). */
export type CardContent = {
  basic?: { front: string; back: string }
  cloze?: {
    text: string
    answers: string[]
    mode: 'basic' | 'typein' | 'enumeration'
    hint?: string
  }
  mcq?: { question: string; options: string[]; correctIndex: number; rationale?: string }
  typein?: { question: string; acceptedAnswers: string[] }
  occlusion?: { imageId: number; rects: (Rect & { id: string; label?: string })[] }
  proof_step?: {
    theorem: string
    proofSteps: string[]
    stepIndex: number
    justification: string
    sourceLemma?: string
  }
  grammar?: { sentence: string; pattern: string; target: string; translation?: string }
  matching?: { pairs: { left: string; right: string }[] }
  /** Practice-engine exercise; graded by gradeExercise, scheduled like any card. */
  exercise?: Exercise
}

// ─── Reviews ────────────────────────────────────────────────────────────────

/** ts-fsrs rating: Again=1 Hard=2 Good=3 Easy=4 */
export type Grade = 1 | 2 | 3 | 4
/** learner confidence per answer — powers the hypercorrection queue */
export type Confidence = 0 | 1 // 0 = unsure, 1 = sure

/** A single graded review as submitted by any client (web/mcp/cli). */
export interface ReviewInput {
  cardId: number
  grade: Grade
  confidence: Confidence
  timeMs: number
  reviewedAt: string // ISO
}

// ─── Knowledge tracing ─────────────────────────────────────────────────────

export interface BKTParams {
  pInit: number // P(L0) initial knowledge
  pTransit: number // P(T) learning transition
  pGuess: number // P(G) slip → lucky guess
  pSlip: number // P(S) knew → mistake
}

/** Khan-style mastery ladder label for a skill. */
export interface MasteryLevel {
  /** 0 Attempted → 1 Familiar → 2 Proficient → 3 Mastered (Khan-style) */
  level: 0 | 1 | 2 | 3
  label: 'attempted' | 'familiar' | 'proficient' | 'mastered'
}

// ─── Motivation ────────────────────────────────────────────────────────────

export type XPSource =
  | 'review'
  | 'lesson'
  | 'teachback'
  | 'quest'
  | 'focus'
  | 'habit'
  | 'achievement'
  | 'journal'
  | 'idea'

/** One daily quest with its progress toward the target. */
export interface QuestItem {
  type: 'reviews' | 'lesson' | 'focus' | 'habit' | 'journal'
  label: string
  target: number
  progress: number
  done: boolean
}

// ─── Focus / addiction ─────────────────────────────────────────────────────

export type FrictionTrigger = 'break_focus' | 'relapse' | 'distraction'

/** A completed friction-gate interaction (trigger, delay, outcome). */
export interface FrictionEvent {
  trigger: FrictionTrigger
  delaySec: number
  reflection?: string
  proceeded: boolean
}

// ─── Ideas ─────────────────────────────────────────────────────────────────

export type IdeaStage = 'seed' | 'growing' | 'validated' | 'project'

/** Semantic relation kinds between two ideas (or notes, via NoteLinkType). */
export type IdeaLinkType = 'related' | 'supports' | 'contradicts' | 'refines' | 'parent-of'

// ─── AI layer ──────────────────────────────────────────────────────────────

/**
 * Provider keys accepted by the AI registry. 'custom-endpoint' POSTs the AI
 * envelope to a user-configured URL (see docs/ai-providers.md); 'none' is the
 * default — every AI surface then shows its manual alternative.
 */
export type AIProvider =
  'anthropic' | 'openai' | 'openai-compatible' | 'ollama' | 'custom-endpoint' | 'none'

/** User-configured AI provider connection (Settings page). */
export interface AISettings {
  provider: AIProvider
  model: string
  baseUrl?: string
  apiKey?: string
  /** Extra HTTP headers for the request (custom-endpoint), e.g. {"Authorization":"Bearer …"}. */
  headers?: Record<string, string>
}

/** Standard shape every AI feature returns; Zod-validated at the boundary. */
export interface AIGenerationResult<T> {
  ok: boolean
  data?: T
  error?: string
}

// ─── Reading pipeline ──────────────────────────────────────────────────────

export type SourceKind = 'pdf' | 'article' | 'paste' | 'youtube'
/** Highlight triage state: 0 new, 1 kept, 2 discarded. */
export type HighlightTriage = 0 | 1 | 2

// ─── Notes ─────────────────────────────────────────────────────────────────

export type PARStatus = 'inbox' | 'project' | 'area' | 'resource' | 'archive'
/** Note link kinds: the idea relations plus 'prereq'. */
export type NoteLinkType = IdeaLinkType | 'prereq'

// ─── Misc ──────────────────────────────────────────────────────────────────

export const MASTERY_THRESHOLD = 0.95
/** Default FSRS desired retention when the user hasn't set one. */
export const DEFAULT_RETENTION = 0.9

/** Map pKnown + attempts to the Khan-style mastery ladder. */
export function masteryLevelFor(pKnown: number, attempts: number): MasteryLevel {
  if (pKnown >= 0.95 && attempts >= 5) return { level: 3, label: 'mastered' }
  if (pKnown >= 0.75) return { level: 2, label: 'proficient' }
  if (attempts > 0) return { level: 1, label: 'familiar' }
  return { level: 0, label: 'attempted' }
}
