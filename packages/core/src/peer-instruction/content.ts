/**
 * Scenario corpora for the peer instruction (ConcepTest) engine (TD-05).
 *
 * CONTENT, not logic: the five canonical multidisciplinary ConcepTest suites —
 * Mazur benchmark qualitative probes with classroom vote distributions,
 * simulated peer dissonance scripts, isomorphic transfer questions and FSRS
 * seed cards (Mazur 1997; Smith et al. 2009; Lasry et al. 2008). Kept out of
 * `conceptest-engine.ts` so engine diffs stay about algorithms, not data. The
 * `ConcepTestSuite` type stays in the engine (z.infer of ConcepTestSuiteSchema
 * — type-only import here, type-only cycles are safe). This corpus was
 * module-private in the engine (served via getCanonicalConcepTestSuites), so
 * the engine imports it without re-export — the public surface is unchanged.
 *
 * @module @learning-hub/core/peer-instruction
 */
import type { ConcepTestSuite } from './conceptest-engine'

export const CANONICAL_CONCEPTEST_SUITES: ConcepTestSuite[] = [
  {
    id: 'ct-thermal-expansion-plate',
    title: 'Thermal Expansion & Geometric Scaling',
    domain: 'Classical Mechanics & Thermodynamics',
    subtitle: 'The Heated Metal Plate with a Circular Hole (Mazur Benchmark)',
    priorKnowledgePremise:
      'Thermal expansion increases interatomic bond distance proportionally with temperature change: ΔL = α * L_0 * ΔT.',
    canonicalInvariant:
      'Thermal expansion is strictly isotropic and geometric; every line element in the object scales by the exact same linear expansion factor (1 + α ΔT), like an optical zoom enlargement.',
    instructorExplanation:
      'Imagine drawing a circle on a solid brass plate and heating it: the brass inside the circle clearly expands. Now cut out that circular piece: the surrounding metal atoms cannot know whether the interior brass is present or absent! Every atom exerts the exact same outward forces on its neighbors. Therefore, the empty hole expands at the exact same rate as if it were still filled with solid brass.',
    q1Prompt:
      'A rectangular brass sheet has a circular hole drilled through its exact center. When the plate is uniformly heated in an oven to +150°C, what happens to the diameter of the circular hole?',
    q1Options: [
      {
        id: 'opt-a',
        label: 'A',
        text: 'The diameter of the hole DECREASES because the expanding metal surrounding the hole pushes inward into the empty cavity.',
        isCorrect: false,
        commonMisconception:
          'Inward expansion fallacy: assuming matter expands into empty space to fill voids.',
        peerArgumentHint:
          'Think of the metal as a donut: when dough bakes, does the hole close up?',
      },
      {
        id: 'opt-b',
        label: 'B',
        text: 'The diameter of the hole INCREASES at the exact same proportional rate as the outer dimensions of the plate.',
        isCorrect: true,
        peerArgumentHint:
          'Think of photographic magnification: if you enlarge a picture of the plate on a copy machine, the hole gets bigger, not smaller.',
      },
      {
        id: 'opt-c',
        label: 'C',
        text: 'The diameter of the hole REMAINS CONSTANT because the thermal expansion of the inner edge cancels out the outward expansion of the outer edges.',
        isCorrect: false,
        commonMisconception:
          'Inner/outer cancellation fallacy: assuming opposing geometric boundaries neutralize each other.',
        peerArgumentHint:
          'There are no opposing inward forces; atomic bonds expand uniformly in all directions.',
      },
    ],
    q1ClassroomVoteDistribution: {
      'opt-a': 0.52, // 52% choose inward expansion (classic misconception)
      'opt-b': 0.38, // 38% choose correct outward expansion
      'opt-c': 0.1, // 10% choose constant
    },
    simulatedPeers: [
      {
        peerName: 'Alex (Advocating Inward Expansion)',
        initialChoiceOptionId: 'opt-a',
        initialConfidence: 4,
        qualitativeArgument:
          "Look at the physical material: when you heat brass, the metal atoms vibrate more and push each other apart. The outer edge expands outward into the room, so naturally the inner edge must expand inward toward the center of the hole where there's zero resistance! Why would the metal pull away from empty space?",
        heuristicMentalModel:
          'Hydrodynamic fluid displacement: matter expands into the path of least physical resistance.',
        counterArgumentTrigger:
          'What happens if you imagine drawing a circular grid of atoms on a solid sheet before heating it?',
      },
      {
        peerName: 'Taylor (Advocating Photographic Zoom)',
        initialChoiceOptionId: 'opt-b',
        initialConfidence: 4,
        qualitativeArgument:
          'Consider two atoms sitting directly on the circumference of the hole. As the plate heats, the distance between those two atoms MUST increase because of thermal vibration. If every single atom around the perimeter gets farther away from its neighbors, the total circumference increases (C = 2πr), which mathematically forces the diameter to increase!',
        heuristicMentalModel:
          'Circumferential distance stretching and isotropic affine transformation.',
        counterArgumentTrigger: 'If circumference expands, how can diameter shrink when C = π * d?',
      },
    ],
    q2IsomorphicPrompt:
      'A liquid-in-glass thermometer consists of a glass bulb containing mercury that connects to a narrow glass capillary tube. Both glass and mercury expand when heated, but mercury has a much higher coefficient of volume expansion (β_Hg >> β_glass). When the thermometer is suddenly plunged into boiling water, what does the mercury meniscus in the capillary do initially in the first split-second, and then afterward?',
    q2Options: [
      {
        id: 'opt-q2-a',
        label: 'A',
        text: 'The meniscus DROPS briefly for a fraction of a second as the outer glass bulb heats and expands first (increasing bulb cavity volume), then RISES rapidly as heat penetrates the mercury.',
        isCorrect: true,
        peerArgumentHint:
          'Glass bulb acts like the heated metal plate with a hole: its inner cavity volume increases first!',
      },
      {
        id: 'opt-q2-b',
        label: 'B',
        text: 'The meniscus rises immediately and continuously without any downward twitch.',
        isCorrect: false,
        peerArgumentHint:
          'Ignores thermal conductivity delay: glass absorbs boiling heat before the mercury interior.',
      },
      {
        id: 'opt-q2-c',
        label: 'C',
        text: 'The meniscus stays completely motionless because thermal expansion is independent of container volume.',
        isCorrect: false,
        peerArgumentHint: 'Violates basic thermodynamic volumetric displacement.',
      },
    ],
    deepStructuralMapping:
      'Container inner cavity expansion behaves identically to a hole in an expanding solid; thermal lag between outer boundary and internal fluid creates a transient volume disparity.',
    surfaceContextDifference:
      'Dry heated solid brass plate vs liquid mercury inside a glass capillary immersion thermometer.',
    seedCards: [
      {
        front:
          'ConcepTest (Mazur): What happens to the diameter of a circular hole in a metal plate when the plate is heated uniformly?',
        back: 'The hole diameter INCREASES at the exact same rate as if it were filled with solid metal. Thermal expansion is an isotropic affine transformation (photographic magnification): all pairwise interatomic distances increase proportionally (ΔL = α L₀ ΔT).',
        targetFactor: 'Photographic Expansion Invariant',
        cardDepth: 'concep_test',
      },
      {
        front:
          'ConcepTest Misconception: Why do learners intuitively assume a heated hole will shrink?',
        back: 'Learners apply a fluid-like "path of least resistance" heuristic, imagining metal expands into empty cavity space. In reality, tensile atomic bond expansion around the circumference forces the perimeter to grow (C = π d), making the diameter expand.',
        targetFactor: 'Inward Expansion Fallacy',
        cardDepth: 'peer_dissonance',
      },
      {
        front:
          'Isomorphic Transfer (Smith 2009): Why does a glass thermometer meniscus drop slightly when plunged into boiling water before rising?',
        back: 'The outer glass bulb absorbs heat first and expands outward (enlarging its inner cavity volume just like the hole in a heated plate). Once heat conducts into the mercury, its higher expansion coefficient (β_Hg > β_glass) drives the meniscus upward.',
        targetFactor: 'Thermometer Cavity Expansion Transfer',
        cardDepth: 'isomorphic_transfer',
      },
    ],
  },
  {
    id: 'ct-dc-circuits-bulbs',
    title: 'DC Circuits & Potential Conservation',
    domain: 'Electromagnetism & Circuit Theory',
    subtitle: 'Series/Parallel Bulb Dimming & Current Distribution (Mazur 1997)',
    priorKnowledgePremise: "Ohm's Law (V = IR) and basic series/parallel resistance formulas.",
    canonicalInvariant:
      'An ideal battery provides a constant potential difference (EMF), NOT a constant electric current. Adding parallel branches decreases overall equivalent circuit resistance, increasing total current delivered by the source.',
    instructorExplanation:
      'Before adding Bulb C, the circuit has resistance R_A + R_B = 2R, drawing current I = V / (2R). When Bulb C is placed in parallel across Bulb B, the parallel pair has equivalent resistance R_parallel = R / 2. The total circuit resistance drops from 2R down to 1.5R. Because total current is I_total = V / 1.5R = (4/3) * (V / 2R), total current INCREASES! Bulb A carries this entire increased current, so Bulb A shines BRIGHTER. But Bulb B now splits that current with Bulb C, carrying only half of 4/3 = 2/3 of initial current, so Bulb B shines DIMMER.',
    q1Prompt:
      'A battery is connected in series with two identical light bulbs, Bulb A and Bulb B. Both bulbs glow with equal moderate brightness.\n\nA third identical bulb, Bulb C, is now connected in PARALLEL across Bulb B only. What happens to the brightness of Bulb A and Bulb B?',
    q1Options: [
      {
        id: 'opt-a',
        label: 'A',
        text: 'Bulb A gets DIMMER and Bulb B gets DIMMER because current is shared among three bulbs instead of two.',
        isCorrect: false,
        commonMisconception:
          'Constant current fallacy: assuming the battery supplies a fixed amount of current that is divided equally.',
        peerArgumentHint:
          'Does a wall outlet output less total electricity when you plug in a second appliance in your house?',
      },
      {
        id: 'opt-b',
        label: 'B',
        text: 'Bulb A gets BRIGHTER and Bulb B gets DIMMER.',
        isCorrect: true,
        peerArgumentHint:
          'Calculate total resistance: R_total drops from 2R to 1.5R, so battery current increases!',
      },
      {
        id: 'opt-c',
        label: 'C',
        text: 'Bulb A stays UNCHANGED and Bulb B gets DIMMER because Bulb A is closer to the positive terminal.',
        isCorrect: false,
        commonMisconception:
          'Directional sequential consumption: thinking electric current is consumed sequentially along the wire.',
        peerArgumentHint:
          'Current is a continuous closed loop; charge cannot pile up between Bulb A and Bulb B.',
      },
    ],
    q1ClassroomVoteDistribution: {
      'opt-a': 0.44, // 44% assume constant battery current shared
      'opt-b': 0.36, // 36% correct
      'opt-c': 0.2, // 20% sequential consumption
    },
    simulatedPeers: [
      {
        peerName: 'Jordan (Advocating Shared Battery Current)',
        initialChoiceOptionId: 'opt-a',
        initialConfidence: 4,
        qualitativeArgument:
          'The battery is a fixed 9V source with a fixed capacity. Before, two bulbs shared the battery. Now there are three bulbs in the circuit! More bulbs must mean each bulb gets a smaller slice of the energy pie, so both Bulb A and Bulb B must get dimmer.',
        heuristicMentalModel:
          'Zero-sum energy sharing: battery outputs fixed current distributed among all loads.',
        counterArgumentTrigger:
          'What happens to equivalent resistance when you add a resistor in parallel?',
      },
      {
        peerName: 'Morgan (Advocating Equivalent Resistance)',
        initialChoiceOptionId: 'opt-b',
        initialConfidence: 4,
        qualitativeArgument:
          'A battery maintains constant voltage, not constant current! Putting Bulb C in parallel with B creates an easier bypass path for electricity. The total resistance of the whole circuit DROPS from 2R to 1.5R. By Ohm’s Law (I = V / R), the battery is forced to pump MORE total current. Since all that current must pass through Bulb A first, Bulb A glows brighter!',
        heuristicMentalModel:
          'Variable source current driven by dynamic equivalent network impedance.',
        counterArgumentTrigger:
          'If total resistance decreases, why would battery current stay the same or drop?',
      },
    ],
    q2IsomorphicPrompt:
      'In a residential home wired in parallel at 120V, a kitchen circuit has an electric kettle operating. When a high-power microwave is plugged into the same wall circuit and turned on, what happens to the total current drawn from the main fuse box and the current flowing through the kettle?',
    q2Options: [
      {
        id: 'opt-q2-a',
        label: 'A',
        text: 'Total current from fuse box INCREASES, while current through the kettle remains CONSTANT (unaffected by the microwave).',
        isCorrect: true,
        peerArgumentHint:
          'Parallel household branches have independent 120V potential drops; total current is the sum of branch currents.',
      },
      {
        id: 'opt-q2-b',
        label: 'B',
        text: 'Total current remains constant, so the kettle current drops in half.',
        isCorrect: false,
        peerArgumentHint: 'Assumes home electrical panel has a constant current throttle.',
      },
      {
        id: 'opt-q2-c',
        label: 'C',
        text: 'Kettle current increases because the microwave pulls extra electrons through the kettle.',
        isCorrect: false,
        peerArgumentHint: 'Parallel branches are electrically decoupled.',
      },
    ],
    deepStructuralMapping:
      'Adding parallel branches decreases total system impedance, driving higher aggregate current from a constant-voltage source while preserving or modulating individual branch potentials.',
    surfaceContextDifference:
      'Laboratory DC battery with incandescent light bulbs vs 120V AC household circuit breakers with kitchen appliances.',
    seedCards: [
      {
        front:
          'ConcepTest (Mazur): What fundamental invariant governs battery behavior when circuit resistance changes?',
        back: 'An ideal battery maintains constant VOLTAGE (EMF), not constant current. Adding parallel branches reduces equivalent resistance, forcing the battery to increase its total current output (I = V / R_eq).',
        targetFactor: 'Constant EMF vs Constant Current',
        cardDepth: 'concep_test',
      },
      {
        front:
          'ConcepTest Misconception: Why is the "battery outputs a fixed current" intuition wrong?',
        back: 'Current is not stored in a reservoir that empties at a constant rate; current is a response to network impedance. Decreasing circuit resistance (e.g. adding a parallel bulb) draws MORE current from the source.',
        targetFactor: 'Constant Current Fallacy',
        cardDepth: 'peer_dissonance',
      },
      {
        front:
          'Isomorphic Transfer: What happens to total fuse current when multiple appliances are turned on in a household?',
        back: 'Because household outlets are wired in parallel, each device draws I = V / R_device independently. Total fuse current is the sum of all branch currents (I_total = Σ I_i), which increases until it trips the breaker if overloaded.',
        targetFactor: 'Parallel Household Load Transfer',
        cardDepth: 'isomorphic_transfer',
      },
    ],
  },
  {
    id: 'ct-archimedes-floating-ice',
    title: 'Fluid Statics & Archimedes Buoyancy',
    domain: 'Fluid Mechanics & Hydrostatics',
    subtitle: 'The Melting Floating Ice Cube in a Full Glass of Water',
    priorKnowledgePremise:
      'Archimedes principle: buoyant force equals the weight of displaced fluid (F_b = ρ_fluid * V_disp * g). Ice is less dense than liquid water (~0.917 g/cm³ vs 1.000 g/cm³).',
    canonicalInvariant:
      'A floating object displaces a weight of liquid equal to its own total weight. Because mass is strictly conserved during phase change, melted ice produces an identical volume of liquid water as the displaced cavity.',
    instructorExplanation:
      'While floating, the ice cube has mass M_ice. To float in equilibrium, it must displace an equal mass of liquid water: M_displaced = M_ice. Therefore, the volume of submerged water cavity is V_displaced = M_ice / ρ_water. When the ice cube completely melts, its entire mass M_ice turns into liquid water with density ρ_water. The volume of this newly melted water is V_melted = M_ice / ρ_water. Notice that V_melted is EXACTLY EQUAL to V_displaced! The melted water precisely fills the submerged cavity that the ice originally occupied, so the water level does not rise or fall by a single millimeter.',
    q1Prompt:
      'An ice cube floats in a glass of pure water filled precisely to the brim. A portion of the ice cube protrudes above the water surface.\n\nWhen the ice cube completely melts, what happens to the water level in the glass?',
    q1Options: [
      {
        id: 'opt-a',
        label: 'A',
        text: 'The water OVERFLOWS because the ice sticking out above the brim melts and adds extra liquid volume.',
        isCorrect: false,
        commonMisconception:
          'Protrusion volume fallacy: assuming the protruding tip represents extra net volume added upon melting.',
        peerArgumentHint:
          'Remember ice shrinks by ~9% in volume when melting from solid crystal into liquid water!',
      },
      {
        id: 'opt-b',
        label: 'B',
        text: 'The water level REMAINS EXACTLY AT THE BRIM without spilling a single drop.',
        isCorrect: true,
        peerArgumentHint:
          'Mass is conserved: the mass of liquid displaced while floating equals the exact mass of melted water produced.',
      },
      {
        id: 'opt-c',
        label: 'C',
        text: 'The water level DROPS noticeably because water contracts significantly when melting.',
        isCorrect: false,
        commonMisconception:
          'Overcompensation fallacy: knowing water contracts upon melting, but failing to realize the displaced volume already accounts for the density difference.',
        peerArgumentHint: 'Buoyant equilibrium already compensates for the density difference.',
      },
    ],
    q1ClassroomVoteDistribution: {
      'opt-a': 0.48, // 48% think it overflows
      'opt-b': 0.35, // 35% correct
      'opt-c': 0.17, // 17% think it drops
    },
    simulatedPeers: [
      {
        peerName: 'Sam (Advocating Overflow)',
        initialChoiceOptionId: 'opt-a',
        initialConfidence: 4,
        qualitativeArgument:
          'Look at the glass: the water is already at the very brim. There is an entire chunk of ice sitting up in the air above the rim. When that solid chunk turns into liquid, where else can that liquid go? It has to spill over the edge!',
        heuristicMentalModel:
          'Volumetric addition: protruding matter is perceived as surplus fluid volume.',
        counterArgumentTrigger:
          'Does ice have the same density as liquid water, or does it shrink when it melts?',
      },
      {
        peerName: 'Casey (Advocating Archimedes Mass Invariance)',
        initialChoiceOptionId: 'opt-b',
        initialConfidence: 5,
        qualitativeArgument:
          'A floating object displaces its WEIGHT, not its volume! The submerged part of the ice displaces exactly 10 grams of water if the ice cube weighs 10 grams. When those 10 grams of ice melt, they become exactly 10 grams of liquid water, which occupies the exact same volume as the 10 grams of water it was displacing. It fits into the hole like a key in a lock!',
        heuristicMentalModel: 'Archimedes mass-conservation and displaced volume equivalence.',
        counterArgumentTrigger:
          'If the melted ice has the same mass as the displaced water, how could its liquid volume be any different?',
      },
    ],
    q2IsomorphicPrompt:
      'In global climate science, climate models distinguish between the melting of Arctic sea ice (floating on the ocean) and the melting of Greenland ice sheets (resting on land bedrock). Which of these two melting processes directly contributes to global sea level rise, and why?',
    q2Options: [
      {
        id: 'opt-q2-a',
        label: 'A',
        text: 'Only Greenland land ice causes sea level rise, because floating Arctic sea ice already displaces its own weight in ocean water, producing zero net sea level change upon melting.',
        isCorrect: true,
        peerArgumentHint:
          'Archimedes principle applies directly to floating sea ice; land ice adds new displaced mass to the oceans.',
      },
      {
        id: 'opt-q2-b',
        label: 'B',
        text: 'Both contribute equally because all ice melts into water.',
        isCorrect: false,
        peerArgumentHint:
          'Fails to distinguish floating hydrostatic equilibrium from grounded land mass.',
      },
      {
        id: 'opt-q2-c',
        label: 'C',
        text: 'Arctic sea ice causes sea level to drop because cold water is denser than warm water.',
        isCorrect: false,
        peerArgumentHint: 'Minor thermal expansion does not negate mass balance.',
      },
    ],
    deepStructuralMapping:
      'Displaced fluid mass in hydrostatic equilibrium exactly equals floating object mass; adding un-displaced mass from an external substrate alters fluid level.',
    surfaceContextDifference:
      'Kitchen glass with ice cube vs planetary ocean basins with polar ice sheets.',
    seedCards: [
      {
        front:
          'ConcepTest (Archimedes): Why does a floating ice cube melting in a full glass of water not cause overflow?',
        back: 'Floating equilibrium mandates that displaced water mass equals ice cube mass (M_disp = M_ice). Upon melting, the ice becomes liquid water with mass M_ice, whose volume exactly matches the displaced cavity (V_melted = V_disp).',
        targetFactor: 'Displaced Volume Equivalence',
        cardDepth: 'concep_test',
      },
      {
        front: 'ConcepTest Misconception: Why do learners think floating ice will overflow?',
        back: 'They observe the ice tip protruding above the surface and assume that extra volume will add to the glass. They overlook that ice is ~9% less dense than water; upon melting into liquid, its volume contracts by the exact volume of the protruding tip.',
        targetFactor: 'Protrusion Fallacy',
        cardDepth: 'peer_dissonance',
      },
      {
        front:
          'Isomorphic Transfer: Why does melting Arctic sea ice not raise sea level, while Greenland ice does?',
        back: 'Arctic sea ice is floating in hydrostatic equilibrium, displacing its mass in seawater (zero net sea level rise). Greenland ice rests on land bedrock; its runoff adds entirely NEW water mass into the ocean basins.',
        targetFactor: 'Sea Ice vs Land Ice Transfer',
        cardDepth: 'isomorphic_transfer',
      },
    ],
  },
  {
    id: 'ct-darwinian-natural-selection',
    title: 'Evolutionary Biology & Stochastic Selection',
    domain: 'Genetics & Population Biology',
    subtitle: 'Antibiotic Resistance: Lamarckian Adaptation vs Darwinian Selection',
    priorKnowledgePremise:
      'Bacteria reproduce rapidly by fission; genetic mutations occur during DNA replication.',
    canonicalInvariant:
      'Environmental stressors (e.g. antibiotics) act as selective filters on PRE-EXISTING stochastic genetic variance; they do NOT induce targeted beneficial mutations on demand.',
    instructorExplanation:
      'A bacterial colony of 100 million cells already contains rare random mutations before ever seeing an antibiotic. In a normal environment, a mutated efflux pump provides no advantage or may even cost metabolic energy. But when an antibiotic is applied, it kills the 99.9% susceptible bacteria, leaving only the pre-existing resistant mutants alive to reproduce. The antibiotic did not "cause" the mutation; it selected for the mutant.',
    q1Prompt:
      'A population of bacteria is exposed to low doses of penicillin in a laboratory culture. Over several generations, the bacterial population becomes highly resistant to penicillin.\n\nWhich statement best explains how this resistance developed?',
    q1Options: [
      {
        id: 'opt-a',
        label: 'A',
        text: 'Individual bacteria sensed the toxic penicillin and actively mutated their cell wall synthesis genes to defend themselves.',
        isCorrect: false,
        commonMisconception:
          'Lamarckian teleological adaptation: believing organisms intentionally mutate in response to environmental need.',
        peerArgumentHint: 'Can an organism choose its own random DNA copying errors?',
      },
      {
        id: 'opt-b',
        label: 'B',
        text: 'Rare random mutations conferring slight resistance already existed in the population before exposure; penicillin killed susceptible bacteria, allowing resistant variants to survive and multiply.',
        isCorrect: true,
        peerArgumentHint:
          'Think of the Luria-Delbrück fluctuation experiment: mutations arise prior to selection.',
      },
      {
        id: 'opt-c',
        label: 'C',
        text: 'Penicillin enters bacterial DNA and directly reorganizes the genetic code to build protective enzymes.',
        isCorrect: false,
        commonMisconception:
          'Direct mutagenic instruction: assuming drugs act as genetic architects.',
        peerArgumentHint:
          'Penicillin inhibits transpeptidase enzyme cross-linking; it does not rewrite DNA codons.',
      },
    ],
    q1ClassroomVoteDistribution: {
      'opt-a': 0.46, // 46% teleological Lamarckian
      'opt-b': 0.38, // 38% correct Darwinian
      'opt-c': 0.16, // 16% mutagenic instruction
    },
    simulatedPeers: [
      {
        peerName: 'Riley (Advocating Purposeful Adaptation)',
        initialChoiceOptionId: 'opt-a',
        initialConfidence: 4,
        qualitativeArgument:
          'Bacteria are living organisms with complex signaling pathways. When stressed by a poison, their repair mechanisms activate to fight off the toxin. Over several generations of exposure, they learn to resist it, just like human muscles adapt to lifting heavy weights!',
        heuristicMentalModel: 'Physiological acclimatization mapped onto evolutionary genetics.',
        counterArgumentTrigger:
          'If you expose sterile bacteria with identical cloned DNA without mutations to penicillin, can any of them "learn" to survive?',
      },
      {
        peerName: 'Quinn (Advocating Pre-Existing Variance)',
        initialChoiceOptionId: 'opt-b',
        initialConfidence: 5,
        qualitativeArgument:
          'Evolution is not intentional! In a billion bacteria, DNA polymerase makes random typos. A few mutants already had altered enzymes before penicillin was ever added. Penicillin just acted as a lethal filter: it wiped out the normal bacteria, leaving only the mutants to inherit the dish.',
        heuristicMentalModel: 'Stochastic variation filtered by selective environmental pressure.',
        counterArgumentTrigger:
          'If mutations were directed by need, why do bacteria also produce fatal mutations that kill them?',
      },
    ],
    q2IsomorphicPrompt:
      'In clinical oncology, a patient with metastatic lung cancer responds dramatically to a targeted tyrosine kinase inhibitor (TKI) drug for 10 months, with tumors shrinking by 90%. Suddenly, the cancer relapses aggressively and no longer responds to the drug. What caused the relapse?',
    q2Options: [
      {
        id: 'opt-q2-a',
        label: 'A',
        text: 'The tumor initially contained a heterogeneous subclone with a secondary gatekeeper mutation (e.g. T790M) that survived TKI treatment and clonally expanded once competitors were cleared.',
        isCorrect: true,
        peerArgumentHint:
          'Tumor heterogeneity mirrors bacterial population variance: therapy selects resistant subclones.',
      },
      {
        id: 'opt-q2-b',
        label: 'B',
        text: 'The cancer cells got accustomed to the medication and learned to digest the chemo molecules as food.',
        isCorrect: false,
        peerArgumentHint: 'Teleological misconception.',
      },
      {
        id: 'opt-q2-c',
        label: 'C',
        text: 'The patient developed psychological resistance to the treatment.',
        isCorrect: false,
        peerArgumentHint: 'Category error.',
      },
    ],
    deepStructuralMapping:
      'Selective filtering of pre-existing clonal heterogeneity under therapeutic pressure leads to emergent population resistance.',
    surfaceContextDifference:
      'Single-celled prokaryotic bacteria in petri dish vs human malignant somatic tumor clones in clinical oncology.',
    seedCards: [
      {
        front:
          'ConcepTest (Evolution): Does antibiotic exposure cause bacteria to mutate into resistant forms?',
        back: 'NO. Mutations arise randomly and stochastically BEFORE antibiotic exposure. The antibiotic merely acts as a selective filter, killing susceptible organisms and allowing pre-existing resistant mutants to dominate the population.',
        targetFactor: 'Selection vs Induction Invariant',
        cardDepth: 'concep_test',
      },
      {
        front: 'ConcepTest Misconception: Why do people hold Lamarckian views of evolution?',
        back: 'People conflate individual physiological acclimatization (like building muscle or tanning) with population-level genetic evolution, teleologically assuming organisms mutate intentionally to overcome challenges.',
        targetFactor: 'Lamarckian Teleology Fallacy',
        cardDepth: 'peer_dissonance',
      },
      {
        front:
          'Isomorphic Transfer: What is the genetic mechanism behind targeted chemotherapy resistance relapse in cancer?',
        back: 'Pre-existing subclonal heterogeneity: a tiny fraction of tumor cells already possess secondary resistance mutations (e.g. T790M). Targeted chemo eliminates the dominant clones, allowing the resistant subclone to clonally expand.',
        targetFactor: 'Oncological Clonal Selection Transfer',
        cardDepth: 'isomorphic_transfer',
      },
    ],
  },
  {
    id: 'ct-monetary-liquidity-trap',
    title: 'Monetary Economics & Velocity Collapse',
    domain: 'Macroeconomics & Financial Systems',
    subtitle: 'The Liquidity Trap & Quantitative Easing at the Zero Lower Bound',
    priorKnowledgePremise:
      'Quantity Theory of Money (M * V = P * Y) and central bank open market operations.',
    canonicalInvariant:
      'At the Zero Lower Bound (ZLB 0%), short-term government bonds and money become perfect substitutes; money velocity V collapses endogenously, breaking the mechanical link between money supply expansion and inflation.',
    instructorExplanation:
      'Under normal conditions (say, interest rates at 5%), holding cash costs you 5% in foregone interest. But at 0% interest, short-term treasury bills pay zero and cash pays zero: they are economically identical! When the central bank conducts Quantitative Easing by swapping bonds for bank reserves, commercial banks simply sit on excess reserves rather than lending them out. Money velocity V collapses proportionally, so doubling the monetary base (M) produces ZERO increase in nominal GDP or consumer price inflation.',
    q1Prompt:
      'The central bank of a country where short-term interest rates have reached 0% (the Zero Lower Bound) executes a massive Quantitative Easing program, doubling the monetary base from $1 Trillion to $2 Trillion.\n\nAccording to the classical Quantity Theory of Money (M * V = P * Y), what happens to consumer price inflation?',
    q1Options: [
      {
        id: 'opt-a',
        label: 'A',
        text: 'The price level (P) doubles immediately because doubling the money supply mechanically doubles consumer prices.',
        isCorrect: false,
        commonMisconception:
          'Constant velocity fallacy: assuming money velocity V is a fixed physical constant.',
        peerArgumentHint:
          'If banks just hoard the newly printed money in reserves, does that money enter the real economy?',
      },
      {
        id: 'opt-b',
        label: 'B',
        text: 'Inflation remains subdued because at 0% interest, money and government bonds become perfect substitutes, causing money velocity (V) to collapse endogenously.',
        isCorrect: true,
        peerArgumentHint:
          'Think of Japan in the 1990s-2010s: massive central bank balance sheets with persistent near-zero inflation.',
      },
      {
        id: 'opt-c',
        label: 'C',
        text: 'All prices drop to exactly zero because money becomes worthless.',
        isCorrect: false,
        commonMisconception:
          'Hyperinflationary nihilism: confusing liquidity trap dynamics with hyperinflation collapse.',
        peerArgumentHint: 'Liquidity traps produce disinflation, not zero prices.',
      },
    ],
    q1ClassroomVoteDistribution: {
      'opt-a': 0.49, // 49% predict immediate hyperinflation
      'opt-b': 0.37, // 37% correct liquidity trap
      'opt-c': 0.14, // 14% nihilism
    },
    simulatedPeers: [
      {
        peerName: 'Devon (Advocating Mechanical Inflation)',
        initialChoiceOptionId: 'opt-a',
        initialConfidence: 4,
        qualitativeArgument:
          'If you have twice as many dollar bills chasing the exact same amount of goods and services, the value of each dollar is cut in half! That is basic supply and demand. Every economics textbook says M * V = P * Y: if you double M, P must double!',
        heuristicMentalModel: 'Linear currency dilution with static transaction velocity.',
        counterArgumentTrigger:
          'What happens to V if banks leave the cash sitting inside the Federal Reserve vaults instead of lending it?',
      },
      {
        peerName: 'Cameron (Advocating Velocity Collapse)',
        initialChoiceOptionId: 'opt-b',
        initialConfidence: 5,
        qualitativeArgument:
          'The Quantity Theory assumes Velocity is constant, but in a liquidity trap, Velocity is dynamic! When interest rates hit 0%, holding bonds and holding cash pay the exact same return (zero). The central bank is just swapping a 0% bond for a 0% cash reserve. Nobody spends it; it just sits on bank balance sheets. Japan did this for 25 years and had deflation, not inflation!',
        heuristicMentalModel:
          'Endogenous velocity collapse in Keynesian liquidity preference equilibrium.',
        counterArgumentTrigger:
          'Why didn’t the US or Europe experience 100% inflation after the 2008 QE expansions?',
      },
    ],
    q2IsomorphicPrompt:
      'In decentralized cryptocurrency economics, a Proof-of-Stake blockchain network doubles its token staking rewards from 5% to 10% annually. However, network participants lock 95% of all minted tokens in cold-storage staking contracts rather than spending them on gas fees or decentralized exchanges. What happens to token transaction velocity and market exchange price?',
    q2Options: [
      {
        id: 'opt-q2-a',
        label: 'A',
        text: 'Token velocity collapses because high yield rewards hoarding, offsetting the inflationary dilution and stabilizing exchange prices.',
        isCorrect: true,
        peerArgumentHint:
          'Staking lockups act identically to excess bank reserves: sequestered liquidity eliminates velocity.',
      },
      {
        id: 'opt-q2-b',
        label: 'B',
        text: 'Token velocity increases tenfold because users trade more rapidly.',
        isCorrect: false,
        peerArgumentHint: 'Staking locks tokens, preventing trading.',
      },
      {
        id: 'opt-q2-c',
        label: 'C',
        text: 'The blockchain network immediately shuts down.',
        isCorrect: false,
        peerArgumentHint: 'Staking secures the chain, not shuts it.',
      },
    ],
    deepStructuralMapping:
      'Monetary expansion without circulation velocity does not generate transactional price dilution; sequestered liquidity traps prevent inflation.',
    surfaceContextDifference:
      'Central Bank quantitative easing and fiat paper currency vs blockchain proof-of-stake token staking contracts.',
    seedCards: [
      {
        front:
          'ConcepTest (Economics): Why does doubling the monetary base at 0% interest NOT double the price level?',
        back: 'In a liquidity trap (at the Zero Lower Bound), cash and short-term debt become perfect substitutes. Extra liquidity is hoarded as excess reserves rather than lent out, causing money velocity (V) to collapse proportionally in M * V = P * Y.',
        targetFactor: 'Liquidity Trap Velocity Collapse',
        cardDepth: 'concep_test',
      },
      {
        front:
          'ConcepTest Misconception: Why do classical economists assume inflation is always and everywhere monetary?',
        back: 'Classical models assume money velocity V is structurally fixed by payment habits. When interest rates drop to zero, velocity becomes endogenous and elastic, absorbing monetary shocks without price transmission.',
        targetFactor: 'Constant Velocity Fallacy',
        cardDepth: 'peer_dissonance',
      },
      {
        front:
          'Isomorphic Transfer: How does Proof-of-Stake token staking mimic central bank reserve hoarding?',
        back: 'Both sequester liquid assets away from transactional commerce. When users lock tokens in staking contracts for yield, circulating velocity drops, shielding exchange prices from inflationary issuance.',
        targetFactor: 'Staking Sequestration Transfer',
        cardDepth: 'isomorphic_transfer',
      },
    ],
  },
]
