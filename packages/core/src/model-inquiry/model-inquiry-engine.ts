/**
 * Model-Based Scientific Inquiry & Gedankenexperiment (Mental Simulation) Engine
 *
 * Grounded in:
 * - John Clement (2008). Creative Model Construction in Scientists and Students:
 *   The Role of Imagery, Analogy, and Mental Simulation. Springer.
 * - Nancy J. Nersessian (2002). The Cognitive Basis of Model-based Reasoning in Science.
 * - Nancy J. Nersessian (2008). Creating Scientific Concepts. MIT Press.
 * - Philip N. Johnson-Laird (1983). Mental Models: Towards a Cognitive Science of
 *   Language, Inference, and Consciousness. Harvard University Press.
 * - Michelene T. H. Chi & Ruth Wylie (2014). The ICAP Framework: Linking Cognitive
 *   Engagement to Active Learning Outcomes. Educational Psychologist.
 *
 * Key Theoretical Constructs:
 * 1. Model Construction Cycle: Initial Mental Model (M_0) -> Extreme Case Perturbation (EC) ->
 *    Dynamic Simulative Animation (SAF) -> Contradiction Crucible -> Bridging Analogy (BA) ->
 *    Revised Explanatory Model (M_{k+1}).
 * 2. Gedankenexperimente (Thought Experiments): Mental simulation of idealized, boundary-condition
 *    scenarios to reveal internal contradictions in folk models or deducing emergent laws.
 * 3. Extreme Cases: Perturbing system parameters to mathematical/physical limits (m -> 0,
 *    v -> c, T -> 0, friction -> 0) to expose structural invariance and isolate causal mechanisms.
 * 4. Bridging Analogies: Constructing intermediate structural analogs that connect an anchored
 *    intuitive scenario with an otherwise counter-intuitive target domain.
 * 5. Quantitative Telemetry:
 *    - Extreme Case Diagnostic Index (ECDI in [0, 100])
 *    - Simulative Animation Fidelity (SAF in [0, 100])
 *    - Bridging Analogy Score (BAS in [0, 100])
 *    - Model Modification Score (MMS in [0, 100])
 *    - Composite Model-Based Reasoning Index (MBRI in [0, 100])
 *    - 4 Cognitive Maturity Tiers (folk_intuition -> gedanken_theorist)
 * 6. Calibrated FSRS-6 Review Deck Generation.
 */

import { z } from 'zod'

// ============================================================================
// 1. Zod Schemas & Types
// ============================================================================

export const GedankenDomainSchema = z.enum([
  'classical_mechanics',
  'thermodynamics',
  'relativity_modern_physics',
  'evolutionary_biology',
  'computational_logic',
])
export type GedankenDomain = z.infer<typeof GedankenDomainSchema>

export const ModelMaturityTierSchema = z.enum([
  'folk_intuition',
  'qualitative_mechanist',
  'perturbation_analyst',
  'gedanken_theorist',
])
export type ModelMaturityTier = z.infer<typeof ModelMaturityTierSchema>

export const ExtremeCaseVariableSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: z.string(),
  baselineValue: z.string(),
  extremeLimit: z.string(),
  intuitiveExpectation: z.string(),
  paradoxicalOutcome: z.string(),
  scientificExplanation: z.string(),
})
export type ExtremeCaseVariable = z.infer<typeof ExtremeCaseVariableSchema>

export const SimulativeStepSchema = z.object({
  id: z.string(),
  stepOrder: z.number(),
  action: z.string(),
  causalMechanism: z.string(),
  expectedObservation: z.string(),
  revealedContradiction: z.string().optional(),
})
export type SimulativeStep = z.infer<typeof SimulativeStepSchema>

export const BridgingAnalogySchema = z.object({
  id: z.string(),
  anchorIntuition: z.string(),
  intermediateBridge: z.string(),
  targetSystem: z.string(),
  sharedCausalStructure: z.string(),
  resolvingInsight: z.string(),
})
export type BridgingAnalogy = z.infer<typeof BridgingAnalogySchema>

export const FSRSCardTemplateSchema = z.object({
  question: z.string(),
  answer: z.string(),
  rationale: z.string(),
  difficulty: z.number().min(1).max(10),
})
export type FSRSCardTemplate = z.infer<typeof FSRSCardTemplateSchema>

export const GedankenScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: GedankenDomainSchema,
  historicalOrigin: z.string(),
  targetPhenomenon: z.string(),
  folkConception: z.string(),
  initialModelAssumptions: z.array(z.string()),
  extremeCases: z.array(ExtremeCaseVariableSchema),
  simulativeSteps: z.array(SimulativeStepSchema),
  bridgingAnalogies: z.array(BridgingAnalogySchema),
  canonicalResolution: z.object({
    title: z.string(),
    mechanism: z.string(),
    keyPrinciples: z.array(z.string()),
  }),
  reflectionPrompts: z.array(z.string()),
  fsrsItems: z.array(FSRSCardTemplateSchema),
})
export type GedankenScenario = z.infer<typeof GedankenScenarioSchema>

export const InquirySessionInputSchema = z.object({
  scenarioId: z.string(),
  initialModelNotes: z.string().optional(),
  selectedExtremeCaseIds: z.array(z.string()).optional().default([]),
  extremeCasePredictions: z.record(z.string(), z.string()).optional().default({}),
  simulativeStepOrder: z.array(z.string()).optional().default([]),
  identifiedContradictions: z.array(z.string()).optional().default([]),
  selectedBridgingId: z.string().optional(),
  bridgingExplanation: z.string().optional(),
  revisedModelHypothesis: z.string().optional(),
})
export type InquirySessionInput = {
  scenarioId: string
  initialModelNotes?: string
  selectedExtremeCaseIds?: string[]
  extremeCasePredictions?: Record<string, string>
  simulativeStepOrder?: string[]
  identifiedContradictions?: string[]
  selectedBridgingId?: string
  bridgingExplanation?: string
  revisedModelHypothesis?: string
}

export const InquiryEvaluationSchema = z.object({
  scenarioId: z.string(),
  extremeCaseScore: z.number().min(0).max(100),
  animationFidelityScore: z.number().min(0).max(100),
  bridgingAnalogyScore: z.number().min(0).max(100),
  modelModificationScore: z.number().min(0).max(100),
  compositeIndex: z.number().min(0).max(100),
  tier: ModelMaturityTierSchema,
  tierDescription: z.string(),
  feedback: z.object({
    strengths: z.array(z.string()),
    blindspots: z.array(z.string()),
    recommendations: z.array(z.string()),
  }),
  fsrsCardCount: z.number().nonnegative(),
})
export type InquiryEvaluation = z.infer<typeof InquiryEvaluationSchema>

export const GeneratedFSRSCardSchema = z.object({
  id: z.string(),
  front: z.string(),
  back: z.string(),
  tags: z.array(z.string()),
  initialStability: z.number(),
  initialDifficulty: z.number(),
})
export type GeneratedFSRSCard = z.infer<typeof GeneratedFSRSCardSchema>

// ============================================================================
// 2. Canonical Gedankenexperiment Scenarios (5 Multidisciplinary Paradigms)
// ============================================================================

export const GEDANKEN_SCENARIOS: GedankenScenario[] = [
  {
    id: 'galileo_falling_bodies',
    title: "Galileo's Leaning Tower & Tied Masses: Gravity Independence",
    domain: 'classical_mechanics',
    historicalOrigin:
      "Galileo Galilei (1638), 'Discorsi e dimostrazioni matematiche intorno a due nuove scienze'",
    targetPhenomenon:
      'Gravitational acceleration in free fall is invariant with respect to object mass (a = g)',
    folkConception:
      'Heavier objects fall intrinsically faster than lighter objects in proportion to their mass (Aristotle: v ~ m)',
    initialModelAssumptions: [
      'Earth exerts a downward pulling tendency proportional to the weight of the object',
      'An 8 kg cannonball possesses 4x the natural downward speed of a 2 kg wooden sphere',
      'Combining two bodies produces a composite whose motion is dictated by the interaction of their natural speeds',
    ],
    extremeCases: [
      {
        id: 'ec_feather_cannonball',
        name: 'Feather Tied to 100 kg Cannonball',
        unit: 'mass ratio (m1/m2)',
        baselineValue: '2 kg / 8 kg (1:4 ratio)',
        extremeLimit: '0.001 kg / 100 kg (1:100,000 ratio)',
        intuitiveExpectation:
          'The light feather acts like a parachute, slowing the heavy cannonball down noticeably',
        paradoxicalOutcome:
          'In vacuum, the taut string exerts zero drag; composite falls at the exact same rate as cannonball alone',
        scientificExplanation:
          'Gravitational mass (source of force) equals inertial mass (resistance to acceleration); F/m = g is constant.',
      },
      {
        id: 'ec_split_identical_halves',
        name: 'Bisecting an 8 kg Sphere into Two 4 kg Hemispheres',
        unit: 'spatial separation (delta x)',
        baselineValue: 'Unified single solid sphere',
        extremeLimit: 'Infinite proximity without atomic contact (delta x -> 0)',
        intuitiveExpectation:
          'Unified sphere falls at 8 kg speed; severed hemispheres suddenly fall at half speed',
        paradoxicalOutcome:
          'Two adjacent identical hemispheres fall identically whether joined by a molecule or separated by 0.1 mm',
        scientificExplanation:
          'An object cannot know whether it is single or composite; speed cannot depend on arbitrary boundary labels.',
      },
      {
        id: 'ec_vacuum_medium',
        name: 'Atmospheric Density to Zero Limit',
        unit: 'air density rho (kg/m^3)',
        baselineValue: '1.225 kg/m^3 (sea-level atmosphere)',
        extremeLimit: '0 kg/m^3 (perfect interstellar vacuum)',
        intuitiveExpectation:
          'Objects still experience different natural speeds due to intrinsic weight difference',
        paradoxicalOutcome:
          'Hammer and feather hit the lunar surface at the exact same instant (Apollo 15 proof)',
        scientificExplanation:
          'Differential fall speeds observed in daily life are purely hydrodynamic aerodynamic drag, not gravitational variance.',
      },
    ],
    simulativeSteps: [
      {
        id: 'step_drop_isolated',
        stepOrder: 1,
        action:
          'Mentally release an isolated 8 kg heavy sphere and 2 kg light sphere from tower height h simultaneously',
        causalMechanism:
          'Aristotelian folk physics posits heavier bodies strive toward the center of Earth faster',
        expectedObservation: 'Heavy ball accelerates rapidly; light ball lags far behind',
      },
      {
        id: 'step_connect_cord',
        stepOrder: 2,
        action: 'Connect the 8 kg heavy ball and 2 kg light ball with a short, taut, massless cord',
        causalMechanism: 'Forming a unified composite system with total physical mass of 10 kg',
        expectedObservation:
          'The two bodies are now physically constrained to fall with a single shared velocity',
      },
      {
        id: 'step_deduction_drag',
        stepOrder: 3,
        action:
          'Run Aristotelian Deduction Branch A: Light body lags and exerts upward tension on the string',
        causalMechanism:
          'Since the 2 kg body falls slower, it acts as a retardant drag on the 8 kg body',
        expectedObservation:
          'The composite system (8 kg + 2 kg) must fall slower than the 8 kg body alone (v_composite < v_8)',
        revealedContradiction: 'Branch A concludes composite fall speed is LESS than 8 kg alone',
      },
      {
        id: 'step_deduction_combined_mass',
        stepOrder: 4,
        action:
          'Run Aristotelian Deduction Branch B: Total combined mass of composite is 10 kg > 8 kg',
        causalMechanism:
          'Since heavier bodies fall faster, a 10 kg mass must fall faster than an 8 kg mass',
        expectedObservation:
          'The composite system must fall faster than the 8 kg body alone (v_composite > v_8)',
        revealedContradiction: 'Branch B concludes composite fall speed is GREATER than 8 kg alone',
      },
      {
        id: 'step_contradiction_crucible',
        stepOrder: 5,
        action: 'Evaluate Branch A and Branch B simultaneously in mental simulation',
        causalMechanism: 'Direct logical confrontation of v_composite < v_8 AND v_composite > v_8',
        expectedObservation:
          'A logical impossibility; the initial premise that heavier objects fall faster is completely falsified',
        revealedContradiction:
          'v_composite cannot be simultaneously strictly greater than and strictly less than v_8',
      },
    ],
    bridgingAnalogies: [
      {
        id: 'bridge_twin_halves',
        anchorIntuition:
          'Two identical 4 kg bricks dropped side-by-side fall at identical rates without pulling or pushing each other',
        intermediateBridge:
          'Tying the two 4 kg bricks with a loose thread; does the thread suddenly alter their fall rate?',
        targetSystem:
          'A single solid 8 kg block (welded halves); internal atomic bonds are merely microscopic threads',
        sharedCausalStructure:
          'Symmetric mass distribution experiencing identical gravitational field acceleration',
        resolvingInsight:
          'Mass scales gravitational force and inertia identically: F = m*g, a = F/m = g.',
      },
      {
        id: 'bridge_fluid_drag_subtraction',
        anchorIntuition:
          'A pebble sinks fast in honey; a styrofoam ball floats; difference stems from buoyant fluid resistance',
        intermediateBridge:
          'Progressively thinning the fluid medium: honey -> water -> air -> vacuum',
        targetSystem: 'Free fall in vacuum where medium resistance is strictly zero',
        sharedCausalStructure:
          'Drag force F_d = 0.5 * rho * v^2 * C_d * A vanishes as medium density rho -> 0',
        resolvingInsight:
          'Aristotelian speeds reflected terminal velocity in viscous fluids, not fundamental gravitational laws.',
      },
    ],
    canonicalResolution: {
      title: 'Galilean Equivalence & Universal Gravitational Acceleration',
      mechanism:
        'All masses experience identical gravitational acceleration g = 9.81 m/s^2 near Earth surface because inertial mass exactly equals gravitational mass.',
      keyPrinciples: [
        'Equivalence of inertial mass (resistance to acceleration) and gravitational mass (coupling to gravity)',
        'Gravitational acceleration a = F_g / m = (G * M_Earth / r^2), entirely independent of falling object mass',
        'Visible disparities in daily life arise solely from aerodynamic drag and buoyant forces in the medium',
      ],
    },
    reflectionPrompts: [
      'Why did Aristotle and centuries of scholars fail to notice this contradiction until Galileo formulated the tied-body thought experiment?',
      'How does pushing a parameter to an extreme case (e.g. Mass ratio 1:1,000,000 or density -> 0) reveal hidden structural assumptions?',
      'What is the difference between an empirical laboratory experiment and an imaginary Gedankenexperiment in science?',
    ],
    fsrsItems: [
      {
        question:
          "In Galileo's tied spheres thought experiment, what logical contradiction arises from Aristotle's premise that heavier objects fall faster?",
        answer:
          'If heavy M and light m are tied: m should drag and slow down M (v < v_M), yet combined (M+m) is heavier and should fall faster (v > v_M). Both cannot hold.',
        rationale:
          'Exposes self-contradiction in the premise v ~ m without requiring physical instrumentation.',
        difficulty: 4,
      },
      {
        question:
          'Why does a feather fall at the exact same rate as a bowling ball in a vacuum chamber?',
        answer:
          'Because gravitational force is proportional to mass (F = mg), but acceleration is inversely proportional to mass (a = F/m). Mass cancels: a = g.',
        rationale:
          'Demonstrates the cancellation of gravitational and inertial mass in Newtonian dynamics.',
        difficulty: 3,
      },
      {
        question:
          "How does John Clement's 'bridging analogy' resolve the cognitive paradox of tied masses?",
        answer:
          'By introducing two identical bricks falling side-by-side: connected by a microscopic thread, they fall identically; welded together, they are 8 kg, proving bonding cannot change acceleration.',
        rationale: 'Anchors counter-intuitive physics onto undeniable symmetrical intuition.',
        difficulty: 5,
      },
    ],
  },
  {
    id: 'maxwells_demon_entropy',
    domain: 'thermodynamics',
    title: "Maxwell's Demon & Information Erasure: Landauer's Principle",
    historicalOrigin:
      'James Clerk Maxwell (1867); Leo Szilard (1929); Rolf Landauer (1961); Charles Bennett (1982)',
    targetPhenomenon:
      'The Second Law of Thermodynamics (delta S >= 0) holds universally; information processing is physical',
    folkConception:
      'A microscopic intelligent entity can sort gas particles by velocity without doing mechanical work, creating a free temperature gradient and infinite energy',
    initialModelAssumptions: [
      'Sorting molecules requires only observation and frictionless gate-opening, consuming no energy',
      'Information is an abstract, immaterial concept with no thermodynamic mass or energy equivalent',
      'The Second Law can be bypassed at microscopic scales through intelligent agency',
    ],
    extremeCases: [
      {
        id: 'ec_massless_trapdoor',
        name: 'Frictionless, Massless Trapdoor',
        unit: 'door mass m (kg)',
        baselineValue: '1e-20 kg (microscopic gate)',
        extremeLimit: '0 kg (frictionless, zero inertia)',
        intuitiveExpectation: 'Zero mechanical energy is required to open and shut the gate',
        paradoxicalOutcome:
          'Thermal fluctuations (Brownian motion) cause the gate to bounce uncontrollably unless damped, re-randomizing molecules',
        scientificExplanation:
          'A physical gate at temperature T undergoes thermal fluctuations of order k_B*T, destroying sorting capability (Smoluchowski-Feynman ratchet).',
      },
      {
        id: 'ec_szilard_single_molecule',
        name: 'Single-Molecule Gas Chamber (N = 1)',
        unit: 'molecule count N',
        baselineValue: '1e23 molecules',
        extremeLimit: '1 molecule in chamber volume V',
        intuitiveExpectation:
          'Thermodynamics breaks down completely because statistics requires large N',
        paradoxicalOutcome:
          'Demon measures left or right position (1 bit), inserts piston, and extracts exactly W = k_B * T * ln(2) work from isothermal expansion',
        scientificExplanation:
          'Proves that 1 bit of information directly corresponds to k_B * T * ln(2) of free energy.',
      },
      {
        id: 'ec_infinite_memory_register',
        name: 'Demon Memory Storage Capacity Limit',
        unit: 'memory bits M',
        baselineValue: 'Finite register (e.g. 100 bits)',
        extremeLimit: 'Infinite frictionless memory (M -> infinity)',
        intuitiveExpectation:
          'If memory is infinite, entropy can be lowered indefinitely without penalty',
        paradoxicalOutcome:
          'The demon is accumulating entropy in its physical memory register; total entropy S_gas + S_demon is strictly non-decreasing',
        scientificExplanation:
          'Bennett (1982) demonstrated that measurement and computation can be thermodynamically reversible, but memory erasure is fundamentally irreversible.',
      },
    ],
    simulativeSteps: [
      {
        id: 'step_thermal_equilibrium',
        stepOrder: 1,
        action:
          'Initialize isolated gas container in thermal equilibrium at temperature T divided by an insulated partition',
        causalMechanism:
          'Maxwell-Boltzmann distribution: molecules exhibit statistical bell-curve of velocities',
        expectedObservation:
          'Equal temperature and pressure on both sides; net entropy is maximized',
      },
      {
        id: 'step_demon_sorting',
        stepOrder: 2,
        action:
          'Demon observes approaching molecules: opens trapdoor only for fast molecules (Left -> Right) and slow molecules (Right -> Left)',
        causalMechanism: 'Velocity-selective molecular gating without external mechanical work',
        expectedObservation:
          'Right chamber grows hot (T_hot); left chamber grows cold (T_cold); delta T > 0 emerges',
      },
      {
        id: 'step_entropy_paradox',
        stepOrder: 3,
        action:
          'Calculate thermodynamic entropy change of the gas: delta S_gas = Q/T_hot - Q/T_cold < 0',
        causalMechanism: 'Spontaneous heat flow from cold to hot chamber without external work',
        expectedObservation:
          'Apparent violation of Clausius and Kelvin statements of the Second Law of Thermodynamics',
        revealedContradiction: 'delta S_gas < 0 in an isolated system without work expenditure',
      },
      {
        id: 'step_szilard_engine_reduction',
        stepOrder: 4,
        action:
          'Reduce thought experiment to Szilard single-molecule engine: Demon records molecule location bit in physical memory',
        causalMechanism:
          'Acquiring 1 bit of mutual information between demon memory and molecule position',
        expectedObservation:
          'Work W = k_B * T * ln(2) extracted from heat bath; demon memory transitions from Blank to Stored State',
      },
      {
        id: 'step_landauer_erasure_crucible',
        stepOrder: 5,
        action:
          'Close the thermodynamic cycle: Demon must erase memory register to restore initial blank state for next cycle',
        causalMechanism:
          "Landauer's Principle: Compressing phase space of memory register from 2 states to 1 state dissipates heat Q >= k_B * T * ln(2)",
        expectedObservation:
          'Erasure dissipates entropy delta S_environment >= k_B * ln(2) into the thermal reservoir',
        revealedContradiction:
          'Total entropy delta S_total = delta S_gas + delta S_demon_erasure >= 0; Second Law is fully preserved',
      },
    ],
    bridgingAnalogies: [
      {
        id: 'bridge_magnetic_bit_reset',
        anchorIntuition:
          'Erasing a chalk whiteboard requires physical friction, arm motion, and generates chalk dust and heat',
        intermediateBridge:
          'Resetting a ferromagnetic computational bit: aligning a random magnetic domain into state 0 requires energy dissipation',
        targetSystem: "Maxwell's Demon memory register resetting before the next measurement cycle",
        sharedCausalStructure:
          'Phase-space compression (2 degrees of freedom -> 1 degree of freedom) requires entropy dump into environment',
        resolvingInsight:
          "Information is not abstract; it is encoded in physical states. Landauer's bound Q >= k_B*T*ln(2) enforces conservation.",
      },
    ],
    canonicalResolution: {
      title: "Landauer's Principle & Information Thermodynamics",
      mechanism:
        'The demon cannot violate the Second Law because erasing information from physical memory requires dissipating at least k_B * T * ln(2) of heat per bit into the environment.',
      keyPrinciples: [
        'Information is physical: bit states correspond to distinct physical Hamiltonian microstates',
        "Landauer's Principle: Logical irreversibility implies thermodynamic irreversibility (delta Q >= k_B * T * ln(2))",
        'Total entropy delta S_system + delta S_memory >= 0 preserves the Second Law across the complete cycle',
      ],
    },
    reflectionPrompts: [
      'Why did it take nearly a century (from Maxwell in 1867 to Landauer in 1961 and Bennett in 1982) to recognize that memory erasure was the thermodynamic cost?',
      'How does the concept of information as physical change our understanding of computation and artificial intelligence?',
    ],
    fsrsItems: [
      {
        question: "What is Landauer's Principle in information thermodynamics?",
        answer:
          'Erasing one bit of information from a physical memory register dissipates a minimum thermodynamic heat of Q = k_B * T * ln(2) into the reservoir.',
        rationale: 'Establishes the fundamental physical cost of erasing information.',
        difficulty: 6,
      },
      {
        question: "How does Landauer's principle save the Second Law from Maxwell's Demon?",
        answer:
          "To repeat sorting, the demon's finite memory must be erased; the entropy dissipated during erasure (k_B * ln 2) equals or exceeds the entropy reduction achieved by sorting.",
        rationale: 'Closes the thermodynamic cycle showing delta S_total >= 0.',
        difficulty: 5,
      },
    ],
  },
  {
    id: 'einsteins_light_chaser',
    domain: 'relativity_modern_physics',
    title: "Einstein's Light Beam Chasing & Equivalence Principle",
    historicalOrigin:
      'Albert Einstein (1895 thought experiment at age 16; 1907 elevator Gedankenexperiment)',
    targetPhenomenon:
      'The speed of light c is invariant in all reference frames; gravitation and acceleration are locally equivalent',
    folkConception:
      'If you run alongside a beam of light at velocity c, you will see a frozen wave pattern of electric and magnetic fields standing motionless in space',
    initialModelAssumptions: [
      'Velocities add linearly according to Galilean relativity: v_relative = c - v',
      'Time flows at a universal, constant rate for all observers regardless of motion',
      'Light is a classical wave propagating through an absolute spatial medium (aether)',
    ],
    extremeCases: [
      {
        id: 'ec_velocity_approaching_c',
        name: 'Chaser Velocity Approaching Speed of Light (v -> c)',
        unit: 'relative velocity v/c',
        baselineValue: 'v = 0.0001c (earth orbital speed)',
        extremeLimit: 'v = 1.0000c (chasing parallel to wavefront)',
        intuitiveExpectation:
          'Observer catches up to wave crest, seeing motionless static E and B fields',
        paradoxicalOutcome:
          'Maxwell field equations forbid a static electromagnetic wave in free space with no source charges: curl(E) = -dB/dt = 0 collapses the wave',
        scientificExplanation:
          'An electromagnetic wave exists solely through mutual time-dependent induction: changing B generates E, changing E generates B. A static wave is an impossible fiction.',
      },
      {
        id: 'ec_accelerating_elevator_laser',
        name: 'Laser Beam in Accelerating Deep-Space Elevator',
        unit: 'acceleration a (m/s^2)',
        baselineValue: 'a = 0 (inertial drift)',
        extremeLimit: 'a = g = 9.81 m/s^2 (rocket propulsion in deep space)',
        intuitiveExpectation:
          'Light travels in a straight horizontal line across the elevator cabin',
        paradoxicalOutcome:
          'The floor accelerates upward during light transit time (delta t = w/c); light strikes lower on the opposite wall, tracing a curved trajectory',
        scientificExplanation:
          'By the Equivalence Principle, if acceleration curves light, then gravity MUST also curve light paths and warp spacetime.',
      },
    ],
    simulativeSteps: [
      {
        id: 'step_chasing_beam',
        stepOrder: 1,
        action:
          'Imagine running alongside a plane electromagnetic wave at speed v = c in empty space',
        causalMechanism:
          'Galilean velocity addition: relative speed of wavefront v_rel = c - c = 0',
        expectedObservation:
          'Wave appears spatially frozen: stationary sinusoidal electric and magnetic field peaks and troughs',
      },
      {
        id: 'step_maxwell_inspection',
        stepOrder: 2,
        action: 'Examine the frozen wave using Maxwells electromagnetic field equations',
        causalMechanism:
          'Faradays law of induction: curl(E) = -dB/dt; Ampere-Maxwell law: curl(B) = mu_0 * epsilon_0 * dE/dt',
        expectedObservation:
          'Since the wave is static, time derivatives dB/dt = 0 and dE/dt = 0; hence curl(E) = 0 and curl(B) = 0',
      },
      {
        id: 'step_electrodynamic_contradiction',
        stepOrder: 3,
        action:
          'Evaluate whether a charge-free spatial field with curl(E)=0 and curl(B)=0 can sustain sinusoidal oscillations',
        causalMechanism:
          'Mathematical identity of wave equations: without mutual time induction, fields must decay to zero',
        expectedObservation:
          'The static wave vanishes! A wave cannot exist at rest without electric charges',
        revealedContradiction:
          'Maxwell equations forbid static electromagnetic waves in vacuum; Galilean relativity fails',
      },
      {
        id: 'step_postulate_invariant_c',
        stepOrder: 4,
        action:
          'Postulate that light moves at velocity c for all inertial observers regardless of their motion',
        causalMechanism: 'Spacetime metric invariance: ds^2 = c^2 dt^2 - dx^2 - dy^2 - dz^2',
        expectedObservation:
          'Time dilates (dt = gamma * dt0) and length contracts (L = L0 / gamma) to preserve c',
      },
      {
        id: 'step_elevator_equivalence',
        stepOrder: 5,
        action: 'Shine a horizontal laser across a rocket elevator accelerating at g in deep space',
        causalMechanism:
          'Upward acceleration of opposite wall during light flight time delta t = width / c',
        expectedObservation:
          'Light ray curves downward parabolically; observer inside cannot distinguish acceleration from a gravitational field',
        revealedContradiction:
          'If gravity curves light, spacetime itself must be curved by mass-energy',
      },
    ],
    bridgingAnalogies: [
      {
        id: 'bridge_bullet_train_cabin',
        anchorIntuition:
          'Throwing a ball horizontally inside a rapidly accelerating bullet train; passenger sees ball curve toward rear floor',
        intermediateBridge:
          'Replace ball with ultra-fast sound wave or ping-pong ball across accelerating cabin',
        targetSystem:
          'Photons with momentum p = E/c traversing accelerating elevator and gravitational field',
        sharedCausalStructure:
          'Uniform acceleration is locally indistinguishable from uniform gravitational field (Principle of Equivalence)',
        resolvingInsight:
          'Gravitation is not an external Newtonian force pulling on mass; it is geodesic motion in curved spacetime.',
      },
    ],
    canonicalResolution: {
      title: 'Special & General Relativity: Spacetime Curvature & Invariant c',
      mechanism:
        'The speed of light c is a universal constant; time and space adjust dynamically (Lorentz transformations), and gravity is the curvature of spacetime geodesics.',
      keyPrinciples: [
        'Invariance of light speed c in all inertial reference frames',
        'Local equivalence of gravitational field and accelerated frame of reference',
        'Light deflection and gravitational redshift confirm spacetime geometric metric',
      ],
    },
    reflectionPrompts: [
      'How did 16-year-old Einstein detect that Galilean velocity addition contradicted Maxwell field equations?',
      'Why does the equivalence between an accelerating elevator and Earth gravity imply that massive objects must bend light rays?',
    ],
    fsrsItems: [
      {
        question: "Why is a 'frozen light wave' impossible according to Maxwell's equations?",
        answer:
          'Light waves sustain themselves through mutual time-induction (changing B creates E, changing E creates B). If frozen (d/dt = 0), both fields collapse to zero.',
        rationale: 'Demonstrates why c must remain non-zero and invariant for all observers.',
        difficulty: 5,
      },
      {
        question:
          "What is Einstein's Equivalence Principle demonstrated by the elevator thought experiment?",
        answer:
          'An observer in a sealed room cannot distinguish between being at rest in a uniform gravitational field g and being accelerated at a = g in deep space.',
        rationale:
          'Lays the foundational conceptual bridge to General Relativity and curved spacetime.',
        difficulty: 4,
      },
    ],
  },
  {
    id: 'darwins_natural_selection',
    domain: 'evolutionary_biology',
    title: "Darwin's Artificial to Natural Selection: Generational Sieve",
    historicalOrigin:
      'Charles Darwin (1859), On the Origin of Species by Means of Natural Selection',
    targetPhenomenon:
      'Complex, goal-directed biological adaptations emerge from blind, unguided differential reproduction',
    folkConception:
      'Organisms adapt through conscious somatic striving / use-and-disuse (Lamarck) or require an external teleological designer (Paley)',
    initialModelAssumptions: [
      'Traits acquired during an organisms lifetime are passed directly to offspring',
      'Species are fixed types with an ideal essence; variations are defective aberrations',
      'Complex functional organs (e.g. eye, wing) could not evolve incrementally because intermediate stages would be useless',
    ],
    extremeCases: [
      {
        id: 'ec_infinite_carrying_capacity',
        name: 'Infinite Ecological Carrying Capacity (K -> infinity)',
        unit: 'resources / individuals',
        baselineValue: 'Finite resources with severe mortality',
        extremeLimit: 'Infinite food, space, and zero predators',
        intuitiveExpectation: 'Organisms still evolve and adapt toward perfection',
        paradoxicalOutcome:
          'Natural selection stops! All variants survive and reproduce equally; population undergoes neutral drift without directional adaptation',
        scientificExplanation:
          'Selective adaptation requires differential reproductive mortality; without finite constraints (Malthusian struggle), selection pressure is zero.',
      },
      {
        id: 'ec_deep_time_multiplication',
        name: 'Generational Time Scale to 10 Million Generations',
        unit: 'generation count G',
        baselineValue: '100 generations (human domestic breeding)',
        extremeLimit: '10,000,000 generations (geological epoch)',
        intuitiveExpectation:
          'Minor phenotypic shifts remain bounded within original species barrier',
        paradoxicalOutcome:
          'Microscopic 0.1% reproductive fitness advantages compound exponentially into complete anatomical divergence and speciation',
        scientificExplanation:
          'Differential reproduction is an exponential compound interest function: small fitness increments inevitability dominate given deep geological time.',
      },
    ],
    simulativeSteps: [
      {
        id: 'step_artificial_pigeon_breeding',
        stepOrder: 1,
        action:
          'Observe domestic fancy pigeon breeders selecting desired tail shapes and beak traits over dozens of generations',
        causalMechanism:
          'Human breeder acts as conscious selective filter: only individuals with desired variation reproduce',
        expectedObservation:
          'Pouter, fantail, and tumbler pigeons diverge dramatically from the ancestral wild rock dove (Columba livia)',
      },
      {
        id: 'step_malthusian_geometric_growth',
        stepOrder: 2,
        action:
          'Mental simulation of wild species: calculate exponential reproductive potential (e.g. pairs producing 6 offspring per year)',
        causalMechanism:
          'Geometric population increase (N_t = N_0 * R^t) rapidly exceeds arithmetic resource growth',
        expectedObservation:
          'In a few hundred years, a single species would blanket the entire planet unless massive mortality occurs',
      },
      {
        id: 'step_struggle_for_existence',
        stepOrder: 3,
        action:
          'Deduce inevitable ecological consequence of exponential reproduction colliding with finite resources',
        causalMechanism:
          'A severe, unending struggle for existence: the vast majority of offspring perish before reproduction',
        expectedObservation:
          'Only a tiny fraction survive; mortality is not completely random but correlated with functional variation',
      },
      {
        id: 'step_nature_unconscious_sieve',
        stepOrder: 4,
        action: 'Substitute human breeder with the ecological environment as the selective filter',
        causalMechanism:
          'Any heritable variation that slightly improves survival or mating success increases offspring yield',
        expectedObservation:
          'Favorable traits are preserved and multiplied; injurious variations are rigidly eliminated',
        revealedContradiction:
          'No conscious breeder, divine intent, or Lamarckian striving is needed; nature acts as an automatic selective sieve',
      },
      {
        id: 'step_intermediate_eye_stages',
        stepOrder: 5,
        action:
          'Simulate incremental evolution of the vertebrate eye: light-sensitive patch -> pigment cup -> pinhole -> lens',
        causalMechanism:
          'Each intermediate stage confers an immediate functional survival advantage (detecting light vs detecting shadow vs direction)',
        expectedObservation:
          'Intermediate forms are highly advantageous at every incremental step; irreducible complexity is debunked',
        revealedContradiction:
          'Half an eye is not useless; 1% visual acuity is vastly superior to 0% in escaping predators',
      },
    ],
    bridgingAnalogies: [
      {
        id: 'bridge_mechanical_sieve',
        anchorIntuition:
          'Shaking a gravel sifter: large stones remain on top, fine sand falls through, sorting particles by size purely by gravity',
        intermediateBridge:
          'A farmer sorting corn seed: unconsciously saving the fattest ears to plant next spring while eating the rest',
        targetSystem:
          'Differential survival in the wild: predators and climate passively filtering genetic variants across generations',
        sharedCausalStructure:
          'Passive filter acting on heterogeneous inputs producing non-random ordered outputs without intentional design',
        resolvingInsight:
          'Natural selection is an algorithmic, substrate-neutral sorting process: Variation + Heritability + Selection = Adaptation.',
      },
    ],
    canonicalResolution: {
      title: 'Algorithmic Natural Selection & Cumulative Adaptation',
      mechanism:
        'Unguided random variation coupled with non-random differential reproductive success across deep time cumulatively produces complex biological adaptation.',
      keyPrinciples: [
        'Variation: Individuals in a population exhibit phenotypic differences due to heritable genetic variations',
        'Malthusian Pressure: More offspring are produced than can survive in a world of finite resources',
        'Differential Fitness: Advantageous variations survive and reproduce at higher statistical rates',
      ],
    },
    reflectionPrompts: [
      'How does the bridging analogy from artificial pigeon breeding to natural selection overcome the intuition that complex design requires a designer?',
      'Why is natural selection described by modern philosophers (e.g. Daniel Dennett) as a mindless algorithmic process?',
    ],
    fsrsItems: [
      {
        question:
          "What are the three essential algorithmic ingredients of Darwin's natural selection?",
        answer:
          '1. Variation (phenotypic differences); 2. Heritability (transmission to offspring); 3. Differential reproductive fitness.',
        rationale: 'Defines the universal conditions under which evolutionary adaptation occurs.',
        difficulty: 3,
      },
      {
        question: "How did Darwin refute the argument that 'half an eye is useless'?",
        answer:
          'By showing each intermediate stage (flat photosensitive patch -> curved cup -> pinhole -> primitive lens) provides an immediate survival advantage over previous stages.',
        rationale: 'Demonstrates functional continuity in the evolution of complex structures.',
        difficulty: 4,
      },
    ],
  },
  {
    id: 'turings_halting_oracle',
    domain: 'computational_logic',
    title: "Turing's Halting Oracle & Diagonal Contradiction",
    historicalOrigin:
      'Alan Turing (1936), On Computable Numbers, with an Application to the Entscheidungsproblem',
    targetPhenomenon:
      'There exist mathematically well-defined problems that cannot be solved by any possible algorithm (undecidability)',
    folkConception:
      'Given enough computational power, memory, and sophisticated logic, a computer program can be written to solve any deterministic question',
    initialModelAssumptions: [
      'Every well-formulated yes/no question about deterministic code has an algorithmic answer',
      'A debugger program can inspect source code and infallibly predict whether it will terminate or loop infinitely',
      'Self-reference in software is just ordinary data manipulation without fundamental paradoxes',
    ],
    extremeCases: [
      {
        id: 'ec_trivial_loop_check',
        name: 'Trivial Programs (Infinite Loop vs Immediate Return)',
        unit: 'cyclomatic complexity',
        baselineValue: 'Medium software functions with recursive calls',
        extremeLimit: 'program A: return 0; vs program B: while(true){}',
        intuitiveExpectation:
          'Since we can inspect trivial programs easily, we can generalize this to all programs',
        paradoxicalOutcome:
          'Generalization fails catastrophically when programs analyze their own outputs under adversarial self-reference',
        scientificExplanation:
          'Rice theorem proves that any non-trivial semantic property of programs is undecidable.',
      },
      {
        id: 'ec_perfect_oracle_assumption',
        name: 'Hypothetical Omniscient Oracle Function halts(P, I)',
        unit: 'oracle accuracy (%)',
        baselineValue: 'Heuristic static analyzer (90% accuracy)',
        extremeLimit: '100% infallible algorithmic oracle halts(P, I)',
        intuitiveExpectation: 'An infallible oracle exists; we just have not written the code yet',
        paradoxicalOutcome:
          'The assumption of its algorithmic existence leads directly to a strict mathematical contradiction (A and not A)',
        scientificExplanation:
          'Diagonalization proof demonstrates that the space of algorithmic functions is strictly smaller than the space of decision problems.',
      },
    ],
    simulativeSteps: [
      {
        id: 'step_oracle_definition',
        stepOrder: 1,
        action:
          'Hypothesize the existence of a master program halts(program_code, input_data) that returns TRUE if program terminates, FALSE if it loops',
        causalMechanism:
          'Standard algorithmic assumption: halts is deterministic, total, and always completes in finite time',
        expectedObservation:
          'halts(P, I) correctly identifies whether arbitrary program P terminates on input I',
      },
      {
        id: 'step_construct_adversary',
        stepOrder: 2,
        action:
          'Construct a new adversarial program paradox(program_code) using halts as an internal subroutine',
        causalMechanism:
          'Inside paradox(X): run halts(X, X). If halts returns TRUE -> loop forever; if halts returns FALSE -> halt immediately',
        expectedObservation:
          'paradox is explicitly programmed to do the exact opposite of whatever halts predicts it will do',
      },
      {
        id: 'step_feed_paradox_to_itself',
        stepOrder: 3,
        action:
          'Execute the ultimate diagonal mental run: pass paradox to itself as input: paradox(paradox)',
        causalMechanism: 'Self-referential evaluation: what does halts(paradox, paradox) predict?',
        expectedObservation:
          'Evaluation branches into two mutually exclusive outcomes: Branch 1 or Branch 2',
      },
      {
        id: 'step_evaluate_branch_1',
        stepOrder: 4,
        action:
          'Deduce Branch 1: Assume halts(paradox, paradox) returns TRUE (predicting paradox halts)',
        causalMechanism:
          'By paradox own code, when halts returns TRUE, paradox enters while(true) and loops forever',
        expectedObservation: 'paradox loops forever, contradicting the prediction that it halts!',
        revealedContradiction: 'If halts predicts paradox halts, paradox loops forever',
      },
      {
        id: 'step_evaluate_branch_2',
        stepOrder: 5,
        action:
          'Deduce Branch 2: Assume halts(paradox, paradox) returns FALSE (predicting paradox loops forever)',
        causalMechanism:
          'By paradox own code, when halts returns FALSE, paradox halts immediately and exits',
        expectedObservation:
          'paradox halts immediately, contradicting the prediction that it loops forever!',
        revealedContradiction: 'If halts predicts paradox loops, paradox halts immediately',
      },
      {
        id: 'step_halting_crucible',
        stepOrder: 6,
        action:
          'Synthesize the logical contradiction: halts can return neither TRUE nor FALSE without self-contradiction',
        causalMechanism: 'Proof by contradiction (reductio ad absurdum)',
        expectedObservation:
          'The initial premise that halts(P, I) can exist as a general algorithm is mathematically refuted',
        revealedContradiction: 'halts(P, I) cannot exist; the Halting Problem is uncomputable',
      },
    ],
    bridgingAnalogies: [
      {
        id: 'bridge_liar_paradox',
        anchorIntuition:
          "The Epimenides statement: 'This statement is false.' If true, it is false; if false, it is true",
        intermediateBridge:
          "The Barber of Seville: 'The barber shaves all men, and only those men, who do not shave themselves.' Does the barber shave himself?",
        targetSystem:
          "Turing's adversarial program paradox(paradox) inverting the output of the halting oracle",
        sharedCausalStructure:
          'Self-referential negation / diagonal inversion creating an inescapable semantic singularity',
        resolvingInsight:
          'Formal systems cannot achieve complete self-closure; there are fundamental bounds on algorithmic decidability.',
      },
    ],
    canonicalResolution: {
      title: "Undecidability of the Halting Problem & Turing's Diagonalization",
      mechanism:
        'No general algorithm can decide whether arbitrary programs halt on arbitrary inputs because any purported oracle can be inverted by self-referential adversarial construction.',
      keyPrinciples: [
        'Reductio ad absurdum proof via self-referential diagonalization',
        'Intrinsic boundary between what can be mathematically defined and what can be computed algorithmically',
        "Equivalence to Gödel's First Incompleteness Theorem and Church's untyped lambda calculus limits",
      ],
    },
    reflectionPrompts: [
      'Why is proof by contradiction particularly powerful in thought experiments compared to physical laboratory tests?',
      'How does the undecidability of the halting problem protect software engineering from false expectations of universal automated testing?',
    ],
    fsrsItems: [
      {
        question:
          "How does Turing's diagonalization proof show the Halting Problem is undecidable?",
        answer:
          'Construct an adversarial program paradox(X) that halts if halts(X,X) says it loops, and loops if halts(X,X) says it halts. Running paradox(paradox) forces an impossible contradiction.',
        rationale: 'Demonstrates the reductio ad absurdum core of computability theory.',
        difficulty: 6,
      },
      {
        question:
          "What is the structural analogy between the Barber Paradox and Turing's halting proof?",
        answer:
          'Both employ self-referential negation: the barber shaves those who do not shave themselves; the program inverts the oracle judgment of its own execution.',
        rationale: 'Connects folk semantic paradoxes with formal computational limits.',
        difficulty: 4,
      },
    ],
  },
]

// ============================================================================
// 3. Quantitative Telemetry & Scoring Algorithms
// ============================================================================

/**
 * Extreme Case Diagnostic Index (ECDI in [0, 100])
 * Evaluates learner's selection and predictive accuracy on limiting parameters.
 */
export function calculateExtremeCaseScore(
  scenario: GedankenScenario,
  selectedExtremeCaseIds: string[],
  predictions: Record<string, string>,
): number {
  if (scenario.extremeCases.length === 0) return 100
  if (selectedExtremeCaseIds.length === 0) return 0

  let score = 0
  const maxPossible = scenario.extremeCases.length

  for (const ec of scenario.extremeCases) {
    if (selectedExtremeCaseIds.includes(ec.id)) {
      // Base credit for identifying extreme boundary condition
      score += 0.5

      // Credit for prediction noting paradox or boundary behavior
      const userPrediction = predictions[ec.id]?.toLowerCase().trim() || ''
      if (userPrediction.length > 10) {
        // Check for qualitative keywords indicating boundary insight
        const keywords = [
          'same',
          'cancel',
          'paradox',
          'vacuum',
          'erasure',
          'zero',
          'equal',
          'heat',
          'infinite',
          'loop',
        ]
        const matched = keywords.some((kw) => userPrediction.includes(kw))
        score += matched ? 0.5 : 0.25
      }
    }
  }

  const normalized = Math.round((score / maxPossible) * 100)
  return Math.max(0, Math.min(100, normalized))
}

/**
 * Simulative Animation Fidelity (SAF in [0, 100])
 * Evaluates the step-by-step kinetic/causal validity and contradiction identification.
 */
export function calculateAnimationFidelityScore(
  scenario: GedankenScenario,
  stepOrder: string[] = [],
  identifiedContradictions: string[] = [],
): number {
  if (scenario.simulativeSteps.length === 0) return 100
  if (!stepOrder || stepOrder.length === 0) return 0

  let orderScore = 0
  const canonicalSteps = scenario.simulativeSteps.map((s) => s.id)

  // 1. Sequence fidelity: check relative order preservation
  for (let i = 0; i < stepOrder.length; i++) {
    const canonicalIndex = canonicalSteps.indexOf(stepOrder[i])
    if (canonicalIndex !== -1) {
      // Bonus if within 1 position of canonical step
      const distance = Math.abs(canonicalIndex - i)
      if (distance === 0) orderScore += 1.0
      else if (distance === 1) orderScore += 0.6
      else orderScore += 0.2
    }
  }
  const sequenceRatio = orderScore / Math.max(1, canonicalSteps.length)

  // 2. Contradiction crucible identification
  const stepsWithContradiction = scenario.simulativeSteps.filter((s) => s.revealedContradiction)
  let contradictionScore = 0
  if (stepsWithContradiction.length > 0) {
    const found = identifiedContradictions.length
    contradictionScore = Math.min(1.0, found / stepsWithContradiction.length)
  } else {
    contradictionScore = 1.0
  }

  // Combine: 60% sequence validity, 40% contradiction exposure
  const combined = sequenceRatio * 60 + contradictionScore * 40
  return Math.max(0, Math.min(100, Math.round(combined)))
}

/**
 * Bridging Analogy Score (BAS in [0, 100])
 * Evaluates understanding of the anchor intuition and intermediate analog.
 */
export function calculateBridgingAnalogyScore(
  scenario: GedankenScenario,
  selectedBridgingId?: string,
  explanation?: string,
): number {
  if (!selectedBridgingId) return 0
  const bridge = scenario.bridgingAnalogies.find((b) => b.id === selectedBridgingId)
  if (!bridge) return 20

  let score = 50 // Base points for selecting valid bridging analogy

  const text = (explanation || '').toLowerCase().trim()
  if (text.length >= 20) {
    score += 25
    // Look for conceptual anchor words
    const words = [
      'structure',
      'anchor',
      'symmetry',
      'same',
      'mass',
      'filter',
      'inversion',
      'sieve',
      'erasure',
    ]
    const hasAnchorWord = words.some((w) => text.includes(w))
    if (hasAnchorWord) score += 25
  }

  return Math.min(100, score)
}

/**
 * Model Modification Score (MMS in [0, 100])
 * Evaluates learner's revised canonical explanation resolving initial folk misconceptions.
 */
export function calculateModelModificationScore(
  scenario: GedankenScenario,
  revisedHypothesis?: string,
): number {
  const text = (revisedHypothesis || '').toLowerCase().trim()
  if (text.length < 15) return 0

  let score = 40 // Starting base for formulation

  // Check length & depth
  if (text.length > 60) score += 20

  // Match key domain principles
  const principles = scenario.canonicalResolution.keyPrinciples.map((p) => p.toLowerCase())
  let principleHits = 0
  for (const principle of principles) {
    const tokens = principle.split(/\s+/).filter((t) => t.length > 4)
    if (tokens.some((token) => text.includes(token))) {
      principleHits++
    }
  }

  score += Math.min(40, principleHits * 15)
  return Math.min(100, Math.round(score))
}

/**
 * Composite Model-Based Reasoning Index (MBRI in [0, 100])
 * Harmonic weighted synthesis across the 4 inquiry dimensions.
 */
export function calculateCompositeModelInquiryIndex(
  ecdi: number,
  saf: number,
  bas: number,
  mms: number,
): number {
  // Weights: 25% Extreme Case, 30% Simulative Animation, 25% Bridging Analogy, 20% Model Modification
  const index = ecdi * 0.25 + saf * 0.3 + bas * 0.25 + mms * 0.2
  return Math.round(Math.max(0, Math.min(100, index)))
}

/**
 * Determine Cognitive Maturity Tier based on MBRI
 */
export function determineMaturityTier(mbri: number): {
  tier: ModelMaturityTier
  description: string
} {
  if (mbri >= 85) {
    return {
      tier: 'gedanken_theorist',
      description:
        'Mastery of Gedankenexperiment modeling: fluidly operates extreme boundary conditions, resolves deep structural paradoxes via bridging analogies, and formulates rigorous invariant laws.',
    }
  }
  if (mbri >= 65) {
    return {
      tier: 'perturbation_analyst',
      description:
        'Proficient analytical modeling: systematically stresses variables to asymptotic limits and identifies causal contradictions, requiring minor scaffolding for non-obvious analogical bridges.',
    }
  }
  if (mbri >= 40) {
    return {
      tier: 'qualitative_mechanist',
      description:
        'Emergent mechanistic intuition: traces linear cause-and-effect sequences, but occasionally relies on surface features or struggles to reconcile contradictory deduction branches.',
    }
  }
  return {
    tier: 'folk_intuition',
    description:
      'Intuitive folk conception: relies on unexamined experiential heuristics, vulnerable to correlation fallacies and conflating perceptual cues with causal mechanisms.',
  }
}

// ============================================================================
// 4. Primary Public API Functions
// ============================================================================

/**
 * List all available Gedankenexperiment scenarios
 */
export function listGedankenScenarios(): GedankenScenario[] {
  return GEDANKEN_SCENARIOS
}

/**
 * Get a specific scenario by unique ID
 */
export function getGedankenScenario(id: string): GedankenScenario | undefined {
  return GEDANKEN_SCENARIOS.find((s) => s.id === id)
}

/**
 * Simulate an extreme case perturbation
 */
export function perturbExtremeCase(
  scenarioId: string,
  extremeCaseId: string,
  parameterLimit?: string,
): {
  valid: boolean
  scenarioId: string
  extremeCase?: ExtremeCaseVariable
  asymptoticBehavior: string
  consequence: string
  contradictionRevealed: boolean
} {
  const scenario = getGedankenScenario(scenarioId)
  if (!scenario) {
    return {
      valid: false,
      scenarioId,
      asymptoticBehavior: 'Unknown scenario',
      consequence: 'No scenario found with given ID',
      contradictionRevealed: false,
    }
  }

  const ec = scenario.extremeCases.find((e) => e.id === extremeCaseId)
  if (!ec) {
    return {
      valid: false,
      scenarioId,
      asymptoticBehavior: 'Unknown extreme case variable',
      consequence: 'No variable found with given ID',
      contradictionRevealed: false,
    }
  }

  return {
    valid: true,
    scenarioId,
    extremeCase: ec,
    asymptoticBehavior: `Perturbing ${ec.name} to limit: ${parameterLimit || ec.extremeLimit}`,
    consequence: ec.paradoxicalOutcome,
    contradictionRevealed: true,
  }
}

/**
 * Run mental animation simulation across sequenced steps
 */
export function simulateMentalAnimation(
  scenarioId: string,
  orderedStepIds: string[],
): {
  valid: boolean
  scenarioId: string
  fidelityScore: number
  observations: string[]
  contradictionsExposed: string[]
} {
  const scenario = getGedankenScenario(scenarioId)
  if (!scenario) {
    return {
      valid: false,
      scenarioId,
      fidelityScore: 0,
      observations: [],
      contradictionsExposed: [],
    }
  }

  const observations: string[] = []
  const contradictions: string[] = []

  for (const stepId of orderedStepIds) {
    const step = scenario.simulativeSteps.find((s) => s.id === stepId)
    if (step) {
      observations.push(`Step ${step.stepOrder}: ${step.action} -> ${step.expectedObservation}`)
      if (step.revealedContradiction) {
        contradictions.push(step.revealedContradiction)
      }
    }
  }

  const fidelity = calculateAnimationFidelityScore(scenario, orderedStepIds, contradictions)

  return {
    valid: true,
    scenarioId,
    fidelityScore: fidelity,
    observations,
    contradictionsExposed: contradictions,
  }
}

/**
 * Evaluate an entire model inquiry session
 */
export function evaluateInquirySession(input: InquirySessionInput): InquiryEvaluation {
  const scenario = getGedankenScenario(input.scenarioId) || GEDANKEN_SCENARIOS[0]

  const ecdi = calculateExtremeCaseScore(
    scenario,
    input.selectedExtremeCaseIds ?? [],
    input.extremeCasePredictions ?? {},
  )
  const saf = calculateAnimationFidelityScore(
    scenario,
    input.simulativeStepOrder ?? [],
    input.identifiedContradictions ?? [],
  )
  const bas = calculateBridgingAnalogyScore(
    scenario,
    input.selectedBridgingId,
    input.bridgingExplanation,
  )
  const mms = calculateModelModificationScore(scenario, input.revisedModelHypothesis)
  const mbri = calculateCompositeModelInquiryIndex(ecdi, saf, bas, mms)
  const { tier, description } = determineMaturityTier(mbri)

  // Generate actionable diagnostic feedback
  const strengths: string[] = []
  const blindspots: string[] = []
  const recommendations: string[] = []

  if (ecdi >= 70) {
    strengths.push('Rigorous identification of extreme parameter boundaries and asymptotic limits.')
  } else {
    blindspots.push(
      'Tendency to remain within comfortable mid-range parameter values rather than testing limiting boundary conditions.',
    )
    recommendations.push(
      'Push variables to zero or infinity (m -> 0, v -> c, friction -> 0) to observe if structural relationships hold.',
    )
  }

  if (saf >= 70) {
    strengths.push(
      'Clear step-by-step kinetic animation without skipping intermediate causal links.',
    )
  } else {
    blindspots.push(
      'Premature jumping to conclusions without running the complete mental simulation sequence.',
    )
    recommendations.push(
      'Animate each physical component sequentially: specify action, mechanism, and predicted observation.',
    )
  }

  if (bas >= 70) {
    strengths.push(
      'Skillful mapping between concrete anchored intuition and abstract target domain.',
    )
  } else {
    blindspots.push(
      'Difficulty abstracting the underlying causal structure from superficial perceptual differences.',
    )
    recommendations.push(
      'Construct an intermediate stepping-stone bridge (e.g. two bricks connected by thread) before tackling the full abstraction.',
    )
  }

  if (mms >= 70) {
    strengths.push('Formulated a robust canonical model resolving the discovered contradiction.')
  } else {
    recommendations.push(
      `Incorporate key canonical principles: ${scenario.canonicalResolution.keyPrinciples[0] || 'invariant physical laws'}.`,
    )
  }

  return {
    scenarioId: scenario.id,
    extremeCaseScore: ecdi,
    animationFidelityScore: saf,
    bridgingAnalogyScore: bas,
    modelModificationScore: mms,
    compositeIndex: mbri,
    tier,
    tierDescription: description,
    feedback: { strengths, blindspots, recommendations },
    fsrsCardCount: scenario.fsrsItems.length,
  }
}

/**
 * Generate calibrated FSRS-6 spaced repetition cards
 */
export function generateModelInquiryFsrsDeck(
  scenarioId: string,
  evaluation?: InquiryEvaluation,
): GeneratedFSRSCard[] {
  const scenario = getGedankenScenario(scenarioId) || GEDANKEN_SCENARIOS[0]
  const cards: GeneratedFSRSCard[] = []

  // Base cards from scenario curriculum
  scenario.fsrsItems.forEach((item, idx) => {
    cards.push({
      id: `fsrs_${scenario.id}_${idx + 1}`,
      front: `[Gedankenexperiment: ${scenario.title}]\n\n${item.question}`,
      back: `${item.answer}\n\n*Rationale & Invariant:* ${item.rationale}`,
      tags: ['gedanken', scenario.domain, 'model-inquiry', 'mental-simulation'],
      initialStability: 2.5,
      initialDifficulty: item.difficulty,
    })
  })

  // Dynamic card generated from user evaluation if provided
  if (evaluation && evaluation.tier !== 'gedanken_theorist') {
    cards.push({
      id: `fsrs_${scenario.id}_synthesis_review`,
      front: `[Model Inquiry Synthesis: ${scenario.title}]\n\nWhat was the core contradiction revealed during the Gedankenexperiment, and how did the canonical model resolve it?`,
      back: `**Canonical Resolution:** ${scenario.canonicalResolution.title}\n\n**Mechanism:** ${scenario.canonicalResolution.mechanism}\n\n**Key Principles:**\n- ${scenario.canonicalResolution.keyPrinciples.join('\n- ')}`,
      tags: ['gedanken', scenario.domain, 'synthesis', 'fsrs-6'],
      initialStability: 2.0,
      initialDifficulty: 5,
    })
  }

  return cards
}
