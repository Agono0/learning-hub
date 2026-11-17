import { describe, expect, it } from 'vitest'
import {
  computeReadability,
  countCausalMarkers,
  countSentences,
  estimateSyllables,
  evaluateFeynmanExplanation,
  extractJargon,
  extractWords,
  feynmanDiagnosticReportSchema,
} from '../src/feynman/index.js'

describe('Feynman Teach-Back & Readability Socratic Comprehensive Suite', () => {
  describe('Syllable Estimation Heuristics', () => {
    it('accurately counts syllables for common monosyllabic and polysyllabic words', () => {
      expect(estimateSyllables('the')).toBe(1)
      expect(estimateSyllables('cat')).toBe(1)
      expect(estimateSyllables('neuroplasticity')).toBeGreaterThanOrEqual(5)
      expect(estimateSyllables('differentiation')).toBeGreaterThanOrEqual(5)
      expect(estimateSyllables('algorithm')).toBe(3)
      expect(estimateSyllables('understanding')).toBe(4)
    })

    it('handles edge cases (empty strings, non-alpha, single letter)', () => {
      expect(estimateSyllables('')).toBe(0)
      expect(estimateSyllables('a')).toBe(1)
      expect(estimateSyllables('123')).toBe(0)
    })
  })

  describe('Sentence & Word Extraction', () => {
    it('splits complex multi-sentence paragraphs correctly', () => {
      const text = 'First we split the atom. Then, a massive cascade occurs! Does it stop? No.'
      expect(countSentences(text)).toBe(4)
    })

    it('ignores periods in common abbreviations', () => {
      const text = 'We use e.g. fruit flies and i.e. simple yeasts in this test.'
      expect(countSentences(text)).toBe(1)
    })

    it('extracts sanitized lowercase word tokens', () => {
      const words = extractWords("Don't let memory's decay dictate retrieval!")
      expect(words).toContain("don't")
      expect(words).toContain("memory's")
      expect(words).toContain('decay')
      expect(words).toContain('retrieval')
    })
  })

  describe('Flesch-Kincaid Readability Formulas', () => {
    it('scores elementary simple children prose with high Reading Ease and low Grade Level', () => {
      const simpleText =
        'The sun is hot. It gives light to the earth. Plants need light to grow. When plants grow, animals eat them.'
      const readability = computeReadability(simpleText)

      expect(readability.readingEase).toBeGreaterThanOrEqual(75)
      expect(readability.gradeLevel).toBeLessThanOrEqual(4.5)
    })

    it('scores academic dense jargon prose with low Reading Ease and high Grade Level', () => {
      const academicText =
        'Epistemological differentiation necessitates recursive methodological operationalization across heterogeneous socio-technical paradigms. Consequently, structural reconfiguration emerges through systemic dialectics.'
      const readability = computeReadability(academicText)

      expect(readability.readingEase).toBeLessThan(35)
      expect(readability.gradeLevel).toBeGreaterThanOrEqual(12)
    })
  })

  describe('Causal Reasoning Marker Extraction', () => {
    it('identifies diverse causal connectors across explanatory text', () => {
      const explanation =
        'Because the synapse fires frequently, it triggers a calcium influx, which leads to gene transcription. Therefore, the connection strengthens so that future signals pass easily.'
      const causal = countCausalMarkers(explanation)

      expect(causal.count).toBeGreaterThanOrEqual(4)
      expect(causal.density).toBeGreaterThan(0.5)
    })

    it('returns zero count for purely descriptive text without causal logic', () => {
      const descriptive = 'The box is red. The table is wooden. The room is quiet.'
      const causal = countCausalMarkers(descriptive)
      expect(causal.count).toBe(0)
      expect(causal.density).toBe(0)
    })
  })

  describe('Domain Jargon Detection', () => {
    it('detects polysyllabic non-plain technical jargon terms', () => {
      const text =
        'Backpropagation adjusts hyperparameter gradients via stochastic optimization across multidimensional manifolds.'
      const jargon = extractJargon(text)

      expect(jargon.terms).toContain('backpropagation')
      expect(jargon.terms).toContain('hyperparameter')
      expect(jargon.terms).toContain('multidimensional')
      expect(jargon.density).toBeGreaterThan(15)
    })

    it('ignores standard high-frequency stop words', () => {
      const text = 'Because we can understand and remember everything together over time.'
      const jargon = extractJargon(text)
      expect(jargon.terms).toHaveLength(0)
    })
  })

  describe('Complete Feynman Diagnostic Report & IOED Gap Evaluation', () => {
    it('accurately identifies 12-year-old accessible mastery explanation', () => {
      const report = evaluateFeynmanExplanation({
        concept: 'Water Cycle',
        explanation:
          'When the sun heats up water in the sea, it turns into warm steam and rises into the sky. Because it gets cold up high, the steam turns into drops of water that form clouds. When the clouds get too heavy, it rains so that water flows back to the ocean like a giant water wheel.',
        initialConfidence: 4,
      })

      expect(feynmanDiagnosticReportSchema.safeParse(report).success).toBe(true)
      expect(report.isTwelveYearOldAccessible).toBe(true)
      expect(report.fleschReadingEase).toBeGreaterThan(60)
      expect(report.explanatoryDepthScore).toBeGreaterThanOrEqual(60)
      expect(report.socraticProbes.length).toBeGreaterThan(0)
    })

    it('exposes Illusion of Explanatory Depth (IOED) when high confidence masks jargon soup', () => {
      const report = evaluateFeynmanExplanation({
        concept: 'Quantum Entanglement',
        explanation:
          'Entangled wavefunctions exhibit nonlocal EPR paradox correlations across relativistic spacelike separations through Hilbert space tensor state reduction.',
        initialConfidence: 5, // Learner claims 5/5 expert mastery
      })

      expect(report.isTwelveYearOldAccessible).toBe(false)
      expect(report.jargonDensity).toBeGreaterThan(10)
      // IOED gap: 100 confidence minus low depth score
      expect(report.ioedGap).toBeGreaterThan(30)
      expect(report.suggestedGapCards.length).toBeGreaterThan(0)
      // Gap cards automatically extracted for jargon terms
      const hasJargonCard = report.suggestedGapCards.some((c) => c.tags.includes('jargon-bust'))
      expect(hasJargonCard).toBe(true)
    })
  })
})
