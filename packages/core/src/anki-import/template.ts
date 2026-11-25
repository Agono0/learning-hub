/**
 * Plain-text subset of the Anki card template language, for notetypes the legacy importer
 * does not already map by name. Grounded in ankitects/anki tag 25.09.2 rslib/src/template.rs
 * (https://raw.githubusercontent.com/ankitects/anki/25.09.2/rslib/src/template.rs):
 * `{{Field}}`, `{{#F}}..{{/F}}`, `{{^F}}..{{/F}}` with nesting, `{{FrontSide}}` on the answer
 * side only, and the empty-field rule. Everything else is a typed refusal, never a guess:
 * HTML or entities in template text, media tags, any filter (a `:` in a tag), comments,
 * the `{{= =}}` syntax switch, unknown keys, unbalanced tags. Upstream ignores unknown
 * filters silently; this parser refuses them. Nothing here executes template text, converts
 * HTML, or sanitizes anything.
 */

export const TEMPLATE_LIMITS = {
  /** Max chars of one qfmt or afmt. */
  maxTemplateChars: 64 * 1024,
  /** Max conditional nesting depth. */
  maxDepth: 16,
  /** Max parsed nodes in one template. */
  maxNodes: 2_000,
  /** Max chars of one rendered side. */
  maxRenderedChars: 100_000,
} as const

export type RefusalCode =
  | 'template-too-large'
  | 'too-deep'
  | 'too-many-nodes'
  | 'html-or-media'
  | 'filter'
  | 'syntax'
  | 'unbalanced'
  | 'unknown-key'
  | 'frontside-on-question'
  | 'output-too-large'
  | 'bad-notetype'
  | 'field-count'
  | 'no-template-for-ord'
  | 'empty-question'
  | 'invalid-card'
  | 'unsupported-kind'

/** A template, notetype or note this path will not map. Carries a stable code. */
export class UnsupportedModelError extends Error {
  constructor(
    readonly code: RefusalCode,
    detail: string,
  ) {
    super(`${code}: ${detail}`)
    this.name = 'UnsupportedModelError'
  }
}

export type TemplateNode =
  | { kind: 'text'; text: string }
  | { kind: 'field'; name: string }
  | { kind: 'cond'; name: string; negated: boolean; children: TemplateNode[] }

/** True when text has markup, an entity, or an Anki media/type tag that this path never converts. */
export function hasHtmlOrMedia(text: string): boolean {
  return /[<&]|\[(?:sound|type):/i.test(text)
}

export function parseTemplate(source: string): TemplateNode[] {
  if (source.length > TEMPLATE_LIMITS.maxTemplateChars) {
    throw new UnsupportedModelError('template-too-large', `${source.length} chars`)
  }
  const root: TemplateNode[] = []
  // stack of open conditionals: the node list being filled and its key
  const stack: { name: string; children: TemplateNode[] }[] = []
  let nodes = 0
  const bump = () => {
    if (++nodes > TEMPLATE_LIMITS.maxNodes) {
      throw new UnsupportedModelError('too-many-nodes', `more than ${TEMPLATE_LIMITS.maxNodes}`)
    }
  }
  const current = () => (stack.length ? stack[stack.length - 1]!.children : root)
  let pos = 0
  while (pos < source.length) {
    const open = source.indexOf('{{', pos)
    const textEnd = open === -1 ? source.length : open
    if (textEnd > pos) {
      const text = source.slice(pos, textEnd)
      if (hasHtmlOrMedia(text)) {
        throw new UnsupportedModelError(
          'html-or-media',
          'markup, entity or media tag in template text',
        )
      }
      bump()
      current().push({ kind: 'text', text })
    }
    if (open === -1) break
    const close = source.indexOf('}}', open + 2)
    if (close === -1) throw new UnsupportedModelError('unbalanced', 'tag without closing braces')
    const raw = source.slice(open + 2, close).trim()
    pos = close + 2
    if (raw === '' || raw.startsWith('{') || raw.startsWith('=') || raw.startsWith('!')) {
      throw new UnsupportedModelError('syntax', 'empty tag, triple brace, comment or syntax switch')
    }
    const sigil = raw[0]
    if (sigil === '#' || sigil === '^') {
      const name = raw.slice(1).trim()
      assertKey(name)
      if (stack.length >= TEMPLATE_LIMITS.maxDepth) {
        throw new UnsupportedModelError('too-deep', `nesting over ${TEMPLATE_LIMITS.maxDepth}`)
      }
      bump()
      const children: TemplateNode[] = []
      current().push({ kind: 'cond', name, negated: sigil === '^', children })
      stack.push({ name, children })
    } else if (sigil === '/') {
      const name = raw.slice(1).trim()
      const top = stack.pop()
      if (!top || top.name !== name) {
        throw new UnsupportedModelError('unbalanced', `closing tag for "${name}" does not match`)
      }
    } else {
      assertKey(raw)
      bump()
      current().push({ kind: 'field', name: raw })
    }
  }
  if (stack.length) {
    throw new UnsupportedModelError(
      'unbalanced',
      `"${stack[stack.length - 1]!.name}" is not closed`,
    )
  }
  return root
}

function assertKey(name: string): void {
  if (name === '') throw new UnsupportedModelError('syntax', 'empty key')
  if (name.includes(':')) throw new UnsupportedModelError('filter', 'filters are not supported')
  if (/[{}#^/<>&]/.test(name))
    throw new UnsupportedModelError('syntax', 'unsupported key characters')
}

/**
 * Every key in every branch must be known, as upstream checks even discarded branches.
 * `FrontSide` is valid only as a replacement on the answer side.
 */
export function validateTemplate(
  nodes: TemplateNode[],
  known: ReadonlySet<string>,
  side: 'question' | 'answer',
): void {
  for (const n of nodes) {
    if (n.kind === 'text') continue
    if (n.kind === 'field') {
      if (n.name === 'FrontSide') {
        if (side === 'question') {
          throw new UnsupportedModelError(
            'frontside-on-question',
            'FrontSide in a question template',
          )
        }
        continue
      }
      if (!known.has(n.name)) throw new UnsupportedModelError('unknown-key', n.name)
      continue
    }
    if (!known.has(n.name)) throw new UnsupportedModelError('unknown-key', `conditional ${n.name}`)
    validateTemplate(n.children, known, side)
  }
}

/** Upstream empty rule restricted to plain text: whitespace only (markup is refused earlier). */
export function isEmptyField(value: string): boolean {
  return value.trim() === ''
}

/** Render a validated template. Throws `output-too-large` past the cap; never truncates. */
export function renderTemplate(
  nodes: TemplateNode[],
  values: ReadonlyMap<string, string>,
  frontSide: string | null,
): string {
  const out: string[] = []
  let size = 0
  const emit = (s: string) => {
    size += s.length
    if (size > TEMPLATE_LIMITS.maxRenderedChars) {
      throw new UnsupportedModelError(
        'output-too-large',
        `rendered side over ${TEMPLATE_LIMITS.maxRenderedChars} chars`,
      )
    }
    out.push(s)
  }
  const walk = (list: TemplateNode[]) => {
    for (const n of list) {
      if (n.kind === 'text') emit(n.text)
      else if (n.kind === 'field') {
        emit(n.name === 'FrontSide' ? (frontSide ?? '') : (values.get(n.name) ?? ''))
      } else {
        const nonEmpty = !isEmptyField(values.get(n.name) ?? '')
        if (nonEmpty !== n.negated) walk(n.children)
      }
    }
  }
  walk(nodes)
  return out.join('')
}
