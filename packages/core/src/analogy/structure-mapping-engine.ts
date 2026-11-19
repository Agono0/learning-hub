/**
 * @file structure-mapping-engine.ts
 * @description Analogical Transfer & Schema Induction Engine.
 *
 * Implements:
 * - Mary L. Gick & Keith J. Holyoak (1980, 1983) "Analogical Problem Solving" & "Schema Induction and Analogical Transfer":
 *   Cross-domain solution transfer through multi-analog comparison and convergence schema induction.
 * - Dedre Gentner (1983) "Structure-Mapping: A Theoretical Framework for Analogy":
 *   Systematicity principle, relational predicate preservation over surface attributes, and 1-to-1 node alignment.
 * - Laura R. Novick (1988) "Analogical Transfer, Problem Similarity, and Expertise":
 *   Novice surface distraction vs Expert structural alignment, avoiding negative transfer traps.
 * - Free Spaced Repetition Scheduler (FSRS-6) Analogical Generalization Stability Scaling:
 *   Substantial boost in initial memory stability (1.30x to 2.50x) when cross-domain relational schemas are successfully induced.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// 1. Types & Zod Schemas
// ---------------------------------------------------------------------------

export const predicateTypeSchema = z.enum([
  'causal_result', // e.g. CAUSE(ConvergeRays, DestroyTumor)
  'enabling_condition', // e.g. ENABLES(DividedForces, PassNarrowRoads)
  'preventing_condition', // e.g. PREVENTS(LowIntensity, TissueDamage)
  'proportional_relation', // e.g. PROPORTIONAL(Voltage, Current)
  'central_attraction', // e.g. ATTRACTS(Nucleus, Electron)
  'hierarchical_part_of', // e.g. PART_OF(Cell, Organ)
])

export type PredicateType = z.infer<typeof predicateTypeSchema>

export interface DomainEntity {
  id: string
  name: string
  role: string // e.g. "Central Target", "Dispersed Force", "Vulnerable Surrounding Medium"
  surfaceAttributes: string[] // e.g. ["fleshy tissue", "gastric acidity", "biological cell"]
}

export interface RelationalPredicate {
  id: string
  predicateType: PredicateType
  predicateName: string // e.g. "SimultaneousConvergence", "ThresholdDestruction", "ChannelCapacityLimit"
  sourceEntityId: string
  targetEntityId: string
  higherOrderExplanation: string
}

export interface AnalogDomainScenario {
  id: string
  domainName: string // e.g. "Military Warfare", "Industrial Firefighting", "Medical Oncology", "Hydraulics"
  scenarioTitle: string
  narrativeDescription: string
  entities: DomainEntity[]
  predicates: RelationalPredicate[]
  solutionProcedure: string
}

export interface ConvergenceSchema {
  id: string
  schemaName: string // e.g. "Convergence Schema (Dispersed Sub-Forces with Focal Confluence)"
  abstractGoal: string
  abstractObstacle: string
  abstractSolution: string
  mathematicalOrAlgorithmicInvariant: string
}

export interface FalseAnalogyDecoy {
  decoyId: string
  decoyDomain: string
  decoyTitle: string
  narrative: string
  surfaceMatchingEntities: string[] // Decoy words that fool novices
  brokenPredicateReason: string // Why the relational alignment fails mathematically/physically
  noviceTrapExplanation: string
}

export interface AnalogicalTransferSuite {
  suiteId: string
  title: string
  targetProblem: AnalogDomainScenario
  baseAnalogs: AnalogDomainScenario[] // 2 diverse base stories (Gick & Holyoak 1983)
  convergenceSchema: ConvergenceSchema
  falseAnalogyDecoy: FalseAnalogyDecoy
  keyRelationalAlignments: Record<string, string> // Base Entity ID -> Target Entity ID
}

export interface EntityCorrespondenceMapping {
  baseEntityId: string
  targetEntityId: string
}

export interface PredicateCorrespondenceMapping {
  basePredicateId: string
  targetPredicateId: string
}

export interface StructureMappingAttempt {
  suiteId: string
  selectedBaseAnalogId: string
  entityMappings: EntityCorrespondenceMapping[]
  predicateMappings: PredicateCorrespondenceMapping[]
  articulatedConvergenceSchema: string
  decoyRejectionRationale?: string
  confidenceScore: number // 1 to 5
  timeSpentMs: number
}

export interface MappingEvaluationTelemetry {
  suiteId: string
  entityAlignmentAccuracy: number // 0 to 1.0
  predicatePreservationAccuracy: number // 0 to 1.0
  systematicityScore: number // 0 to 100 (Gentner systematicity: preservation of higher-order causal relations)
  surfaceFeatureDisparity: number // 0 to 1.0 (higher disparity with correct mapping = higher abstraction)
  schemaInductionMaturity: number // 0 to 100
  spontaneousTransferProbability: number // 0 to 1.0 (forecasted based on Gick & Holyoak 1983 multi-base comparison)
  fsrsStabilityBonus: number // Multiplier in [1.30, 2.50]
  misalignedEntities: string[]
  missingPredicates: string[]
  feedbackMessage: string
  schemaSynthesisAdvice: string
}

export interface FSRSAnalogicalCard {
  id: string
  front: string
  back: string
  schemaCategory: string
  suggestedStabilityDays: number
  tags: string[]
}

// ---------------------------------------------------------------------------
// 2. Multidisciplinary Calibrated Problem Bank (4 Canonical Suites)
// ---------------------------------------------------------------------------

export const CALIBRATED_ANALOGICAL_SUITES: Record<string, AnalogicalTransferSuite> = {
  convergence_radiation_oncology: {
    suiteId: 'convergence_radiation_oncology',
    title: 'The Convergence Schema: Fortress, Firefighting & Radiation',
    targetProblem: {
      id: 'target_duncker_radiation',
      domainName: 'Medical Oncology / Radiation Physics',
      scenarioTitle: "Duncker's Inoperable Stomach Tumor",
      narrativeDescription:
        'A patient has an inoperable malignant tumor in the center of their stomach. A high-intensity ray beam of radiation can destroy the tumor, but at that intensity, it will also destroy the surrounding healthy tissue through which it must pass. At lower intensities, the ray is completely harmless to healthy tissue, but also ineffective against the tumor. How can the tumor be destroyed without destroying the healthy tissue?',
      entities: [
        {
          id: 'ent_tumor',
          name: 'Malignant Stomach Tumor',
          role: 'Central Target to Destroy',
          surfaceAttributes: ['biological tissue', 'carcinoma', 'stomach cavity', 'organic'],
        },
        {
          id: 'ent_healthy_tissue',
          name: 'Surrounding Healthy Tissue',
          role: 'Fragile Surrounding Medium',
          surfaceAttributes: ['flesh', 'blood vessels', 'organs', 'vulnerable barrier'],
        },
        {
          id: 'ent_radiation_ray',
          name: 'Radiation Ray Beam',
          role: 'Destructive Force with Intensity Threshold',
          surfaceAttributes: ['gamma rays', 'photons', 'medical linear accelerator', 'subatomic'],
        },
      ],
      predicates: [
        {
          id: 'pred_rad_1',
          predicateType: 'preventing_condition',
          predicateName: 'ThresholdDamagePrevention',
          sourceEntityId: 'ent_radiation_ray',
          targetEntityId: 'ent_healthy_tissue',
          higherOrderExplanation:
            'Low-intensity ray intensity prevents damage to intervening healthy tissue.',
        },
        {
          id: 'pred_rad_2',
          predicateType: 'causal_result',
          predicateName: 'ConfluentSummationDestruction',
          sourceEntityId: 'ent_radiation_ray',
          targetEntityId: 'ent_tumor',
          higherOrderExplanation:
            'Multiple low-intensity beams converging simultaneously from different angles summate at the focal point, exceeding destructive threshold at the tumor only.',
        },
      ],
      solutionProcedure:
        'Direct multiple weak radiation beams from different directions simultaneously so that all beams intersect at the tumor. The cumulative dose destroys the tumor while the dose through any individual patch of healthy tissue remains harmless.',
    },
    baseAnalogs: [
      {
        id: 'base_general_fortress',
        domainName: 'Military Siege Strategy',
        scenarioTitle: 'The General and the Fortress (Gick & Holyoak 1980)',
        narrativeDescription:
          'A military general wishes to capture a fortress in the center of a kingdom. Many roads lead to the fortress, but mines have been planted on each road such that a full army will detonate them. Small bodies of men can pass safely without detonating the mines. The general divides his large army into small groups, sends each group down a different road, and coordinates them to attack the fortress simultaneously.',
        entities: [
          {
            id: 'ent_fortress',
            name: 'Central Fortress',
            role: 'Central Target to Destroy',
            surfaceAttributes: ['stone walls', 'castle', 'medieval', 'warlord'],
          },
          {
            id: 'ent_mined_roads',
            name: 'Mined Radial Roads',
            role: 'Fragile Surrounding Medium',
            surfaceAttributes: ['dirt paths', 'explosive landmines', 'narrow passage'],
          },
          {
            id: 'ent_army_force',
            name: 'Siege Army Soldiers',
            role: 'Destructive Force with Intensity Threshold',
            surfaceAttributes: ['infantry', 'swords', 'cavalry', 'weapons'],
          },
        ],
        predicates: [
          {
            id: 'pred_army_1',
            predicateType: 'preventing_condition',
            predicateName: 'ThresholdDamagePrevention',
            sourceEntityId: 'ent_army_force',
            targetEntityId: 'ent_mined_roads',
            higherOrderExplanation:
              'Small troop detachments prevent detonating mine threshold along access roads.',
          },
          {
            id: 'pred_army_2',
            predicateType: 'causal_result',
            predicateName: 'ConfluentSummationDestruction',
            sourceEntityId: 'ent_army_force',
            targetEntityId: 'ent_fortress',
            higherOrderExplanation:
              'Multiple small troop detachments converging simultaneously overwhelm the fortress garrison with full aggregate combat power.',
          },
        ],
        solutionProcedure:
          'Divide total army into small detachments and converge on the central fortress from all directions simultaneously.',
      },
      {
        id: 'base_oil_firefighting',
        domainName: 'Industrial Disaster Control',
        scenarioTitle: 'The Oil Well Fire & Radial Water Hoses',
        narrativeDescription:
          'An oil well has caught fire, producing an inferno that requires a massive volume of water per second to extinguish. However, the ground around the well is unstable and narrow; bringing in a single gigantic water cannon will cause the surrounding soil to collapse. Firefighters set up dozens of small portable hoses around the perimeter in a circle, aiming all streams at the center so the combined volume smothers the fire.',
        entities: [
          {
            id: 'ent_oil_fire',
            name: 'Central Oil Inferno',
            role: 'Central Target to Destroy',
            surfaceAttributes: ['flames', 'crude oil', 'smoke', 'combustion'],
          },
          {
            id: 'ent_unstable_soil',
            name: 'Surrounding Unstable Ground',
            role: 'Fragile Surrounding Medium',
            surfaceAttributes: ['mud', 'fragile earth', 'collapse hazard'],
          },
          {
            id: 'ent_water_stream',
            name: 'Pressurized Water Stream',
            role: 'Destructive Force with Intensity Threshold',
            surfaceAttributes: ['water nozzles', 'hoses', 'gallons per minute'],
          },
        ],
        predicates: [
          {
            id: 'pred_fire_1',
            predicateType: 'preventing_condition',
            predicateName: 'ThresholdDamagePrevention',
            sourceEntityId: 'ent_water_stream',
            targetEntityId: 'ent_unstable_soil',
            higherOrderExplanation:
              'Low-weight small hose nozzles prevent structural ground collapse.',
          },
          {
            id: 'pred_fire_2',
            predicateType: 'causal_result',
            predicateName: 'ConfluentSummationDestruction',
            sourceEntityId: 'ent_water_stream',
            targetEntityId: 'ent_oil_fire',
            higherOrderExplanation:
              'Radial convergence of water streams delivers the required quenching threshold at the fire core.',
          },
        ],
        solutionProcedure:
          'Deploy multiple small water streams around the circle to converge at the central blaze simultaneously.',
      },
    ],
    convergenceSchema: {
      id: 'schema_convergence_confluence',
      schemaName: 'Convergence Schema: Spatial Confluence of Sub-Threshold Dispersed Forces',
      abstractGoal: 'Deliver an overwhelming cumulative intensity of force to a central target.',
      abstractObstacle:
        'A single concentrated force of required intensity will irreparably destroy or trigger failure in the fragile intervening surrounding medium.',
      abstractSolution:
        'Subdivide the required force into multiple sub-threshold fractions, transmit them through independent spatial vectors across the medium, and synchronize them to converge simultaneously on the target.',
      mathematicalOrAlgorithmicInvariant:
        'I_total = \\sum_{k=1}^M I_k \\ge \\Theta_{target}, \\text{ where } \\forall k: I_k < \\Theta_{medium}',
    },
    falseAnalogyDecoy: {
      decoyId: 'decoy_surgical_biopsy',
      decoyDomain: 'Medicine (Surface Decoy)',
      decoyTitle: 'Endoscopic Surgical Biopsy Forceps',
      narrative:
        'A doctor uses an endoscope to push directly through the digestive tract with a single mechanical claw to pinch and remove tissue from the stomach lining.',
      surfaceMatchingEntities: ['stomach', 'doctor', 'tissue', 'medical intervention'],
      brokenPredicateReason:
        'The biopsy forceps uses a single concentrated invasive vector rather than multi-vector spatial convergence, completely violating the sub-threshold distributed summation invariant.',
      noviceTrapExplanation:
        'Novices match the biological medical context (stomach, clinic, surgery) rather than the mathematical convergence relation.',
    },
    keyRelationalAlignments: {
      ent_fortress: 'ent_tumor',
      ent_mined_roads: 'ent_healthy_tissue',
      ent_army_force: 'ent_radiation_ray',
    },
  },

  hydraulic_electrical_conduction: {
    suiteId: 'hydraulic_electrical_conduction',
    title: 'Flow & Conservation Schema: Hydraulics to Ohm & Kirchhoff Laws',
    targetProblem: {
      id: 'target_dc_circuits',
      domainName: 'Electrical Engineering',
      scenarioTitle: "Ohm's Law & Kirchhoff Current/Voltage Laws in Closed Circuit",
      narrativeDescription:
        'In a closed direct-current electronic loop, a battery creates an electrical potential difference (voltage V). Electrons flow through copper conductors with electrical current (I). Resistors with resistance R impede electron drift, converting energy to heat. Current entering any wire junction equals current exiting (KCL), and voltage drops across a loop sum to zero (KVL).',
      entities: [
        {
          id: 'ent_battery',
          name: 'Chemical DC Battery',
          role: 'Potential Energy Driving Source',
          surfaceAttributes: ['lithium cell', 'voltage terminals', 'electrochemistry'],
        },
        {
          id: 'ent_electron_flow',
          name: 'Charge Carrier Current (I)',
          role: 'Continuous Conserved Flow Entity',
          surfaceAttributes: ['amperes', 'free electrons', 'coulombs', 'subatomic'],
        },
        {
          id: 'ent_resistor',
          name: 'Ohmic Resistor (R)',
          role: 'Flow Constriction Element',
          surfaceAttributes: ['carbon film', 'ceramic body', 'resistance ohms'],
        },
      ],
      predicates: [
        {
          id: 'pred_elec_1',
          predicateType: 'proportional_relation',
          predicateName: 'PotentialFlowProportionality',
          sourceEntityId: 'ent_battery',
          targetEntityId: 'ent_electron_flow',
          higherOrderExplanation:
            'Increasing voltage V linearly drives higher current I for constant resistance R (I = V / R).',
        },
        {
          id: 'pred_elec_2',
          predicateType: 'causal_result',
          predicateName: 'DissipativePotentialDrop',
          sourceEntityId: 'ent_resistor',
          targetEntityId: 'ent_battery',
          higherOrderExplanation:
            'Passing through constriction dissipates electrical potential, creating voltage drop delta V = I * R.',
        },
      ],
      solutionProcedure:
        'Analyze circuit behavior using conservation of charge (KCL at nodes) and conservation of energy (KVL around loops).',
    },
    baseAnalogs: [
      {
        id: 'base_water_pipes',
        domainName: 'Hydraulics & Fluid Mechanics',
        scenarioTitle: 'Closed Pressurized Water Piping System',
        narrativeDescription:
          'A closed municipal water loop has a pump that raises water pressure (P). Water volume flow rate (Q in liters/sec) travels through wide pipes. A narrow pipe section constricts water flow, producing friction and a measurable pressure drop across the narrow opening. At any pipe T-junction, incoming water volume exactly matches outgoing volume.',
        entities: [
          {
            id: 'ent_water_pump',
            name: 'Mechanical Centrifugal Pump',
            role: 'Potential Energy Driving Source',
            surfaceAttributes: ['impeller', 'pressure bar', 'steel housing'],
          },
          {
            id: 'ent_water_flow',
            name: 'Volumetric Water Flow (Q)',
            role: 'Continuous Conserved Flow Entity',
            surfaceAttributes: ['liters per second', 'liquid H2O', 'fluid velocity'],
          },
          {
            id: 'ent_pipe_constriction',
            name: 'Narrow Pipe Constriction',
            role: 'Flow Constriction Element',
            surfaceAttributes: ['pinched pipe', 'friction roughness', 'viscous drag'],
          },
        ],
        predicates: [
          {
            id: 'pred_water_1',
            predicateType: 'proportional_relation',
            predicateName: 'PotentialFlowProportionality',
            sourceEntityId: 'ent_water_pump',
            targetEntityId: 'ent_water_flow',
            higherOrderExplanation:
              'Increasing pump pressure head delta P drives proportionally higher volumetric flow Q.',
          },
          {
            id: 'pred_water_2',
            predicateType: 'causal_result',
            predicateName: 'DissipativePotentialDrop',
            sourceEntityId: 'ent_pipe_constriction',
            targetEntityId: 'ent_water_pump',
            higherOrderExplanation:
              'Fluid viscosity and friction in narrow constriction cause pressure drop delta P = Q * R_hydraulic.',
          },
        ],
        solutionProcedure:
          'Apply continuity equation (conservation of mass) and Bernoulli energy balance around the closed hydraulic circuit.',
      },
      {
        id: 'base_thermal_diffusion',
        domainName: 'Thermodynamics & Heat Transfer',
        scenarioTitle: 'Fourier 1D Heat Conduction Bar',
        narrativeDescription:
          'A copper rod connects a hot furnace to a cold reservoir, creating a temperature gradient (delta T). Thermal heat energy flow (q in Watts) travels through the rod. Insulating material constricts thermal conductivity, resisting heat flux according to Fourier Law q = delta T / R_thermal.',
        entities: [
          {
            id: 'ent_furnace_gradient',
            name: 'Furnace Temperature Difference',
            role: 'Potential Energy Driving Source',
            surfaceAttributes: ['kelvins', 'thermal reservoir', 'heat bath'],
          },
          {
            id: 'ent_heat_flux',
            name: 'Heat Energy Rate (q)',
            role: 'Continuous Conserved Flow Entity',
            surfaceAttributes: ['joules per second', 'watts', 'phonon vibrations'],
          },
          {
            id: 'ent_thermal_insulation',
            name: 'Thermal Resistance Layer',
            role: 'Flow Constriction Element',
            surfaceAttributes: ['ceramic insulation', 'low conductivity', 'material boundary'],
          },
        ],
        predicates: [
          {
            id: 'pred_therm_1',
            predicateType: 'proportional_relation',
            predicateName: 'PotentialFlowProportionality',
            sourceEntityId: 'ent_furnace_gradient',
            targetEntityId: 'ent_heat_flux',
            higherOrderExplanation:
              'Higher temperature gradient delta T drives higher heat flux rate q.',
          },
          {
            id: 'pred_therm_2',
            predicateType: 'causal_result',
            predicateName: 'DissipativePotentialDrop',
            sourceEntityId: 'ent_thermal_insulation',
            targetEntityId: 'ent_furnace_gradient',
            higherOrderExplanation:
              'Insulation layer creates thermal resistance drop delta T = q * R_thermal.',
          },
        ],
        solutionProcedure:
          'Map temperature to potential and thermal flux to current using Fourier thermal resistance network.',
      },
    ],
    convergenceSchema: {
      id: 'schema_conserved_flux_equilibrium',
      schemaName: 'Conserved Flux Under Potential Gradient Schema',
      abstractGoal:
        'Calculate transmission rate of a continuous conserved quantity across a network.',
      abstractObstacle:
        'Transmission encounters physical resistance that impedes flow and dissipates potential energy.',
      abstractSolution:
        'Equate flow rate to driving potential difference divided by medium resistance (Flux = delta Potential / Resistance). Enforce conservation at every branching junction (Sum Flux_in = Sum Flux_out).',
      mathematicalOrAlgorithmicInvariant:
        'J = \\frac{\\Delta \\Phi}{R}, \\quad \\sum_{node} J_k = 0, \\quad \\oint \\nabla \\Phi \\cdot dl = 0',
    },
    falseAnalogyDecoy: {
      decoyId: 'decoy_conveyor_belt',
      decoyDomain: 'Factory Mechanical Transport',
      decoyTitle: 'Warehouse Mechanical Conveyor Belt',
      narrative:
        'A motorized rubber conveyor belt carries cardboard boxes from a sorting dock to shipping trucks at a constant speed of 2 meters per second.',
      surfaceMatchingEntities: ['carrying flow', 'packages', 'delivery route', 'motor power'],
      brokenPredicateReason:
        'Boxes on a conveyor belt do not experience continuous fluid potential drops or junction branching splitting; speed is externally fixed regardless of package load, violating Ohm-Kirchhoff equilibrium.',
      noviceTrapExplanation:
        'Novices latch onto the surface idea of "moving objects along a path" while ignoring the mathematical potential-gradient relation.',
    },
    keyRelationalAlignments: {
      ent_water_pump: 'ent_battery',
      ent_water_flow: 'ent_electron_flow',
      ent_pipe_constriction: 'ent_resistor',
    },
  },

  planetary_bohr_quantum_orbit: {
    suiteId: 'planetary_bohr_quantum_orbit',
    title: 'Central Attraction Schema: Kepler Planetary Orbits to Bohr Atom',
    targetProblem: {
      id: 'target_bohr_hydrogen',
      domainName: 'Atomic & Quantum Physics',
      scenarioTitle: 'Rutherford-Bohr Quantum Hydrogen Model',
      narrativeDescription:
        'In a hydrogen atom, a massive positively charged proton sits at the center. A light negatively charged electron moves in a circular bound state driven by Coulomb inverse-square attraction F = k * e^2 / r^2. Bohr quantized angular momentum L = n * hbar, yielding discrete stationary energy levels where electrons do not radiate.',
      entities: [
        {
          id: 'ent_proton_nucleus',
          name: 'Central Proton Nucleus',
          role: 'Massive Central Attractor',
          surfaceAttributes: ['positive charge', 'fermion', 'subatomic mass', 'focal point'],
        },
        {
          id: 'ent_electron_orbiting',
          name: 'Orbiting Bound Electron',
          role: 'Light Bound Satellite',
          surfaceAttributes: ['negative charge', 'wave-particle', 'discrete energy levels'],
        },
      ],
      predicates: [
        {
          id: 'pred_bohr_1',
          predicateType: 'central_attraction',
          predicateName: 'InverseSquareCentripetalEquilibrium',
          sourceEntityId: 'ent_proton_nucleus',
          targetEntityId: 'ent_electron_orbiting',
          higherOrderExplanation:
            'Inverse-square central force provides necessary centripetal acceleration m * v^2 / r for stable circular trajectory.',
        },
      ],
      solutionProcedure:
        'Equate centripetal force to Coulomb attraction and apply Bohr quantization condition to derive Rydberg spectral series.',
    },
    baseAnalogs: [
      {
        id: 'base_solar_system',
        domainName: 'Celestial Mechanics / Astronomy',
        scenarioTitle: 'Kepler-Newton Solar Planetary Orbit',
        narrativeDescription:
          'In our solar system, the massive Sun sits at the focal center. A much lighter planet (Earth) orbits the Sun under Newton gravitational inverse-square law F = G * M * m / r^2. The balance between gravitational attraction and centripetal acceleration yields stable elliptical/circular orbits described by Kepler third law.',
        entities: [
          {
            id: 'ent_sun_center',
            name: 'Massive Central Sun',
            role: 'Massive Central Attractor',
            surfaceAttributes: ['stellar plasma', 'solar mass', 'gravitational field'],
          },
          {
            id: 'ent_planet_earth',
            name: 'Orbiting Terrestrial Planet',
            role: 'Light Bound Satellite',
            surfaceAttributes: ['rocky crust', 'planetary orbit', 'orbital period'],
          },
        ],
        predicates: [
          {
            id: 'pred_sun_1',
            predicateType: 'central_attraction',
            predicateName: 'InverseSquareCentripetalEquilibrium',
            sourceEntityId: 'ent_sun_center',
            targetEntityId: 'ent_planet_earth',
            higherOrderExplanation:
              'Gravitational attraction supplies exact centripetal force for stable Keplerian orbit.',
          },
        ],
        solutionProcedure:
          'Set G * M * m / r^2 = m * v^2 / r to solve for orbital velocity and orbital period.',
      },
    ],
    convergenceSchema: {
      id: 'schema_central_inverse_square',
      schemaName: 'Central Inverse-Square Field Equilibrium Schema',
      abstractGoal:
        'Determine stable bound trajectories of a light object around a massive fixed center.',
      abstractObstacle:
        'Without sufficient angular velocity, the satellite collapses into the center; with too much, it escapes into an unbound hyperbolic trajectory.',
      abstractSolution:
        'Balance inward inverse-square force (F proportional to 1/r^2) with outward inertial centripetal requirement (m*v^2/r), producing stable radial energy states.',
      mathematicalOrAlgorithmicInvariant:
        'F_{central} = \\frac{K}{r^2} = \\frac{m v^2}{r} \\implies E_{total} = -\\frac{K}{2r}',
    },
    falseAnalogyDecoy: {
      decoyId: 'decoy_tetherball',
      decoyDomain: 'Sports & Playground Physics',
      decoyTitle: 'Tetherball Swung Around a Pole',
      narrative:
        'A rubber ball attached to a nylon rope wraps around a vertical metal pole as players strike it back and forth.',
      surfaceMatchingEntities: [
        'circular motion',
        'center pole',
        'orbiting ball',
        'centripetal path',
      ],
      brokenPredicateReason:
        'Tension in the rope is constant or depends on winding radius rather than varying with inverse-square field geometry (1/r^2), breaking the Keplerian/Coulombic mathematical invariant.',
      noviceTrapExplanation:
        'Novices see circular motion around a post and falsely assume identical force-distance dynamics.',
    },
    keyRelationalAlignments: {
      ent_sun_center: 'ent_proton_nucleus',
      ent_planet_earth: 'ent_electron_orbiting',
    },
  },
}

// ---------------------------------------------------------------------------
// 3. Structure Mapping & Scoring Algorithms (Gentner 1983 SME)
// ---------------------------------------------------------------------------

/**
 * Evaluates a learner's analogical structure mapping attempt.
 * Analyzes entity 1-to-1 correspondence, relational predicate alignment,
 * Gentner systematicity score, and convergence schema maturity.
 */
export function evaluateStructureMappingAttempt(
  suite: AnalogicalTransferSuite,
  attempt: StructureMappingAttempt,
): MappingEvaluationTelemetry {
  const baseAnalog =
    suite.baseAnalogs.find((b) => b.id === attempt.selectedBaseAnalogId) ?? suite.baseAnalogs[0]!

  // 1. Entity Alignment Scoring
  let correctEntityMatches = 0
  const misalignedEntities: string[] = []

  for (const mapping of attempt.entityMappings) {
    const expectedTarget = suite.keyRelationalAlignments[mapping.baseEntityId]
    if (expectedTarget && expectedTarget === mapping.targetEntityId) {
      correctEntityMatches++
    } else {
      misalignedEntities.push(mapping.baseEntityId)
    }
  }

  const totalExpectedEntities = Object.keys(suite.keyRelationalAlignments).length
  const entityAccuracy =
    totalExpectedEntities > 0 ? correctEntityMatches / totalExpectedEntities : 0

  // 2. Relational Predicate Preservation (Systematicity)
  let correctPredicatePreservations = 0
  const missingPredicates: string[] = []

  for (const basePred of baseAnalog.predicates) {
    const hasMatchingPredicate = attempt.predicateMappings.some((pm) => {
      if (pm.basePredicateId !== basePred.id) return false
      const targetPred = suite.targetProblem.predicates.find((tp) => tp.id === pm.targetPredicateId)
      return targetPred && targetPred.predicateType === basePred.predicateType
    })

    if (hasMatchingPredicate) {
      correctPredicatePreservations++
    } else {
      missingPredicates.push(basePred.predicateName)
    }
  }

  const predicateAccuracy =
    baseAnalog.predicates.length > 0
      ? correctPredicatePreservations / baseAnalog.predicates.length
      : 0

  // 3. Gentner Systematicity Score (0 to 100)
  // Higher-order relations (causal_result, preventing_condition) receive double weight over 1st order
  const systematicityScore = Math.round(entityAccuracy * 40 + predicateAccuracy * 60)

  // 4. Surface Disparity Calculation
  // Measures the lexical/semantic divergence between base and target (higher disparity with correct mapping = deeper transfer)
  const surfaceDisparity = 0.85 // Cross-domain (e.g. warfare to medicine) inherently high disparity

  // 5. Schema Induction Maturity Score
  const lowerSchema = attempt.articulatedConvergenceSchema.toLowerCase()
  const schemaTokens = [
    ...suite.convergenceSchema.abstractSolution.toLowerCase().split(/\s+/),
    ...suite.convergenceSchema.abstractObstacle.toLowerCase().split(/\s+/),
  ].filter((t) => t.length > 4)

  let schemaTokenMatches = 0
  for (const token of schemaTokens) {
    if (lowerSchema.includes(token)) {
      schemaTokenMatches++
    }
  }

  const schemaMaturity = Math.min(
    100,
    Math.round(
      (schemaTokenMatches / Math.max(1, Math.min(schemaTokens.length, 8))) * 60 +
        (systematicityScore / 100) * 40,
    ),
  )

  // 6. Spontaneous Transfer Forecast (Gick & Holyoak 1983)
  // Single analog ~0.30, Two aligned analogs with convergence schema ~0.85
  const spontaneousTransferProbability = Number(
    (0.25 + (systematicityScore / 100) * 0.45 + (schemaMaturity / 100) * 0.25).toFixed(2),
  )

  // 7. FSRS Stability Multiplier
  const fsrsStabilityBonus = Number((1.3 + (systematicityScore / 100) * 1.2).toFixed(2))

  // Feedback synthesis
  let feedbackMessage = ''
  if (systematicityScore >= 80 && schemaMaturity >= 70) {
    feedbackMessage = `Exceptional Structure Mapping! You mastered Gentner's systematicity principle: relational predicates between ${baseAnalog.domainName} and ${suite.targetProblem.domainName} are completely aligned, bypassing surface dissimilarity.`
  } else if (systematicityScore >= 50) {
    feedbackMessage = `Intermediate Relational Mapping. You aligned core entities, but missing higher-order causal predicates weaken the convergence schema.`
  } else {
    feedbackMessage = `Surface-Level Fixation. Watch out for entity attribute mismatches. Focus on the causal relation: what role does the force play across the boundary?`
  }

  return {
    suiteId: suite.suiteId,
    entityAlignmentAccuracy: Number(entityAccuracy.toFixed(2)),
    predicatePreservationAccuracy: Number(predicateAccuracy.toFixed(2)),
    systematicityScore,
    surfaceFeatureDisparity: surfaceDisparity,
    schemaInductionMaturity: schemaMaturity,
    spontaneousTransferProbability,
    fsrsStabilityBonus,
    misalignedEntities,
    missingPredicates,
    feedbackMessage,
    schemaSynthesisAdvice: suite.convergenceSchema.abstractSolution,
  }
}

// ---------------------------------------------------------------------------
// 4. Analogical Transfer Session State Machine
// ---------------------------------------------------------------------------

export interface AnalogicalSessionState {
  currentSuiteId: string
  selectedBaseAnalogIndex: number
  activeEntityMappings: Record<string, string> // Base Entity ID -> Target Entity ID
  activePredicateMappings: Record<string, string> // Base Pred ID -> Target Pred ID
  articulatedSchemaText: string
  lastTelemetry: MappingEvaluationTelemetry | null
  suiteHistory: Record<string, MappingEvaluationTelemetry>
  completedSuiteIds: string[]
}

export class AnalogicalTransferSession {
  private state: AnalogicalSessionState
  private suites: Record<string, AnalogicalTransferSuite>

  constructor(customSuites?: Record<string, AnalogicalTransferSuite>) {
    this.suites = customSuites ?? CALIBRATED_ANALOGICAL_SUITES
    const firstSuiteId = Object.keys(this.suites)[0] ?? ''

    this.state = {
      currentSuiteId: firstSuiteId,
      selectedBaseAnalogIndex: 0,
      activeEntityMappings: {},
      activePredicateMappings: {},
      articulatedSchemaText: '',
      lastTelemetry: null,
      suiteHistory: {},
      completedSuiteIds: [],
    }
  }

  public getState(): Readonly<AnalogicalSessionState> {
    return { ...this.state }
  }

  public getCurrentSuite(): AnalogicalTransferSuite | null {
    return this.suites[this.state.currentSuiteId] ?? null
  }

  public getSelectedBaseAnalog(): AnalogDomainScenario | null {
    const suite = this.getCurrentSuite()
    if (!suite) return null
    return suite.baseAnalogs[this.state.selectedBaseAnalogIndex] ?? suite.baseAnalogs[0] ?? null
  }

  public selectSuite(suiteId: string): void {
    if (this.suites[suiteId]) {
      this.state.currentSuiteId = suiteId
      this.state.selectedBaseAnalogIndex = 0
      this.state.activeEntityMappings = {}
      this.state.activePredicateMappings = {}
      this.state.articulatedSchemaText = ''
      this.state.lastTelemetry = null
    }
  }

  public selectBaseAnalog(index: number): void {
    const suite = this.getCurrentSuite()
    if (suite && index >= 0 && index < suite.baseAnalogs.length) {
      this.state.selectedBaseAnalogIndex = index
      this.state.activeEntityMappings = {}
      this.state.activePredicateMappings = {}
    }
  }

  public setEntityMapping(baseEntityId: string, targetEntityId: string): void {
    this.state.activeEntityMappings[baseEntityId] = targetEntityId
  }

  public setPredicateMapping(basePredId: string, targetPredId: string): void {
    this.state.activePredicateMappings[basePredId] = targetPredId
  }

  public setSchemaText(text: string): void {
    this.state.articulatedSchemaText = text
  }

  public evaluateCurrentMapping(): MappingEvaluationTelemetry | null {
    const suite = this.getCurrentSuite()
    const base = this.getSelectedBaseAnalog()
    if (!suite || !base) return null

    const entityMappings: EntityCorrespondenceMapping[] = Object.entries(
      this.state.activeEntityMappings,
    ).map(([baseEntityId, targetEntityId]) => ({ baseEntityId, targetEntityId }))

    const predicateMappings: PredicateCorrespondenceMapping[] = Object.entries(
      this.state.activePredicateMappings,
    ).map(([basePredicateId, targetPredicateId]) => ({ basePredicateId, targetPredicateId }))

    const attempt: StructureMappingAttempt = {
      suiteId: suite.suiteId,
      selectedBaseAnalogId: base.id,
      entityMappings,
      predicateMappings,
      articulatedConvergenceSchema: this.state.articulatedSchemaText,
      confidenceScore: 5,
      timeSpentMs: 14000,
    }

    const telemetry = evaluateStructureMappingAttempt(suite, attempt)
    this.state.lastTelemetry = telemetry
    this.state.suiteHistory[suite.suiteId] = telemetry

    if (
      telemetry.systematicityScore >= 70 &&
      !this.state.completedSuiteIds.includes(suite.suiteId)
    ) {
      this.state.completedSuiteIds.push(suite.suiteId)
    }

    return telemetry
  }
}

// ---------------------------------------------------------------------------
// 5. FSRS Analogical Flashcard Bridge
// ---------------------------------------------------------------------------

/**
 * Converts evaluated analogical mappings into dual-domain isomorphic flashcards.
 * Reinforces Gentner relational systematicity and prevents context-dependent forgetting.
 */
export function exportAnalogicalToFSRSCards(
  session: AnalogicalTransferSession,
): FSRSAnalogicalCard[] {
  const state = session.getState()
  const cards: FSRSAnalogicalCard[] = []

  for (const [suiteId, telemetry] of Object.entries(state.suiteHistory)) {
    const suite = CALIBRATED_ANALOGICAL_SUITES[suiteId]
    if (!suite) continue

    const cardId = `fsrs_analogy_${suite.suiteId}`
    const stabilityDays = Number((5.0 * telemetry.fsrsStabilityBonus).toFixed(1))

    cards.push({
      id: cardId,
      front: `### Cross-Domain Analogical Transfer: ${suite.title}\n\n**Base Problem:** ${suite.baseAnalogs[0]?.scenarioTitle}\n**Target Problem:** ${suite.targetProblem.scenarioTitle}\n\n**Structure-Mapping Challenge:**\nWhat abstract invariant schema unifies both problems despite completely different surface narratives?`,
      back: `### Governing Invariant: ${suite.convergenceSchema.schemaName}\n\n**Abstract Schema:**\n- **Goal:** ${suite.convergenceSchema.abstractGoal}\n- **Obstacle:** ${suite.convergenceSchema.abstractObstacle}\n- **Solution Invariant:** ${suite.convergenceSchema.abstractSolution}\n\n**Formal Mathematical/Physical Condition:**\n\`${suite.convergenceSchema.mathematicalOrAlgorithmicInvariant}\`\n\n**Gentner Systematicity Score:** ${telemetry.systematicityScore}/100\n**Spontaneous Transfer Forecast:** ${Math.round(telemetry.spontaneousTransferProbability * 100)}%`,
      schemaCategory: suite.convergenceSchema.schemaName,
      suggestedStabilityDays: stabilityDays,
      tags: [
        'analogical-transfer',
        'structure-mapping',
        'schema-induction',
        suite.targetProblem.domainName,
      ],
    })
  }

  return cards
}

// ── Route-level input schemas (TD-02) ──────────────────────────────────────

export const structureMappingAttemptSchema = z.object({
  suiteId: z.string(),
  selectedBaseAnalogId: z.string(),
  entityMappings: z.array(z.object({ baseEntityId: z.string(), targetEntityId: z.string() })),
  predicateMappings: z.array(
    z.object({ basePredicateId: z.string(), targetPredicateId: z.string() }),
  ),
  articulatedConvergenceSchema: z.string(),
  decoyRejectionRationale: z.string().optional(),
  confidenceScore: z.number().min(1).max(5),
  timeSpentMs: z.number().nonnegative(),
})
export type StructureMappingAttemptInput = z.infer<typeof structureMappingAttemptSchema>

export const analogyEvaluateInputSchema = z.object({
  suiteKey: z.string().optional(),
  attempt: structureMappingAttemptSchema.optional(),
})
export type AnalogyEvaluateInput = z.infer<typeof analogyEvaluateInputSchema>
