/**
 * Three ready-to-install study methods, written in the blueprint format.
 * They double as the format's reference examples and as test fixtures.
 */
import { validateBlueprint } from './validate'
import type { Blueprint, BlueprintInput } from './schema'

const retrievalSprint: BlueprintInput = {
  schemaVersion: 1,
  id: 'retrieval-sprint',
  name: 'Retrieval Sprint',
  version: '1.0.0',
  summary: 'Study briefly, then test yourself from memory. Weak recall sends you back to restudy.',
  author: 'Agono-TOKENMAXXING',
  tags: ['recall', 'testing-effect'],
  params: {
    'study-minutes': { type: 'number', label: 'Study minutes', default: 10, min: 3, max: 45 },
    'pass-score': { type: 'number', label: 'Pass score (%)', default: 70, min: 30, max: 100 },
  },
  phases: [
    {
      id: 'study',
      title: 'Study the material',
      kind: 'learn',
      minutes: { param: 'study-minutes' },
      instructions:
        'Read or watch the material once. Note the three ideas you would hate to forget.',
    },
    {
      id: 'blank-page',
      title: 'Recall from a blank page',
      kind: 'recall',
      minutes: 5,
      instructions:
        'Close everything. Write down all you remember, then score how much of it you got right.',
      scored: true,
      branches: [
        { when: { metric: 'score', op: '<', value: { param: 'pass-score' } }, goto: 'restudy' },
      ],
      next: 'reflect',
    },
    {
      id: 'restudy',
      title: 'Restudy the gaps',
      kind: 'learn',
      minutes: 5,
      instructions:
        'Reopen the material and read only what you missed. Then try the blank page again.',
      next: 'blank-page',
    },
    {
      id: 'reflect',
      title: 'Reflect',
      kind: 'reflect',
      minutes: 2,
      instructions:
        'Write one sentence on what made recall hard, and when you will test yourself again.',
    },
  ],
  triggers: [{ event: 'review.completed', counter: 'reviews', label: 'Cards reviewed' }],
}

const feynmanLoop: BlueprintInput = {
  schemaVersion: 1,
  id: 'feynman-loop',
  name: 'Feynman Loop',
  version: '1.0.0',
  summary: 'Explain a topic in plain words, find where you stumble, and go around again.',
  author: 'Agono-TOKENMAXXING',
  tags: ['explain', 'metacognition'],
  params: {
    rounds: { type: 'number', label: 'Explain-and-fix rounds', default: 2, min: 1, max: 5 },
    audience: {
      type: 'choice',
      label: 'Explain it to',
      default: 'a 12 year old',
      options: ['a 12 year old', 'a friend in another field', 'your past self'],
    },
  },
  phases: [
    {
      id: 'pick',
      title: 'Pick one concept',
      kind: 'learn',
      minutes: 2,
      instructions: 'Name a single concept. Write it at the top of a page.',
    },
    {
      id: 'explain',
      title: 'Explain it simply',
      kind: 'practice',
      minutes: 6,
      instructions:
        'Explain the concept out loud or on paper in plain words, with no jargon you cannot define.',
      scored: true,
      repeat: { param: 'rounds' },
      branches: [{ when: { metric: 'score', op: '>=', value: 90 }, goto: 'teach-back' }],
    },
    {
      id: 'find-gaps',
      title: 'Mark the gaps',
      kind: 'reflect',
      minutes: 3,
      instructions:
        'Circle every place you hesitated, hand-waved or used a word you cannot define.',
    },
    {
      id: 'teach-back',
      title: 'Teach it back',
      kind: 'recall',
      minutes: 5,
      instructions: 'Give a final, clean explanation without notes, then rate how sure you are.',
      scored: true,
    },
  ],
  triggers: [{ event: 'focus.completed', counter: 'focus-blocks', label: 'Focus blocks' }],
}

const interleavedSet: BlueprintInput = {
  schemaVersion: 1,
  id: 'interleaved-set',
  name: 'Interleaved Problem Set',
  version: '1.0.0',
  summary: 'Rotate between topics so you learn to pick the right method, not just run one.',
  author: 'Agono-TOKENMAXXING',
  tags: ['practice', 'interleaving'],
  params: {
    'block-minutes': { type: 'number', label: 'Minutes per topic', default: 8, min: 3, max: 30 },
    'min-score': { type: 'number', label: 'Take a break below (%)', default: 50, min: 0, max: 100 },
  },
  phases: [
    {
      id: 'topic-a',
      title: 'Topic A problems',
      kind: 'practice',
      minutes: { param: 'block-minutes' },
      instructions: 'Solve problems from topic A. Write the method you chose before you solve.',
    },
    {
      id: 'topic-b',
      title: 'Topic B problems',
      kind: 'practice',
      minutes: { param: 'block-minutes' },
      instructions: 'Switch to topic B. Do not look back at topic A notes.',
    },
    {
      id: 'topic-c',
      title: 'Topic C problems',
      kind: 'practice',
      minutes: { param: 'block-minutes' },
      instructions: 'Switch to topic C. Before each problem, say which topic it belongs to.',
      scored: true,
      branches: [
        { when: { metric: 'score', op: '<', value: { param: 'min-score' } }, goto: 'break' },
      ],
    },
    {
      id: 'break',
      title: 'Short break',
      kind: 'rest',
      minutes: 3,
      instructions: 'Stand up, drink water, no screens.',
      next: 'wrap-up',
    },
    {
      id: 'wrap-up',
      title: 'Wrap up',
      kind: 'reflect',
      minutes: 3,
      instructions: 'List the problem types you mixed up and the cue that tells them apart.',
    },
  ],
  triggers: [{ event: 'review.batch.completed', counter: 'batches', label: 'Review batches' }],
}

function must(input: BlueprintInput): Blueprint {
  const res = validateBlueprint(input)
  if (!res.ok) throw new Error(`invalid sample blueprint: ${JSON.stringify(res.issues)}`)
  return res.blueprint
}

/** The bundled sample methods, validated at import time. */
export const SAMPLE_BLUEPRINTS: readonly Blueprint[] = [
  must(retrievalSprint),
  must(feynmanLoop),
  must(interleavedSet),
]
