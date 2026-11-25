/**
 * Exercise lint: per-format heuristics for items inside a course.
 *
 * These are cues that item-writing guides warn about (a longest correct option,
 * "all of the above", an answer that appears in the question). They flag text
 * patterns. They do not say an item is bad, and they cannot see whether an
 * item is clear to a real learner.
 */
import type { Exercise, ExerciseOf } from '../../practice/schema'
import { diceSimilarity } from '../../linter'
import { clozeBlanks } from '../../practice/grade'
import type { LhcfCourse } from '../lhcf/schema'
import { indexCourse, type CourseIndex, type IndexedExercise } from './course-index'
import { tokenize, wordCount } from './terms'
import { clip, finding, pct, type Finding, type RuleInfo } from './types'

const ABSOLUTES = ['always', 'never', 'only', 'all', 'none', 'every', 'impossible', 'must']
const HEDGES = ['sometimes', 'often', 'usually', 'may', 'can', 'might', 'generally']
const VAGUE_RUBRIC = /^(?:good|clear|correct|well|nice|accurate|complete|thorough|ok(?:ay)?)\b[\s.!]*$/i
const ALL_NONE = /^(?:all|none|both|neither)\s+of\s+(?:the\s+)?(?:above|these|them)\b|^(?:a|b|c|d)\s+and\s+(?:a|b|c|d)$/i

export const EXERCISE_RULES: RuleInfo[] = [
  rule('ex.prompt-short', 'Prompt is very short', 'info', 'Words in the prompt (under 4).', 'Terse prompts are fine for card-style recall such as "Capital of France?".'),
  rule('ex.prompt-long', 'Prompt is very long', 'info', 'Words in the prompt (over 160).', 'Case studies and word problems need length.'),
  rule('ex.prompt-negation', 'Prompt asks for the exception', 'info', 'Phrases like "which is NOT" or "except".', 'Negative stems are sometimes the clearest way to ask. Bold the word NOT if you keep it.'),
  rule('ex.explanation-missing', 'No explanation after answering', 'info', 'Empty explanation field.', 'Self-evident items do not need one.'),
  rule('ex.hint-leaks-answer', 'Hint contains the answer', 'warning', 'Whole answer text found inside the hint.', 'Very short answers (one or two letters) can appear in a hint by chance.'),
  rule('ex.prompt-leaks-answer', 'Prompt contains the answer', 'warning', 'Whole answer text found inside the prompt.', 'Prompts that quote the term to define it, then ask for a related fact, are fine.'),
  rule('ex.id-duplicate', 'Two exercises share an id', 'warning', 'Duplicate `id` values inside one lesson.', 'None; ids are meant to be unique per lesson.'),
  rule('ex.mcq-longest-correct', 'Correct option is much longer than the others', 'notice', 'Correct option length versus the median of the others (1.6x and 25+ characters).', 'Sometimes the correct answer needs more words. Lengthen the distractors to match.'),
  rule('ex.mcq-all-none', '"All/none of the above" option', 'notice', 'Option text matches "all of the above" or similar.', 'Fine in a "select all" style item; here it only has one right answer.'),
  rule('ex.mcq-duplicate-options', 'Two options are the same', 'warning', 'Normalized option texts compared for equality.', 'Options that differ only by units or case may be intended.'),
  rule('ex.mcq-near-duplicate-options', 'Two options are almost identical', 'info', 'Dice similarity of option pairs at 0.9 or higher.', 'Items that test a one-word difference on purpose.'),
  rule('ex.mcq-why-incomplete', 'Per-option explanations are partial', 'info', '`why` has fewer entries than options.', 'Short items may only explain the correct option.'),
  rule('ex.mcq-two-options', 'Only two options', 'info', 'Option count equals 2.', 'Two options are fine when the choice is naturally binary; consider true/false.'),
  rule('ex.multi-all-correct', 'Every option is correct', 'notice', 'answers.length equals options.length.', 'Rare but valid when the point is that nothing is wrong.'),
  rule('ex.multi-single-answer', 'Select-many item with one answer', 'info', 'answers.length equals 1.', 'Intentional when the item hides how many are right.'),
  rule('ex.tf-absolute', 'True/false statement uses an absolute word', 'info', 'Words like always, never, only in the prompt.', 'Statements about definitions or laws can be absolute and true.'),
  rule('ex.numeric-no-tolerance', 'Decimal answer with no tolerance', 'notice', 'Non-integer answer without tolerance or relTolerance.', 'Exact decimal answers like 0.5 are fine when the item says to give the exact value.'),
  rule('ex.numeric-unit-in-prompt', 'Unit appears only in the prompt', 'info', 'Prompt contains a unit-like word and `unit` is empty.', 'The learner may be expected to supply no unit.'),
  rule('ex.typein-long-answer', 'Type-in answer is long', 'notice', 'Accepted answer longer than 6 words.', 'Names and titles can be long; add accepted shorter forms.'),
  rule('ex.typein-single-variant', 'One accepted answer for an open term', 'info', 'A single accepted answer that has a plural or alternate spelling cue.', 'Many terms have only one spelling.'),
  rule('ex.cloze-many-blanks', 'Cloze has many blanks', 'info', 'More than 4 blanks.', 'Vocabulary lists can carry many blanks.'),
  rule('ex.cloze-stopword-blank', 'A blank hides a function word', 'notice', 'Blank answer is a common English function word.', 'Grammar items hide function words on purpose.'),
  rule('ex.cloze-adjacent-blanks', 'Blanks sit next to each other', 'info', 'Two blanks separated only by punctuation or space.', 'Multi-word terms may be split deliberately.'),
  rule('ex.cloze-blank-ratio', 'Most of the text is blanked', 'notice', 'More than half of the words are blanks.', 'Short definitions may legitimately blank one of two words.'),
  rule('ex.ordering-duplicate-items', 'Ordering items repeat', 'warning', 'Normalized item texts compared for equality.', 'Repeated steps in a loop may be intended; label them.'),
  rule('ex.ordering-two-items', 'Only two items to order', 'info', 'items.length equals 2.', 'A before/after item can be exactly two.'),
  rule('ex.parsons-distractor-matches', 'A distractor equals a real line', 'warning', 'Distractor text equal to a solution line after trimming.', 'None; the learner could not tell which one to drop.'),
  rule('ex.parsons-duplicate-lines', 'Repeated solution line', 'info', 'The same line appears twice (common for braces).', 'Closing braces and `end` repeat naturally.'),
  rule('ex.matching-duplicate-side', 'A matching side repeats', 'warning', 'Two pairs share the same left or right text.', 'Many-to-one matching is not supported by the grader.'),
  rule('ex.categorize-overlap', 'An item is in two categories', 'warning', 'Same item text found in more than one category.', 'None; the grader needs a single right place.'),
  rule('ex.freetext-no-model', 'Free text has no model answer', 'notice', 'modelAnswer missing.', 'AI grading can work from the rubric alone; self-check needs a model.'),
  rule('ex.freetext-vague-rubric', 'Rubric line is a bare adjective', 'notice', 'A rubric entry that is a single word such as "good".', 'None. Name the observable thing to look for.'),
  rule('ex.freetext-single-criterion', 'Rubric has a single line', 'info', 'rubric.length equals 1.', 'Short answers may have one criterion.'),
  rule('ex.code-no-checks', 'Code exercise has neither tests nor a solution', 'warning', 'No `tests` and no `solution`.', 'Open-ended coding projects without checks.'),
  rule('ex.code-starter-is-solution', 'Starter equals solution', 'warning', 'Starter and solution identical after trimming.', 'None.'),
  rule('ex.code-single-test', 'Only one test case', 'info', 'tests.length equals 1.', 'Trivial functions.'),
  rule('ex.code-tests-undescribed', 'Test cases have no descriptions', 'info', 'No test has a description.', 'Self-explanatory tests.'),
  rule('lesson.single-format', 'Lesson uses one exercise format', 'info', 'Five or more exercises, all the same type.', 'Drill lessons are single-format on purpose.'),
  rule('lesson.recognition-only', 'Lesson has no production exercise', 'info', 'Four or more exercises, all recognition formats.', 'Early survey lessons can be recognition-only.'),
  rule('lesson.difficulty-flat', 'Difficulty is unset or uniform', 'info', 'Five or more exercises without a spread in `difficulty`.', 'Difficulty is optional.'),
  rule('course.mcq-position-skew', 'Correct MCQ option position is skewed', 'notice', 'At least 8 MCQs where one position holds over half the correct answers.', 'Small samples vary by chance.'),
]

function rule(ruleId: string, title: string, severity: RuleInfo['severity'], measures: string, falsePositive: string): RuleInfo {
  return { ruleId, title, severity, measures, falsePositive }
}

const RULE_BY_ID = new Map(EXERCISE_RULES.map((r) => [r.ruleId, r]))

function mk(ruleId: string, path: string, message: string, evidence: string, suggestion?: string): Finding {
  const r = RULE_BY_ID.get(ruleId)
  if (!r) throw new Error(`unknown rule ${ruleId}`)
  return finding({ ruleId, severity: r.severity, path, message, evidence, falsePositive: r.falsePositive, suggestion })
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Plain-text answers of an exercise, where it has short textual ones. */
export function answerTexts(e: Exercise): string[] {
  switch (e.type) {
    case 'mcq':
      return [e.options[e.answer] ?? '']
    case 'multi':
      return e.answers.map((i) => e.options[i] ?? '')
    case 'typein':
      return [...e.answers]
    case 'cloze':
      return clozeBlanks(e.text).flat()
    case 'numeric':
      return [String(e.answer)]
    case 'freetext':
      return []
    default:
      return []
  }
}

function leaksInto(haystack: string, answers: readonly string[]): string | null {
  const h = norm(haystack)
  for (const a of answers) {
    const n = norm(a)
    if (Array.from(n).length < 4) continue
    const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\p{L}\\p{N}])`, 'u')
    if (re.test(h)) return a
  }
  return null
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  if (s.length === 0) return 0
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

type Linter<T extends Exercise['type']> = (e: ExerciseOf<T>, path: string) => Finding[]

const perType: { [K in Exercise['type']]: Linter<K> } = {
  mcq(e, path) {
    const out: Finding[] = []
    const lens = e.options.map((o) => Array.from(o).length)
    const correct = lens[e.answer] ?? 0
    const others = lens.filter((_, i) => i !== e.answer)
    const med = median(others)
    if (others.length >= 2 && correct >= 25 && correct >= med * 1.6 && correct > Math.max(...others))
      out.push(mk('ex.mcq-longest-correct', `${path}.options[${e.answer}]`, 'The correct option is the longest by a wide margin.', `Correct: ${correct} chars. Others: median ${med}, max ${Math.max(...others)}.`, 'Lengthen or trim distractors so lengths are similar.'))
    e.options.forEach((o, i) => {
      if (ALL_NONE.test(o.trim())) out.push(mk('ex.mcq-all-none', `${path}.options[${i}]`, 'This option refers to the other options.', `"${clip(o, 60)}"`, 'Replace it with a specific distractor.'))
    })
    const seen = new Map<string, number>()
    e.options.forEach((o, i) => {
      const k = norm(o)
      const prev = seen.get(k)
      if (prev !== undefined) out.push(mk('ex.mcq-duplicate-options', `${path}.options[${i}]`, `Options ${prev + 1} and ${i + 1} are the same text.`, `"${clip(o, 60)}"`))
      else seen.set(k, i)
    })
    for (let i = 0; i < e.options.length; i++)
      for (let j = i + 1; j < e.options.length; j++) {
        if (norm(e.options[i]!) === norm(e.options[j]!)) continue
        const a = norm(e.options[i]!)
        const b = norm(e.options[j]!)
        if (Math.min(a.length, b.length) >= 12 && diceSimilarity(a, b) >= 0.9)
          out.push(mk('ex.mcq-near-duplicate-options', `${path}.options[${j}]`, `Options ${i + 1} and ${j + 1} are almost identical.`, `"${clip(a, 50)}" vs "${clip(b, 50)}"`))
      }
    if (e.why && e.why.length < e.options.length)
      out.push(mk('ex.mcq-why-incomplete', `${path}.why`, 'Only some options have an explanation.', `${e.why.length} of ${e.options.length} explained.`))
    if (e.options.length === 2) out.push(mk('ex.mcq-two-options', `${path}.options`, 'Two options behave like true/false.', '2 options.'))
    return out
  },
  multi(e, path) {
    const out: Finding[] = []
    const distinct = new Set(e.answers).size
    if (distinct === e.options.length) out.push(mk('ex.multi-all-correct', `${path}.answers`, 'Every option is marked correct.', `${distinct} of ${e.options.length} options.`))
    if (distinct === 1) out.push(mk('ex.multi-single-answer', `${path}.answers`, 'Only one option is correct.', '1 correct option.'))
    e.options.forEach((o, i) => {
      if (ALL_NONE.test(o.trim())) out.push(mk('ex.mcq-all-none', `${path}.options[${i}]`, 'This option refers to the other options.', `"${clip(o, 60)}"`))
    })
    return out
  },
  truefalse(e, path) {
    const toks = tokenize(e.prompt)
    const abs = ABSOLUTES.filter((w) => toks.includes(w))
    const hedges = HEDGES.filter((w) => toks.includes(w))
    if (abs.length > 0 && hedges.length === 0)
      return [mk('ex.tf-absolute', path, 'The statement uses an absolute word.', `Found: ${abs.join(', ')}. Answer: ${e.answer ? 'true' : 'false'}.`, 'Absolute statements are often false; check the answer is not a cue.')]
    return []
  },
  numeric(e, path) {
    const out: Finding[] = []
    if (!Number.isInteger(e.answer) && e.tolerance === undefined && e.relTolerance === undefined)
      out.push(mk('ex.numeric-no-tolerance', path, 'The answer has decimals and no tolerance.', `Answer ${e.answer}; tolerance unset.`, 'Set tolerance or relTolerance so rounding does not fail.'))
    if (!e.unit && /\b\d+(?:\.\d+)?\s?(?:kg|km|cm|mm|ms|mb|gb|kb|%|°c|°f|hz|m\/s|usd|\$)\b/i.test(e.prompt))
      out.push(mk('ex.numeric-unit-in-prompt', path, 'The prompt names a unit but `unit` is empty.', clip(e.prompt, 80)))
    return out
  },
  typein(e, path) {
    const out: Finding[] = []
    e.answers.forEach((a, i) => {
      if (wordCount(a) > 6) out.push(mk('ex.typein-long-answer', `${path}.answers[${i}]`, 'This accepted answer is long to type exactly.', `${wordCount(a)} words: "${clip(a, 60)}"`, 'Accept a shorter key phrase as well.'))
    })
    if (e.answers.length === 1 && !e.exact && /s$|ise$|ize$|our$|or$/.test(norm(e.answers[0]!)) && wordCount(e.answers[0]!) === 1)
      out.push(mk('ex.typein-single-variant', `${path}.answers`, 'A single accepted spelling may miss a valid variant.', `"${e.answers[0]}"`, 'Add plural or regional spellings if they are right.'))
    return out
  },
  cloze(e, path) {
    const out: Finding[] = []
    const blanks = clozeBlanks(e.text)
    if (blanks.length > 4) out.push(mk('ex.cloze-many-blanks', `${path}.text`, 'The cloze has many blanks.', `${blanks.length} blanks.`))
    blanks.forEach((alts, i) => {
      if (alts.every((a) => tokenize(a).length === 1 && STOP_SET.has(tokenize(a)[0]!)))
        out.push(mk('ex.cloze-stopword-blank', `${path}.text`, `Blank ${i + 1} hides a function word.`, `Answer: "${alts[0]}"`, 'Blank a content word instead.'))
    })
    if (/\}\}[\s,;.:-]*\{\{/.test(e.text)) out.push(mk('ex.cloze-adjacent-blanks', `${path}.text`, 'Two blanks touch each other.', clip(e.text, 80)))
    const total = wordCount(e.text.replace(/\{\{([^{}|]+)(?:\|[^{}]*)?\}\}/g, '$1'))
    if (total >= 2 && blanks.length / total > 0.5)
      out.push(mk('ex.cloze-blank-ratio', `${path}.text`, 'More than half of the text is hidden.', `${blanks.length} blanks in ${total} words (${pct(blanks.length, total)}).`))
    return out
  },
  ordering(e, path) {
    const out: Finding[] = []
    const seen = new Set<string>()
    e.items.forEach((it, i) => {
      const k = norm(it)
      if (seen.has(k)) out.push(mk('ex.ordering-duplicate-items', `${path}.items[${i}]`, 'This item repeats an earlier one.', `"${clip(it, 60)}"`))
      seen.add(k)
    })
    if (e.items.length === 2) out.push(mk('ex.ordering-two-items', `${path}.items`, 'Two items can be guessed at 50%.', '2 items.'))
    return out
  },
  parsons(e, path) {
    const out: Finding[] = []
    const lines = new Set(e.lines.map((l) => l.trim()))
    ;(e.distractors ?? []).forEach((d, i) => {
      if (lines.has(d.trim())) out.push(mk('ex.parsons-distractor-matches', `${path}.distractors[${i}]`, 'A distractor is identical to a solution line.', `"${clip(d, 60)}"`))
    })
    const counts = new Map<string, number>()
    for (const l of e.lines) {
      const t = l.trim()
      if (t.length > 3) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    const dup = [...counts].filter(([, n]) => n > 1)
    if (dup.length > 0) out.push(mk('ex.parsons-duplicate-lines', `${path}.lines`, 'A solution line appears more than once.', dup.map(([l, n]) => `"${clip(l, 40)}" x${n}`).join(', ')))
    return out
  },
  matching(e, path) {
    const out: Finding[] = []
    for (const side of ['left', 'right'] as const) {
      const seen = new Map<string, number>()
      e.pairs.forEach((p, i) => {
        const k = norm(p[side])
        const prev = seen.get(k)
        if (prev !== undefined) out.push(mk('ex.matching-duplicate-side', `${path}.pairs[${i}].${side}`, `Pairs ${prev + 1} and ${i + 1} share the same ${side} text.`, `"${clip(p[side], 60)}"`))
        else seen.set(k, i)
      })
    }
    return out
  },
  categorize(e, path) {
    const out: Finding[] = []
    const where = new Map<string, number>()
    e.categories.forEach((c, ci) => {
      for (const it of c.items) {
        const k = norm(it)
        const prev = where.get(k)
        if (prev !== undefined && prev !== ci) out.push(mk('ex.categorize-overlap', `${path}.categories[${ci}]`, `"${clip(it, 40)}" is in categories ${prev + 1} and ${ci + 1}.`, `Item "${clip(it, 60)}"`))
        else where.set(k, ci)
      }
    })
    return out
  },
  freetext(e, path) {
    const out: Finding[] = []
    if (!e.modelAnswer) out.push(mk('ex.freetext-no-model', path, 'No model answer to compare against.', `${e.rubric.length} rubric line(s).`, 'Add a short model answer for self-check.'))
    e.rubric.forEach((r, i) => {
      if (VAGUE_RUBRIC.test(r.trim())) out.push(mk('ex.freetext-vague-rubric', `${path}.rubric[${i}]`, 'This rubric line does not say what to look for.', `"${r}"`, 'Name the idea or step that must appear.'))
    })
    if (e.rubric.length === 1) out.push(mk('ex.freetext-single-criterion', `${path}.rubric`, 'One rubric line gives little to grade against.', '1 line.'))
    return out
  },
  code(e, path) {
    const out: Finding[] = []
    const noTests = !e.tests || e.tests.length === 0
    if (noTests && !e.solution) out.push(mk('ex.code-no-checks', path, 'There is no way to check the answer.', 'No tests, no solution.', 'Add tests (JavaScript/TypeScript) or a reference solution.'))
    if (e.starter && e.solution && e.starter.trim() === e.solution.trim()) out.push(mk('ex.code-starter-is-solution', path, 'The starter code is already the solution.', `${e.starter.length} chars identical.`))
    if (e.tests?.length === 1) out.push(mk('ex.code-single-test', `${path}.tests`, 'A single test is easy to special-case.', '1 test.'))
    if (e.tests && e.tests.length >= 2 && e.tests.every((t) => !t.description)) out.push(mk('ex.code-tests-undescribed', `${path}.tests`, 'No test explains what it checks.', `${e.tests.length} tests without description.`))
    return out
  },
}

const STOP_SET = new Set('a an the of to in on at by for and or but is are was were be it this that with as from'.split(' '))

/** Lint one exercise. `path` is used verbatim in findings. */
export function lintExercise(e: Exercise, path: string): Finding[] {
  const out: Finding[] = []
  const words = wordCount(e.prompt)
  if (words < 4 && e.type !== 'cloze' && e.type !== 'code') out.push(mk('ex.prompt-short', `${path}.prompt`, 'The prompt is very short.', `${words} word(s): "${clip(e.prompt, 40)}"`))
  if (words > 160) out.push(mk('ex.prompt-long', `${path}.prompt`, 'The prompt is very long.', `${words} words.`))
  if (/\b(?:which|what)\b[^?.]{0,40}\b(?:is|are|was)\s+(?:not|NOT)\b|\bexcept\b|\bleast likely\b/i.test(e.prompt))
    out.push(mk('ex.prompt-negation', `${path}.prompt`, 'The prompt asks for the exception.', clip(e.prompt, 90)))
  if (!e.explanation && e.type !== 'mcq') out.push(mk('ex.explanation-missing', path, 'No explanation is shown after answering.', 'explanation is empty.'))
  else if (e.type === 'mcq' && !e.explanation && !e.why) out.push(mk('ex.explanation-missing', path, 'No explanation is shown after answering.', 'Neither explanation nor why is set.'))
  const answers = answerTexts(e)
  if (e.hint) {
    const hit = leaksInto(e.hint, answers)
    if (hit) out.push(mk('ex.hint-leaks-answer', `${path}.hint`, 'The hint already contains the answer.', `Answer "${clip(hit, 40)}" appears in "${clip(e.hint, 60)}".`))
  }
  if (e.type === 'typein' || e.type === 'cloze' || e.type === 'numeric') {
    const hit = e.type === 'cloze' ? null : leaksInto(e.prompt, answers)
    if (hit) out.push(mk('ex.prompt-leaks-answer', `${path}.prompt`, 'The prompt contains the answer text.', `Answer "${clip(hit, 40)}" appears in the prompt.`))
  }
  if (e.type === 'mcq') {
    const hit = leaksInto(e.prompt, answers)
    if (hit && wordCount(hit) >= 2) out.push(mk('ex.prompt-leaks-answer', `${path}.prompt`, 'The correct option is quoted in the prompt.', `"${clip(hit, 50)}"`))
  }
  out.push(...(perType[e.type] as Linter<typeof e.type>)(e as never, path))
  return out
}

/** Lesson-level format checks over a list of exercises. */
export function lintLessonMix(exercises: readonly IndexedExercise[], lessonPath: string): Finding[] {
  const out: Finding[] = []
  const ids = new Map<string, number>()
  exercises.forEach((ie, i) => {
    const id = ie.exercise.id
    if (!id) return
    const prev = ids.get(id)
    if (prev !== undefined) out.push(mk('ex.id-duplicate', ie.path, `Exercises ${prev + 1} and ${i + 1} share the id "${id}".`, `id "${id}"`))
    else ids.set(id, i)
  })
  if (exercises.length >= 5 && new Set(exercises.map((e) => e.exercise.type)).size === 1)
    out.push(mk('lesson.single-format', `${lessonPath}.exercises`, 'Every exercise uses the same format.', `${exercises.length} x ${exercises[0]!.exercise.type}.`))
  if (exercises.length >= 4 && exercises.every((e) => RECOGNITION.has(e.exercise.type)))
    out.push(mk('lesson.recognition-only', `${lessonPath}.exercises`, 'No exercise asks the learner to produce an answer.', `Types: ${[...new Set(exercises.map((e) => e.exercise.type))].join(', ')}.`))
  if (exercises.length >= 5) {
    const ds = exercises.map((e) => e.exercise.difficulty).filter((d): d is number => d !== undefined)
    if (ds.length === 0 || new Set(ds).size === 1)
      out.push(mk('lesson.difficulty-flat', `${lessonPath}.exercises`, 'Difficulty does not vary.', ds.length === 0 ? 'No difficulty set.' : `All set to ${ds[0]}.`))
  }
  return out
}

const RECOGNITION = new Set(['mcq', 'multi', 'truefalse', 'matching', 'categorize', 'ordering'])

/** Course-level check: where do correct MCQ answers sit? */
export function mcqPositionStats(exercises: readonly IndexedExercise[]): { total: number; byPosition: number[] } {
  const byPosition: number[] = []
  let total = 0
  for (const ie of exercises) {
    if (ie.exercise.type !== 'mcq') continue
    total += 1
    byPosition[ie.exercise.answer] = (byPosition[ie.exercise.answer] ?? 0) + 1
  }
  for (let i = 0; i < byPosition.length; i++) byPosition[i] ??= 0
  return { total, byPosition }
}

/** Lint every exercise in a course. */
export function lintExercises(course: LhcfCourse, index: CourseIndex = indexCourse(course)): Finding[] {
  const out: Finding[] = []
  for (const ie of index.exercises) out.push(...lintExercise(ie.exercise, ie.path))
  for (const il of index.lessons) {
    const mine = index.exercises.filter((e) => e.lessonSlug === il.lesson.slug && e.home.kind === 'lesson' && e.path.startsWith(il.path))
    out.push(...lintLessonMix(mine, il.path))
  }
  const stats = mcqPositionStats(index.exercises)
  if (stats.total >= 8) {
    const max = Math.max(...stats.byPosition)
    const pos = stats.byPosition.indexOf(max)
    if (max / stats.total > 0.5)
      out.push(mk('course.mcq-position-skew', 'modules', `Option ${pos + 1} is correct in ${pct(max, stats.total)} of multiple choice items.`, `Correct positions: ${stats.byPosition.map((n, i) => `${i + 1}:${n}`).join(' ')} of ${stats.total}.`, 'Shuffle options when authoring; the player may also shuffle at runtime.'))
  }
  return out
}
