/**
 * Scenario corpora for the reflective equilibrium engine (TD-05).
 *
 * CONTENT, not logic: the calibrated Wide Reflective Equilibrium dilemma
 * suites — distributed systems consensus (CAP/PACELC), algorithmic fairness
 * impossibility and medical triage ethics, each an epistemic node/edge graph
 * with dissonant triads and a Brier prediction bank (Rawls 1971; Goodman 1955;
 * Brier 1950; Tetlock 2005/2015). Kept out of
 * `reflective-equilibrium-engine.ts` so engine diffs stay about algorithms,
 * not data. The `ReflectiveEquilibriumSuite` type stays in the engine
 * (type-only import here — type-only cycles are safe); the engine re-exports
 * this constant so every existing import path keeps working.
 *
 * @module @learning-hub/core/equilibrium
 */
import type { ReflectiveEquilibriumSuite } from './reflective-equilibrium-engine'

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
