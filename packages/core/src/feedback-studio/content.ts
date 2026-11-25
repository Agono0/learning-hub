/**
 * @file content.ts
 * @description Canonical content bank for the Feedback Literacy & Formative
 * Assessment Studio: the classifier cue lexicon, Shute's (2008) formative
 * feedback guidelines, and ten misconception-tagged formative scenarios with
 * three-level exemplar feedback per option (Hattie & Timperley 2007).
 *
 * All content is hand-authored and research-grounded; the engine consumes it
 * but never mutates it. Scenarios span mathematics, physics, statistics,
 * programming, and language learning so the studio demonstrates transfer of
 * feedback principles across domains.
 */

import { z } from 'zod'
import type { FeedbackLevel } from './feedback-engine'

/* ==========================================================================
 * CLASSIFIER CUE LEXICON
 * ========================================================================== */

/**
 * One lexicon cue: a lowercase substring pattern mapped to a feedback level
 * with a weight. The classifier is intentionally transparent — every
 * automated label can be traced to the cues that fired.
 */
export interface FeedbackCue {
  id: string
  level: FeedbackLevel
  pattern: string
  weight: number
}

/**
 * Cue lexicon for level classification. Task cues name correctness and
 * surface features; process cues name strategies and methods;
 * self-regulation cues name monitoring, verification and planning;
 * self cues name person-directed evaluation.
 */
export const FEEDBACK_CUE_LEXICON: readonly FeedbackCue[] = [
  // ── Task level (FT) ────────────────────────────────────────────────────
  { id: 'ft-correct', level: 'task', pattern: 'correct', weight: 2 },
  { id: 'ft-incorrect', level: 'task', pattern: 'incorrect', weight: 2 },
  { id: 'ft-right-answer', level: 'task', pattern: 'right answer', weight: 2 },
  { id: 'ft-wrong-answer', level: 'task', pattern: 'wrong answer', weight: 2 },
  { id: 'ft-accurate', level: 'task', pattern: 'accurate', weight: 1 },
  { id: 'ft-error-in', level: 'task', pattern: 'error in', weight: 2 },
  { id: 'ft-mistake-in', level: 'task', pattern: 'mistake in', weight: 2 },
  { id: 'ft-missing', level: 'task', pattern: 'missing', weight: 1 },
  { id: 'ft-incomplete', level: 'task', pattern: 'incomplete', weight: 1 },
  { id: 'ft-spelling', level: 'task', pattern: 'spelling', weight: 1 },
  { id: 'ft-units', level: 'task', pattern: 'units', weight: 1 },
  { id: 'ft-sign', level: 'task', pattern: 'sign error', weight: 2 },
  { id: 'ft-calculation', level: 'task', pattern: 'calculation', weight: 1 },
  { id: 'ft-fact', level: 'task', pattern: 'fact', weight: 1 },
  { id: 'ft-definition-is', level: 'task', pattern: 'the definition', weight: 1 },
  { id: 'ft-formula-is', level: 'task', pattern: 'the formula', weight: 1 },
  { id: 'ft-step-2', level: 'task', pattern: 'step 2', weight: 1 },
  { id: 'ft-line', level: 'task', pattern: 'line ', weight: 1 },

  // ── Process level (FP) ─────────────────────────────────────────────────
  { id: 'fp-strategy', level: 'process', pattern: 'strategy', weight: 3 },
  { id: 'fp-method', level: 'process', pattern: 'method', weight: 2 },
  { id: 'fp-approach', level: 'process', pattern: 'approach', weight: 2 },
  { id: 'fp-procedure', level: 'process', pattern: 'procedure', weight: 2 },
  { id: 'fp-process', level: 'process', pattern: 'process', weight: 2 },
  { id: 'fp-technique', level: 'process', pattern: 'technique', weight: 2 },
  { id: 'fp-reasoning', level: 'process', pattern: 'reasoning', weight: 2 },
  { id: 'fp-decompose', level: 'process', pattern: 'break the problem', weight: 2 },
  { id: 'fp-subgoal', level: 'process', pattern: 'subgoal', weight: 2 },
  { id: 'fp-analogy', level: 'process', pattern: 'analogy', weight: 2 },
  { id: 'fp-representation', level: 'process', pattern: 'representation', weight: 2 },
  { id: 'fp-diagram', level: 'process', pattern: 'draw a diagram', weight: 2 },
  { id: 'fp-worked-example', level: 'process', pattern: 'worked example', weight: 2 },
  { id: 'fp-try-instead', level: 'process', pattern: 'try instead', weight: 2 },
  { id: 'fp-alternative', level: 'process', pattern: 'alternative', weight: 1 },
  { id: 'fp-eliminate', level: 'process', pattern: 'eliminate', weight: 1 },
  { id: 'fp-estimate', level: 'process', pattern: 'estimate first', weight: 2 },

  // ── Self-regulation level (FR) ─────────────────────────────────────────
  { id: 'fr-check', level: 'self_regulation', pattern: 'check your', weight: 3 },
  { id: 'fr-verify', level: 'self_regulation', pattern: 'verify', weight: 3 },
  { id: 'fr-monitor', level: 'self_regulation', pattern: 'monitor', weight: 2 },
  { id: 'fr-plan', level: 'self_regulation', pattern: 'plan your', weight: 2 },
  { id: 'fr-goal', level: 'self_regulation', pattern: 'your goal', weight: 2 },
  { id: 'fr-confidence', level: 'self_regulation', pattern: 'confidence', weight: 2 },
  { id: 'fr-ask-yourself', level: 'self_regulation', pattern: 'ask yourself', weight: 3 },
  { id: 'fr-self-test', level: 'self_regulation', pattern: 'test yourself', weight: 3 },
  { id: 'fr-review-your', level: 'self_regulation', pattern: 'review your', weight: 2 },
  { id: 'fr-compare-your', level: 'self_regulation', pattern: 'compare your', weight: 2 },
  { id: 'fr-what-would', level: 'self_regulation', pattern: 'what would happen if', weight: 2 },
  { id: 'fr-predict', level: 'self_regulation', pattern: 'predict', weight: 2 },
  { id: 'fr-reflect', level: 'self_regulation', pattern: 'reflect', weight: 2 },
  { id: 'fr-next-time', level: 'self_regulation', pattern: 'next time', weight: 1 },
  { id: 'fr-track', level: 'self_regulation', pattern: 'keep track', weight: 2 },

  // ── Self level (FS) ────────────────────────────────────────────────────
  { id: 'fs-smart', level: 'self', pattern: 'smart', weight: 3 },
  { id: 'fs-clever', level: 'self', pattern: 'clever', weight: 3 },
  { id: 'fs-talented', level: 'self', pattern: 'talented', weight: 3 },
  { id: 'fs-genius', level: 'self', pattern: 'genius', weight: 3 },
  { id: 'fs-good-student', level: 'self', pattern: 'good student', weight: 3 },
  { id: 'fs-proud', level: 'self', pattern: 'proud of you', weight: 2 },
  { id: 'fs-well-done', level: 'self', pattern: 'well done', weight: 2 },
  { id: 'fs-good-job', level: 'self', pattern: 'good job', weight: 2 },
  { id: 'fs-great-work', level: 'self', pattern: 'great work', weight: 2 },
  { id: 'fs-awesome', level: 'self', pattern: 'awesome', weight: 2 },
  { id: 'fs-natural', level: 'self', pattern: 'a natural', weight: 3 },
  { id: 'fs-lazy', level: 'self', pattern: 'lazy', weight: 3 },
  { id: 'fs-careless', level: 'self', pattern: 'careless', weight: 3 },
] as const

/* ==========================================================================
 * SHUTE (2008) GUIDELINES
 * ========================================================================== */

/** One formative-feedback guideline from Shute (2008, Table 3). */
export interface ShuteGuideline {
  id: string
  title: string
  principle: string
  doExample: string
  avoidExample: string
}

/**
 * The seven guidelines the audit enforces, condensed from Shute's (2008)
 * prescriptive tables (focus on the task, specific, nonevaluative,
 * manageable volume, scaffolded, process-oriented, self-regulation
 * oriented).
 */
export const SHUTE_GUIDELINES: readonly ShuteGuideline[] = [
  {
    id: 'shute-task-focus',
    title: 'Focus feedback on the task, not the learner',
    principle:
      'Person-directed feedback draws attention to the self and away from the task, ' +
      'which Feedback Intervention Theory predicts will depress performance.',
    doExample: 'Step 3 drops the negative sign; redistribute and re-expand.',
    avoidExample: 'You are careless with signs.',
  },
  {
    id: 'shute-specific',
    title: 'Be specific and clear',
    principle:
      'Specific feedback referencing features of the response supports learning; ' +
      'general or cryptic feedback does not.',
    doExample: 'Your second paragraph claims causation but only shows correlation.',
    avoidExample: 'This needs work.',
  },
  {
    id: 'shute-nonevaluative',
    title: 'Keep the tone nonevaluative',
    principle:
      'Nonevaluative, descriptive language keeps attention on the work; evaluative ' +
      'language (grades, comparisons, judgments of worth) invites ego involvement.',
    doExample: 'Two of the three required conditions are verified; the third is assumed.',
    avoidExample: 'Disappointing compared to your classmates.',
  },
  {
    id: 'shute-manageable',
    title: 'Keep the volume manageable',
    principle:
      'Learners cannot act on a flood of comments; prioritize the one or two ' +
      'changes with the largest learning value.',
    doExample: 'Fix the sign error first; the arithmetic after it is correct.',
    avoidExample: 'A ten-point checklist covering every flaw at once.',
  },
  {
    id: 'shute-scaffold',
    title: 'Scaffold, do not give the answer',
    principle:
      'Hints, cues and worked steps preserve the learner’s generation effort; ' +
      'stating the solution removes it.',
    doExample: 'What happens to the total when one addend doubles?',
    avoidExample: 'The answer is 42.',
  },
  {
    id: 'shute-process-level',
    title: 'Include process-level feedback',
    principle:
      'Feedback about strategies and methods transfers to new tasks; task-only ' +
      'feedback stays tied to the current problem.',
    doExample: 'Estimating the magnitude before computing would have flagged the slip.',
    avoidExample: 'Only marking the final answer wrong.',
  },
  {
    id: 'shute-self-regulation',
    title: 'Prompt self-regulation',
    principle:
      'Feedback that asks learners to verify, predict, and monitor builds the ' +
      'self-regulation skills that sustain learning without a teacher.',
    doExample: 'Before submitting, check your answer against the boundary case x = 0.',
    avoidExample: 'Telling the learner exactly what to fix with no verification step.',
  },
] as const

/* ==========================================================================
 * CANONICAL FORMATIVE SCENARIOS
 * ========================================================================== */

/**
 * Schema mirror of the engine's FeedbackScenarioSchema, kept here so content
 * can be validated standalone (the engine re-validates at boundaries).
 */
const ScenarioOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  isCorrect: z.boolean(),
  misconceptionTag: z.string().optional(),
  feedback: z.object({
    task: z.string().min(1),
    process: z.string().min(1),
    selfRegulation: z.string().min(1),
  }),
})

const ScenarioSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  concept: z.string().min(1),
  difficulty: z.number().int().min(1).max(5),
  stem: z.string().min(1),
  options: z.array(ScenarioOptionSchema).min(2),
  explanation: z.string().min(1),
})

type StoredScenario = z.infer<typeof ScenarioSchema>

const RAW_SCENARIOS: StoredScenario[] = [
  {
    id: 'fb-math-fraction-addition',
    domain: 'Mathematics',
    concept: 'Adding fractions with unlike denominators',
    difficulty: 2,
    stem: 'What is 1/2 + 1/3?',
    options: [
      {
        id: 'a',
        text: '2/5',
        isCorrect: false,
        misconceptionTag: 'add-numerators-and-denominators',
        feedback: {
          task:
            'The answer 2/5 is incorrect: numerators and denominators were each added ' +
            'straight across, which is not how fraction addition works.',
          process:
            'Use the common-denominator strategy: rewrite each fraction with the least ' +
            'common denominator (6), then add the numerators only: 3/6 + 2/6.',
          selfRegulation:
            'Verify with a magnitude check: 1/2 is 0.5 and 1/3 is about 0.33, so the ' +
            'sum must be near 0.83. Ask yourself: is 2/5 (0.4) anywhere near that?',
        },
      },
      {
        id: 'b',
        text: '5/6',
        isCorrect: true,
        feedback: {
          task: 'Correct: 1/2 + 1/3 = 3/6 + 2/6 = 5/6.',
          process:
            'You found a common denominator before adding numerators — the strategy ' +
            'that generalizes to any unlike-denominator pair.',
          selfRegulation:
            'Keep the magnitude-check habit: 5/6 ≈ 0.83 sits between 0.5 and 1, ' +
            'exactly where the sum of 0.5 and 0.33 should land.',
        },
      },
      {
        id: 'c',
        text: '1/5',
        isCorrect: false,
        misconceptionTag: 'keep-numerator-add-denominators',
        feedback: {
          task:
            'The answer 1/5 is incorrect: the numerators were not converted to a ' +
            'common denominator before combining.',
          process:
            'Rewrite both fractions over 6 first. Multiplying denominators gives a ' +
            'common base; then scale each numerator by the same factor you used on ' +
            'its denominator.',
          selfRegulation:
            'Sanity-check against the larger addend: a sum must exceed each part. ' +
            '1/5 is smaller than 1/2, which is impossible for 1/2 + 1/3.',
        },
      },
      {
        id: 'd',
        text: '2/6',
        isCorrect: false,
        misconceptionTag: 'common-denominator-without-scaling',
        feedback: {
          task:
            'The answer 2/6 is incorrect: the common denominator 6 is right, but the ' +
            'numerators were not scaled to match it.',
          process:
            'When you move 1/2 to sixths, multiply numerator and denominator by 3 to ' +
            'get 3/6; moving 1/3 to sixths gives 2/6. Then add: 5/6.',
          selfRegulation:
            'Track invariance: each rewritten fraction must stay equal to its ' +
            'original. Check yourself: does 1/6 equal 1/2? If not, the scaling step broke.',
        },
      },
    ],
    explanation:
      'Fraction addition requires a shared unit: sixths here. 1/2 = 3/6 and ' +
      '1/3 = 2/6, so the sum is 5/6.',
  },
  {
    id: 'fb-math-distribution-negative',
    domain: 'Mathematics',
    concept: 'Distributing a negative factor',
    difficulty: 3,
    stem: 'Expand −3(x − 4).',
    options: [
      {
        id: 'a',
        text: '−3x − 12',
        isCorrect: false,
        misconceptionTag: 'negative-times-negative-stays-negative',
        feedback: {
          task:
            'Incorrect: −3(x − 4) gives −3x + 12, not −3x − 12. The second product, ' +
            '(−3)(−4), is positive 12.',
          process:
            'Distribute term by term and track signs explicitly: write each product ' +
            'with its sign before simplifying: (−3)(x) = −3x; (−3)(−4) = +12.',
          selfRegulation:
            'Test with a number: set x = 5. Then −3(5 − 4) = −3(1) = −3, but your ' +
            'expansion gives −15 − 12 = −27. A mismatch means re-check the signs.',
        },
      },
      {
        id: 'b',
        text: '−3x + 12',
        isCorrect: true,
        feedback: {
          task: 'Correct: −3(x − 4) = −3x + 12.',
          process:
            'You applied the distributive property to both terms and flipped the ' +
            'second sign because a negative times a negative is positive.',
          selfRegulation:
            'The substitution check (x = 5 gives −3 both ways) is worth keeping — ' +
            'it catches sign slips before they spread through later steps.',
        },
      },
      {
        id: 'c',
        text: '−3x − 4',
        isCorrect: false,
        misconceptionTag: 'distribute-to-first-term-only',
        feedback: {
          task:
            'Incorrect: the −3 was only multiplied into the first term. Distribution ' +
            'must reach every term inside the parentheses.',
          process:
            'Underline each term inside the parentheses and draw an arrow from the ' +
            'outer factor to each one — the visual loop prevents dropping the second term.',
          selfRegulation:
            'Count terms before and after: a two-term binomial expands to two ' +
            'products. Ask yourself: did every term get multiplied?',
        },
      },
      {
        id: 'd',
        text: '3x + 12',
        isCorrect: false,
        misconceptionTag: 'leading-sign-dropped',
        feedback: {
          task:
            'Incorrect: the leading factor is −3, so the first product must be −3x; ' +
            'the negative sign was dropped.',
          process:
            'Circle the sign of the outer factor first, then distribute. Sign-first ' +
            'processing makes the leading sign impossible to lose.',
          selfRegulation:
            'Verify by substitution: x = 5 makes the original −3, but your expansion ' +
            'makes +27. A sign flip somewhere — find which product went wrong.',
        },
      },
    ],
    explanation:
      'The distributive property requires multiplying every term: (−3)(x) = −3x ' +
      'and (−3)(−4) = +12, giving −3x + 12.',
  },
  {
    id: 'fb-physics-newton-third',
    domain: 'Physics',
    concept: "Newton's third law — action-reaction pairs",
    difficulty: 3,
    stem:
      'A book rests on a table. Newton’s third law says forces come in pairs. ' +
      'Which force is the reaction pair to the Earth pulling the book down?',
    options: [
      {
        id: 'a',
        text: 'The table pushing the book up (normal force)',
        isCorrect: false,
        misconceptionTag: 'normal-force-as-reaction-pair',
        feedback: {
          task:
            'Incorrect: the normal force is NOT the third-law partner of the Earth’s ' +
            'gravitational pull — both act on the SAME body (the book), and ' +
            'action-reaction pairs always act on different bodies.',
          process:
            'Use the swap test for third-law pairs: reverse subject and object of ' +
            'the interaction. "Earth pulls book" swaps to "book pulls Earth" — ' +
            'that reversed pair is the reaction.',
          selfRegulation:
            'Before choosing, list the bodies each candidate force acts ON. If two ' +
            'forces act on the same body, they cannot be a third-law pair, whatever ' +
            'their magnitudes.',
        },
      },
      {
        id: 'b',
        text: 'The book pulling the Earth up',
        isCorrect: true,
        feedback: {
          task:
            'Correct: the reaction to the Earth pulling the book down is the book ' +
            'pulling the Earth up with equal magnitude.',
          process:
            'You applied the swap test: third-law pairs are the same interaction ' +
            'with subject and object reversed, and they never cancel because they ' +
            'act on different bodies.',
          selfRegulation:
            'Keep asking "on which body does each force act?" — that single question ' +
            'dissolves most third-law confusions, including this classic one.',
        },
      },
      {
        id: 'c',
        text: 'The book’s inertia resisting the fall',
        isCorrect: false,
        misconceptionTag: 'inertia-as-force',
        feedback: {
          task:
            'Incorrect: inertia is not a force at all, so it cannot be a reaction ' +
            'pair. It is the tendency of mass to resist acceleration.',
          process:
            'Inventory the real interactions first: book-Earth (gravity) and ' +
            'book-table (contact). Third-law pairs live inside one interaction, ' +
            'never across two.',
          selfRegulation:
            'Flag any answer that names a property (inertia, momentum, energy) as a ' +
            'force. Ask yourself: is this an interaction between two bodies, or a ' +
            'property of one body?',
        },
      },
      {
        id: 'd',
        text: 'Friction between the book and the table',
        isCorrect: false,
        misconceptionTag: 'wrong-interaction-pair',
        feedback: {
          task:
            'Incorrect: friction acts horizontally between book and table and is not ' +
            'paired with the vertical gravitational pull.',
          process:
            'Match pairs by interaction TYPE and DIRECTION: gravity pairs with ' +
            'gravity (reversed), contact with contact. A vertical pull cannot pair ' +
            'with a horizontal contact force.',
          selfRegulation:
            'Sketch a quick free-body diagram and draw each force arrow with its ' +
            'partner on the other body. If an arrow has no reversed twin on the ' +
            'other body, it is unpaired.',
        },
      },
    ],
    explanation:
      'Third-law pairs are two halves of ONE interaction acting on two DIFFERENT ' +
      'bodies: Earth pulls book; book pulls Earth. The normal force balances the ' +
      'book’s weight but belongs to the book-table interaction.',
  },
  {
    id: 'fb-stats-correlation-causation',
    domain: 'Statistics',
    concept: 'Correlation does not imply causation',
    difficulty: 2,
    stem:
      'A city finds that months with more ice-cream sales also have more ' +
      'drownings. What is the best interpretation?',
    options: [
      {
        id: 'a',
        text: 'Ice-cream sales cause drownings',
        isCorrect: false,
        misconceptionTag: 'correlation-implies-causation',
        feedback: {
          task:
            'Incorrect: the data show association only. A causal claim needs a ' +
            'mechanism plus control of confounders — neither is given here.',
          process:
            'Before accepting causation, hunt for confounders: a third variable that ' +
            'drives both. Season (summer heat) raises ice-cream sales AND swimming ' +
            'exposure, producing the correlation with no causal arrow.',
          selfRegulation:
            'Adopt the reflex question: "What third variable could explain both?" ' +
            'If you can name one plausible confounder, causation is unproven.',
        },
      },
      {
        id: 'b',
        text: 'Drownings cause ice-cream sales',
        isCorrect: false,
        misconceptionTag: 'reverse-causation',
        feedback: {
          task:
            'Incorrect: reversing the arrow does not fix the core problem — the data ' +
            'still show correlation, and reverse causation is implausible here.',
          process:
            'Test candidate directions against mechanism and timing. A confounder ' +
            '(summer) explains both series better than either causal direction.',
          selfRegulation:
            'Enumerate all three templates before concluding: A→B, B→A, or C→both. ' +
            'Checking only one direction is the reverse-causation trap.',
        },
      },
      {
        id: 'c',
        text: 'A confounding variable (summer heat) likely drives both',
        isCorrect: true,
        feedback: {
          task:
            'Correct: the association is most parsimoniously explained by a ' +
            'confounder — hot months raise both ice-cream sales and swimming, ' +
            'hence drownings.',
          process:
            'You separated association from causation and named a concrete ' +
            'confounding mechanism — the exact move that turns a spurious ' +
            'correlation into an interpretable one.',
          selfRegulation:
            'Keep the three-template check (A→B, B→A, C→both) as a pre-conclusion ' +
            'habit for every observational claim you read or write.',
        },
      },
      {
        id: 'd',
        text: 'The correlation must be a coincidence with no explanation',
        isCorrect: false,
        misconceptionTag: 'dismissing-systematic-association',
        feedback: {
          task:
            'Incorrect: the association is systematic, not random — dismissing it ' +
            'misses the real (confounded) structure in the data.',
          process:
            'A strong repeated correlation is evidence of SOMETHING; the analytic ' +
            'task is locating its source. Confounders, not coincidence, are the ' +
            'first hypothesis to test.',
          selfRegulation:
            'Ask "what process would regenerate this pattern next year?" A pattern ' +
            'with a regenerating mechanism (seasons) is not coincidence.',
        },
      },
    ],
    explanation:
      'Ice-cream sales and drownings covary because both rise in hot months. The ' +
      'correlation is real but the causal arrow is absent — classic confounding.',
  },
  {
    id: 'fb-code-off-by-one',
    domain: 'Programming',
    concept: 'Loop bounds and off-by-one errors',
    difficulty: 2,
    stem:
      'In JavaScript, what does this print?\n' +
      'let s = 0; for (let i = 1; i <= 10; i++) { s += i } console.log(s)',
    options: [
      {
        id: 'a',
        text: '45',
        isCorrect: false,
        misconceptionTag: 'exclusive-upper-bound-assumption',
        feedback: {
          task:
            'Incorrect: the condition is i <= 10, so 10 IS included and the sum is ' +
            '55, not 45.',
          process:
            'Trace the boundary iterations explicitly: write the first and last ' +
            'values the loop variable takes (1 and 10). Most off-by-one errors live ' +
            'at the boundaries, not in the middle.',
          selfRegulation:
            'Cross-check with the closed form n(n+1)/2 = 10·11/2 = 55. When a loop ' +
            'sums a range, verify the total against the formula before moving on.',
        },
      },
      {
        id: 'b',
        text: '55',
        isCorrect: true,
        feedback: {
          task: 'Correct: 1 + 2 + … + 10 = 55.',
          process:
            'You read the inclusive bound (i <= 10) correctly and summed all ten ' +
            'integers — boundary-first tracing pays off.',
          selfRegulation:
            'The formula check (n(n+1)/2) is a two-second verification; keep it as ' +
            'your standard loop-total audit.',
        },
      },
      {
        id: 'c',
        text: '10',
        isCorrect: false,
        misconceptionTag: 'loop-variable-not-accumulator',
        feedback: {
          task:
            'Incorrect: s accumulates the running sum of i values; it is not the ' +
            'final value of the loop variable i.',
          process:
            'Separate the two roles: i is the counter, s is the accumulator. Trace ' +
            'two full iterations writing both variables side by side.',
          selfRegulation:
            'Name your variables for their role (total instead of s) and ask: "what ' +
            'does this variable hold after iteration k?"',
        },
      },
      {
        id: 'd',
        text: 'undefined',
        isCorrect: false,
        misconceptionTag: 'scope-misreading',
        feedback: {
          task:
            'Incorrect: s is declared with let before the loop and remains in scope ' +
            'for the console.log call, so it prints a number.',
          process:
            'Check declaration order: let s = 0 runs first in the same block as the ' +
            'log, so s is initialized and in scope.',
          selfRegulation:
            'When you suspect a scope issue, mark each variable’s declaration line ' +
            'and the block it belongs to before predicting any output.',
        },
      },
    ],
    explanation:
      'The loop runs i from 1 through 10 inclusive and accumulates into s: ' + '10·11/2 = 55.',
  },
]

RAW_SCENARIOS.push(
  {
    id: 'fb-physics-newton-third',
    domain: 'Physics',
    concept: "Newton's third law: force pairs act on different bodies",
    difficulty: 3,
    stem: "A book rests on a table. Which pair of forces is a Newton's-third-law action-reaction pair?",
    options: [
      {
        id: 'a',
        text: 'The weight of the book and the normal force from the table on the book',
        isCorrect: false,
        misconceptionTag: 'same-body-force-pair',
        feedback: {
          task: 'Incorrect: weight and normal force both act on the book, and third-law pairs always act on different bodies.',
          process:
            'Use the swap test: an action-reaction pair has the form "A pushes B" and "B pushes A". Weight is Earth pulling the book; its partner is the book pulling Earth.',
          selfRegulation:
            'Before naming a pair, ask: would these two forces still balance if one body vanished? Weight and normal force both disappear-or-apply to the book alone, so they cannot be a third-law pair.',
        },
      },
      {
        id: 'b',
        text: 'The book pulling down on the Earth and the Earth pulling up on the book',
        isCorrect: true,
        feedback: {
          task: 'Correct: the gravitational pull of Earth on the book and of the book on Earth are the action-reaction pair.',
          process:
            'You applied the swap test: two bodies, one interaction, two equal and opposite forces.',
          selfRegulation:
            'Notice the pair survives any motion: even if the book falls, both pulls remain equal and opposite.',
        },
      },
      {
        id: 'c',
        text: 'The normal force from the table and the friction force on the book',
        isCorrect: false,
        misconceptionTag: 'unrelated-force-pairing',
        feedback: {
          task: 'Incorrect: normal force and friction act at right angles and answer different interactions; they are not a third-law pair.',
          process:
            'Third-law pairs are always the same kind of force (both gravitational, both contact-normal, both friction). Pair forces by interaction type first.',
          selfRegulation:
            'Check direction: third-law partners are exactly opposite along one line. Normal is vertical, friction is horizontal, so they fail that test instantly.',
        },
      },
      {
        id: 'd',
        text: 'The weight of the book and the push of the book on the table',
        isCorrect: false,
        misconceptionTag: 'equal-forces-must-be-pair',
        feedback: {
          task: 'Incorrect: these two forces are equal here but are different kinds (gravitational vs contact) and act on different interactions.',
          process:
            'Equality is not the criterion; shared interaction is. The partner of "book pushes table" is "table pushes book" (the normal force).',
          selfRegulation:
            'Ask "same interaction, two bodies?" If the two forces come from different interactions, equal size is a coincidence of equilibrium, not a third-law pair.',
        },
      },
    ],
    explanation:
      "Newton's third law pairs one interaction between two bodies: Earth pulls the book, the book pulls Earth. The table-book normal force has its own partner, the book pushing down on the table. Same-body pairs like weight and normal force are equilibrium pairs, not third-law pairs, and they cease to balance the moment the book accelerates.",
  },
  {
    id: 'fb-chem-balancing',
    domain: 'Chemistry',
    concept: 'Conservation of atoms when balancing equations',
    difficulty: 2,
    stem: 'Balance: H2 + O2 -> H2O. Which is correctly balanced?',
    options: [
      {
        id: 'a',
        text: 'H2 + O2 -> H2O2',
        isCorrect: false,
        misconceptionTag: 'change-formula-to-balance',
        feedback: {
          task: 'Incorrect: the product formula was changed to H2O2 (hydrogen peroxide), a different substance, to force atom counts to match.',
          process:
            'Balance with coefficients only, never by editing subscripts: subscripts define the substance. Put a 2 in front of H2O and a 2 in front of H2.',
          selfRegulation:
            'After balancing, re-read every formula and ask: is this still the same chemical? If a subscript moved, you changed the reaction, not balanced it.',
        },
      },
      {
        id: 'b',
        text: '2H2 + O2 -> 2H2O',
        isCorrect: true,
        feedback: {
          task: 'Correct: 4 H and 2 O on each side; atoms are conserved.',
          process:
            'You scaled whole molecules with coefficients: 2 water molecules need 2 hydrogen molecules and 1 oxygen molecule.',
          selfRegulation:
            'Keep the audit habit: count each element left and right before declaring done. 4=4 and 2=2 closes the check.',
        },
      },
      {
        id: 'c',
        text: 'H2 + O2 -> 2H2O',
        isCorrect: false,
        misconceptionTag: 'balance-one-element-only',
        feedback: {
          task: 'Incorrect: oxygen balances (2 each side) but hydrogen does not: 2 H on the left, 4 H on the right.',
          process:
            'Balance one element, then re-audit the others. Fixing oxygen changed the hydrogen count, so hydrogen needs its own coefficient: 2H2.',
          selfRegulation:
            'Treat balancing as a loop, not a line: every new coefficient sends you back to recount every element it touches.',
        },
      },
      {
        id: 'd',
        text: '2H2 + 2O2 -> 2H2O',
        isCorrect: false,
        misconceptionTag: 'multiply-everything',
        feedback: {
          task: 'Incorrect: hydrogen balances (4=4) but oxygen does not: 4 O on the left, 2 O on the right.',
          process:
            'Coefficients must reflect the ratio the formulas force. Water holds one O, so O2 feeds two waters; only one O2 is needed.',
          selfRegulation:
            'Resist symmetric-looking answers. Count atoms per element separately; symmetry of coefficients is not a conservation law.',
        },
      },
    ],
    explanation:
      'Balancing conserves each element atom-by-atom. Coefficients scale whole molecules; subscripts define the substances and must never move. The balanced reaction 2H2 + O2 -> 2H2O keeps 4 H and 2 O on both sides.',
  },
  {
    id: 'fb-bio-photosynthesis-source',
    domain: 'Biology',
    concept: 'Mass source of plant growth',
    difficulty: 3,
    stem: 'A tree gains 100 kg of dry mass over a decade. Where does most of that mass come from?',
    options: [
      {
        id: 'a',
        text: 'The soil, drawn up through the roots',
        isCorrect: false,
        misconceptionTag: 'mass-from-soil',
        feedback: {
          task: "Incorrect: soil contributes minerals and water but only a tiny fraction of dry mass; van Helmont's willow experiment showed the soil barely loses weight as a tree grows.",
          process:
            'Track the atoms: the carbon in wood arrives via photosynthesis, which fixes CO2 from the air into sugars.',
          selfRegulation:
            'When a growth question appears, ask where the carbon came from. Carbon accounting almost always points to the air, not the ground.',
        },
      },
      {
        id: 'b',
        text: 'Carbon dioxide from the air',
        isCorrect: true,
        feedback: {
          task: 'Correct: most dry mass is carbon fixed from atmospheric CO2 during photosynthesis.',
          process:
            'You followed the carbon: CO2 plus water, powered by light, becomes glucose, the raw material of cellulose.',
          selfRegulation:
            'Hold the counterintuitive picture firmly: solid wood is mostly former air. Air is thin but the tree has years and a huge leaf area.',
        },
      },
      {
        id: 'c',
        text: 'Water absorbed by the roots',
        isCorrect: false,
        misconceptionTag: 'mass-from-water',
        feedback: {
          task: 'Partially reasonable but incorrect as the main source: water is a reactant, yet most of it transpires away and its hydrogen is a small share of dry mass.',
          process:
            'Separate flux from stock: enormous water flow through the tree does not mean water becomes the tree. The fixed carbon stays; the water leaves.',
          selfRegulation:
            'Ask what remains behind. A decade of water flow is vast, but the dry mass question concerns what was kept, and what is kept is carbon.',
        },
      },
      {
        id: 'd',
        text: 'Sunlight converted directly into matter',
        isCorrect: false,
        misconceptionTag: 'energy-becomes-matter',
        feedback: {
          task: 'Incorrect: sunlight provides energy, not atoms; everyday chemistry does not convert energy into macroscopic mass.',
          process:
            'Split the roles: light powers the reaction, CO2 supplies the carbon, water supplies hydrogen. Matter in, matter out; energy in, work done.',
          selfRegulation:
            'Guard the matter/energy boundary: whenever an explanation converts one into the other outside nuclear processes, flag it and recount the atoms.',
        },
      },
    ],
    explanation:
      'Photosynthesis fixes atmospheric CO2 into glucose, which polymerizes into cellulose, the bulk of dry plant mass. Water contributes some hydrogen but mostly transpires away, soil contributes only minerals, and sunlight supplies energy rather than atoms.',
  },
  {
    id: 'fb-prog-off-by-one',
    domain: 'Programming',
    concept: 'Loop bounds and off-by-one errors',
    difficulty: 2,
    stem: 'In Python, what does sum(list(range(1, 11))) compute?',
    options: [
      {
        id: 'a',
        text: 'The sum of 1 through 11 inclusive',
        isCorrect: false,
        misconceptionTag: 'range-end-inclusive',
        feedback: {
          task: 'Incorrect: range(1, 11) stops before 11, so it yields 1 through 10 only.',
          process:
            'Remember the half-open convention: range(start, stop) includes start and excludes stop. Check the stop value against the first missing number.',
          selfRegulation:
            'When a range feels off, list its first three and last value explicitly: 1, 2, 3 ... 10. Seeing the last value settles the bound faster than re-reading the signature.',
        },
      },
      {
        id: 'b',
        text: 'The sum of 1 through 10 inclusive, which is 55',
        isCorrect: true,
        feedback: {
          task: 'Correct: range(1, 11) yields 1..10 and the sum is 55.',
          process:
            'You applied the half-open rule and verified with the n(n+1)/2 formula for n = 10.',
          selfRegulation:
            'Keep pairing code reading with a formula or tiny manual trace; the two cross-check each other.',
        },
      },
      {
        id: 'c',
        text: 'The sum of 0 through 10 inclusive',
        isCorrect: false,
        misconceptionTag: 'range-start-confusion',
        feedback: {
          task: 'Incorrect: range(1, 11) starts at 1, not 0; the explicit start argument overrides the default.',
          process:
            'Check the arguments positionally: the first is the start. Only a bare range(n) begins at 0.',
          selfRegulation:
            'Read argument lists aloud as start/stop when two are present; the habit prevents blending this with the one-argument form.',
        },
      },
      {
        id: 'd',
        text: 'It raises an error because ranges cannot be summed',
        isCorrect: false,
        misconceptionTag: 'lazy-sequence-misconception',
        feedback: {
          task: 'Incorrect: list() materializes the range into a real list, and sum() works on any iterable of numbers, lazy or not.',
          process:
            'Separate the two operations: list(range(...)) builds [1..10]; sum(...) then adds them. Each step is ordinary.',
          selfRegulation:
            'Before predicting an error, name the exact function you expect to fail and why. Vague error predictions usually mark an unexamined step.',
        },
      },
    ],
    explanation:
      'Python ranges are half-open: range(1, 11) includes 1 and excludes 11, yielding 1..10. sum() then adds them to 55, which the n(n+1)/2 formula with n = 10 confirms.',
  },
  {
    id: 'fb-stats-correlation-causation',
    domain: 'Statistics',
    concept: 'Correlation does not establish causation',
    difficulty: 3,
    stem: 'Cities with more firefighters at a fire tend to have more fire damage. What is the best interpretation?',
    options: [
      {
        id: 'a',
        text: 'Firefighters cause additional damage, so fewer should be sent',
        isCorrect: false,
        misconceptionTag: 'reverse-causation-miss',
        feedback: {
          task: 'Incorrect: the correlation runs through fire size, not through firefighters causing harm.',
          process:
            'Draw the causal arrows: bigger fires call more firefighters and also cause more damage. Fire size is a confounder driving both.',
          selfRegulation:
            'Whenever an intervention looks harmful in observational data, ask what forced the intervention. Need-driven assignment mimics harm.',
        },
      },
      {
        id: 'b',
        text: 'Larger fires require more firefighters and cause more damage; fire size confounds the link',
        isCorrect: true,
        feedback: {
          task: 'Correct: fire size drives both variables, producing the correlation without firefighters causing damage.',
          process:
            'You searched for a third variable before accepting either direct-causation direction, the standard confounder check.',
          selfRegulation:
            'Keep the habit: for any X-Y correlation, list plausible confounders and reverse-causation stories before any causal claim.',
        },
      },
      {
        id: 'c',
        text: 'The correlation proves nothing at all and the data should be discarded',
        isCorrect: false,
        misconceptionTag: 'correlation-is-useless',
        feedback: {
          task: 'Too strong: correlation does not prove causation, but it is still evidence that constrains which causal stories fit.',
          process:
            'Use correlation as a screen, not a verdict: it rules out independence and invites a causal model, which the confounder analysis then supplies.',
          selfRegulation:
            'Replace "correlation is meaningless" with "correlation needs a causal model". The first throws away signal; the second uses it.',
        },
      },
      {
        id: 'd',
        text: 'Damage causes more firefighters to be sent, so the correlation is causal after all',
        isCorrect: false,
        misconceptionTag: 'confounder-as-cause',
        feedback: {
          task: 'Partially right but incomplete: damage does not summon firefighters; fire size does, and damage is its sibling outcome, not the cause.',
          process:
            'Order events in time: the fire grows, then crews are dispatched, then damage accrues. Damage cannot cause the dispatch it follows.',
          selfRegulation:
            'Sketch a timeline before accepting reverse causation; effects cannot precede their causes, and that single check kills many reversed stories.',
        },
      },
    ],
    explanation:
      'Fire size confounds the firefighter-damage correlation: larger fires summon more crews and cause more damage. Before claiming causation, check confounders, reverse causation against a timeline, and remember correlation still screens out independence.',
  },
  {
    id: 'fb-lang-comma-splice',
    domain: 'Language',
    concept: 'Comma splices between independent clauses',
    difficulty: 2,
    stem: 'Which sentence is punctuated correctly?',
    options: [
      {
        id: 'a',
        text: 'The experiment failed, we repeated it with fresh samples.',
        isCorrect: false,
        misconceptionTag: 'comma-splice',
        feedback: {
          task: 'Incorrect: two independent clauses are joined by a bare comma, a comma splice.',
          process:
            'Test each side: both parts stand alone as sentences, so the join needs a period, a semicolon, or a coordinating conjunction after the comma.',
          selfRegulation:
            'Read the clauses aloud separately; if each is a full sentence, a comma alone cannot hold them.',
        },
      },
      {
        id: 'b',
        text: 'The experiment failed, so we repeated it with fresh samples.',
        isCorrect: true,
        feedback: {
          task: 'Correct: the coordinating conjunction "so" after the comma legally joins two independent clauses.',
          process:
            'You supplied the FANBOYS check: comma plus for/and/nor/but/or/yet/so joins independent clauses correctly.',
          selfRegulation:
            'Keep the two-fix toolkit ready: add a conjunction, or upgrade the comma to a semicolon. Choosing deliberately beats punctuating by feel.',
        },
      },
      {
        id: 'c',
        text: 'The experiment failed we repeated it with fresh samples.',
        isCorrect: false,
        misconceptionTag: 'run-on',
        feedback: {
          task: 'Incorrect: the clauses run together with no punctuation or conjunction at all.',
          process:
            'Same stand-alone test, harsher verdict: the splice removed the only boundary marker. Add a conjunction with a comma, or split the sentence.',
          selfRegulation:
            'Mark clause boundaries while drafting; a sentence with two complete thoughts and no join is always a fragment of revision, not a style.',
        },
      },
      {
        id: 'd',
        text: 'The experiment, failed we repeated it, with fresh samples.',
        isCorrect: false,
        misconceptionTag: 'comma-sprinkling',
        feedback: {
          task: 'Incorrect: commas were added but in the wrong places, splitting the subject from its verb and the verb from its object phrase.',
          process:
            'Commas mark boundaries that exist; they do not create them. Find the real clause boundary (after "failed") and put exactly one correct join there.',
          selfRegulation:
            'Never fix a splice by adding more commas. Diagnose the boundary first, then punctuate the boundary, not the neighbourhood.',
        },
      },
    ],
    explanation:
      'Two independent clauses need a real join: a period, a semicolon, or a comma plus a coordinating conjunction (FANBOYS). A bare comma is a splice; no punctuation is a run-on; random commas near the boundary are not a fix.',
  },
  {
    id: 'fb-history-causation',
    domain: 'History',
    concept: 'Single-cause versus multi-causal explanation',
    difficulty: 4,
    stem: 'Which is the strongest explanation for the outbreak of World War I in 1914?',
    options: [
      {
        id: 'a',
        text: 'The assassination of Franz Ferdinand alone caused the war',
        isCorrect: false,
        misconceptionTag: 'single-cause-fallacy',
        feedback: {
          task: 'Incorrect: the assassination was the trigger, but identical crises had been defused before; the alliance system, arms race and mobilization timetables made 1914 different.',
          process:
            'Separate trigger from underlying causes: ask what had to be true for one assassination to drag every great power in within weeks.',
          selfRegulation:
            'When a single event is credited with a huge outcome, list the background conditions that gave the event its power. Trigger and tinder are different claims.',
        },
      },
      {
        id: 'b',
        text: 'A web of alliances, militarism, imperial rivalry and mobilization plans made war likely; the assassination triggered it',
        isCorrect: true,
        feedback: {
          task: 'Correct: structural causes created the conditions; the Sarajevo assassination lit the fuse.',
          process:
            'You layered long-term causes (alliances, arms races), medium-term pressures (imperial rivalry) and the short-term trigger, the standard causal hierarchy.',
          selfRegulation:
            'Keep the three-layer habit: structure, conjuncture, event. Strong historical claims name all three and their interactions.',
        },
      },
      {
        id: 'c',
        text: 'The war was inevitable, so no individual decisions mattered',
        isCorrect: false,
        misconceptionTag: 'overdetermination-fatalism',
        feedback: {
          task: 'Too strong: structural pressure raised the risk, but specific decisions (blank cheque, mobilization orders, rejected mediation) determined timing and scale.',
          process:
            "Test inevitability claims with counterfactuals: had any of several July decisions gone otherwise, the war's timing or scope would plausibly change.",
          selfRegulation:
            'Hold both truths: conditions constrain, agents choose. An explanation that erases either side explains less than the evidence offers.',
        },
      },
      {
        id: 'd',
        text: 'Economic competition was irrelevant; the war was purely a diplomatic accident',
        isCorrect: false,
        misconceptionTag: 'dismiss-structural-causes',
        feedback: {
          task: 'Incorrect: economic and imperial rivalry were central structural pressures; calling the war a pure accident ignores decades of documented tension.',
          process:
            'Check the primary record: prewar staff talks, naval races and colonial disputes are structural evidence, not background noise.',
          selfRegulation:
            'Be suspicious of "accident" explanations for outcomes many actors anticipated; widespread expectation is itself evidence of structure.',
        },
      },
    ],
    explanation:
      'Strong historical explanation layers structure (alliances, militarism, imperial rivalry), conjuncture (July crisis decisions) and trigger (the Sarajevo assassination). Crediting the trigger alone, or declaring the war inevitable, each erase part of the causal story the evidence supports.',
  },
  {
    id: 'fb-study-rereading-vs-retrieval',
    domain: 'Study Skills',
    concept: 'Retrieval practice versus rereading',
    difficulty: 2,
    stem: 'Two students prepare for the same exam. Ana rereads the chapter four times. Omar reads it once, then quizzes himself three times. Who typically retains more a week later, and why?',
    options: [
      {
        id: 'a',
        text: 'Ana, because more exposures mean stronger memory traces',
        isCorrect: false,
        misconceptionTag: 'exposure-count-fallacy',
        feedback: {
          task: 'Incorrect: raw exposure count is a weak predictor; rereading produces fluency, which feels like learning but fades fast (Roediger & Karpicke 2006).',
          process:
            'Weight study acts by demand, not count: retrieval forces reconstruction, which strengthens the trace far more than recognition-style review.',
          selfRegulation:
            'Watch for the fluency illusion: if the page feels familiar, test yourself instead of trusting the feeling.',
        },
      },
      {
        id: 'b',
        text: 'Omar, because each self-quiz is retrieval practice, which strengthens long-term retention more than rereading',
        isCorrect: true,
        feedback: {
          task: 'Correct: the testing effect is one of the most replicated results in learning science; retrieval beats restudy at delay.',
          process:
            'You identified the active ingredient: effortful recall, not re-exposure. Karpicke & Roediger (2008) show the gap grows with delay.',
          selfRegulation:
            'Turn this into a rule for your own sessions: close the book early and spend the saved time retrieving.',
        },
      },
      {
        id: 'c',
        text: 'They will retain the same amount, because total study time was similar',
        isCorrect: false,
        misconceptionTag: 'time-on-task-fallacy',
        feedback: {
          task: 'Incorrect: equal time with different activities yields different retention; the activity, not the clock, drives the outcome.',
          process:
            'Compare mechanism, not minutes: retrieval reconsolidates memory; rereading mainly re-primes perception.',
          selfRegulation:
            'Audit your study log by activity type, not just hours. An hour of recall outperforms an hour of rereading at any delay that matters.',
        },
      },
      {
        id: 'd',
        text: 'Ana, because quizzing only measures knowledge and cannot strengthen it',
        isCorrect: false,
        misconceptionTag: 'test-as-measurement-only',
        feedback: {
          task: 'Incorrect: tests are not neutral instruments; the act of retrieval modifies and strengthens the memory itself.',
          process:
            'Recall is a learning event: each successful retrieval re-encodes the material and cues later access, which is why practice tests double as study.',
          selfRegulation:
            'Reframe every quiz as training, not judgement. The measurement view of testing is the single most common study misconception.',
        },
      },
    ],
    explanation:
      'The testing effect: retrieval practice strengthens long-term retention far more than rereading at any meaningful delay (Roediger & Karpicke 2006; Karpicke & Roediger 2008). Rereading inflates fluency, which masquerades as learning; self-quizzing is both measurement and training.',
  },
  {
    id: 'fb-code-equality-coercion',
    domain: 'Programming',
    concept: 'Strict vs loose equality',
    difficulty: 2,
    stem: "In JavaScript, which expression evaluates to true?\n(A) '5' === 5  (B) '5' == 5  (C) null === undefined  (D) NaN === NaN",
    options: [
      {
        id: 'a',
        text: "'5' === 5",
        isCorrect: false,
        misconceptionTag: 'strict-equality-ignores-type',
        feedback: {
          task:
            "Incorrect: === compares type first; '5' is a string and 5 is a number, " +
            'so the result is false.',
          process:
            'Read === as a two-gate check: types equal, then values equal. If the ' +
            'type gate fails, stop — no coercion ever happens.',
          selfRegulation:
            'Build the habit of saying both operand types out loud before predicting ' +
            'any equality result; type-first reading prevents most coercion bugs.',
        },
      },
      {
        id: 'b',
        text: "'5' == 5",
        isCorrect: true,
        feedback: {
          task:
            "Correct: == coerces the string '5' to the number 5 before comparing, " +
            'so the result is true.',
          process:
            'You distinguished the two operators: == applies type coercion per the ' +
            'Abstract Equality Comparison; === never coerces.',
          selfRegulation:
            'In your own code, default to === and convert explicitly (Number(x)); ' +
            'then every comparison you read is coercion-free.',
        },
      },
      {
        id: 'c',
        text: 'null === undefined',
        isCorrect: false,
        misconceptionTag: 'null-undefined-identity',
        feedback: {
          task:
            'Incorrect: null and undefined are distinct types, so === yields false ' +
            '(only the loose == treats them as equal).',
          process:
            'Memorize the single special case: null == undefined is the one loose ' +
            'pair the spec defines as equal; strict equality still separates them.',
          selfRegulation:
            'Keep a personal coercion cheatsheet of the five famous cases and ' +
            'self-test on it weekly until prediction is automatic.',
        },
      },
      {
        id: 'd',
        text: 'NaN === NaN',
        isCorrect: false,
        misconceptionTag: 'nan-self-equality',
        feedback: {
          task:
            'Incorrect: NaN is the only value not equal to itself; NaN === NaN is ' +
            'false by the IEEE 754 rules JavaScript follows.',
          process: 'Use Number.isNaN(x) to detect NaN — never an equality check.',
          selfRegulation:
            'Attach a tool to every special value you learn: NaN → Number.isNaN, ' +
            '-0 → Object.is. Retrieval of the right tool beats memorized rules.',
        },
      },
    ],
    explanation:
      "Loose equality coerces '5' to 5 and returns true; strict equality compares " +
      'types first. null loosely equals undefined but never strictly, and NaN ' +
      'equals nothing, not even itself.',
  },
  {
    id: 'fb-lang-false-friend',
    domain: 'Language Learning',
    concept: 'False friends (faux amis) in vocabulary',
    difficulty: 3,
    stem:
      'A Spanish speaker learning English says: "I am constipated, so I cannot ' +
      'come to class." In Spanish, constipado means having a cold. What is the ' +
      'best feedback response?',
    options: [
      {
        id: 'a',
        text: 'Laugh and correct the word in front of the class',
        isCorrect: false,
        misconceptionTag: 'ego-involving-correction',
        feedback: {
          task:
            'The word choice is wrong for English (constipated ≠ having a cold), ' +
            'but public correction targets the person, not the error.',
          process:
            'Correct privately and frame it as a cross-linguistic pattern: ' +
            '"Constipado is a false friend — in English use I have a cold." ' +
            'Pattern-framing turns embarrassment into a transferable rule.',
          selfRegulation:
            'Coach the learner to keep a personal false-friends list and review it ' +
            'with spaced retrieval — self-managed lists convert errors into assets.',
        },
      },
      {
        id: 'b',
        text: 'Privately explain the false friend and give the correct phrase',
        isCorrect: true,
        feedback: {
          task:
            'Correct approach: the error is a predictable L1-transfer, and the fix ' +
            'is "I have a cold."',
          process:
            'You separated the linguistic diagnosis (false friend) from the social ' +
            'handling (private, pattern-framed correction) — both halves matter for ' +
            'the feedback to be heard.',
          selfRegulation:
            'Suggest the learner maintain a false-friends deck; self-regulated ' +
            'collection of transfer errors is the durable fix, not one-off correction.',
        },
      },
      {
        id: 'c',
        text: 'Ignore it — meaning was close enough',
        isCorrect: false,
        misconceptionTag: 'error-fossilization-by-neglect',
        feedback: {
          task:
            'The intended meaning was not close: constipated describes a different ' +
            'condition, so listeners will misunderstand.',
          process:
            'Untreated transfer errors fossilize. Low-stakes, immediate, private ' +
            'correction at the moment of use is the highest-leverage point to ' +
            'intervene.',
          selfRegulation:
            'Track which errors you let pass; if the same false friend recurs, that ' +
            'is the signal it needed explicit correction the first time.',
        },
      },
      {
        id: 'd',
        text: 'Tell the learner their Spanish is interfering and to stop using it',
        isCorrect: false,
        misconceptionTag: 'l1-suppression-advice',
        feedback: {
          task:
            'The diagnosis (L1 transfer) is right but the advice is wrong: the first ' +
            'language cannot and should not be "turned off".',
          process:
            'Use the L1 as scaffolding: contrast constipado/constipated explicitly. ' +
            'Contrastive analysis converts interference into a discrimination exercise.',
          selfRegulation:
            'Have the learner predict transfer risk before speaking: "Does this word ' +
            'have a Spanish look-alike?" Prediction before production builds monitoring.',
        },
      },
    ],
    explanation:
      'False friends are cross-linguistic look-alikes with different meanings. The ' +
      'effective response is private, pattern-framed correction plus a learner-owned ' +
      'list for spaced review.',
  },
  {
    id: 'fb-physics-projectile',
    domain: 'Physics',
    concept: 'Independence of horizontal and vertical motion',
    difficulty: 4,
    stem:
      'Two balls leave a table edge at the same instant: one is dropped straight ' +
      'down, the other launched horizontally. Ignoring air resistance, which hits ' +
      'the floor first?',
    options: [
      {
        id: 'a',
        text: 'The dropped ball, because it has no horizontal motion',
        isCorrect: false,
        misconceptionTag: 'horizontal-speed-delays-fall',
        feedback: {
          task:
            'Incorrect: both balls hit at the same time. Vertical fall time depends ' +
            'only on height and g — horizontal speed does not change it.',
          process:
            'Decompose the motion into perpendicular components and analyze each ' +
            'with its own equation: vertical y = ½gt² is identical for both balls.',
          selfRegulation:
            'When an intuition says "faster overall means sooner", test the ' +
            'components separately before trusting it. Independence of components ' +
            'is the tool that overrules this intuition.',
        },
      },
      {
        id: 'b',
        text: 'The launched ball, because it is moving faster overall',
        isCorrect: false,
        misconceptionTag: 'speed-conflates-components',
        feedback: {
          task:
            'Incorrect: greater total speed does not shorten the fall — only the ' +
            'vertical component determines fall time, and both balls start with zero.',
          process:
            'Write the vertical equation for each ball side by side. Identical ' +
            'initial vertical velocity (0), identical height, identical g ⇒ ' +
            'identical time.',
          selfRegulation:
            'Ask "which component does this quantity actually depend on?" before ' +
            'comparing magnitudes; component-first analysis blocks this confusion.',
        },
      },
      {
        id: 'c',
        text: 'They land at the same time',
        isCorrect: true,
        feedback: {
          task:
            'Correct: equal height and equal initial vertical velocity (zero) give ' +
            'equal fall times, regardless of horizontal launch speed.',
          process:
            'You applied component independence: horizontal motion and vertical ' +
            'motion evolve separately, linked only by sharing the same clock.',
          selfRegulation:
            'Keep the decomposition habit: whenever two motions look coupled, write ' +
            'each axis separately and let the equations arbitrate.',
        },
      },
      {
        id: 'd',
        text: 'It depends on the horizontal launch speed',
        isCorrect: false,
        misconceptionTag: 'conditional-coupling-assumption',
        feedback: {
          task:
            'Incorrect: under the stated idealization (no air resistance) the fall ' +
            'time has no dependence on horizontal speed at all.',
          process:
            'Check what the vertical equation contains: y(t) = ½gt² + v₀y·t. With ' +
            'v₀y = 0 for both, no horizontal quantity enters.',
          selfRegulation:
            'Before answering "it depends", list the variables present in the ' +
            'governing equation. A variable absent from the equation cannot matter.',
        },
      },
    ],
    explanation:
      'Projectile motion separates into independent components. With zero initial ' +
      'vertical velocity and equal height, t = √(2h/g) for both balls.',
  },
  {
    id: 'fb-stats-pvalue',
    domain: 'Statistics',
    concept: 'What a p-value is (and is not)',
    difficulty: 4,
    stem: 'A study reports p = 0.03. Which statement is correct?',
    options: [
      {
        id: 'a',
        text: 'There is a 3% chance the null hypothesis is true',
        isCorrect: false,
        misconceptionTag: 'pvalue-as-null-probability',
        feedback: {
          task:
            'Incorrect: a p-value is computed ASSUMING the null is true; it cannot ' +
            'be the probability of the null itself.',
          process:
            'Restate the definition in conditional form: p = P(data at least this ' +
            'extreme | H₀ true). The conditioning bar is the whole point.',
          selfRegulation:
            'Translate every p-value you meet into the conditional sentence before ' +
            'interpreting it; the translation habit blocks the inversion fallacy.',
        },
      },
      {
        id: 'b',
        text: 'There is a 3% chance the results are due to random chance',
        isCorrect: false,
        misconceptionTag: 'pvalue-as-chance-probability',
        feedback: {
          task:
            'Incorrect: the p-value is not the probability that "chance produced ' +
            'the results" — that again assigns a probability to a hypothesis.',
          process:
            'Keep data and hypotheses separate: p-values give probabilities to DATA ' +
            'patterns under an assumed hypothesis, never to hypotheses.',
          selfRegulation:
            'Flag any interpretation that attaches a probability to H₀ or to ' +
            '"the results being chance" — both invert the conditional.',
        },
      },
      {
        id: 'c',
        text: 'If the null were true, data this extreme would occur 3% of the time',
        isCorrect: true,
        feedback: {
          task:
            'Correct: p = 0.03 means that under H₀, results at least this extreme ' +
            'would appear in 3% of repeated experiments.',
          process:
            'You kept the conditional structure intact: probability of DATA given ' +
            'the NULL — the only defensible reading.',
          selfRegulation:
            'Keep the definition-sentence as your first move for every p-value; ' +
            'precision here prevents the most common misinterpretation in statistics.',
        },
      },
      {
        id: 'd',
        text: 'The effect is large and practically important',
        isCorrect: false,
        misconceptionTag: 'significance-as-importance',
        feedback: {
          task:
            'Incorrect: a p-value says nothing about effect size; with enough data, ' +
            'trivial effects reach p = 0.03.',
          process:
            'Always pair significance with an effect size and confidence interval ' +
            'before judging practical importance.',
          selfRegulation:
            'Adopt the two-question habit: "Is it real?" (p-value) AND "Is it big ' +
            'enough to matter?" (effect size). Never let the first answer substitute ' +
            'for the second.',
        },
      },
    ],
    explanation:
      'A p-value conditions on the null: P(data at least this extreme | H₀). It is ' +
      'not the probability of the null, not the probability of chance results, and ' +
      'not a measure of importance.',
  },
  {
    id: 'fb-lang-spaced-vocab',
    domain: 'Language Learning',
    concept: 'Massed vs spaced vocabulary practice',
    difficulty: 2,
    stem:
      'A learner has 2 hours to learn 40 words before a test in two weeks. Which ' +
      'plan yields the best retention at test time?',
    options: [
      {
        id: 'a',
        text: 'One 2-hour session the night before',
        isCorrect: false,
        misconceptionTag: 'cramming-equals-learning',
        feedback: {
          task:
            'Suboptimal: a single massed session feels fluent but fades fastest; ' +
            'retention after two weeks will be far lower.',
          process:
            'Spread the same 2 hours across days (spacing effect). Four 30-minute ' +
            'sessions with retrieval practice produce durable memory for the same ' +
            'total time.',
          selfRegulation:
            'Notice the fluency illusion: cramming FEELS like learning. Judge your ' +
            'plans by remembered-tomorrow, not felt-tonight.',
        },
      },
      {
        id: 'b',
        text: 'Four 30-minute retrieval sessions spread across the two weeks',
        isCorrect: true,
        feedback: {
          task:
            'Correct: distributed retrieval practice beats massed study for delayed ' +
            'tests — same total time, much better retention.',
          process:
            'You combined spacing (sessions across days) with retrieval (recall, ' +
            'not re-reading) — the two highest-yield levers in memory research.',
          selfRegulation:
            'Keep scheduling reviews at expanding intervals and self-testing each ' +
            'time; your calendar, not your mood, should own the schedule.',
        },
      },
      {
        id: 'c',
        text: 'Two 1-hour re-reading sessions',
        isCorrect: false,
        misconceptionTag: 'rereading-as-effective-study',
        feedback: {
          task:
            'Suboptimal: re-reading is one of the weakest study methods; it builds ' +
            'familiarity, not retrievability.',
          process:
            'Replace re-reading with retrieval: cover the translations and recall ' +
            'them. Desirable difficulty during practice is what builds access at ' +
            'test time.',
          selfRegulation:
            'Monitor the study ACTIVITY, not just the hours: if you can predict the ' +
            'page before recalling the word, the method needs changing.',
        },
      },
      {
        id: 'd',
        text: 'Highlight the word list daily for 10 minutes',
        isCorrect: false,
        misconceptionTag: 'highlighting-as-learning',
        feedback: {
          task:
            'Ineffective: highlighting is a passive marking activity with minimal ' +
            'impact on later recall.',
          process:
            'Swap marking for generation: write each word from memory, then check. ' +
            'Generation plus verification is the active core the highlight lacks.',
          selfRegulation:
            'Ask of any study habit: "am I retrieving or just re-exposing?" ' +
            'Re-exposure feels productive; retrieval is productive.',
        },
      },
    ],
    explanation:
      'Spacing practice across days and using retrieval instead of re-exposure are ' +
      'the two most replicated levers for durable vocabulary learning.',
  },
)

/* ==========================================================================
 * VALIDATED EXPORTS
 * ========================================================================== */

/**
 * Validated scenario bank. Validation runs once at module load; an invalid
 * entry fails fast at import time rather than mid-session.
 */
export const CANONICAL_FEEDBACK_SCENARIOS: readonly StoredScenario[] = RAW_SCENARIOS.map((s) =>
  ScenarioSchema.parse(s),
)

/** Look up one scenario by id (undefined when unknown). */
export function getFeedbackScenarioById(id: string): StoredScenario | undefined {
  return CANONICAL_FEEDBACK_SCENARIOS.find((s) => s.id === id)
}

/** All misconception tags present in the bank, deduplicated and sorted. */
export function listMisconceptionTags(): string[] {
  const tags = new Set<string>()
  for (const s of CANONICAL_FEEDBACK_SCENARIOS) {
    for (const o of s.options) {
      if (o.misconceptionTag) tags.add(o.misconceptionTag)
    }
  }
  return [...tags].sort()
}
