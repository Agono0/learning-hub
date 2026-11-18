/**
 * Epistemic Curiosity & Information Gap Engine
 *
 * Grounded in:
 * - George Loewenstein (1994):
 *   "The Psychology of Curiosity: A Review and Reinterpretation"
 *   Information Gap Theory: Curiosity is an aversive state of deprivation that arises
 *   when attention is focused on an awareness gap between what is known and what one desires to know.
 * - Daniel E. Berlyne (1960, 1966):
 *   "Conflict, Arousal, and Curiosity"
 *   Epistemic curiosity triggered by collative variables: Novelty, Complexity, Ambiguity, Surprise, Incongruity.
 * - Min Jeong Kang et al. (2009):
 *   "The Wick in the Candle of Learning: Epistemic Curiosity Activates the Reward Circuit and Enhances Memory" (Neuron)
 *   fMRI findings: Anticipatory curiosity activates striatum/dopaminergic circuits, enhancing subsequent recall.
 */

// ============================================================================
// 1. Domain Types and Interfaces
// ============================================================================

export type CuriosityDriveType = 'epistemic' | 'perceptual'

export type CollativeVariable = 'novelty' | 'complexity' | 'ambiguity' | 'surprise' | 'incongruity'

export interface ProgressiveClue {
  readonly id: string
  readonly order: number
  readonly title: string
  readonly revealedFact: string
  readonly gapNarrowingScore: number // 0.0 to 1.0
  readonly curiositySpikeIntensity: number // 0.0 to 1.0
  readonly cognitiveDissonancePrompt: string
}

export interface IncongruityResolverOption {
  readonly id: string
  readonly text: string
  readonly isAccurateResolution: boolean
  readonly epistemicClosureScore: number // 0.0 to 1.0
  readonly explanatoryFeedback: string
  readonly conceptualShiftSummary: string
}

export interface CuriosityGapMystery {
  readonly id: string
  readonly title: string
  readonly domain: string
  readonly collativeVariable: CollativeVariable
  readonly paradoxHook: string
  readonly initialIntuitionTrap: string
  readonly epistemicDeprivationQuestion: string
  readonly deepScientificExplanation: string
  readonly targetResolutionInsight: string
  readonly clues: readonly ProgressiveClue[]
  readonly resolverOptions: readonly IncongruityResolverOption[]
}

export interface CuriosityMetrics {
  readonly priorKnowledgeLevel: number // 0.0 to 1.0
  readonly epistemicTensionScore: number // 0.0 to 1.0 (inverted-U peak around 0.5)
  readonly cluesRevealedCount: number
  readonly totalAvailableClues: number
  readonly gapSalienceIndex: number // 0.0 to 1.0
  readonly memoryFacilitationMultiplier: number // 1.0x to 1.85x (Kang et al. 2009)
  readonly isResolved: boolean
  readonly epistemicDriveStatus: 'dormant' | 'aroused' | 'peak_tension' | 'satiated'
}

export interface FSRSCuriosityCard {
  readonly id: string
  readonly mysteryId: string
  readonly paradoxHook: string
  readonly informationGapPrompt: string
  readonly resolutionInsight: string
  readonly counterIntuitiveTwist: string
  readonly kangDopamineRetentionNote: string
  readonly recommendedStabilityMultiplier: number
}

// ============================================================================
// 2. Calibrated Curiosity Mysteries
// ============================================================================

export const CALIBRATED_CURIOSITY_MYSTERIES: Record<string, CuriosityGapMystery> = {
  quantum_delayed_choice_eraser: {
    id: 'quantum_delayed_choice_eraser',
    title: 'The Delayed-Choice Quantum Eraser Paradox',
    domain: 'Quantum Optics & Foundations of Physics',
    collativeVariable: 'incongruity',
    paradoxHook:
      'In a double-slit experiment, photons build an interference wave pattern on a detector screen. If you measure which slit the photon passed through, the interference pattern disappears into two clumps. But what if you measure the path AFTER the photon has already hit the screen?',
    initialIntuitionTrap:
      'Common sense insists: "The photon already struck the detector screen in the past! Measuring it later cannot retroactively alter past physical history."',
    epistemicDeprivationQuestion:
      'Why does erasing "which-way" path information at a remote entangled detector retroactively restore the interference pattern in the sub-ensemble data?',
    deepScientificExplanation:
      'Quantum mechanics does not permit retrocausality. The total signal on the primary screen always looks like a uniform blur (no interference). However, when you sort the photons using coincidence counting with the entangled idler photons whose which-way info was erased, the sub-ensembles display complementary interference waves with a 180-degree phase shift that sum to a blur.',
    targetResolutionInsight:
      'Interference does not disappear from the physical universe; it hides in the quantum phase correlations between entangled pairs. Erasure allows sorting that reveals the latent wave nature.',
    clues: [
      {
        id: 'clue_entangled_downconversion',
        order: 1,
        title: 'Spontaneous Parametric Down-Conversion (BBO Crystal)',
        revealedFact:
          'Each photon passing through the double-slit is split into two entangled twin photons: a signal photon heading to primary detector D0, and an idler photon traveling down an optical delay line.',
        gapNarrowingScore: 0.25,
        curiositySpikeIntensity: 0.7,
        cognitiveDissonancePrompt:
          'If the signal photon hits screen D0 before the idler photon even reaches the first beam-splitter, how can the idler’s fate determine D0’s pattern?',
      },
      {
        id: 'clue_delayed_erasure_mechanism',
        order: 2,
        title: 'Optical Beam Splitters as Information Scramblers',
        revealedFact:
          'When the idler photon hits a 50/50 beam splitter, paths from slit 1 and slit 2 are combined symmetrically, rendering it physically impossible to determine which slit the twin originated from. The "which-path" information is permanently destroyed.',
        gapNarrowingScore: 0.55,
        curiositySpikeIntensity: 0.85,
        cognitiveDissonancePrompt:
          'Does destroying information physically alter the already-recorded hit on D0, or does it change what we are capable of learning about the entangled system?',
      },
      {
        id: 'clue_coincidence_counter_subensembles',
        order: 3,
        title: 'The Coincidence Counting Resolution',
        revealedFact:
          'Looking at detector D0 alone reveals ZERO interference pattern (saving the No-Signaling Theorem and Special Relativity!). Interference ONLY appears when you correlate D0 hits with clicks at the erasure detectors D1 and D2.',
        gapNarrowingScore: 0.9,
        curiositySpikeIntensity: 0.95,
        cognitiveDissonancePrompt:
          'Why do D1 and D2 produce two complementary interference patterns whose peaks and troughs cancel out into a smooth Gaussian blur?',
      },
    ],
    resolverOptions: [
      {
        id: 'opt_coincidence_phase_correlation',
        text: 'The total detector screen pattern is always an incoherent blur (respecting causality); erasing which-way info allows coincidence filtering into two out-of-phase interference sub-ensembles that sum to the blur.',
        isAccurateResolution: true,
        epistemicClosureScore: 1.0,
        explanatoryFeedback:
          'Flawless quantum closure! You avoided the sci-fi retrocausality trap: information was never sent backwards in time; rather, quantum entanglement holds phase correlations that only joint measurements can uncover.',
        conceptualShiftSummary:
          'Shifted from "magical time-traveling photon" to "entangled state correlation and coincidence filtering".',
      },
      {
        id: 'opt_retrocausal_time_travel',
        text: 'The beam splitter sends a tachyon signal backward in time that rewrites the trajectory of the photon before it hit the screen.',
        isAccurateResolution: false,
        epistemicClosureScore: 0.1,
        explanatoryFeedback:
          'Misconception: Tachyons and backwards-in-time signaling violate relativity and are physically unnecessary. Quantum mechanics preserves causality strictly via the No-Communication Theorem.',
        conceptualShiftSummary: 'Retained naive retrocausal sci-fi assumption.',
      },
      {
        id: 'opt_detector_hardware_noise',
        text: 'The detectors are simply malfunctioning due to laser heat and optical fiber resistance.',
        isAccurateResolution: false,
        epistemicClosureScore: 0.05,
        explanatoryFeedback:
          'Attentional slip: The Kim et al. (1999) experiment has been replicated thousands of times with single-photon avalanche photodiodes with picosecond precision.',
        conceptualShiftSummary:
          'Dismissed fundamental quantum optical phenomena as mechanical error.',
      },
    ],
  },

  synthetic_cdo_gaussian_copula: {
    id: 'synthetic_cdo_gaussian_copula',
    title: 'The 2008 Gaussian Copula AAA Illusion Paradox',
    domain: 'Quantitative Finance & Epistemic Systemic Risk',
    collativeVariable: 'surprise',
    paradoxHook:
      'In 2006, Wall Street investment banks took pools of subprime mortgage bonds rated BBB (junk-adjacent, 10% default risk) and bundled them into Synthetic CDOs. Rating agencies certified 80% of the resulting synthetic tranche as AAA—the exact same credit rating as US Treasury bonds. In 2008, all of them collapsed to zero.',
    initialIntuitionTrap:
      'Common sense says: "If you blend toxic sludge together with other toxic sludge, how can 80% of the mixture mathematically become pure drinking water?"',
    epistemicDeprivationQuestion:
      'What specific mathematical flaw in David Li’s Gaussian Copula formula allowed non-correlated diversification math to collapse when housing prices declined nationwide?',
    deepScientificExplanation:
      'Li’s formula mapped multi-dimensional credit default joint probabilities using Credit Default Swap (CDS) correlation parameters calibrated only during a 10-year nationwide housing boom. The model assumed tail independence: that defaults were independent Poisson processes except for a linear correlation coefficient. When home prices dropped nationally, default correlation abruptly jumped to 1.0 (tail dependence).',
    targetResolutionInsight:
      'Diversification assumes independent risk distributions. In systemic crises, correlation is non-linear and jumps to 1.0, turning the entire AAA tranche into a leveraged bet on a single macroeconomic variable.',
    clues: [
      {
        id: 'clue_tranche_subordination',
        order: 1,
        title: 'Waterfall Subordination & Equity Absorption',
        revealedFact:
          'In a CDO, the bottom "Equity" and "Mezzanine" tranches absorb the first 8% to 20% of losses. The Senior AAA tranche only takes losses AFTER the lower tranches are 100% wiped out.',
        gapNarrowingScore: 0.3,
        curiositySpikeIntensity: 0.65,
        cognitiveDissonancePrompt:
          'If lower tranches absorb the first 20% of defaults, why wasn’t the AAA tranche safe if historical subprime defaults averaged only 3% to 5%?',
      },
      {
        id: 'clue_gaussian_copula_correlation',
        order: 2,
        title: 'David Li’s Gaussian Copula Simplification (2000)',
        revealedFact:
          'Rather than calculating individual mortgage default probabilities, Li used CDS spreads to calculate asset correlation $\\rho$. The formula used the normal distribution, which has exponentially thin tails and zero tail dependence.',
        gapNarrowingScore: 0.65,
        curiositySpikeIntensity: 0.85,
        cognitiveDissonancePrompt:
          'What happens to a normal distribution when a 25-standard-deviation "Black Swan" event occurs?',
      },
      {
        id: 'clue_correlation_jump_to_one',
        order: 3,
        title: 'Dynamic Correlation Shock & Geographic Contagion',
        revealedFact:
          'Mortgage defaults in Florida and Nevada were treated as uncorrelated because they were 2,000 miles apart. But nationwide interest rate hikes and lending fraud meant both markets crashed simultaneously: correlation spiked from 0.2 to 0.98.',
        gapNarrowingScore: 0.95,
        curiositySpikeIntensity: 0.95,
        cognitiveDissonancePrompt:
          'When correlation becomes 1.0, does pooling 1,000 mortgages provide ANY diversification protection whatsoever?',
      },
    ],
    resolverOptions: [
      {
        id: 'opt_tail_dependence_collapse',
        text: 'The Gaussian Copula assumed zero tail dependence; when nationwide real estate prices fell, correlations jumped to 1.0, wiping out the subordination cushion and destroying the AAA tranche.',
        isAccurateResolution: true,
        epistemicClosureScore: 1.0,
        explanatoryFeedback:
          'Outstanding quantitative insight! Diversification is an illusion during systemic contagion because correlations are dynamic, not static constants.',
        conceptualShiftSummary:
          'Shifted from "fraudulent ratings" to "mathematical failure of static Gaussian tail independence in systemic shock".',
      },
      {
        id: 'opt_printing_money',
        text: 'Rating agencies simply made a typo in Excel spreadsheets, printing AAA instead of CCC.',
        isAccurateResolution: false,
        epistemicClosureScore: 0.1,
        explanatoryFeedback:
          'Naive misconception: The rating agency models passed all internal mathematical audits because the software assumed historical Gaussian parameters.',
        conceptualShiftSummary:
          'Blamed random clerical errors rather than structural mathematical model fragility.',
      },
    ],
  },

  antagonistic_pleiotropy_senescence: {
    id: 'antagonistic_pleiotropy_senescence',
    title: 'The Antagonistic Pleiotropy Aging Paradox',
    domain: 'Evolutionary Biology & Senescence Genetics',
    collativeVariable: 'complexity',
    paradoxHook:
      'Natural selection relentlessly weeds out genetic defects that impair biological function. Yet every human being, mammal, and vertebrate undergoes inevitable biological senescence: arteries harden, telomeres fray, organ failure ensues. Why has 3.8 billion years of ruthless natural selection failed to eliminate aging?',
    initialIntuitionTrap:
      'Common sense suggests: "Aging happens because cells just wear out like car parts," or "We age to make room for the next generation (group selection)."',
    epistemicDeprivationQuestion:
      'Why does natural selection actively select FOR genes that cause lethal organ failure, Alzheimer’s, and cancer in old age?',
    deepScientificExplanation:
      'George C. Williams (1957) demonstrated Antagonistic Pleiotropy: a gene that grants a reproductive fitness advantage early in life (e.g. enhanced calcium bone mineralization at age 18) will be favored by natural selection even if that exact same gene causes lethal calcification of cardiovascular arteries at age 70. Extrinsic mortality in the wild (predators, disease, starvation) means few animals live to old age, making early fitness infinitely more valuable to gene transmission than late survival.',
    targetResolutionInsight:
      'Natural selection has no foresight and cares only about allele frequency replication: early reproductive success vastly outweighs late-life survival.',
    clues: [
      {
        id: 'clue_extrinsic_mortality_hazard',
        order: 1,
        title: 'The Force of Natural Selection Declines with Age (Medawar 1952)',
        revealedFact:
          'Even in an immortal species that never ages, hazards in the wild (infections, predators, hypothermia) kill a fixed percentage per year. Consequently, very few individuals survive to old age, meaning mutations expressed only in late life are effectively invisible to natural selection.',
        gapNarrowingScore: 0.35,
        curiositySpikeIntensity: 0.7,
        cognitiveDissonancePrompt:
          'If a lethal mutation only activates at age 90, after you have already had 5 children, how can natural selection eliminate that gene from the gene pool?',
      },
      {
        id: 'clue_tradeoff_early_fertility',
        order: 2,
        title: 'George C. Williams’ Antagonistic Pleiotropy Hypothesis (1957)',
        revealedFact:
          'Pleiotropy means one gene influences multiple distinct traits. If gene A boosts early reproductive fertility by 15%, but causes severe prostate cancer or osteoarthritis at age 65, that gene will spread explosively across the population.',
        gapNarrowingScore: 0.7,
        curiositySpikeIntensity: 0.9,
        cognitiveDissonancePrompt:
          'Which allele wins the evolutionary race: one that gives 4 children and dying at 50, or one that gives 2 children and living to 100?',
      },
      {
        id: 'clue_p53_stem_cell_senescence',
        order: 3,
        title: 'Modern Genetic Proof: The p53 Tumor Suppressor Dilemma',
        revealedFact:
          'The tumor suppressor gene p53 prevents cancer in young organisms by forcing damaged cells into apoptosis or permanent senescence. But in old age, continuous p53 activation exhausts the body’s adult stem cell reserves, causing tissue atrophy and organ aging.',
        gapNarrowingScore: 0.95,
        curiositySpikeIntensity: 0.95,
        cognitiveDissonancePrompt:
          'Can we simply "turn off" the genes of aging without causing an explosion of lethal metastatic cancer in youth?',
      },
    ],
    resolverOptions: [
      {
        id: 'opt_antagonistic_tradeoff',
        text: 'Genes that boost early fertility spread rapidly even if they cause lethal senescence later, because the force of natural selection drops sharply after reproduction, making aging a byproduct of early fitness optimization.',
        isAccurateResolution: true,
        epistemicClosureScore: 1.0,
        explanatoryFeedback:
          'Flawless evolutionary biology! Aging is not an adaptive program for the species; it is an unavoidable genetic tradeoff where natural selection prioritizes youth reproduction over post-reproductive longevity.',
        conceptualShiftSummary:
          'Shifted from "wear-and-tear" or "altruistic group selection" to "antagonistic pleiotropic trade-offs in individual allele frequencies".',
      },
      {
        id: 'opt_group_selection_space',
        text: 'Species deliberately evolve aging so old organisms die off to make room for younger generations to evolve faster.',
        isAccurateResolution: false,
        epistemicClosureScore: 0.15,
        explanatoryFeedback:
          'Misconception: Group selection ("for the good of the species") is mathematically unstable against selfish mutant cheaters who live longer and reproduce more.',
        conceptualShiftSummary: 'Relied on discredited group-selection folk biology.',
      },
    ],
  },
  fermi_paradox_great_filter: {
    id: 'fermi_paradox_great_filter',
    title: 'The Fermi Paradox & The Great Filter Bottleneck',
    domain: 'Astrobiology, Evolutionary Invariance & Existential Risk',
    collativeVariable: 'ambiguity',
    paradoxHook:
      'There are ~100 billion stars in the Milky Way, billions of Earth-like habitable-zone rocky planets, and the universe is 13.8 billion years old—nearly three times older than Earth. With self-replicating probes travelling at just 1% light speed, a civilization can colonize the entire galaxy in under 20 million years. Yet all our astronomical surveys reveal eerie, deafening cosmic silence ("Where is everybody?").',
    initialIntuitionTrap:
      'Common sense assumes: "Interstellar space is simply too vast, or advanced extraterrestrial species are hiding under a benevolent Zoo Hypothesis waiting for humanity to spiritually mature."',
    epistemicDeprivationQuestion:
      'Why did philosopher Nick Bostrom argue that discovering fossilized multicellular life on Mars would be by far the worst news ever printed on the front page of a newspaper?',
    deepScientificExplanation:
      'Robin Hanson (1998) & Nick Bostrom (2002): The Great Filter states there is at least one nearly insurmountable transition step between prebiotic chemistry and an enduring star-spanning civilization. If the Filter is behind us (e.g. abiogenesis or eukaryogenesis is a one-in-a-trillion cosmic accident), humanity is exceptionally fortunate and our future is open. If we discover that multicellular life evolved independently on Mars, it proves that biological transitions are easy and common—meaning the nearly impassable filter must lie ahead in our immediate technological future (runaway AGI, nuclear self-destruction, engineered pathogens).',
    targetResolutionInsight:
      'The probability mass of the existential barrier must sum to near certainty across the trajectory. Eliminating past biological hurdles mathematically shifts the Filter directly into civilization’s technological horizon.',
    clues: [
      {
        id: 'clue_fermi_timescales',
        order: 1,
        title: 'Von Neumann Exponential Wavefront Dynamics',
        revealedFact:
          'A star-faring civilization launching self-replicating probes at sub-relativistic speeds (0.01c to 0.05c) will saturate every star system in the Milky Way in 10 to 30 million years—a mere 0.2% of the age of the galaxy.',
        gapNarrowingScore: 0.3,
        curiositySpikeIntensity: 0.75,
        cognitiveDissonancePrompt:
          'If galactic colonization requires a geological blink of an eye, why hasn’t a single Dyson sphere or radio beacon been detected in 13.8 billion years?',
      },
      {
        id: 'clue_evolutionary_transition_bottlenecks',
        order: 2,
        title: 'The Prebiotic to Eukaryotic Hard-Step Gauntlet',
        revealedFact:
          'Earth required ~1 billion years for abiogenesis, but over 2 billion additional years for the singular endosymbiotic merger that formed the eukaryotic cell with mitochondria. Complex life occurred exactly ONCE in 4 billion years.',
        gapNarrowingScore: 0.65,
        curiositySpikeIntensity: 0.85,
        cognitiveDissonancePrompt:
          'Could the sheer improbability of endosymbiosis be the sole reason the galaxy is silent, making humanity the unique spearhead of cosmic consciousness?',
      },
      {
        id: 'clue_bostrom_grim_mars_theorem',
        order: 3,
        title: 'Bostrom’s Probability Invariant & Martian Fossils',
        revealedFact:
          'If independent life is discovered on Mars, the hypothesis of a past biological bottleneck is shattered. The product of all transition probabilities must remain minuscule—so the catastrophic filter MUST lie between industrial civilization and interstellar longevity.',
        gapNarrowingScore: 0.95,
        curiositySpikeIntensity: 0.95,
        cognitiveDissonancePrompt:
          'Why does every living Martian microbe reduce the mathematical odds of human civilization surviving the next two centuries?',
      },
    ],
    resolverOptions: [
      {
        id: 'opt_filter_probability_shift',
        text: 'The total probability of reaching interstellar expansion is infinitesimally small. Finding complex life on Mars eliminates past evolutionary barriers, shifting the near-certain fatal bottleneck ahead of humanity into our technological future.',
        isAccurateResolution: true,
        epistemicClosureScore: 1.0,
        explanatoryFeedback:
          'Brilliant epistemic deduction! You resolved Bostrom’s and Hanson’s Great Filter invariant: the silence of the skies is a grim statistical warning. If the past was easy, the future is an existential minefield.',
        conceptualShiftSummary:
          'Shifted from naive "space is big" complacency to rigorous "Great Filter probabilistic conservation" insight.',
      },
      {
        id: 'opt_simulation_or_dark_forest',
        text: 'Civilizations are simply hiding in radio silence because hostile predator civilizations destroy any world that emits EM signatures.',
        isAccurateResolution: false,
        epistemicClosureScore: 0.35,
        explanatoryFeedback:
          'Incomplete hypothesis: The Liu Cixin "Dark Forest" requires 100% uniformity of civilizational paranoia across billions of worlds over billions of years; a single reckless outlier would have colonized the galaxy.',
        conceptualShiftSummary:
          'Relied on sociological uniformity assumptions that fail under evolutionary game theory.',
      },
    ],
  },
}

// ============================================================================
// 3. Mathematical Core: Loewenstein Inverted-U & Kang Memory Multipliers
// ============================================================================

/**
 * Calculates Loewenstein's (1994) Epistemic Tension Score.
 * Curiosity is low when knowledge is zero (unaware of what is missing).
 * Peaks at intermediate knowledge (~0.5) when the information gap is sharpest and most salient.
 * Falls when knowledge approaches 1.0 (satiation).
 *
 * T_epistemic = 4 * k * (1 - k) * (1 + 0.3 * collativeWeight)
 */
export function calculateLoewensteinEpistemicTension(
  perceivedKnowledge: number, // 0.0 to 1.0
  collativeDimension: CollativeVariable,
): number {
  const k = Math.max(0.01, Math.min(0.99, perceivedKnowledge))

  const collativeWeights: Record<CollativeVariable, number> = {
    novelty: 0.15,
    complexity: 0.2,
    ambiguity: 0.25,
    surprise: 0.35,
    incongruity: 0.45,
  }

  const weight = collativeWeights[collativeDimension]
  const baseInvertedU = 4 * k * (1 - k)
  const tension = baseInvertedU * (1 + weight)

  return Math.round(Math.min(1.0, tension) * 100) / 100
}

/**
 * Calculates Kang et al. (2009) Memory Facilitation Multiplier:
 * High anticipatory epistemic curiosity triggers striatal dopamine release,
 * boosting subsequent memory consolidation and long-term retention.
 *
 * M_curiosity = 1.0 + 0.75 * epistemicTension * (1 - cluesRevealed / (2 * totalClues))
 */
export function calculateMemoryFacilitationMultiplier(
  epistemicTensionScore: number,
  cluesRevealedCount: number,
  totalAvailableClues: number,
): number {
  const clueDampener = totalAvailableClues > 0 ? cluesRevealedCount / (totalAvailableClues * 2) : 0

  const multiplier = 1.0 + 0.75 * epistemicTensionScore * (1 - clueDampener)
  return Math.round(Math.min(1.85, Math.max(1.0, multiplier)) * 100) / 100
}

/**
 * Evaluates the Epistemic Drive Status:
 * - 'satiated': when mystery is solved
 * - 'peak_tension': when epistemic tension >= 0.75
 * - 'aroused': when epistemic tension >= 0.4
 * - 'dormant': when epistemic tension < 0.4
 */
export function evaluateEpistemicDriveStatus(
  epistemicTension: number,
  isResolved: boolean,
): CuriosityMetrics['epistemicDriveStatus'] {
  if (isResolved) return 'satiated'
  if (epistemicTension >= 0.75) return 'peak_tension'
  if (epistemicTension >= 0.4) return 'aroused'
  return 'dormant'
}

/**
 * Calculates Gruber et al. (2014 Neuron) Incidental Memory Priming Score.
 * Research demonstrates that high states of epistemic curiosity create a generalized
 * dopaminergic environment in the substantia nigra/ventral tegmental area (SN/VTA)
 * and hippocampus, enhancing retention for completely unrelated incidental material
 * presented during the temporal window of arousal.
 *
 * @param epistemicTension The current Loewenstein tension score [0.0, 1.0]
 * @param temporalProximitySeconds Elapsed seconds since curiosity peak arousal
 * @returns Incidental memory facilitation score multiplier [1.0, 1.45]
 */
export function calculateIncidentalPrimingScore(
  epistemicTension: number,
  temporalProximitySeconds = 0,
): number {
  const tensionClamped = Math.max(0, Math.min(1.0, epistemicTension))
  const decayHalfLifeSeconds = 120 // Dopaminergic priming decays over ~2 minutes
  const temporalDecay = Math.exp(
    (-1 * Math.log(2) * Math.max(0, temporalProximitySeconds)) / decayHalfLifeSeconds,
  )

  const boost = 0.45 * tensionClamped * temporalDecay
  return Math.round((1.0 + boost) * 100) / 100
}

/**
 * Calculates Loewenstein's (1994) Epistemic Deprivation Gradient.
 * Quantifies the perceived urgency of closing the information gap as the ratio
 * between awareness of missing information and actual baseline certainty.
 *
 * @param perceivedKnowledge Current knowledge level [0.0, 1.0]
 * @param clueSalience Ratio of revealed clues [0.0, 1.0]
 * @returns Deprivation gradient index [0.0, 1.0]
 */
export function calculateEpistemicDeprivationGradient(
  perceivedKnowledge: number,
  clueSalience: number,
): number {
  const k = Math.max(0.01, Math.min(0.99, perceivedKnowledge))
  const salience = Math.max(0, Math.min(1.0, clueSalience))

  // The gradient is steepest when awareness of the missing piece is high (salience > 0.5)
  // but definitive explanatory closure has not yet occurred (k < 0.8)
  const missingRatio = 1.0 - k
  const gradient = Math.sin(Math.PI * salience * 0.5) * missingRatio * 1.2
  return Math.round(Math.min(1.0, Math.max(0.0, gradient)) * 100) / 100
}

// ============================================================================
// 4. Stateful Epistemic Information Gap Session Coordinator
// ============================================================================

export interface ClueRevealResult {
  readonly clue: ProgressiveClue
  readonly newPerceivedKnowledge: number
  readonly newEpistemicTension: number
  readonly memoryFacilitationMultiplier: number
}

export interface MysteryResolutionResult {
  readonly isAccurate: boolean
  readonly score: number
  readonly feedback: string
  readonly conceptualShift: string
  readonly memoryFacilitationMultiplier: number
}

export class InformationGapSession {
  private readonly mystery: CuriosityGapMystery
  private perceivedKnowledge = 0.25 // Starts with initial baseline paradox awareness
  private revealedClueIds: Set<string> = new Set()
  private isResolved = false
  private selectedResolverOptionId: string | null = null

  constructor(mysteryId: string) {
    const m = CALIBRATED_CURIOSITY_MYSTERIES[mysteryId]
    if (!m) {
      throw new Error(`Unknown curiosity mystery: ${mysteryId}`)
    }
    this.mystery = m
  }

  getMystery(): CuriosityGapMystery {
    return this.mystery
  }

  getPerceivedKnowledge(): number {
    return this.perceivedKnowledge
  }

  setPerceivedKnowledge(k: number): void {
    this.perceivedKnowledge = Math.max(0.05, Math.min(0.95, k))
  }

  revealClue(clueId: string): ClueRevealResult {
    const clue = this.mystery.clues.find((c) => c.id === clueId)
    if (!clue) throw new Error(`Clue ${clueId} not found in mystery ${this.mystery.id}`)

    this.revealedClueIds.add(clueId)

    // Narrow information gap: advance perceived knowledge
    this.perceivedKnowledge = Math.min(0.9, this.perceivedKnowledge + clue.gapNarrowingScore * 0.2)

    const tension = calculateLoewensteinEpistemicTension(
      this.perceivedKnowledge,
      this.mystery.collativeVariable,
    )

    const mult = calculateMemoryFacilitationMultiplier(
      tension,
      this.revealedClueIds.size,
      this.mystery.clues.length,
    )

    return {
      clue,
      newPerceivedKnowledge: this.perceivedKnowledge,
      newEpistemicTension: tension,
      memoryFacilitationMultiplier: mult,
    }
  }

  resolveMystery(optionId: string): MysteryResolutionResult {
    const option = this.mystery.resolverOptions.find((o) => o.id === optionId)
    if (!option)
      throw new Error(`Resolver option ${optionId} not found in mystery ${this.mystery.id}`)

    this.selectedResolverOptionId = optionId
    this.isResolved = option.isAccurateResolution

    if (this.isResolved) {
      this.perceivedKnowledge = 0.95 // Epistemic gap successfully closed
    }

    const metrics = this.getMetrics()

    return {
      isAccurate: option.isAccurateResolution,
      score: option.epistemicClosureScore,
      feedback: option.explanatoryFeedback,
      conceptualShift: option.conceptualShiftSummary,
      memoryFacilitationMultiplier: metrics.memoryFacilitationMultiplier,
    }
  }

  getMetrics(): CuriosityMetrics {
    const tension = calculateLoewensteinEpistemicTension(
      this.perceivedKnowledge,
      this.mystery.collativeVariable,
    )

    const mult = calculateMemoryFacilitationMultiplier(
      tension,
      this.revealedClueIds.size,
      this.mystery.clues.length,
    )

    const salience =
      Math.round((this.revealedClueIds.size / Math.max(1, this.mystery.clues.length)) * 100) / 100

    const driveStatus = evaluateEpistemicDriveStatus(tension, this.isResolved)

    return {
      priorKnowledgeLevel: Math.round(this.perceivedKnowledge * 100) / 100,
      epistemicTensionScore: tension,
      cluesRevealedCount: this.revealedClueIds.size,
      totalAvailableClues: this.mystery.clues.length,
      gapSalienceIndex: salience,
      memoryFacilitationMultiplier: mult,
      isResolved: this.isResolved,
      epistemicDriveStatus: driveStatus,
    }
  }

  exportFSRSCards(): readonly FSRSCuriosityCard[] {
    const metrics = this.getMetrics()

    return [
      {
        id: `fsrs_curiosity_${this.mystery.id}`,
        mysteryId: this.mystery.id,
        paradoxHook: this.mystery.paradoxHook,
        informationGapPrompt: `[Epistemic Information Gap: ${this.mystery.title}]\n${this.mystery.epistemicDeprivationQuestion}`,
        resolutionInsight: this.mystery.targetResolutionInsight,
        counterIntuitiveTwist: this.mystery.initialIntuitionTrap,
        kangDopamineRetentionNote:
          'Min Jeong Kang et al. (2009, Neuron): Memory retention for paradox resolutions is boosted up to 85% when preceded by intense epistemic curiosity priming.',
        recommendedStabilityMultiplier: metrics.memoryFacilitationMultiplier,
      },
    ]
  }
}
