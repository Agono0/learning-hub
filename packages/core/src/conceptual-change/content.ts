/**
 * Scenario corpora for the conceptual change & ontological category shift engine (TD-05).
 *
 * CONTENT, not logic: the canonical direct-vs-emergent process attribute catalog
 * (Chi 2013), the phenomenological primitives catalog (diSessa 1993) and the
 * calibrated misconception scenario library (natural selection, thermal conduction,
 * DC circuits, diffusion, market equilibrium). Kept out of `ontological-shift-engine.ts`
 * so engine diffs stay about algorithms, not data. Types are imported type-only from
 * the engine (type-only cycles are safe); the engine re-exports these constants so
 * every existing import path keeps working.
 *
 * @module @learning-hub/core/conceptual-change
 */
import type {
  AttributeEntry,
  ConceptualMisconceptionScenario,
  PhenomenologicalPrimitive,
  PPrimEntry,
  ProcessAttribute,
} from './ontological-shift-engine'
// -----------------------------------------------------------------------------
// Attribute Catalog & Definitions
// -----------------------------------------------------------------------------

export const CANONICAL_ATTRIBUTE_CATALOG: Record<ProcessAttribute, AttributeEntry> = {
  distinct_agent: {
    attribute: 'distinct_agent',
    category: 'agency',
    branch: 'direct_process',
    label: 'Distinct Master Agent',
    definition: 'An identifiable actor, leader, or force that initiates and commands the process.',
    cognitiveIndicator:
      'Learner attributes changes to a specific entity wanting or ordering the outcome.',
  },
  intentional_purpose: {
    attribute: 'intentional_purpose',
    category: 'intentionality',
    branch: 'direct_process',
    label: 'Teleological / Intentional Purpose',
    definition: 'Actions occur in order to satisfy a goal, desire, or functional necessity.',
    cognitiveIndicator:
      'Learner uses phrases like "in order to survive", "particles want to fill space".',
  },
  centralized_control: {
    attribute: 'centralized_control',
    category: 'control',
    branch: 'direct_process',
    label: 'Centralized Orchestration',
    definition: 'A central authority coordinates interactions and dictates individual behaviors.',
    cognitiveIndicator: 'Learner looks for a central pacemaker, conductor, or commanding governor.',
  },
  sequential_stages: {
    attribute: 'sequential_stages',
    category: 'temporality',
    branch: 'direct_process',
    label: 'Sequential Pipeline Stages',
    definition: 'Step A finishes before Step B begins; causal events line up sequentially in time.',
    cognitiveIndicator: 'Learner diagrams a domino chain of consecutive events.',
  },
  unequal_status: {
    attribute: 'unequal_status',
    category: 'hierarchy',
    branch: 'direct_process',
    label: 'Unequal Hierarchical Status',
    definition: 'Agents have asymmetric power: stronger active agents act upon passive recipients.',
    cognitiveIndicator: 'Learner categorizes components as "doers" versus "receivers" of action.',
  },
  proportional_effect: {
    attribute: 'proportional_effect',
    category: 'causation',
    branch: 'direct_process',
    label: 'Proportional Direct Causation',
    definition: 'A larger cause produces a proportionally larger direct linear effect.',
    cognitiveIndicator:
      'Learner assumes macro-changes require an equally large single shock or force.',
  },

  disjoint_components: {
    attribute: 'disjoint_components',
    category: 'agency',
    branch: 'emergent_process',
    label: 'Disjoint Autonomous Components',
    definition: 'A population of independent, equivalent sub-elements lacking any central leader.',
    cognitiveIndicator:
      'Learner models microscopic components acting without awareness of the whole.',
  },
  random_interactions: {
    attribute: 'random_interactions',
    category: 'intentionality',
    branch: 'emergent_process',
    label: 'Stochastic / Random Interactions',
    definition: 'Collisions and interactions occur without foresight, intention, or global goal.',
    cognitiveIndicator: 'Learner recognizes that microscopic events are purely probabilistic.',
  },
  decentralized_control: {
    attribute: 'decentralized_control',
    category: 'control',
    branch: 'emergent_process',
    label: 'Decentralized Local Rules',
    definition:
      'Each component responds only to immediate local neighbors and physical constraints.',
    cognitiveIndicator:
      'Learner formulates simple uniform local rules (e.g. Brownian scatter, conservation).',
  },
  simultaneous_execution: {
    attribute: 'simultaneous_execution',
    category: 'temporality',
    branch: 'emergent_process',
    label: 'Simultaneous Concurrent Activity',
    definition: 'All sub-components interact in parallel continuously across space and time.',
    cognitiveIndicator: 'Learner accounts for ubiquitous, parallel microscopic interactions.',
  },
  uniform_status: {
    attribute: 'uniform_status',
    category: 'hierarchy',
    branch: 'emergent_process',
    label: 'Uniform Component Status',
    definition: 'All components share the same physical laws, rights, and basic behavioral rules.',
    cognitiveIndicator:
      'Learner treats all particles or organisms as subject to identical constraints.',
  },
  aggregate_pattern: {
    attribute: 'aggregate_pattern',
    category: 'causation',
    branch: 'emergent_process',
    label: 'Statistical Aggregate Emergence',
    definition:
      'Macro-patterns emerge from the collective statistical sum of millions of local micro-events.',
    cognitiveIndicator:
      'Learner distinguishes microscopic states from macroscopic thermodynamic properties.',
  },
}

// -----------------------------------------------------------------------------
// Phenomenological Primitives Catalog (diSessa 1993)
// -----------------------------------------------------------------------------

export const CANONICAL_PPRIM_CATALOG: Record<PhenomenologicalPrimitive, PPrimEntry> = {
  ohms_effort_resistance: {
    id: 'ohms_effort_resistance',
    name: "Ohm's P-Prim (Effort vs Resistance)",
    heuristicRule: 'Increased driving effort yields more result; increased resistance impedes it.',
    naiveApplication:
      'Assuming batteries "push harder" to overcome lightbulb resistance, consuming current.',
    scientificRecontextualization:
      'Ohm’s law $I = V/R$ emerges from electric field equilibrium, not fluid exhaustion.',
  },
  dying_away: {
    id: 'dying_away',
    name: 'Dying Away (Natural Dissipation)',
    heuristicRule: 'Any motion, heat, or signal inherently wears out and fades toward stillness.',
    naiveApplication:
      'Believing objects in motion stop because velocity naturally dissipates over time.',
    scientificRecontextualization:
      'Newtonian inertia: velocity is conserved unless non-conservative friction does work.',
  },
  closer_means_stronger: {
    id: 'closer_means_stronger',
    name: 'Closer Means Stronger',
    heuristicRule: 'Proximity to the source intensifies sensory and physical effects.',
    naiveApplication:
      'Believing Summer occurs because the Earth is closer to the Sun in its elliptical orbit.',
    scientificRecontextualization:
      'Axial tilt alters solar insolation angle and daylight duration, dominating orbital eccentricity.',
  },
  overcoming: {
    id: 'overcoming',
    name: 'Overcoming (Threshold Triumph)',
    heuristicRule:
      'A greater force or drive overpowers an obstacle or barrier when threshold is passed.',
    naiveApplication:
      'Believing organisms "overcome" environmental hardships through sheer biological willpower.',
    scientificRecontextualization:
      'Differential reproductive survival across random phenotypic variation over generations.',
  },
  force_as_mover: {
    id: 'force_as_mover',
    name: 'Force as Mover (Impetus)',
    heuristicRule: 'Sustained velocity requires sustained active pushing force from an agent.',
    naiveApplication:
      'Thinking an electric charge requires continuous battery propulsion to drift through copper.',
    scientificRecontextualization:
      'Steady-state surface charge gradients maintain an interior electrostatic field.',
  },
  balance_equilibrium: {
    id: 'balance_equilibrium',
    name: 'Dynamic Balance / Zero Sum',
    heuristicRule: 'Opposing agents push equally to produce stationary stillness.',
    naiveApplication:
      'Viewing chemical equilibrium as reactions stopping completely once reactants balance.',
    scientificRecontextualization:
      'Dynamic microscopic forward and reverse reaction rates are non-zero and equal.',
  },
}

// -----------------------------------------------------------------------------
// Calibrated Misconception Scenarios
// -----------------------------------------------------------------------------

export const CALIBRATED_MISCONCEPTION_SCENARIOS: ConceptualMisconceptionScenario[] = [
  {
    id: 'evolution_natural_selection',
    domain: 'evolutionary_bio',
    title: 'Natural Selection: Individual Adaptation vs Population Emergence',
    phenomenon:
      'How populations develop complex adaptations (e.g. antibiotic resistance or camouflage) in response to environmental shifts.',
    naiveBeliefStatement:
      'Individual bacteria need to survive when exposed to penicillin, so they learn or intentionally mutate in order to resist the antibiotic.',
    naiveOntologicalBranch: 'direct_process',
    dominantPPrim: 'overcoming',
    syntheticModelCompromise:
      'Lamarckian Synthetic Model: Organisms acquire helpful physiological adaptations during their lifetime and directly pass those acquired traits to offspring.',
    scientificEmergentExplanation:
      'Natural selection is an emergent process: pre-existing random genetic mutations produce phenotypic variation among millions of autonomous organisms. In the presence of an antibiotic, individuals lacking resistant alleles suffer differential mortality, resulting in an emergent statistical shift in allele frequency across the population without any individual organism changing its genome or desiring to adapt.',
    targetOntologicalBranch: 'emergent_process',
    attributeContrasts: [
      {
        dimension: 'agency',
        directAttribute: 'distinct_agent',
        directDescription: 'Individual organism acts as the goal-directed adapting agent.',
        emergentAttribute: 'disjoint_components',
        emergentDescription:
          'A population of disjoint organisms each following independent genetic programs.',
      },
      {
        dimension: 'intentionality',
        directAttribute: 'intentional_purpose',
        directDescription: 'Mutations occur teleologically to solve the problem of survival.',
        emergentAttribute: 'random_interactions',
        emergentDescription:
          'Mutations occur stochastically prior to and independent of selective pressure.',
      },
      {
        dimension: 'control',
        directAttribute: 'centralized_control',
        directDescription: 'Environmental pressure commands the organism how to change.',
        emergentAttribute: 'decentralized_control',
        emergentDescription:
          'Differential reproduction operates locally without global coordination.',
      },
      {
        dimension: 'temporality',
        directAttribute: 'sequential_stages',
        directDescription:
          'Threat occurs -> Organism senses need -> Organism adapts -> Traits passed down.',
        emergentAttribute: 'simultaneous_execution',
        emergentDescription:
          'Continuous birth, mutation, and mortality events occur concurrently across generations.',
      },
      {
        dimension: 'hierarchy',
        directAttribute: 'unequal_status',
        directDescription: 'Stronger individuals actively transform while weaker ones stay static.',
        emergentAttribute: 'uniform_status',
        emergentDescription:
          'All organisms are equally subject to the laws of molecular genetics and mortality.',
      },
      {
        dimension: 'causation',
        directAttribute: 'proportional_effect',
        directDescription:
          'Intense chemical stress directly causes rapid targeted physiological restructuring.',
        emergentAttribute: 'aggregate_pattern',
        emergentDescription:
          'Macroscopic adaptation is a statistical aggregate consequence of differential survival rates.',
      },
    ],
    refutationalAnomalies: [
      'Luria-Delbrück Fluctuation Test (1943): Bacteria acquire phage resistance mutations before exposure to the bacteriophage, falsifying directed adaptation.',
      'Lethal antibiotic concentrations kill 100% of naive bacteria; adaptation only occurs if resistant mutants pre-exist in the culture.',
      'Somatic mutations in an individual’s body cells are never inherited by germline offspring.',
    ],
    emergenceMechanismSummary:
      'Population-level adaptation is a statistical emergence resulting from three decentralized conditions: variation (stochastic mutation), differential fitness (selective mortality), and heredity (DNA replication).',
  },
  {
    id: 'thermodynamics_heat_conduction',
    domain: 'thermodynamics',
    title: 'Thermal Conduction: Caloric Substance Fluid vs Kinetic Energy Distribution',
    phenomenon:
      'Why a metal spoon feels colder than a wooden block at the same 20°C room temperature, and how heat flows between them.',
    naiveBeliefStatement:
      'Heat is a warm physical substance (caloric fluid) trapped inside objects, and cold is an opposing substance that flows from the metal spoon into your finger.',
    naiveOntologicalBranch: 'matter_entity',
    dominantPPrim: 'closer_means_stronger',
    syntheticModelCompromise:
      'Caloric-Container Model: Metal inherently contains more "cold fluid" than wood because metal is physically denser and absorbs temperature from the surroundings.',
    scientificEmergentExplanation:
      'Temperature is not a substance but a statistical measure of average microscopic molecular kinetic energy. When a finger contacts metal, thermal conduction occurs through trillions of stochastic collisions between lattice phonons and free valence electrons. Metal has a high thermal conductivity ($k \\approx 400\\text{ W/m}\\cdot\\text{K}$), so heat transfers away from skin thermoreceptors at a much higher flux $q = -k \\nabla T$, creating the neurological sensation of cold despite identical initial temperatures.',
    targetOntologicalBranch: 'emergent_process',
    attributeContrasts: [
      {
        dimension: 'agency',
        directAttribute: 'distinct_agent',
        directDescription:
          '"Cold" and "Heat" act as separate fluids that battle and displace each other.',
        emergentAttribute: 'disjoint_components',
        emergentDescription:
          'Molecules and electrons vibrating independently according to Newtonian/quantum mechanics.',
      },
      {
        dimension: 'intentionality',
        directAttribute: 'intentional_purpose',
        directDescription:
          'Heat intentionally seeks out cold regions in order to equalize room temperature.',
        emergentAttribute: 'random_interactions',
        emergentDescription:
          'Molecules collide in randomly distributed directions without knowledge of gradient direction.',
      },
      {
        dimension: 'control',
        directAttribute: 'centralized_control',
        directDescription: 'A single temperature governor forces both bodies into equilibrium.',
        emergentAttribute: 'decentralized_control',
        emergentDescription:
          'Local elastic collisions naturally maximize phase space microstate probability (Maxwell-Boltzmann).',
      },
      {
        dimension: 'temporality',
        directAttribute: 'sequential_stages',
        directDescription:
          'Heat travels like a vehicle through a tube from hot start to cold finish.',
        emergentAttribute: 'simultaneous_execution',
        emergentDescription:
          'Energy transfers forward and backward across every boundary interface simultaneously.',
      },
      {
        dimension: 'hierarchy',
        directAttribute: 'unequal_status',
        directDescription:
          'The hotter object is active and powerful, while the colder object is passive.',
        emergentAttribute: 'uniform_status',
        emergentDescription:
          'All molecules obey the exact same kinetic collision laws in both materials.',
      },
      {
        dimension: 'causation',
        directAttribute: 'proportional_effect',
        directDescription:
          'Adding heat fluid increases material bulk mass or changes intrinsic coldness.',
        emergentAttribute: 'aggregate_pattern',
        emergentDescription:
          'Net macroscopic heat flow is the statistical difference between trillions of bidirectional energy exchanges.',
      },
    ],
    refutationalAnomalies: [
      'Count Rumford Cannon Boring Experiment (1798): Continual mechanical friction produces endless heat without exhausting any finite fluid substance.',
      'Infrared thermometer confirms both the metal spoon and wooden block are precisely 20.0°C before touch.',
      'Brownian motion under a microscope proves microscopic particles are in perpetual agitated motion even in static equilibrium.',
    ],
    emergenceMechanismSummary:
      'Thermal equilibrium is the statistical state of maximum microstate entropy ($S = k_B \\ln \\Omega$), where bidirectional kinetic energy exchange across the boundary achieves net zero flux.',
  },
  {
    id: 'electromagnetism_dc_circuits',
    domain: 'electromagnetism',
    title: 'Electric Current: Consumable Fuel vs Surface Charge Electric Field Drift',
    phenomenon:
      'Why two identical lightbulbs in series glow with identical brightness, and where electrical energy actually flows.',
    naiveBeliefStatement:
      'The battery pushes electricity like water through a pipe, and the first lightbulb consumes most of the electric fluid, leaving less current for the second bulb.',
    naiveOntologicalBranch: 'matter_entity',
    dominantPPrim: 'ohms_effort_resistance',
    syntheticModelCompromise:
      'Attenuation Model: Electric current travels in a single directional line from the positive terminal and gradually gets weaker and diluted as it passes through each resistor.',
    scientificEmergentExplanation:
      'Electric current in a metal wire is not a consumable fluid. Mobile conduction electrons ($n \\approx 10^{29}\\text{ m}^{-3}$) already fill the entire circuit lattice simultaneously. When a battery is connected, microscopic surface charge gradients establish an electrostatic field $\\mathbf{E}$ throughout the interior of the wire at near light speed. The electrons drift at mere millimeters per second, but because charge is strictly conserved (Kirchhoff’s Current Law: $\\nabla \\cdot \\mathbf{J} = 0$), the charge flow rate past any cross-section in series is mathematically identical, causing both bulbs to glow identically.',
    targetOntologicalBranch: 'emergent_process',
    attributeContrasts: [
      {
        dimension: 'agency',
        directAttribute: 'distinct_agent',
        directDescription:
          'The battery acts as an engine pump that shoots particles out of its terminal.',
        emergentAttribute: 'disjoint_components',
        emergentDescription:
          'A pre-existing sea of degenerate conduction electrons and stationary positive ion cores.',
      },
      {
        dimension: 'intentionality',
        directAttribute: 'intentional_purpose',
        directDescription:
          'Current travels through the circuit specifically to light up the lightbulb filament.',
        emergentAttribute: 'random_interactions',
        emergentDescription:
          'Electrons scatter randomly off lattice phonons $10^{14}$ times per second, drifting under field $\\mathbf{E}$.',
      },
      {
        dimension: 'control',
        directAttribute: 'centralized_control',
        directDescription:
          'The battery controls the speed and quantity of charges at every point in the circuit.',
        emergentAttribute: 'decentralized_control',
        emergentDescription:
          'Feedback from surface charge accumulations dynamically guides the internal field along bends and bottlenecks.',
      },
      {
        dimension: 'temporality',
        directAttribute: 'sequential_stages',
        directDescription:
          'Current leaves terminal -> passes bulb 1 -> gets tired -> arrives at bulb 2.',
        emergentAttribute: 'simultaneous_execution',
        emergentDescription:
          'Electrons drift through all components in the closed loop simultaneously and synchronously.',
      },
      {
        dimension: 'hierarchy',
        directAttribute: 'unequal_status',
        directDescription:
          'Electrons near the battery are energetic leaders; downstream electrons are followers.',
        emergentAttribute: 'uniform_status',
        emergentDescription:
          'All conduction electrons in the wire have identical charge, mass, and statistical behavior.',
      },
      {
        dimension: 'causation',
        directAttribute: 'proportional_effect',
        directDescription:
          'Resistors consume electrical matter, leaving less matter returning to the battery.',
        emergentAttribute: 'aggregate_pattern',
        emergentDescription:
          'Energy is carried by the electromagnetic Poynting field $\\mathbf{S} = \\mathbf{E} \\times \\mathbf{B}$ in space, not inside the electrons as fuel.',
      },
    ],
    refutationalAnomalies: [
      'Precision ammeter placed before bulb 1 and after bulb 2 reads exactly 0.50 Amperes at both locations.',
      'A lightbulb located 300,000 kilometers away lights up almost instantaneously (~1 sec), while individual electrons take hours to travel one meter (drift velocity $\\approx 10^{-4}\\text{ m/s}$).',
      'Reversing the battery polarity reverses electron drift direction, but lightbulb luminosity remains completely unchanged.',
    ],
    emergenceMechanismSummary:
      'Current is a steady-state divergence-free vector field. Microscopic surface charges automatically self-organize along wire surfaces to establish the uniform internal field that maintains constant current density.',
  },
  {
    id: 'cellular_biophysics_diffusion',
    domain: 'cellular_biophysics',
    title: 'Diffusion & Osmosis: Intentional Migration vs Statistical Net Flux',
    phenomenon:
      'How ink drops spread evenly through still water, and how water crosses semi-permeable cell membranes.',
    naiveBeliefStatement:
      'Ink particles want to spread out because they feel crowded in high concentration and seek empty space to breathe.',
    naiveOntologicalBranch: 'direct_process',
    dominantPPrim: 'dying_away',
    syntheticModelCompromise:
      'Repulsion Model: Like charges or repulsive forces push neighboring solute molecules away from the dense center toward the empty edges.',
    scientificEmergentExplanation:
      'Diffusion is purely an emergent statistical outcome of uncorrelated Brownian motion. Individual solute molecules have zero awareness of concentration gradients, zero repulsive desire, and move in completely random directions governed by thermal kinetic collisions. Because there are simply more molecules in Region A than in Region B, the probability of a molecule jumping from A to B is higher than from B to A. Net directional flux $J = -D \\frac{dC}{dx}$ (Fick’s First Law) emerges solely from the law of large numbers without any driving force.',
    targetOntologicalBranch: 'emergent_process',
    attributeContrasts: [
      {
        dimension: 'agency',
        directAttribute: 'distinct_agent',
        directDescription:
          'Ink particles act as conscious travelers migrating toward spacious areas.',
        emergentAttribute: 'disjoint_components',
        emergentDescription:
          'Independent molecules buffeted by chaotic solvent collisions (Brownian motion).',
      },
      {
        dimension: 'intentionality',
        directAttribute: 'intentional_purpose',
        directDescription:
          'Particles move in order to equalize concentration and establish balance.',
        emergentAttribute: 'random_interactions',
        emergentDescription:
          'Every single molecular velocity vector changes randomly at every collision.',
      },
      {
        dimension: 'control',
        directAttribute: 'centralized_control',
        directDescription:
          'A gradient force actively pushes molecules downhill from high to low density.',
        emergentAttribute: 'decentralized_control',
        emergentDescription:
          'Zero net force acts on the molecules; motion is purely inertial between collisions.',
      },
      {
        dimension: 'temporality',
        directAttribute: 'sequential_stages',
        directDescription:
          'Concentrated droplet expands sequentially outward in an orderly marching wave.',
        emergentAttribute: 'simultaneous_execution',
        emergentDescription:
          'Molecules move in all $360^\\circ$ directions simultaneously, both forward and backward.',
      },
      {
        dimension: 'hierarchy',
        directAttribute: 'unequal_status',
        directDescription:
          'Molecules at the core are "pushers", while boundary molecules are "scouts".',
        emergentAttribute: 'uniform_status',
        emergentDescription:
          'Every molecule has identical kinetic temperature distribution and jump probability.',
      },
      {
        dimension: 'causation',
        directAttribute: 'proportional_effect',
        directDescription: 'Crowding pressure causes active repulsion proportional to density.',
        emergentAttribute: 'aggregate_pattern',
        emergentDescription:
          'Net flux is a macroscopic mathematical asymmetry of random microscopic probabilities.',
      },
    ],
    refutationalAnomalies: [
      'Fluorescence Recovery After Photobleaching (FRAP): Tagged molecules continue moving at the exact same speed even after the concentration is 100% uniform.',
      'Single-particle tracking reveals individual dye molecules frequently move *toward* higher concentration zones.',
      'Dilute gases with non-interacting ideal particles (zero intermolecular repulsion) diffuse at identical rates.',
    ],
    emergenceMechanismSummary:
      'Diffusion is the macroscopic manifestation of stochastic microscopic random walks ($R^2 = 2Dt$). Uniform equilibrium is the state of maximum statistical probability, not intentional peace.',
  },
  {
    id: 'microeconomics_market_price',
    domain: 'microeconomics',
    title: 'Market Equilibrium: Central Dictation vs Decentralized Order Book Matching',
    phenomenon:
      'How commodity prices (e.g. wheat, crude oil, or computer chips) adjust to global supply shortages and demand surges.',
    naiveBeliefStatement:
      'Greedy corporate executives or government officials artificially set prices to whatever they want based on personal greed.',
    naiveOntologicalBranch: 'direct_process',
    dominantPPrim: 'force_as_mover',
    syntheticModelCompromise:
      'Conspiracy Model: A secret cartel of large sellers gathers to dictate prices, but they have to lower prices when customers threaten boycotts.',
    scientificEmergentExplanation:
      'Market price discovery in competitive markets is an emergent decentralized process. Millions of independent buyers and sellers each possess private valuations, budget constraints, and risk preferences. Decentralized double auction matching engines continuously match bids and asks. When supply drops, competition among desperate buyers bids up clearing prices until marginal demand matches available volume. No single merchant or central planner dictates the clearing price; it emerges as an informational summary statistic of distributed global scarcity.',
    targetOntologicalBranch: 'emergent_process',
    attributeContrasts: [
      {
        dimension: 'agency',
        directAttribute: 'distinct_agent',
        directDescription:
          'A single dominant seller or price-setter commands what goods will cost.',
        emergentAttribute: 'disjoint_components',
        emergentDescription:
          'Millions of independent buyers and sellers each acting on local private information.',
      },
      {
        dimension: 'intentionality',
        directAttribute: 'intentional_purpose',
        directDescription:
          'Prices are changed intentionally to punish customers or maximize social fairness.',
        emergentAttribute: 'random_interactions',
        emergentDescription:
          'Bids and asks meet whenever reservation prices overlap in decentralized order books.',
      },
      {
        dimension: 'control',
        directAttribute: 'centralized_control',
        directDescription: 'A central authority coordinates and enforces market transactions.',
        emergentAttribute: 'decentralized_control',
        emergentDescription:
          'Spontaneous order emerges through the price mechanism (Hayek’s dispersed knowledge).',
      },
      {
        dimension: 'temporality',
        directAttribute: 'sequential_stages',
        directDescription:
          'Manufacturer calculates cost -> marks up 20% -> consumer must accept or decline.',
        emergentAttribute: 'simultaneous_execution',
        emergentDescription:
          'Millions of bid/ask submissions, cancellations, and trades execute in parallel globally.',
      },
      {
        dimension: 'hierarchy',
        directAttribute: 'unequal_status',
        directDescription: 'Sellers hold all power and impose rules upon helpless, passive buyers.',
        emergentAttribute: 'uniform_status',
        emergentDescription:
          'Both buyers and sellers are price-takers in competitive equilibrium; neither can dictate terms.',
      },
      {
        dimension: 'causation',
        directAttribute: 'proportional_effect',
        directDescription:
          'A 10% rise in greed causes an immediate 10% hike in retail consumer prices.',
        emergentAttribute: 'aggregate_pattern',
        emergentDescription:
          'Equilibrium price $P^*$ is the intersection of aggregated supply and demand functions.',
      },
    ],
    refutationalAnomalies: [
      'Price ceiling laws (Nixon 1971 wage/price freezes) lead to immediate severe shortages, lines, and black markets, proving prices cannot be commanded by fiat.',
      'Experimental double auction experiments (Vernon Smith 1962): Naive undergraduate students with zero market knowledge converge to theoretical competitive equilibrium in under 3 rounds.',
      'Sellers in high-competition agricultural markets frequently sell at a loss when market clearing price drops below production costs.',
    ],
    emergenceMechanismSummary:
      'Price discovery is an emergent informational aggregation mechanism that coordinates decentralized resource allocation across millions of unacquainted economic actors without central coordination.',
  },
]
