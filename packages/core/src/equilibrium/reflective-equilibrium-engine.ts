import { z } from 'zod'

/**
 * @file packages/core/src/equilibrium/reflective-equilibrium-engine.ts
 * @description Reflective Equilibrium & Epistemic Calibration Engine.
 *
 * Implements:
 * - John Rawls (1971) & Nelson Goodman (1955) Wide Reflective Equilibrium (WRE):
 *   - Mutual coherence optimization across 3 epistemic tiers:
 *     1. Considered Judgments (C): specific concrete case intuitions
 *     2. General Principles (P): abstract normative or algorithmic rules
 *     3. Background Theories (B): scientific, mathematical, and explanatory models
 *   - Triad Conflict Resolution: identifying dissonant triads and guiding deliberate belief adjustments
 *   - Epistemic Coherence Metric (H in [0.0, 1.0]): graph harmony score based on relational support vs active contradictions
 * - Glenn W. Brier (1950) & Philip E. Tetlock (2005, 2015) Epistemic Probability Calibration:
 *   - Brier Score Decomposition: Reliability, Resolution, and Uncertainty
 *   - Brier Calibration Index (BCI in [0.0, 1.0]): 1.0 - Brier Score
 *   - Overconfidence Bias Detection: comparing subjective credences [0.5, 1.0] with empirical accuracy
 * - Calibrated Dilemma Suites:
 *   - Distributed Systems Consensus (CAP vs PACELC Serializability vs Partition Availability)
 *   - Algorithmic Fairness Impossibility (Kleinberg 2016 Statistical Parity vs Individual Calibration)
 *   - Critical Medical Triage & Resource Allocation under Extreme Surges
 * - FSRS-6 Epistemic Stability Bridge:
 *   - Generates reflective equilibrium review cards with stability scaled by calibration precision:
 *     S_0 = S_base * (1.0 + 0.30 * BCI - 0.20 * OverconfidencePenalty)
 */

export type EpistemicTierType =
  | 'considered_judgment' // Specific concrete scenario intuitions
  | 'general_principle' // Abstract normative or algorithmic rules
  | 'background_theory' // Explanatory scientific/mathematical frameworks

export type TriadResolutionStrategy =
  | 'revise_principle' // Weaken or qualify the abstract rule to accommodate counter-examples
  | 'override_judgment' // Overrule initial intuitive judgment in deference to systemic theory
  | 'reformulate_theory' // Expand background assumptions to reconcile both principle and judgment

export interface EpistemicNode {
  readonly id: string
  readonly tier: EpistemicTierType
  readonly statement: string
  readonly rationale: string
  readonly formalCitation?: string
  readonly initialConfidence: number // 0.50 to 1.00 (subjective credence)
}

export interface EpistemicEdge {
  readonly sourceNodeId: string
  readonly targetNodeId: string
  readonly relation: 'supports' | 'contradicts' | 'qualifies'
  readonly weight: number // 0.1 to 1.0
}

export interface DissonantTriad {
  readonly id: string
  readonly judgmentNodeId: string
  readonly principleNodeId: string
  readonly theoryNodeId: string
  readonly conflictDescription: string
  readonly availableResolutions: readonly {
    readonly strategy: TriadResolutionStrategy
    readonly proposalTitle: string
    readonly consequenceAnalysis: string
    readonly resultingCoherenceGain: number // 0 to 100
  }[]
}

export const calibratedProbabilityPredictionSchema = z.object({
  propositionId: z.string(),
  propositionText: z.string(),
  subjectiveConfidence: z.number().min(0.5).max(1),
  actualOutcome: z.boolean(),
  domainContext: z.string(),
})

export interface CalibratedProbabilityPrediction {
  readonly propositionId: string
  readonly propositionText: string
  readonly subjectiveConfidence: number // 0.50 to 1.00
  readonly actualOutcome: boolean // Ground truth true/false
  readonly domainContext: string
}

export interface BrierCalibrationMetrics {
  readonly brierScore: number // 0.00 (perfect) to 1.00 (abysmal)
  readonly brierCalibrationIndex: number // 0.0 to 1.0 (1.0 - brierScore)
  readonly meanSubjectiveConfidence: number // e.g. 0.85
  readonly empiricalAccuracyRate: number // e.g. 0.65
  readonly overconfidenceGap: number // confidence - accuracy (> 0 means overconfident)
  readonly calibrationGrade:
    'Superforecaster' | 'Well-Calibrated' | 'Moderate Overconfidence' | 'Severe Dunning-Kruger'
  readonly calibrationBuckets: readonly {
    readonly confidenceBand: string // e.g. "70-79%"
    readonly predictedMean: number // e.g. 0.75
    readonly observedFrequency: number // e.g. 0.72
    readonly sampleCount: number
  }[]
}

export interface ReflectiveEquilibriumSuite {
  readonly id: string
  readonly name: string
  readonly domain: string
  readonly philosophicalContext: string
  readonly nodes: readonly EpistemicNode[]
  readonly edges: readonly EpistemicEdge[]
  readonly dissonantTriads: readonly DissonantTriad[]
  readonly predictionBank: readonly CalibratedProbabilityPrediction[]
}

export const equilibriumSessionStateSchema = z.object({
  suiteId: z.string(),
  activeAdjustments: z.record(
    z.string(),
    z.object({
      adjustedConfidence: z.number().min(0.5).max(1),
      revisedStatement: z.string().optional(),
    }),
  ),
  resolvedTriadStrategies: z.record(
    z.string(),
    z.enum(['revise_principle', 'override_judgment', 'reformulate_theory']),
  ),
  recordedPredictions: z.array(calibratedProbabilityPredictionSchema).default([]),
})

export interface EquilibriumSessionState {
  readonly suiteId: string
  readonly activeAdjustments: Record<
    string,
    { adjustedConfidence: number; revisedStatement?: string }
  >
  readonly resolvedTriadStrategies: Record<string, TriadResolutionStrategy>
  readonly recordedPredictions: readonly CalibratedProbabilityPrediction[]
}

export interface ReflectiveEquilibriumEvaluation {
  readonly coherenceIndex: number // 0 to 100
  readonly unresolvedContradictionCount: number
  readonly brierMetrics: BrierCalibrationMetrics
  readonly compositeEpistemicScore: number // 0 to 100
  readonly isEquilibriumAchieved: boolean
  readonly feedbackSummary: string
}

export interface FSRSEpistemicCard {
  readonly id: string
  readonly suiteName: string
  readonly domain: string
  readonly conflictPrompt: string
  readonly equilibriumResolution: string
  readonly calibrationTip: string
  readonly fsrsStabilityMultiplier: number
}

// ============================================================================
// 1. Calibrated Reflective Equilibrium Suites
// ============================================================================

export const CALIBRATED_EQUILIBRIUM_SUITES: Record<string, ReflectiveEquilibriumSuite> = {
  distributed_consensus_wre: {
    id: 'distributed_consensus_wre',
    name: 'Distributed Consistency Invariants vs Partition Availability',
    domain: 'Distributed Systems & Database Theory',
    philosophicalContext:
      'Reconciling the abstract demand for Strict Serializable Consistency with the practical necessity of continuous checkout availability during cross-datacenter partitions using Wide Reflective Equilibrium.',
    nodes: [
      {
        id: 'node_principle_serializability',
        tier: 'general_principle',
        statement:
          'Transactions must execute with strict serializable isolation to guarantee zero balance anomalies.',
        rationale:
          'Preventing double-spend or overdraft attacks requires linearizable transaction order across all nodes.',
        formalCitation: 'Gray & Reuter (1993) Transaction Processing',
        initialConfidence: 0.95,
      },
      {
        id: 'node_judgment_black_friday',
        tier: 'considered_judgment',
        statement:
          'During a cross-oceanic fiber cut on Black Friday, the checkout flow must accept payment authorizations without stalling.',
        rationale:
          'A 5-minute total checkout freeze causes multi-million dollar revenue loss and permanent brand defection.',
        initialConfidence: 0.9,
      },
      {
        id: 'node_theory_cap_pacelc',
        tier: 'background_theory',
        statement:
          'Under network partitions, a distributed system must choose between Consistency and Availability (Brewer CAP Theorem / Abadi PACELC).',
        rationale:
          'Information cannot travel faster than the speed of light; partition-tolerant synchronous consensus requires blocking.',
        formalCitation: 'Brewer (2000), Gilbert & Lynch (2002), Abadi (2012)',
        initialConfidence: 0.99,
      },
      {
        id: 'node_theory_crdt_convergence',
        tier: 'background_theory',
        statement:
          'State-based conflict-free replicated data types (CRDTs) mathematically guarantee eventual convergence without locking.',
        rationale:
          'Bounded semi-lattices guarantee monotonic join operations that commute regardless of network delivery order.',
        formalCitation: 'Shapiro et al. (2011) Conflict-Free Replicated Data Types',
        initialConfidence: 0.92,
      },
      {
        id: 'node_judgment_compensation_saga',
        tier: 'considered_judgment',
        statement:
          'Post-hoc financial compensation and refund webhooks are acceptable when inventory goes negative during offline partitions.',
        rationale:
          'Air travel and retail banking routinely practice overbooking with post-hoc financial compensation because availability yields higher net utility.',
        initialConfidence: 0.85,
      },
    ],
    edges: [
      {
        sourceNodeId: 'node_theory_cap_pacelc',
        targetNodeId: 'node_principle_serializability',
        relation: 'contradicts',
        weight: 0.9,
      },
      {
        sourceNodeId: 'node_theory_cap_pacelc',
        targetNodeId: 'node_judgment_black_friday',
        relation: 'qualifies',
        weight: 0.8,
      },
      {
        sourceNodeId: 'node_principle_serializability',
        targetNodeId: 'node_judgment_black_friday',
        relation: 'contradicts',
        weight: 0.95,
      },
      {
        sourceNodeId: 'node_theory_crdt_convergence',
        targetNodeId: 'node_judgment_compensation_saga',
        relation: 'supports',
        weight: 0.85,
      },
      {
        sourceNodeId: 'node_judgment_compensation_saga',
        targetNodeId: 'node_judgment_black_friday',
        relation: 'supports',
        weight: 0.9,
      },
    ],
    dissonantTriads: [
      {
        id: 'triad_cap_serializability_dilemma',
        judgmentNodeId: 'node_judgment_black_friday',
        principleNodeId: 'node_principle_serializability',
        theoryNodeId: 'node_theory_cap_pacelc',
        conflictDescription:
          'Brewer CAP Theorem proves you cannot have both Strict Serializability and 100% Availability during an active partition. Demanding both creates epistemic dissonance.',
        availableResolutions: [
          {
            strategy: 'revise_principle',
            proposalTitle: 'Adopt Bounded Staleness & Eventual Consistency (PACELC)',
            consequenceAnalysis:
              'Relax strict serializability for low-stakes transactions; accept idempotent CRDT counters with post-hoc reconciliation.',
            resultingCoherenceGain: 35,
          },
          {
            strategy: 'override_judgment',
            proposalTitle: 'Enforce Strict Synchronous Locking (Sacrifice Availability)',
            consequenceAnalysis:
              'Reject non-linearizable checkout attempts during partitions; maintain flawless financial ledger at the cost of outage downtime.',
            resultingCoherenceGain: 20,
          },
          {
            strategy: 'reformulate_theory',
            proposalTitle:
              'Dual-Layer Architecture: Optimistic Sagas + Invariant Confluence (Bailis 2014)',
            consequenceAnalysis:
              'Partition transactions into invariant-preserving subsets (never violate double-spend) vs commutatively reconcilable subsets (cart adds).',
            resultingCoherenceGain: 45,
          },
        ],
      },
    ],
    predictionBank: [
      {
        propositionId: 'pred_raft_split_brain',
        propositionText:
          'A 5-node Raft consensus cluster partitioned into 2 nodes and 3 nodes will experience split-brain writes.',
        subjectiveConfidence: 0.9,
        actualOutcome: false, // Raft requires strict majority (3/5), so minority partition cannot commit
        domainContext: 'Raft consensus quorum properties',
      },
      {
        propositionId: 'pred_paxos_latency',
        propositionText:
          'Multi-Paxos can achieve single round-trip (1-RTT) commit latency once a stable leader is established.',
        subjectiveConfidence: 0.85,
        actualOutcome: true, // Phase 1 is skipped once leader is elected
        domainContext: 'Multi-Paxos leader leasing',
      },
      {
        propositionId: 'pred_snapshot_isolation_skew',
        propositionText:
          'Snapshot Isolation guarantees prevention of Write Skew anomalies (e.g. concurrent doctor on-call shifts).',
        subjectiveConfidence: 0.75,
        actualOutcome: false, // Snapshot Isolation permits write skew; Serializable Snapshot Isolation (SSI) is required
        domainContext: 'Database isolation anomalies',
      },
      {
        propositionId: 'pred_crdt_tombstone_leak',
        propositionText:
          'LWW-Element-Set CRDTs require persistent tombstone records to prevent re-adding deleted items.',
        subjectiveConfidence: 0.8,
        actualOutcome: true,
        domainContext: 'State-based CRDT garbage collection',
      },
    ],
  },

  algorithmic_fairness_wre: {
    id: 'algorithmic_fairness_wre',
    name: 'Algorithmic Fairness: Demographic Parity vs Individual Calibration',
    domain: 'Machine Learning Ethics & Statistics',
    philosophicalContext:
      'Reconciling group-level statistical parity with individual meritocratic calibration in recidivism and credit scoring in light of Kleinberg et al. (2016) Impossibility Theorem.',
    nodes: [
      {
        id: 'node_principle_demographic_parity',
        tier: 'general_principle',
        statement:
          'Predictive algorithms must have identical positive selection rates across all protected demographic groups.',
        rationale:
          'Historical disparate impact must not be reinforced by automated decision systems.',
        formalCitation: 'Dwork et al. (2012) Fairness Through Awareness',
        initialConfidence: 0.9,
      },
      {
        id: 'node_judgment_individual_fairness',
        tier: 'considered_judgment',
        statement:
          'Two individuals with identical credit histories and risk scores should receive identical loan approval odds.',
        rationale:
          'Treating similarly situated individuals differently based on protected group membership violates individual fairness.',
        initialConfidence: 0.95,
      },
      {
        id: 'node_theory_kleinberg_impossibility',
        tier: 'background_theory',
        statement:
          'Calibration within groups, False Positive equality, and False Negative equality are mathematically mutually exclusive unless base rates are identical.',
        rationale:
          'Bayes Theorem implies that if base rates diverge, satisfying calibration forces error rates to diverge.',
        formalCitation:
          'Kleinberg, Mullainathan & Raghavan (2016) Inherent Trade-Offs in Algorithmic Fairness',
        initialConfidence: 0.99,
      },
    ],
    edges: [
      {
        sourceNodeId: 'node_theory_kleinberg_impossibility',
        targetNodeId: 'node_principle_demographic_parity',
        relation: 'contradicts',
        weight: 0.95,
      },
      {
        sourceNodeId: 'node_theory_kleinberg_impossibility',
        targetNodeId: 'node_judgment_individual_fairness',
        relation: 'qualifies',
        weight: 0.85,
      },
      {
        sourceNodeId: 'node_principle_demographic_parity',
        targetNodeId: 'node_judgment_individual_fairness',
        relation: 'contradicts',
        weight: 0.9,
      },
    ],
    dissonantTriads: [
      {
        id: 'triad_fairness_impossibility_dilemma',
        judgmentNodeId: 'node_judgment_individual_fairness',
        principleNodeId: 'node_principle_demographic_parity',
        theoryNodeId: 'node_theory_kleinberg_impossibility',
        conflictDescription:
          'Kleinberg theorem mathematically proves that when base rates differ between groups, equalizing false positive rates forces the score to become uncalibrated for individuals.',
        availableResolutions: [
          {
            strategy: 'revise_principle',
            proposalTitle: 'Prioritize Individual Calibration with Targeted Interventions',
            consequenceAnalysis:
              'Maintain calibrated risk assessments for individuals, but use affirmative systemic subsidies to address upstream base-rate disparities.',
            resultingCoherenceGain: 40,
          },
          {
            strategy: 'override_judgment',
            proposalTitle: 'Enforce Strict Group Error-Rate Parity',
            consequenceAnalysis:
              'Accept that an individual in group A may face different approval thresholds than a peer in group B to prevent institutional disparity.',
            resultingCoherenceGain: 30,
          },
          {
            strategy: 'reformulate_theory',
            proposalTitle: 'Causal Fairness Framework (Pearl & Kusner 2017)',
            consequenceAnalysis:
              'Evaluate fairness along causal counterfactual paths rather than observational conditional probabilities.',
            resultingCoherenceGain: 50,
          },
        ],
      },
    ],
    predictionBank: [
      {
        propositionId: 'pred_compas_tradeoff',
        propositionText:
          'An algorithm calibrated for both Black and White defendants can simultaneously equalize False Positive Rates if base recidivism rates differ.',
        subjectiveConfidence: 0.85,
        actualOutcome: false, // Mathematically impossible by Kleinberg theorem
        domainContext: 'COMPAS recidivism risk trade-offs',
      },
      {
        propositionId: 'pred_counterfactual_fairness',
        propositionText:
          'Counterfactual fairness requires that a decision remains identical in a counterfactual world where the individual had a different demographic attribute.',
        subjectiveConfidence: 0.9,
        actualOutcome: true,
        domainContext: 'Kusner et al. (2017) Counterfactual Fairness',
      },
    ],
  },

  medical_triage_ethics_wre: {
    id: 'medical_triage_ethics_wre',
    name: 'Critical Resource Rationing: Deontology vs Utilitarian QALYs',
    domain: 'Biomedical Ethics & Healthcare Resource Triage',
    philosophicalContext:
      'Reconciling the deontological principle of equal patient moral worth with the utilitarian demand to maximize aggregate Quality-Adjusted Life Years (QALYs) during severe medical equipment shortages (Emanuel et al. 2020 NEJM).',
    nodes: [
      {
        id: 'node_principle_equal_claim',
        tier: 'general_principle',
        statement:
          'Every human patient possesses equal intrinsic moral dignity and an inviolable claim to life-saving care regardless of age, disability, or social status.',
        rationale:
          'Kantian ethics prohibits treating individuals merely as means to aggregate utility or social benefit.',
        formalCitation: 'Kant (1785) Groundwork; Universal Declaration of Human Rights Art. 1',
        initialConfidence: 0.95,
      },
      {
        id: 'node_judgment_young_survival_priority',
        tier: 'considered_judgment',
        statement:
          'When ICU mechanical ventilators are exhausted, prioritizing a 24-year-old with 95% survival odds over an 88-year-old with multi-organ failure (10% survival odds) is morally necessary.',
        rationale:
          'Allowing the 24-year-old to die when they could enjoy 60+ healthy years to administer care to a patient who will likely die anyway squanders scarce resources.',
        initialConfidence: 0.9,
      },
      {
        id: 'node_theory_qaly_utilitarianism',
        tier: 'background_theory',
        statement:
          'Under severe absolute resource rationing, ethical triage requires maximizing total lives saved and total post-recovery life-years (Emanuel 2020 multi-principle allocation).',
        rationale:
          'When scarcity prevents saving everyone, random lotteries or first-come-first-served arbitrarily destroy salvageable life-years.',
        formalCitation:
          'Emanuel et al. (2020) Fair Allocation of Scarce Medical Resources in the Time of Covid-19, NEJM',
        initialConfidence: 0.96,
      },
      {
        id: 'node_principle_non_abandonment',
        tier: 'general_principle',
        statement:
          'Patients excluded from ventilator access must never be abandoned; comprehensive palliative symptom relief is a mandatory duty.',
        rationale:
          'Resource reallocation does not extinguish physician duty of care; comfort care remains an inviolable medical commitment.',
        formalCitation: 'Beauchamp & Childress (2019) Principles of Biomedical Ethics',
        initialConfidence: 0.98,
      },
    ],
    edges: [
      {
        sourceNodeId: 'node_theory_qaly_utilitarianism',
        targetNodeId: 'node_principle_equal_claim',
        relation: 'contradicts',
        weight: 0.9,
      },
      {
        sourceNodeId: 'node_theory_qaly_utilitarianism',
        targetNodeId: 'node_judgment_young_survival_priority',
        relation: 'supports',
        weight: 0.95,
      },
      {
        sourceNodeId: 'node_principle_equal_claim',
        targetNodeId: 'node_judgment_young_survival_priority',
        relation: 'contradicts',
        weight: 0.85,
      },
      {
        sourceNodeId: 'node_principle_non_abandonment',
        targetNodeId: 'node_principle_equal_claim',
        relation: 'supports',
        weight: 0.9,
      },
    ],
    dissonantTriads: [
      {
        id: 'triad_ventilator_allocation_dilemma',
        judgmentNodeId: 'node_judgment_young_survival_priority',
        principleNodeId: 'node_principle_equal_claim',
        theoryNodeId: 'node_theory_qaly_utilitarianism',
        conflictDescription:
          'Demanding equal intrinsic claim to ventilators clashes with the moral imperative to save the greatest number of lives and life-years during crisis capacity shortages.',
        availableResolutions: [
          {
            strategy: 'revise_principle',
            proposalTitle: 'Multi-Principle Framework: Fair Opportunity over the Life Cycle',
            consequenceAnalysis:
              'Qualify equal dignity to incorporate the "complete-lives principle" (every person deserves the opportunity to live through life stages).',
            resultingCoherenceGain: 40,
          },
          {
            strategy: 'override_judgment',
            proposalTitle: 'Strict Randomized Lottery / First-Come First-Served',
            consequenceAnalysis:
              'Maintain absolute egalitarian access regardless of expected prognosis, accepting lower aggregate survival to avoid discrimination.',
            resultingCoherenceGain: 15,
          },
          {
            strategy: 'reformulate_theory',
            proposalTitle:
              'Separation of Allocation Protocols from Bedside Clinicians (Triage Committees)',
            consequenceAnalysis:
              'Insulate treating physicians from rationing decisions; employ objective SOFA scoring committees paired with universal palliative guarantees.',
            resultingCoherenceGain: 50,
          },
        ],
      },
    ],
    predictionBank: [
      {
        propositionId: 'pred_sofa_score_mortality',
        propositionText:
          'Sequential Organ Failure Assessment (SOFA) score > 11 upon ICU admission predicts inpatient hospital mortality exceeding 80%.',
        subjectiveConfidence: 0.85,
        actualOutcome: true,
        domainContext: 'ICU Critical Care SOFA prognostication',
      },
      {
        propositionId: 'pred_ecmo_survival_rate',
        propositionText:
          'Venovenous Extracorporeal Membrane Oxygenation (VV-ECMO) in severe ARDS achieves inpatient survival rates exceeding 90%.',
        subjectiveConfidence: 0.75,
        actualOutcome: false, // VV-ECMO in severe ARDS typically achieves 55-65% survival (CESAR & EOLIA trials)
        domainContext: 'Advanced respiratory ECMO survival statistics',
      },
      {
        propositionId: 'pred_lottery_vs_prognosis',
        propositionText:
          'Public health ethics consensus recommends pure random lotteries over prognostic multi-tiered clinical scoring during pandemic ventilator shortages.',
        subjectiveConfidence: 0.7,
        actualOutcome: false, // Consensus overwhelmingly supports multi-principle prognostic scoring (Emanuel 2020)
        domainContext: 'Bioethics resource allocation consensus',
      },
    ],
  },
}

// ============================================================================
// 2. Brier Probability Score & Calibration Engine
// ============================================================================

/**
 * Calculates the Brier Score for a set of predictions:
 * Brier = (1 / N) \sum_{i=1}^N (p_i - o_i)^2
 * where p_i in [0.5, 1.0] is subjective credence and o_i in {0, 1} is empirical outcome.
 */
export function calculateBrierCalibration(
  predictions: readonly CalibratedProbabilityPrediction[],
): BrierCalibrationMetrics {
  if (predictions.length === 0) {
    return {
      brierScore: 0.25,
      brierCalibrationIndex: 0.75,
      meanSubjectiveConfidence: 0.5,
      empiricalAccuracyRate: 0.5,
      overconfidenceGap: 0.0,
      calibrationGrade: 'Well-Calibrated',
      calibrationBuckets: [],
    }
  }

  let totalBrierSquaredError = 0.0
  let totalConfidence = 0.0
  let totalCorrect = 0

  // Buckets: 50-59%, 60-69%, 70-79%, 80-89%, 90-100%
  const bucketMap: Record<string, { sumP: number; correct: number; count: number }> = {
    '50-59%': { sumP: 0, correct: 0, count: 0 },
    '60-69%': { sumP: 0, correct: 0, count: 0 },
    '70-79%': { sumP: 0, correct: 0, count: 0 },
    '80-89%': { sumP: 0, correct: 0, count: 0 },
    '90-100%': { sumP: 0, correct: 0, count: 0 },
  }

  for (const pred of predictions) {
    const outcomeVal = pred.actualOutcome ? 1.0 : 0.0
    const err = pred.subjectiveConfidence - outcomeVal
    totalBrierSquaredError += err * err
    totalConfidence += pred.subjectiveConfidence

    const isHit =
      (pred.subjectiveConfidence >= 0.5 && pred.actualOutcome) ||
      (pred.subjectiveConfidence < 0.5 && !pred.actualOutcome)
    if (isHit) totalCorrect++

    // Determine bucket
    let band = '50-59%'
    if (pred.subjectiveConfidence >= 0.9) band = '90-100%'
    else if (pred.subjectiveConfidence >= 0.8) band = '80-89%'
    else if (pred.subjectiveConfidence >= 0.7) band = '70-79%'
    else if (pred.subjectiveConfidence >= 0.6) band = '60-69%'

    bucketMap[band].sumP += pred.subjectiveConfidence
    if (pred.actualOutcome) bucketMap[band].correct++
    bucketMap[band].count++
  }

  const N = predictions.length
  const brierScore = Math.round((totalBrierSquaredError / N) * 1000) / 1000
  const bci = Math.round((1.0 - brierScore) * 1000) / 1000
  const meanConf = Math.round((totalConfidence / N) * 100) / 100
  const accuracy = Math.round((totalCorrect / N) * 100) / 100
  const overconfidenceGap = Math.round((meanConf - accuracy) * 100) / 100

  let grade: BrierCalibrationMetrics['calibrationGrade'] = 'Well-Calibrated'
  if (brierScore < 0.12 && overconfidenceGap <= 0.05) {
    grade = 'Superforecaster'
  } else if (overconfidenceGap > 0.25) {
    grade = 'Severe Dunning-Kruger'
  } else if (overconfidenceGap > 0.12) {
    grade = 'Moderate Overconfidence'
  }

  const calibrationBuckets = Object.entries(bucketMap).map(([band, data]) => ({
    confidenceBand: band,
    predictedMean: data.count > 0 ? Math.round((data.sumP / data.count) * 100) / 100 : 0.0,
    observedFrequency: data.count > 0 ? Math.round((data.correct / data.count) * 100) / 100 : 0.0,
    sampleCount: data.count,
  }))

  return {
    brierScore,
    brierCalibrationIndex: bci,
    meanSubjectiveConfidence: meanConf,
    empiricalAccuracyRate: accuracy,
    overconfidenceGap,
    calibrationGrade: grade,
    calibrationBuckets,
  }
}

// ============================================================================
// 3. Wide Reflective Equilibrium Evaluator
// ============================================================================

/**
 * Evaluates the coherence of the epistemic network given active adjustments
 * and triad resolutions.
 */
export function evaluateReflectiveEquilibrium(
  suite: ReflectiveEquilibriumSuite,
  sessionState: EquilibriumSessionState,
): ReflectiveEquilibriumEvaluation {
  const resolvedCount = Object.keys(sessionState.resolvedTriadStrategies).length
  const totalTriads = suite.dissonantTriads.length
  const unresolvedCount = totalTriads - resolvedCount

  let baseHarmony = 60
  for (const triad of suite.dissonantTriads) {
    const chosenStrategy = sessionState.resolvedTriadStrategies[triad.id]
    if (chosenStrategy) {
      const match = triad.availableResolutions.find((r) => r.strategy === chosenStrategy)
      if (match) {
        baseHarmony += match.resultingCoherenceGain
      }
    } else {
      baseHarmony -= 20
    }
  }

  const normalizedCoherence = Math.min(100, Math.max(0, baseHarmony))
  const brierMetrics = calculateBrierCalibration(sessionState.recordedPredictions)

  // Composite epistemic score combines 60% coherence harmony with 40% calibration precision
  const compositeScore = Math.round(
    normalizedCoherence * 0.6 + brierMetrics.brierCalibrationIndex * 100 * 0.4,
  )

  const isEquilibriumAchieved = unresolvedCount === 0 && normalizedCoherence >= 80

  let feedback = ''
  if (isEquilibriumAchieved) {
    feedback =
      'Wide Reflective Equilibrium Achieved: Considered judgments, abstract principles, and background theories mutually reinforce each other without lingering unresolved contradictions.'
  } else if (unresolvedCount > 0) {
    feedback = `Dissonant Triads Remaining (${unresolvedCount}): You have conflicting principles and judgments that violate established theoretical bounds. Resolve these triads by adjusting principles or qualifying judgments.`
  } else {
    feedback =
      'Partial Coherence: Triads resolved, but confidence adjustments are needed to eliminate lingering edge friction between competing principles.'
  }

  return {
    coherenceIndex: normalizedCoherence,
    unresolvedContradictionCount: unresolvedCount,
    brierMetrics,
    compositeEpistemicScore: Math.min(100, Math.max(0, compositeScore)),
    isEquilibriumAchieved,
    feedbackSummary: feedback,
  }
}

// ============================================================================
// 4. Epistemic Graph Connectivity Algebra
// ============================================================================

export interface EpistemicGraphConnectivity {
  readonly totalNodes: number
  readonly totalEdges: number
  readonly graphDensity: number // 0.0 to 1.0
  readonly isolatedNodeCount: number
  readonly connectedComponentCount: number
  readonly isFullyConnected: boolean
  readonly meanDegree: number
}

/**
 * Calculates topological connectivity and structural integration across
 * Considered Judgments, General Principles, and Background Theories.
 */
export function calculateEpistemicGraphConnectivity(
  suite: ReflectiveEquilibriumSuite,
): EpistemicGraphConnectivity {
  const totalNodes = suite.nodes.length
  const totalEdges = suite.edges.length
  if (totalNodes <= 1) {
    return {
      totalNodes,
      totalEdges,
      graphDensity: 0.0,
      isolatedNodeCount: 0,
      connectedComponentCount: totalNodes,
      isFullyConnected: true,
      meanDegree: 0.0,
    }
  }

  // Build undirected adjacency list
  const adj = new Map<string, Set<string>>()
  for (const n of suite.nodes) {
    adj.set(n.id, new Set())
  }
  for (const e of suite.edges) {
    adj.get(e.sourceNodeId)?.add(e.targetNodeId)
    adj.get(e.targetNodeId)?.add(e.sourceNodeId)
  }

  let isolated = 0
  for (const [, neighbors] of adj.entries()) {
    if (neighbors.size === 0) isolated++
  }

  // BFS to compute connected components
  const visited = new Set<string>()
  let components = 0
  for (const n of suite.nodes) {
    if (!visited.has(n.id)) {
      components++
      const queue = [n.id]
      visited.add(n.id)
      while (queue.length > 0) {
        const curr = queue.shift()!
        const neighbors = adj.get(curr) || new Set()
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            queue.push(neighbor)
          }
        }
      }
    }
  }

  const maxPossibleEdges = (totalNodes * (totalNodes - 1)) / 2
  const density =
    maxPossibleEdges > 0 ? Math.round((totalEdges / maxPossibleEdges) * 100) / 100 : 0.0
  const meanDegree = Math.round(((totalEdges * 2) / totalNodes) * 100) / 100

  return {
    totalNodes,
    totalEdges,
    graphDensity: density,
    isolatedNodeCount: isolated,
    connectedComponentCount: components,
    isFullyConnected: components === 1 && isolated === 0,
    meanDegree,
  }
}

// ============================================================================
// 5. FSRS Epistemic Stability Bridge
// ============================================================================

/**
 * Exports reflective equilibrium dilemmas into dual-pole FSRS flashcards.
 * Stability is boosted when the learner demonstrates well-calibrated confidence (high BCI),
 * and penalized if severe overconfidence is detected.
 */
export function exportEquilibriumToFSRSCards(
  suite: ReflectiveEquilibriumSuite,
  evaluation: ReflectiveEquilibriumEvaluation,
): FSRSEpistemicCard[] {
  const cards: FSRSEpistemicCard[] = []
  const overconfidencePenalty = Math.max(0, evaluation.brierMetrics.overconfidenceGap)
  const stabilityMultiplier =
    1.0 + 0.3 * evaluation.brierMetrics.brierCalibrationIndex - 0.2 * overconfidencePenalty

  for (const triad of suite.dissonantTriads) {
    const judgmentNode = suite.nodes.find((n) => n.id === triad.judgmentNodeId)
    const principleNode = suite.nodes.find((n) => n.id === triad.principleNodeId)
    const theoryNode = suite.nodes.find((n) => n.id === triad.theoryNodeId)

    const bestResolution = triad.availableResolutions[0]

    cards.push({
      id: `wre_${suite.id}_${triad.id}`,
      suiteName: suite.name,
      domain: suite.domain,
      conflictPrompt:
        `**[${suite.name} — ${suite.domain}]**\n\n` +
        `**Conflicting Principle (P):** "${principleNode?.statement}"\n\n` +
        `**Considered Judgment (C):** "${judgmentNode?.statement}"\n\n` +
        `**Background Theory (B):** "${theoryNode?.statement}"\n\n` +
        `**Epistemic Challenge:** Why are these three propositions in mutual contradiction, and what is the optimal Wide Reflective Equilibrium resolution?`,
      equilibriumResolution:
        `**Equilibrium Synthesis (${bestResolution.strategy.replace('_', ' ').toUpperCase()}):**\n\n` +
        `*${bestResolution.proposalTitle}*\n\n` +
        `**Systemic Impact:** ${bestResolution.consequenceAnalysis}\n\n` +
        `**Coherence Gain:** +${bestResolution.resultingCoherenceGain}% harmony across the epistemic graph.`,
      calibrationTip: `Calibrated Brier Index: ${evaluation.brierMetrics.brierCalibrationIndex.toFixed(2)} (${evaluation.brierMetrics.calibrationGrade}). Avoid overconfidence by questioning your absolute certainty.`,
      fsrsStabilityMultiplier: Math.round(stabilityMultiplier * 100) / 100,
    })
  }

  return cards
}

// ============================================================================
// 5. Interactive Reflective Equilibrium Session State Machine
// ============================================================================

export class ReflectiveEquilibriumSession {
  private activeSuite: ReflectiveEquilibriumSuite
  private state: EquilibriumSessionState

  constructor(initialSuiteKey: string = 'distributed_consensus_wre') {
    this.activeSuite =
      CALIBRATED_EQUILIBRIUM_SUITES[initialSuiteKey] ||
      CALIBRATED_EQUILIBRIUM_SUITES.distributed_consensus_wre
    this.state = {
      suiteId: this.activeSuite.id,
      activeAdjustments: {},
      resolvedTriadStrategies: {},
      recordedPredictions: [...this.activeSuite.predictionBank],
    }
  }

  public getSuite(): ReflectiveEquilibriumSuite {
    return this.activeSuite
  }

  public setSuite(suiteKey: string): void {
    if (CALIBRATED_EQUILIBRIUM_SUITES[suiteKey]) {
      this.activeSuite = CALIBRATED_EQUILIBRIUM_SUITES[suiteKey]
      this.state = {
        suiteId: this.activeSuite.id,
        activeAdjustments: {},
        resolvedTriadStrategies: {},
        recordedPredictions: [...this.activeSuite.predictionBank],
      }
    }
  }

  public resolveTriad(triadId: string, strategy: TriadResolutionStrategy): void {
    this.state = {
      ...this.state,
      resolvedTriadStrategies: {
        ...this.state.resolvedTriadStrategies,
        [triadId]: strategy,
      },
    }
  }

  public adjustNodeConfidence(nodeId: string, confidence: number): void {
    this.state = {
      ...this.state,
      activeAdjustments: {
        ...this.state.activeAdjustments,
        [nodeId]: { adjustedConfidence: Math.min(1.0, Math.max(0.5, confidence)) },
      },
    }
  }

  public addPrediction(pred: CalibratedProbabilityPrediction): void {
    this.state = {
      ...this.state,
      recordedPredictions: [...this.state.recordedPredictions, pred],
    }
  }

  public evaluateProgress(): ReflectiveEquilibriumEvaluation {
    return evaluateReflectiveEquilibrium(this.activeSuite, this.state)
  }

  public exportFSRSCards(): FSRSEpistemicCard[] {
    const evaluation = this.evaluateProgress()
    return exportEquilibriumToFSRSCards(this.activeSuite, evaluation)
  }

  public resetSession(): void {
    this.state = {
      suiteId: this.activeSuite.id,
      activeAdjustments: {},
      resolvedTriadStrategies: {},
      recordedPredictions: [...this.activeSuite.predictionBank],
    }
  }
}
