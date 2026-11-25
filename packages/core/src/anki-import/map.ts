import { validateCardContent } from '../cards'
import type { CardContent } from '../types'
import { readNotetype } from './notetype'
import {
  hasHtmlOrMedia,
  isEmptyField,
  renderTemplate,
  UnsupportedModelError,
  type RefusalCode,
} from './template'

/** Field separator inside `notes.flds` (0x1f), as the legacy importer uses. */
const FIELD_SEPARATOR = '\x1f'

export const MAP_LIMITS = {
  /** Max chars of rendered front + back summed over every card of one model. */
  maxOutputChars: 64 * 1024 * 1024,
} as const

export interface MappedNote {
  /** notes rowid; notes without a numeric id cannot be matched to cards rows. */
  id: number | undefined
  tags: string[]
  flds: string
}

export interface MappedCard {
  format: 'basic'
  content: CardContent
  tags: string[]
}

export type MapResult =
  | { ok: true; cards: MappedCard[]; notesWithoutCards: number }
  | { ok: false; code: RefusalCode; detail: string }

/**
 * Map every note of one unmatched, normal-kind notetype to basic cards, one per EXISTING
 * `cards(nid, ord)` row. Templates are never synthesized for ordinals Anki did not generate.
 * All-or-nothing per model: any unsupported template, field or card returns a refusal and
 * no cards, so the caller can list the model as skipped without partial output.
 */
export function mapUnmatchedModel(
  model: unknown,
  fallbackName: string,
  notes: readonly MappedNote[],
  ordsByNid: ReadonlyMap<number, readonly number[]>,
): MapResult {
  try {
    const nt = readNotetype(model, fallbackName)
    const cards: MappedCard[] = []
    let notesWithoutCards = 0
    let outputChars = 0
    for (const note of notes) {
      const fields = note.flds.split(FIELD_SEPARATOR)
      if (fields.length !== nt.fields.length) {
        throw new UnsupportedModelError(
          'field-count',
          `note has ${fields.length} fields, notetype has ${nt.fields.length}`,
        )
      }
      const values = new Map<string, string>()
      nt.fields.forEach((name, i) => values.set(name, fields[i]!))
      for (const name of nt.referenced) {
        const v = values.get(name)
        if (v !== undefined && hasHtmlOrMedia(v)) {
          throw new UnsupportedModelError('html-or-media', `field "${name}" holds markup or media`)
        }
      }
      if (!values.has('Tags')) values.set('Tags', note.tags.join(' '))
      if (!values.has('Type')) values.set('Type', nt.name)

      const ords = note.id === undefined ? undefined : ordsByNid.get(note.id)
      if (!ords || ords.length === 0) {
        notesWithoutCards++
        continue
      }
      for (const ord of [...new Set(ords)].sort((a, b) => a - b)) {
        const tmpl = nt.templates.get(ord)
        if (!tmpl) throw new UnsupportedModelError('no-template-for-ord', `card ord ${ord}`)
        const front = renderTemplate(tmpl.question, values, null).trim()
        if (isEmptyField(front))
          throw new UnsupportedModelError('empty-question', `card ord ${ord}`)
        const back = renderTemplate(tmpl.answer, values, front).trim() || '...'
        outputChars += front.length + back.length
        if (outputChars > MAP_LIMITS.maxOutputChars) {
          throw new UnsupportedModelError(
            'output-too-large',
            'rendered cards over the output budget',
          )
        }
        const validated = validateCardContent('basic', { front, back })
        if (!validated.ok) {
          throw new UnsupportedModelError('invalid-card', validated.errors.join('; '))
        }
        cards.push({ format: 'basic', content: validated.data, tags: note.tags })
      }
    }
    return { ok: true, cards, notesWithoutCards }
  } catch (err) {
    if (err instanceof UnsupportedModelError)
      return { ok: false, code: err.code, detail: err.message }
    throw err
  }
}
