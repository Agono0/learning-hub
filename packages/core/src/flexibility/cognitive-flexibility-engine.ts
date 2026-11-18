import { z } from 'zod'
/**
 * @file packages/core/src/flexibility/cognitive-flexibility-engine.ts
 * @description Cognitive Flexibility & Multi-Perspective Shifting Engine.
 *
 * Implements:
 * - Rand J. Spiro et al. (1987, 1988, 1991) Cognitive Flexibility Theory (CFT):
 *   - Advanced knowledge acquisition in ill-structured, complex conceptual domains
 *   - Nonlinear Landscape Criss-Crossing: revisiting identical cases via multiple thematic paths
 *   - Multi-Perspective Re-Representation across orthogonal interpretive lenses
 *   - Feltovich, Spiro & Coulson (1989) Reductive Bias & Oversimplification Trap Diagnostics:
 *     Additivity Bias, Single-Scale Bias, Categorical Bias, and Static/Deterministic Bias
 * - Edward de Bono (1985) Six Thinking Hats & Lateral Thinking Modalities:
 *   - White (Empirical / Facts), Red (Intuition / Emotional), Black (Adversarial / Risk),
 *     Yellow (Optimistic / Value), Green (Lateral / Generative), Blue (Metacognitive / Governance)
 * - Cognitive Dispersion & Rigidity Metrics:
 *   - Perspective Dispersion Index (PDI) via Shannon entropy H(P)
 *   - Reductive Bias Susceptibility Score (RBSS)
 *   - Landscape Criss-Cross Coverage Density (C)
 * - FSRS-6 Generalization Bridge: Multi-perspective case transfer card synthesis
 *   with contextual stability scaling: S_0 = S_base * (1 + 0.35 * PDI)
 */

export type ThinkingHatType =
  | 'white_hat' // Information, objective data, measurable facts, missing data
  | 'red_hat' // Intuition, gut visceral reaction, emotional climate, hunches
  | 'black_hat' // Prudence, critical risk, failure modes, regulatory hazards
  | 'yellow_hat' // Optimistic benefits, best-case upsides, feasibility, value
  | 'green_hat' // Creative provocation, lateral alternatives, paradigm shifts
  | 'blue_hat' // Metacognitive orchestration, synthesis, cognitive blindspots

export type ReductiveBiasType =
  | 'additivity_bias' // Assuming linear independent effects without emergent feedback loops
  | 'single_scale_bias' // Analyzing phenomena at a single spatial/temporal resolution
  | 'discrete_categorical_bias' // Forcing continuous non-linear phenomena into rigid binary buckets
  | 'static_deterministic_bias' // Neglecting dynamic equilibrium, stochastic drift, and systemic adaptivity

export type PerspectiveLens =
  | 'mechanistic_technical' // Algorithmic, physical, architecture, throughput
  | 'socio_economic' // Market incentives, human coordination, budget, cost
  | 'ecological_systemic' // Environmental footprint, long-term systemic homeostasis
  | 'teleological_ethical' // Moral alignment, existential purpose, stakeholder equity

export interface CaseThematicNode {
  readonly id: string
  readonly theme: string
  readonly description: string
  readonly crossCuttingCategory: string
}

export interface HatAnalysisEntry {
  readonly hat: ThinkingHatType
  readonly promptQuestion: string
  readonly keyObservations: readonly string[]
  readonly failureModeWarning?: string
  readonly generativeInsight?: string
}

export interface ReductiveTrapDefinition {
  readonly id: string
  readonly type: ReductiveBiasType
  readonly superficialModel: string
  readonly nuancedReality: string
  readonly failureConsequence: string
  readonly remedialCrissCrossStep: string
}

export interface IllStructuredCaseStudy {
  readonly id: string
  readonly title: string
  readonly domain: string
  readonly contextSummary: string
  readonly coreDilemma: string
  readonly thematicNodes: readonly CaseThematicNode[]
  readonly hatAnalyses: Record<ThinkingHatType, HatAnalysisEntry>
  readonly reductiveTraps: readonly ReductiveTrapDefinition[]
  readonly multiPerspectiveLenses: Record<PerspectiveLens, string>
}

export interface CognitiveFlexibilitySuite {
  readonly id: string
  readonly name: string
  readonly domainFamily: string
  readonly description: string
  readonly primaryCase: IllStructuredCaseStudy
  readonly comparisonCases: readonly IllStructuredCaseStudy[]
  readonly universalThemes: readonly string[]
}

export interface CrissCrossStepAttempt {
  readonly caseId: string
  readonly selectedHat: ThinkingHatType
  readonly activeLens: PerspectiveLens
  readonly studentObservations: string
  readonly identifiedThematicNodeIds: readonly string[]
  readonly diagnosedReductiveTrapIds: readonly string[]
}

export interface CognitiveFlexibilityEvaluation {
  readonly perspectiveDispersionIndex: number // 0.0 to 1.0 (normalized Shannon entropy)
  readonly hatCoverageCount: number // Unique hats explored (0 to 6)
  readonly lensCoverageCount: number // Unique lenses explored (0 to 4)
  readonly crissCrossDensity: number // 0.0 to 1.0 (ratio of thematic nodes criss-crossed)
  readonly reductiveBiasMastery: number // 0 to 100 (% of traps identified and resolved)
  readonly cognitiveFlexibilityScore: number // Composite 0 to 100
  readonly cognitiveRigidityWarning: boolean // True if entropy < 0.45 or hat coverage < 3
  readonly feedbackSummary: string
}

export interface FSRSFlexibilityCard {
  readonly id: string
  readonly caseTitle: string
  readonly domain: string
  readonly hat: ThinkingHatType
  readonly lens: PerspectiveLens
  readonly promptFront: string
  readonly solutionBack: string
  readonly reductiveTrapWarning: string
  readonly fsrsStabilityMultiplier: number
}

// ============================================================================
// 1. Calibrated Ill-Structured Domain Suites
// ============================================================================

export const CALIBRATED_FLEXIBILITY_SUITES: Record<string, CognitiveFlexibilitySuite> = {
  distributed_chaos_cascade: {
    id: 'distributed_chaos_cascade',
    name: 'Distributed Cloud Microservices & Cascading Brownout',
    domainFamily: 'Distributed Computing & Chaos Engineering',
    description:
      'Analyze an ill-structured distributed consensus outage under thundering-herd traffic spikes using Spiro CFT and De Bono 6-Hat lateral thinking.',
    universalThemes: [
      'Feedback loop amplification',
      'Nonlinear degradation under resource saturation',
      'Coordination overhead vs localized autonomy',
      'Metacognitive observability boundaries',
    ],
    primaryCase: {
      id: 'case_cloud_thundering_herd',
      title: 'Global Payment Gateway Cascading Retry Storm',
      domain: 'Cloud Infrastructure & High-Frequency Transactions',
      contextSummary:
        'During Black Friday peak load, a transient 250ms Redis cache timeout prompted 40,000 downstream checkout workers to simultaneously issue exponential-backoff retries. The database connection pool hit 100% saturation, health-check endpoints timed out, and Kubernetes liveness probes restarted healthy pods, triggering a self-sustaining death spiral.',
      coreDilemma:
        'Should operators shed customer transactions (damaging revenue and merchant trust), increase replica concurrency (risking full database CPU lockup), or enforce global backpressure rate-limiting (stalling downstream pipelines)?',
      thematicNodes: [
        {
          id: 'node_amplification',
          theme: 'Retry Storm Amplification',
          description:
            'Client retries amplify queue depth geometrically rather than recovering linearly.',
          crossCuttingCategory: 'Nonlinear Dynamics',
        },
        {
          id: 'node_liveness_inversion',
          theme: 'Liveness Probe Inversion',
          description:
            'Liveness probes killing overloaded but functional services exacerbate latency collapse.',
          crossCuttingCategory: 'Control Loop Failure',
        },
        {
          id: 'node_graceful_degradation',
          theme: 'Degraded State Teleology',
          description:
            'Designing degraded modes (offline checkout queueing) preserves macro homeostasis.',
          crossCuttingCategory: 'Systemic Resilience',
        },
        {
          id: 'node_backpressure_homeostasis',
          theme: 'Dynamic Backpressure Regulation',
          description: 'Token-bucket reactive shedding maintains bounded queue service times.',
          crossCuttingCategory: 'Feedback Regulation',
        },
      ],
      hatAnalyses: {
        white_hat: {
          hat: 'white_hat',
          promptQuestion:
            'What are the empirical metrics, hard latency constraints, and verified logs?',
          keyObservations: [
            'Database p99 latency spiked from 12ms to 4,850ms in 18 seconds.',
            'Connection pool utilization locked at 100% with 2,400 queued threads.',
            'Liveness probes timed out after 3 failed 2-second pings, triggering 80 pod restarts/minute.',
            'Network bandwidth remained under 32% utilization; bottleneck was purely database lock contention.',
          ],
        },
        red_hat: {
          hat: 'red_hat',
          promptQuestion:
            'What are the visceral feelings, operator panic triggers, and intuitive anxieties?',
          keyObservations: [
            'On-call SREs experience acute dread as automated alerts flood the incident channel every 3 seconds.',
            'Executive leadership feels existential urgency over multi-million dollar per minute merchant losses.',
            'Operators have a strong visceral urge to reboot the primary DB node despite knowing it risks data corruption.',
          ],
        },
        black_hat: {
          hat: 'black_hat',
          promptQuestion:
            'What are the critical risks, catastrophic failure modes, and worst-case outcomes?',
          keyObservations: [
            'Cold cache restarts will hit the primary DB with an unmitigated cache stampede, causing complete crash.',
            'Hard transaction shedding without idempotent tokens will result in duplicate billing and chargebacks.',
            'Database replication lag may desynchronize read-replicas, serving stale balances to fraudulent actors.',
          ],
          failureModeWarning:
            'Blindly autoscaling worker pods during a database bottleneck increases lock contention and accelerates total blackout.',
        },
        yellow_hat: {
          hat: 'yellow_hat',
          promptQuestion:
            'What are the highest-value recovery opportunities, systemic upsides, and silver linings?',
          keyObservations: [
            '92% of payload requests are idempotent balance checks that can be answered from a stale, read-only cache.',
            'Enabling adaptive jittered backoff at edge ingress immediately breaks the synchronized retry pulse.',
            'Resolving this incident creates an ironclad organizational mandate for circuit-breaker mesh adoption.',
          ],
          generativeInsight:
            'Serving stale authorizations for low-value transactions (< $50) preserves 88% of volume while reducing DB queries by 85%.',
        },
        green_hat: {
          hat: 'green_hat',
          promptQuestion:
            'What are the lateral, provocative, or non-linear architectural interventions?',
          keyObservations: [
            'Inverted circuit breaker: instead of cutting traffic, dynamically respond with valid zero-value mock tokens.',
            'Decoupled transaction escrow: capture payment commitments to an append-only WAL on SSD and reconcile asynchronously.',
            'Adversarial traffic dampening: deliberately introduce artificial 50ms random jitter into the ingress mesh.',
          ],
          generativeInsight:
            'Shift from real-time synchronous ACID verification to speculative optimistic settlement with post-hoc reconciliation.',
        },
        blue_hat: {
          hat: 'blue_hat',
          promptQuestion:
            'What is the metacognitive synthesis, process governance, and root-cause orchestration?',
          keyObservations: [
            'The incident is not a database failure but a systemic failure of coupled feedback and failure-detection loops.',
            'Decouple liveness probes (is the process alive?) from readiness probes (can the process accept new work?).',
            'Institute automated game-day chaos experiments simulating upstream 300ms cache latency injections.',
          ],
        },
      },
      reductiveTraps: [
        {
          id: 'trap_additivity_autoscaling',
          type: 'additivity_bias',
          superficialModel:
            'More traffic demands more worker pods; scaling pods from 50 to 500 will increase throughput 10x.',
          nuancedReality:
            'When the underlying database is lock-bound, adding worker pods creates quadratic connection contention, dropping net throughput to zero.',
          failureConsequence:
            'Cluster runs out of memory, worker nodes crash, and database kernel terminates from OOM.',
          remedialCrissCrossStep:
            'Re-examine the system through the Black Hat lens: analyze shared mutex contention and connection pool exhaustion curves.',
        },
        {
          id: 'trap_discrete_probe_health',
          type: 'discrete_categorical_bias',
          superficialModel:
            'A microservice is either healthy (accept 100% traffic) or dead (restart container immediately).',
          nuancedReality:
            'Services exist on a continuous spectrum of degradation; killing a slow worker destroys in-flight work and causes thundering herd on startup.',
          failureConsequence:
            'Liveness probes become a positive feedback loop of destruction, restarting pods faster than they can initialize.',
          remedialCrissCrossStep:
            'Re-examine through the Mechanistic lens: separate container liveness from traffic readiness, and institute graceful load-shedding.',
        },
        {
          id: 'trap_static_retry_timeout',
          type: 'static_deterministic_bias',
          superficialModel:
            'A fixed 500ms timeout with 3 retries is sufficient for transient network hiccups.',
          nuancedReality:
            'Fixed retry intervals synchronize client spikes into resonant destructive waves; retries must contain full decorrelated jitter.',
          failureConsequence:
            'Periodic resonant spikes crush the backend at exact 500ms intervals indefinitely.',
          remedialCrissCrossStep:
            'Re-examine through the Green Hat lens: implement decorrelated randomized exponential backoff (Polly / Envoy jitter algorithm).',
        },
      ],
      multiPerspectiveLenses: {
        mechanistic_technical:
          'Thread-pool saturation, TCP connection reuse, database row-level lock escalation, and Redis pipeline timeout semantics.',
        socio_economic:
          'Merchant contract SLAs, per-minute interchange revenue loss, brand reputation, and on-call engineering team burnout.',
        ecological_systemic:
          'Emergent resonance between decoupled microservice topologies, distributed feedback loops, and failure domain containment.',
        teleological_ethical:
          'Balancing merchant transactional fairness with platform financial viability; transparent incident disclosure vs market anxiety.',
      },
    },
    comparisonCases: [
      {
        id: 'case_power_grid_blackout',
        title: 'Northeast Power Grid Cascade Transmission Failure',
        domain: 'Electrical Power Distribution & Smart Grids',
        contextSummary:
          'A single high-voltage transmission line sagged into overgrown trees and tripped. Rather than shedding local industrial load, automated supervisory control systems shifted power to adjacent lines, which tripped sequentially from thermal overload, plunging 50 million people into a blackout in 8 minutes.',
        coreDilemma:
          'Sacrifice power to a local municipality to protect grid frequency, or maintain universal supply and risk continental collapse?',
        thematicNodes: [
          {
            id: 'node_amplification',
            theme: 'Retry Storm Amplification',
            description:
              'Redistributed current overloads adjacent transmission lines progressively.',
            crossCuttingCategory: 'Nonlinear Dynamics',
          },
          {
            id: 'node_liveness_inversion',
            theme: 'Liveness Probe Inversion',
            description:
              'Protective relays disconnecting lines to prevent local damage doomed the macro grid.',
            crossCuttingCategory: 'Control Loop Failure',
          },
        ],
        hatAnalyses: {
          white_hat: {
            hat: 'white_hat',
            promptQuestion: 'What telemetry was recorded prior to the 2003 blackout?',
            keyObservations: [
              'Transmission lines heated to 120C',
              'Telemetry alarm buffer stalled with 3,000 unprocessed events',
            ],
          },
          red_hat: {
            hat: 'red_hat',
            promptQuestion: 'What was the visceral operator stance?',
            keyObservations: [
              'Fear of unjustified regional disconnections froze manual intervention for 45 minutes',
            ],
          },
          black_hat: {
            hat: 'black_hat',
            promptQuestion: 'What was the cascading failure outcome?',
            keyObservations: ['261 power plants tripped off-line in unrecoverable cascade'],
          },
          yellow_hat: {
            hat: 'yellow_hat',
            promptQuestion: 'What systemic interventions could have stabilized the frequency?',
            keyObservations: [
              'Controlled islanding of the grid would have isolated the disturbance to 1.5 million customers',
            ],
          },
          green_hat: {
            hat: 'green_hat',
            promptQuestion: 'What lateral architecture could avert future cascades?',
            keyObservations: [
              'Self-healing decentralized micro-grids with local battery storage buffers',
            ],
          },
          blue_hat: {
            hat: 'blue_hat',
            promptQuestion: 'What regulatory and governance reforms were mandated?',
            keyObservations: [
              'Mandatory vegetation management and automated real-time phase-angle monitoring (PMUs)',
            ],
          },
        },
        reductiveTraps: [
          {
            id: 'trap_local_protection_global_harm',
            type: 'single_scale_bias',
            superficialModel:
              'If every breaker trips to save its local line, the network remains safe.',
            nuancedReality:
              'Local optimization without global situational awareness creates catastrophic macro instability.',
            failureConsequence: 'Continental blackout.',
            remedialCrissCrossStep:
              'Criss-cross with cloud microservice connection pool cascading outages.',
          },
        ],
        multiPerspectiveLenses: {
          mechanistic_technical:
            'Phase angles, thermal sag, reactive power impedance, and relay trip timers.',
          socio_economic:
            'Industrial manufacturing downtime, hospital backup generators, municipal liability.',
          ecological_systemic:
            'Interconnected energy grid fragility, seasonal summer air-conditioning peak demands.',
          teleological_ethical:
            'Public safety prioritization, healthcare access preservation during systemic collapse.',
        },
      },
    ],
  },

  epidemiological_antimicrobial: {
    id: 'epidemiological_antimicrobial',
    name: 'Antimicrobial Resistance & Hospital Infection Containment',
    domainFamily: 'Epidemiology, Systems Biology & Healthcare Policy',
    description:
      'Criss-cross the complex landscape of Carbapenem-Resistant Enterobacteriaceae (CRE) hospital outbreaks across molecular, clinical, economic, and policy lenses.',
    universalThemes: [
      'Evolutionary selection under antibiotic pressure',
      'Microbiome ecological competition vs single-pathogen targeting',
      'Incentive divergence between individual therapy and community resistance',
      'Decoupled timescales: immediate clinical relief vs generational resistance',
    ],
    primaryCase: {
      id: 'case_cre_icu_outbreak',
      title: 'Intensive Care Unit Carbapenem-Resistant Klebsiella Outbreak',
      domain: 'Hospital Epidemiology & Microbial Genomics',
      contextSummary:
        'In a 24-bed surgical ICU, four post-operative patients developed severe sepsis resistant to all beta-lactams and carbapenems. Genetic sequencing revealed plasmid-mediated blaKPC carbapenemase. Clinicians face agonizing dilemmas: administering toxic last-resort Colistin risks acute kidney necrosis in vulnerable patients, while withholding aggressive broad-spectrum therapy risks lethal septic shock.',
      coreDilemma:
        'Should clinicians preemptively isolate and empirically dose all exposed ICU patients with nephrotoxic reserve antibiotics, or rely on targeted culture diagnostics that take 48 hours to confirm susceptibility?',
      thematicNodes: [
        {
          id: 'node_selection_pressure',
          theme: 'Antimicrobial Selection Pressure',
          description:
            'Broad-spectrum antibiotic wiping of commensal gut flora creates open niches for resistant plasmids.',
          crossCuttingCategory: 'Evolutionary Dynamics',
        },
        {
          id: 'node_asymptomatic_colonization',
          theme: 'Asymptomatic Gastrointestinal Reservoir',
          description:
            'Patients carry resistant genes in gut microbiomes without symptoms, acting as silent vectors.',
          crossCuttingCategory: 'Epidemiological Reservoirs',
        },
        {
          id: 'node_diagnostic_delay_window',
          theme: 'Empirical vs Targeted Diagnostic Gap',
          description:
            'The 48-hour phenotypic testing gap forces defensive over-prescription of broad-spectrum drugs.',
          crossCuttingCategory: 'Epistemic Uncertainty',
        },
      ],
      hatAnalyses: {
        white_hat: {
          hat: 'white_hat',
          promptQuestion:
            'What are the empirical cultures, minimum inhibitory concentrations (MICs), and sequence data?',
          keyObservations: [
            'blaKPC gene identified on an IncFII transmissible plasmid in 4 patients.',
            'Meropenem MIC > 32 ug/mL (classified extreme high-level resistance).',
            'Colistin susceptibility confirmed (MIC = 0.5 ug/mL), but serum creatinine in 2 patients elevated to 2.8 mg/dL.',
            'ICU nurse-to-patient staffing ratio is 1:3 due to seasonal nurse shortages.',
          ],
        },
        red_hat: {
          hat: 'red_hat',
          promptQuestion: 'What are the emotional pressures facing the treating intensivist?',
          keyObservations: [
            'Terror of losing a young post-trauma patient to uncontrolled bacteremia within hours.',
            'Guilt over causing permanent dialysis dependence through aggressive Colistin dosing.',
            'Frustration with hospital administration perceived as slow to authorize dedicated barrier isolation cohorts.',
          ],
        },
        black_hat: {
          hat: 'black_hat',
          promptQuestion:
            'What are the catastrophic failure modes for the hospital and broader public?',
          keyObservations: [
            'Endemic establishment of KPC in hospital wastewater plumbing biofilms, rendering eradication impossible.',
            'Trans-species horizontal plasmid transfer into Community-Acquired MRSA or E. coli strains.',
            'Mortality in bacteremic patients exceeds 45% if effective therapy is delayed by > 24 hours.',
          ],
          failureModeWarning:
            'Over-reliance on surface sanitizers without environmental drain remediation fails because plasmids persist in biofilm matrices.',
        },
        yellow_hat: {
          hat: 'yellow_hat',
          promptQuestion: 'What are the best-case clinical outcomes and systemic opportunities?',
          keyObservations: [
            'Rapid molecular PCR diagnostics can detect blaKPC within 90 minutes, halting unnecessary broad-spectrum empirical therapy.',
            'Bacteriophage therapy or novel beta-lactamase inhibitors (Ceftazidime-Avibactam) offer non-nephrotoxic alternatives.',
            'Rigorous barrier cohorting reliably halts outbreak spread in > 90% of documented clinical cohorts.',
          ],
          generativeInsight:
            'Pairing rapid gene-target PCR with immediate antibiotic de-escalation protocols cuts ICU reserve drug usage by 64%.',
        },
        green_hat: {
          hat: 'green_hat',
          promptQuestion:
            'What are the radical, lateral approaches beyond traditional antibiotic weaponry?',
          keyObservations: [
            'Ecological niche saturation: fecal microbiota transplantation (FMT) or oral probiotic consortia to out-compete KPC.',
            'CRISPR-Cas9 plasmid-curing phages that selectively cleave the resistance plasmid inside colonized bacteria.',
            'Copper-alloy contact surfaces and germicidal UV-C automated ceiling arrays to destroy ambient bacterial sheddings.',
          ],
          generativeInsight:
            'Shift from attempting to sterilize the host gut to ecologically engineering microbial competition that suppresses plasmid fitness.',
        },
        blue_hat: {
          hat: 'blue_hat',
          promptQuestion:
            'What is the institutional stewardship strategy and multidisciplinary governance?',
          keyObservations: [
            'Form an Antibiotic Stewardship Team (AST) with veto power over restricted antibiotic dispensing.',
            'Tie physician compensation and clinical department rankings to adherence to rapid de-escalation guidelines.',
            'Implement regional public health notification to track colonized patients across nursing homes and outpatient clinics.',
          ],
        },
      },
      reductiveTraps: [
        {
          id: 'trap_single_pathogen_target',
          type: 'single_scale_bias',
          superficialModel:
            'Kill the Klebsiella bacteria at all costs by dosing maximum tolerable broad-spectrum antibiotics.',
          nuancedReality:
            'Massive broad-spectrum dosing eradicates protective commensal flora, eliminating colonization resistance and selecting for hyper-resistant clones.',
          failureConsequence:
            'Patient develops secondary Clostridioides difficile colitis and pan-drug resistant fungal superinfections.',
          remedialCrissCrossStep:
            'Re-examine through the Ecological Systemic lens: model microbiome diversity as a protective systemic barrier.',
        },
        {
          id: 'trap_binary_infection_colonization',
          type: 'discrete_categorical_bias',
          superficialModel:
            'Patients are either infected (treat aggressively with antibiotics) or uninfected (safe, ignore).',
          nuancedReality:
            'Patients frequently have asymptomatic colonization in the gastrointestinal tract, acting as silent transmission vectors.',
          failureConsequence:
            'Unscreened colonized patients continue to cross-contaminate hospital wards via nurse hands and medical equipment.',
          remedialCrissCrossStep:
            'Re-examine through the White Hat lens: institute universal rectal swab screening upon ICU admission regardless of symptoms.',
        },
      ],
      multiPerspectiveLenses: {
        mechanistic_technical:
          'Carbapenemase enzymatic hydrolysis, outer membrane porin downregulation, efflux pump kinetics, and plasmid conjugation.',
        socio_economic:
          'Hospital length of stay, isolation room staffing costs, pharmaceuticals pricing, and Medicare readmission penalties.',
        ecological_systemic:
          'Microbiome colonization resistance, environmental plumbing biofilm reservoirs, and regional patient sharing networks.',
        teleological_ethical:
          'Tension between safeguarding the individual patient (aggressive reserve drugs) vs safeguarding the public health commons.',
      },
    },
    comparisonCases: [],
  },
}

// ============================================================================
// 2. Cognitive Dispersion & Rigidity Metrics
// ============================================================================

/**
 * Calculates the Perspective Dispersion Index (PDI) via normalized Shannon entropy:
 * H(P) = - \sum_{i=1}^K p_i \log_2(p_i)
 * PDI = H(P) / \log_2(K)
 *
 * Measures whether the learner explores all 6 hats and multiple lenses evenly,
 * or stays fixated in a single narrow cognitive rut (e.g. only White Hat data).
 *
 * @param hatFrequencies Map of ThinkingHatType -> count of interactions
 * @returns Normalized entropy score in [0.0, 1.0]
 */
export function calculatePerspectiveDispersionIndex(
  hatFrequencies: Record<ThinkingHatType, number>,
): number {
  const counts = Object.values(hatFrequencies)
  const total = counts.reduce((acc, c) => acc + c, 0)
  if (total === 0) return 0.0

  const K = 6 // 6 Thinking Hats
  const maxEntropy = Math.log2(K)

  let entropy = 0.0
  for (const count of counts) {
    if (count > 0) {
      const p = count / total
      entropy -= p * Math.log2(p)
    }
  }

  const normalized = entropy / maxEntropy
  return Math.min(1.0, Math.max(0.0, Math.round(normalized * 100) / 100))
}

/**
 * Calculates the Landscape Criss-Cross Coverage Density:
 * Proportion of thematic nodes identified and linked across multiple case perspectives.
 */
export function calculateCrissCrossDensity(
  identifiedNodeIds: readonly string[],
  totalAvailableNodes: readonly CaseThematicNode[],
): number {
  if (totalAvailableNodes.length === 0) return 0.0
  const uniqueIdentified = new Set(identifiedNodeIds).size
  const ratio = uniqueIdentified / totalAvailableNodes.length
  return Math.min(1.0, Math.max(0.0, Math.round(ratio * 100) / 100))
}

/**
 * Evaluates a student's cognitive flexibility across a session attempt.
 */
export function evaluateCognitiveFlexibility(
  suite: CognitiveFlexibilitySuite,
  attempts: readonly CrissCrossStepAttempt[],
): CognitiveFlexibilityEvaluation {
  const hatCounts: Record<ThinkingHatType, number> = {
    white_hat: 0,
    red_hat: 0,
    black_hat: 0,
    yellow_hat: 0,
    green_hat: 0,
    blue_hat: 0,
  }

  const usedLenses = new Set<PerspectiveLens>()
  const collectedNodeIds: string[] = []
  const diagnosedTrapIds = new Set<string>()

  for (const step of attempts) {
    hatCounts[step.selectedHat] = (hatCounts[step.selectedHat] || 0) + 1
    usedLenses.add(step.activeLens)
    for (const nid of step.identifiedThematicNodeIds) {
      collectedNodeIds.push(nid)
    }
    for (const tid of step.diagnosedReductiveTrapIds) {
      diagnosedTrapIds.add(tid)
    }
  }

  const pdi = calculatePerspectiveDispersionIndex(hatCounts)
  const hatCoverage = Object.values(hatCounts).filter((c) => c > 0).length
  const lensCoverage = usedLenses.size

  const crissCrossDensity = calculateCrissCrossDensity(
    collectedNodeIds,
    suite.primaryCase.thematicNodes,
  )

  const totalTraps = suite.primaryCase.reductiveTraps.length
  const reductiveBiasMastery =
    totalTraps > 0 ? Math.round((diagnosedTrapIds.size / totalTraps) * 100) : 100

  // Composite flexibility score:
  // 35% PDI (entropy), 25% Criss-Cross Density, 25% Reductive Bias Mastery, 15% Lens Diversity
  const composite = Math.round(
    pdi * 35 + crissCrossDensity * 25 + (reductiveBiasMastery / 100) * 25 + (lensCoverage / 4) * 15,
  )

  const cognitiveRigidityWarning = pdi < 0.45 || hatCoverage < 3

  let feedback = ''
  if (cognitiveRigidityWarning) {
    feedback =
      'Cognitive Rigidity Detected: You are analyzing this ill-structured problem primarily through a single mode. In complex non-linear domains, relying solely on empirical facts or risk aversion blinds you to emergent dynamics and lateral alternatives. Activate opposing hats (Yellow/Green or Black/Red) to break out of this cognitive rut.'
  } else if (reductiveBiasMastery < 60) {
    feedback =
      'Moderate Flexibility: Good perspective coverage, but you remain susceptible to oversimplification traps (e.g. Additivity Bias or Categorical Bias). Deliberately look for non-linear feedback loops where scaling resources exacerbates bottlenecks.'
  } else {
    feedback =
      'Exceptional Cognitive Flexibility: You traverse the problem landscape nonlinearly across analytical, generative, adversarial, and systemic lenses with robust resistance to reductive traps.'
  }

  return {
    perspectiveDispersionIndex: pdi,
    hatCoverageCount: hatCoverage,
    lensCoverageCount: lensCoverage,
    crissCrossDensity,
    reductiveBiasMastery,
    cognitiveFlexibilityScore: Math.min(100, Math.max(0, composite)),
    cognitiveRigidityWarning,
    feedbackSummary: feedback,
  }
}

// ============================================================================
// 3. FSRS-6 Generalization Deck Exporter
// ============================================================================

/**
 * Synthesizes cross-cutting FSRS review flashcards from the explored case studies.
 * Scales memory stability S_0 with the perspective dispersion index to model
 * resistance against contextual retrieval fixation.
 */
export function exportFlexibilityToFSRSCards(
  suite: CognitiveFlexibilitySuite,
  evaluation: CognitiveFlexibilityEvaluation,
): FSRSFlexibilityCard[] {
  const cards: FSRSFlexibilityCard[] = []
  const stabilityMultiplier = 1.0 + 0.35 * evaluation.perspectiveDispersionIndex

  const primary = suite.primaryCase
  const hats: ThinkingHatType[] = ['white_hat', 'black_hat', 'yellow_hat', 'green_hat']
  const lenses: PerspectiveLens[] = [
    'mechanistic_technical',
    'socio_economic',
    'ecological_systemic',
    'teleological_ethical',
  ]

  for (let i = 0; i < hats.length; i++) {
    const hat = hats[i]
    const lens = lenses[i % lenses.length]
    const analysis = primary.hatAnalyses[hat]
    const trap = primary.reductiveTraps[i % primary.reductiveTraps.length]

    cards.push({
      id: `cft_${primary.id}_${hat}_${lens}`,
      caseTitle: primary.title,
      domain: primary.domain,
      hat,
      lens,
      promptFront:
        `**[${primary.title} — ${primary.domain}]**\n\n` +
        `**Context Dilemma:** ${primary.coreDilemma}\n\n` +
        `**Perspective Shifting Challenge:** Shift into the **${hat.replace('_', ' ').toUpperCase()}** and evaluate this scenario through the **${lens.replace('_', ' ').toUpperCase()}** lens.\n\n` +
        `*Core Question:* ${analysis.promptQuestion}`,
      solutionBack:
        `**Key Multi-Perspective Insights:**\n\n` +
        analysis.keyObservations.map((obs) => `• ${obs}`).join('\n') +
        `\n\n**Systemic Lens Interpretation (${lens}):**\n${primary.multiPerspectiveLenses[lens]}` +
        (analysis.generativeInsight
          ? `\n\n**Generative Breakthrough:** ${analysis.generativeInsight}`
          : '') +
        (analysis.failureModeWarning
          ? `\n\n**Critical Failure Mode:** ${analysis.failureModeWarning}`
          : ''),
      reductiveTrapWarning: `Watch out for ${trap.type.replace(/_/g, ' ')}: "${trap.superficialModel}" → ${trap.nuancedReality}`,
      fsrsStabilityMultiplier: Math.round(stabilityMultiplier * 100) / 100,
    })
  }

  return cards
}

// ============================================================================
// 4. Interactive Cognitive Flexibility Session State Machine
// ============================================================================

export class CognitiveFlexibilitySession {
  private activeSuite: CognitiveFlexibilitySuite
  private currentStepAttempts: CrissCrossStepAttempt[] = []
  private activeHat: ThinkingHatType = 'white_hat'
  private activeLens: PerspectiveLens = 'mechanistic_technical'

  constructor(initialSuiteKey: string = 'distributed_chaos_cascade') {
    this.activeSuite =
      CALIBRATED_FLEXIBILITY_SUITES[initialSuiteKey] ||
      CALIBRATED_FLEXIBILITY_SUITES.distributed_chaos_cascade
  }

  public getSuite(): CognitiveFlexibilitySuite {
    return this.activeSuite
  }

  public setSuite(suiteKey: string): void {
    if (CALIBRATED_FLEXIBILITY_SUITES[suiteKey]) {
      this.activeSuite = CALIBRATED_FLEXIBILITY_SUITES[suiteKey]
      this.currentStepAttempts = []
      this.activeHat = 'white_hat'
      this.activeLens = 'mechanistic_technical'
    }
  }

  public getActiveHat(): ThinkingHatType {
    return this.activeHat
  }

  public setActiveHat(hat: ThinkingHatType): void {
    this.activeHat = hat
  }

  public getActiveLens(): PerspectiveLens {
    return this.activeLens
  }

  public setActiveLens(lens: PerspectiveLens): void {
    this.activeLens = lens
  }

  public recordStepAttempt(attempt: Omit<CrissCrossStepAttempt, 'caseId'>): void {
    this.currentStepAttempts.push({
      caseId: this.activeSuite.primaryCase.id,
      ...attempt,
    })
  }

  public getStepAttempts(): readonly CrissCrossStepAttempt[] {
    return this.currentStepAttempts
  }

  public evaluateCurrentProgress(): CognitiveFlexibilityEvaluation {
    return evaluateCognitiveFlexibility(this.activeSuite, this.currentStepAttempts)
  }

  public exportFSRSCards(): FSRSFlexibilityCard[] {
    const evaluation = this.evaluateCurrentProgress()
    return exportFlexibilityToFSRSCards(this.activeSuite, evaluation)
  }

  public resetSession(): void {
    this.currentStepAttempts = []
    this.activeHat = 'white_hat'
    this.activeLens = 'mechanistic_technical'
  }
}

// ── Route-level input schemas (TD-02) ──────────────────────────────────────

export const crissCrossStepAttemptSchema = z.object({
  caseId: z.string(),
  selectedHat: z.enum(['white_hat', 'red_hat', 'black_hat', 'yellow_hat', 'green_hat', 'blue_hat']),
  activeLens: z.enum([
    'mechanistic_technical',
    'socio_economic',
    'ecological_systemic',
    'teleological_ethical',
  ]),
  studentObservations: z.string(),
  identifiedThematicNodeIds: z.array(z.string()),
  diagnosedReductiveTrapIds: z.array(z.string()),
})
export type CrissCrossStepAttemptInput = z.infer<typeof crissCrossStepAttemptSchema>

export const flexibilityEvaluateInputSchema = z.object({
  suiteKey: z.string().optional(),
  attempts: z.array(crissCrossStepAttemptSchema).max(100).optional(),
  exportCards: z.boolean().default(false),
})
export type FlexibilityEvaluateInput = z.infer<typeof flexibilityEvaluateInputSchema>
