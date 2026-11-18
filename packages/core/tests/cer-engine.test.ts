import { describe, it, expect } from 'vitest'
import {
  CANONICAL_SCIENTIFIC_DEBATES,
  ScientificDebateCaseSchema,
  evaluateCERArgument,
  generateAdversarialCounterArgument,
  generateCERFSRSDeck,
  CERArgumentSubmission,
} from '../src/argumentation/cer-engine'

describe('Claim-Evidence-Reasoning (CER) & Epistemic Argumentation Engine', () => {
  it('validates all 5 canonical scientific debate cases against schema', () => {
    expect(CANONICAL_SCIENTIFIC_DEBATES).toHaveLength(5)
    for (const debate of CANONICAL_SCIENTIFIC_DEBATES) {
      const parsed = ScientificDebateCaseSchema.safeParse(debate)
      expect(parsed.success).toBe(true)
      expect(debate.competingClaims.length).toBeGreaterThanOrEqual(2)
      expect(debate.evidencePool.length).toBeGreaterThanOrEqual(4)
      expect(debate.scientificPrinciples.length).toBeGreaterThanOrEqual(1)
      expect(debate.counterArguments.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('evaluates a basic claim without evidence as Level 1 TAP', () => {
    const debate = CANONICAL_SCIENTIFIC_DEBATES[0]! // AMOC
    const submission: CERArgumentSubmission = {
      debateId: debate.id,
      selectedClaimId: 'claim-amoc-tipping-near',
      claimStatement: 'The AMOC is going to collapse soon.',
      selectedEvidenceIds: [],
      userEvidenceSynthesis: 'There is lots of melting.',
      selectedPrincipleIds: [],
      userReasoningStatement: 'Things are getting warmer.',
    }

    const evalResult = evaluateCERArgument(debate, submission)
    expect(evalResult.tapLevel).toBe(1)
    expect(evalResult.masteryBand).toBe('naive_assertion')
    expect(evalResult.vulnerabilities.length).toBeGreaterThan(0)
  })

  it('penalizes pseudo-evidence in Evidence Quality Index (EQI)', () => {
    const debate = CANONICAL_SCIENTIFIC_DEBATES[0]!
    const submissionWithPseudo: CERArgumentSubmission = {
      debateId: debate.id,
      selectedClaimId: 'claim-amoc-tipping-near',
      claimStatement: 'The AMOC is on course for irreversible bi-stable shutdown this century.',
      selectedEvidenceIds: ['ev-amoc-anecdotal-storm'], // Pseudo/anecdotal evidence!
      userEvidenceSynthesis: 'A fishing vessel reported intense gale storms and cold water.',
      selectedPrincipleIds: ['princ-salt-advection'],
      userReasoningStatement:
        'Because melting decreases salinity, density falls and circulation slows down.',
    }

    const evalResult = evaluateCERArgument(debate, submissionWithPseudo)
    expect(evalResult.eqi).toBeLessThan(50)
    expect(evalResult.vulnerabilities).toContain(
      'Argument incorporates pseudo-evidence or anecdotal assertions lacking methodological rigor.',
    )
  })

  it('achieves Level 4/5 TAP and high Epistemic Rigor Score for triangulated evidence and rebuttal', () => {
    const debate = CANONICAL_SCIENTIFIC_DEBATES[0]!
    const robustSubmission: CERArgumentSubmission = {
      debateId: debate.id,
      selectedClaimId: 'claim-amoc-tipping-near',
      claimStatement:
        'The AMOC has crossed early-warning tipping thresholds and is on course for irreversible bi-stable shutdown this century.',
      selectedEvidenceIds: ['ev-amoc-sst-autocorr', 'ev-amoc-paleo-glacier', 'ev-amoc-cmip6-bias'],
      userEvidenceSynthesis:
        'Subpolar SST fingerprints exhibit critical slowing down through increased variance, mirrored by Heinrich Stadial 1 paleorecords where freshwater pulses suppressed overturning by >70%. CMIP6 stability is an artifact of deep salinity restoring.',
      selectedPrincipleIds: ['princ-salt-advection', 'princ-critical-slowing'],
      userReasoningStatement:
        'According to Stommel salt-advection feedback, high-latitude freshening lowers surface density; consequently, deep convection decelerates, which reduces northward transport of saline waters, creating runaway positive feedback. Furthermore, bifurcation theory demonstrates that increased autocorrelation causally indicates loss of dynamical resilience.',
      targetedCounterArgumentId: 'counter-amoc-rapid',
      userRebuttalStatement:
        'Opponents cite the 2004–2022 RAPID-MOCHA mooring array as evidence of stability; however, this rebuttal is flawed because 18 years of instrumental data is statistically insufficient to disentangle multi-decadal Atlantic Multidecadal Variability from long-term centennial deceleration.',
    }

    const evalResult = evaluateCERArgument(debate, robustSubmission)
    expect(evalResult.tapLevel).toBeGreaterThanOrEqual(4)
    expect(evalResult.ccs).toBeGreaterThanOrEqual(80)
    expect(evalResult.eqi).toBeGreaterThanOrEqual(80)
    expect(evalResult.rdi).toBeGreaterThanOrEqual(80)
    expect(evalResult.ers).toBeGreaterThanOrEqual(80)
    expect(evalResult.masteryBand).toBe('dialectic_mastery')
    expect(evalResult.epistemicStrengths.length).toBeGreaterThanOrEqual(3)
  })

  it('generates adversarial counter-arguments targeting the selected claim', () => {
    const debate = CANONICAL_SCIENTIFIC_DEBATES[1]! // Quantum nonlocality
    const counter = generateAdversarialCounterArgument(debate, 'claim-bohmian-mechanics')

    expect(counter.counterTheorist).toBe('Niels Bohr (1928), Werner Heisenberg (1927)')
    expect(counter.counterClaim).toContain('probability amplitudes')
    expect(counter.rebuttalChallenge).toContain('How does your causal reasoning dismantle')
  })

  it('synthesizes calibrated FSRS-6 review deck with ERS-scaled stability and difficulty', () => {
    const debate = CANONICAL_SCIENTIFIC_DEBATES[3]! // Depression etiology
    const submission: CERArgumentSubmission = {
      debateId: debate.id,
      selectedClaimId: 'claim-neurogenesis-bdnf',
      claimStatement:
        'Depression is an illness of impaired hippocampal neurogenesis and BDNF-mediated synaptic plasticity.',
      selectedEvidenceIds: ['ev-ssri-therapeutic-lag', 'ev-x-ray-neurogenesis-ablation'],
      userEvidenceSynthesis:
        'Fluoxetine increases 5-HT in 45 minutes yet requires 4 weeks for clinical gains, matching the timeline of dentate gyrus granule cell maturation. X-ray ablation of neurogenesis completely blocks antidepressant efficacy.',
      selectedPrincipleIds: ['princ-neurotrophic-hypothesis'],
      userReasoningStatement:
        'Adult hippocampal neurogenesis requires 3–4 weeks for newborn neural progenitor cells to functionally integrate into circuits, explaining the therapeutic lag.',
      userRebuttalStatement:
        'While monoaminergic drugs are effective, asserting serotonin deficiency confuses symptom alleviation with etiology (the aspirin headache fallacy).',
    }

    const evaluation = evaluateCERArgument(debate, submission)
    const deck = generateCERFSRSDeck(debate, submission, evaluation)

    expect(deck.debateId).toBe('debate-depression-etiology')
    expect(deck.cards).toHaveLength(4)

    const types = deck.cards.map((c) => c.cardType)
    expect(types).toEqual([
      'claim_retrieval',
      'evidence_audit',
      'causal_reasoning',
      'rebuttal_defense',
    ])

    for (const card of deck.cards) {
      expect(card.front.length).toBeGreaterThan(20)
      expect(card.back.length).toBeGreaterThan(20)
      expect(card.fsrsParameters.stability).toBeGreaterThan(0)
      expect(card.fsrsParameters.difficulty).toBeGreaterThan(0)
      expect(card.tags).toContain('argumentation')
      expect(card.tags).toContain('neuropharmacology')
    }
  })
})
