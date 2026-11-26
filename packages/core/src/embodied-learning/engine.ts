/**
 * @file engine.ts
 * @description Embodied Learning & Gesture Cognitive Engine
 *
 * Implements an embodied-cognition practice loop grounded in four research
 * programmes:
 *
 * 1. Gesture as learning mechanism (Goldin-Meadow).
 *    - Gesture is not hand-waving: it externalises implicit spatial and dynamic
 *      knowledge that speech does not yet encode (Goldin-Meadow, 2003).
 *    - Gesture-speech mismatch is a marker of transitional knowledge and predicts
 *      readiness to learn (Church & Goldin-Meadow, 1986; Perry, Church &
 *      Goldin-Meadow, 1988).
 *    - Producing gesture during explanation improves retention and transfer
 *      relative to speech alone (Cook, Mitchell & Goldin-Meadow, 2008), and
 *      gesture lightens cognitive load, freeing working memory for learning
 *      (Goldin-Meadow, Nusbaum, Kelly & Wagner, 2001; Ping & Goldin-Meadow, 2010).
 *
 * 2. The enactment effect.
 *    - Self-performed tasks (SPTs) are recalled substantially better than
 *      verbally described or observed tasks (Engelkamp & Zimmer, 1984;
 *      Cohen, 1981). Motor encoding adds a distinct, durable memory trace.
 *
 * 3. Tracing and pointing in instruction.
 *    - Physically tracing worked-example elements improves learning for
 *      high-element-interactivity material such as geometry (Hu, Ginns & Bobis,
 *      2015; Ginns, Hu, Byrne & Bobis, 2016).
 *
 * 4. Concreteness fading.
 *    - Learning progresses most robustly from enactive (physical/manipulative)
 *      through iconic (diagrammatic) to symbolic (abstract notation)
 *      representations (Bruner, 1966); explicitly fading concreteness beats both
 *      purely concrete and purely abstract instruction (Fyfe, McNeil, Son &
 *      Goldstone, 2014).
 *
 * References:
 * - Goldin-Meadow, S. (2003). Hearing Gesture. Harvard University Press.
 * - Church, R. B., & Goldin-Meadow, S. (1986). The mismatch between gesture and
 *   speech as an index of transitional knowledge. Cognition, 23(1), 43-71.
 * - Cook, S. W., Mitchell, Z., & Goldin-Meadow, S. (2008). Gesturing makes
 *   learning last. Cognition, 106(2), 1047-1058.
 * - Goldin-Meadow, S., Nusbaum, H., Kelly, S. D., & Wagner, S. (2001).
 *   Explaining math: Gesturing lightens the load. Psychological Science, 12(6), 516-522.
 * - Engelkamp, J., & Zimmer, H. D. (1984). Motor programme information as a
 *   separable memory unit. Psychological Research, 46(3), 283-299.
 * - Cohen, R. L. (1981). On the generality of some memory laws. Scandinavian
 *   Journal of Psychology, 22(1), 267-281.
 * - Hu, F. T., Ginns, P., & Bobis, J. (2015). Getting the point: Tracing worked
 *   examples enhances learning. Learning and Instruction, 35, 85-93.
 * - Bruner, J. S. (1966). Toward a Theory of Instruction. Harvard University Press.
 * - Fyfe, E. R., McNeil, N. M., Son, J. Y., & Goldstone, R. L. (2014).
 *   Concreteness fading in mathematics and science instruction. Educational
 *   Psychology Review, 26(1), 9-25.
 * - Wilson, M. (2002). Six views of embodied cognition. Psychonomic Bulletin &
 *   Review, 9(4), 625-636.
 */

import { z } from 'zod'

import { CANONICAL_EMBODIED_SCENARIOS } from './content'

/* ==========================================================================
 * ZOD SCHEMAS & TYPES
 * ========================================================================== */

/** Representation modality on Bruner's enactive-iconic-symbolic ladder. */
export const ModalityEnum = z.enum(['enactive', 'iconic', 'symbolic'])
export type Modality = z.infer<typeof ModalityEnum>

/** Which kind of concept structure a gesture can carry (Goldin-Meadow, 2003). */
export const GestureChannelEnum = z.enum([
  'spatial-layout', // relative positions, configurations, graphs
  'dynamic-process', // change over time, flow, iteration
  'force-causality', // pushes, pressures, constraints, trade-offs
  'magnitude-scale', // sizes, rates, proportions
  'deictic-reference', // pointing at (real or imagined) referents
])
export type GestureChannel = z.infer<typeof GestureChannelEnum>

/** A single prescribed gesture tied to one idea element. */
export const GestureSpecSchema = z.object({
  element: z.string().min(1), // the idea element the gesture carries
  channel: GestureChannelEnum,
  gestureDescription: z.string().min(1),
  verbalAnchor: z.string().min(1), // what the learner says while gesturing
  rationale: z.string().min(1),
})
export type GestureSpec = z.infer<typeof GestureSpecSchema>

/** One learner explanation scored for gesture-speech alignment. */
export const ExplanationSampleSchema = z.object({
  speechClaim: z.string().min(1), // what the learner said
  gestureClaim: z.string().min(1), // what the learner's gesture showed
})
export type ExplanationSample = z.infer<typeof ExplanationSampleSchema>

/** Result of a gesture-speech mismatch analysis. */
export const MismatchReportSchema = z.object({
  alignedCount: z.number().int().min(0),
  mismatchCount: z.number().int().min(0),
  mismatchRate: z.number().min(0).max(1),
  transitional: z.boolean(), // mismatch marks transitional knowledge (Church & Goldin-Meadow, 1986)
  coaching: z.array(z.string()),
})
export type MismatchReport = z.infer<typeof MismatchReportSchema>

/** A concreteness-fading sequence for one concept. */
export const FadingLadderSchema = z.object({
  concept: z.string().min(1),
  rungs: z.array(
    z.object({
      modality: ModalityEnum,
      activity: z.string().min(1),
      bridgePrompt: z.string().min(1), // links this rung to the next (Fyfe et al., 2014)
    }),
  ),
})
export type FadingLadder = z.infer<typeof FadingLadderSchema>

/** One self-performed-task practice item (enactment effect). */
export const EnactmentTaskSchema = z.object({
  verbalVersion: z.string().min(1), // read/verbal control version
  enactedVersion: z.string().min(1), // physically performed version
  domain: z.string().min(1),
})
export type EnactmentTask = z.infer<typeof EnactmentTaskSchema>

/** Outcome of one enactment practice session. */
export const EnactmentSessionSchema = z.object({
  taskCount: z.number().int().min(1),
  enactedCount: z.number().int().min(0),
  recallHitsEnacted: z.number().int().min(0),
  recallHitsVerbal: z.number().int().min(0),
  verbalCount: z.number().int().min(0),
})
export type EnactmentSession = z.infer<typeof EnactmentSessionSchema>

/** A canonical scenario the studio can load for guided practice. */
export const EmbodiedScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  domain: z.string().min(1),
  concept: z.string().min(1),
  whyEmbodied: z.string().min(1),
  gesturePlan: z.array(GestureSpecSchema).min(1),
  ladder: FadingLadderSchema,
  tracingExercise: z.string().min(1),
  enactmentTask: EnactmentTaskSchema,
  reflectionPrompts: z.array(z.string()).min(1),
  citations: z.array(z.string()).min(1),
})
export type EmbodiedScenario = z.infer<typeof EmbodiedScenarioSchema>

/** Phase of the studio session, in practice order. */
export const StudioPhaseEnum = z.enum([
  'ground', // feel the concept enactively
  'gesture', // build and rehearse a gesture plan
  'mismatch-check', // probe gesture-speech alignment
  'fade', // climb the concreteness-fading ladder
  'transfer', // symbolic-only transfer check
  'reflect',
])
export type StudioPhase = z.infer<typeof StudioPhaseEnum>

/* ==========================================================================
 * SCENARIO LIBRARY ACCESS
 * ========================================================================== */

export function listEmbodiedScenarios(): EmbodiedScenario[] {
  return CANONICAL_EMBODIED_SCENARIOS
}

export function getEmbodiedScenario(id: string): EmbodiedScenario | undefined {
  return CANONICAL_EMBODIED_SCENARIOS.find((s) => s.id === id)
}

/* ==========================================================================
 * GESTURE PLANNING
 * ========================================================================== */

/**
 * Validate a learner-authored gesture plan against the research criteria:
 * every core element of the concept should be carried by a gesture, gestures
 * should span more than one channel where the concept is multi-structural,
 * and every gesture needs a verbal anchor so speech and action co-encode
 * (Cook, Mitchell & Goldin-Meadow, 2008).
 */
export function evaluateGesturePlan(
  plan: GestureSpec[],
  coreElements: string[],
): {
  coveredElements: string[]
  missingElements: string[]
  channels: GestureChannel[]
  advice: string[]
} {
  const covered = new Set(plan.map((g) => g.element.trim().toLowerCase()))
  const coveredElements = coreElements.filter((e) => covered.has(e.trim().toLowerCase()))
  const missingElements = coreElements.filter((e) => !covered.has(e.trim().toLowerCase()))
  const channels = [...new Set(plan.map((g) => g.channel))]
  const advice: string[] = []
  if (missingElements.length > 0) {
    advice.push(
      `No gesture yet for: ${missingElements.join(', ')}. Un-gestured elements are exactly the ones gesture research shows get dropped under load (Goldin-Meadow et al., 2001).`,
    )
  }
  if (channels.length === 1 && plan.length > 1) {
    advice.push(
      'All gestures use one channel. Concepts with spatial, dynamic and causal parts are best carried by matching channel types (Goldin-Meadow, 2003).',
    )
  }
  const anchorless = plan.filter((g) => g.verbalAnchor.trim().length < 3)
  if (anchorless.length > 0) {
    advice.push(
      `${anchorless.length} gesture(s) lack a spoken anchor. Gesture-plus-speech outperforms gesture alone for durable learning (Cook et al., 2008).`,
    )
  }
  if (advice.length === 0) {
    advice.push(
      'Plan covers every core element with anchored gestures across channels. Rehearse it while explaining aloud.',
    )
  }
  return { coveredElements, missingElements, channels, advice }
}

/* ==========================================================================
 * GESTURE-SPEECH MISMATCH
 * ========================================================================== */

/**
 * Score a set of explanation samples for gesture-speech mismatch. A mismatch
 * is not an error to suppress: it signals transitional knowledge, the state in
 * which learners are most ready to benefit from instruction (Church &
 * Goldin-Meadow, 1986; Perry, Church & Goldin-Meadow, 1988). High alignment
 * with low correctness means the learner needs new input, not more rehearsal.
 */
export function analyzeMismatch(samples: ExplanationSample[]): MismatchReport {
  let aligned = 0
  let mismatched = 0
  for (const s of samples) {
    const speech = s.speechClaim.trim().toLowerCase()
    const gesture = s.gestureClaim.trim().toLowerCase()
    if (speech.length === 0 || gesture.length === 0) continue
    if (speech === gesture || speech.includes(gesture) || gesture.includes(speech)) {
      aligned += 1
    } else {
      mismatched += 1
    }
  }
  const total = aligned + mismatched
  const rate = total === 0 ? 0 : mismatched / total
  const coaching: string[] = []
  if (total === 0) {
    coaching.push(
      'No usable samples. Record what you said and what your hands showed for the same explanation.',
    )
  } else if (rate >= 0.4) {
    coaching.push(
      'Frequent gesture-speech mismatch: you are in a transitional state. This is the best moment for instruction, not more drill (Church & Goldin-Meadow, 1986). Load the canonical explanation now.',
    )
  } else if (rate > 0) {
    coaching.push(
      'Some mismatch detected. Where your hands disagree with your mouth, the gestured version often holds the newer insight: say it out loud and compare.',
    )
  } else {
    coaching.push(
      'Gesture and speech fully aligned. To deepen encoding, explain the concept to someone (or a rubber duck) while gesturing: gesture-plus-speech improves later transfer (Cook et al., 2008).',
    )
  }
  return {
    alignedCount: aligned,
    mismatchCount: mismatched,
    mismatchRate: rate,
    transitional: rate >= 0.4,
    coaching,
  }
}

/* ==========================================================================
 * CONCRETENESS FADING
 * ========================================================================== */

/**
 * Check that a fading ladder obeys concreteness-fading order (enactive ->
 * iconic -> symbolic, never backwards) and that every rung after the first has
 * a bridging prompt connecting it to the previous representation, the feature
 * that separates fading from mere concreteness (Fyfe et al., 2014).
 */
export function validateFadingLadder(ladder: FadingLadder): { valid: boolean; problems: string[] } {
  const order: Record<Modality, number> = { enactive: 0, iconic: 1, symbolic: 2 }
  const problems: string[] = []
  if (ladder.rungs.length < 2) {
    problems.push(
      'A fading ladder needs at least two rungs; a single representation is not fading.',
    )
  }
  for (let i = 0; i < ladder.rungs.length; i += 1) {
    const rung = ladder.rungs[i]
    if (i > 0 && order[rung.modality] < order[ladder.rungs[i - 1].modality]) {
      problems.push(
        `Rung ${i + 1} moves backwards (${ladder.rungs[i - 1].modality} -> ${rung.modality}). Fading only moves toward abstraction (Bruner, 1966; Fyfe et al., 2014).`,
      )
    }
    if (i > 0 && rung.bridgePrompt.trim().length < 10) {
      problems.push(
        `Rung ${i + 1} lacks a real bridge to the previous representation. Explicit mapping between rungs is what makes fading work (Fyfe et al., 2014).`,
      )
    }
  }
  if (ladder.rungs.length >= 2 && ladder.rungs[ladder.rungs.length - 1].modality !== 'symbolic') {
    problems.push(
      'The ladder should end at the symbolic rung so transfer to formal notation is practised, not assumed.',
    )
  }
  return { valid: problems.length === 0, problems }
}

/* ==========================================================================
 * ENACTMENT SESSION SCORING
 * ========================================================================== */

/**
 * Score an enactment practice session. The enactment effect predicts better
 * free recall for self-performed tasks than for verbally studied equivalents
 * (Engelkamp & Zimmer, 1984; Cohen, 1981). Returns per-condition recall rates
 * and the enactment advantage in percentage points.
 */
export function scoreEnactmentSession(session: EnactmentSession): {
  enactedRecall: number
  verbalRecall: number
  enactmentAdvantage: number
  interpretation: string
} {
  const enactedRecall =
    session.enactedCount === 0 ? 0 : session.recallHitsEnacted / session.enactedCount
  const verbalRecall =
    session.verbalCount === 0 ? 0 : session.recallHitsVerbal / session.verbalCount
  const advantage = enactedRecall - verbalRecall
  let interpretation: string
  if (session.enactedCount === 0) {
    interpretation =
      'No enacted tasks this session: the enactment effect cannot help recall you never motor-encoded.'
  } else if (advantage > 0.1) {
    interpretation =
      'Clear enactment advantage, matching the classic SPT result: self-performance adds a motor trace that survives forgetting better than verbal study (Engelkamp & Zimmer, 1984).'
  } else if (advantage >= -0.1) {
    interpretation =
      'No recall difference yet. Check that the enacted versions were genuinely performed, not mimed half-heartedly; motor encoding needs real action.'
  } else {
    interpretation =
      'Verbal beat enacted this session, which is atypical. Look for divided attention during performance or enacted versions that were harder than the verbal controls.'
  }
  return { enactedRecall, verbalRecall, enactmentAdvantage: advantage, interpretation }
}

/* ==========================================================================
 * PHASE FLOW
 * ========================================================================== */

/** Canonical phase order for one studio session. */
export const STUDIO_PHASE_ORDER: StudioPhase[] = [
  'ground',
  'gesture',
  'mismatch-check',
  'fade',
  'transfer',
  'reflect',
]

export function nextStudioPhase(current: StudioPhase): StudioPhase | null {
  const at = STUDIO_PHASE_ORDER.indexOf(current)
  return at === -1 || at === STUDIO_PHASE_ORDER.length - 1 ? null : STUDIO_PHASE_ORDER[at + 1]
}
