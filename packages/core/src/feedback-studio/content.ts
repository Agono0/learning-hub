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
