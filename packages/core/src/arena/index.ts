/**
 * @learning-hub/core/arena — Review Arena engine.
 *
 * A game-feedback layer over spaced retrieval practice. The learning
 * mechanism stays the testing effect: every arena challenge IS a real review
 * card, and grading still flows through the real SRS scheduler (the web route
 * posts to /api/review unchanged). This engine never touches scheduling — it
 * maps the learner's self-graded outcome onto strike/guard combat feedback
 * against the session guardian, so a review session plays as a short arcade
 * round without forking any study logic.
 *
 * Determinism: all math is pure and integer-based (no Math.random, no Date),
 * so sessions replay exactly from their grade log and tests are stable.
 */
import { z } from 'zod'

// ─── Shared scalars ─────────────────────────────────────────────────────────

/** SRS grades, identical to the review route's union. */
export const arenaGradeSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
export type ArenaGrade = z.infer<typeof arenaGradeSchema>

/** 0 = guessed, 1 = knew it (same convention as the review route). */
export const arenaConfidenceSchema = z.union([z.literal(0), z.literal(1)])
export type ArenaConfidence = z.infer<typeof arenaConfidenceSchema>

// ─── Configuration ──────────────────────────────────────────────────────────

export const arenaConfigSchema = z.object({
  /** Guardian hit points; reaching 0 before the queue ends means defeat. */
  maxHp: z.number().int().min(10).max(1000),
  /** Shield absorbs guardian counterattacks before HP does. */
  maxShield: z.number().int().min(0).max(100),
  /** Fast+confident correct answers at or under this many ms crit. */
  critTimeMs: z.number().int().min(500).max(60_000),
  /** Base strike damage for a clean correct answer. */
  baseDamage: z.number().int().min(1).max(100),
  /** Counterattack damage when the learner grades "again". */
  againCounter: z.number().int().min(1).max(100),
  /** Chip counterattack damage when the learner grades "hard". */
  hardCounter: z.number().int().min(0).max(100),
  /** Combo multiplier step: damage grows by this fraction per combo point. */
  comboStepPercent: z.number().int().min(0).max(50),
  /** Combo length at which each correct answer also repairs 1 shield. */
  shieldRepairCombo: z.number().int().min(2).max(20),
})
export type ArenaConfig = z.infer<typeof arenaConfigSchema>

export const ARENA_DEFAULTS: ArenaConfig = {
  maxHp: 60,
  maxShield: 3,
  critTimeMs: 4_000,
  baseDamage: 10,
  againCounter: 12,
  hardCounter: 4,
  comboStepPercent: 10,
  shieldRepairCombo: 3,
}

export function arenaConfig(overrides: Partial<ArenaConfig> = {}): ArenaConfig {
  return arenaConfigSchema.parse({ ...ARENA_DEFAULTS, ...overrides })
}

// ─── Challenges ─────────────────────────────────────────────────────────────

export const arenaChallengeSchema = z.object({
  cardId: z.number().int().positive(),
  prompt: z.string().min(1),
  answer: z.string().min(1),
  deckName: z.string().optional(),
})
export type ArenaChallenge = z.infer<typeof arenaChallengeSchema>

// ─── Session state ──────────────────────────────────────────────────────────

export type ArenaStatus = 'fighting' | 'victory' | 'defeat'

export interface ArenaExchange {
  cardId: number
  grade: ArenaGrade
  confidence: ArenaConfidence
  timeMs: number
  /** Damage dealt to the guardian this exchange. */
  damage: number
  /** True when the strike was a critical (fast + confident + correct). */
  crit: boolean
  /** Counterattack damage taken from the guardian (after shield absorb). */
  counterTaken: number
  /** Counterattack damage soaked by the shield. */
  counterShielded: number
  /** Combo after this exchange. */
  comboAfter: number
  /** Score gained this exchange. */
  scoreDelta: number
}

export interface ArenaState {
  status: ArenaStatus
  /** Guardian HP remaining (the guardian is the queue; 0 = victory). */
  guardianHp: number
  guardianMaxHp: number
  /** Learner HP; 0 = defeat. */
  hp: number
  maxHp: number
  shield: number
  maxShield: number
  combo: number
  bestCombo: number
  /** Index of the next challenge (== exchanges.length while fighting). */
  round: number
  score: number
  exchanges: ArenaExchange[]
  /** Challenges left to fight (the arena never mutates the queue itself). */
  remaining: number
}

// ─── Strike math ────────────────────────────────────────────────────────────

export interface Strike {
  damage: number
  crit: boolean
  counter: number
  shieldRepair: number
  scoreDelta: number
  comboDelta: number
}

/**
 * Map a self-grade onto combat feedback.
 *
 * - easy/good: a clean strike; combo multiplies damage; fast + confident
 *   strikes crit for +50%.
 * - hard: a glancing strike (half damage, rounded down) and a chip
 *   counterattack; combo holds but does not grow.
 * - again: no strike; the guardian lands its counter and the combo breaks.
 *
 * "Guessed" (confidence 0) halves strike damage and can never crit: honest
 * self-reporting costs less than pretending to know.
 */
export function strikeFor(
  grade: ArenaGrade,
  confidence: ArenaConfidence,
  timeMs: number,
  combo: number,
  config: ArenaConfig = ARENA_DEFAULTS,
): Strike {
  if (grade === 1) {
    return {
      damage: 0,
      crit: false,
      counter: config.againCounter,
      shieldRepair: 0,
      scoreDelta: 0,
      comboDelta: -combo,
    }
  }

  const comboMultiplier = 1 + (combo * config.comboStepPercent) / 100
  let damage = config.baseDamage
  let counter = 0
  if (grade === 2) {
    damage = Math.floor(config.baseDamage / 2)
    counter = config.hardCounter
  }

  const crit = grade >= 3 && confidence === 1 && timeMs <= config.critTimeMs
  if (confidence === 0) damage = Math.floor(damage / 2)
  damage = Math.floor(damage * comboMultiplier)
  if (crit) damage = Math.floor(damage * 1.5)

  const shieldRepair = grade >= 3 && combo + 1 >= config.shieldRepairCombo ? 1 : 0
  const scoreDelta = damage * 10 + (crit ? 50 : 0) + (grade === 2 ? 10 : 0)

  return { damage, crit, counter, shieldRepair, scoreDelta, comboDelta: grade === 2 ? 0 : 1 }
}

// ─── Session lifecycle ──────────────────────────────────────────────────────

export function createArenaSession(
  challenges: ArenaChallenge[],
  config: ArenaConfig = ARENA_DEFAULTS,
): ArenaState {
  const guardianMaxHp = challenges.length * config.baseDamage
  return {
    status: challenges.length === 0 ? 'victory' : 'fighting',
    guardianHp: guardianMaxHp,
    guardianMaxHp,
    hp: config.maxHp,
    maxHp: config.maxHp,
    shield: Math.min(1, config.maxShield),
    maxShield: config.maxShield,
    combo: 0,
    bestCombo: 0,
    round: 0,
    score: 0,
    exchanges: [],
    remaining: challenges.length,
  }
}

/**
 * Apply one graded challenge. Pure: returns a new state. The caller is
 * responsible for ALSO posting the grade to the real review scheduler — this
 * function only computes combat feedback.
 */
export function applyGrade(
  state: ArenaState,
  challenge: ArenaChallenge,
  grade: ArenaGrade,
  confidence: ArenaConfidence,
  timeMs: number,
  config: ArenaConfig = ARENA_DEFAULTS,
): ArenaState {
  if (state.status !== 'fighting') return state

  const strike = strikeFor(grade, confidence, Math.max(0, Math.round(timeMs)), state.combo, config)

  const counterShielded = Math.min(state.shield, strike.counter)
  const counterTaken = strike.counter - counterShielded
  const shield = Math.max(
    0,
    Math.min(state.maxShield, state.shield - counterShielded + strike.shieldRepair),
  )
  const hp = Math.max(0, state.hp - counterTaken)
  const guardianHp = Math.max(0, state.guardianHp - strike.damage)
  const combo = Math.max(0, state.combo + strike.comboDelta)

  const exchange: ArenaExchange = {
    cardId: challenge.cardId,
    grade,
    confidence,
    timeMs: Math.max(0, Math.round(timeMs)),
    damage: strike.damage,
    crit: strike.crit,
    counterTaken,
    counterShielded,
    comboAfter: combo,
    scoreDelta: strike.scoreDelta,
  }

  const remaining = state.remaining - 1
  // Victory requires clearing the whole queue: every card in the session is
  // always reviewed (guardian HP is a progress bar, never an early exit).
  // Defeat cuts the session short when the learner's HP runs out.
  const status: ArenaStatus = remaining <= 0 ? 'victory' : hp <= 0 ? 'defeat' : 'fighting'

  return {
    ...state,
    status,
    guardianHp,
    hp,
    shield,
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    round: state.round + 1,
    score: state.score + strike.scoreDelta,
    exchanges: [...state.exchanges, exchange],
    remaining,
  }
}

// ─── Summary and rewards ────────────────────────────────────────────────────

export interface ArenaSummary {
  result: 'victory' | 'defeat'
  rounds: number
  correct: number
  accuracy: number
  bestCombo: number
  crits: number
  score: number
  /** Coin suggestion for the world economy (integer, capped). */
  coins: number
  /** XP suggestion following the app's small-award convention. */
  xp: number
}

/**
 * Rewards are deliberately modest and accrue to correct retrieval, never to
 * speed alone: coins = correct answers + victory bonus + best-combo bonus,
 * capped so a session can't out-earn its length.
 */
export function buildArenaSummary(state: ArenaState): ArenaSummary {
  const correct = state.exchanges.filter((e) => e.grade >= 3).length
  const crits = state.exchanges.filter((e) => e.crit).length
  const rounds = state.exchanges.length
  const accuracy = rounds === 0 ? 0 : correct / rounds
  const victory = state.status === 'victory'
  const coins = Math.min(
    correct + (victory ? 5 : 0) + Math.floor(state.bestCombo / 2),
    Math.max(1, rounds) + 8,
  )
  const xp = correct * 5 + (victory ? 15 : 0)
  return {
    result: victory ? 'victory' : 'defeat',
    rounds,
    correct,
    accuracy,
    bestCombo: state.bestCombo,
    crits,
    score: state.score,
    coins,
    xp,
  }
}

// ─── API payloads ───────────────────────────────────────────────────────────

/** Client → server: one arena grade event (mirrors the review grade body). */
export const arenaGradeEventSchema = z.object({
  cardId: z.number().int().positive(),
  grade: arenaGradeSchema,
  confidence: arenaConfidenceSchema,
  timeMs: z.number().min(0).max(600_000),
})
export type ArenaGradeEvent = z.infer<typeof arenaGradeEventSchema>

/** Client → server: finished session, for reward settlement + telemetry. */
export const arenaSettlementSchema = z.object({
  deckIds: z.array(z.number().int().positive()).min(1),
  exchanges: z.array(arenaGradeEventSchema).min(1).max(200),
  bestCombo: z.number().int().min(0),
  result: z.enum(['victory', 'defeat']),
})
export type ArenaSettlement = z.infer<typeof arenaSettlementSchema>

/** Recompute the summary server-side from the raw grade log (never trust the client's score). */
export function summarizeGradeLog(
  exchanges: ArenaGradeEvent[],
  config: ArenaConfig = ARENA_DEFAULTS,
): ArenaSummary {
  let state = createArenaSession(
    exchanges.map((e) => ({ cardId: e.cardId, prompt: 'x', answer: 'x' })),
    config,
  )
  for (const e of exchanges) {
    state = applyGrade(
      state,
      { cardId: e.cardId, prompt: 'x', answer: 'x' },
      e.grade,
      e.confidence,
      e.timeMs,
      config,
    )
  }
  return buildArenaSummary(state)
}
