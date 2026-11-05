/**
 * Plain-text rendering of any exercise as a front/back pair — for places that
 * only understand text: Anki export, the card linter, printable mock exams,
 * search indexing. Lossy by design; the interactive renderer is the real UI.
 */
import { clozeBlanks, clozePrompt } from './grade'
import type { Exercise } from './schema'

export interface ExerciseText {
  /** Question side (prompt plus whatever the learner must see to answer). */
  front: string
  /** Answer side. */
  back: string
  /** Accepted short answers when the exercise has some (for exact-match exams). */
  answers: string[]
}

const list = (items: string[]) => items.map((s, i) => `${i + 1}. ${s}`).join('\n')

/** Convert an exercise to a text front/back pair. */
export function exerciseToText(e: Exercise): ExerciseText {
  switch (e.type) {
    case 'mcq':
      return {
        front: `${e.prompt}\n\n${list(e.options)}`,
        back: e.options[e.answer] ?? '',
        answers: [e.options[e.answer] ?? ''],
      }
    case 'multi': {
      const correct = e.answers.map((i) => e.options[i] ?? '')
      return { front: `${e.prompt}\n\n${list(e.options)}`, back: correct.join('; '), answers: [] }
    }
    case 'truefalse':
      return {
        front: `True or false: ${e.prompt}`,
        back: e.answer ? 'True' : 'False',
        answers: [e.answer ? 'true' : 'false'],
      }
    case 'numeric': {
      const v = `${e.answer}${e.unit ? ` ${e.unit}` : ''}`
      return { front: e.prompt, back: v, answers: [String(e.answer)] }
    }
    case 'typein':
      return { front: e.prompt, back: e.answers[0]!, answers: e.answers }
    case 'cloze': {
      const blanks = clozeBlanks(e.text)
      return {
        front: `${e.prompt}\n\n${clozePrompt(e.text)}`,
        back: blanks.map((b) => b[0]).join('; '),
        answers: blanks.length === 1 ? blanks[0]! : [],
      }
    }
    case 'ordering':
      return { front: e.prompt, back: list(e.items), answers: [] }
    case 'parsons':
      return { front: e.prompt, back: e.lines.join('\n'), answers: [] }
    case 'matching':
      return {
        front: e.prompt,
        back: e.pairs.map((p) => `${p.left} → ${p.right}`).join('\n'),
        answers: [],
      }
    case 'categorize':
      return {
        front: e.prompt,
        back: e.categories.map((c) => `${c.name}: ${c.items.join(', ')}`).join('\n'),
        answers: [],
      }
    case 'freetext':
      return { front: e.prompt, back: e.modelAnswer ?? `Rubric:\n${list(e.rubric)}`, answers: [] }
    case 'code':
      return { front: e.prompt, back: e.solution ?? '(see tests)', answers: [] }
  }
}
