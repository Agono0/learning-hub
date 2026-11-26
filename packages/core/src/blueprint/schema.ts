/**
 * Study blueprint — the declarative format for a custom study method.
 *
 * A blueprint is plain JSON (no code, no expressions): a list of typed
 * `phases`, optional tunable `params`, and optional event `triggers`. The
 * runtime in `./runtime` walks the phases as a small state machine; the
 * plugin bridge in `./plugin` turns an installed blueprint into a regular
 * Learning HUB plugin (palette action, dashboard widget, MCP tool, CLI
 * command, event counters).
 *
 * Everything here is zod-validated: a blueprint arrives from a file, a paste
 * box or a third party, so it is untrusted input. Semantic checks that zod
 * cannot express (unknown goto targets, unreachable phases, bad param
 * references) live in `./validate`.
 */
import { z } from 'zod'

/** Current blueprint format version. Bump on a breaking schema change. */
export const BLUEPRINT_SCHEMA_VERSION = 1 as const

/** Hard limits that keep a hostile or buggy blueprint from exhausting a host. */
export const BLUEPRINT_LIMITS = {
  maxPhases: 40,
  maxParams: 20,
  maxTriggers: 20,
  maxBranches: 6,
  maxRepeat: 50,
  maxMinutes: 240,
  /** Runtime safety valve: total phase completions in one session. */
  maxSteps: 500,
} as const

const slug = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lowercase letters, digits and single dashes')

const text = (max: number) => z.string().trim().min(1).max(max)

/** What a phase is for. Drives UI iconography and the plan summary. */
export const PHASE_KINDS = ['learn', 'practice', 'recall', 'reflect', 'rest'] as const
/** One of {@link PHASE_KINDS}. */
export type PhaseKind = (typeof PHASE_KINDS)[number]

/** A number that is either literal or read from a blueprint param. */
export const numberOrParamSchema = z.union([
  z.number().finite(),
  z.object({ param: slug }).strict(),
])
/** Literal number or `{ param: "id" }` reference. */
export type NumberOrParam = z.infer<typeof numberOrParamSchema>

/** A tunable setting the user can change when starting a session. */
export const paramSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('number'),
    label: text(60),
    default: z.number().finite(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    step: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal('choice'),
    label: text(60),
    default: text(40),
    options: z.array(text(40)).min(2).max(12),
  }),
  z.object({ type: z.literal('boolean'), label: text(60), default: z.boolean() }),
])
/** One tunable param definition. */
export type BlueprintParam = z.infer<typeof paramSchema>

/** Metrics a phase result can report and a branch can test. */
export const METRICS = ['score', 'confidence'] as const
/** One of {@link METRICS}. */
export type Metric = (typeof METRICS)[number]

/** Structured condition (no eval): `metric op value`, value is 0-100. */
export const conditionSchema = z
  .object({
    metric: z.enum(METRICS),
    op: z.enum(['<', '<=', '>', '>=', '==']),
    value: numberOrParamSchema,
  })
  .strict()
/** A branch condition. */
export type BlueprintCondition = z.infer<typeof conditionSchema>

/** A conditional jump taken when a phase completes. First match wins. */
export const branchSchema = z.object({ when: conditionSchema, goto: slug }).strict()
/** One conditional branch out of a phase. */
export type BlueprintBranch = z.infer<typeof branchSchema>

/** One step of a study method. */
export const phaseSchema = z
  .object({
    id: slug,
    title: text(80),
    kind: z.enum(PHASE_KINDS),
    /** Planned length in minutes (literal or param). 0 is allowed for instant checkpoints. */
    minutes: numberOrParamSchema,
    /** What the learner does. Plain text, never rendered as HTML. */
    instructions: text(600),
    /** Whether finishing the phase asks for a 0-100 score. */
    scored: z.boolean().default(false),
    /** Repeat this phase N times before moving on (literal or param). */
    repeat: numberOrParamSchema.optional(),
    /** Conditional jumps checked in order after the phase finishes. */
    branches: z.array(branchSchema).max(BLUEPRINT_LIMITS.maxBranches).default([]),
    /** Default next phase when no branch matches; omitted means "the following phase". */
    next: slug.optional(),
  })
  .strict()
/** One phase of a blueprint. */
export type BlueprintPhase = z.infer<typeof phaseSchema>

/** Platform events a blueprint may listen to (kept in sync with HubEventMap). */
export const TRIGGER_EVENTS = [
  'review.completed',
  'review.batch.completed',
  'streak.updated',
  'streak.broken',
  'card.created',
  'focus.completed',
  'quest.completed',
  'goal.completed',
  'habit.checked',
  'achievement.unlocked',
] as const
/** One of {@link TRIGGER_EVENTS}. */
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number]

/** Count a platform event so the blueprint can show it in its status. */
export const triggerSchema = z
  .object({
    event: z.enum(TRIGGER_EVENTS),
    /** Counter key the runtime increments, e.g. "reviews". */
    counter: slug,
    /** Label shown next to the counter. */
    label: text(60).optional(),
  })
  .strict()
/** One event trigger. */
export type BlueprintTrigger = z.infer<typeof triggerSchema>

/** The blueprint document. */
export const blueprintSchema = z
  .object({
    schemaVersion: z.literal(BLUEPRINT_SCHEMA_VERSION),
    id: slug,
    name: text(60),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'use semver like 1.0.0'),
    summary: text(240),
    author: text(60).optional(),
    tags: z.array(slug).max(8).default([]),
    params: z.record(slug, paramSchema).default({}),
    phases: z.array(phaseSchema).min(1).max(BLUEPRINT_LIMITS.maxPhases),
    triggers: z.array(triggerSchema).max(BLUEPRINT_LIMITS.maxTriggers).default([]),
  })
  .strict()
/** A parsed, schema-valid blueprint (semantic checks still pending). */
export type Blueprint = z.infer<typeof blueprintSchema>
/** What authors write: defaults are optional. */
export type BlueprintInput = z.input<typeof blueprintSchema>
