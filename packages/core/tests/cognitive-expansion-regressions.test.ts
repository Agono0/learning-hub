/**
 * Regression tests for the cognitive-expansion domains (circadian, cognitive
 * load, GKT, spatial, dialectic, multimodal). Each block pins a bug that the
 * first version shipped with, so it cannot come back.
 */
import { describe, expect, it } from 'vitest'
import {
  EARCON_HARMONIC_RATIOS,
  TMR_CUE_GAP_MS,
  earconPartials,
  extractIncidentalGlossTokens,
  generateTmrEarcon,
  handsFreeGradeEventSchema,
  nextTmrCueDelayMs,
} from '../src/circadian'
import { evaluateCognitiveLoad } from '../src/cognitive-load'
import { edgesWithinNodes, propagateGktBelief, type GktNode } from '../src/gkt'
import {
  calculateSpatialAudioAttenuation,
  generateArchetypeLoci,
  moveAlongYaw,
} from '../src/spatial'
import {
  DEBATE_CASE_LIBRARY,
  assessDebateVerdict,
  conceptCoverage,
  debateCaseTranscript,
  debateTurnSchema,
  generateProtegeInquiry,
  getDebateCase,
  plantedFallaciesForTurn,
  respondAsProtege,
} from '../src/dialectic'
import {
  codeFenceLanguage,
  extractPaperFormulasAndDefinitions,
  formatTimestamp,
  generateCodeClozeCards,
  generateVideoCards,
  ingestedCardToCardItem,
  parseTranscriptSegments,
  videoDeepLink,
} from '../src/multimodal'
import { validateCardContent } from '../src/cards'
import { cardAnswerText, cardFrontText } from '../src/linter'

// ─── circadian ──────────────────────────────────────────────────────────────

describe('circadian regressions', () => {
  it('earcon generation never indexes past its tables for odd ids', () => {
    for (const id of [-3, 2.7, 0, Number.NaN, 1e9 + 1]) {
      const e = generateTmrEarcon(id)
      expect(e.baseFrequency).toBeGreaterThan(0)
      expect(Object.keys(EARCON_HARMONIC_RATIOS)).toContain(e.harmonicType)
    }
  })

  it('earconPartials honours the harmonic type (not always a fifth)', () => {
    expect(earconPartials({ baseFrequency: 200, harmonicType: 'major_triad' })).toEqual([
      200, 250, 300,
    ])
    expect(earconPartials({ baseFrequency: 200, harmonicType: 'minor_triad' })).toEqual([
      200, 240, 300,
    ])
    expect(earconPartials({ baseFrequency: 220, harmonicType: 'octave' })).toEqual([220, 440])
    expect(earconPartials({ baseFrequency: 220, harmonicType: 'perfect_fifth' })).toEqual([
      220, 330,
    ])
  })

  it('TMR gaps are randomised inside the 20–40 s protocol window', () => {
    expect(nextTmrCueDelayMs(() => 0)).toBe(TMR_CUE_GAP_MS.min)
    expect(nextTmrCueDelayMs(() => 0.999999)).toBeLessThanOrEqual(TMR_CUE_GAP_MS.max)
    expect(nextTmrCueDelayMs(() => 0.5)).toBe(30_000)
    // out-of-range rng output is clamped, never escapes the window
    expect(nextTmrCueDelayMs(() => 7)).toBe(TMR_CUE_GAP_MS.max)
    expect(nextTmrCueDelayMs(() => -1)).toBe(TMR_CUE_GAP_MS.min)
  })

  it('accepts on-screen taps as a hands-free input type', () => {
    const ok = handsFreeGradeEventSchema.safeParse({
      cardId: 1,
      inputType: 'manual_tap',
      grade: 3,
      latencyMs: 1200,
      timestamp: new Date().toISOString(),
    })
    expect(ok.success).toBe(true)
  })

  it('gloss tokenizer emits no empty tokens and round-trips the text', () => {
    const text = 'Hello, world! (Bonjour)'
    const tokens = extractIncidentalGlossTokens(
      text,
      new Map([['bonjour', { cardId: 7, definition: 'hello' }]]),
    )
    expect(tokens.every((t) => t.word !== '')).toBe(true)
    expect(tokens.map((t) => t.word).join('')).toBe(text)
    expect(tokens.find((t) => t.cardId === 7)?.isKnown).toBe(false)
  })
})

// ─── cognitive load ─────────────────────────────────────────────────────────

describe('cognitive load regressions', () => {
  it('a zero or invalid baseline falls back instead of producing NaN/Infinity', () => {
    for (const baselineLatencyMs of [0, -50, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = evaluateCognitiveLoad({ cardId: 1, responseLatencyMs: 4000, baselineLatencyMs })
      expect(Number.isFinite(r.cli)).toBe(true)
      expect(r.cli).toBeGreaterThanOrEqual(0)
      expect(r.cli).toBeLessThanOrEqual(1)
    }
  })

  it('a non-finite latency is treated as zero', () => {
    const r = evaluateCognitiveLoad({ cardId: 1, responseLatencyMs: Number.NaN })
    expect(Number.isFinite(r.cli)).toBe(true)
  })
})

// ─── GKT ────────────────────────────────────────────────────────────────────

const node = (id: string, masteryProb: number): GktNode => ({
  id,
  title: id.toUpperCase(),
  masteryProb,
  slipProb: 0.1,
  guessProb: 0.2,
  transitProb: 0.15,
})

describe('GKT regressions', () => {
  it('a downstream failure never RAISES a very weak prerequisite', () => {
    const nodes = new Map([
      ['a', node('a', 0.01)],
      ['b', node('b', 0.5)],
    ])
    const r = propagateGktBelief(nodes, [{ prerequisiteId: 'a', dependentId: 'b', weight: 1 }], {
      nodeId: 'b',
      passed: false,
    })
    expect(r.updatedMasteries.a).toBeLessThanOrEqual(0.01)
  })

  it('root-cause names the WEAKEST prerequisite, not the first weak one', () => {
    const nodes = new Map([
      ['p1', node('p1', 0.5)],
      ['p2', node('p2', 0.2)],
      ['t', node('t', 0.5)],
    ])
    const r = propagateGktBelief(
      nodes,
      [
        { prerequisiteId: 'p1', dependentId: 't', weight: 1 },
        { prerequisiteId: 'p2', dependentId: 't', weight: 1 },
      ],
      { nodeId: 't', passed: false },
    )
    expect(r.rootCauseAlert?.culpritPrerequisiteId).toBe('p2')
  })

  it('edgesWithinNodes drops edges leaving the node set', () => {
    const edges = [
      { prerequisiteId: 'a', dependentId: 'b', weight: 1 },
      { prerequisiteId: 'a', dependentId: 'z', weight: 1 },
      { prerequisiteId: 'z', dependentId: 'b', weight: 1 },
    ]
    expect(edgesWithinNodes(edges, new Set(['a', 'b']))).toEqual([edges[0]])
  })
})

// ─── spatial ────────────────────────────────────────────────────────────────

describe('spatial regressions', () => {
  const cam: [number, number, number] = [0, 1.6, 0]

  it('a source slightly off-centre IN FRONT pans slightly, not hard left/right', () => {
    // yaw 0 faces -Z; a source 10 m ahead and 1 m right
    const att = calculateSpatialAudioAttenuation(cam, 0, [1, 1.6, -10])
    expect(att.stereoPan).toBeGreaterThan(0)
    expect(att.stereoPan).toBeLessThan(0.2)
  })

  it('pan follows the camera yaw (three.js convention)', () => {
    // Turned 90° left (yaw +π/2) the camera faces -X; a source to the north (-Z) is on its right.
    const att = calculateSpatialAudioAttenuation(cam, Math.PI / 2, [0, 1.6, -5])
    expect(att.stereoPan).toBeGreaterThan(0.9)
    // and a source to the south (+Z) is on its left
    expect(calculateSpatialAudioAttenuation(cam, Math.PI / 2, [0, 1.6, 5]).stereoPan).toBeLessThan(
      -0.9,
    )
  })

  it('a source directly above the camera is centred', () => {
    expect(calculateSpatialAudioAttenuation(cam, 0, [0, 5, 0]).stereoPan).toBe(0)
  })

  it('moveAlongYaw walks forward along the view direction and strafes right', () => {
    expect(moveAlongYaw([0, 1.6, 5], 0, 1, 0)).toEqual([0, 1.6, 4])
    expect(moveAlongYaw([0, 1.6, 5], 0, 0, 1)).toEqual([1, 1.6, 5])
    // facing -X after turning left 90°
    expect(moveAlongYaw([0, 1.6, 0], Math.PI / 2, 1, 0)).toEqual([-1, 1.6, 0])
    // clamped to the floor bounds
    expect(moveAlongYaw([13.5, 1.6, 0], 0, 0, 5, 14)[0]).toBe(14)
  })

  it('palace items can be placed without inventing card links', () => {
    const loci = generateArchetypeLoci('modern_gallery', [
      { id: 11, title: 'Door', cardId: null },
      { id: 12, title: 'Lamp', cardId: 99 },
      { id: 13, title: '' },
    ])
    expect(loci[0]!.cardId).toBeUndefined()
    expect(loci[1]!.cardId).toBe(99)
    expect(loci[2]!.cardId).toBe(13) // legacy shape: id doubles as the card id
    expect(loci[2]!.title).toBe('Locus Anchor')
  })
})

// ─── dialectic ──────────────────────────────────────────────────────────────

describe('dialectic additions', () => {
  it('protégé inquiry handles negative / fractional levels', () => {
    for (const lvl of [-1, 2.5, Number.NaN, 99]) {
      expect(generateProtegeInquiry('Sagas', lvl)).toContain('Sagas')
    }
  })

  it('every library case has unique slugs and valid, fallacy-planted turns', () => {
    const slugs = DEBATE_CASE_LIBRARY.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const c of DEBATE_CASE_LIBRARY) {
      const transcript = debateCaseTranscript(c, new Date('2026-01-01T00:00:00Z'))
      for (const turn of transcript) {
        expect(debateTurnSchema.safeParse(turn).success).toBe(true)
        expect(turn.fallaciesFlagged.length).toBeGreaterThan(0)
      }
      expect(c.protegeKeyConcepts.length).toBeGreaterThan(0)
    }
  })

  it('grades a flag against the planted fallacies of THAT turn', () => {
    const c = getDebateCase('monolith-vs-microservices')!
    const t = debateCaseTranscript(c)
    expect(plantedFallaciesForTurn(t, 'turn-1')).toEqual(['ad_hominem'])
    expect(plantedFallaciesForTurn(t, 'turn-2')).toContain('false_dichotomy')
    expect(plantedFallaciesForTurn(t, 'turn-2')).not.toContain('ad_hominem')
    expect(plantedFallaciesForTurn(t, 'nope')).toEqual([])
    expect(getDebateCase('unknown')).toBeUndefined()
  })

  it('concept coverage matches inflected forms', () => {
    const r = conceptCoverage('Teams scaling across boundaries', ['team', 'scale', 'boundary'])
    expect(r.covered).toEqual(['team', 'scale', 'boundary'])
    expect(r.ratio).toBe(1)
    expect(conceptCoverage('anything', []).ratio).toBe(0)
  })

  it('verdict assessment rewards conditional, grounded synthesis', () => {
    const concepts = ['latency', 'team', 'deploy']
    const weak = assessDebateVerdict('Monoliths win.', concepts)
    const strong = assessDebateVerdict(
      'A monolith wins when one small team owns everything and latency matters, because a single deploy is simpler; once many teams need to deploy independently, splitting services along boundaries pays off.',
      concepts,
    )
    expect(strong.score).toBeGreaterThan(weak.score)
    expect(strong.isConditional).toBe(true)
    expect(weak.isConditional).toBe(false)
    expect(weak.feedback).toMatch(/not AI grading/)
    expect(strong.score).toBeLessThanOrEqual(100)
  })

  it('the protégé asks about a missing concept instead of faking understanding', () => {
    const r = respondAsProtege('It is about queues.', 'sagas', ['queue', 'compensating'])
    expect(r.understood).toBe(false)
    expect(r.reply).toContain('compensating')
    const good = respondAsProtege(
      'A saga splits one business transaction into local steps connected by a queue; when a step fails, compensating actions undo the earlier steps so the system reaches eventual consistency without a global lock across all the services involved.',
      'sagas',
      ['saga', 'queue', 'compensating'],
    )
    expect(good.understood).toBe(true)
  })
})

// ─── multimodal ─────────────────────────────────────────────────────────────

describe('multimodal regressions', () => {
  it('a time mentioned inside spoken text is not a cue', () => {
    const segs = parseTranscriptSegments(
      '00:00:05.000\nWe meet at 10:30 every Monday to review gradient descent.\n',
    )
    expect(segs).toHaveLength(1)
    expect(segs[0]!.text).toContain('10:30')
    expect(segs[0]!.startSec).toBe(5)
  })

  it('parses SRT ranges, skips VTT headers, and derives durations', () => {
    const srt = `WEBVTT
Kind: captions

1
00:00:01,000 --> 00:00:04,500
First line of speech here.

2
00:00:06.000 --> 00:00:09.000 align:start position:10%
Second line.

3
0:12
Third, no end time.`
    const segs = parseTranscriptSegments(srt)
    expect(segs.map((s) => s.text)).toEqual([
      'First line of speech here.',
      'Second line.',
      'Third, no end time.',
    ])
    expect(segs.map((s) => s.startSec)).toEqual([1, 6, 12])
    expect(segs[0]!.durationSec).toBe(3) // 1 → 4 (sub-second part dropped)
    expect(segs[2]!.durationSec).toBe(10) // last cue, no end → default
  })

  it('deep links replace an existing t, keep fragments, and refuse non-http URLs', () => {
    expect(videoDeepLink('https://youtu.be/x?t=3s#top', 75)).toBe('https://youtu.be/x?t=75s#top')
    expect(videoDeepLink('javascript:alert(1)', 5)).toBeNull()
    expect(videoDeepLink('not a url', 5)).toBeNull()
    const cards = generateVideoCards('T', 'javascript:alert(1)', [
      { text: 'A sufficiently long segment of transcript text.', startSec: 3, durationSec: 5 },
    ])
    expect(cards[0]!.back).not.toContain('javascript:')
    expect(cards[0]!.sourceReference).toBeUndefined()
  })

  it('formats timestamps past one hour as h:mm:ss', () => {
    expect(formatTimestamp(75)).toBe('1:15')
    expect(formatTimestamp(3725)).toBe('1:02:05')
    expect(formatTimestamp(-4)).toBe('0:00')
  })

  it('definitions: only line-start headings, and the front never shows the answer', () => {
    const cards = extractPaperFormulasAndDefinitions(
      'By the theorem of Pythagoras we know things.\nTheorem 2 (Bayes). The posterior is proportional to likelihood times prior.\n',
    )
    expect(cards).toHaveLength(1)
    expect(cards[0]!.front).toContain('Theorem 2 (Bayes)')
    expect(cards[0]!.front).not.toContain('posterior')
    expect(cards[0]!.back).toContain('posterior is proportional')
  })

  it('code clozes mask only the identifier (not a matching substring earlier in the line)', () => {
    const cards = generateCodeClozeCards(
      'a.ts',
      'const c = 1\nexport default async function on() {}',
    )
    expect(cards[0]!.front).toContain('const {{c1::c}} = 1')
    expect(cards[1]!.front).toContain('export default async function {{c1::on}}() {}')
  })

  it('code clozes de-duplicate identifiers and fence with the file language', () => {
    const cards = generateCodeClozeCards('m.py', 'def run():\n  pass\ndef run():\n  pass')
    expect(cards).toHaveLength(1)
    expect(cards[0]!.front).toContain('```python')
    expect(codeFenceLanguage('README')).toBe('text')
  })

  it('ingested cards convert to content the card validator accepts', () => {
    const [cloze] = generateCodeClozeCards('a.ts', 'export function velocity() {}')
    const clozeItem = ingestedCardToCardItem(cloze!)
    expect(clozeItem.type).toBe('cloze')
    expect(validateCardContent(clozeItem.type, clozeItem.content).ok).toBe(true)
    expect(clozeItem.content.cloze?.answers).toEqual(['velocity'])

    const basicItem = ingestedCardToCardItem({ front: 'Q?', back: 'A.', format: 'basic' })
    expect(validateCardContent(basicItem.type, basicItem.content).ok).toBe(true)

    // a "cloze" without markers degrades to a valid basic card
    const degraded = ingestedCardToCardItem({ front: 'no markers', back: 'x', format: 'cloze' })
    expect(degraded.type).toBe('basic')
  })
})

describe('card text helpers', () => {
  it('cardAnswerText is the counterpart of cardFrontText', () => {
    expect(cardFrontText({ basic: { front: 'F', back: 'B' } })).toBe('F')
    expect(cardAnswerText({ basic: { front: 'F', back: 'B' } })).toBe('B')
    const cloze = {
      cloze: { text: 'Paris is in {{c1::France}}', answers: ['France'], mode: 'basic' as const },
    }
    expect(cardFrontText(cloze)).toBe('Paris is in ___')
    expect(cardAnswerText(cloze)).toBe('France')
  })
})
