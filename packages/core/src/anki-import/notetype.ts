import {
  normalizeAnswerSource,
  parseTemplate,
  UnsupportedModelError,
  validateTemplate,
  type TemplateNode,
} from './template'

export const NOTETYPE_LIMITS = { maxFields: 100, maxTemplates: 100 } as const

export interface ReadTemplate {
  ord: number
  question: TemplateNode[]
  answer: TemplateNode[]
}

export interface ReadNotetype {
  name: string
  fields: string[]
  /** Keys a template may reference: note fields plus the special fields supported here. */
  known: ReadonlySet<string>
  templates: Map<number, ReadTemplate>
  /** Field names any template references (checked for markup per note). */
  referenced: ReadonlySet<string>
}

/** Special fields supported on this path (note fields of the same name win, as upstream). */
export const SPECIAL_FIELDS = ['Tags', 'Type'] as const

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function collectKeys(nodes: TemplateNode[], into: Set<string>): void {
  for (const n of nodes) {
    if (n.kind === 'field') into.add(n.name)
    else if (n.kind === 'cond') {
      into.add(n.name)
      collectKeys(n.children, into)
    }
  }
}

/**
 * Read a legacy (schema 11) normal-kind notetype from `col.models` JSON: `flds[].name` and
 * `tmpls[]` with `ord`, `qfmt`, `afmt`. Cloze (`type` 1) never reaches this path: those are
 * mapped by the existing importer. Anything malformed is a typed refusal.
 */
export function readNotetype(model: unknown, fallbackName: string): ReadNotetype {
  if (!isRecord(model)) throw new UnsupportedModelError('bad-notetype', 'model is not an object')
  if (model.type !== 0 && model.type !== undefined) {
    throw new UnsupportedModelError('unsupported-kind', `notetype kind ${String(model.type)}`)
  }
  const name = typeof model.name === 'string' && model.name ? model.name : fallbackName
  const flds = model.flds
  const tmpls = model.tmpls
  if (!Array.isArray(flds) || flds.length === 0 || flds.length > NOTETYPE_LIMITS.maxFields) {
    throw new UnsupportedModelError('bad-notetype', 'flds missing, empty or too many')
  }
  if (!Array.isArray(tmpls) || tmpls.length === 0 || tmpls.length > NOTETYPE_LIMITS.maxTemplates) {
    throw new UnsupportedModelError('bad-notetype', 'tmpls missing, empty or too many')
  }
  const fields: string[] = []
  for (const f of flds) {
    const n = isRecord(f) ? f.name : undefined
    if (typeof n !== 'string' || n === '' || fields.includes(n)) {
      throw new UnsupportedModelError('bad-notetype', 'field name missing or duplicated')
    }
    fields.push(n)
  }
  const known = new Set<string>([...fields, ...SPECIAL_FIELDS, 'FrontSide'])
  known.delete('FrontSide') // handled by validateTemplate per side, never a conditional key
  const templates = new Map<number, ReadTemplate>()
  const referenced = new Set<string>()
  tmpls.forEach((t, index) => {
    if (!isRecord(t) || typeof t.qfmt !== 'string' || typeof t.afmt !== 'string') {
      throw new UnsupportedModelError('bad-notetype', 'template without qfmt/afmt text')
    }
    const ord = typeof t.ord === 'number' ? t.ord : index
    if (!Number.isInteger(ord) || ord < 0 || templates.has(ord)) {
      throw new UnsupportedModelError('bad-notetype', 'template ord invalid or duplicated')
    }
    const question = parseTemplate(t.qfmt)
    const answer = parseTemplate(normalizeAnswerSource(t.afmt))
    validateTemplate(question, known, 'question')
    validateTemplate(answer, known, 'answer')
    collectKeys(question, referenced)
    collectKeys(answer, referenced)
    templates.set(ord, { ord, question, answer })
  })
  return { name, fields, known, templates, referenced }
}
