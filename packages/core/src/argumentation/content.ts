/**
 * Scenario corpora for the Claim-Evidence-Reasoning (CER) & epistemic argumentation
 * engine (TD-05).
 *
 * CONTENT, not logic: the five canonical multidisciplinary scientific debate cases
 * (AMOC tipping point, quantum foundations, transgenerational epigenetics, depression
 * etiology, linguistic relativity) with their competing claims, genuine-vs-pseudo
 * evidence pools, scientific principles and counter-arguments. Their element ids
 * (`debate-*`, `claim-*`, `ev-*`, `princ-*`, `counter-*`) are a stable contract —
 * stored submissions reference them. Kept out of `cer-engine.ts` so engine diffs stay
 * about algorithms, not data. The `ScientificDebateCase` type stays in the engine
 * (type-only import here — type-only cycles are safe); the engine re-exports this
 * constant so every existing import path keeps working. Zod schemas — including the
 * TD-02 route-level input schemas — remain in the engine.
 *
 * @module @learning-hub/core/argumentation
 */
import type { ScientificDebateCase } from './cer-engine'

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
