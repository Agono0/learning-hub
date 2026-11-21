/**
 * Complex Problem Solving - Scenario Content (TD-05)
 *
 * This file holds ONLY the canonical micro-world scenario corpora: seeded,
 * multidisciplinary example data (Dörner-style microworlds) used by the CPS
 * engine.
 *
 * Why it lives here: scenario data is CONTENT, not logic. Splitting it out of
 * `complex-problem-solving-engine.ts` keeps the scoring/simulation algorithms
 * reviewable without hundreds of lines of data noise in every diff (TD-05
 * from docs/tech-debt.md). Values were moved verbatim (same names, same
 * values); the engine re-exports `CANONICAL_CPS_SCENARIOS` so every existing
 * import path (`@learning-hub/core/complex-problem-solving` barrel -> engine)
 * keeps working.
 *
 * Data only: no function bodies, no zod schemas, type-only imports.
 */

import type { MicroWorldScenario } from './complex-problem-solving-engine'

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
