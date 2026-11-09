/**
 * Habits — the cue/craving/response/reward loop (Clear/Duhigg), habit stacking,
 * solidifying stages, and the dopamine menu (structured mood repair instead of
 * grabbing the phone).
 * Pure helpers; the DB layer owns persistence (habits, habit_logs).
 */

export interface HabitLoopInput {
  cue?: string | null
  craving?: string | null
  response?: string | null
  reward?: string | null
}

/** Habit-loop validation: blocking errors plus non-blocking warnings. */
export interface HabitValidation {
  ok: boolean
  errors: string[]
  /** fixable gaps that do not block creation */
  warnings: string[]
}

/**
 * Every habit needs a cue (the trigger) and a response (the tiny action —
 * two-minute rule). Craving and reward complete the loop; missing ones are
 * warnings, not blockers.
 */
export function validateHabit(habit: HabitLoopInput): HabitValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const cue = (habit.cue ?? '').trim()
  const craving = (habit.craving ?? '').trim()
  const response = (habit.response ?? '').trim()
  const reward = (habit.reward ?? '').trim()

  if (cue.length === 0) errors.push('Cue is required — when/where does the habit happen?')
  if (response.length === 0)
    errors.push('Response is required — what is the two-minute version of the action?')
  if (cue.length > 0 && cue.length < 3) errors.push('Cue is too short to act on.')
  if (response.length > 0 && response.length < 2) errors.push('Response is too short.')

  if (craving.length === 0)
    warnings.push('No craving stated — what feeling makes you want this? (optional)')
  if (reward.length === 0)
    warnings.push('No reward stated — what immediately satisfies you after? (optional)')

  return { ok: errors.length === 0, errors, warnings }
}

// ─── Habit stacking ─────────────────────────────────────────────────────────

export interface StackableHabit {
  id: number
  name: string
  /** "After [existing habit], I will…" — habits with an anchor join the chain */
  anchor?: string | null
  order?: number | null
}

/**
 * Chain order for the stacking view: anchored habits lead the chain (they hang
 * off existing routines), standalone habits follow. Stable within groups
 * (explicit `order`, then id) so the view never jitters.
 */
export function stackChainOrder<T extends StackableHabit>(habits: T[]): T[] {
  return [...habits].sort((a, b) => {
    const aAnchored = a.anchor != null && a.anchor.trim() !== ''
    const bAnchored = b.anchor != null && b.anchor.trim() !== ''
    if (aAnchored !== bAnchored) return aAnchored ? -1 : 1
    const ao = a.order ?? 0
    const bo = b.order ?? 0
    if (ao !== bo) return ao - bo
    return a.id - b.id
  })
}

// ─── Solidifying stages ─────────────────────────────────────────────────────

export type HabitStage = 'forming' | 'solidifying' | 'automatic'

/** Habit automaticity stage with progress toward the next one. */
export interface Solidifying {
  /** distinct logged days */
  days: number
  stage: HabitStage
  /** days until the next stage (0 when automatic) */
  daysToNext: number
  nextStage: HabitStage | null
}

/** Lally et al. (2009): automaticity takes ~18–254 days (median 66); Clear's public
 * rule of thumb: 21 days to visible, ~60 to automatic. Thresholds: 21 / 60. */
export const SOLIDIFYING_THRESHOLDS = { solidifying: 21, automatic: 60 } as const

/** Map distinct logged days to the forming→solidifying→automatic stage. */
export function solidifying(logDates: string[], _today?: Date | string): Solidifying {
  const days = new Set(logDates.map((d) => d.slice(0, 10))).size
  if (days >= SOLIDIFYING_THRESHOLDS.automatic) {
    return { days, stage: 'automatic', daysToNext: 0, nextStage: null }
  }
  if (days >= SOLIDIFYING_THRESHOLDS.solidifying) {
    return {
      days,
      stage: 'solidifying',
      daysToNext: SOLIDIFYING_THRESHOLDS.automatic - days,
      nextStage: 'automatic',
    }
  }
  return {
    days,
    stage: 'forming',
    daysToNext: SOLIDIFYING_THRESHOLDS.solidifying - days,
    nextStage: 'solidifying',
  }
}

// ─── Dopamine menu ──────────────────────────────────────────────────────────

export type DopamineType = 'move' | 'create' | 'connect' | 'soothe'

/** One dopamine-menu entry: type, label, minutes it takes. */
export interface DopamineItem {
  type: DopamineType
  label: string
  minutes: number
}

/**
 * The dopamine menu (Anna Lembke / recovery-community pattern, "dopamine menu"
 * as popularized for ADHD): a pre-committed list of quick mood boosters you
 * pick from BEFORE the urge hits — replacing doomscrolling with nourishing hits.
 */
export const DOPAMINE_MENU: DopamineItem[] = [
  // move
  { type: 'move', label: '20 brisk steps outside, sun if possible', minutes: 3 },
  { type: 'move', label: 'One set of push-ups / squats to failure-ish', minutes: 2 },
  { type: 'move', label: 'Dance to one full song, badly allowed', minutes: 4 },
  // create
  { type: 'create', label: 'Sketch the current problem on paper', minutes: 5 },
  { type: 'create', label: 'Write 3 lines about today in the journal', minutes: 3 },
  { type: 'create', label: 'Capture one idea in the idea inbox', minutes: 2 },
  // connect
  { type: 'connect', label: 'Text one person something specific and kind', minutes: 2 },
  { type: 'connect', label: 'Say the thing you are learning to someone', minutes: 5 },
  { type: 'connect', label: 'Thank someone from your past week', minutes: 3 },
  // soothe
  { type: 'soothe', label: '4-7-8 breathing, three rounds', minutes: 1 },
  { type: 'soothe', label: 'Cold water on face / wrists', minutes: 1 },
  { type: 'soothe', label: 'Look out a window for 60 seconds, eyes long-focus', minutes: 2 },
]

/** Deterministic pick for a given date — the menu's "suggestion of the day". */
export function dopamineSuggestion(date: Date | string, seedOffset = 0): DopamineItem {
  const key = typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10)
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return DOPAMINE_MENU[
    ((((h >>> 0) + seedOffset) % DOPAMINE_MENU.length) + DOPAMINE_MENU.length) %
      DOPAMINE_MENU.length
  ]
}
