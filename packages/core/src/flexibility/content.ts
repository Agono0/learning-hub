/**
 * Cognitive Flexibility — Scenario Content (TD-05)
 *
 * This file holds ONLY the calibrated ill-structured domain suites: Spiro-style
 * criss-crossing case landscapes (distributed cloud brownout cascade,
 * antimicrobial-resistance ICU outbreak) with thematic nodes, six-hat analyses,
 * reductive-bias traps and multi-perspective lenses.
 *
 * Why it lives here: scenario data is CONTENT, not logic. Splitting it out of
 * `cognitive-flexibility-engine.ts` keeps the entropy/density metrics, the
 * FSRS card exporter and the session state machine reviewable without hundreds
 * of lines of data noise in every diff (TD-05 from docs/tech-debt.md). Values
 * were moved verbatim (same names, same values); the engine re-exports
 * `CALIBRATED_FLEXIBILITY_SUITES` so every existing import path
 * (`@learning-hub/core/flexibility` barrel -> engine) keeps working. The
 * route contract schemas (`crissCrossStepAttemptSchema`,
 * `flexibilityEvaluateInputSchema`) stay in the engine.
 *
 * Data only: no function bodies, no zod schemas, type-only imports.
 */

import type { CognitiveFlexibilitySuite } from './cognitive-flexibility-engine'

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
