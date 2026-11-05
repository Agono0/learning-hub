/**
 * Human/AI-readable catalog of exercise types — used by the curriculum prompt
 * template (so any AI knows what it may produce), the docs and the UI pickers.
 */
import type { ExerciseType } from './schema'

export interface ExerciseTypeInfo {
  type: ExerciseType
  label: string
  /** What it trains (recognition → recall → production). */
  trains: 'recognition' | 'recall' | 'production'
  /** One-line description for prompts and pickers. */
  description: string
  /** A minimal valid example (JSON-serializable). */
  example: Record<string, unknown>
}

export const EXERCISE_CATALOG: readonly ExerciseTypeInfo[] = [
  {
    type: 'mcq',
    label: 'Multiple choice',
    trains: 'recognition',
    description: 'One correct option; `why[i]` explains each option.',
    example: {
      type: 'mcq',
      prompt: 'Which planet is largest?',
      options: ['Mars', 'Jupiter', 'Venus'],
      answer: 1,
      why: ['Smaller than Earth', 'Largest planet', 'Similar to Earth'],
    },
  },
  {
    type: 'multi',
    label: 'Select all that apply',
    trains: 'recognition',
    description: 'Several correct options (`answers` = indices).',
    example: {
      type: 'multi',
      prompt: 'Which are prime?',
      options: ['2', '4', '5', '9'],
      answers: [0, 2],
    },
  },
  {
    type: 'truefalse',
    label: 'True / false',
    trains: 'recognition',
    description: 'Judge a statement.',
    example: { type: 'truefalse', prompt: 'Water boils at 100 °C at sea level.', answer: true },
  },
  {
    type: 'numeric',
    label: 'Numeric',
    trains: 'production',
    description: 'A number with optional `tolerance` / `relTolerance` and `unit`.',
    example: {
      type: 'numeric',
      prompt: 'g on Earth (m/s²)?',
      answer: 9.81,
      tolerance: 0.05,
      unit: 'm/s²',
    },
  },
  {
    type: 'typein',
    label: 'Type the answer',
    trains: 'recall',
    description: 'Free recall; any of `answers` accepted, typo-tolerant.',
    example: { type: 'typein', prompt: 'Capital of Japan?', answers: ['Tokyo'] },
  },
  {
    type: 'cloze',
    label: 'Fill in the blanks',
    trains: 'recall',
    description: 'Blanks marked `{{answer|alternative}}` inside `text`.',
    example: {
      type: 'cloze',
      prompt: 'Complete the sentence.',
      text: 'Mitochondria are the {{powerhouse}} of the {{cell}}.',
    },
  },
  {
    type: 'ordering',
    label: 'Put in order',
    trains: 'recall',
    description: '`items` listed in the CORRECT order; shown shuffled.',
    example: {
      type: 'ordering',
      prompt: 'Order the steps of the scientific method.',
      items: ['Question', 'Hypothesis', 'Experiment', 'Conclusion'],
    },
  },
  {
    type: 'parsons',
    label: 'Arrange the code',
    trains: 'production',
    description: 'Code `lines` in correct order, optional wrong `distractors`.',
    example: {
      type: 'parsons',
      prompt: 'Sum a list.',
      language: 'python',
      lines: ['total = 0', 'for x in xs:', '    total += x', 'print(total)'],
      distractors: ['total = 1'],
    },
  },
  {
    type: 'matching',
    label: 'Match pairs',
    trains: 'recall',
    description: 'Match each `left` to its `right`.',
    example: {
      type: 'matching',
      prompt: 'Match the term to its definition.',
      pairs: [
        { left: 'Noun', right: 'A thing' },
        { left: 'Verb', right: 'An action' },
      ],
    },
  },
  {
    type: 'categorize',
    label: 'Sort into groups',
    trains: 'recall',
    description: 'Sort items into named `categories`.',
    example: {
      type: 'categorize',
      prompt: 'Sort the animals.',
      categories: [
        { name: 'Mammal', items: ['Whale', 'Bat'] },
        { name: 'Bird', items: ['Penguin'] },
      ],
    },
  },
  {
    type: 'freetext',
    label: 'Explain in your words',
    trains: 'production',
    description: 'Open answer judged against a `rubric` (AI or self-graded), with `modelAnswer`.',
    example: {
      type: 'freetext',
      prompt: 'Why do seasons happen?',
      rubric: ['Mentions axial tilt', 'Explains angle of sunlight'],
      modelAnswer: "Earth's axis is tilted ~23.5°…",
    },
  },
  {
    type: 'code',
    label: 'Write code',
    trains: 'production',
    description:
      'JS/TS graded by `tests` ({call, expected}); other languages self-checked vs `solution`.',
    example: {
      type: 'code',
      prompt: 'Write add(a, b).',
      language: 'javascript',
      starter: 'function add(a, b) {\n  \n}',
      tests: [{ call: 'add(2, 3)', expected: 5 }],
    },
  },
]
