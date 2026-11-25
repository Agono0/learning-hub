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
  /**
   * Flat damage blocked from every genuine strike (The Colossus's plating).
   * A strike can never be armored below 1 — 0 disables the mechanic.
   */
  strikeArmor: z.number().int().min(0).max(50),
  /**
   * The guardian dodges every Nth round's strike (The Shade's flicker),
   * halving its damage — 0 disables the mechanic. Round-indexed (not
   * combo-indexed) so a replay of the same log dodges the same rounds.
   */
  dodgeEvery: z.number().int().min(0).max(10),
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
  strikeArmor: 0,
  dodgeEvery: 0,
}

// ─── Guardians ─────────────────────────────────────────────────────────────

/**
 * Guardian archetypes tune the same combat math, never the rewards: coins
 * and XP come from correct retrieval (buildArenaSummary), so a harder
 * guardian can only change how a run FEELS, not what it pays.
 */
export const guardianArchetypeSchema = z.enum(['warden', 'colossus', 'shade'])
export type GuardianArchetype = z.infer<typeof guardianArchetypeSchema>

export interface GuardianProfile {
  archetype: GuardianArchetype
  name: string
  /** Flavor line for the setup screen / HUD. */
  tagline: string
  /** Config adjustments layered over the run's config. */
  tune: Partial<ArenaConfig>
}

export const GUARDIANS: Record<GuardianArchetype, GuardianProfile> = {
  warden: {
    archetype: 'warden',
    name: 'The Warden',
    tagline: 'A measured duel. The baseline guardian.',
    tune: {},
  },
  colossus: {
    archetype: 'colossus',
    name: 'The Colossus',
    tagline:
      'Plated: blocks 3 damage from every strike — combos pierce armor best. Harsher misses, a tighter crit window.',
    tune: { againCounter: 16, hardCounter: 6, critTimeMs: 3_000, strikeArmor: 3 },
  },
  shade: {
    archetype: 'shade',
    name: 'The Shade',
    tagline:
      'Flicker: every third round its form slips and your strike lands half. Chips you even on Hard, forgives slower crits.',
    tune: { againCounter: 9, hardCounter: 8, critTimeMs: 6_000, dodgeEvery: 3 },
  },
}

/** Resolve the effective config for a run against a given guardian. */
export function guardianConfig(
  archetype: GuardianArchetype = 'warden',
  base: ArenaConfig = ARENA_DEFAULTS,
): ArenaConfig {
  return { ...base, ...GUARDIANS[archetype].tune }
}

/** Deterministic rotation: run N faces guardian N mod 3 (history count + 1). */
export function guardianForRun(runNumber: number): GuardianArchetype {
  const order: GuardianArchetype[] = ['warden', 'colossus', 'shade']
  return order[Math.abs(runNumber) % order.length]!
}

/** Runs at or above this many challenges face a boss (two-phase guardian). */
export const BOSS_CHALLENGE_THRESHOLD = 15

/** Bosses enrage below half HP: counters hit 50% harder (rounded up). */
export const BOSS_ENRAGE_COUNTER_PERCENT = 50

// ─── Boss phases ────────────────────────────────────────────────────────────

/**
 * Bosses fight in three phases derived from guardian HP: the arena's way of
 * making a long run escalate. Phases only change combat FEEL (crit window,
 * shield repair cadence) — coins and XP stay learning-derived. Like every
 * combat input, the phase is a pure function of the run's HP progression,
 * so server-side replays through summarizeGradeLog reproduce it exactly.
 */
export type BossPhase = 1 | 2 | 3

export const BOSS_PHASE_INFO: Record<BossPhase, { name: string; description: string }> = {
  1: {
    name: 'Full Guard',
    description: 'The boss fights by the book.',
  },
  2: {
    name: 'Pressured',
    description: 'Below two-thirds HP the boss tightens up: the crit window shrinks by a quarter.',
  },
  3: {
    name: 'Last Stand',
    description:
      'Below one-third HP the boss fights desperate: crit window halved and shields repair later.',
  },
}

/** The phase a boss is in at a given HP (non-boss runs are always phase 1). */
export function bossPhaseFor(guardianHp: number, guardianMaxHp: number, boss: boolean): BossPhase {
  if (!boss || guardianMaxHp <= 0) return 1
  const frac = guardianHp / guardianMaxHp
  if (frac > 2 / 3) return 1
  if (frac > 1 / 3) return 2
  return 3
}

/** Layer a boss phase over the (guardian- and modifier-tuned) config. */
export function bossPhaseConfig(config: ArenaConfig, phase: BossPhase): ArenaConfig {
  if (phase === 2) {
    return { ...config, critTimeMs: Math.max(500, Math.floor(config.critTimeMs * 0.75)) }
  }
  if (phase === 3) {
    return {
      ...config,
      critTimeMs: Math.max(500, Math.floor(config.critTimeMs * 0.5)),
      shieldRepairCombo: Math.min(20, config.shieldRepairCombo + 2),
    }
  }
  return config
}

// ─── Daily modifiers ────────────────────────────────────────────────────────

/**
 * One deterministic twist per day, layered over the guardian's tuning. Like
 * the guardian mechanics, a modifier only changes how a run FEELS: coins and
 * XP come from correct retrieval (buildArenaSummary), never from combat
 * numbers. The modifier active when a run is ISSUED is stored on the run row
 * and reapplied at settlement, so a midnight boundary can never fork the
 * recompute.
 */
export const arenaModifierSchema = z.enum([
  'swift_strikes',
  'brittle_guard',
  'heavy_air',
  'focus_flow',
])
export type ArenaModifier = z.infer<typeof arenaModifierSchema>

export const ARENA_MODIFIER_INFO: Record<ArenaModifier, { name: string; description: string }> = {
  swift_strikes: {
    name: 'Swift Strikes',
    description: 'A wider crit window today: fast, sure answers land criticals more easily.',
  },
  brittle_guard: {
    name: 'Brittle Guard',
    description: 'One less shield charge, and combos repair shields later than usual.',
  },
  heavy_air: {
    name: 'Heavy Air',
    description: 'Counters hit 25% harder, and every strike starts one point weaker.',
  },
  focus_flow: {
    name: 'Focus Flow',
    description: 'Combos grow 5% faster, but the crit window tightens slightly.',
  },
}

/** Tiny deterministic string hash — selection only, NOT an integrity proof. */
function hashDateKey(dateKey: string): number {
  let h = 0
  for (let i = 0; i < dateKey.length; i++) {
    h = (h * 31 + dateKey.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** The modifier for a calendar day (YYYY-MM-DD), stable for that day everywhere. */
export function arenaModifierForDate(dateKey: string): ArenaModifier {
  const order: ArenaModifier[] = ['swift_strikes', 'brittle_guard', 'heavy_air', 'focus_flow']
  return order[hashDateKey(dateKey) % order.length]!
}

/** Layer a modifier over an already guardian-tuned config. */
export function applyArenaModifier(
  modifier: ArenaModifier | null | undefined,
  config: ArenaConfig,
): ArenaConfig {
  switch (modifier) {
    case 'swift_strikes':
      return { ...config, critTimeMs: Math.floor(config.critTimeMs * 1.5) }
    case 'brittle_guard':
      return {
        ...config,
        maxShield: Math.max(0, config.maxShield - 1),
        shieldRepairCombo: Math.min(20, config.shieldRepairCombo + 2),
      }
    case 'heavy_air':
      return {
        ...config,
        againCounter: Math.ceil(config.againCounter * 1.25),
        hardCounter: Math.ceil(config.hardCounter * 1.25),
        baseDamage: Math.max(1, config.baseDamage - 1),
      }
    case 'focus_flow':
      return {
        ...config,
        comboStepPercent: Math.min(50, config.comboStepPercent + 5),
        critTimeMs: Math.max(500, config.critTimeMs - 500),
      }
    default:
      return config
  }
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
  /** Card format (basic/cloze/typein/…) — drives small combat flavor. */
  format: z.string().optional(),
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
  /** Damage blocked by guardian plating this exchange. */
  armorBlocked: number
  /** True when the guardian dodged this exchange's strike. */
  dodged: boolean
  /** The boss phase this exchange was graded in (1 for non-boss runs). */
  phase: BossPhase
  /** The card-format flavor that fired this exchange (null: none). */
  flavor: ArenaStrikeFlavor
}

export interface ArenaState {
  status: ArenaStatus
  /** Which guardian this run faces. */
  archetype: GuardianArchetype
  /** Long runs face a boss that escalates through three phases. */
  boss: boolean
  /** Current boss phase (always 1 for non-boss runs). */
  phase: BossPhase
  /** Boss below half HP — counters hit harder. */
  enraged: boolean
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
  /** Damage blocked by guardian plating (config.strikeArmor). */
  armorBlocked: number
  /** True when the guardian dodged this round (config.dodgeEvery). */
  dodged: boolean
  /** The card-format flavor that fired this strike (null: none). */
  flavor: ArenaStrikeFlavor
}

// ─── Card-format flavor ─────────────────────────────────────────────────────

/**
 * Small deterministic nudges that make the card FORMAT felt in combat. Like
 * every combat number these are feedback only — rewards stay learning-
 * derived — and they are pure functions of (grade, confidence, time, combo,
 * config, format), so the server-side settlement recompute reproduces them
 * exactly from the run's queue snapshot.
 *
 * - typein (typed from memory — max retrieval effort): confident good/easy
 *   strikes land +1 damage.
 * - cloze (precision recall): critical strikes land +2 damage on top.
 * - occlusion (partial visual recall): Hard answers graze — the counter
 *   comes back 1 point softer.
 * Every other format fights by the book.
 */
export type ArenaStrikeFlavor = 'typein_power' | 'cloze_precision' | 'occlusion_graze' | null

export const ARENA_FORMAT_INFO: Record<string, { flavor: string; description: string }> = {
  typein: {
    flavor: 'Recall power',
    description: 'Typed-from-memory answers strike 1 point harder when confident.',
  },
  cloze: {
    flavor: 'Precision',
    description: 'Cloze criticals land 2 extra damage — the gap snaps shut.',
  },
  occlusion: {
    flavor: 'Graze',
    description: 'Hard occlusion answers counter 1 point softer — you saw the shape.',
  },
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
  /** 1-based round index — only the dodge mechanic uses it. */
  round = 0,
  /** Card format — drives the small deterministic flavor nudges. */
  format?: string,
): Strike {
  if (grade === 1) {
    return {
      damage: 0,
      crit: false,
      counter: config.againCounter,
      shieldRepair: 0,
      scoreDelta: 0,
      comboDelta: -combo,
      armorBlocked: 0,
      dodged: false,
      flavor: null,
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

  // Card-format flavor (see ARENA_FORMAT_INFO): tiny deterministic nudges.
  let flavor: ArenaStrikeFlavor = null
  if (format === 'typein' && grade >= 3 && confidence === 1) {
    damage += 1
    flavor = 'typein_power'
  } else if (format === 'cloze' && crit) {
    damage += 2
    flavor = 'cloze_precision'
  } else if (format === 'occlusion' && counter > 0) {
    counter -= 1
    flavor = 'occlusion_graze'
  }

  // Guardian plating: flat reduction, but a genuine strike always lands for 1.
  const armorBlocked = config.strikeArmor > 0 ? Math.min(config.strikeArmor, damage - 1) : 0
  damage -= armorBlocked

  // Guardian flicker: this round's strike lands half.
  const dodged = config.dodgeEvery > 0 && round > 0 && round % config.dodgeEvery === 0
  if (dodged) damage = Math.floor(damage / 2)

  const shieldRepair = grade >= 3 && combo + 1 >= config.shieldRepairCombo ? 1 : 0
  const scoreDelta = damage * 10 + (crit ? 50 : 0) + (grade === 2 ? 10 : 0)

  return {
    damage,
    crit,
    counter,
    shieldRepair,
    scoreDelta,
    comboDelta: grade === 2 ? 0 : 1,
    armorBlocked,
    dodged,
    flavor,
  }
}

// ─── Session lifecycle ──────────────────────────────────────────────────────

export function createArenaSession(
  challenges: ArenaChallenge[],
  config: ArenaConfig = ARENA_DEFAULTS,
  archetype: GuardianArchetype = 'warden',
): ArenaState {
  const boss = challenges.length >= BOSS_CHALLENGE_THRESHOLD
  // Bosses get a 50% HP premium on top of the queue's base damage budget.
  const guardianMaxHp = Math.round(challenges.length * config.baseDamage * (boss ? 1.5 : 1))
  return {
    status: challenges.length === 0 ? 'victory' : 'fighting',
    archetype,
    boss,
    phase: 1,
    enraged: false,
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

  // The strike lands against the phase the guardian is in NOW; the phase
  // banner flips right after the blow that crosses a threshold.
  const strikePhase = bossPhaseFor(state.guardianHp, state.guardianMaxHp, state.boss)
  const phaseCfg = bossPhaseConfig(config, strikePhase)

  const strike = strikeFor(
    grade,
    confidence,
    Math.max(0, Math.round(timeMs)),
    state.combo,
    phaseCfg,
    state.round + 1,
    challenge.format,
  )

  // Boss phase two: once the guardian falls below half HP the counters come
  // 50% harder — including the counter on the strike that drove it there.
  const guardianHpAfter = Math.max(0, state.guardianHp - strike.damage)
  const enraged = state.boss && guardianHpAfter <= state.guardianMaxHp / 2
  const counter = enraged
    ? Math.ceil((strike.counter * (100 + BOSS_ENRAGE_COUNTER_PERCENT)) / 100)
    : strike.counter

  const counterShielded = Math.min(state.shield, counter)
  const counterTaken = counter - counterShielded
  const shield = Math.max(
    0,
    Math.min(state.maxShield, state.shield - counterShielded + strike.shieldRepair),
  )
  const hp = Math.max(0, state.hp - counterTaken)
  const guardianHp = guardianHpAfter
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
    armorBlocked: strike.armorBlocked,
    dodged: strike.dodged,
    phase: strikePhase,
    flavor: strike.flavor,
  }

  const phase = bossPhaseFor(guardianHpAfter, state.guardianMaxHp, state.boss)
  const remaining = state.remaining - 1
  // Victory requires clearing the whole queue: every card in the session is
  // always reviewed (guardian HP is a progress bar, never an early exit).
  // Defeat cuts the session short when the learner's HP runs out.
  const status: ArenaStatus = remaining <= 0 ? 'victory' : hp <= 0 ? 'defeat' : 'fighting'

  return {
    ...state,
    status,
    enraged,
    phase,
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
  /**
   * Server-issued run identity (from GET /api/arena): the settlement is
   * bound to the queue the server actually dealt. The server owns the run's
   * guardian/config; client-supplied score, combo, result and archetype
   * fields are telemetry, never integrity inputs.
   */
  runId: z.string().uuid(),
  exchanges: z.array(arenaGradeEventSchema).min(1).max(200),
  bestCombo: z.number().int().min(0),
  result: z.enum(['victory', 'defeat']),
})
export type ArenaSettlement = z.infer<typeof arenaSettlementSchema>

/** Recompute the summary server-side from the raw grade log (never trust the client's score). */
export function summarizeGradeLog(
  exchanges: ArenaGradeEvent[],
  config: ArenaConfig = ARENA_DEFAULTS,
  archetype: GuardianArchetype = 'warden',
  /** The daily modifier the run was issued under — reapplied for the replay. */
  modifier: ArenaModifier | null = null,
  /**
   * Card-format lookup for the flavor nudges, resolved from the server's
   * queue snapshot at settlement. Omitted: no flavor (pre-flavor runs).
   */
  formatOf?: (cardId: number) => string | undefined,
): ArenaSummary {
  const tuned = applyArenaModifier(modifier, guardianConfig(archetype, config))
  const challenges = exchanges.map((e) => ({
    cardId: e.cardId,
    prompt: 'x',
    answer: 'x',
    format: formatOf?.(e.cardId),
  }))
  let state = createArenaSession(challenges, tuned, archetype)
  for (let i = 0; i < exchanges.length; i++) {
    const e = exchanges[i]!
    state = applyGrade(state, challenges[i]!, e.grade, e.confidence, e.timeMs, tuned)
  }
  return buildArenaSummary(state)
}
export * from './nemesis'
