/**
 * Fact-bank quality checks. Poorly written facts make poor "why" questions:
 * a fact with no stated relation has nothing to explain, and near-duplicates
 * waste practice. These lint rules run before a bank is saved.
 */
import { classifyFact, contentWords, tokenize, type EiFact } from './index'

export interface FactIssue {
  factId: string
  code: 'too-short' | 'too-long' | 'no-relation' | 'no-key-terms' | 'duplicate' | 'definition-only'
  message: string
}

/** Jaccard similarity of two facts' content-word sets, 0..1. */
export function similarity(a: string, b: string): number {
  const sa = new Set(contentWords(a))
  const sb = new Set(contentWords(b))
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const w of sa) if (sb.has(w)) inter++
  return inter / (sa.size + sb.size - inter)
}

/**
 * Lint a bank. `duplicate` fires at similarity >= 0.7 and names the earlier
 * fact. `no-relation` fires for `general` facts, which give "why" little to grip.
 */
export function lintFacts(facts: EiFact[]): FactIssue[] {
  const issues: FactIssue[] = []
  facts.forEach((f, i) => {
    const n = tokenize(f.statement).length
    if (n < 6)
      issues.push({
        factId: f.id,
        code: 'too-short',
        message: 'Fewer than 6 words: add the relation or context.',
      })
    if (n > 45)
      issues.push({
        factId: f.id,
        code: 'too-long',
        message: 'More than 45 words: split into two facts.',
      })
    const kind = classifyFact(f.statement)
    if (kind === 'general')
      issues.push({
        factId: f.id,
        code: 'no-relation',
        message: 'No cause, category, quantity or contrast found: state how things relate.',
      })
    if (kind === 'categorical' && n < 9)
      issues.push({
        factId: f.id,
        code: 'definition-only',
        message: 'A bare definition is easy to copy: add why it matters or how it differs.',
      })
    if (f.keyTerms.length === 0 && contentWords(f.statement).length < 3)
      issues.push({
        factId: f.id,
        code: 'no-key-terms',
        message: 'Add key terms so coverage can be graded.',
      })
    for (let j = 0; j < i; j++) {
      const other = facts[j] as EiFact
      if (similarity(f.statement, other.statement) >= 0.7) {
        issues.push({ factId: f.id, code: 'duplicate', message: `Near-duplicate of ${other.id}.` })
        break
      }
    }
  })
  return issues
}

/** Remove near-duplicates, keeping the first of each cluster. */
export function dedupeFacts(facts: EiFact[]): EiFact[] {
  const kept: EiFact[] = []
  for (const f of facts)
    if (!kept.some((k) => similarity(k.statement, f.statement) >= 0.7)) kept.push(f)
  return kept
}
