/**
 * Scenario corpora for the dual-process diagnostic & cognitive forcing engine (TD-05).
 *
 * CONTENT, not logic: the canonical Croskerry cognitive bias catalog with its
 * cognitive forcing function antidotes and the calibrated diagnostic scenario
 * library (emergency medicine, distributed systems, macro finance, GPU
 * architecture). Kept out of `cognitive-forcing-engine.ts` so engine diffs stay
 * about algorithms, not data. Types are imported type-only from the engine
 * (type-only cycles are safe); the engine re-exports these constants so every
 * existing import path keeps working.
 *
 * @module @learning-hub/core/dualprocess
 */
import type {
  BiasCatalogEntry,
  CognitiveBiasType,
  DiagnosticScenario,
} from './cognitive-forcing-engine'
// -----------------------------------------------------------------------------
// Bias Taxonomy Catalog & Cognitive Forcing Function Rules
// -----------------------------------------------------------------------------

export const CANONICAL_COGNITIVE_BIAS_CATALOG: Record<CognitiveBiasType, BiasCatalogEntry> = {
  premature_closure: {
    type: 'premature_closure',
    label: 'Premature Closure',
    definition:
      'The tendency to stop considering other diagnostic possibilities once an initial plausible diagnosis is made.',
    classicManifestation:
      'Admitting a dyspneic patient as asthma exacerbation without ruling out tension pneumothorax or pulmonary embolism.',
    croskerryAntidote:
      'Enforce the "Rule of Three": never conclude until at least three distinct candidate mechanisms are explicitly contrasted.',
    primaryCFF: 'differential_divergence',
  },
  anchoring_adjustment: {
    type: 'anchoring_adjustment',
    label: 'Anchoring & Insufficient Adjustment',
    definition:
      'Fixating on initial salient information (such as handoff diagnosis or first symptom) and failing to adjust beliefs as new conflicting data arrives.',
    classicManifestation:
      'Assuming a high server latency alert is just a Redis cache miss because the triage ticket said "cache latency".',
    croskerryAntidote:
      'Blank-slate re-evaluation: deliberate cognitive wipe of triage labels, assessing all telemetry from first principles.',
    primaryCFF: 'universal_pause',
  },
  search_satisficing: {
    type: 'search_satisficing',
    label: 'Search Satisficing',
    definition:
      'Terminating investigative search as soon as a single finding is identified, overlooking co-occurring or causative secondary pathologies.',
    classicManifestation:
      'Finding a wrist fracture on X-ray and failing to examine the scaphoid or elbow.',
    croskerryAntidote:
      'Search circuit-breaker: actively prompt "What second lesion or concurrency condition could be masked by this first find?"',
    primaryCFF: 'disconfirmation_crucible',
  },
  confirmation_bias: {
    type: 'confirmation_bias',
    label: 'Confirmation Bias',
    definition:
      'Selectively gathering and interpreting data to support a favored hypothesis while ignoring or downplaying contradictory anomalies.',
    classicManifestation:
      'Interpreting elevated cardiac troponin as myocardial infarction while ignoring asymmetrical blood pressures that signal aortic dissection.',
    croskerryAntidote:
      'Popperian falsification: search specifically for the observation that would destroy your hypothesis if observed.',
    primaryCFF: 'devils_advocate_inversion',
  },
  availability_heuristic: {
    type: 'availability_heuristic',
    label: 'Availability Bias',
    definition:
      'Judging the probability of an outcome based on how readily recent, vivid, or memorable examples come to mind rather than objective prevalence.',
    classicManifestation:
      'Diagnosing rare encephalitis because of a high-profile case seen yesterday, missing common bacterial sepsis.',
    croskerryAntidote:
      'Base-rate anchoring: demand statistical population incidence before elevating rare vivid diagnoses.',
    primaryCFF: 'base_rate_recalibration',
  },
  base_rate_neglect: {
    type: 'base_rate_neglect',
    label: 'Base-Rate Neglect',
    definition:
      'Ignoring prior base rates and evaluating probabilities purely on perceived representativeness of salient features.',
    classicManifestation:
      'Treating a positive screening test in a low-prevalence cohort as a near-certain true positive, ignoring false-positive rates.',
    croskerryAntidote:
      'Bayes table visualization: map prior frequency multiplied by likelihood ratio before calculating posterior belief.',
    primaryCFF: 'base_rate_recalibration',
  },
  framing_effect: {
    type: 'framing_effect',
    label: 'Framing Effect',
    definition:
      'Drawing diametrically opposed decisions from identical objective information depending on whether the data is framed in terms of losses or gains.',
    classicManifestation:
      'Declining a 90% survival procedure when framed as having a "10% mortality rate".',
    croskerryAntidote:
      'Semantic bilateral inversion: always restate the problem in the reciprocal valence before committing.',
    primaryCFF: 'devils_advocate_inversion',
  },
}

// -----------------------------------------------------------------------------
// Calibrated Diagnostic Scenarios (Medicine, Systems, Finance, GPU)
// -----------------------------------------------------------------------------

export const CALIBRATED_DIAGNOSTIC_SCENARIOS: DiagnosticScenario[] = [
  {
    id: 'emergency_medicine_chest_pain',
    domain: 'emergency_medicine',
    title: 'Hyperacute Retrosternal Tearing Pain: The ACS Anchor vs Aortic Crucible',
    leadPresenterNarrative:
      'A 58-year-old male presents to the resuscitation bay at 02:00 AM with sudden-onset, severe, crushing retrosternal chest pain radiating to the back. Diaphoretic, pale, and anxious. The handoff nurse notes: "58 yo with acute MI, troponin is slightly elevated, ST elevations noted in anterior leads; ready for dual antiplatelet and heparin."',
    initialSalientData: [
      'Substernal crushing pain onset 45 minutes ago',
      'ECG shows 1.5mm ST-segment elevation in leads V2-V4',
      'High-sensitivity cardiac troponin I is mildly elevated at 48 ng/L (cutoff 14 ng/L)',
      'Patient appears diaphoretic, clammy, and holds chest',
    ],
    vividHeuristicTrapDescription:
      'System 1 immediately anchors on Acute Myocardial Infarction (STEMI) due to ST elevations and troponin. Initiating immediate intravenous heparin and ticagrelor is lethal if the underlying pathology is Acute Type A Aortic Dissection.',
    defaultSystem1DiagnosisId: 'stemi_acs',
    subtleAnomalies: [
      'Pain character was described as sudden peak at onset ("tearing through to scapula"), unlike crescendo ischemic pain',
      'Blood pressure in Right Arm is 168/96 mmHg; Left Arm is 112/68 mmHg (>50 mmHg differential)',
      'New diastolic murmur audible at right sternal border (acute aortic regurgitation)',
      'Transient left-sided leg paresthesia noted on focused neuro exam (iliofemoral extension)',
    ],
    hypotheses: [
      {
        id: 'stemi_acs',
        name: 'Acute ST-Elevation Myocardial Infarction (STEMI)',
        systemicMechanism:
          'Plaque rupture with occlusive coronary thrombus in Left Anterior Descending (LAD) artery.',
        priorProbability: 0.85,
        confirmatoryFeatures: [
          'ST elevation in V2-V4',
          'Elevated troponin',
          'Severe retrosternal chest pain',
        ],
        contradictoryAnomalies: [
          'Inter-arm systolic blood pressure difference > 20 mmHg',
          'Sudden maximal tearing onset',
          'Aortic regurgitation murmur',
        ],
        lethalityOrRiskTier: 'critical',
        isTargetOptimalSolution: false,
      },
      {
        id: 'type_a_aortic_dissection',
        name: 'Stanford Type A Acute Aortic Dissection (Retrograde Coronary Malperfusion)',
        systemicMechanism:
          'Intimal flap tear in ascending aorta propagating proximally to occlude the right/left coronary ostia and aortic valve.',
        priorProbability: 0.05,
        confirmatoryFeatures: [
          'Maximal intensity at instantaneous onset',
          'Asymmetric pulses and inter-arm BP gradient > 50 mmHg',
          'New diastolic murmur',
          'Secondary ST elevations from ostial dissection',
        ],
        contradictoryAnomalies: [],
        lethalityOrRiskTier: 'catastrophic',
        isTargetOptimalSolution: true,
      },
      {
        id: 'pulmonary_embolism_massive',
        name: 'Massive Saddle Pulmonary Embolism with Right Heart Strain',
        systemicMechanism:
          'Thromboembolism occluding main pulmonary trunk causing acute cor pulmonale and anterior lead T-wave inversions/ST elevation.',
        priorProbability: 0.1,
        confirmatoryFeatures: ['Acute severe chest discomfort', 'Diaphoresis and dyspnea'],
        contradictoryAnomalies: [
          'Inter-arm BP differential absent',
          'Tearing pain to back less typical than pleuritic',
        ],
        lethalityOrRiskTier: 'catastrophic',
        isTargetOptimalSolution: false,
      },
    ],
    cognitiveForcingSteps: [
      {
        id: 'cff_pause_chest',
        type: 'universal_pause',
        title: 'Universal Metacognitive Timeout',
        instruction:
          'Pause all heparin/thrombolytic orders for 5 seconds. Ask: "If this diagnosis is wrong, what catastrophic condition will my treatment accelerate?"',
        forcingQuestion:
          'What lethal pathology will full anticoagulation turn into immediate fatal pericardial tamponade or exsanguination?',
        targetBiasMitigated: 'anchoring_adjustment',
        minimumExecutionSeconds: 4,
      },
      {
        id: 'cff_diff_chest',
        type: 'differential_divergence',
        title: 'Differential Divergence Protocol',
        instruction:
          'Formulate at least 3 distinct mechanisms for anterior ST elevation and retrosternal pain before touching the heparin syringe.',
        forcingQuestion:
          'Can an ascending aortic tear produce anterior ST elevations by dissecting into coronary ostia?',
        targetBiasMitigated: 'premature_closure',
        minimumExecutionSeconds: 5,
      },
      {
        id: 'cff_disconfirm_chest',
        type: 'disconfirmation_crucible',
        title: 'Disconfirmation Crucible: Asymmetry & Murmur Audit',
        instruction:
          'Actively search for contradictory anomalies: check four-limb blood pressures and auscultate for acute aortic insufficiency.',
        forcingQuestion:
          'Does the 56 mmHg inter-arm blood pressure discrepancy falsify uncomplicated isolated plaque rupture?',
        targetBiasMitigated: 'confirmation_bias',
        minimumExecutionSeconds: 5,
      },
      {
        id: 'cff_devil_chest',
        type: 'devils_advocate_inversion',
        title: "Devil's Advocate Inversion",
        instruction:
          'Assume the patient has an aortic dissection until proven otherwise by bedside transthoracic/transesophageal echo or contrast CT aortogram.',
        forcingQuestion:
          'Why does the sudden tearing onset radiating to the back trump the mere presence of ST elevation?',
        targetBiasMitigated: 'search_satisficing',
        minimumExecutionSeconds: 4,
      },
    ],
    authoritativeResolution:
      'The patient has Stanford Type A Aortic Dissection extending retrogradely into the left coronary artery ostium, producing secondary ischemic ST elevation. Immediate Bedside POCUS reveals an intimal flap in the ascending aortic root and hemopericardium. Anticoagulation is withheld; emergent cardiothoracic surgical consultation is obtained for bentall procedure/aortic repair.',
    epistemicTakeaway:
      'Never anchor on an ECG or triage label when the pain onset is instantaneous and tearing. The Cognitive Forcing Function of checking bilateral upper extremity blood pressures protects against fatal anticoagulation.',
  },
  {
    id: 'distributed_systems_consensus_partition',
    domain: 'distributed_systems',
    title: 'Cluster P99 Latency Spike: The Cache Miss Anchor vs Asymmetric Network Partition',
    leadPresenterNarrative:
      'A tier-1 distributed key-value database reports sudden cluster-wide P99 write latency jumping from 4ms to 12,000ms. Ops triage channel fires alerts: "Redis L2 cache hit-rate dropped from 99.2% to 41.0%! Redis node 3 memory pressure detected. Recommendation: scale Redis cluster and flush cache."',
    initialSalientData: [
      'P99 write latency jumped to 12.4 seconds',
      'Redis cluster cache hit rate plummeted to 41%',
      'Client connection pools reporting timeouts',
      'Recent deployment of high-throughput caching middleware 1 hour ago',
    ],
    vividHeuristicTrapDescription:
      'System 1 rapidly correlates the cache hit-rate collapse and latency spike with Redis exhaustion (availability & anchoring). Ops engineers restart or flush Redis, causing a thundering herd that completely crashes backend Raft consensus leaders.',
    defaultSystem1DiagnosisId: 'redis_cache_exhaustion',
    subtleAnomalies: [
      'Read operations on cached keys maintain < 5ms latency; latency is strictly localized to replicated Raft quorum writes',
      'Raft heartbeats between Leader (Node 1) and Follower (Node 4) exhibit 42% dropped UDP packets while TCP remains open (blackhole packet asymmetry)',
      'Leader lease renegotiations are churning at 30x normal frequency with continuous term incrementations',
      'Disk write IOPS and CPU utilization on Redis nodes are resting at calm baseline (< 12%)',
    ],
    hypotheses: [
      {
        id: 'redis_cache_exhaustion',
        name: 'Redis Cache Fleet Memory Contention & Thundering Herd',
        systemicMechanism:
          'L2 cache node eviction causing cascading cache misses that overwhelm backend storage engine.',
        priorProbability: 0.7,
        confirmatoryFeatures: [
          'Low cache hit-rate',
          'P99 latency spike',
          'Recent middleware release',
        ],
        contradictoryAnomalies: [
          'Redis CPU and IOPS at low baseline',
          'Read latency unaffected',
          'Raft term churning',
        ],
        lethalityOrRiskTier: 'moderate',
        isTargetOptimalSolution: false,
      },
      {
        id: 'asymmetric_raft_partition',
        name: 'Asymmetric Network Partition & Raft Pre-Vote Split-Brain Churn',
        systemicMechanism:
          'One-way packet drop partition causes isolated follower to initiate repeated elections without hearing leader heartbeats, forcing repeated leader step-downs.',
        priorProbability: 0.15,
        confirmatoryFeatures: [
          'Write latency spike with stable read latency',
          'Continuous Raft term bumps',
          'Asymmetric packet drop telemetry between availability zones',
        ],
        contradictoryAnomalies: [],
        lethalityOrRiskTier: 'catastrophic',
        isTargetOptimalSolution: true,
      },
      {
        id: 'nvme_io_hang',
        name: 'NVMe Write-Ahead Log (WAL) Synchronous Flush Hang',
        systemicMechanism:
          'Hardware controller degradation on primary SSD causing fsync stalls during log append.',
        priorProbability: 0.15,
        confirmatoryFeatures: ['High write latency', 'Client timeouts'],
        contradictoryAnomalies: [
          'Occurring across all availability zones concurrently, not isolated to single disk',
        ],
        lethalityOrRiskTier: 'critical',
        isTargetOptimalSolution: false,
      },
    ],
    cognitiveForcingSteps: [
      {
        id: 'cff_pause_raft',
        type: 'universal_pause',
        title: 'Universal Triage Freeze',
        instruction:
          'Do not flush or restart Redis. Interrogate the anomaly: "Is the latency in the reads or the write consensus pipeline?"',
        forcingQuestion:
          'Why are pure cache reads operating at 4ms while only consensus writes stall?',
        targetBiasMitigated: 'anchoring_adjustment',
        minimumExecutionSeconds: 4,
      },
      {
        id: 'cff_diff_raft',
        type: 'differential_divergence',
        title: 'Triangulate Consensus vs Caching Subsystems',
        instruction:
          'Formulate alternative network topology failures that mimic cache eviction symptoms by starving replication queues.',
        forcingQuestion:
          'Can an asymmetric partition on Raft heartbeats cause client write timeouts that artificially distort cache write-through ratios?',
        targetBiasMitigated: 'premature_closure',
        minimumExecutionSeconds: 5,
      },
      {
        id: 'cff_disconfirm_raft',
        type: 'disconfirmation_crucible',
        title: 'Falsify the Cache Theory with Resource Telemetry',
        instruction:
          'Audit Redis CPU, network socket saturation, and IOPS before approving a cache flush.',
        forcingQuestion:
          'If Redis is exhausted, why is CPU utilization below 12% and memory fragmentation ratio 1.02?',
        targetBiasMitigated: 'confirmation_bias',
        minimumExecutionSeconds: 5,
      },
      {
        id: 'cff_devil_raft',
        type: 'devils_advocate_inversion',
        title: "Devil's Advocate: The Partition Hypothesis",
        instruction:
          'Assume the network is partitioning packets asymmetrically. Inspect Raft consensus logs for term election churn.',
        forcingQuestion:
          'Does the 30x surge in Raft election terms confirm split-brain leader pre-emption rather than cache degradation?',
        targetBiasMitigated: 'search_satisficing',
        minimumExecutionSeconds: 4,
      },
    ],
    authoritativeResolution:
      'The cluster suffered an asymmetric network partition where Node 4 dropped inbound heartbeats from the leader while its outbound election votes reached quorum peers. This triggered continual election terms, causing the leader to abdicate repeatedly and reject write quorums. The cache drop was a secondary artifact of failed write-through updates. Enabling Raft Pre-Vote protocol and blacklisting the partitioned interface restored 4ms cluster latency.',
    epistemicTakeaway:
      'In distributed systems, the most visible symptom (cache hit rate) is often a downstream victim of an upstream consensus failure. Cognitive forcing prevents the catastrophic mistake of rebooting innocent components.',
  },
  {
    id: 'macro_finance_liquidity_freeze',
    domain: 'macro_finance',
    title: 'Short-Term Commercial Paper Spread Widening: Noise vs Structural Bank Run',
    leadPresenterNarrative:
      'Overnight repo rates on high-grade asset-backed commercial paper (ABCP) widen by 65 basis points. Chief Investment Officer issues memo: "Quarter-end window dressing and corporate tax payment flows are tightening short-term funding markets. Maintain long leveraged carry positions; liquidity will normalize next week."',
    initialSalientData: [
      'Repo spread widened by 65 bps above SOFR',
      'Quarter-end date is 6 days away',
      'Equities index is trading at all-time highs',
      'Credit default swap (CDS) spreads on prime commercial banks are calm',
    ],
    vividHeuristicTrapDescription:
      'System 1 anchors on the benign, high-base-rate historical explanation (quarter-end calendar seasonal squeeze). Portfolio managers ignore subtle collateral quality degradation, risking catastrophic insolvency in a structured asset freeze.',
    defaultSystem1DiagnosisId: 'calendar_window_dressing',
    subtleAnomalies: [
      'Collateral haircuts on subprime-linked tranches doubled from 3% to 15% with zero market transactions taking place (complete bid-ask evaporation)',
      'Interbank unsecured borrowing (LIBOR/SOFR spread) is rising while Treasury yields collapse (flight to pure sovereign liquidity)',
      'Special purpose vehicles (SPVs) are failing to roll over maturities and drawing down emergency bank backup liquidity lines',
      'Foreign European banks are refusing dollar swaps with domestic counterparties',
    ],
    hypotheses: [
      {
        id: 'calendar_window_dressing',
        name: 'Calendar Quarter-End Window Dressing & Tax Flow Squeeze',
        systemicMechanism:
          'Banks hoarding reserves temporarily to polish regulatory balance sheets ahead of quarterly reporting dates.',
        priorProbability: 0.88,
        confirmatoryFeatures: [
          'Proximity to quarter end',
          'Equities at highs',
          'Spreads widened in repo',
        ],
        contradictoryAnomalies: [
          'Collateral haircut explosion to 15%',
          'Treasury yields diving while repo rises',
          'Off-balance-sheet SPV backup lines triggering',
        ],
        lethalityOrRiskTier: 'benign',
        isTargetOptimalSolution: false,
      },
      {
        id: 'structured_credit_insolvency_spiral',
        name: 'Endogenous Collateral Run & Shadow Banking Insolvency Spiral',
        systemicMechanism:
          'Information sensitivity switch (Gorton-Metrick): opaque subprime collateral becomes toxic, lenders demand 100% cash, triggering systemic fire sales.',
        priorProbability: 0.08,
        confirmatoryFeatures: [
          'Bid-ask evaporation in ABCP',
          'Doubling of haircuts',
          'Emergency bank credit facility drawdowns',
          'Flight to pristine government collateral',
        ],
        contradictoryAnomalies: [],
        lethalityOrRiskTier: 'catastrophic',
        isTargetOptimalSolution: true,
      },
      {
        id: 'central_bank_reserve_drain',
        name: 'Technical Quantitative Tightening Reverse Repo Drain',
        systemicMechanism:
          'Central bank overnight reverse repo facility absorbing excess liquidity faster than private markets can intermediate.',
        priorProbability: 0.04,
        confirmatoryFeatures: ['Higher repo rates', 'Stable bank CDS'],
        contradictoryAnomalies: [
          'Does not account for private collateral market illiquidity and haircut divergence',
        ],
        lethalityOrRiskTier: 'moderate',
        isTargetOptimalSolution: false,
      },
    ],
    cognitiveForcingSteps: [
      {
        id: 'cff_pause_macro',
        type: 'universal_pause',
        title: 'Universal Solvency Timeout',
        instruction:
          'Reflect: "If this is not calendar window-dressing, what leverage structure is quietly imploding behind the scenes?"',
        forcingQuestion:
          'Does a simple quarter-end squeeze cause private dealers to refuse to quote bids on investment-grade asset-backed debt?',
        targetBiasMitigated: 'anchoring_adjustment',
        minimumExecutionSeconds: 4,
      },
      {
        id: 'cff_diff_macro',
        type: 'differential_divergence',
        title: 'Contrast Liquidity Squeeze vs Solvency Deficit',
        instruction:
          'Distinguish pure cash-flow timing friction from fundamental insolvency in underlying structured assets.',
        forcingQuestion:
          'Why are haircuts jumping specifically on securitized tranches while government bills trade at premium yields?',
        targetBiasMitigated: 'base_rate_neglect',
        minimumExecutionSeconds: 5,
      },
      {
        id: 'cff_disconfirm_macro',
        type: 'disconfirmation_crucible',
        title: 'Disconfirmation: Trace Off-Balance-Sheet Liquidity Lines',
        instruction:
          'Examine bank contingent liabilities: are affiliated conduits drawing down standby liquidity agreements?',
        forcingQuestion:
          'Do emergency conduit draws contradict the hypothesis of routine voluntary balance sheet polishing?',
        targetBiasMitigated: 'confirmation_bias',
        minimumExecutionSeconds: 5,
      },
      {
        id: 'cff_devil_macro',
        type: 'devils_advocate_inversion',
        title: "Devil's Advocate: The 2007-08 Run Scenario",
        instruction:
          'Adopt the perspective of an aggressive short seller: what happens if the ABCP market shuts down completely next week?',
        forcingQuestion:
          'If funding freezes for 30 days, does the fund possess sufficient unencumbered cash to survive without asset fire-sales?',
        targetBiasMitigated: 'framing_effect',
        minimumExecutionSeconds: 4,
      },
    ],
    authoritativeResolution:
      'The market is entering an endogenous shadow banking run (Gorton & Metrick, 2012). Opaque mortgages embedded within ABCP triggered an information-sensitivity transition: haircut demands surged to 15%, causing rollover failures and forcing conduits to draw on commercial bank liquidity backstops. De-leveraging risk positions immediately preserved capital before full market closure.',
    epistemicTakeaway:
      'Relying on base rates (calendar effects happen 4 times a year; credit panics once a decade) without auditing counter-anomalies is the mathematical definition of Base-Rate Neglect in risk management.',
  },
  {
    id: 'gpu_kernel_synchronization_stall',
    domain: 'gpu_architecture',
    title: 'Transformer Attention Slowdown: The Memory Bandwidth Anchor vs Warp Divergence',
    leadPresenterNarrative:
      'A team deploying a custom 70B parameter MoE LLM finds decode latency per token degrades by 3.8x. Lead ML engineer files issue: "Memory-bound kernel bottleneck! HBM3 memory bandwidth is saturated during KV-cache lookups. We must implement 4-bit KV quantization immediately to reduce memory traffic."',
    initialSalientData: [
      'Decode step latency jumped from 22ms to 84ms per token',
      'Batch size was recently increased to 64',
      'HBM memory footprint reached 88% capacity',
      'LLM decode phase is classically memory-bandwidth bound',
    ],
    vividHeuristicTrapDescription:
      'System 1 anchors on the textbook machine learning rule of thumb: "LLM generation is memory bandwidth limited, therefore high latency equals memory bottleneck." The team risks weeks of quantization work without profiling thread execution.',
    defaultSystem1DiagnosisId: 'memory_bandwidth_saturation',
    subtleAnomalies: [
      'NVIDIA Nsight Compute roofline analysis shows kernel operating in compute-bound domain, well below HBM3 peak throughput (only 31% bandwidth utilization)',
      'Warp execution efficiency collapsed to 18.2% due to branch divergence across dynamic MoE routing gating logits',
      'Shared memory bank conflicts in the custom flash-attention kernel jumped to 42 conflicts per request',
      'Tensor Core utilization is virtually zero (0.8%) because threads are executing scalar serialization branches',
    ],
    hypotheses: [
      {
        id: 'memory_bandwidth_saturation',
        name: 'High-Bandwidth Memory (HBM3) Saturation During KV-Cache Retrieval',
        systemicMechanism:
          'Memory bus bottleneck reading non-contiguous sequence state from GPU DRAM.',
        priorProbability: 0.8,
        confirmatoryFeatures: [
          'Decode latency degradation',
          'Large batch size',
          'High memory usage',
        ],
        contradictoryAnomalies: [
          'Nsight roofline shows 31% DRAM throughput',
          'Kernel is compute/instruction limited',
        ],
        lethalityOrRiskTier: 'moderate',
        isTargetOptimalSolution: false,
      },
      {
        id: 'moe_warp_divergence_serialization',
        name: 'Warp Branch Divergence & Shared Memory Bank Serialization',
        systemicMechanism:
          'Conditional routing within single warp assigns diverse experts to neighboring threads, serializing SIMT execution and disabling Tensor Cores.',
        priorProbability: 0.12,
        confirmatoryFeatures: [
          '18.2% warp execution efficiency',
          '42-way bank conflicts',
          'Tensor Core utilization 0.8%',
          'Below roofline DRAM bandwidth',
        ],
        contradictoryAnomalies: [],
        lethalityOrRiskTier: 'critical',
        isTargetOptimalSolution: true,
      },
      {
        id: 'cuda_stream_sync_host_overhead',
        name: 'Host-Device CPU-GPU Implicit Synchronization Latency',
        systemicMechanism:
          'CPU blocking on cudaStreamSynchronize or tensor `.item()` calls inside generation loop.',
        priorProbability: 0.08,
        confirmatoryFeatures: ['High latency per token'],
        contradictoryAnomalies: [
          'Nsight profile shows GPU timeline completely packed, no idle CPU waits',
        ],
        lethalityOrRiskTier: 'moderate',
        isTargetOptimalSolution: false,
      },
    ],
    cognitiveForcingSteps: [
      {
        id: 'cff_pause_gpu',
        type: 'universal_pause',
        title: 'Universal Profiling Freeze',
        instruction:
          'Do not re-quantize the weights. Check Nsight Compute roofline: "Is the kernel DRAM bandwidth bound or warp instruction bound?"',
        forcingQuestion:
          'Why is HBM3 throughput only at 31% if memory bandwidth is supposed to be the bottleneck?',
        targetBiasMitigated: 'anchoring_adjustment',
        minimumExecutionSeconds: 4,
      },
      {
        id: 'cff_diff_gpu',
        type: 'differential_divergence',
        title: 'Contrast Execution Subsystems',
        instruction:
          'Differentiate between DRAM bus starvation, SIMT thread divergence, and shared memory bank serialization.',
        forcingQuestion:
          'What happens to warp execution efficiency when 32 threads in a warp evaluate different conditional expert branches?',
        targetBiasMitigated: 'premature_closure',
        minimumExecutionSeconds: 5,
      },
      {
        id: 'cff_disconfirm_gpu',
        type: 'disconfirmation_crucible',
        title: 'Disconfirmation: Audit Warp Efficiency Metrics',
        instruction:
          'Verify whether threads are actively executing instructions simultaneously or serializing one by one.',
        forcingQuestion:
          'Does an 18.2% warp execution efficiency prove that SIMT hardware is stalling on branching logic rather than memory bus?',
        targetBiasMitigated: 'confirmation_bias',
        minimumExecutionSeconds: 5,
      },
      {
        id: 'cff_devil_gpu',
        type: 'devils_advocate_inversion',
        title: "Devil's Advocate: The Quantization Futility Test",
        instruction:
          'Suppose we compress the KV cache by 4x. If memory throughput is only at 31%, how much speedup will quantization actually yield?',
        forcingQuestion:
          'Will quantizing weights fix warp thread serialization when threads are taking divergent branches?',
        targetBiasMitigated: 'search_satisficing',
        minimumExecutionSeconds: 4,
      },
    ],
    authoritativeResolution:
      'The decode slowdown was caused by intra-warp expert divergence in the MoE dispatch layer, causing the 32 threads within warps to serialize execution sequentially across up to 8 distinct experts, cratering efficiency to 18.2%. Re-clustering tokens by expert assignment before kernel launch restored SIMT parallelism and brought latency down from 84ms to 19ms.',
    epistemicTakeaway:
      'A heuristic dogma ("LLM decoding is memory-bound") blindfolds engineers to architectural divergence. Cognitive Forcing requires checking the empirical Roofline chart before diagnosing bottlenecks.',
  },
]
