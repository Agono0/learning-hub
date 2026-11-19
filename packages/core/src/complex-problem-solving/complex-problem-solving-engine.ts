/**
 * Complex Problem Solving (CPS) & Micro-World Simulation Engine
 *
 * Grounded in:
 * - Dietrich Dörner (1996). The Logic of Failure: Why Things Go Wrong and What We Can Do
 *   to Make Them Right. Metropolitan Books / Henry Holt.
 * - Peter A. Frensch & Joachim Funke (1995). Complex Problem Solving: The European Perspective.
 * - Berndt Brehmer (1992). Dynamic Decision Making: Human Control of Complex Systems.
 * - Jens Rasmussen (1983). Skills, Rules, Knowledge (SRK) Framework in Complex Domains.
 *
 * Key Theoretical Constructs:
 * 1. Micro-World System Dynamics: Polytely (multiple competing goals), Complexity (interconnected
 *    feedback networks), Intransparency (opaque internal states), and Delays (temporal phase lags).
 * 2. Dörner's Failure Pathologies:
 *    - Repair Service Mentality (Reparaturdienst-Verhalten): Surface-level firefighting of symptoms.
 *    - Ballistic Action: Firing policies without monitoring feedback or adapting to drift.
 *    - Thematic Vagabonding: Erratic flitting between unrelated sub-problems under stress.
 *    - Encapsulation: Retreating into trivial sub-tasks while ignoring catastrophic macro-collapse.
 *    - Linear Extrapolation: Neglecting exponential growth curves and delayed cascade tipping points.
 * 3. Quantitative CPS Telemetry:
 *    - Dynamic Control Efficiency (DCE in [0, 100]): Stability within safe operating bounds.
 *    - Side-Effect Anticipation Index (SEAI in [0, 100]): Foresight into 2nd/3rd order consequences.
 *    - Thematic Focus Score (TFS in [0, 100]): Resistance to vagabonding and encapsulation.
 *    - Feedback Monitoring Ratio (FMR in [0, 100]): Depth and regularity of inspection.
 *    - Composite Complex Problem Solving Index (CPSI in [0, 100]).
 *    - 4 Cognitive Control Tiers (ballistic_reactive -> systems_governor).
 * 4. Calibrated FSRS-6 Review Deck Generation.
 */

import { z } from 'zod'

// ============================================================================
// 1. Zod Schemas & Types
// ============================================================================

export const MicroWorldDomainSchema = z.enum([
  'ecological_management',
  'infrastructure_engineering',
  'public_health',
  'systems_engineering',
  'disaster_response',
])
export type MicroWorldDomain = z.infer<typeof MicroWorldDomainSchema>

export const CognitiveControlTierSchema = z.enum([
  'ballistic_reactive',
  'symptom_firefighter',
  'strategic_coordinator',
  'systems_governor',
])
export type CognitiveControlTier = z.infer<typeof CognitiveControlTierSchema>

export const DornerPathologySchema = z.enum([
  'repair_service_behavior',
  'ballistic_action',
  'thematic_vagabonding',
  'encapsulation',
  'linear_extrapolation',
])
export type DornerPathology = z.infer<typeof DornerPathologySchema>

export const MicroWorldVariableSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: z.string(),
  initialValue: z.number(),
  minSafe: z.number(),
  maxSafe: z.number(),
  isObservable: z.boolean(),
  isCritical: z.boolean(),
  description: z.string(),
})
export type MicroWorldVariable = z.infer<typeof MicroWorldVariableSchema>

export const DelayedSideEffectSchema = z.object({
  targetVariableId: z.string(),
  delayPeriods: z.number().int().min(1),
  multiplier: z.number(),
  description: z.string(),
})
export type DelayedSideEffect = z.infer<typeof DelayedSideEffectSchema>

export const PolicyInterventionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  primaryTargetId: z.string(),
  directDelta: z.number(),
  costResource: number(),
  delayedSideEffects: z.array(DelayedSideEffectSchema),
  rationalJustification: z.string(),
  hiddenRisk: z.string(),
  isSustainable: z.boolean().optional(),
})
export type PolicyIntervention = z.infer<typeof PolicyInterventionSchema>

function number() {
  return z.number()
}

export const CPSFSRSCardTemplateSchema = z.object({
  question: z.string(),
  answer: z.string(),
  rationale: z.string(),
  difficulty: z.number().min(1).max(10),
})
export type CPSFSRSCardTemplate = z.infer<typeof CPSFSRSCardTemplateSchema>

export const MicroWorldScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: MicroWorldDomainSchema,
  historicalContext: z.string(),
  coreDilemma: z.string(),
  polytelicGoals: z.array(z.string()),
  variables: z.array(MicroWorldVariableSchema),
  availablePolicies: z.array(PolicyInterventionSchema),
  canonicalFailureMode: z.object({
    pathology: DornerPathologySchema,
    trapDescription: z.string(),
    consequence: z.string(),
    remedyPrinciple: z.string(),
  }),
  fsrsItems: z.array(CPSFSRSCardTemplateSchema),
})
export type MicroWorldScenario = z.infer<typeof MicroWorldScenarioSchema>

export const MicroWorldStateSchema = z.object({
  currentCycle: z.number().int().min(1),
  variableValues: z.record(z.string(), z.number()),
  activeDelays: z.array(
    z.object({
      targetVariableId: z.string(),
      cyclesRemaining: z.number().int(),
      delta: z.number(),
      description: z.string(),
    }),
  ),
  inspectedVariables: z.array(z.string()),
  executedPolicyIds: z.array(z.string()),
  systemCollapsed: z.boolean(),
  collapseReason: z.string().optional(),
})
export type MicroWorldState = z.infer<typeof MicroWorldStateSchema>

export const DecisionCycleInputSchema = z.object({
  scenarioId: z.string(),
  cycleNumber: z.number().int().min(1),
  inspectedVariableIds: z.array(z.string()).default([]),
  selectedPolicyIds: z.array(z.string()).default([]),
  strategicRationale: z.string().optional(),
})
export type DecisionCycleInput = z.infer<typeof DecisionCycleInputSchema>

export const CPSSessionEvaluationSchema = z.object({
  scenarioId: z.string(),
  cyclesCompleted: z.number().int(),
  controlEfficiency: z.number().min(0).max(100),
  sideEffectAnticipation: z.number().min(0).max(100),
  thematicFocus: z.number().min(0).max(100),
  feedbackMonitoring: z.number().min(0).max(100),
  compositeCPSIndex: z.number().min(0).max(100),
  tier: CognitiveControlTierSchema,
  tierDescription: z.string(),
  detectedPathologies: z.array(
    z.object({
      pathology: DornerPathologySchema,
      title: string(),
      evidence: string(),
      mitigation: string(),
    }),
  ),
  fsrsCardCount: z.number().nonnegative(),
})
export type CPSSessionEvaluation = z.infer<typeof CPSSessionEvaluationSchema>

function string() {
  return z.string()
}

export const GeneratedCPSFSRSCardSchema = z.object({
  id: z.string(),
  front: z.string(),
  back: z.string(),
  tags: z.array(z.string()),
  initialStability: z.number(),
  initialDifficulty: z.number(),
})
export type GeneratedCPSFSRSCard = z.infer<typeof GeneratedCPSFSRSCardSchema>

// ============================================================================
// 2. Canonical Micro-World Scenarios (5 Multidisciplinary Paradigms)
// ============================================================================

export const CANONICAL_CPS_SCENARIOS: MicroWorldScenario[] = [
  {
    id: 'tanaland_desert_ecosystem',
    title: "Dörner's Tanaland: Semi-Arid Ecosystem & Nomadic Pastoralism",
    domain: 'ecological_management',
    historicalContext:
      "Dietrich Dörner's classic 'Tanaland' computer micro-world experiments at University of Bamberg (1981-1996)",
    coreDilemma:
      'Manage drought relief, livestock health, and water distribution for the nomadic tribes without triggering desertification and famine.',
    polytelicGoals: [
      'Maintain human population nutrition and water security',
      'Increase nomadic cattle herd productivity and tribal wealth',
      'Preserve groundwater table and prevent vegetation overgrazing',
    ],
    variables: [
      {
        id: 'cattle_population',
        name: 'Nomadic Cattle Herd Count',
        unit: 'heads (thousands)',
        initialValue: 100,
        minSafe: 40,
        maxSafe: 180,
        isObservable: true,
        isCritical: true,
        description: 'Livestock owned by tribes; primary store of wealth and nutrition.',
      },
      {
        id: 'groundwater_table',
        name: 'Aquifer Water Level',
        unit: 'meters depth',
        initialValue: 50,
        minSafe: 25,
        maxSafe: 80,
        isObservable: true,
        isCritical: true,
        description: 'Deep fossil aquifer supporting boreholes and pasture grass roots.',
      },
      {
        id: 'pasture_vegetation_biomass',
        name: 'Savanna Grassland Cover',
        unit: 'tons / km^2',
        initialValue: 120,
        minSafe: 60,
        maxSafe: 200,
        isObservable: true,
        isCritical: true,
        description: 'Perennial fodder grazing capacity supporting herbivore populations.',
      },
      {
        id: 'tsetse_fly_density',
        name: 'Tsetse Fly Vector Index',
        unit: 'flies / trap',
        initialValue: 45,
        minSafe: 0,
        maxSafe: 70,
        isObservable: false,
        isCritical: false,
        description:
          'Parasitic vector carrying sleeping sickness (trypanosomiasis); natural buffer against overgrazing.',
      },
      {
        id: 'soil_erosion_rate',
        name: 'Topsoil Erosion Velocity',
        unit: 'tons / ha / year',
        initialValue: 15,
        minSafe: 0,
        maxSafe: 35,
        isObservable: false,
        isCritical: true,
        description:
          'Irreversible desertification rate once vegetative root cover drops below critical threshold.',
      },
    ],
    availablePolicies: [
      {
        id: 'drill_deep_boreholes',
        name: 'Drill Motorized Deep Groundwater Boreholes',
        category: 'water_infrastructure',
        primaryTargetId: 'groundwater_table',
        directDelta: -10, // draws down aquifer
        costResource: 40,
        delayedSideEffects: [
          {
            targetVariableId: 'cattle_population',
            delayPeriods: 2,
            multiplier: 1.4,
            description: 'Abundant water allows herd survival rates to surge exponentially.',
          },
          {
            targetVariableId: 'pasture_vegetation_biomass',
            delayPeriods: 3,
            multiplier: -0.4,
            description:
              'Over-concentrated herds trample and decimate pasture within 10 km radius of boreholes.',
          },
        ],
        rationalJustification: 'Solves immediate nomadic water shortages and livestock thirst.',
        hiddenRisk:
          'Severely drops groundwater while triggering catastrophic exponential herd overshoot.',
      },
      {
        id: 'veterinary_vaccination_drive',
        name: 'Mass Veterinary Antibiotic & Rinderpest Vaccination',
        category: 'livestock_healthcare',
        primaryTargetId: 'cattle_population',
        directDelta: 25, // immediate herd survival
        costResource: 30,
        delayedSideEffects: [
          {
            targetVariableId: 'pasture_vegetation_biomass',
            delayPeriods: 2,
            multiplier: -0.5,
            description: 'Massive herd survival strips forage faster than seasonal regeneration.',
          },
          {
            targetVariableId: 'soil_erosion_rate',
            delayPeriods: 4,
            multiplier: 1.8,
            description: 'Denuded topsoil is swept away by monsoon rains and desert winds.',
          },
        ],
        rationalJustification:
          'Improves pastoral nutrition and tribal wealth by preventing epidemic livestock die-off.',
        hiddenRisk:
          'Removes ecological density-dependent checks without providing alternative pasture acreage.',
      },
      {
        id: 'rotational_grazing_enclosures',
        name: 'Enforce Seasonal Tribal Rotational Pasture Corridors',
        category: 'pastoral_governance',
        primaryTargetId: 'pasture_vegetation_biomass',
        directDelta: 20, // pasture recovery
        costResource: 25,
        isSustainable: true,
        delayedSideEffects: [
          {
            targetVariableId: 'soil_erosion_rate',
            delayPeriods: 2,
            multiplier: -0.6,
            description: 'Deep grass roots stabilize topsoil and enhance rainfall infiltration.',
          },
        ],
        rationalJustification:
          'Maintains long-term ecological balance and prevents localized rangeland destruction.',
        hiddenRisk:
          'Requires diplomatic negotiation among pastoral clans; yields modest short-term yields.',
      },
    ],
    canonicalFailureMode: {
      pathology: 'repair_service_behavior',
      trapDescription:
        'Drilling wells to eliminate thirst and vaccinating herds to eliminate disease without managing rangeland carrying capacity.',
      consequence:
        'Cattle population doubles within 5 years, completely consumes savanna grass cover, drops groundwater, and collapses in 90% famine mortality.',
      remedyPrinciple:
        'Always anticipate 2nd-order feedback loops: treating symptoms in an ecological system triggers delayed counter-intuitive collapse.',
    },
    fsrsItems: [
      {
        question:
          "What is Dörner's 'Repair Service Behavior' (Reparaturdienst-Verhalten) in complex systems?",
        answer:
          'Fixating on treating emergent surface symptoms sequentially as isolated emergencies rather than addressing root structural feedbacks.',
        rationale:
          'Identifies the primary cognitive pathology observed in the Tanaland experiments.',
        difficulty: 4,
      },
      {
        question:
          "Why did well-drilling in Dörner's Tanaland lead to catastrophic desertification?",
        answer:
          'Free water eliminated natural mortality constraints on cattle; unchecked exponential herd growth devoured all pasture biomass, causing irreversible topsoil erosion.',
        rationale: 'Demonstrates delayed negative side-effects of single-variable interventions.',
        difficulty: 5,
      },
    ],
  },
  {
    id: 'smart_grid_energy_transition',
    title: 'Regional Clean Energy Grid & Winter Peaker Dispatch',
    domain: 'infrastructure_engineering',
    historicalContext:
      'European winter Dunkelflaute (wind/solar drought) grid management and ERCOT Texas grid crisis (2021)',
    coreDilemma:
      'Transitioning to 80% intermittent renewables (solar/wind) while maintaining 50.0 Hz grid frequency during extreme winter freezes without rolling blackouts.',
    polytelicGoals: [
      'Maintain grid frequency strictly at 50.0 Hz (+/- 0.2 Hz tolerance)',
      'Minimize greenhouse gas emissions from fossil peaking plants',
      'Prevent transmission line thermal overloading and consumer brownouts',
    ],
    variables: [
      {
        id: 'grid_frequency',
        name: 'System Electrical Frequency',
        unit: 'Hertz (Hz)',
        initialValue: 50.0,
        minSafe: 49.8,
        maxSafe: 50.2,
        isObservable: true,
        isCritical: true,
        description:
          'Instantaneous dynamic balance between generation and power demand. Sub-49.8 Hz triggers automatic load shedding.',
      },
      {
        id: 'battery_storage_soc',
        name: 'Grid Battery State of Charge',
        unit: 'percentage (%)',
        initialValue: 80,
        minSafe: 15,
        maxSafe: 98,
        isObservable: true,
        isCritical: true,
        description: 'Fast-responding lithium-ion battery reserves (4-hour discharge capacity).',
      },
      {
        id: 'natural_gas_peaker_reserve',
        name: 'Gas Turbine Peaking Capacity',
        unit: 'Megawatts (MW)',
        initialValue: 500,
        minSafe: 100,
        maxSafe: 1200,
        isObservable: true,
        isCritical: false,
        description: 'Fast-ramping dispatchable gas peakers; high carbon emissions and fuel costs.',
      },
      {
        id: 'transmission_line_thermal_stress',
        name: 'Transmission High-Voltage Stress',
        unit: 'percentage of thermal limit (%)',
        initialValue: 65,
        minSafe: 20,
        maxSafe: 95,
        isObservable: true,
        isCritical: true,
        description:
          'Thermal expansion of conductors under high current; >100% causes line sagging into trees and catastrophic cascade trips.',
      },
    ],
    availablePolicies: [
      {
        id: 'full_battery_discharge_surge',
        name: 'Deploy Full Battery Inverter Response',
        category: 'frequency_stabilization',
        primaryTargetId: 'grid_frequency',
        directDelta: 0.15, // frequency bump
        costResource: 10,
        delayedSideEffects: [
          {
            targetVariableId: 'battery_storage_soc',
            delayPeriods: 1,
            multiplier: -0.4,
            description: 'Battery reserves deplete rapidly within 2 decision cycles.',
          },
        ],
        rationalJustification: 'Instantly arrest frequency decay within milliseconds.',
        hiddenRisk:
          'Depletes entire emergency buffer, leaving grid defenseless against next freeze front.',
      },
      {
        id: 'spin_up_gas_peakers',
        name: 'Order Hot-Standby Gas Turbine Peakers to Full Throttle',
        category: 'dispatchable_generation',
        primaryTargetId: 'natural_gas_peaker_reserve',
        directDelta: 300,
        costResource: 50,
        delayedSideEffects: [
          {
            targetVariableId: 'grid_frequency',
            delayPeriods: 1,
            multiplier: 0.1,
            description: 'Turbine inertia stabilizes frequency after a 15-minute ramp-up delay.',
          },
          {
            targetVariableId: 'transmission_line_thermal_stress',
            delayPeriods: 2,
            multiplier: 0.25,
            description:
              'High MW injection pushes regional transmission corridor to thermal limits.',
          },
        ],
        rationalJustification:
          'Provides bulk synchronous generation to offset lack of solar and wind.',
        hiddenRisk: 'Thermal delays in spool-up and potential line overloading downstream.',
      },
      {
        id: 'industrial_demand_response',
        name: 'Activate Voluntary Industrial Demand-Response Curtailment',
        category: 'demand_management',
        primaryTargetId: 'grid_frequency',
        directDelta: 0.1,
        costResource: 20,
        isSustainable: true,
        delayedSideEffects: [
          {
            targetVariableId: 'transmission_line_thermal_stress',
            delayPeriods: 1,
            multiplier: -0.15,
            description:
              'Curtailing large industrial smelting loads relieves transmission bottlenecks.',
          },
        ],
        rationalJustification: 'Non-generating negawatt flexibility preserving system stability.',
        hiddenRisk: 'Economic compensation costs and limited endurance duration.',
      },
    ],
    canonicalFailureMode: {
      pathology: 'ballistic_action',
      trapDescription:
        'Firing full battery discharge and assuming the frequency crisis is permanently solved without monitoring state-of-charge decay or scheduling synchronous peakers.',
      consequence:
        'Batteries hit 0% during night peak; frequency plunges to 49.2 Hz, triggering automatic cascading trip of nuclear plants and statewide blackout.',
      remedyPrinciple:
        'Actively monitor dynamic resource depletion: rapid buffers buy time for slow dispatchable baseload to synchronize.',
    },
    fsrsItems: [
      {
        question: "What is 'Ballistic Action' in Dietrich Dörner's logic of failure?",
        answer:
          'Executing an intervention and treating it as a done deal without continuous feedback monitoring, assuming the problem remains static.',
        rationale: 'Core cognitive failure mode in fast-paced operational micro-worlds.',
        difficulty: 4,
      },
      {
        question:
          'Why are battery storage assets in power grids considered high-speed but low-endurance buffers?',
        answer:
          'Inverters respond in milliseconds to stabilize frequency, but their MWh capacity is exhausted in hours, requiring dispatch of slower synchronous generators.',
        rationale: 'Highlights temporal phase coordination in infrastructure engineering.',
        difficulty: 4,
      },
    ],
  },
  {
    id: 'pandemic_hospital_surge',
    title: 'Metropolitan Pandemic Surge & Healthcare Resilience',
    domain: 'public_health',
    historicalContext:
      'Hospital capacity management and pandemic surge response (COVID-19 pandemic 2020-2022)',
    coreDilemma:
      'Manage ICU capacity, staff burnout, elective care backlogs, and community spread under a 10-day reporting/testing time lag.',
    polytelicGoals: [
      'Maintain ICU bed and mechanical ventilator availability for critical patients',
      'Prevent acute healthcare worker exhaustion and clinical attrition',
      'Minimize non-COVID patient mortality from deferred oncology and cardiac care',
    ],
    variables: [
      {
        id: 'icu_occupancy_rate',
        name: 'ICU Bed Occupancy',
        unit: 'percentage of capacity (%)',
        initialValue: 75,
        minSafe: 40,
        maxSafe: 95,
        isObservable: true,
        isCritical: true,
        description:
          'Proportion of available ICU beds filled; >100% requires emergency hallway triage.',
      },
      {
        id: 'clinical_staff_burnout_index',
        name: 'Nurse & Physician Exhaustion Index',
        unit: 'burnout scale (0-100)',
        initialValue: 40,
        minSafe: 0,
        maxSafe: 70,
        isObservable: true,
        isCritical: true,
        description:
          'Cumulative fatigue metric; >75 causes resignations and severe staff shortages.',
      },
      {
        id: 'deferred_elective_backlog',
        name: 'Deferred Elective Surgeries',
        unit: 'procedures (thousands)',
        initialValue: 12,
        minSafe: 0,
        maxSafe: 25,
        isObservable: true,
        isCritical: false,
        description:
          'Postponed cardiac, cancer, and orthopedic procedures; delays increase excess home mortality.',
      },
      {
        id: 'community_transmission_reproduction_r',
        name: 'Effective Reproduction Number R_t',
        unit: 'secondary cases per infection',
        initialValue: 1.4,
        minSafe: 0.5,
        maxSafe: 1.1,
        isObservable: false,
        isCritical: true,
        description:
          'Underlying epidemic velocity; unobservable in real-time due to testing incubation lags.',
      },
    ],
    availablePolicies: [
      {
        id: 'cancel_all_elective_surgeries',
        name: 'Mandate Comprehensive Cancellation of Elective Procedures',
        category: 'capacity_expansion',
        primaryTargetId: 'icu_occupancy_rate',
        directDelta: -20, // frees beds
        costResource: 45,
        delayedSideEffects: [
          {
            targetVariableId: 'deferred_elective_backlog',
            delayPeriods: 2,
            multiplier: 0.8,
            description:
              'Creates insurmountable surgical backlogs that lead to progressive patient clinical deterioration.',
          },
        ],
        rationalJustification:
          'Immediately frees up recovery suites and anesthesia staff for critical COVID patients.',
        hiddenRisk: 'Severe long-term mortality from unmanaged chronic and oncological diseases.',
      },
      {
        id: 'mandate_nurse_double_shifts',
        name: 'Mandate 12-Hour Crisis Double Shifts & Ratio Waiver',
        category: 'staffing_mobilization',
        primaryTargetId: 'icu_occupancy_rate',
        directDelta: -10,
        costResource: 25,
        delayedSideEffects: [
          {
            targetVariableId: 'clinical_staff_burnout_index',
            delayPeriods: 1,
            multiplier: 0.5,
            description:
              'Staff burnout surges to critical levels; 15% of nurses resign within 3 cycles.',
          },
        ],
        rationalJustification: 'Expands effective ICU patient capacity without hiring delays.',
        hiddenRisk:
          'Eats the clinical seed corn: staff burnout leads to permanent labor attrition.',
      },
      {
        id: 'community_rapid_antigen_ring',
        name: 'Deploy Mass Rapid Home Antigen Testing & Contact Quarantine',
        category: 'transmission_control',
        primaryTargetId: 'community_transmission_reproduction_r',
        directDelta: -0.35,
        costResource: 35,
        isSustainable: true,
        delayedSideEffects: [
          {
            targetVariableId: 'icu_occupancy_rate',
            delayPeriods: 2,
            multiplier: -0.3,
            description:
              'Reduced community transmission lowers new ICU admissions after a 10-day delay.',
          },
        ],
        rationalJustification:
          'Attacks root causal engine (viral transmission) rather than merely managing hospital beds.',
        hiddenRisk: 'Requires 2 decision cycles to observe impact on ICU bed numbers.',
      },
    ],
    canonicalFailureMode: {
      pathology: 'thematic_vagabonding',
      trapDescription:
        'Jumping frantically between PPE procurement, canceling surgeries, and calling national guard without maintaining steady transmission reduction policies.',
      consequence:
        'Staff burns out, community R_t remains elevated, and hospital collapses under an exponential wave 3 weeks later.',
      remedyPrinciple:
        'Address root causal transmission drivers while protecting critical human capacity from unsustainable overload.',
    },
    fsrsItems: [
      {
        question: "What is 'Thematic Vagabonding' in Dörner's complex decision making?",
        answer:
          'Flitting rapidly from one sub-problem to another under high stress without following through or evaluating whether prior actions took effect.',
        rationale: 'Characteristic symptom of cognitive overload in multi-goal crises.',
        difficulty: 5,
      },
      {
        question:
          'Why does managing hospital capacity alone fail to stop pandemic collapse without transmission interventions?',
        answer:
          'Because hospital capacity is linear while viral transmission is exponential: doubling beds only buys a few days unless reproduction R_t is reduced below 1.',
        rationale: 'Contrasts linear capacity expansion against exponential epidemic growth.',
        difficulty: 4,
      },
    ],
  },
  {
    id: 'autonomous_datacenter_thermal',
    title: 'Hyperscale Datacenter Workload & Cooling Loop Orchestration',
    domain: 'systems_engineering',
    historicalContext:
      'AI supercomputer thermal throttling, liquid cooling loops, and PUE optimization in cloud datacenters',
    coreDilemma:
      'Minimize Power Usage Effectiveness (PUE) while preventing thermal hotspot throttling on dense AI clusters and acoustic fan resonance.',
    polytelicGoals: [
      'Maintain GPU die temperatures strictly below 85°C to avoid clock throttling',
      'Minimize chiller facility power consumption (achieve PUE < 1.15)',
      'Prevent thermal acoustic fatigue and cavitation in liquid pump loops',
    ],
    variables: [
      {
        id: 'gpu_cluster_temp',
        name: 'Peak GPU Cluster Junction Temperature',
        unit: 'Celsius (°C)',
        initialValue: 72,
        minSafe: 45,
        maxSafe: 84,
        isObservable: true,
        isCritical: true,
        description:
          'Hottest accelerator silicon sensor; >85°C triggers immediate 40% clock frequency down-throttling.',
      },
      {
        id: 'chiller_pue_index',
        name: 'Facility Power Usage Effectiveness (PUE)',
        unit: 'ratio (Total Power / IT Power)',
        initialValue: 1.18,
        minSafe: 1.05,
        maxSafe: 1.35,
        isObservable: true,
        isCritical: false,
        description: 'Energy efficiency metric; lower is greener and cheaper.',
      },
      {
        id: 'coolant_loop_pressure',
        name: 'Hydronic Chilled Water Pressure',
        unit: 'PSI',
        initialValue: 45,
        minSafe: 25,
        maxSafe: 65,
        isObservable: true,
        isCritical: true,
        description:
          'Pressure across closed cooling manifold; extreme surges cause micro-fracture pipe leaks.',
      },
    ],
    availablePolicies: [
      {
        id: 'max_chiller_compressor_power',
        name: 'Ramp Chiller Refrigeration Compressors to 100%',
        category: 'cooling_boost',
        primaryTargetId: 'gpu_cluster_temp',
        directDelta: -12,
        costResource: 60,
        delayedSideEffects: [
          {
            targetVariableId: 'chiller_pue_index',
            delayPeriods: 1,
            multiplier: 0.12,
            description: 'Huge electrical draw degrades facility PUE efficiency.',
          },
        ],
        rationalJustification:
          'Prevents immediate GPU throttling during heavy deep-learning training runs.',
        hiddenRisk: 'Severe efficiency penalty and high operating cost.',
      },
      {
        id: 'dynamic_compute_workload_migration',
        name: 'Migrate AI Training Batches to Geo-Distributed Cold Zones',
        category: 'workload_orchestration',
        primaryTargetId: 'gpu_cluster_temp',
        directDelta: -8,
        costResource: 20,
        isSustainable: true,
        delayedSideEffects: [
          {
            targetVariableId: 'chiller_pue_index',
            delayPeriods: 1,
            multiplier: -0.04,
            description: 'Reduced IT heat allows free evaporative cooling, lowering PUE.',
          },
        ],
        rationalJustification:
          'Redistributes heat generation at the software level rather than overworking mechanical chillers.',
        hiddenRisk: 'Adds cross-region network latency to distributed training synchronization.',
      },
    ],
    canonicalFailureMode: {
      pathology: 'encapsulation',
      trapDescription:
        'Obsessively tweaking fan RPM curves and PUE decimal points while ignoring a creeping pressure surge in the primary manifold.',
      consequence:
        'Cooling pipe ruptures, drowning rack row 4 in chilled glycol and causing multi-million dollar hardware loss.',
      remedyPrinciple:
        'Never retreat into comfortable micro-optimization while ignoring low-probability, catastrophic macro-risks.',
    },
    fsrsItems: [
      {
        question: "What is 'Encapsulation' in Dörner's psychology of failure?",
        answer:
          'Retreating into micro-managing a familiar, comfortable sub-problem while ignoring catastrophic dangers unfolding in other areas of the system.',
        rationale: 'Identifies comfort-seeking cognitive avoidance under complexity.',
        difficulty: 4,
      },
    ],
  },
  {
    id: 'wildfire_evacuation_corridor',
    title: 'Wildland-Urban Interface Firestorm & Evacuation Corridor',
    domain: 'disaster_response',
    historicalContext:
      'California Camp Fire and Mediterranean interface wildfire evacuation operations',
    coreDilemma:
      'Direct water bombers, bulldozer firebreaks, and phased residential evacuations under 60 km/h shifting winds without gridlock.',
    polytelicGoals: [
      'Evacuate 35,000 residents across a single 2-lane mountain canyon road without gridlock',
      'Defend critical electrical substations and municipal water pumping stations',
      'Protect firefighter crew safety and prevent entrapment',
    ],
    variables: [
      {
        id: 'fire_front_advance_speed',
        name: 'Firestorm Spread Velocity',
        unit: 'km / hour',
        initialValue: 8.0,
        minSafe: 0.0,
        maxSafe: 12.0,
        isObservable: true,
        isCritical: true,
        description: 'Forward rate of flame front advancing toward residential subdivisions.',
      },
      {
        id: 'evacuation_corridor_congestion',
        name: 'Canyon Road Vehicle Density',
        unit: 'vehicles / km / lane',
        initialValue: 60,
        minSafe: 20,
        maxSafe: 90,
        isObservable: true,
        isCritical: true,
        description: 'Traffic flow density; >90 causes complete stand-still gridlock in smoke.',
      },
      {
        id: 'firebreak_containment_perimeter',
        name: 'Bulldozed Firebreak Width',
        unit: 'meters width',
        initialValue: 15,
        minSafe: 10,
        maxSafe: 60,
        isObservable: true,
        isCritical: false,
        description: 'Mineral earth fuel break cleared of flammable underbrush.',
      },
    ],
    availablePolicies: [
      {
        id: 'contraflow_traffic_reversal',
        name: 'Convert Inbound Lanes to Outbound Contraflow Highway',
        category: 'traffic_management',
        primaryTargetId: 'evacuation_corridor_congestion',
        directDelta: -30,
        costResource: 25,
        isSustainable: true,
        delayedSideEffects: [
          {
            targetVariableId: 'fire_front_advance_speed',
            delayPeriods: 1,
            multiplier: 0.1,
            description:
              'Blocks inbound fire engine convoys, slightly slowing initial flank attack.',
          },
        ],
        rationalJustification:
          'Doubles vehicle evacuation throughput to prevent civilian incinerations in gridlock.',
        hiddenRisk: 'Inbound mutual aid fire trucks are blocked from reaching water supply depots.',
      },
      {
        id: 'heavy_air_tanker_retardant_drop',
        name: 'Deploy DC-10 Air Tanker Phosphate Retardant Line',
        category: 'aerial_suppression',
        primaryTargetId: 'fire_front_advance_speed',
        directDelta: -4.0,
        costResource: 55,
        delayedSideEffects: [
          {
            targetVariableId: 'firebreak_containment_perimeter',
            delayPeriods: 1,
            multiplier: 0.5,
            description: 'Retardant line anchors bulldozed ridge lines.',
          },
        ],
        rationalJustification: 'Knocks down active crown fire flames before reaching canyon rim.',
        hiddenRisk: 'High wind gusts can cause retardant to drift away from the target ridge.',
      },
    ],
    canonicalFailureMode: {
      pathology: 'linear_extrapolation',
      trapDescription:
        'Assuming fire spreads at a constant flat speed and delaying evacuation orders, ignoring that ember spot-fires jump 3 km downwind exponentially.',
      consequence:
        'The evacuation road is cut off by spot-fires before residents begin driving, trapping vehicles in firestorm flames.',
      remedyPrinciple:
        'Anticipate non-linear exponential spotting and trigger proactive phased evacuation before the flame front is visible.',
    },
    fsrsItems: [
      {
        question:
          "Why does 'Linear Extrapolation' fail catastrophically in wildfire disaster management?",
        answer:
          'Because wind-driven crown fires and ember-spotting jump kilometers ahead non-linearly, rendering past linear advance rates dangerously obsolete.',
        rationale:
          'Demonstrates cognitive breakdown in anticipating non-linear exponential dynamics.',
        difficulty: 4,
      },
    ],
  },
]

// ============================================================================
// 3. Quantitative Telemetry & Scoring Algorithms
// ============================================================================

/**
 * Dynamic Control Efficiency (DCE in [0, 100])
 * Evaluates how successfully variables remained within safe operating envelopes.
 */
export function calculateDynamicControlEfficiency(
  scenario: MicroWorldScenario,
  finalState: MicroWorldState,
): number {
  if (finalState.systemCollapsed) return 0

  let safeCount = 0
  let totalCount = 0

  for (const v of scenario.variables) {
    const val = finalState.variableValues[v.id] ?? v.initialValue
    totalCount += v.isCritical ? 2 : 1
    if (val >= v.minSafe && val <= v.maxSafe) {
      safeCount += v.isCritical ? 2 : 1
    }
  }

  const ratio = totalCount > 0 ? safeCount / totalCount : 1
  return Math.round(ratio * 100)
}

/**
 * Side-Effect Anticipation Index (SEAI in [0, 100])
 * Evaluates whether policies chosen anticipated second-order consequences.
 */
export function calculateSideEffectAnticipationIndex(
  scenario: MicroWorldScenario,
  executedPolicyIds: string[],
): number {
  if (executedPolicyIds.length === 0) return 50

  let score = 50
  for (const pid of executedPolicyIds) {
    const policy = scenario.availablePolicies.find((p) => p.id === pid)
    if (policy) {
      if (policy.isSustainable) {
        score += 15
      } else if (policy.delayedSideEffects.length > 0) {
        score -= 5
      }
    }
  }

  return Math.max(0, Math.min(100, score))
}

/**
 * Thematic Focus Score (TFS in [0, 100])
 * Evaluates consistency of intervention domain, penalizing thematic vagabonding and encapsulation.
 */
export function calculateThematicFocusScore(
  scenario: MicroWorldScenario,
  executedPolicyIds: string[],
): number {
  if (executedPolicyIds.length < 2) return 70

  // Count distinct categories
  const categories = new Set<string>()
  for (const pid of executedPolicyIds) {
    const policy = scenario.availablePolicies.find((p) => p.id === pid)
    if (policy) categories.add(policy.category)
  }

  // If player touched too many disparate categories in few turns -> thematic vagabonding
  if (categories.size > 3 && executedPolicyIds.length <= 4) {
    return 45 // vagabonding penalty
  }

  // If player touched only 1 category while other critical variables were failing -> encapsulation
  if (categories.size === 1 && executedPolicyIds.length >= 3) {
    return 55 // encapsulation penalty
  }

  return 85
}

/**
 * Feedback Monitoring Ratio (FMR in [0, 100])
 * Evaluates how thoroughly observable and non-observable variables were monitored.
 */
export function calculateFeedbackMonitoringRatio(
  scenario: MicroWorldScenario,
  inspectedVariableIds: string[],
): number {
  const observableVars = scenario.variables.filter((v) => v.isObservable)
  if (observableVars.length === 0) return 100
  if (inspectedVariableIds.length === 0) return 20 // ballistic penalty

  const uniqueInspected = new Set(inspectedVariableIds)
  const ratio = uniqueInspected.size / observableVars.length
  return Math.round(Math.min(100, Math.max(20, ratio * 100)))
}

/**
 * Composite Complex Problem Solving Index (CPSI in [0, 100])
 */
export function calculateCompositeCPSIndex(
  dce: number,
  seai: number,
  tfs: number,
  fmr: number,
): number {
  // Weights: 35% DCE, 25% SEAI, 20% TFS, 20% FMR
  const composite = dce * 0.35 + seai * 0.25 + tfs * 0.2 + fmr * 0.2
  return Math.round(Math.max(0, Math.min(100, composite)))
}

/**
 * Determine Cognitive Control Tier based on CPSI
 */
export function determineCognitiveControlTier(cpsi: number): {
  tier: CognitiveControlTier
  description: string
} {
  if (cpsi >= 85) {
    return {
      tier: 'systems_governor',
      description:
        'Mastery of complex problem solving (Dörner 1996): coordinates polytelic trade-offs, anticipates delayed second-order cascades, and maintains steady strategic focus without reactive firefighting.',
    }
  }
  if (cpsi >= 65) {
    return {
      tier: 'strategic_coordinator',
      description:
        'Proficient dynamic control: maintains safe operational limits across most variables and inspects feedback regularly, with occasional vulnerability to delayed non-linear surges.',
    }
  }
  if (cpsi >= 40) {
    return {
      tier: 'symptom_firefighter',
      description:
        'Reactive repair-service mentality: addresses surface emergencies sequentially as isolated crises, vulnerable to thematic vagabonding and leaving delayed side-effects unchecked.',
    }
  }
  return {
    tier: 'ballistic_reactive',
    description:
      'Ballistic action and encapsulation: executes policies without feedback monitoring or retreats into comfortable trivial parameters while critical macro-variables collapse.',
  }
}

// ============================================================================
// 4. Primary Public API Functions
// ============================================================================

/**
 * List all available canonical Micro-World scenarios
 */
export function listMicroWorldScenarios(): MicroWorldScenario[] {
  return CANONICAL_CPS_SCENARIOS
}

/**
 * Get a specific scenario by unique ID
 */
export function getMicroWorldScenario(id: string): MicroWorldScenario | undefined {
  return CANONICAL_CPS_SCENARIOS.find((s) => s.id === id)
}

/**
 * Simulate one decision cycle in the Micro-World
 */
export function simulateMicroWorldStep(
  scenarioId: string,
  currentState: MicroWorldState,
  selectedPolicyIds: string[],
  inspectedVariableIds: string[] = [],
): {
  nextState: MicroWorldState
  stepFeedback: string[]
  collapseWarning?: string
} {
  const scenario = getMicroWorldScenario(scenarioId) || CANONICAL_CPS_SCENARIOS[0]!
  const newValues = { ...currentState.variableValues }
  const stepFeedback: string[] = []
  let collapsed = false
  let collapseReason: string | undefined

  // 1. Resolve pending active delayed effects from earlier cycles
  const remainingDelays: MicroWorldState['activeDelays'] = []
  for (const delay of currentState.activeDelays) {
    if (delay.cyclesRemaining <= 1) {
      const current = newValues[delay.targetVariableId] ?? 0
      newValues[delay.targetVariableId] = Math.round((current + delay.delta) * 10) / 10
      stepFeedback.push(`Delayed cascade matured: ${delay.description}`)
    } else {
      remainingDelays.push({
        ...delay,
        cyclesRemaining: delay.cyclesRemaining - 1,
      })
    }
  }

  // 2. Execute new selected policies
  for (const pid of selectedPolicyIds) {
    const policy = scenario.availablePolicies.find((p) => p.id === pid)
    if (policy) {
      const current = newValues[policy.primaryTargetId] ?? 0
      newValues[policy.primaryTargetId] = Math.round((current + policy.directDelta) * 10) / 10
      stepFeedback.push(
        `Executed ${policy.name}: delta ${policy.directDelta > 0 ? '+' : ''}${policy.directDelta}`,
      )

      // Queue delayed side effects
      for (const se of policy.delayedSideEffects) {
        remainingDelays.push({
          targetVariableId: se.targetVariableId,
          cyclesRemaining: se.delayPeriods,
          delta: Math.round(policy.directDelta * se.multiplier * 10) / 10,
          description: se.description,
        })
      }
    }
  }

  // 3. Autonomous systemic drift & limit checks
  for (const v of scenario.variables) {
    const val = newValues[v.id] ?? v.initialValue
    if (v.isCritical) {
      if (val < v.minSafe || val > v.maxSafe) {
        collapsed = true
        collapseReason = `Critical variable '${v.name}' (${v.id}) breached safe operating envelope (${val} ${v.unit}, safe: ${v.minSafe}-${v.maxSafe}).`
        stepFeedback.push(`CRITICAL COLLAPSE: ${collapseReason}`)
        break
      }
    }
  }

  const nextState: MicroWorldState = {
    currentCycle: currentState.currentCycle + 1,
    variableValues: newValues,
    activeDelays: remainingDelays,
    inspectedVariables: Array.from(
      new Set([...currentState.inspectedVariables, ...inspectedVariableIds]),
    ),
    executedPolicyIds: [...currentState.executedPolicyIds, ...selectedPolicyIds],
    systemCollapsed: collapsed,
    collapseReason,
  }

  return {
    nextState,
    stepFeedback,
    collapseWarning: collapseReason,
  }
}

/**
 * Evaluate a complete multi-cycle Complex Problem Solving session
 */
export function evaluateCPSSession(
  scenarioId: string,
  finalState: MicroWorldState,
): CPSSessionEvaluation {
  const scenario = getMicroWorldScenario(scenarioId) || CANONICAL_CPS_SCENARIOS[0]!

  const dce = calculateDynamicControlEfficiency(scenario, finalState)
  const seai = calculateSideEffectAnticipationIndex(scenario, finalState.executedPolicyIds)
  const tfs = calculateThematicFocusScore(scenario, finalState.executedPolicyIds)
  const fmr = calculateFeedbackMonitoringRatio(scenario, finalState.inspectedVariables)
  const cpsi = calculateCompositeCPSIndex(dce, seai, tfs, fmr)
  const { tier, description } = determineCognitiveControlTier(cpsi)

  // Detect Dörner failure pathologies
  const detectedPathologies: CPSSessionEvaluation['detectedPathologies'] = []

  if (fmr < 50) {
    detectedPathologies.push({
      pathology: 'ballistic_action',
      title: 'Ballistic Action (Fire-and-Forget)',
      evidence: 'Fewer than 50% of observable variables were inspected across decision cycles.',
      mitigation:
        'Regularly monitor system feedback before committing irreversible policy resources.',
    })
  }

  if (tfs < 60 && finalState.executedPolicyIds.length >= 3) {
    detectedPathologies.push({
      pathology: 'thematic_vagabonding',
      title: 'Thematic Vagabonding',
      evidence: 'Scattered interventions across disparate domains without following through.',
      mitigation:
        'Define clear polytelic priorities and maintain strategic focus until stabilizing interventions mature.',
    })
  }

  if (seai < 50) {
    detectedPathologies.push({
      pathology: 'repair_service_behavior',
      title: 'Repair Service Mentality',
      evidence:
        'Repeatedly intervened to fix immediate surface symptoms while ignoring 2nd-order cascades.',
      mitigation: 'Map out delayed feedback loops and address root causal engines.',
    })
  }

  return {
    scenarioId: scenario.id,
    cyclesCompleted: finalState.currentCycle - 1,
    controlEfficiency: dce,
    sideEffectAnticipation: seai,
    thematicFocus: tfs,
    feedbackMonitoring: fmr,
    compositeCPSIndex: cpsi,
    tier,
    tierDescription: description,
    detectedPathologies,
    fsrsCardCount: scenario.fsrsItems.length,
  }
}

/**
 * Generate calibrated FSRS-6 spaced repetition cards
 */
export function generateCPSFSRSDeck(
  scenarioId: string,
  evaluation?: CPSSessionEvaluation,
): GeneratedCPSFSRSCard[] {
  const scenario = getMicroWorldScenario(scenarioId) || CANONICAL_CPS_SCENARIOS[0]!
  const cards: GeneratedCPSFSRSCard[] = []

  // Scenario curriculum cards
  scenario.fsrsItems.forEach((item, idx) => {
    cards.push({
      id: `fsrs_cps_${scenario.id}_${idx + 1}`,
      front: `[Micro-World CPS: ${scenario.title}]\n\n${item.question}`,
      back: `${item.answer}\n\n*Rationale & Invariant:* ${item.rationale}`,
      tags: ['cps', scenario.domain, 'dorner-failure-logic', 'micro-world'],
      initialStability: 2.5,
      initialDifficulty: item.difficulty,
    })
  })

  // Dynamic card for detected pathology
  if (evaluation && evaluation.detectedPathologies.length > 0) {
    const p = evaluation.detectedPathologies[0]!
    cards.push({
      id: `fsrs_cps_${scenario.id}_pathology_review`,
      front: `[Dörner Error Pathology Review: ${p.title}]\n\nWhat is this cognitive trap in complex problem solving and how is it mitigated?`,
      back: `**Trap:** ${p.evidence}\n\n**Mitigation Strategy:** ${p.mitigation}\n\n*Canonical Principle:* ${scenario.canonicalFailureMode.remedyPrinciple}`,
      tags: ['cps', scenario.domain, 'pathology-remediation', 'fsrs-6'],
      initialStability: 2.0,
      initialDifficulty: 6,
    })
  }

  return cards
}
