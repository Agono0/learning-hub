/**
 * Reciprocal Teaching & Dialogic Questioning Engine
 *
 * Grounded in:
 * - Palincsar & Brown (1984): Reciprocal Teaching of Comprehension-Fostering
 *   and Comprehension-Monitoring Activities (d ≈ 0.88 effect size).
 * - Chi & Wylie (2014): The ICAP Framework: Linking Cognitive Engagement
 *   to Active Learning Outcomes (Interactive > Constructive > Active > Passive).
 * - Alison King (1990, 1994, 1999): Guided Reciprocal Peer Questioning
 *   and Thought-Provoking Question Stems.
 *
 * Implements:
 * 1. 4 Reciprocal Strategies (Questioner / Clarifier / Summarizer / Predictor)
 * 2. ICAP Taxonomy Classifier & Composite Score (ICS ∈ [0, 100])
 * 3. Reciprocal Strategy Balance Score (RSBS ∈ [0, 100], Shannon entropy-based)
 * 4. Elaboration Depth Index (EDI ∈ [0, 100]) with causal connector parsing
 * 5. Metacognitive Repair Ratio (MRR ∈ [0, 1])
 * 6. Reciprocal Dialogue Maturity Score (RDMS ∈ [0, 100])
 * 7. Deterministic Peer Dialogic Agent Simulation (Socratic co-learner)
 * 8. FSRS-6 Spaced Repetition Calibrated Deck Generator
 * 9. 5 Canonical Multidisciplinary Complex Texts
 */

import { z } from 'zod'

// ============================================================================
// 1. Zod Enums & Schemas
// ============================================================================

export const ReciprocalRoleEnum = z.enum(['questioner', 'clarifier', 'summarizer', 'predictor'])
export type ReciprocalRole = z.infer<typeof ReciprocalRoleEnum>

export const ICAPLevelEnum = z.enum(['passive', 'active', 'constructive', 'interactive'])
export type ICAPLevel = z.infer<typeof ICAPLevelEnum>

export const QuestionStemCategoryEnum = z.enum([
  'comprehension_thinking',
  'causal_explanation',
  'counterfactual_inference',
  'evaluative_epistemic',
])
export type QuestionStemCategory = z.infer<typeof QuestionStemCategoryEnum>

export const QuestionStemSchema = z.object({
  id: z.string(),
  category: QuestionStemCategoryEnum,
  role: ReciprocalRoleEnum,
  stem: z.string(),
  rationale: z.string(),
  icapTarget: ICAPLevelEnum,
})
export type QuestionStem = z.infer<typeof QuestionStemSchema>

export const MisconceptionItemSchema = z.object({
  id: z.string(),
  misconception: z.string(),
  clarification: z.string(),
  evidence: z.string(),
})
export type MisconceptionItem = z.infer<typeof MisconceptionItemSchema>

export const PredictivePromptSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  expectedMechanism: z.string(),
  falsificationScenario: z.string(),
})
export type PredictivePrompt = z.infer<typeof PredictivePromptSchema>

export const TextPassageSchema = z.object({
  id: z.string(),
  title: z.string(),
  discipline: z.enum([
    'evolutionary_biology',
    'computer_science',
    'astrophysics',
    'macroeconomics',
    'neurobiology',
  ]),
  difficulty: z.enum(['introductory', 'intermediate', 'advanced']),
  wordCount: z.number(),
  content: z.string(),
  coreThesis: z.string(),
  keyMechanisms: z.array(z.string()),
  commonMisconceptions: z.array(MisconceptionItemSchema),
  stems: z.array(QuestionStemSchema),
  predictivePrompts: z.array(PredictivePromptSchema),
})
export type TextPassage = z.infer<typeof TextPassageSchema>

export const DialogueTurnSchema = z.object({
  id: z.string(),
  speaker: z.enum(['user', 'peer_agent', 'tutor']),
  role: ReciprocalRoleEnum,
  turnIndex: z.number().int().nonnegative(),
  text: z.string().min(1),
  stemId: z.string().optional(),
  timestamp: z.number(),
  targetTurnId: z.string().optional(),
  icapLevel: ICAPLevelEnum,
  elaborationScore: z.number().min(0).max(100),
  resolvedMisconceptionId: z.string().optional(),
})
export type DialogueTurn = z.infer<typeof DialogueTurnSchema>

export const ICAPDistributionSchema = z.object({
  passiveRatio: z.number().min(0).max(1),
  activeRatio: z.number().min(0).max(1),
  constructiveRatio: z.number().min(0).max(1),
  interactiveRatio: z.number().min(0).max(1),
  ics: z.number().min(0).max(100),
})
export type ICAPDistribution = z.infer<typeof ICAPDistributionSchema>

export const StrategyBalanceSchema = z.object({
  roleFrequencies: z.record(ReciprocalRoleEnum, z.number()),
  rsbs: z.number().min(0).max(100),
  dominantRole: ReciprocalRoleEnum,
  neglectedRoles: z.array(ReciprocalRoleEnum),
})
export type StrategyBalance = z.infer<typeof StrategyBalanceSchema>

export const ElaborationMetricsSchema = z.object({
  avgScore: z.number().min(0).max(100),
  edi: z.number().min(0).max(100),
  causalConnectorsCount: z.number().int().nonnegative(),
  depthCategory: z.enum(['superficial', 'moderate', 'deep', 'profound']),
})
export type ElaborationMetrics = z.infer<typeof ElaborationMetricsSchema>

export const MetacognitiveRepairMetricsSchema = z.object({
  attemptedRepairs: z.number().int().nonnegative(),
  successfulRepairs: z.number().int().nonnegative(),
  mrr: z.number().min(0).max(1),
})
export type MetacognitiveRepairMetrics = z.infer<typeof MetacognitiveRepairMetricsSchema>

export const ReciprocalEvaluationSchema = z.object({
  totalTurns: z.number().int().nonnegative(),
  userTurnsCount: z.number().int().nonnegative(),
  icap: ICAPDistributionSchema,
  strategy: StrategyBalanceSchema,
  elaboration: ElaborationMetricsSchema,
  repair: MetacognitiveRepairMetricsSchema,
  rdms: z.number().min(0).max(100),
  masteryBand: z.enum([
    'novice_passive',
    'developing_active',
    'proficient_constructive',
    'mastery_interactive',
  ]),
  feedback: z.array(z.string()),
  recommendations: z.array(z.string()),
})
export type ReciprocalEvaluation = z.infer<typeof ReciprocalEvaluationSchema>

export const CalibratedReciprocalCardSchema = z.object({
  id: z.string(),
  role: ReciprocalRoleEnum,
  front: z.string(),
  back: z.string(),
  rationale: z.string(),
  icapLevel: ICAPLevelEnum,
  fsrsParameters: z.object({
    stability: z.number(),
    difficulty: z.number(),
  }),
  tags: z.array(z.string()),
})
export type CalibratedReciprocalCard = z.infer<typeof CalibratedReciprocalCardSchema>

export const CalibratedReciprocalDeckSchema = z.object({
  passageId: z.string(),
  passageTitle: z.string(),
  generatedAt: z.number(),
  rdmsBaseline: z.number(),
  cards: z.array(CalibratedReciprocalCardSchema),
})
export type CalibratedReciprocalDeck = z.infer<typeof CalibratedReciprocalDeckSchema>

// ============================================================================
// 2. Causal Markers & Cognitive Lexicons
// ============================================================================

export const CAUSAL_CONNECTORS = [
  'because',
  'consequently',
  'therefore',
  'thus',
  'whereas',
  'in contrast',
  'leads to',
  'results from',
  'under the condition',
  'mechanism',
  'induces',
  'catalyzes',
  'inhibits',
  'regulates',
  'if and only if',
  'demonstrates that',
  'falsifies',
  'reinforces',
  'counterexample',
  'analogous to',
]

export const INTERACTIVE_MARKERS = [
  'building on what you said',
  'i agree with your point about',
  'however, consider that',
  'to push your hypothesis further',
  'what if instead of',
  'your summary overlooks',
  'how do you reconcile that with',
  'contrasting with your claim',
  'as you noted earlier',
  'could we synthesize this by',
]

// ============================================================================
// 3. 5 Canonical Multidisciplinary Text Passages
// ============================================================================

export const CANONICAL_TEXT_PASSAGES: TextPassage[] = [
  {
    id: 'passage-endosymbiosis',
    title: 'Lynn Margulis & The Serial Endosymbiotic Theory',
    discipline: 'evolutionary_biology',
    difficulty: 'intermediate',
    wordCount: 385,
    content: `In 1967, Lynn Margulis published her revolutionary treatise arguing that eukaryotic organelles—specifically mitochondria and plastids—did not originate through gradual, endogenous compartmentalization of a proto-eukaryotic cell. Instead, she posited that they originated via serial endosymbiosis: permanent mutualistic incorporation of free-living prokaryotic endosymbionts. 

Mitochondria trace their lineage to an ancient engulfment of an aerobic alpha-proteobacterium by an anaerobic archaeal host cell (Asgard-related lineage), providing ATP through oxidative phosphorylation in an oxygenating biosphere. Decades of biochemical and genomic sequencing have decisively ratified this paradigm. 

Key architectural hallmarks confirm their exogenous descent: mitochondria possess their own closed-circular, non-histone-bound DNA (mtDNA); they reproduce autonomously via binary fission rather than eukaryotic mitosis; their inner membranes contain cardiolipin, a phospholipid ubiquitous in bacterial membranes but absent in eukaryotic plasma membranes; and their transcriptional and translational machinery utilizes 70S ribosomes sensitive to chloramphenicol and streptomycin, rather than eukaryotic 80S ribosomes. 

Despite initial fierce skepticism from the neo-Darwinian synthesis, which privileged point mutations within single lineages, endosymbiosis demonstrated that major macroevolutionary transitions can occur through symbiogenesis—the fusion of disparate genomic lineages into a novel, integrated organismal continuum.`,
    coreThesis:
      'Eukaryotic mitochondria and plastids evolved through symbiogenesis—the permanent endosymbiotic engulfment and genetic integration of formerly free-living prokaryotic lineages.',
    keyMechanisms: [
      'Engulfment of alpha-proteobacterium by anaerobic archaeon',
      'Autonomous replication via binary fission with circular mtDNA',
      'Bacterial cardiolipin in inner mitochondrial membrane',
      '70S ribosomal sensitivity to bacterial antibiotics',
      'Massive horizontal gene transfer to host nuclear genome',
    ],
    commonMisconceptions: [
      {
        id: 'misc-endo-1',
        misconception:
          'Mitochondria formed by the host cell membrane pinching inwards to create organelles.',
        clarification:
          'Mitochondria possess double membranes from engulfment: inner bacterial membrane and outer phagosomal host membrane, disproving endogenous pinching.',
        evidence:
          'Inner membrane cardiolipin and circular bacterial mtDNA prove distinct prokaryotic origin.',
      },
      {
        id: 'misc-endo-2',
        misconception:
          'The engulfed bacterium was instantly domesticated without genetic transfer.',
        clarification:
          'Over hundreds of millions of years, most endosymbiont genes migrated to the host nucleus, leaving modern mitochondria dependent on nuclear-encoded proteins.',
        evidence:
          'Over 95% of the mitochondrial proteome is encoded in nuclear DNA and imported via TIM/TOM complexes.',
      },
    ],
    stems: [
      {
        id: 'stem-endo-q1',
        category: 'causal_explanation',
        role: 'questioner',
        stem: 'What specific structural evidence causally proves that the inner mitochondrial membrane is bacterial rather than eukaryotic in origin?',
        rationale: 'Directs attention to cardiolipin and transport complexes.',
        icapTarget: 'constructive',
      },
      {
        id: 'stem-endo-c1',
        category: 'comprehension_thinking',
        role: 'clarifier',
        stem: 'Why did the host cell not simply digest the engulfed alpha-proteobacterium via phagocytosis?',
        rationale: 'Focuses on metabolic synergy: ATP surplus vs. nutrient consumption.',
        icapTarget: 'constructive',
      },
      {
        id: 'stem-endo-s1',
        category: 'evaluative_epistemic',
        role: 'summarizer',
        stem: 'How would you summarize the core evolutionary difference between gradual mutation and symbiogenesis in one concise principle?',
        rationale: 'Forces synthesis of lineage fusion vs branch bifurcation.',
        icapTarget: 'constructive',
      },
      {
        id: 'stem-endo-p1',
        category: 'counterfactual_inference',
        role: 'predictor',
        stem: 'What would happen if an aerobic eukaryotic cell were treated with chloramphenicol, and why would mitochondrial function be preferentially arrested?',
        rationale: 'Tests understanding of 70S vs 80S ribosomal susceptibility.',
        icapTarget: 'interactive',
      },
    ],
    predictivePrompts: [
      {
        id: 'pred-endo-1',
        prompt:
          'If we discovered a single-celled eukaryote without mitochondria, what are the two distinct evolutionary explanations that must be tested?',
        expectedMechanism:
          'Primary amitochondriate (archezoan pre-dating endosymbiosis) versus secondary loss/reduction (hydrogenosomes/mitosomes derived from degenerate mitochondria).',
        falsificationScenario:
          'Finding residual nuclear genes of alpha-proteobacterial origin proves secondary degeneration rather than primitive absence.',
      },
    ],
  },
  {
    id: 'passage-halting-problem',
    title: 'Alan Turing & The Undecidability of the Halting Problem',
    discipline: 'computer_science',
    difficulty: 'advanced',
    wordCount: 412,
    content: `In 1936, Alan Turing established the definitive mathematical boundaries of algorithmic computation by resolving David Hilbert’s third question of the Entscheidungsproblem: whether an algorithm exists that can decide, for every formal first-order statement, whether it is logically valid. 

Turing formalized algorithmic procedures via the abstract concept of the Turing Machine—a finite-state automaton operating on an infinite tape with discrete symbol read-write heads. He then posed the Halting Problem: can there exist a universal decider machine, H, that takes the source code description of any arbitrary Turing machine M and an input w, and terminates in finite time correctly outputting true if M(w) halts, and false if M(w) loops infinitely?

Turing proved this is mathematically impossible using an ingenious self-referential diagonalization argument. Suppose such a universal halt decider H(M, w) exists. We can construct an adversarial machine, D, that accepts a machine description M as input. Machine D internally calls H(M, M)—running the decider on M applied to its own code. 

If H(M, M) outputs "halts", machine D intentionally executes an infinite loop. Conversely, if H(M, M) outputs "loops", machine D immediately halts. Now consider what occurs when we execute D with its own description as input: D(D). 

If D(D) halts, then by definition of D, H(D, D) must have returned "loops", which means D(D) does not halt—a direct logical contradiction. If D(D) does not halt, then H(D, D) must have returned "halts", which means D(D) halts—another direct logical contradiction. 

Because both possible outcomes yield a strict contradiction, the initial hypothesis that the decider machine H exists is decisively falsified. Undecidability is an inherent topological limitation of deterministic axiomatic systems, not a temporary engineering hurdle.`,
    coreThesis:
      'The Halting Problem is fundamentally undecidable because the assumption of a universal termination decider permits the construction of a self-referential adversarial machine that contradicts itself on its own description.',
    keyMechanisms: [
      'Formalization of computation as a Turing Machine with finite states and infinite tape',
      'Hypothesis of a universal halt decider H(M, w)',
      'Construction of adversarial inverted machine D(M)',
      'Self-referential execution D(D) leading to inescapable antinomy',
      'Proof by contradiction (reductio ad absurdum) establishing absolute uncomputability',
    ],
    commonMisconceptions: [
      {
        id: 'misc-halt-1',
        misconception:
          'The halting problem is undecidable only because our current computers do not have sufficient memory or processing speed.',
        clarification:
          'The undecidability is an invariant logical theorem of mathematics, true across all possible physical, quantum, or abstract computing architectures.',
        evidence: 'The diagonal contradiction holds regardless of speed or storage scale.',
      },
      {
        id: 'misc-halt-2',
        misconception: 'We cannot determine whether any computer program halts.',
        clarification:
          'We can easily determine termination for many specific programs (e.g. loops with bounded constant counters); what cannot exist is a single universal decider that succeeds on ALL arbitrary programs.',
        evidence: 'Turing specifically proved the non-existence of a universal decider H(M, w).',
      },
    ],
    stems: [
      {
        id: 'stem-halt-q1',
        category: 'causal_explanation',
        role: 'questioner',
        stem: 'Why is the self-application D(D) the critical linchpin of Turing’s proof rather than running D on an external program?',
        rationale: 'Forces focus on diagonalization and self-reference.',
        icapTarget: 'constructive',
      },
      {
        id: 'stem-halt-c1',
        category: 'comprehension_thinking',
        role: 'clarifier',
        stem: 'What is the precise logical contradiction that arises when we assume D(D) halts?',
        rationale: 'Clarifies the inverted conditional branching within machine D.',
        icapTarget: 'active',
      },
      {
        id: 'stem-halt-s1',
        category: 'evaluative_epistemic',
        role: 'summarizer',
        stem: 'How does Turing’s diagonalization parallel Cantor’s diagonal slash and Gödel’s First Incompleteness Theorem?',
        rationale: 'Synthesizes metalogical isomorphism across foundational mathematics.',
        icapTarget: 'interactive',
      },
      {
        id: 'stem-halt-p1',
        category: 'counterfactual_inference',
        role: 'predictor',
        stem: 'If we restricted our programming language so that all loops must have statically verifiable finite bounds, does the Halting Problem still apply?',
        rationale:
          'Tests understanding of Turing completeness and sub-recursive systems (e.g., total functional programming).',
        icapTarget: 'interactive',
      },
    ],
    predictivePrompts: [
      {
        id: 'pred-halt-1',
        prompt:
          'Rice’s Theorem states that any non-trivial semantic property of a program is undecidable. How does this generalize directly from Turing’s Halting proof?',
        expectedMechanism:
          'Any semantic property (e.g., does it compute square roots, is it virus-free) can be reduced to the halting problem via a simulator wrapper.',
        falsificationScenario:
          'If a semantic decider existed, it could solve halting by wrapping a target machine in an output trigger.',
      },
    ],
  },
  {
    id: 'passage-gravitational-time-dilation',
    title: 'Albert Einstein & Gravitational Time Dilation',
    discipline: 'astrophysics',
    difficulty: 'intermediate',
    wordCount: 395,
    content: `In his 1915 General Theory of Relativity, Albert Einstein revealed that gravity is not an attractive Newtonian force transmitted instantaneously across space, but rather the manifestation of spacetime curvature induced by mass-energy density. A direct, radical consequence of this curvature is gravitational time dilation: time passes strictly slower in stronger gravitational fields (closer to massive bodies) relative to regions of weaker gravitational potential.

This phenomenon was derived directly from the Equivalence Principle—the postulate that the local physical effects of a uniform gravitational field are indistinguishable from an accelerated reference frame. Imagine an accelerating rocket in deep space. A light signal emitted from the rocket's floor toward a detector on its ceiling must travel upward while the ceiling continuously accelerates away from the emitted photon. Consequently, the ceiling receiver measures a longer period between wave crests (Doppler redshift), indicating that the clock at the floor was ticking slower relative to the ceiling clock. 

By the equivalence principle, the exact same dilation must occur in a static gravitational field: an observer at sea level on Earth experiences time dilation relative to an observer atop Mount Everest. 

In 1959, the Pound-Rebka experiment at Harvard University conclusively verified this prediction using the Mössbauer effect. Emitting 14.4 keV gamma-ray photons from Iron-57 at the base of the Jefferson Laboratory tower and detecting them 22.5 meters higher, they observed a precise fractional frequency blueshift matching Einstein's equation: Δf / f = g·h / c². 

Today, this relativistic effect is vital to satellite navigation. GPS satellites orbiting at 20,200 km altitude experience less gravitational dilation (ticking ~45 microseconds faster per day due to general relativity) but also experience kinematic time dilation from their orbital speed (ticking ~7 microseconds slower per day due to special relativity). Net correction requires pre-biasing atomic clocks by +38 microseconds daily; without it, navigational accuracy would drift by over 11 kilometers every single day.`,
    coreThesis:
      'Gravitational time dilation is the geometric deceleration of proper time within deeper gravitational potential wells, necessitated by the Equivalence Principle and empirically ratified by the Pound-Rebka experiment and GPS atomic clock offsets.',
    keyMechanisms: [
      'Equivalence Principle connecting acceleration and gravitational fields',
      'Spacetime metric curvature (Schwarzschild metric g_00 component)',
      'Gravitational redshift of photons climbing out of potential wells',
      'Pound-Rebka Mössbauer spectroscopy verification',
      'Interplay of General Relativistic gravitational dilation (+45 μs/day) and Special Relativistic kinematic dilation (-7 μs/day) in GPS',
    ],
    commonMisconceptions: [
      {
        id: 'misc-grav-1',
        misconception:
          'Clocks at lower altitude tick slower because atmospheric pressure or mechanical friction physically resists the clock mechanisms.',
        clarification:
          'Gravitational time dilation is a fundamental property of spacetime geometry itself; all physical, chemical, biological, and nuclear processes tick slower in a deeper potential well.',
        evidence:
          'Subatomic atomic clocks, muon decay rates, and gamma-ray transitions all exhibit identical dilation factors irrespective of mechanism.',
      },
      {
        id: 'misc-grav-2',
        misconception:
          'Special relativity and general relativity both make GPS satellites tick slower.',
        clarification:
          'Special relativistic kinematic speed makes the satellite tick slower (-7 μs/day), while General Relativistic higher gravitational potential makes it tick faster (+45 μs/day), yielding a net gain of +38 μs/day.',
        evidence:
          'GPS master control stations must offset satellite clock synthesizers to 10.22999999543 MHz instead of 10.23 MHz to match Earth ground clocks.',
      },
    ],
    stems: [
      {
        id: 'stem-grav-q1',
        category: 'causal_explanation',
        role: 'questioner',
        stem: 'How does the Equivalence Principle necessitate that a clock at the base of a gravitational field ticks slower than one at the top?',
        rationale: 'Connects rocket acceleration thought-experiment to potential gradient.',
        icapTarget: 'constructive',
      },
      {
        id: 'stem-grav-c1',
        category: 'comprehension_thinking',
        role: 'clarifier',
        stem: 'Why did the Pound-Rebka experiment rely on the Mössbauer effect rather than ordinary gas-phase emission of photons?',
        rationale:
          'Clarifies nuclear recoil-free resonance absorption for fractional resolution of 10^-15.',
        icapTarget: 'active',
      },
      {
        id: 'stem-grav-s1',
        category: 'evaluative_epistemic',
        role: 'summarizer',
        stem: 'What is the net relativistic mathematical equation that explains why GPS clocks run fast overall rather than slow?',
        rationale: 'Forces quantitative synthesis of GR vs SR signs.',
        icapTarget: 'constructive',
      },
      {
        id: 'stem-grav-p1',
        category: 'counterfactual_inference',
        role: 'predictor',
        stem: 'What would happen to the time dilation of an observer hovering immediately outside the event horizon of a Schwarzschild black hole as viewed by a distant observer?',
        rationale: 'Probes asymptotic divergence of proper time at the Schwarzschild radius.',
        icapTarget: 'interactive',
      },
    ],
    predictivePrompts: [
      {
        id: 'pred-grav-1',
        prompt:
          'If Earth were compressed into half its radius while keeping its total mass identical, what would happen to the time dilation of an observer on the new surface relative to an observer on the Moon?',
        expectedMechanism:
          'Because surface gravitational potential is -GM/R, halving R doubles the depth of the potential well, increasing the surface time dilation factor significantly.',
        falsificationScenario:
          'If dilation depended only on total mass rather than radius/potential, no dilation change would occur.',
      },
    ],
  },
  {
    id: 'passage-liquidity-trap',
    title: 'John Maynard Keynes & The Liquidity Trap',
    discipline: 'macroeconomics',
    difficulty: 'intermediate',
    wordCount: 370,
    content: `In Chapter 15 of *The General Theory of Employment, Interest and Money* (1936), John Maynard Keynes delineated a severe pathology of monetary policy known as the Liquidity Trap. Under normal macroeconomic conditions, a central bank can stimulate aggregate demand during a downturn by purchasing government bonds on the open market, injecting base reserves into commercial banks, thereby driving down nominal interest rates and lowering the borrowing cost for capital investment and consumption.

However, when nominal interest rates approach the Zero Lower Bound (ZLB), monetary policy encounters a structural friction. At zero nominal yields, holding bonds ceases to provide an interest premium over holding physical cash or zero-yielding central bank reserves. Yet holding bonds carries capital risk: should interest rates rise in the future, bond prices will plummet. 

Consequently, the public's speculative demand for money becomes virtually infinite (perfectly interest-elastic). Investors and households prefer to hoard any incremental liquidity injected by the central bank as cash balances rather than lending it out or investing in physical capital assets. 

In this state, traditional open-market operations become completely impotent: the monetary transmission mechanism breaks down. Expanding the monetary base fails to depress interest rates any further, fails to spur commercial bank credit creation, and fails to stimulate aggregate demand. 

Keynes concluded that when an economy falls into a liquidity trap—as occurred during the Great Depression and Japan’s "Lost Decades"—monetary policy is equivalent to "pushing on a string." Escaping the trap necessitates direct fiscal policy: direct government expenditure and public investment that directly injects purchasing power into the real economy without relying on financial intermediation.`,
    coreThesis:
      'A liquidity trap occurs when nominal interest rates reach the zero lower bound and money demand becomes perfectly interest-elastic, neutralizing conventional monetary expansion and requiring direct fiscal stimulus to revive aggregate demand.',
    keyMechanisms: [
      'Zero Lower Bound (ZLB) on nominal interest rates',
      'Infinite interest elasticity of speculative money demand',
      'Breakdown of the bank lending channel and monetary transmission mechanism',
      'Asymmetric bond capital risk (yields cannot fall, only rise, driving bond price risk)',
      'Superiority of autonomous fiscal multiplier over impotent reserve creation',
    ],
    commonMisconceptions: [
      {
        id: 'misc-econ-1',
        misconception:
          'A central bank can always lower interest rates further simply by printing more currency.',
        clarification:
          'Nominal interest rates cannot fall significantly below zero without physical currency bans, because depositors would simply withdraw cash to avoid negative yields.',
        evidence:
          'Zero lower bound phenomenon observed in 1930s USA and 1990s-2000s Bank of Japan operations.',
      },
      {
        id: 'misc-econ-2',
        misconception:
          'Injecting bank reserves during a liquidity trap automatically causes hyperinflation.',
        clarification:
          'Inflation requires an increase in the broad money supply circulating in the economy (velocity of money); when excess reserves remain trapped on commercial bank balance sheets without loan creation, money velocity collapses and inflation remains muted or deflationary.',
        evidence:
          'Post-2008 Federal Reserve and ECB quantitative easing created trillions in reserves while CPI inflation remained below 2% for over a decade.',
      },
    ],
    stems: [
      {
        id: 'stem-econ-q1',
        category: 'causal_explanation',
        role: 'questioner',
        stem: 'Why does the risk of holding bonds increase specifically when interest rates are near zero?',
        rationale:
          'Unpacks the inverse relationship between bond prices and yields, highlighting downside asymmetry.',
        icapTarget: 'constructive',
      },
      {
        id: 'stem-econ-c1',
        category: 'comprehension_thinking',
        role: 'clarifier',
        stem: 'What is the crucial economic distinction between the monetary base and the broad money supply during a liquidity trap?',
        rationale: 'Clarifies why base money expansion fails to translate into bank credit.',
        icapTarget: 'active',
      },
      {
        id: 'stem-econ-s1',
        category: 'evaluative_epistemic',
        role: 'summarizer',
        stem: 'How does the phrase "pushing on a string" summarize the asymmetric transmission of monetary policy during booms versus severe deflations?',
        rationale:
          'Synthesizes central bank capability to pull back credit vs inability to force private borrowing.',
        icapTarget: 'constructive',
      },
      {
        id: 'stem-econ-p1',
        category: 'counterfactual_inference',
        role: 'predictor',
        stem: 'If a central bank implemented forward guidance committing to higher future inflation targets, could this escape the trap without fiscal spending, and through what mechanism?',
        rationale:
          'Explores Krugman/Woodford expectations-channel solutions to the ZLB (lowering real interest rates: r = i - π^e).',
        icapTarget: 'interactive',
      },
    ],
    predictivePrompts: [
      {
        id: 'pred-econ-1',
        prompt:
          'What happens to the real interest rate when the nominal interest rate is trapped at 0% and inflation expectations turn negative (deflation of -3%)?',
        expectedMechanism:
          'By the Fisher equation r = i - π, if i = 0% and π = -3%, then real interest rate r = +3%. The real cost of debt rises, further depressing investment.',
        falsificationScenario:
          'If real rates fell with zero nominal rates, investment would accelerate rather than contract.',
      },
    ],
  },
  {
    id: 'passage-hebbian-ltp',
    title: 'Donald Hebb & Synaptic Long-Term Potentiation (LTP)',
    discipline: 'neurobiology',
    difficulty: 'advanced',
    wordCount: 425,
    content: `In 1949, Canadian psychologist Donald Hebb formulated his foundational postulate for biological neural learning in *The Organization of Behavior*: "When an axon of cell A is near enough to excite cell B and repeatedly or persistently takes part in firing it, some growth process or metabolic change takes place in one or both cells such that A's efficiency, as one of the cells firing B, is increased." Colloquially codified as "neurons that fire together, wire together," this postulate remained a theoretical conjecture until 1973, when Terje Lømo and Timothy Bliss discovered Long-Term Potentiation (LTP) in the rabbit hippocampus.

LTP provides the primary cellular and molecular substrate for associative memory formation and synaptic plasticity in the mammalian central nervous system. At the glutamatergic synapse, transmission is mediated by two distinct ionotropic receptors: AMPA and NMDA receptors. 

Under baseline low-frequency stimulation, presynaptic action potentials release the neurotransmitter glutamate into the synaptic cleft. Glutamate binds to AMPA receptors, opening channels permeable to sodium ions (Na+), generating modest excitatory postsynaptic potentials (EPSPs). Although glutamate also binds to NMDA receptors, their ion pore remains physically plugged by an extracellular magnesium ion (Mg2+) held in place by the negative resting membrane potential (~-70 mV). 

However, during high-frequency tetanic stimulation or coincident depolarization from multiple converging inputs, intense sodium influx through AMPA receptors depolarizes the postsynaptic membrane to approximately -30 mV. This positive electrostatic potential expels the positively charged Mg2+ ion from the NMDA pore. 

Once unplugged, NMDA receptors permit a robust influx of calcium ions (Ca2+) into the postsynaptic dendritic spine. Calcium acts as a pivotal second messenger, binding to calmodulin and activating CaMKII (calcium/calmodulin-dependent protein kinase II). CaMKII phosphorylates existing AMPA receptors to increase their single-channel conductance and catalyzes the exocytotic trafficking of sequestered AMPA receptors from intracellular storage vesicles directly into the postsynaptic density. 

The resulting synapse exhibits a durable increase in synaptic efficacy: subsequent single action potentials release the same quantity of glutamate, but evoke vastly larger postsynaptic responses, physically encoding the learned association.`,
    coreThesis:
      'Long-Term Potentiation is the molecular realization of Hebbian synaptic plasticity, wherein the NMDA receptor acts as a coincident detector whose voltage-dependent magnesium unblocking permits calcium influx that inserts additional AMPA receptors into the postsynaptic density.',
    keyMechanisms: [
      'AMPA receptor sodium influx mediating baseline EPSPs',
      'Voltage-dependent magnesium (Mg2+) block of the NMDA receptor pore',
      'Coincident depolarization expelling Mg2+ block at -30 mV',
      'Calcium (Ca2+) influx acting as intracellular second messenger',
      'CaMKII activation driving exocytosis and insertion of AMPA receptors into postsynaptic density',
    ],
    commonMisconceptions: [
      {
        id: 'misc-hebb-1',
        misconception:
          'NMDA receptors are activated solely by the presence of glutamate in the synaptic cleft.',
        clarification:
          'NMDA receptors require dual coincidence: glutamate binding AND simultaneous membrane depolarization to expel the Mg2+ plug.',
        evidence:
          'Applying glutamate without membrane depolarization fails to trigger Ca2+ influx or LTP.',
      },
      {
        id: 'misc-hebb-2',
        misconception:
          'LTP permanently increases the amount of glutamate released by the presynaptic terminal in all synapses.',
        clarification:
          'Classical early-phase LTP is primarily a postsynaptic modification: the number and conductance of AMPA receptors increase, responding more vigorously to the same presynaptic glutamate volume.',
        evidence:
          'Fluorescence imaging and electrophysiology demonstrate AMPA exocytosis into the postsynaptic density.',
      },
    ],
    stems: [
      {
        id: 'stem-hebb-q1',
        category: 'causal_explanation',
        role: 'questioner',
        stem: 'Why is the NMDA receptor structurally termed a "molecular coincidence detector"?',
        rationale:
          'Unpacks dual requirement of chemical transmitter binding and electrical depolarization.',
        icapTarget: 'constructive',
      },
      {
        id: 'stem-hebb-c1',
        category: 'comprehension_thinking',
        role: 'clarifier',
        stem: 'What is the precise causal chain linking calcium influx to the strengthening of synaptic transmission?',
        rationale: 'Traces Ca2+ -> CaMKII -> phosphorylation and AMPA exocytosis.',
        icapTarget: 'constructive',
      },
      {
        id: 'stem-hebb-s1',
        category: 'evaluative_epistemic',
        role: 'summarizer',
        stem: 'How does Hebb’s 1949 theoretical postulate map directly onto the biophysical behavior of the NMDA and AMPA receptor system?',
        rationale: 'Synthesizes abstract psychological theory with modern biophysical reality.',
        icapTarget: 'constructive',
      },
      {
        id: 'stem-hebb-p1',
        category: 'counterfactual_inference',
        role: 'predictor',
        stem: 'What would happen to memory consolidation and LTP induction if a rat were administered AP5, a selective NMDA receptor antagonist, prior to spatial water maze training?',
        rationale:
          'Predicts behavioral Morris water maze deficits based on molecular NMDA blockade (classic Morris 1986 study).',
        icapTarget: 'interactive',
      },
    ],
    predictivePrompts: [
      {
        id: 'pred-hebb-1',
        prompt:
          'If a synapse is stimulated at low frequency (1 Hz) for 15 minutes instead of high-frequency tetanus (100 Hz), what form of plasticity is induced and what happens to AMPA receptors?',
        expectedMechanism:
          'Long-Term Depression (LTD) is induced. Modest prolonged Ca2+ influx activates calcineurin and protein phosphatase 1 (PP1), which dephosphorylate AMPA receptors and trigger their endocytosis away from the membrane.',
        falsificationScenario:
          'If all calcium influx triggered LTP, synaptic saturation would occur and no forgetting or downscaling could happen.',
      },
    ],
  },
]

// ============================================================================
// 4. ICAP Classifier & Quantitative Evaluation Engine
// ============================================================================

/**
 * Classifies an individual dialogue turn into the Chi & Wylie (2014) ICAP taxonomy.
 */
export function classifyICAPEngagement(
  text: string,
  isResponsive: boolean,
  previousTurn?: DialogueTurn,
): {
  icapLevel: ICAPLevel
  rationale: string
  causalScore: number
} {
  const lower = text.toLowerCase()
  const wordCount = lower.split(/\s+/).filter(Boolean).length

  // Count causal connectors
  let causalCount = 0
  for (const connector of CAUSAL_CONNECTORS) {
    if (lower.includes(connector)) {
      causalCount++
    }
  }

  // Count interactive conversational markers
  let interactiveCount = 0
  for (const marker of INTERACTIVE_MARKERS) {
    if (lower.includes(marker)) {
      interactiveCount++
    }
  }

  // Check if responsive turn references words from previous turn
  let sharedWordRatio = 0
  if (previousTurn && previousTurn.text) {
    const prevWords = new Set(
      previousTurn.text
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4),
    )
    const currWords = lower.split(/\s+/).filter((w) => w.length > 4)
    if (prevWords.size > 0 && currWords.length > 0) {
      let matchCount = 0
      for (const w of currWords) {
        if (prevWords.has(w)) matchCount++
      }
      sharedWordRatio = matchCount / currWords.length
    }
  }

  const causalScore = Math.min(100, causalCount * 22 + (wordCount > 35 ? 20 : wordCount))

  // Decision Logic:
  // 1. Interactive: Turn is responsive, references previous speaker's ideas,
  //    and either builds on, critiques, or synthesizes with causal elaboration.
  if (
    isResponsive &&
    (interactiveCount > 0 || (sharedWordRatio > 0.15 && causalCount >= 1)) &&
    wordCount >= 15
  ) {
    return {
      icapLevel: 'interactive',
      rationale:
        'Turn exhibits dialogic co-construction: directly addresses prior peer contributions with causal or counterfactual justification.',
      causalScore,
    }
  }

  // 2. Constructive: Generates novel inferences, explanations, or questions
  //    with substantial causal structure, even if monologic.
  if (causalCount >= 2 || (causalCount >= 1 && wordCount >= 25)) {
    return {
      icapLevel: 'constructive',
      rationale:
        'Turn produces new cognitive artifacts: causal explanation, synthesis, or hypothesis exceeding given text.',
      causalScore,
    }
  }

  // 3. Active: Engages with the material via selection or summarization,
  //    but lacks deep causal elaboration.
  if (wordCount >= 10) {
    return {
      icapLevel: 'active',
      rationale:
        'Turn actively manipulates text or paraphrases concepts with limited causal depth.',
      causalScore,
    }
  }

  // 4. Passive: Very brief, verbatim repetition, or minimal confirmation.
  return {
    icapLevel: 'passive',
    rationale:
      'Turn is minimally generative, displaying passive observation or shallow confirmation.',
    causalScore: Math.min(causalScore, 20),
  }
}

/**
 * Computes comprehensive quantitative evaluation across all dialogue turns.
 */
export function evaluateReciprocalSession(
  turns: DialogueTurn[],
  passage: TextPassage,
): ReciprocalEvaluation {
  const userTurns = turns.filter((t) => t.speaker === 'user')
  const totalTurns = turns.length
  const userTurnsCount = userTurns.length

  if (userTurnsCount === 0) {
    return {
      totalTurns,
      userTurnsCount: 0,
      icap: {
        passiveRatio: 1,
        activeRatio: 0,
        constructiveRatio: 0,
        interactiveRatio: 0,
        ics: 10,
      },
      strategy: {
        roleFrequencies: {
          questioner: 0,
          clarifier: 0,
          summarizer: 0,
          predictor: 0,
        },
        rsbs: 0,
        dominantRole: 'questioner',
        neglectedRoles: ['clarifier', 'summarizer', 'predictor'],
      },
      elaboration: {
        avgScore: 0,
        edi: 0,
        causalConnectorsCount: 0,
        depthCategory: 'superficial',
      },
      repair: {
        attemptedRepairs: 0,
        successfulRepairs: 0,
        mrr: 0,
      },
      rdms: 10,
      masteryBand: 'novice_passive',
      feedback: ['No user turns recorded yet. Begin by selecting a reciprocal role.'],
      recommendations: ['Formulate a question using one of King’s thought-provoking stems.'],
    }
  }

  // 1. ICAP Distribution
  let passiveCount = 0
  let activeCount = 0
  let constructiveCount = 0
  let interactiveCount = 0

  for (const t of userTurns) {
    if (t.icapLevel === 'passive') passiveCount++
    else if (t.icapLevel === 'active') activeCount++
    else if (t.icapLevel === 'constructive') constructiveCount++
    else if (t.icapLevel === 'interactive') interactiveCount++
  }

  const passiveRatio = passiveCount / userTurnsCount
  const activeRatio = activeCount / userTurnsCount
  const constructiveRatio = constructiveCount / userTurnsCount
  const interactiveRatio = interactiveCount / userTurnsCount

  // Composite ICAP Score: weighted combination
  const ics = Math.min(
    100,
    Math.round(
      (passiveRatio * 0.1 +
        activeRatio * 0.35 +
        constructiveRatio * 0.75 +
        interactiveRatio * 1.0) *
        100,
    ),
  )

  // 2. Strategy Balance (RSBS - Shannon entropy across the 4 roles)
  const roleFrequencies: Record<ReciprocalRole, number> = {
    questioner: 0,
    clarifier: 0,
    summarizer: 0,
    predictor: 0,
  }

  for (const t of userTurns) {
    roleFrequencies[t.role] = (roleFrequencies[t.role] || 0) + 1
  }

  let entropy = 0
  const maxEntropy = Math.log(4) // ln(4) ≈ 1.38629
  let maxFreq = -1
  let dominantRole: ReciprocalRole = 'questioner'
  const neglectedRoles: ReciprocalRole[] = []

  for (const role of ['questioner', 'clarifier', 'summarizer', 'predictor'] as const) {
    const count = roleFrequencies[role]
    if (count > maxFreq) {
      maxFreq = count
      dominantRole = role
    }
    if (count === 0) {
      neglectedRoles.push(role)
    }
    if (count > 0) {
      const p = count / userTurnsCount
      entropy -= p * Math.log(p)
    }
  }

  const rsbs = Math.min(100, Math.round((entropy / maxEntropy) * 100))

  // 3. Elaboration Depth Index (EDI)
  let totalElaboration = 0
  let totalCausalConnectors = 0

  for (const t of userTurns) {
    totalElaboration += t.elaborationScore
    const lower = t.text.toLowerCase()
    for (const connector of CAUSAL_CONNECTORS) {
      if (lower.includes(connector)) totalCausalConnectors++
    }
  }

  const avgElaboration = Math.round(totalElaboration / userTurnsCount)
  const connectorDensity = totalCausalConnectors / userTurnsCount
  const edi = Math.min(100, Math.round(avgElaboration * 0.7 + Math.min(connectorDensity * 15, 30)))

  let depthCategory: 'superficial' | 'moderate' | 'deep' | 'profound' = 'superficial'
  if (edi >= 80) depthCategory = 'profound'
  else if (edi >= 60) depthCategory = 'deep'
  else if (edi >= 35) depthCategory = 'moderate'

  // 4. Metacognitive Repair Ratio (MRR)
  const clarifierTurns = userTurns.filter((t) => t.role === 'clarifier')
  const attemptedRepairs = clarifierTurns.length
  let successfulRepairs = 0

  for (const t of clarifierTurns) {
    if (t.resolvedMisconceptionId) {
      successfulRepairs++
    } else {
      // Check if text addresses any passage misconception
      const lower = t.text.toLowerCase()
      const matched = passage.commonMisconceptions.some(
        (m) =>
          lower.includes(m.misconception.toLowerCase().slice(0, 20)) ||
          lower.includes(m.clarification.toLowerCase().slice(0, 20)),
      )
      if (matched || t.elaborationScore >= 60) {
        successfulRepairs++
      }
    }
  }

  const mrr =
    attemptedRepairs > 0 ? Math.round((successfulRepairs / attemptedRepairs) * 100) / 100 : 0

  // 5. Reciprocal Dialogue Maturity Score (RDMS)
  // RDMS = 0.35 * ICS + 0.25 * RSBS + 0.25 * EDI + 0.15 * (MRR * 100)
  const rdms = Math.min(100, Math.round(ics * 0.35 + rsbs * 0.25 + edi * 0.25 + mrr * 100 * 0.15))

  let masteryBand:
    'novice_passive' | 'developing_active' | 'proficient_constructive' | 'mastery_interactive' =
    'novice_passive'
  if (rdms >= 80) masteryBand = 'mastery_interactive'
  else if (rdms >= 60) masteryBand = 'proficient_constructive'
  else if (rdms >= 40) masteryBand = 'developing_active'

  // 6. Feedback & Recommendations
  const feedback: string[] = []
  const recommendations: string[] = []

  if (interactiveRatio >= 0.35) {
    feedback.push(
      `Exemplary dialogic co-construction (${Math.round(interactiveRatio * 100)}% interactive turns). Responses directly challenge and build on peer assertions.`,
    )
  } else if (constructiveRatio >= 0.4) {
    feedback.push(
      `Strong constructive reasoning (${Math.round(constructiveRatio * 100)}% constructive turns), generating original causal explanations.`,
    )
  } else {
    feedback.push(
      `Engagement is primarily active/passive. Elevate participation into constructive and interactive modes by linking concepts causally.`,
    )
  }

  if (rsbs >= 75) {
    feedback.push(
      `Outstanding role flexibility (RSBS ${rsbs}/100). All reciprocal strategies (Questioner, Clarifier, Summarizer, Predictor) are exercised in balance.`,
    )
  } else {
    feedback.push(
      `Role distribution is skewed toward '${dominantRole}'. Diversify practice across the remaining reciprocal roles.`,
    )
  }

  if (neglectedRoles.length > 0) {
    recommendations.push(
      `Practice the neglected role(s): ${neglectedRoles.join(', ')} to maximize cognitive comprehension monitoring.`,
    )
  }

  if (edi < 60) {
    recommendations.push(
      'Incorporate explicit causal connectors ("consequently", "whereas", "because", "induces") to deepen mechanistic justification.',
    )
  }

  if (attemptedRepairs === 0) {
    recommendations.push(
      'Adopt the Clarifier role to actively detect and resolve known domain misconceptions in the text.',
    )
  }

  return {
    totalTurns,
    userTurnsCount,
    icap: {
      passiveRatio: Math.round(passiveRatio * 100) / 100,
      activeRatio: Math.round(activeRatio * 100) / 100,
      constructiveRatio: Math.round(constructiveRatio * 100) / 100,
      interactiveRatio: Math.round(interactiveRatio * 100) / 100,
      ics,
    },
    strategy: {
      roleFrequencies,
      rsbs,
      dominantRole,
      neglectedRoles,
    },
    elaboration: {
      avgScore: avgElaboration,
      edi,
      causalConnectorsCount: totalCausalConnectors,
      depthCategory,
    },
    repair: {
      attemptedRepairs,
      successfulRepairs,
      mrr,
    },
    rdms,
    masteryBand,
    feedback,
    recommendations,
  }
}

// ============================================================================
// 5. Deterministic Peer Dialogic Agent Simulation
// ============================================================================

/**
 * Generates an authentic Socratic peer dialogic turn responsive to the user's latest entry,
 * modeling Palincsar & Brown's reciprocal dialogue scaffolding.
 */
export function generatePeerDialogicTurn(
  passage: TextPassage,
  history: DialogueTurn[],
  preferredRole?: ReciprocalRole,
): {
  role: ReciprocalRole
  text: string
  stemId?: string
  icapLevel: ICAPLevel
} {
  const lastUserTurn = [...history].reverse().find((t) => t.speaker === 'user')

  // Choose complementary role
  let role: ReciprocalRole = 'clarifier'
  if (preferredRole) {
    role = preferredRole
  } else if (lastUserTurn) {
    switch (lastUserTurn.role) {
      case 'questioner':
        role = 'clarifier'
        break
      case 'clarifier':
        role = 'summarizer'
        break
      case 'summarizer':
        role = 'predictor'
        break
      case 'predictor':
        role = 'questioner'
        break
    }
  }

  // Generate responsive dialogic text
  let text = ''
  let stemId: string | undefined

  switch (role) {
    case 'questioner': {
      const stem = passage.stems.find((s) => s.role === 'questioner') || passage.stems[0]
      stemId = stem.id
      text = `Building on what you said, let's probe deeper into the causal core: ${stem.stem} Because if we cannot explain that mechanism, our thesis remains vulnerable.`
      break
    }
    case 'clarifier': {
      const misc = passage.commonMisconceptions[0]
      if (lastUserTurn) {
        text = `I agree with your point about "${lastUserTurn.text.slice(0, 45)}...", but consider this potential misconception: some argue that ${misc.misconception}. How does the text's evidence—specifically that ${misc.evidence}—refute that claim?`
      } else {
        text = `To clarify the text: an intuitive pitfall is believing ${misc.misconception}. In contrast, the factual mechanism is that ${misc.clarification}.`
      }
      break
    }
    case 'summarizer': {
      text = `To synthesize our dialogue so far: the overarching thesis is that ${passage.coreThesis} Crucially, this hinges on key mechanisms: ${passage.keyMechanisms.slice(0, 2).join(' and ')}. Does this capture the essence of what you were proposing?`
      break
    }
    case 'predictor': {
      const pred = passage.predictivePrompts[0]
      text = `Taking our conclusion to its logical next step: ${pred.prompt} If this hypothesis is sound, what would happen in the falsification scenario where ${pred.falsificationScenario}?`
      break
    }
  }

  return {
    role,
    text,
    stemId,
    icapLevel: 'interactive',
  }
}

// ============================================================================
// 6. FSRS-6 Calibrated Spaced Repetition Deck Generator
// ============================================================================

/**
 * Synthesizes a calibrated FSRS-6 review deck from the reciprocal dialogue session.
 * Initial card stability and difficulty are dynamically calibrated from RDMS.
 */
export function generateReciprocalFSRSDeck(
  passage: TextPassage,
  turns: DialogueTurn[],
  evaluation: ReciprocalEvaluation,
): CalibratedReciprocalDeck {
  const cards: CalibratedReciprocalCard[] = []

  // Stability scaling: higher RDMS -> higher initial stability (S ∈ [1.8, 5.0] days)
  const baseStability = 1.8 + (evaluation.rdms / 100) * 3.2

  // Difficulty scaling: higher RDMS -> lower perceived difficulty (D ∈ [3.5, 7.5])
  const baseDifficulty = 7.5 - (evaluation.rdms / 100) * 4.0

  // 1. Questioner Socratic Card
  const qTurn = turns.find((t) => t.role === 'questioner' && t.speaker === 'user')
  const qStem = passage.stems.find((s) => s.role === 'questioner') || passage.stems[0]
  cards.push({
    id: `card-${passage.id}-questioner`,
    role: 'questioner',
    front: `[Reciprocal Questioning — ${passage.title}]\n\n${qTurn ? qTurn.text : qStem.stem}`,
    back: `**Causal Mechanism:**\n${passage.coreThesis}\n\n**Key Mechanism:**\n${passage.keyMechanisms[0]}`,
    rationale:
      'Requires active retrieval of causal explanations rather than passive recall (King 1999).',
    icapLevel: 'constructive',
    fsrsParameters: {
      stability: Math.round(baseStability * 1.1 * 10) / 10,
      difficulty: Math.round(baseDifficulty * 10) / 10,
    },
    tags: ['reciprocal-teaching', 'questioner', passage.discipline, passage.id],
  })

  // 2. Clarifier Misconception Disambiguation Card
  const misc = passage.commonMisconceptions[0]
  cards.push({
    id: `card-${passage.id}-clarifier`,
    role: 'clarifier',
    front: `[Reciprocal Clarification — Misconception Audit]\n\n**Misconception:** "${misc.misconception}"\n\nWhy is this intuitively appealing but scientifically flawed?`,
    back: `**Clarification:**\n${misc.clarification}\n\n**Decisive Empirical Evidence:**\n${misc.evidence}`,
    rationale:
      'Directly repairs flawed mental models and arrests cognitive interference (Palincsar & Brown 1984).',
    icapLevel: 'constructive',
    fsrsParameters: {
      stability: Math.round(baseStability * 10) / 10,
      difficulty: Math.round((baseDifficulty + 0.8) * 10) / 10,
    },
    tags: ['reciprocal-teaching', 'clarifier', passage.discipline, passage.id],
  })

  // 3. Summarizer Core Synthesis Card
  cards.push({
    id: `card-${passage.id}-summarizer`,
    role: 'summarizer',
    front: `[Reciprocal Summarization — Macro Synthesis]\n\nWhat is the central thesis of ${passage.title}, and what are its primary causal pillars?`,
    back: `**Core Thesis:**\n${passage.coreThesis}\n\n**Constituent Pillars:**\n${passage.keyMechanisms.map((m, i) => `${i + 1}. ${m}`).join('\n')}`,
    rationale: 'Forces macro-level cognitive compression and conceptual chunking.',
    icapLevel: 'constructive',
    fsrsParameters: {
      stability: Math.round(baseStability * 1.2 * 10) / 10,
      difficulty: Math.round((baseDifficulty - 0.5) * 10) / 10,
    },
    tags: ['reciprocal-teaching', 'summarizer', passage.discipline, passage.id],
  })

  // 4. Predictor Counterfactual Transfer Card
  const pred = passage.predictivePrompts[0]
  cards.push({
    id: `card-${passage.id}-predictor`,
    role: 'predictor',
    front: `[Reciprocal Prediction — Transfer & Counterfactual]\n\n${pred.prompt}`,
    back: `**Expected Mechanism:**\n${pred.expectedMechanism}\n\n**Falsification Benchmark:**\n${pred.falsificationScenario}`,
    rationale:
      'Tests boundary condition extrapolation and predictive hypothesis testing (Chi 2014 Interactive/Constructive).',
    icapLevel: 'interactive',
    fsrsParameters: {
      stability: Math.round(baseStability * 0.9 * 10) / 10,
      difficulty: Math.round((baseDifficulty + 1.2) * 10) / 10,
    },
    tags: ['reciprocal-teaching', 'predictor', passage.discipline, passage.id],
  })

  return {
    passageId: passage.id,
    passageTitle: passage.title,
    generatedAt: Date.now(),
    rdmsBaseline: evaluation.rdms,
    cards,
  }
}
