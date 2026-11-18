/**
 * Claim-Evidence-Reasoning (CER) & Epistemic Argumentation Engine
 *
 * Grounded in:
 * - Katherine L. McNeill & Joseph Krajcik (2012): Supporting Grade 5–8 Students
 *   in Constructing Explanations in Science: The Claim, Evidence, and Reasoning Framework.
 * - Jonathan Osborne, Sibel Erduran, & Shirley Simon (2004): Enhancing the Quality of
 *   Argumentation in School Science (Toulmin Argument Pattern TAP 5-Level Rubric).
 * - Deanna Kuhn (1991, 2010): The Skills of Argument & Epistemic Metacognition.
 *
 * Implements:
 * 1. McNeill-Krajcik CER Framework (Claim, Evidence, Reasoning, Rebuttal)
 * 2. Erduran et al. (2004) TAP 5-Level Argument Quality Hierarchy
 * 3. Evidence Discrimination (Genuine empirical vs circular pseudo-evidence)
 * 4. Quantitative Metrics:
 *    - CER Completeness Score (CCS ∈ [0, 100])
 *    - Evidence Quality Index (EQI ∈ [0, 100])
 *    - Reasoning Depth Index (RDI ∈ [0, 100])
 *    - Toulmin Argument Pattern Level (TAP ∈ [1, 5])
 *    - Epistemic Rigor Score (ERS ∈ [0, 100])
 * 5. Deterministic Socratic Counter-Arguer Simulation
 * 6. FSRS-6 Calibrated Argumentation Spaced Repetition Deck
 * 7. 5 Canonical Multidisciplinary Scientific Debates
 */

import { z } from 'zod'

// ============================================================================
// 1. Zod Enums & Schemas
// ============================================================================

export const EvidenceTypeEnum = z.enum([
  'empirical_observation',
  'statistical_data',
  'experimental_measurement',
  'pseudo_evidence',
  'anecdotal',
])
export type EvidenceType = z.infer<typeof EvidenceTypeEnum>

export const TAPLevelEnum = z.number().int().min(1).max(5)
export type TAPLevel = z.infer<typeof TAPLevelEnum>

export const CompetingClaimSchema = z.object({
  id: z.string(),
  claim: z.string(),
  theorist: z.string(),
  isCanonical: z.boolean(),
  summary: z.string(),
})
export type CompetingClaim = z.infer<typeof CompetingClaimSchema>

export const EvidenceItemSchema = z.object({
  id: z.string(),
  type: EvidenceTypeEnum,
  description: z.string(),
  reliabilityScore: z.number().min(0).max(100),
  supportsClaimId: z.string(),
  opposesClaimId: z.string().optional(),
  isGenuine: z.boolean(),
  methodologicalNote: z.string(),
})
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>

export const ScientificPrincipleSchema = z.object({
  id: z.string(),
  principle: z.string(),
  domainAxiom: z.string(),
  connectsMechanism: z.string(),
})
export type ScientificPrinciple = z.infer<typeof ScientificPrincipleSchema>

export const CounterArgumentSchema = z.object({
  id: z.string(),
  counterClaim: z.string(),
  presumedEvidence: z.string(),
  expectedRebuttalMechanism: z.string(),
})
export type CounterArgument = z.infer<typeof CounterArgumentSchema>

export const ScientificDebateCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: z.enum([
    'climatology',
    'quantum_physics',
    'evolutionary_genetics',
    'neuropharmacology',
    'cognitive_science',
  ]),
  difficulty: z.enum(['introductory', 'intermediate', 'advanced']),
  focalQuestion: string(),
  phenomenonContext: z.string(),
  competingClaims: z.array(CompetingClaimSchema),
  evidencePool: z.array(EvidenceItemSchema),
  scientificPrinciples: z.array(ScientificPrincipleSchema),
  counterArguments: z.array(CounterArgumentSchema),
})
export type ScientificDebateCase = z.infer<typeof ScientificDebateCaseSchema>

export const CERArgumentSubmissionSchema = z.object({
  debateId: z.string(),
  selectedClaimId: z.string(),
  claimStatement: z.string().min(5),
  selectedEvidenceIds: z.array(z.string()).min(1),
  userEvidenceSynthesis: z.string().min(10),
  selectedPrincipleIds: z.array(z.string()).min(1),
  userReasoningStatement: z.string().min(15),
  userRebuttalStatement: z.string().optional(),
  targetedCounterArgumentId: z.string().optional(),
})
export type CERArgumentSubmission = z.infer<typeof CERArgumentSubmissionSchema>

export const CEREvaluationSchema = z.object({
  ccs: z.number().min(0).max(100), // CER Completeness Score
  eqi: z.number().min(0).max(100), // Evidence Quality Index
  rdi: z.number().min(0).max(100), // Reasoning Depth Index
  tapLevel: TAPLevelEnum, // 1 to 5
  ers: z.number().min(0).max(100), // Epistemic Rigor Score
  masteryBand: z.enum([
    'naive_assertion',
    'empirically_grounded',
    'mechanistically_reasoned',
    'dialectic_mastery',
  ]),
  feedback: z.array(z.string()),
  epistemicStrengths: z.array(z.string()),
  vulnerabilities: z.array(z.string()),
})
export type CEREvaluation = z.infer<typeof CEREvaluationSchema>

export const CalibratedCERCardSchema = z.object({
  id: z.string(),
  cardType: z.enum(['claim_retrieval', 'evidence_audit', 'causal_reasoning', 'rebuttal_defense']),
  front: z.string(),
  back: z.string(),
  rationale: z.string(),
  fsrsParameters: z.object({
    stability: z.number(),
    difficulty: z.number(),
  }),
  tags: z.array(z.string()),
})
export type CalibratedCERCard = z.infer<typeof CalibratedCERCardSchema>

export const CalibratedCERDeckSchema = z.object({
  debateId: z.string(),
  debateTitle: z.string(),
  generatedAt: z.number(),
  ersBaseline: z.number(),
  cards: z.array(CalibratedCERCardSchema),
})
export type CalibratedCERDeck = z.infer<typeof CalibratedCERDeckSchema>

// Helper for schema definition
function string() {
  return z.string()
}

// ============================================================================
// 2. 5 Canonical Multidisciplinary Scientific Debates
// ============================================================================

export const CANONICAL_SCIENTIFIC_DEBATES: ScientificDebateCase[] = [
  {
    id: 'debate-amoc-tipping',
    title: 'Atlantic Meridional Overturning Circulation (AMOC) Collapse Threshold',
    domain: 'climatology',
    difficulty: 'advanced',
    focalQuestion:
      'Is the Atlantic Meridional Overturning Circulation approaching a non-linear bi-stable tipping point before 2100 due to Greenland meltwater influx?',
    phenomenonContext:
      'The AMOC transports warm equatorial surface waters northward while cold, dense, saline water sinks in the North Atlantic (deep convection). Paleoclimatic records (Dansgaard-Oeschger events) prove AMOC can abruptly shut down within decades when freshwater disrupts salinity-driven downwelling. Modern observations document a distinct North Atlantic "cold blob" and slowing circulation.',
    competingClaims: [
      {
        id: 'claim-amoc-tipping-near',
        claim:
          'The AMOC has crossed early-warning tipping thresholds and is on course for irreversible bi-stable shutdown this century under moderate-to-high greenhouse emissions.',
        theorist: 'Ditlevsen & Ditlevsen (2023), Rahmstorf (2015)',
        isCanonical: true,
        summary:
          'Statistical variance and autocorrelation increases in sea surface temperatures indicate critical slowing down, preceding a collapse as early as mid-century.',
      },
      {
        id: 'claim-amoc-linear-weakening',
        claim:
          'The AMOC is experiencing gradual, reversible linear decline driven by surface warming and wind stress changes, without crossing a catastrophic bifurcation threshold before 2100.',
        theorist: 'IPCC AR6 Working Group I, Jackson et al. (2022)',
        isCanonical: false,
        summary:
          'Complex CMIP6 GCMs exhibit negative buoyancy feedbacks and turbulent mixing that resist runaway salt-advection positive feedback shutdown.',
      },
    ],
    evidencePool: [
      {
        id: 'ev-amoc-sst-autocorr',
        type: 'statistical_data',
        description:
          'Subpolar North Atlantic Sea Surface Temperature (SST) finger-print exhibits a persistent century-scale cooling trend ("warming hole") with statistically significant increases in variance and 1-lag autocorrelation (critical slowing down).',
        reliabilityScore: 92,
        supportsClaimId: 'claim-amoc-tipping-near',
        isGenuine: true,
        methodologicalNote:
          'ERSSTv5 and HadSST4 reconstruction spanning 1870–2020 analyzed via Gaussian detrending.',
      },
      {
        id: 'ev-amoc-rapid-array',
        type: 'experimental_measurement',
        description:
          'Continuous acoustic and current-meter mooring data from the RAPID-MOCHA 26.5°N array measures an average overturning volume transport of ~17 Sverdrups (Sv), showing interannual variability of ±4 Sv with no statistically distinguishable trend from 2004–2022.',
        reliabilityScore: 95,
        supportsClaimId: 'claim-amoc-linear-weakening',
        isGenuine: true,
        methodologicalNote:
          'In-situ hydrographic and dynamic height transbasin moorings at 26.5°N.',
      },
      {
        id: 'ev-amoc-paleo-glacier',
        type: 'empirical_observation',
        description:
          'Benthic foraminiferal Pa/Th isotope ratios in North Atlantic sediment cores reveal that during Heinrich Stadial 1, freshwater pulses of ~0.2 Sv reduced overturning by >70% within 150 years.',
        reliabilityScore: 90,
        supportsClaimId: 'claim-amoc-tipping-near',
        isGenuine: true,
        methodologicalNote:
          'Protactinium-231/Thorium-230 sediment radionuclide decay fractionation.',
      },
      {
        id: 'ev-amoc-anecdotal-storm',
        type: 'anecdotal',
        description:
          'A fishing vessel off the coast of Iceland reported unprecedentedly cold sea temperatures and unusually violent winter gale storms in December 2021.',
        reliabilityScore: 20,
        supportsClaimId: 'claim-amoc-tipping-near',
        isGenuine: false,
        methodologicalNote:
          'Single-point subjective anecdotal report lacking calibrated sensor logging.',
      },
      {
        id: 'ev-amoc-cmip6-bias',
        type: 'statistical_data',
        description:
          'Most CMIP6 climate models exhibit an overly stable AMOC because they fail to represent sub-grid scale freshwater outflow from Greenland and enforce artificial deep-water salinity restoring.',
        reliabilityScore: 88,
        supportsClaimId: 'claim-amoc-tipping-near',
        isGenuine: true,
        methodologicalNote:
          'Systematic bias audit of 35 CMIP6 model salt transport diagnostics (Liu et al. 2017).',
      },
    ],
    scientificPrinciples: [
      {
        id: 'princ-salt-advection',
        principle: 'Stommel Salt-Advection Positive Feedback',
        domainAxiom:
          'Water density in high-latitude oceans increases monotonically with salinity: ρ = ρ0(1 - αΔT + βΔS).',
        connectsMechanism:
          'Slowing circulation decreases northward transport of high-salinity subtropical water, further reducing high-latitude surface density and reinforcing circulation deceleration.',
      },
      {
        id: 'princ-critical-slowing',
        principle: 'Dynamical Critical Slowing Down (Bifurcation Theory)',
        domainAxiom:
          'As a dynamical system approaches a fold bifurcation, the dominant eigenvalue approaches zero, causing recovery from stochastic perturbations to become infinitely slow.',
        connectsMechanism:
          'Increased autocorrelation and variance in proxy indicators causally indicate loss of system resilience prior to tipping.',
      },
    ],
    counterArguments: [
      {
        id: 'counter-amoc-rapid',
        counterClaim:
          'The RAPID-MOCHA array shows no systematic collapse since 2004; therefore, tipping point warnings are theoretical alarmism.',
        presumedEvidence:
          '2004–2022 mooring data exhibits high seasonal variance but no monotonic downward slope.',
        expectedRebuttalMechanism:
          '18 years of instrumental data is too short to distinguish multi-decadal Atlantic Multidecadal Variability (AMV) cycles from long-term centennial deceleration.',
      },
    ],
  },
  {
    id: 'debate-quantum-nonlocality',
    title: 'Quantum Foundations: Copenhagen Epistemology vs de Broglie-Bohm Determinism',
    domain: 'quantum_physics',
    difficulty: 'advanced',
    focalQuestion:
      'Does the violation of Bell’s Inequality prove that physical reality is fundamentally non-local and deterministic (pilot wave ontology) or that quantum mechanics is an epistemic tool describing probabilities of measurement?',
    phenomenonContext:
      'In 1964, John Stewart Bell proved that no physical theory of local hidden variables can reproduce all quantum mechanical statistical predictions. In 2022, the Nobel Prize in Physics recognized Aspect, Clauser, and Zeilinger for loophole-free experimental tests decisively violating Bell’s Inequality (CHSH parameter S > 2, reaching the Tsirelson bound of 2√2 ≈ 2.828).',
    competingClaims: [
      {
        id: 'claim-bohmian-mechanics',
        claim:
          'Particles possess real, continuous trajectories governed by a non-local pilot wave (quantum potential Q = -ℏ²∇²R / 2mR); physical reality is deterministic but explicitly non-local.',
        theorist: 'David Bohm (1952), Louis de Broglie (1927)',
        isCanonical: false,
        summary:
          'Ontological reality exists independent of observation; wave-function collapse is an epistemic illusion arising from sub-quantum thermal ignorance.',
      },
      {
        id: 'claim-copenhagen-orthodox',
        claim:
          'Quantum states describe state-of-knowledge probability amplitudes; microscopic entities lack definite physical properties prior to measurement.',
        theorist: 'Niels Bohr (1928), Werner Heisenberg (1927)',
        isCanonical: true,
        summary:
          'Complementarity prevents simultaneously assigning exact position and momentum; the wave function is an epistemic algorithm for calculating macroscopic outcome statistics.',
      },
    ],
    evidencePool: [
      {
        id: 'ev-bell-chsh-violation',
        type: 'experimental_measurement',
        description:
          'Loophole-free Bell test using entangled electron spins in diamond nitrogen-vacancy centers separated by 1.3 km demonstrated S = 2.42 ± 0.20, rejecting local realism by p < 0.039.',
        reliabilityScore: 98,
        supportsClaimId: 'claim-bohmian-mechanics',
        isGenuine: true,
        methodologicalNote:
          'Hensen et al. (2015, Nature) closing both locality and detection efficiency loopholes simultaneously.',
      },
      {
        id: 'ev-weak-measurement-trajectories',
        type: 'empirical_observation',
        description:
          'Kocsis et al. (2011) used weak measurements of single photons in a double-slit interferometer to reconstruct average non-local Bohmian trajectories matching theoretical stream lines.',
        reliabilityScore: 93,
        supportsClaimId: 'claim-bohmian-mechanics',
        isGenuine: true,
        methodologicalNote:
          'Weak measurement of momentum via slight Faraday rotation coupled to post-selected CCD detection.',
      },
      {
        id: 'ev-no-signaling-theorem',
        type: 'experimental_measurement',
        description:
          'Statistical marginal distribution of Alice’s measurement outcomes is strictly invariant to Bob’s measurement angle: Tr_B(ρ_AB) = ρ_A, proving zero superluminal information signaling.',
        reliabilityScore: 99,
        supportsClaimId: 'claim-copenhagen-orthodox',
        isGenuine: true,
        methodologicalNote:
          'Mathematical theorem verified across all spatial entanglement experiments.',
      },
      {
        id: 'ev-pseudo-telepathy',
        type: 'pseudo_evidence',
        description:
          'A psychic claimed to predict the spin orientation of entangled particles before the detector clicked in a laboratory demonstration.',
        reliabilityScore: 10,
        supportsClaimId: 'claim-bohmian-mechanics',
        isGenuine: false,
        methodologicalNote:
          'Uncontrolled paranormal assertion lacking double-blind calibration or statistical validity.',
      },
    ],
    scientificPrinciples: [
      {
        id: 'princ-bell-theorem',
        principle: 'Bell’s Theorem & Reality-Locality Tradeoff',
        domainAxiom:
          'Any theory must sacrifice either locality (influences propagate at v ≤ c) or counterfactual definiteness (properties exist before measurement).',
        connectsMechanism:
          'Because Bell inequality is experimentally violated, if one retains realism (particles have definite positions), one must accept non-local pilot wave causation.',
      },
      {
        id: 'princ-born-rule',
        principle: 'Born Rule Statistical Equilibrium',
        domainAxiom:
          'Probability density P(x) = |ψ(x)|² represents the equilibrium distribution of Bohmian particles under chaotic sub-quantum trajectories.',
        connectsMechanism:
          'Explains why Bohmian mechanics makes identical statistical predictions to standard quantum mechanics while retaining deterministic ontology.',
      },
    ],
    counterArguments: [
      {
        id: 'counter-relativity-conflict',
        counterClaim:
          'Bohmian mechanics requires an absolute preferred reference frame for non-local instantaneous pilot wave guidance, violating Lorentz invariance of Special Relativity.',
        presumedEvidence:
          'The quantum potential Q acts instantaneously across arbitrary spacelike separations.',
        expectedRebuttalMechanism:
          'At the statistical equilibrium level, Bohmian mechanics is completely Lorentz invariant; the preferred foliation is fundamentally undetectable due to quantum equilibrium P = |ψ|².',
      },
    ],
  },
  {
    id: 'debate-transgenerational-epigenetics',
    title: 'Epigenetics: Transgenerational Environmental Inheritance vs Germline Reprogramming',
    domain: 'evolutionary_genetics',
    difficulty: 'intermediate',
    focalQuestion:
      'Can acquired ancestral environmental exposures (dietary famine, psychological trauma) be causally transmitted across multiple mammalian generations via epigenetic chromatin modifications without DNA sequence alteration?',
    phenomenonContext:
      'In mammals, developing primordial germ cells and early zygotes undergo two massive waves of global epigenetic reprogramming where cytosine DNA methylation (5mC) and histone marks are erased and rebuilt. Proponents argue small non-coding RNAs (sncRNAs) escape erasure; skeptics argue mammalian erasure is near-absolute and apparent multi-generational effects reflect maternal uterine exposure rather than germline heredity.',
    competingClaims: [
      {
        id: 'claim-transgenerational-epigenetic',
        claim:
          'Acquired metabolic and behavioral phenotypes are heritably transmitted across generations via sperm small non-coding RNAs and escaped heterochromatin regions.',
        theorist: 'Rassoulzadegan (2006), Dias & Ressler (2014)',
        isCanonical: false,
        summary:
          'Sperm sncRNA payloads alter post-fertilization zygotic gene transcription, producing transgenerational phenotypic shifts in F2 and F3 generations.',
      },
      {
        id: 'claim-germline-erasure-barrier',
        claim:
          'Mammalian germline epigenetic reprogramming actively erases acquired environmental marks; observed downstream traits result from confounding in-utero exposures, microbiome sharing, or parental behavior.',
        theorist: 'Heard & Martienssen (2014), Horsthemke (2018)',
        isCanonical: true,
        summary:
          'True transgenerational inheritance requires persistence into the F3 generation (for maternal exposure) or F2 generation (for paternal exposure) without maternal/social confounding.',
      },
    ],
    evidencePool: [
      {
        id: 'ev-dias-olfactory-odor',
        type: 'experimental_measurement',
        description:
          'Mice conditioned with acetophenone odor paired with mild footshocks produced F1 and F2 offspring with specific hypomethylation in the Olfr151 receptor gene and behavioral behavioral odor sensitivity.',
        reliabilityScore: 89,
        supportsClaimId: 'claim-transgenerational-epigenetic',
        isGenuine: true,
        methodologicalNote:
          'In-vitro fertilization (IVF) cross-fostering controlled for behavioral transmission.',
      },
      {
        id: 'ev-tet-mediated-demethylation',
        type: 'experimental_measurement',
        description:
          'Whole-genome bisulfite sequencing reveals that TET-mediated oxidation of 5mC to 5hmC strips over 98.5% of parental methylation marks in the mammalian inner cell mass.',
        reliabilityScore: 96,
        supportsClaimId: 'claim-germline-erasure-barrier',
        isGenuine: true,
        methodologicalNote:
          'Nanopore long-read single-cell epigenetic profiling (Okano et al. 2019).',
      },
      {
        id: 'ev-sperm-sncRNA-microinjection',
        type: 'experimental_measurement',
        description:
          'Microinjecting sperm tsRNAs and miRNAs harvested from high-fat-diet male mice into normal naive fertilized oocytes replicates metabolic glucose intolerance in resultant offspring.',
        reliabilityScore: 94,
        supportsClaimId: 'claim-transgenerational-epigenetic',
        isGenuine: true,
        methodologicalNote:
          'Chen et al. (2016, Science) direct embryonic microinjection isolating sperm RNA from chromatin.',
      },
      {
        id: 'ev-pseudo-lamarckian-assertion',
        type: 'pseudo_evidence',
        description:
          'A motivational fitness speaker claimed that lifting weights every day permanently upgrades the muscular DNA of one’s future grandchildren.',
        reliabilityScore: 12,
        supportsClaimId: 'claim-transgenerational-epigenetic',
        isGenuine: false,
        methodologicalNote:
          'Unsubstantiated teleological belief confusing somatic hypertrophy with germline transmission.',
      },
    ],
    scientificPrinciples: [
      {
        id: 'princ-weismann-barrier',
        principle: 'Weismann Germ-Plasm Barrier & Epigenetic Reset',
        domainAxiom:
          'Hereditary germ cells are sequestered from somatic cells early in embryonic development; somatic alterations cannot directly rewrite gamete genomes.',
        connectsMechanism:
          'For environmental traits to transmit, information must pass through sperm RNAs or escape TET enzymatic demethylation in the zygote.',
      },
      {
        id: 'princ-f3-heredity-criteria',
        principle: 'Strict F3 Generational Criteria (Skinner 2008)',
        domainAxiom:
          'Exposing a pregnant mother (F0) directly exposes her developing fetus (F1) and the fetus’s own primordial germ cells (future F2).',
        connectsMechanism:
          'To prove authentic transgenerational inheritance rather than direct in-utero somatic toxicity, the phenotype must persist into the unexposed F3 generation.',
      },
    ],
    counterArguments: [
      {
        id: 'counter-dutch-hunger',
        counterClaim:
          'The Dutch Hunger Winter study proves epigenetic inheritance in humans because grandchildren of starved pregnant mothers experienced elevated obesity.',
        presumedEvidence:
          'Epidemiological registries linking 1944 famine survivors to grandchild metabolic biomarkers.',
        expectedRebuttalMechanism:
          'The grandchildren (F2) developed from germ cells that were already physically present inside the developing fetus (F1) in utero during the famine, representing direct in-utero exposure rather than unexposed transgenerational epigenetic transmission.',
      },
    ],
  },
  {
    id: 'debate-depression-etiology',
    title:
      'Major Depression: Monoamine Deficiency Hypothesis vs Neuroplasticity/Neurogenesis Deficit',
    domain: 'neuropharmacology',
    difficulty: 'intermediate',
    focalQuestion:
      'Is Major Depressive Disorder caused by a direct deficit in synaptic serotonin/noradrenaline concentrations, or by impaired hippocampal neurogenesis and BDNF-mediated synaptic plasticity?',
    phenomenonContext:
      'For half a century, the monoamine hypothesis postulated that depression is caused by chemical imbalances in serotonin (5-HT) or noradrenaline. Selective Serotonin Reuptake Inhibitors (SSRIs) rapidly increase synaptic 5-HT within hours, yet clinical therapeutic remission requires 3 to 6 weeks of continuous administration. Furthermore, acute tryptophan depletion does not induce depression in healthy individuals.',
    competingClaims: [
      {
        id: 'claim-neurogenesis-bdnf',
        claim:
          'Depression is fundamentally an illness of impaired hippocampal neurogenesis and dendrite arborization driven by chronic glucocorticoid neurotoxicity; SSRIs work by slowly upregulating BDNF and TrkB signaling.',
        theorist: 'Duman & Monteggia (2006), Santarelli et al. (Science 2003)',
        isCanonical: true,
        summary:
          'Chronic stress suppresses adult hippocampal neurogenesis in the subgranular zone; therapeutic efficacy requires weeks for newly generated dentate gyrus granule cells to mature and integrate into functional circuits.',
      },
      {
        id: 'claim-monoamine-deficiency',
        claim:
          'Depression is directly caused by subnormal levels of monoaminergic neurotransmission in limbic and frontostriatal circuits.',
        theorist: 'Schildkraut (1965), Coppen (1967)',
        isCanonical: false,
        summary:
          'Deficits in synaptic 5-HT and norepinephrine deplete emotional valence and drive; drugs that increase monoamine availability restore affective tone.',
      },
    ],
    evidencePool: [
      {
        id: 'ev-ssri-therapeutic-lag',
        type: 'experimental_measurement',
        description:
          'Microdialysis confirms fluoxetine increases extracellular serotonin by >300% within 45 minutes of first dose, yet clinical Montgomery-Åsberg Depression Rating Scale (MADRS) improvements emerge only after 21–28 days.',
        reliabilityScore: 97,
        supportsClaimId: 'claim-neurogenesis-bdnf',
        isGenuine: true,
        methodologicalNote:
          'Double-blind RCT coupled with human in-vivo PET and preclinical microdialysis.',
      },
      {
        id: 'ev-x-ray-neurogenesis-ablation',
        type: 'experimental_measurement',
        description:
          'Focal X-ray irradiation of the mouse subgranular zone ablates adult neurogenesis; in these irradiated mice, chronic SSRI administration completely fails to produce behavioral antidepressant responses in the novelty-suppressed feeding test.',
        reliabilityScore: 95,
        supportsClaimId: 'claim-neurogenesis-bdnf',
        isGenuine: true,
        methodologicalNote:
          'Santarelli et al. (2003, Science) causal ablation proving new neurons are required for antidepressant response.',
      },
      {
        id: 'ev-tryptophan-depletion-failure',
        type: 'experimental_measurement',
        description:
          'Acute tryptophan depletion reduces plasma tryptophan by 85% and brain serotonin synthesis by >70%, but completely fails to induce depressive symptoms or negative mood in healthy control subjects without family history.',
        reliabilityScore: 92,
        supportsClaimId: 'claim-neurogenesis-bdnf',
        isGenuine: true,
        methodologicalNote:
          'Moncrieff et al. (2022, Molecular Psychiatry) umbrella systematic review.',
      },
      {
        id: 'ev-anecdotal-happy-pill',
        type: 'anecdotal',
        description:
          'A patient stated that taking a single herbal serotonin supplement made them feel instantly joyful 10 minutes later.',
        reliabilityScore: 18,
        supportsClaimId: 'claim-monoamine-deficiency',
        isGenuine: false,
        methodologicalNote:
          'Classic acute placebo effect with zero biological pharmacokinetics of synaptic remodeling.',
      },
    ],
    scientificPrinciples: [
      {
        id: 'princ-neurotrophic-hypothesis',
        principle: 'Neurotrophic BDNF-TrkB Synaptic Plasticity Model',
        domainAxiom:
          'Adult hippocampal neurogenesis in the dentate gyrus requires 3 to 4 weeks for newly born neural progenitor cells to extend axons and form functional synapses.',
        connectsMechanism:
          'Explains the exact 3–4 week therapeutic delay: 5-HT1A auto-receptor desensitization stimulates CREB phosphorylation, inducing BDNF transcription that drives neurogenesis.',
      },
    ],
    counterArguments: [
      {
        id: 'counter-monoamine-action',
        counterClaim:
          'Because SSRIs inhibit the serotonin transporter (SERT), the chemical deficiency of serotonin must be the root cause of depression.',
        presumedEvidence: 'SERT occupancy reaches 80% at therapeutic SSRI dosages.',
        expectedRebuttalMechanism:
          'Treating symptoms through an upstream neurotransmitter does not prove etiology (the "aspirin headache fallacy"): aspirin cures headaches by blocking prostaglandins, but headaches are not caused by aspirin deficiency.',
      },
    ],
  },
  {
    id: 'debate-linguistic-relativity',
    title: 'Cognitive Architecture: Linguistic Relativity (Sapir-Whorf) vs Universalist Modularity',
    domain: 'cognitive_science',
    difficulty: 'intermediate',
    focalQuestion:
      'Does the grammatical and lexical structure of a speaker’s language causally reshape fundamental non-linguistic perception and spatial cognition, or is cognition constrained by universal innate modules?',
    phenomenonContext:
      'Languages encode spatial coordinates using distinct frames of reference: Egocentric (relative: left/right/front/back) versus Geocentric (absolute: north/south/east/west). Speakers of Guugu Yimithirr (Australia) use absolute coordinates exclusively, maintaining cardinal orientation at all times. Cognitive universalists argue spatial cognition is an innate mammalian neural substrate (hippocampal grid/place cells) and language merely translates non-verbal conceptual representations.',
    competingClaims: [
      {
        id: 'claim-whorfian-relativity',
        claim:
          'Language habits structure habitual thought; using an absolute spatial coordinate system fundamentally reorganizes non-linguistic mental rotation, memory recall, and spatial navigation.',
        theorist: 'Levinson (1996, 2003), Boroditsky (2001)',
        isCanonical: false,
        summary:
          'When rotated 180° in rotation paradigms, speakers of absolute languages reconstruct card sequences in absolute cardinal space, while relative speakers mirror egocentric space.',
      },
      {
        id: 'claim-universalist-modular',
        claim:
          'Spatial representation is computed by innate universal cognitive modules (grid cells, place cells, head-direction cells); cross-linguistic differences in lab tasks reflect pragmatic task demands rather than deep cognitive reorganization.',
        theorist: 'Chomsky (1980), Fodor (1983), Li & Gleitman (2002)',
        isCanonical: true,
        summary:
          'When English speakers are tested outdoors with salient environmental cues, they spontaneously switch to absolute spatial reasoning, demonstrating identical underlying computational competence.',
      },
    ],
    evidencePool: [
      {
        id: 'ev-levinson-table-rotation',
        type: 'experimental_measurement',
        description:
          'In table-rotation memory tasks where participants are rotated 180° between study and recall tables, 100% of Guugu Yimithirr speakers reconstructed arrays using absolute cardinal orientation, whereas Dutch speakers used egocentric left-right orientation.',
        reliabilityScore: 92,
        supportsClaimId: 'claim-whorfian-relativity',
        isGenuine: true,
        methodologicalNote:
          'Controlled blind counterbalancing across cultural linguistic cohorts (Levinson 2003).',
      },
      {
        id: 'ev-li-gleitman-framing',
        type: 'experimental_measurement',
        description:
          'When English speakers were tested in an outdoor setting with prominent landmarks, over 80% abandoned relative left/right ordering and adopted absolute cardinal spatial configurations identical to Guugu Yimithirr speakers.',
        reliabilityScore: 94,
        supportsClaimId: 'claim-universalist-modular',
        isGenuine: true,
        methodologicalNote:
          'Li & Gleitman (2002, Cognition) demonstrating context-dependent pragmatic priming in uniform English cohorts.',
      },
      {
        id: 'ev-hippocampal-grid-invariance',
        type: 'empirical_observation',
        description:
          'Functional MRI and electrophysiology show that hippocampal place cells, entorhinal grid cells, and head-direction circuits fire in identical hexagonal coordinate lattices across all humans regardless of native language.',
        reliabilityScore: 96,
        supportsClaimId: 'claim-universalist-modular',
        isGenuine: true,
        methodologicalNote:
          'Moser & Moser (2005) Nobel Prize neurobiology of mammalian cognitive maps.',
      },
      {
        id: 'ev-pseudo-mind-reading',
        type: 'pseudo_evidence',
        description:
          'A traveler stated that because a tribal language has no word for "future", the tribe has zero concept of time and never makes plans for tomorrow.',
        reliabilityScore: 15,
        supportsClaimId: 'claim-whorfian-relativity',
        isGenuine: false,
        methodologicalNote:
          'Classic popular myth thoroughly debunked by systematic ethnographic observation (Pinker 1994).',
      },
    ],
    scientificPrinciples: [
      {
        id: 'princ-thinking-for-speaking',
        principle: 'Slobin’s "Thinking for Speaking" Hypothesis',
        domainAxiom:
          'Language selectively mobilizes conceptual schemas during online language production without permanently constraining offline sensorimotor cognition.',
        connectsMechanism:
          'Synthesizes both views: linguistic conventions demand keeping track of cardinal headings during speech, creating automated cognitive habits without altering innate spatial neural architecture.',
      },
    ],
    counterArguments: [
      {
        id: 'counter-whorf-extreme',
        counterClaim:
          'Because Guugu Yimithirr speakers track north/south automatically, their brains have fundamentally rewired their innate spatial navigation circuits to a superhuman level.',
        presumedEvidence:
          'Guugu Yimithirr speakers can point precisely to geographic targets even in closed windowless rooms.',
        expectedRebuttalMechanism:
          'Innate vestibular and dead-reckoning mechanisms are shared by all humans; constant cultural training keeps dead-reckoning registers continuously updated rather than creating a novel neural navigation organ.',
      },
    ],
  },
]

// ============================================================================
// 3. Quantitative CER & TAP Evaluation Engine
// ============================================================================

/**
 * Evaluates an argument submission against the McNeill-Krajcik CER framework
 * and the Osborne-Erduran-Simon TAP 5-level hierarchy.
 */
export function evaluateCERArgument(
  debate: ScientificDebateCase,
  submission: CERArgumentSubmission,
): CEREvaluation {
  const feedback: string[] = []
  const epistemicStrengths: string[] = []
  const vulnerabilities: string[] = []

  // 1. Claim Completeness & Alignment
  const matchedClaim = debate.competingClaims.find((c) => c.id === submission.selectedClaimId)
  const claimHasContent = submission.claimStatement.trim().length >= 15
  const claimScore = matchedClaim ? (claimHasContent ? 100 : 70) : 40

  if (claimHasContent && matchedClaim) {
    epistemicStrengths.push(
      `Clear, testable claim formulated aligned with ${matchedClaim.theorist}.`,
    )
  } else {
    vulnerabilities.push('Claim statement is terse or lacks explicit theoretical positioning.')
  }

  // 2. Evidence Discrimination & Quality Index (EQI)
  const selectedEvidence = debate.evidencePool.filter((e) =>
    submission.selectedEvidenceIds.includes(e.id),
  )

  let genuineEvidenceCount = 0
  let pseudoEvidenceCount = 0
  let totalReliability = 0

  for (const ev of selectedEvidence) {
    if (ev.isGenuine) {
      genuineEvidenceCount++
      totalReliability += ev.reliabilityScore
    } else {
      pseudoEvidenceCount++
    }
  }

  const _evidenceSynthesisWordCount = submission.userEvidenceSynthesis
    .split(/\s+/)
    .filter(Boolean).length
  const avgReliability =
    selectedEvidence.length > 0 ? totalReliability / selectedEvidence.length : 0

  // EQI penalty for pseudo-evidence, bonus for genuine empirical evidence
  const eqi = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        avgReliability * 0.7 + Math.min(genuineEvidenceCount * 15, 30) - pseudoEvidenceCount * 45,
      ),
    ),
  )

  if (pseudoEvidenceCount > 0) {
    vulnerabilities.push(
      'Argument incorporates pseudo-evidence or anecdotal assertions lacking methodological rigor.',
    )
  } else if (genuineEvidenceCount >= 2) {
    epistemicStrengths.push(
      `Robust evidence triangulation: supported by ${genuineEvidenceCount} genuine empirical/experimental sources.`,
    )
  }

  // 3. Reasoning Depth Index (RDI)
  const selectedPrinciples = debate.scientificPrinciples.filter((p) =>
    submission.selectedPrincipleIds.includes(p.id),
  )
  const reasoningWordCount = submission.userReasoningStatement.split(/\s+/).filter(Boolean).length

  const CAUSAL_LEGAL_MARKERS = [
    'because',
    'consequently',
    'therefore',
    'thus',
    'mechanistically',
    'mediates',
    'catalyzes',
    'inhibits',
    'necessitates',
    'causally',
    'however',
    'whereas',
    'leads to',
    'due to',
    'furthermore',
  ]

  let causalMarkerCount = 0
  const combinedText =
    `${submission.userReasoningStatement} ${submission.userRebuttalStatement ?? ''}`.toLowerCase()
  for (const marker of CAUSAL_LEGAL_MARKERS) {
    if (combinedText.includes(marker)) causalMarkerCount++
  }

  const rdi = Math.min(
    100,
    Math.round(
      Math.min(selectedPrinciples.length * 35, 70) +
        Math.min(causalMarkerCount * 6, 18) +
        (reasoningWordCount >= 25 ? 12 : reasoningWordCount / 2),
    ),
  )

  if (selectedPrinciples.length > 0) {
    epistemicStrengths.push(
      `Mechanistic reasoning grounded in ${selectedPrinciples.map((p) => p.principle).join(', ')}.`,
    )
  } else {
    vulnerabilities.push('Reasoning lacks explicit scientific axioms or causal principles.')
  }

  // 4. Rebuttal Assessment
  const hasRebuttal = Boolean(
    submission.userRebuttalStatement && submission.userRebuttalStatement.trim().length >= 20,
  )
  const rebuttalScore = hasRebuttal ? 100 : 0

  if (hasRebuttal) {
    epistemicStrengths.push(
      'Active dialectic rebuttal addressing counterarguments or alternative interpretations.',
    )
  } else {
    vulnerabilities.push('Absence of counterargument anticipation or explicit rebuttal.')
  }

  // 5. CER Completeness Score (CCS)
  // CCS = 0.20 * Claim + 0.35 * Evidence + 0.30 * Reasoning + 0.15 * Rebuttal
  const ccs = Math.min(
    100,
    Math.round(
      claimScore * 0.2 +
        (genuineEvidenceCount > 0 ? 100 : 30) * 0.35 +
        (reasoningWordCount >= 20 ? 100 : reasoningWordCount * 4) * 0.3 +
        rebuttalScore * 0.15,
    ),
  )

  // 6. Erduran, Osborne & Simon (2004) TAP 5-Level Rubric
  // Level 1: Claim vs Counter-claim without data/warrant
  // Level 2: Claim + Data/Warrant, no rebuttal
  // Level 3: Claim + Data + Warrant + Weak/undeveloped rebuttal
  // Level 4: Claim + Data + Warrant + Clear, reasoned rebuttal
  // Level 5: Extended argument with multi-rebuttal synthesis
  let tapLevel: TAPLevel = 1
  if (genuineEvidenceCount > 0 && selectedPrinciples.length === 0 && !hasRebuttal) {
    tapLevel = 2
  } else if (genuineEvidenceCount > 0 && selectedPrinciples.length > 0 && !hasRebuttal) {
    tapLevel = 2 // Data + Warrant, still no rebuttal
  } else if (genuineEvidenceCount > 0 && selectedPrinciples.length > 0 && hasRebuttal) {
    if (
      submission.userRebuttalStatement &&
      submission.userRebuttalStatement.length > 80 &&
      causalMarkerCount >= 2
    ) {
      tapLevel = genuineEvidenceCount >= 3 ? 5 : 4
    } else {
      tapLevel = 3
    }
  }

  // 7. Composite Epistemic Rigor Score (ERS)
  // ERS = 0.30 * CCS + 0.25 * EQI + 0.25 * RDI + 0.20 * ((TAP / 5) * 100)
  const ers = Math.min(
    100,
    Math.round(ccs * 0.3 + eqi * 0.25 + rdi * 0.25 + (tapLevel / 5) * 100 * 0.2),
  )

  let masteryBand:
    'naive_assertion' | 'empirically_grounded' | 'mechanistically_reasoned' | 'dialectic_mastery' =
    'naive_assertion'
  if (ers >= 80) masteryBand = 'dialectic_mastery'
  else if (ers >= 60) masteryBand = 'mechanistically_reasoned'
  else if (ers >= 40) masteryBand = 'empirically_grounded'

  // Constructive pedagogical feedback
  if (tapLevel >= 4) {
    feedback.push(
      `Exemplary Level ${tapLevel} Toulmin Argument Pattern (TAP). Your argument coordinates empirical evidence with causal warrants and proactively refutes counter-claims.`,
    )
  } else if (tapLevel === 3) {
    feedback.push(
      `Solid Level 3 argument. Elevate to Level 4 by directly specifying the exact physiological/physical mechanism that invalidates the opposing hypothesis.`,
    )
  } else {
    feedback.push(
      `Currently at Level ${tapLevel} TAP. To advance, move beyond data citation to formulate explicit rebuttals that refute counter-hypotheses (Osborne et al. 2004).`,
    )
  }

  return {
    ccs,
    eqi,
    rdi,
    tapLevel,
    ers,
    masteryBand,
    feedback,
    epistemicStrengths,
    vulnerabilities,
  }
}

// ============================================================================
// 4. Socratic Adversarial Peer Counter-Arguer Simulation
// ============================================================================

/**
 * Generates an adversarial counter-argument challenging the user's selected claim,
 * forcing the learner to engage in Kuhn (1991) rebuttal construction.
 */
export function generateAdversarialCounterArgument(
  debate: ScientificDebateCase,
  selectedClaimId: string,
): {
  counterTheorist: string
  counterClaim: string
  counterEvidence: string
  rebuttalChallenge: string
} {
  // Select opposing claim
  const opposingClaim =
    debate.competingClaims.find((c) => c.id !== selectedClaimId) ?? debate.competingClaims[0]!

  // Find opposing evidence
  const opposingEvidence =
    debate.evidencePool.find((e) => e.supportsClaimId === opposingClaim.id && e.isGenuine) ??
    debate.evidencePool[0]!

  const counterArg = debate.counterArguments[0]!

  return {
    counterTheorist: opposingClaim.theorist,
    counterClaim: opposingClaim.claim,
    counterEvidence: opposingEvidence.description,
    rebuttalChallenge: `An opponent holding the ${opposingClaim.theorist} position argues: "${counterArg.counterClaim}" based on empirical observation that ${opposingEvidence.description}. How does your causal reasoning dismantle this counter-interpretation?`,
  }
}

// ============================================================================
// 5. FSRS-6 Calibrated Argumentation Deck Generator
// ============================================================================

/**
 * Generates spaced repetition flashcards from the scientific debate,
 * with initial stability and difficulty calibrated from the Epistemic Rigor Score (ERS).
 */
export function generateCERFSRSDeck(
  debate: ScientificDebateCase,
  submission: CERArgumentSubmission,
  evaluation: CEREvaluation,
): CalibratedCERDeck {
  const cards: CalibratedCERCard[] = []

  // Stability scaling: higher ERS -> higher initial stability (S0 ∈ [2.0, 5.5] days)
  const baseStability = 2.0 + (evaluation.ers / 100) * 3.5

  // Difficulty scaling: higher ERS -> lower perceived difficulty (D0 ∈ [3.0, 7.5])
  const baseDifficulty = 7.5 - (evaluation.ers / 100) * 4.5

  // 1. Claim Retrieval Card
  const matchedClaim =
    debate.competingClaims.find((c) => c.id === submission.selectedClaimId) ??
    debate.competingClaims[0]!
  cards.push({
    id: `card-${debate.id}-claim`,
    cardType: 'claim_retrieval',
    front: `[CER Argumentation — ${debate.title}]\n\nWhat is the core scientific claim of the ${matchedClaim.theorist} paradigm regarding ${debate.focalQuestion}?`,
    back: `**Scientific Claim:**\n${matchedClaim.claim}\n\n**Theoretical Summary:**\n${matchedClaim.summary}`,
    rationale:
      'Requires accurate retrieval of focal scientific claims without strawman simplification.',
    fsrsParameters: {
      stability: Math.round(baseStability * 1.1 * 10) / 10,
      difficulty: Math.round(baseDifficulty * 10) / 10,
    },
    tags: ['argumentation', 'cer-claim', debate.domain, debate.id],
  })

  // 2. Evidence Discrimination & Audit Card
  const genuineEv = debate.evidencePool.find((e) => e.isGenuine) ?? debate.evidencePool[0]!
  const pseudoEv = debate.evidencePool.find((e) => !e.isGenuine) ?? debate.evidencePool[1]!
  cards.push({
    id: `card-${debate.id}-evidence-audit`,
    cardType: 'evidence_audit',
    front: `[CER Evidence Audit — Epistemic Discrimination]\n\nIn investigating ${debate.title}, why does:\n(A) "${genuineEv.description.slice(0, 70)}..." constitute valid empirical evidence, whereas\n(B) "${pseudoEv.description.slice(0, 70)}..." is disqualified as pseudo-evidence?`,
    back: `**Valid Evidence Criteria:**\n${genuineEv.methodologicalNote} (Reliability: ${genuineEv.reliabilityScore}%)\n\n**Disqualification Rationale:**\n${pseudoEv.methodologicalNote}`,
    rationale:
      'Trains epistemic discrimination between reliable empirical instrumentation and anecdotal pseudo-evidence (Kuhn 1991).',
    fsrsParameters: {
      stability: Math.round(baseStability * 10) / 10,
      difficulty: Math.round((baseDifficulty + 0.8) * 10) / 10,
    },
    tags: ['argumentation', 'cer-evidence', debate.domain, debate.id],
  })

  // 3. Causal Reasoning & Mechanism Card
  const principle = debate.scientificPrinciples[0]!
  cards.push({
    id: `card-${debate.id}-reasoning`,
    cardType: 'causal_reasoning',
    front: `[CER Scientific Reasoning — Mechanistic Warrant]\n\nHow does the principle of **${principle.principle}** connect empirical data to the claim in ${debate.title}?`,
    back: `**Domain Axiom:**\n${principle.domainAxiom}\n\n**Causal Connection:**\n${principle.connectsMechanism}`,
    rationale:
      'Enforces articulation of theoretical warrants and mechanistic chains connecting data to assertions (McNeill & Krajcik 2012).',
    fsrsParameters: {
      stability: Math.round(baseStability * 1.2 * 10) / 10,
      difficulty: Math.round((baseDifficulty - 0.4) * 10) / 10,
    },
    tags: ['argumentation', 'cer-reasoning', debate.domain, debate.id],
  })

  // 4. Dialectic Rebuttal Card
  const counter = debate.counterArguments[0]!
  cards.push({
    id: `card-${debate.id}-rebuttal`,
    cardType: 'rebuttal_defense',
    front: `[CER Rebuttal Crucible — Counter-Argument Refutation]\n\n**Counter-Claim:** "${counter.counterClaim}"\n\nPresumed Basis: ${counter.presumedEvidence}\n\nWhat is the decisive causal rebuttal that neutralizes this objection?`,
    back: `**Rebuttal Mechanism:**\n${counter.expectedRebuttalMechanism}`,
    rationale:
      'Develops Level 4 & 5 Toulmin Argumentation (TAP) by explicitly refuting plausible counter-theories (Osborne et al. 2004).',
    fsrsParameters: {
      stability: Math.round(baseStability * 0.9 * 10) / 10,
      difficulty: Math.round((baseDifficulty + 1.2) * 10) / 10,
    },
    tags: ['argumentation', 'cer-rebuttal', debate.domain, debate.id],
  })

  return {
    debateId: debate.id,
    debateTitle: debate.title,
    generatedAt: Date.now(),
    ersBaseline: evaluation.ers,
    cards,
  }
}
