/** The full audit: candidates, behavioural evidence, severity, decisions and advice. */
import {
  INF_DEFAULTS,
  clamp01,
  pairKey,
  round3,
  type Band,
  type InfCard,
  type InfReview,
  type PairKind,
  type PairStatus,
} from './cues'
import { findCandidates } from './detect'
import { pairEvidence, type Evidence } from './evidence'
import { adviceFor, diffWords, type DiffWords, type PairAdvice } from './plan'

export interface PairDecision {
  a: number
  b: number
  status: PairStatus
}

export interface PairReport {
  a: number
  b: number
  kind: PairKind
  cueSimilarity: number
  targetSimilarity: number
  /** 0 to 1. */
  severity: number
  band: Band
  evidence: Evidence
  status: PairStatus | null
  cueDiff: DiffWords
  targetDiff: DiffWords
  advice: PairAdvice
}

export interface InfAudit {
  asOf: string
  windowDays: number
  scanned: number
  truncated: boolean
  /** Pairs found before dismissed ones were removed. */
  found: number
  dismissed: number
  confirmed: number
  /** Pairs shown (at most maxPairs, highest severity first). */
  pairs: PairReport[]
  byKind: Record<PairKind, number>
  /** Distinct cards in a shown pair of interference kind (not duplicates). */
  cardsAffected: number
  meanSeverity: number
}

export interface InfAuditOptions {
  now?: Date
  windowDays?: number
  decisions?: PairDecision[]
  maxPairs?: number
}

export const EVIDENCE_BOOST = 0.25
export const CONFIRM_BOOST = 0.2

export function bandFor(severity: number): Band {
  if (severity >= INF_DEFAULTS.highAt) return 'high'
  if (severity >= INF_DEFAULTS.watchAt) return 'watch'
  return 'low'
}

export function runInterferenceAudit(
  cards: InfCard[],
  reviews: InfReview[],
  opts: InfAuditOptions = {},
): InfAudit {
  const now = opts.now ?? new Date()
  const windowDays = opts.windowDays ?? INF_DEFAULTS.windowDays
  const since = now.getTime() - windowDays * 86_400_000
  const recent = reviews.filter((r) => {
    const t = Date.parse(r.reviewedAt)
    return Number.isFinite(t) && t >= since && t <= now.getTime()
  })
  const status = new Map<string, PairStatus>()
  for (const d of opts.decisions ?? []) status.set(pairKey(d.a, d.b), d.status)

  const found = findCandidates(cards)
  const byId = new Map(cards.map((c) => [c.id, c]))
  const byCard = new Map<number, InfReview[]>()
  for (const r of recent) {
    const list = byCard.get(r.cardId)
    if (list) list.push(r)
    else byCard.set(r.cardId, [r])
  }
  const byKind: Record<PairKind, number> = {
    'same-cue-different-target': 0,
    'same-target-different-cue': 0,
    lookalike: 0,
    'near-duplicate': 0,
  }
  let dismissed = 0
  let confirmed = 0
  const reports: PairReport[] = []
  for (const c of found.candidates) {
    const st = status.get(pairKey(c.a, c.b)) ?? null
    if (st === 'dismissed') {
      dismissed++
      continue
    }
    if (st === 'confirmed') confirmed++
    byKind[c.kind]++
    const ca = byId.get(c.a)!
    const cb = byId.get(c.b)!
    const merged = [...(byCard.get(c.a) ?? []), ...(byCard.get(c.b) ?? [])]
    const evidence = pairEvidence(c.a, c.b, merged)
    const interfering = c.kind !== 'near-duplicate' && evidence.verdict === 'interfering'
    const severity = round3(
      clamp01(
        c.base + (interfering ? EVIDENCE_BOOST : 0) + (st === 'confirmed' ? CONFIRM_BOOST : 0),
      ),
    )
    const cueDiff = diffWords(ca.cue, cb.cue)
    const targetDiff = diffWords(ca.target, cb.target)
    reports.push({
      a: c.a,
      b: c.b,
      kind: c.kind,
      cueSimilarity: c.cueSimilarity,
      targetSimilarity: c.targetSimilarity,
      severity,
      band: bandFor(severity),
      evidence,
      status: st,
      cueDiff,
      targetDiff,
      advice: adviceFor(c.kind, cueDiff, targetDiff),
    })
  }
  reports.sort((x, y) => y.severity - x.severity || x.a - y.a || x.b - y.b)
  const shown = reports.slice(0, opts.maxPairs ?? INF_DEFAULTS.maxPairs)
  const affected = new Set<number>()
  for (const p of shown)
    if (p.kind !== 'near-duplicate') {
      affected.add(p.a)
      affected.add(p.b)
    }
  return {
    asOf: now.toISOString(),
    windowDays,
    scanned: found.scanned,
    truncated: found.truncated,
    found: found.candidates.length,
    dismissed,
    confirmed,
    pairs: shown,
    byKind,
    cardsAffected: affected.size,
    meanSeverity: shown.length
      ? round3(shown.reduce((s, p) => s + p.severity, 0) / shown.length)
      : 0,
  }
}
