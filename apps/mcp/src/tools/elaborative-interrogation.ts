/**
 * Elaborative Interrogation MCP tools.
 *
 * Stateless surfaces over packages/core/elaborative-interrogation, the SAME
 * functions the web handler and the CLI `ei` command call. Learning-science
 * basis: explaining WHY a fact is true improves recall (Pressley et al. 1987;
 * Dunlosky et al. 2013). Grades are transparent heuristics, not truth checks:
 * agents should present them as coaching.
 *
 * Tools:
 * 1. ei_prompt    - build a "why" prompt for a fact in a chosen style
 * 2. ei_grade     - score an explanation with the six-item rubric
 * 3. ei_extract   - split study text into candidate facts
 * 4. ei_lint      - lint a fact bank for weak or duplicate facts
 * 5. ei_calibration - confidence-vs-score calibration report
 * 6. free_recall_score - brain-dump scoring against a passage (core/free-recall)
 */
import { z } from 'zod'
import {
  buildPrompt,
  calibrationPointSchema,
  calibrationReport,
  classifyFact,
  eiFactSchema,
  extractFacts,
  gradeExplanation,
  gradeToFsrsRating,
  lintFacts,
  promptStyleSchema,
} from '@learning-hub/core/elaborative-interrogation'
import {
  gapList,
  gapsToEiFacts,
  nextStep,
  passageSchema,
  scoreRecall,
  splitIdeaUnits,
  suggestedDelayMinutes,
} from '@learning-hub/core/free-recall'
import { json, tool, type RegisteredTool } from '../tool-kit'

const statement = z.string().min(8).max(600).describe('The fact to explain, 8 to 600 characters')

export const elaborativeInterrogationTools: RegisteredTool[] = [
  tool(
    'ei_prompt',
    'Builds an elaborative-interrogation prompt that asks the learner to explain WHY a fact is true. Styles: why-true, why-not-otherwise, mechanism, prerequisite, transfer, contrast-case, analogy, counterexample, predict-outcome, teach-back.',
    { statement, style: promptStyleSchema.default('why-true').describe('Prompt style') },
    async ({ statement: s, style = 'why-true' }) => {
      const fact = eiFactSchema.parse({ id: 'mcp', statement: s })
      return json({ ok: true, kind: classifyFact(s), prompt: buildPrompt(fact, style) })
    },
  ),
  tool(
    'ei_grade',
    'Scores a learner explanation of a fact out of 100 with a six-item transparent rubric (length, causal reasoning, key-idea coverage, own words, links to prior knowledge, specificity), detects copying and hedging, and returns the matching FSRS rating (1 Again to 4 Easy).',
    {
      statement,
      keyTerms: z
        .array(z.string().min(1).max(60))
        .max(12)
        .default([])
        .describe('Optional key ideas the answer should cover'),
      answer: z.string().max(4000).describe('The learner explanation'),
    },
    async ({ statement: s, keyTerms = [], answer }) => {
      const fact = eiFactSchema.parse({ id: 'mcp', statement: s, keyTerms })
      const grade = gradeExplanation(fact, answer)
      return json({ ok: true, grade, fsrsRating: gradeToFsrsRating(grade) })
    },
  ),
  tool(
    'ei_extract',
    'Splits pasted study text into candidate facts (one sentence each, 8 to 40 words) with suggested key terms.',
    { text: z.string().min(1).max(60_000), max: z.number().int().min(1).max(100).default(30) },
    async ({ text, max = 30 }) => json({ ok: true, facts: extractFacts(text, max) }),
  ),
  tool(
    'ei_lint',
    'Lints a fact bank: too short or long, no stated relation, bare definitions, missing key terms, near-duplicates.',
    { facts: z.array(eiFactSchema).max(200) },
    async ({ facts }) => json({ ok: true, issues: lintFacts(facts) }),
  ),
  tool(
    'ei_calibration',
    'Compares the scores a learner predicted with their actual rubric scores: mean bias, mean absolute error, Brier score, resolution, and advice.',
    { points: z.array(calibrationPointSchema).max(2000) },
    async ({ points }) => json({ ok: true, report: calibrationReport(points) }),
  ),
  tool(
    'free_recall_score',
    'Scores a free-recall (brain dump) attempt against a passage: splits the passage into idea units, marks each recalled, partial or missed, flags sentences that match nothing (possible intrusions), reports order fidelity, lists the most important gaps as elaborative-interrogation facts, and plans the next step and delay.',
    {
      passage: z.string().min(40).max(30_000).describe('The passage the learner studied'),
      recall: z.string().max(20_000).describe('What the learner wrote from memory'),
      history: z
        .array(z.number().min(0).max(100))
        .max(49)
        .default([])
        .describe('Recall scores of earlier rounds, oldest first'),
    },
    async ({ passage, recall, history = [] }) => {
      const units = splitIdeaUnits(passageSchema.parse({ text: passage }).text)
      const report = scoreRecall(units, recall)
      const rounds = [...history, report.recallScore].map((recallScore, i) => ({
        round: i + 1,
        recallScore,
      }))
      return json({
        ok: true,
        report,
        gaps: gapList(report),
        eiFacts: gapsToEiFacts(report),
        next: nextStep(rounds),
        delayMinutes: suggestedDelayMinutes(report.recallScore),
      })
    },
  ),
]
