/**
 * @file packages/core/src/contrasting/contrasting-engine.ts
 * @description Contrasting Cases & Inventing with Examples Problem-Solving Engine.
 *
 * Grounded in Cognitive Science & Learning Sciences:
 * - Daniel L. Schwartz & John D. Bransford (1998):
 *   "A time for telling", Cognition and Instruction, 16(4), 475–522.
 * - Daniel L. Schwartz & Taylor Martin (2004):
 *   "Inventing to prepare for future learning: The case of contrasting cases",
 *   Cognition and Instruction, 22(2), 129–184.
 * - Daniel L. Schwartz, Catherine C. Chase, Marily A. Oppezzo, & Doris B. Chin (2016):
 *   "The ABCs of How We Learn: 26 Scientifically Proven Approaches", W. W. Norton & Company.
 * - Preparation for Future Learning (PFL; Bransford & Schwartz 1999):
 *   Analyzing structured contrasting cases activates perceptual differentiation,
 *   compelling learners to discern deep structural invariants from superficial noise,
 *   so subsequent canonical instruction ("A Time for Telling") is absorbed with far transfer.
 * - Quantitative Telemetry:
 *   - FDRS: Feature Discrimination Rigor Score (0–100, deep vs surface discrimination)
 *   - IMI: Invented Metric Invariance (0–100, ranking consistency across contrasting variants)
 *   - PFRI: Preparation for Future Readiness Index (0–100, productive impasse & curiosity tension)
 *   - CDTS: Contrasting Differentiation & Transfer Score (0–100 composite index)
 *   - FSRS-6 review deck generation calibrated by differentiated perceptual stability.
 */

import { z } from 'zod'

// ── Enums & Schemas ──────────────────────────────────────────────────────────

export const ContrastingDomainEnum = z.enum([
  'physics_fluid_mechanics',
  'statistics_variability',
  'machine_learning_evaluation',
  'thermodynamics_materials',
  'computer_systems_architecture',
])
export type ContrastingDomain = z.infer<typeof ContrastingDomainEnum>

export const ContrastingDifficultyEnum = z.enum(['introductory', 'intermediate', 'advanced'])
export type ContrastingDifficulty = z.infer<typeof ContrastingDifficultyEnum>

export const ContrastingCaseVariantSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  surfaceFeatures: z.array(z.string()),
  deepFeatures: z.array(z.string()),
  numericalParameters: z.record(z.string(), z.number()),
  outcomeValue: z.number(),
  outcomeUnit: z.string(),
  visualHint: z.string(),
})
export type ContrastingCaseVariant = z.infer<typeof ContrastingCaseVariantSchema>

export const ContrastingDimensionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  isDeepDimension: z.boolean(),
  distractorRationale: z.string().optional(),
  explanation: z.string(),
})
export type ContrastingDimension = z.infer<typeof ContrastingDimensionSchema>

export const CanonicalTellingSchema = z.object({
  lectureTitle: z.string(),
  historicalContext: z.string(),
  formalLawName: z.string(),
  formalEquation: z.string(),
  explanation: z.string(),
  whyIntuitiveMetricsFail: z.string(),
  howItCoordinatesCases: z.string(),
})
export type CanonicalTelling = z.infer<typeof CanonicalTellingSchema>

export const TransferChallengeSchema = z.object({
  id: z.string(),
  scenarioTitle: z.string(),
  description: z.string(),
  question: z.string(),
  options: z.array(z.string()),
  correctOptionIndex: z.number().int().min(0).max(3),
  targetConcept: z.string(),
  explanation: z.string(),
})
export type TransferChallenge = z.infer<typeof TransferChallengeSchema>

export const ContrastingCaseSetSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: ContrastingDomainEnum,
  difficulty: ContrastingDifficultyEnum,
  problemOverview: z.string(),
  guidingInventionPrompt: z.string(),
  variants: z.array(ContrastingCaseVariantSchema),
  dimensions: z.array(ContrastingDimensionSchema),
  canonicalTelling: CanonicalTellingSchema,
  transferChallenge: TransferChallengeSchema,
})
export type ContrastingCaseSet = z.infer<typeof ContrastingCaseSetSchema>

export const InventedMetricSubmissionSchema = z.object({
  setId: z.string(),
  inventedMetricName: z.string(),
  formulaDescription: z.string(),
  selectedDimensionIds: z.array(z.string()),
  variantRankings: z.array(z.string()),
  impasseEncountered: z.boolean().default(true),
  reflectionNotes: z.string(),
})
export type InventedMetricSubmission = z.infer<typeof InventedMetricSubmissionSchema>

export const ContrastingEvaluationSchema = z.object({
  fdrs: z.number().min(0).max(100),
  imi: z.number().min(0).max(100),
  pfri: z.number().min(0).max(100),
  cdts: z.number().min(0).max(100),
  maturityBand: z.enum([
    'superficial_observer',
    'proto_inventor',
    'differentiating_theorist',
    'canonical_synthesizer',
  ]),
  identifiedDeepDimensions: z.array(z.string()),
  missedDeepDimensions: z.array(z.string()),
  superficialDistractorsChosen: z.array(z.string()),
  rankingAccuracy: z.number().min(0).max(100),
  impasseProductive: z.boolean(),
  pedagogicalFeedback: z.array(z.string()),
  strengths: z.array(z.string()),
  vulnerabilities: z.array(z.string()),
})
export type ContrastingEvaluation = z.infer<typeof ContrastingEvaluationSchema>

export const CalibratedContrastingCardSchema = z.object({
  id: z.string(),
  cardType: z.enum([
    'perceptual_differentiation',
    'invariant_ratio',
    'canonical_telling',
    'transfer_application',
  ]),
  front: z.string(),
  back: z.string(),
  targetConcept: z.string(),
  fsrsParameters: z.object({
    stability: z.number(),
    difficulty: z.number(),
  }),
})
export type CalibratedContrastingCard = z.infer<typeof CalibratedContrastingCardSchema>

export const CalibratedContrastingDeckSchema = z.object({
  setId: z.string(),
  setTitle: z.string(),
  cdtsBaseline: z.number(),
  cards: z.array(CalibratedContrastingCardSchema),
})
export type CalibratedContrastingDeck = z.infer<typeof CalibratedContrastingDeckSchema>

// ── Canonical Contrasting Case Sets ──────────────────────────────────────────

export const CANONICAL_CONTRASTING_SETS: ContrastingCaseSet[] = [
  {
    id: 'set-density-buoyancy',
    title: 'Submerged Cylinder Buoyancy & Density Discrimination',
    domain: 'physics_fluid_mechanics',
    difficulty: 'intermediate',
    problemOverview:
      'Six solid or hollow cylinders of various materials, weights, and volumes are placed into water. Learners must invent a single mathematical index or formula that correctly predicts whether each cylinder sinks, floats, or achieves neutral buoyancy, without being told the formula for density.',
    guidingInventionPrompt:
      'Do not just look at whether an object is "heavy" or "big". Create a single rule or mathematical formula using the measured numbers (mass in grams, volume in cm³) that scores every cylinder and orders them accurately from most buoyant to least buoyant.',
    variants: [
      {
        id: 'cyl-oak-block',
        label: 'Cylinder A: Large Oak Wood Block',
        description: 'Large wooden cylinder: 600 grams mass, 800 cm³ volume.',
        surfaceFeatures: ['large size', 'brown wood texture', 'heavy absolute weight (600g)'],
        deepFeatures: ['mass-to-volume ratio: 0.75 g/cm³', 'density < 1.0 g/cm³'],
        numericalParameters: { mass_g: 600, volume_cm3: 800 },
        outcomeValue: 0.75,
        outcomeUnit: 'g/cm³',
        visualHint: 'Floats with 25% of its volume exposed above the waterline.',
      },
      {
        id: 'cyl-lead-bullet',
        label: 'Cylinder B: Tiny Lead Slug',
        description: 'Tiny lead cylinder: 113 grams mass, 10 cm³ volume.',
        surfaceFeatures: ['small size', 'grey metal finish', 'light absolute weight (113g)'],
        deepFeatures: ['mass-to-volume ratio: 11.3 g/cm³', 'density >> 1.0 g/cm³'],
        numericalParameters: { mass_g: 113, volume_cm3: 10 },
        outcomeValue: 11.3,
        outcomeUnit: 'g/cm³',
        visualHint: 'Sinks rapidly to the bottom of the beaker.',
      },
      {
        id: 'cyl-aluminum-rod',
        label: 'Cylinder C: Aluminum Rod',
        description: 'Solid aluminum rod: 540 grams mass, 200 cm³ volume.',
        surfaceFeatures: ['metallic sheen', 'longer length', 'moderate weight (540g)'],
        deepFeatures: ['mass-to-volume ratio: 2.70 g/cm³', 'density > 1.0 g/cm³'],
        numericalParameters: { mass_g: 540, volume_cm3: 200 },
        outcomeValue: 2.7,
        outcomeUnit: 'g/cm³',
        visualHint: 'Sinks steadily to the bottom.',
      },
      {
        id: 'cyl-balsa-disc',
        label: 'Cylinder D: Ultra-Light Balsa Disc',
        description: 'Balsa wood disc: 32 grams mass, 200 cm³ volume.',
        surfaceFeatures: ['flat disc shape', 'very lightweight', 'same volume as Aluminum Rod'],
        deepFeatures: ['mass-to-volume ratio: 0.16 g/cm³', 'density << 1.0 g/cm³'],
        numericalParameters: { mass_g: 32, volume_cm3: 200 },
        outcomeValue: 0.16,
        outcomeUnit: 'g/cm³',
        visualHint: 'Rides high on the water surface (84% above water).',
      },
      {
        id: 'cyl-neutral-gel',
        label: 'Cylinder E: Calibrated Hydrogel Capsule',
        description: 'Sealed hydrogel cylinder: 350 grams mass, 350 cm³ volume.',
        surfaceFeatures: ['transparent polymer', 'flexible surface', 'medium size'],
        deepFeatures: ['mass-to-volume ratio: 1.00 g/cm³', 'density = water density'],
        numericalParameters: { mass_g: 350, volume_cm3: 350 },
        outcomeValue: 1.0,
        outcomeUnit: 'g/cm³',
        visualHint: 'Suspended in mid-water without sinking or rising (neutral buoyancy).',
      },
      {
        id: 'cyl-hollow-steel',
        label: 'Cylinder F: Hollow Steel Container',
        description: 'Hollow steel canister with air cavity: 400 grams mass, 1000 cm³ volume.',
        surfaceFeatures: ['made of heavy steel', 'shiny industrial finish', 'large diameter'],
        deepFeatures: ['bulk mass-to-volume ratio: 0.40 g/cm³', 'effective density < 1.0 g/cm³'],
        numericalParameters: { mass_g: 400, volume_cm3: 1000 },
        outcomeValue: 0.4,
        outcomeUnit: 'g/cm³',
        visualHint: 'Floats stably despite being constructed of steel.',
      },
    ],
    dimensions: [
      {
        id: 'dim-mass-vol-ratio',
        name: 'Mass-to-Volume Ratio (Density Invariance)',
        description: 'The proportion of mass packed into each unit of space (mass / volume).',
        isDeepDimension: true,
        explanation:
          'Determines buoyant behavior: regardless of whether total mass is 32g or 600g, if mass/volume < 1.0 g/cm³, buoyant force exceeds gravitational force.',
      },
      {
        id: 'dim-displacement-equilibrium',
        name: 'Liquid Displacement Equilibrium',
        description:
          'Comparing substance density to ambient fluid density (1.0 g/cm³ for pure water).',
        isDeepDimension: true,
        explanation:
          'Explains why hollow steel floats while tiny lead sinks: the displaced water volume generates buoyant thrust proportional to liquid density.',
      },
      {
        id: 'dim-absolute-weight',
        name: 'Total Weight / Absolute Mass (grams)',
        description: 'Focusing exclusively on whether an object is heavy or light.',
        isDeepDimension: false,
        distractorRationale:
          'Lead (113g) is lighter than Oak (600g), yet Lead sinks while Oak floats. Absolute weight fails to predict buoyancy.',
        explanation:
          'Surface distractor: heavy objects float if their volume is sufficiently large.',
      },
      {
        id: 'dim-geometric-shape',
        name: 'Aspect Ratio & Surface Flatness',
        description: 'Looking at whether the cylinder is a flat disc or elongated rod.',
        isDeepDimension: false,
        distractorRationale:
          'Shape affects hydrodynamic drag while moving, but hydrostatic buoyancy depends solely on displaced volume and density.',
        explanation:
          'Surface distractor: geometric shape does not alter static buoyant equilibrium.',
      },
      {
        id: 'dim-material-purity',
        name: 'Pure Metal vs Organic Material Classification',
        description: 'Assuming all metals sink and all woods float.',
        isDeepDimension: false,
        distractorRationale:
          'Hollow steel floats (bulk density 0.40 g/cm³) while ebony or ironwood sinks in water.',
        explanation:
          'Surface distractor: material identity is only relevant through effective bulk density.',
      },
    ],
    canonicalTelling: {
      lectureTitle: 'Archimedes’ Principle, Hydrostatic Equilibrium & Density Ratio',
      historicalContext:
        'Archimedes of Syracuse (c. 250 BC) Eureka insight for King Hiero’s crown, formalised mathematically by Leonhard Euler and George Stokes in continuum fluid mechanics.',
      formalLawName: 'Archimedes’ Buoyancy Law & Mass Density Formalism',
      formalEquation: 'rho = m / V; F_buoyant = rho_fluid * V_submerged * g',
      explanation:
        'Buoyant force equals the weight of displaced liquid. An object immersed in a liquid experiences net downward gravity F_g = rho_obj * V * g and net upward buoyant force F_b = rho_liquid * V * g. When rho_obj < rho_liquid, net force is upward until equilibrium is reached with partial submersion. When rho_obj > rho_liquid, downward gravity strictly dominates.',
      whyIntuitiveMetricsFail:
        'Learners frequently invent additive differences (mass - volume) or rely on mass alone. Additive differences are dimensionally invalid (subtracting grams from cm³) and fail to scale with object size. Only the intensive ratio mass/volume remains invariant across scaling.',
      howItCoordinatesCases:
        'Cylinder D (0.16) < F (0.40) < A (0.75) < E (1.00) < C (2.70) < B (11.30). The density ratio organizes all 6 cases into a monotonic physical continuum from highest floatation to rapid sinking.',
    },
    transferChallenge: {
      id: 'trans-dense-core-cargo',
      scenarioTitle: 'Super-Tanker Ballast & Brine Canal Crossing',
      description:
        'A cargo barge carrying dense steel machinery operates in freshwater (1.00 g/cm³), floating with 1.0 meter of freeboard. It transitions into the Great Salt Lake where water density is 1.22 g/cm³.',
      question:
        'What occurs to the barge freeboard (height above water) upon entering the dense brine?',
      options: [
        'The barge rises higher in the water because the denser fluid exerts greater buoyant force per unit volume of displacement.',
        'The barge sinks deeper because dense brine adds hydrostatic pressure to the hull plates.',
        'The barge remains at the identical waterline because the total mass of the barge is unchanged.',
        'The barge flips because salt water decreases the center of buoyancy.',
      ],
      correctOptionIndex: 0,
      targetConcept: 'Fluid Density Scaling & Hydrostatic Displacement Ratio',
      explanation:
        'Because buoyant force is F_b = rho_fluid * V_submerged * g, achieving equilibrium with the constant barge weight requires less submerged volume in higher-density fluid (V_submerged = m / rho_fluid). Thus, the barge rises higher in the brine.',
    },
  },
  {
    id: 'set-variability-dispersion',
    title: 'Baseball Pitcher Consistency & Statistical Dispersion',
    domain: 'statistics_variability',
    difficulty: 'intermediate',
    problemOverview:
      'Four pitching machines throw 10 pitches each toward a target strike-zone coordinate. All four machines achieve the identical average coordinate (the dead center of the strike zone). Learners must invent an index of "inconsistency" or "scatter" that penalizes irregular dispersion without having been taught sample variance or standard deviation.',
    guidingInventionPrompt:
      'Each pitcher throws pitches at measured distances (in inches) from the target center. All average 0 inches overall. Invent a single statistical index to score how unpredictable or erratic each pitcher is, ranking them from most consistent to most chaotic.',
    variants: [
      {
        id: 'pitcher-alpha-cluster',
        label: 'Pitcher Alpha: Tight Clustered Core with One Outlier',
        description: 'Nine pitches within 2 inches of center, but pitch 10 was wild at 20 inches.',
        surfaceFeatures: ['9 out of 10 hits near bullseye', 'one huge miss'],
        deepFeatures: ['low median error', 'high squared deviation penalty from outlier'],
        numericalParameters: { mean_error: 0, range: 20, median_dist: 1.8, outlier_dist: 20 },
        outcomeValue: 6.4,
        outcomeUnit: 'inches (std dev)',
        visualHint: 'Cluster of green dots with a single distant red dot at the perimeter.',
      },
      {
        id: 'pitcher-beta-uniform',
        label: 'Pitcher Beta: Constant Moderate Ring',
        description: 'All 10 pitches land uniformly spaced in a ring exactly 6 inches from center.',
        surfaceFeatures: ['no wild outliers', 'no direct bullseyes', 'predictable distance'],
        deepFeatures: ['zero variance in distance from target', 'moderate constant dispersion'],
        numericalParameters: { mean_error: 0, range: 12, median_dist: 6.0, outlier_dist: 6 },
        outcomeValue: 4.24,
        outcomeUnit: 'inches (std dev)',
        visualHint: 'Even circular halo around the strike zone boundary.',
      },
      {
        id: 'pitcher-gamma-bimodal',
        label: 'Pitcher Gamma: Two-Sided Bimodal Split',
        description:
          'Five pitches miss 8 inches to the extreme left, five pitches miss 8 inches to the extreme right.',
        surfaceFeatures: ['left-right dichotomy', 'no pitches in center', 'symmetric distribution'],
        deepFeatures: ['high variance without single extreme outlier', 'bimodal divergence'],
        numericalParameters: { mean_error: 0, range: 16, median_dist: 8.0, outlier_dist: 8 },
        outcomeValue: 8.0,
        outcomeUnit: 'inches (std dev)',
        visualHint: 'Two distinct clusters on opposite margins with empty center.',
      },
      {
        id: 'pitcher-delta-precision',
        label: 'Pitcher Delta: Micro-Precision Cluster',
        description: 'All 10 pitches grouped within 1.5 inches of target center.',
        surfaceFeatures: ['dense cluster', 'no outliers', 'optimal performance'],
        deepFeatures: ['low mean absolute deviation', 'minimal squared error'],
        numericalParameters: { mean_error: 0, range: 2.8, median_dist: 1.1, outlier_dist: 1.5 },
        outcomeValue: 0.98,
        outcomeUnit: 'inches (std dev)',
        visualHint: 'Single compact tight grouping tightly overlapping the bullseye.',
      },
    ],
    dimensions: [
      {
        id: 'dim-squared-distance-penalty',
        name: 'Squared Distance & Non-Linear Outlier Sensitivity',
        description:
          'Quantifying the spread by summing squared deviations (x_i - mean)² rather than raw range.',
        isDeepDimension: true,
        explanation:
          'Captures the disproportionate risk of wild outliers while penalizing diffuse variance systematically.',
      },
      {
        id: 'dim-sample-dispersion-normalization',
        name: 'Sample Size Normalization (Degrees of Freedom)',
        description: 'Dividing total error by sample count (n or n-1) to yield an intensive index.',
        isDeepDimension: true,
        explanation:
          'Ensures the variability metric remains comparable whether a pitcher throws 10 pitches or 100 pitches.',
      },
      {
        id: 'dim-raw-range-extremum',
        name: 'Raw Range (Max Distance - Min Distance)',
        description: 'Using only the single most extreme pitch minus the closest pitch.',
        isDeepDimension: false,
        distractorRationale:
          'Pitcher Alpha has a huge range (20 in) due to one errant pitch, but 90% of its pitches are tighter than Pitcher Beta. Range discards 80% of the sample data.',
        explanation:
          'Surface distractor: range ignores the underlying distribution shape of intermediate observations.',
      },
      {
        id: 'dim-cardinal-direction-bias',
        name: 'Horizontal vs Vertical Directional Angle',
        description: 'Distinguishing whether pitches missed high/low or left/right.',
        isDeepDimension: false,
        distractorRationale:
          'While directional bias informs mechanical tuning, total scalar dispersion from the target coordinates is independent of rotational angle.',
        explanation: 'Surface distractor: scalar dispersion treats radial deviation isotropically.',
      },
    ],
    canonicalTelling: {
      lectureTitle: 'Gauss, Pearson & the Geometry of Standard Deviation',
      historicalContext:
        'Carl Friedrich Gauss (1809) celestial orbit estimation and Karl Pearson (1893) formalization of standard deviation and root-mean-square error.',
      formalLawName: 'Sample Standard Deviation & Mean Squared Dispersion',
      formalEquation: 's = sqrt( (1 / (n - 1)) * sum( (x_i - x_bar)^2 ) )',
      explanation:
        'When deviations cancel to zero around the mean, summing raw distances fails to distinguish direction. Squaring deviations eliminates negative signs, penalizes outliers quadratically, and taking the square root restores the original units of measurement.',
      whyIntuitiveMetricsFail:
        'Students typically invent "Range" (Max - Min), which is fragile to single outliers and ignores sample size, or they sum absolute deviations without square-root scale restoration.',
      howItCoordinatesCases:
        'Delta (s = 0.98) < Beta (s = 4.24) < Alpha (s = 6.40) < Gamma (s = 8.00). Delta is superior, Beta is consistent moderate, Alpha is punished for its 20-inch wild miss, and Gamma has widespread bimodal dispersion.',
    },
    transferChallenge: {
      id: 'trans-financial-volatility',
      scenarioTitle: 'Portfolio Risk & Asset Return Volatility',
      description:
        'Two investment funds both produce an average annual return of +8.0% over 10 years. Fund X returns between +7% and +9% every year. Fund Y alternates between -20% and +36%.',
      question:
        'How does modern portfolio theory utilize standard deviation to evaluate the risk differential of Fund Y?',
      options: [
        'Standard deviation directly measures volatility as dispersion around the expected return; Fund Y has high sigma and requires a risk premium despite identical mean return.',
        'Fund Y is objectively superior because its peak positive return (+36%) exceeds Fund X.',
        'Both funds represent identical risk profiles because their 10-year arithmetic mean is +8.0%.',
        'Standard deviation is irrelevant because long-term compound growth only depends on median return.',
      ],
      correctOptionIndex: 0,
      targetConcept: 'Variance as Risk Dimension Independent of Expected Value',
      explanation:
        'Investors penalize dispersion (volatility) because geometric compound returns degrade as variance increases (variance drag: r_geom ≈ r_arith - s²/2).',
    },
  },
  {
    id: 'set-classifier-performance',
    title: 'Medical Diagnostic Test Precision vs Recall Invariance',
    domain: 'machine_learning_evaluation',
    difficulty: 'advanced',
    problemOverview:
      'Four AI diagnostic screening models are evaluated on a cohort of 10,000 patients where a rare disease has a 1.0% prevalence (100 actual diseased patients). Learners must invent a balanced performance score when raw accuracy fails completely.',
    guidingInventionPrompt:
      'Model 1 boasts 99.0% raw accuracy simply by predicting every single patient is healthy, finding 0 sick people. Invent an evaluation metric that exposes this failure and rewards models that balance finding sick people with avoiding false alarms.',
    variants: [
      {
        id: 'model-null-trivial',
        label: 'Model 1: The Trivial Non-Detector',
        description: 'Predicts "Negative" for all 10,000 patients. 0 false alarms, 0 sick found.',
        surfaceFeatures: ['99.0% raw accuracy', 'zero false alarms', 'useless clinically'],
        deepFeatures: ['Recall = 0.0%', 'Precision = Undefined (0)', 'F1-score = 0.00'],
        numericalParameters: {
          tp: 0,
          fp: 0,
          fn: 100,
          tn: 9900,
          raw_accuracy: 99.0,
        },
        outcomeValue: 0.0,
        outcomeUnit: 'F1-Score',
        visualHint: 'Solid grey grid, 100 real sick cases completely missed.',
      },
      {
        id: 'model-balanced-calibrated',
        label: 'Model 2: The Calibrated Diagnostician',
        description: 'Detects 85 of 100 sick patients, with 15 false alarms on healthy patients.',
        surfaceFeatures: ['98.7% raw accuracy', '85 true positives', '15 false alarms'],
        deepFeatures: ['Recall = 85.0%', 'Precision = 85.0%', 'F1-score = 0.85'],
        numericalParameters: {
          tp: 85,
          fp: 15,
          fn: 15,
          tn: 9885,
          raw_accuracy: 98.7,
        },
        outcomeValue: 0.85,
        outcomeUnit: 'F1-Score',
        visualHint: 'Clean separation with minimal confusion errors on both axes.',
      },
      {
        id: 'model-alarmist-screener',
        label: 'Model 3: The Paranoid Over-Screener',
        description: 'Catches 98 of 100 sick patients, but generates 900 false alarms.',
        surfaceFeatures: ['90.8% raw accuracy', 'catches 98% of cases', 'floods clinics'],
        deepFeatures: ['Recall = 98.0%', 'Precision = 9.8%', 'F1-score = 0.178'],
        numericalParameters: {
          tp: 98,
          fp: 900,
          fn: 2,
          tn: 9000,
          raw_accuracy: 90.8,
        },
        outcomeValue: 0.178,
        outcomeUnit: 'F1-Score',
        visualHint: 'Huge cloud of false positive warning flags across the cohort.',
      },
      {
        id: 'model-conservative-biopsy',
        label: 'Model 4: The Conservative Confirmer',
        description: 'Only flags cases when 95% certain: 40 sick found, only 2 false alarms.',
        surfaceFeatures: ['99.4% raw accuracy', 'ultra-high precision', 'misses 60 sick'],
        deepFeatures: ['Recall = 40.0%', 'Precision = 95.2%', 'F1-score = 0.563'],
        numericalParameters: {
          tp: 40,
          fp: 2,
          fn: 60,
          tn: 9898,
          raw_accuracy: 99.4,
        },
        outcomeValue: 0.563,
        outcomeUnit: 'F1-Score',
        visualHint: 'Very few flags, but 60 actual patients slip through unflagged.',
      },
    ],
    dimensions: [
      {
        id: 'dim-sensitivity-recall-ratio',
        name: 'Sensitivity / Recall Rate (True Positives / Actual Positives)',
        description: 'Proportion of actual disease cases identified by the model.',
        isDeepDimension: true,
        explanation: 'Guarantees the system does not miss life-threatening pathology.',
      },
      {
        id: 'dim-positive-predictive-value',
        name: 'Precision / Positive Predictive Value (True Positives / Predicted Positives)',
        description: 'Reliability of a positive flag (preventing medical false alarms).',
        isDeepDimension: true,
        explanation: 'Prevents clinical alert fatigue and unnecessary invasive procedures.',
      },
      {
        id: 'dim-raw-accuracy-prevalence-trap',
        name: 'Raw Classification Accuracy (TP + TN) / Total',
        description: 'Percentage of total correct predictions across both classes.',
        isDeepDimension: false,
        distractorRationale:
          'With 1% disease prevalence, predicting everyone healthy scores 99% accuracy while having zero clinical utility.',
        explanation: 'Surface distractor: raw accuracy is corrupted by severe class imbalance.',
      },
      {
        id: 'dim-absolute-test-count',
        name: 'Total Patient Cohort Volume (10,000)',
        description: 'The aggregate size of the testing population.',
        isDeepDimension: false,
        distractorRationale:
          'Cohort size changes absolute counts but does not alter intrinsic sensitivity and specificity ratios.',
        explanation: 'Surface distractor: evaluation metrics must be intensive rate parameters.',
      },
    ],
    canonicalTelling: {
      lectureTitle: 'Harmonic Mean, Neyman-Pearson Decision Theory & The F-Score',
      historicalContext:
        'Jerzy Neyman & Egon Pearson (1933) statistical hypothesis testing, and C. J. van Rijsbergen (1979) Information Retrieval F-measure formulation.',
      formalLawName: 'Harmonic Mean Precision-Recall Trade-Off (F1-Score)',
      formalEquation:
        'F_1 = 2 * ( (Precision * Recall) / (Precision + Recall) ) = ( 2 * TP ) / ( 2 * TP + FP + FN )',
      explanation:
        'An arithmetic mean of Precision and Recall allows a trivial 0% Recall to be masked by high Precision. The harmonic mean gives high weight to low values: if either Precision or Recall approaches zero, F1 drops precipitously to zero.',
      whyIntuitiveMetricsFail:
        'Students initially try simple averages ((P + R)/2) or raw accuracy. The arithmetic average fails because Model 3 (P=0.10, R=0.98) would receive an inflated score of 0.54 despite its catastrophic false alarm rate.',
      howItCoordinatesCases:
        'Model 1 (0.00) < Model 3 (0.18) < Model 4 (0.56) < Model 2 (0.85). Model 2 correctly emerges as the superior diagnostic screening engine.',
    },
    transferChallenge: {
      id: 'trans-fraud-detection',
      scenarioTitle: 'Banking Wire Transfer Fraud Detection System',
      description:
        'In a financial transaction stream of 1,000,000 transfers, fraudulent transactions occur at a rate of 0.05% (500 fraudulent transfers).',
      question:
        'Why would bank risk engineers prioritize tuning for Recall while constraining Precision through the F_beta metric (beta = 2)?',
      options: [
        'Setting beta = 2 weights Recall twice as heavily as Precision, ensuring multi-million dollar fraud losses are prevented even if analysts inspect occasional false alarms.',
        'Setting beta = 2 doubles the raw accuracy of the model automatically.',
        'Beta = 2 eliminates false positives entirely from the neural network output.',
        'Financial regulations ban the use of harmonic means on banking transactions.',
      ],
      correctOptionIndex: 0,
      targetConcept: 'Asymmetric Loss Matrix & F-Beta Trade-Off Parameterization',
      explanation:
        'In fraud detection, the financial and legal penalty of a False Negative (undetected multi-million dollar theft) vastly outweighs a False Positive (a temporary fraud-hold alert), justifying weighting recall higher via F_2.',
    },
  },
  {
    id: 'set-thermal-conduction',
    title: 'Building Envelope Wall Insulation & Thermal Resistance Invariance',
    domain: 'thermodynamics_materials',
    difficulty: 'intermediate',
    problemOverview:
      'Five multi-layer architectural wall sections are tested in an environmental chamber with a 30°C temperature differential (inside 20°C, outside -10°C). Learners must invent an index of "insulation performance" that correctly coordinates material conductivity and thickness.',
    guidingInventionPrompt:
      'Some walls are thick but made of conductive stone; others are paper-thin but made of advanced vacuum aerogels. Invent a single combined score for each wall that predicts which barrier lets the least heat escape per hour.',
    variants: [
      {
        id: 'wall-aerogel-thin',
        label: 'Wall A: Ultra-Thin Silica Aerogel Blanket',
        description: 'Thickness: 0.02 m (2 cm), Thermal Conductivity: 0.015 W/(m·K).',
        surfaceFeatures: ['very thin wall (2 cm)', 'lightweight', 'modern translucent core'],
        deepFeatures: ['Thermal Resistance R = 1.33 (m²·K)/W', 'Heat Flux q = 22.5 W/m²'],
        numericalParameters: { thickness_m: 0.02, conductivity: 0.015 },
        outcomeValue: 1.33,
        outcomeUnit: 'm²·K/W (R-Value)',
        visualHint: 'Minimal heat bleed despite ultra-thin profile.',
      },
      {
        id: 'wall-fiberglass-standard',
        label: 'Wall B: Standard Fiberglass Batt',
        description: 'Thickness: 0.10 m (10 cm), Thermal Conductivity: 0.040 W/(m·K).',
        surfaceFeatures: ['yellow fluffy batt', 'standard stud bay depth', 'lightweight'],
        deepFeatures: ['Thermal Resistance R = 2.50 (m²·K)/W', 'Heat Flux q = 12.0 W/m²'],
        numericalParameters: { thickness_m: 0.1, conductivity: 0.04 },
        outcomeValue: 2.5,
        outcomeUnit: 'm²·K/W (R-Value)',
        visualHint: 'Solid residential standard thermal barrier.',
      },
      {
        id: 'wall-dense-concrete',
        label: 'Wall C: Heavy Structural Concrete',
        description: 'Thickness: 0.30 m (30 cm), Thermal Conductivity: 1.500 W/(m·K).',
        surfaceFeatures: [
          'massive 30cm thick slab',
          'heavy aggregate grey stone',
          'structural wall',
        ],
        deepFeatures: ['Thermal Resistance R = 0.20 (m²·K)/W', 'Heat Flux q = 150.0 W/m²'],
        numericalParameters: { thickness_m: 0.3, conductivity: 1.5 },
        outcomeValue: 0.2,
        outcomeUnit: 'm²·K/W (R-Value)',
        visualHint: 'Massive heat loss: infrared camera shows glowing red exterior.',
      },
      {
        id: 'wall-polyisocyanurate-board',
        label: 'Wall D: Polyiso Foam Board Assembly',
        description: 'Thickness: 0.08 m (8 cm), Thermal Conductivity: 0.022 W/(m·K).',
        surfaceFeatures: ['rigid foil-faced foam', 'medium thickness', 'water-resistant'],
        deepFeatures: ['Thermal Resistance R = 3.64 (m²·K)/W', 'Heat Flux q = 8.2 W/m²'],
        numericalParameters: { thickness_m: 0.08, conductivity: 0.022 },
        outcomeValue: 3.64,
        outcomeUnit: 'm²·K/W (R-Value)',
        visualHint: 'Excellent thermal retention: exterior remains cold blue.',
      },
      {
        id: 'wall-vacuum-panel',
        label: 'Wall E: Vacuum Insulated Panel (VIP)',
        description: 'Thickness: 0.025 m (2.5 cm), Thermal Conductivity: 0.004 W/(m·K).',
        surfaceFeatures: ['metallic foil envelope', 'thin 2.5 cm profile', 'evacuated core'],
        deepFeatures: ['Thermal Resistance R = 6.25 (m²·K)/W', 'Heat Flux q = 4.8 W/m²'],
        numericalParameters: { thickness_m: 0.025, conductivity: 0.004 },
        outcomeValue: 6.25,
        outcomeUnit: 'm²·K/W (R-Value)',
        visualHint: 'Peak insulating performance with near-zero heat flux.',
      },
    ],
    dimensions: [
      {
        id: 'dim-thickness-conductivity-ratio',
        name: 'Thickness-to-Conductivity Ratio (R-Value = L / k)',
        description: 'Dividing barrier thickness by intrinsic material thermal conductivity.',
        isDeepDimension: true,
        explanation:
          'Determines true insulation: doubling thickness doubles R, while halving conductivity doubles R.',
      },
      {
        id: 'dim-heat-flux-reciprocal',
        name: 'Inversion of Conductive Heat Transfer (Fourier Resistance)',
        description: 'Heat flow per square meter is inversely proportional to R (q = deltaT / R).',
        isDeepDimension: true,
        explanation:
          'Coordinates temperature difference with composite barrier resistance to yield energy loss rate.',
      },
      {
        id: 'dim-absolute-wall-thickness',
        name: 'Total Wall Thickness (centimeters)',
        description: 'Judging insulation purely by how thick the wall looks.',
        isDeepDimension: false,
        distractorRationale:
          'Concrete Wall C is 30 cm thick but has dismal R-0.20, losing 7x more heat than thin 2 cm Aerogel (R-1.33).',
        explanation: 'Surface distractor: thickness without conductivity is completely misleading.',
      },
      {
        id: 'dim-material-density-heaviness',
        name: 'Material Density & Structural Heaviness',
        description: 'Assuming heavier, solid materials block heat better than light foams.',
        isDeepDimension: false,
        distractorRationale:
          'Dense concrete conducts heat rapidly through lattice vibrations; trapped air and vacuums provide superior resistance.',
        explanation:
          'Surface distractor: high density frequently correlates with higher conductivity.',
      },
    ],
    canonicalTelling: {
      lectureTitle: 'Fourier’s Law of Heat Conduction & The Thermal Resistance Framework',
      historicalContext:
        'Joseph Fourier (1822) Théorie analytique de la chaleur, founding the mathematical theory of thermal diffusion and gradient flux.',
      formalLawName: 'Fourier’s Law & Composite Thermal Resistance (R-Value)',
      formalEquation: 'R = L / k; q = Delta_T / R_total; Q_dot = (k * A * Delta_T) / L',
      explanation:
        'Heat flux through any planar slab is governed by the temperature gradient divided by thermal resistance. Resistance is directly proportional to path length (L) and inversely proportional to material conductivity (k). Multi-layer barriers simply sum their individual R-values: R_total = R_1 + R_2 + ... + R_n.',
      whyIntuitiveMetricsFail:
        'Learners frequently multiply thickness by conductivity (L * k) or focus solely on thickness. Multiplying L * k implies that high conductivity materials insulate better as they get thicker, which violates the second law of thermodynamics.',
      howItCoordinatesCases:
        'Concrete C (R = 0.20) < Aerogel A (R = 1.33) < Fiberglass B (R = 2.50) < Polyiso D (R = 3.64) < VIP E (R = 6.25). The R-value ordering perfectly predicts minimal heat flux.',
    },
    transferChallenge: {
      id: 'trans-cryogenic-dewar',
      scenarioTitle: 'Cryogenic Liquid Nitrogen Storage Vessel Insulation',
      description:
        'A cryogenic storage dewar must keep liquid nitrogen at -196°C in an ambient 24°C cleanroom. Engineers consider a double-walled jacket with high-vacuum insulation vs a 10 cm polystyrene foam wrap.',
      question:
        'Why does a 1 cm evacuated vacuum jacket outperform 10 cm of solid polystyrene foam by an order of magnitude?',
      options: [
        'Eliminating gas molecules in the vacuum jacket virtually eradicates gaseous conduction and convection, driving conductivity k near zero and yielding astronomical R-value per unit thickness.',
        'Vacuum jackets reflect infrared radiation mechanically without requiring low-emissivity coatings.',
        'Polystyrene foam absorbs nitrogen vapor and liquefies under cryogenic temperatures.',
        'Fourier’s law does not apply to vacuum environments.',
      ],
      correctOptionIndex: 0,
      targetConcept: 'Molecular Mean Free Path & Vacuum Elimination of Conduction',
      explanation:
        'Thermal conductivity of air relies on molecular collisions. In a high vacuum where the mean free path exceeds the gap dimension, conductive and convective heat transfer modes vanish.',
    },
  },
  {
    id: 'set-cache-coherence',
    title: 'Multi-Core Memory Hierarchy & False Sharing Invariance',
    domain: 'computer_systems_architecture',
    difficulty: 'advanced',
    problemOverview:
      'Four parallel algorithms divide a 1,000,000-element integer array across 4 CPU cores. Despite each thread having independent code and non-overlapping index bounds, execution speed varies by 14x due to hardware cache line boundaries (64-byte lines).',
    guidingInventionPrompt:
      'Every thread computes the identical number of loop iterations without software mutex locks. Yet Algorithm B takes 1420ms while Algorithm C finishes in 98ms. Invent a hardware memory access index that scores thread locality and explains this hidden bottleneck.',
    variants: [
      {
        id: 'algo-false-sharing-adjacent',
        label: 'Algorithm B: Adjacent Array Elements (False Sharing)',
        description:
          'Thread 0 writes to array[0], Thread 1 writes to array[1], Thread 2 writes to array[2], Thread 3 writes to array[3].',
        surfaceFeatures: [
          'independent non-overlapping memory indices',
          'no software lock contention',
          '1420 ms runtime',
        ],
        deepFeatures: [
          'all 4 indices reside in the same 64-byte L1 cache line',
          'MESI invalidation storm',
        ],
        numericalParameters: {
          stride_bytes: 4,
          threads: 4,
          cache_line_bytes: 64,
          invalidation_count: 3800000,
        },
        outcomeValue: 1420,
        outcomeUnit: 'milliseconds',
        visualHint: 'Cache line bouncing back and forth across core interconnects constantly.',
      },
      {
        id: 'algo-padded-cache-aligned',
        label: 'Algorithm C: Cache-Line Padded Accumulators',
        description:
          'Each thread writes to its own struct padded with 64 bytes of alignment buffer.',
        surfaceFeatures: [
          '64-byte memory padding per thread',
          'uses 256 bytes extra memory',
          '98 ms runtime',
        ],
        deepFeatures: [
          'each thread owns an exclusive independent cache line',
          'zero MESI invalidations',
        ],
        numericalParameters: {
          stride_bytes: 64,
          threads: 4,
          cache_line_bytes: 64,
          invalidation_count: 12,
        },
        outcomeValue: 98,
        outcomeUnit: 'milliseconds',
        visualHint: 'All 4 cores running at 100% compute efficiency with green L1 hits.',
      },
      {
        id: 'algo-chunked-block-stride',
        label: 'Algorithm D: Large Contiguous Block Decomposition',
        description:
          'Thread 0 processes indices 0..250k, Thread 1 processes 250k..500k, Thread 2 processes 500k..750k.',
        surfaceFeatures: [
          'simple standard parallel loop chunking',
          'clean sequential pointer math',
          '104 ms runtime',
        ],
        deepFeatures: [
          'false sharing restricted exclusively to boundary borders (2 boundaries total)',
          'high spatial locality',
        ],
        numericalParameters: {
          stride_bytes: 1000000,
          threads: 4,
          cache_line_bytes: 64,
          invalidation_count: 240,
        },
        outcomeValue: 104,
        outcomeUnit: 'milliseconds',
        visualHint: 'Steady stream of linear prefetch hits with negligible boundary ping-pong.',
      },
      {
        id: 'algo-interleaved-round-robin',
        label: 'Algorithm A: Fine-Grained Round-Robin Interleaving',
        description: 'Thread i processes index i, i+4, i+8, i+12 across the array.',
        surfaceFeatures: [
          'uniform static load balancing',
          'fine-grained interleaved access',
          '1180 ms runtime',
        ],
        deepFeatures: [
          'repeated overlapping cache line residency across adjacent thread steps',
          'bus traffic saturation',
        ],
        numericalParameters: {
          stride_bytes: 16,
          threads: 4,
          cache_line_bytes: 64,
          invalidation_count: 2950000,
        },
        outcomeValue: 1180,
        outcomeUnit: 'milliseconds',
        visualHint: 'Interconnect bus saturated with coherence invalidate broadcasts.',
      },
    ],
    dimensions: [
      {
        id: 'dim-cache-line-granularity',
        name: 'Cache Line Spatial Granularity (64-Byte Coherence Unit)',
        description:
          'Hardware reads and writes memory in 64-byte blocks, not individual 4-byte integers.',
        isDeepDimension: true,
        explanation:
          'When two cores write to different bytes in the same 64-byte line, hardware protocols treat it as a collision, invalidating each other’s L1 caches.',
      },
      {
        id: 'dim-coherence-invalidation-rate',
        name: 'Coherence State Invalidation Overhead (MESI Bouncing)',
        description:
          'The bus cycle cost of transitioning cache lines between Modified, Shared, and Invalid states.',
        isDeepDimension: true,
        explanation:
          'Bus invalidation forces CPU pipeline stalls while waiting for main memory or remote L2 transfers.',
      },
      {
        id: 'dim-software-index-separation',
        name: 'Logical Software Index Independence',
        description: 'Believing that if index A != index B, concurrent access is completely safe.',
        isDeepDimension: false,
        distractorRationale:
          'Logical variable independence does not map to physical memory bus independence.',
        explanation: 'Surface distractor: virtual indices conceal hardware cache line boundaries.',
      },
      {
        id: 'dim-total-operation-count',
        name: 'Total Arithmetic Instruction Count',
        description: 'Counting the number of ADD and MUL operations executed per core.',
        isDeepDimension: false,
        distractorRationale:
          'All four algorithms perform the exact same 1,000,000 arithmetic additions; runtime difference is 100% memory stalls.',
        explanation: 'Surface distractor: CPU compute instructions are dwarfed by memory latency.',
      },
    ],
    canonicalTelling: {
      lectureTitle: 'MESI Cache Coherence Protocol, Snooping Busses & False Sharing',
      historicalContext:
        'Papamarcos & Patel (1984) ISCA MESI protocol specification and modern multicore NUMA interconnect architecture.',
      formalLawName: 'MESI Invalidation Dynamics & False Sharing Penalty',
      formalEquation:
        'T_total = T_compute + ( N_false_sharing * T_bus_invalidation ); LineSize = 64 Bytes',
      explanation:
        'Modern microprocessors enforce cache coherence via the MESI protocol. A core must obtain Exclusive (E) or Modified (M) ownership before writing to a cache line. If another core attempts to write to the same 64-byte line, an Invalidation message is broadcast, forcing the previous owner to evict its copy. When multiple cores write to nearby addresses simultaneously, the cache line bounces ping-pong style between core caches, stalling pipelines.',
      whyIntuitiveMetricsFail:
        'Developers assume software separation guarantees hardware independence. Intuitive metrics count CPU cycles or operations, failing to model the hidden 64-byte chunking of the memory bus.',
      howItCoordinatesCases:
        'Padded C (98ms) ≈ Chunked D (104ms) << Interleaved A (1180ms) < Adjacent B (1420ms). Padded and Chunked isolate thread writes to distinct cache lines, while Adjacent causes worst-case thrashing.',
    },
    transferChallenge: {
      id: 'trans-concurrent-ring-buffer',
      scenarioTitle: 'High-Throughput Lockless Ring Buffer Queue',
      description:
        'A systems architect designs a lock-free Single-Producer Single-Consumer (SPSC) ring buffer with an atomic `head` pointer and an atomic `tail` pointer.',
      question:
        'How should the struct memory layout be declared to guarantee nanosecond-scale message latency?',
      options: [
        'Place `alignas(64)` between the head and tail pointers so they reside on separate cache lines, preventing producer writes from invalidating consumer reads.',
        'Place `head` and `tail` in adjacent 8-byte variables so they fit within the same cache line to maximize spatial prefetching.',
        'Use volatile memory keywords without cache alignment.',
        'Encrypt the pointers to eliminate bus collision interrupts.',
      ],
      correctOptionIndex: 0,
      targetConcept: 'Cache-Line Alignment Padding in Concurrent Data Structures',
      explanation:
        'If `head` (written by producer) and `tail` (written by consumer) share a single 64-byte cache line, every enqueue will invalidate the consumer’s cache line, causing devastating false sharing slowdowns.',
    },
  },
]

// ── Core Domain Evaluation Functions ─────────────────────────────────────────

/**
 * Evaluates a learner's contrasting cases invention attempt prior to or after lecture reveal.
 */
export function evaluateContrastingAttempt(
  caseSet: ContrastingCaseSet,
  submission: InventedMetricSubmission,
): ContrastingEvaluation {
  const pedagogicalFeedback: string[] = []
  const strengths: string[] = []
  const vulnerabilities: string[] = []

  // 1. Feature Discrimination Rigor Score (FDRS)
  const deepDimensions = caseSet.dimensions.filter((d) => d.isDeepDimension)
  const distractorDimensions = caseSet.dimensions.filter((d) => !d.isDeepDimension)

  const identifiedDeepDimensions = submission.selectedDimensionIds.filter((id) =>
    deepDimensions.some((d) => d.id === id),
  )
  const missedDeepDimensions = deepDimensions
    .filter((d) => !submission.selectedDimensionIds.includes(d.id))
    .map((d) => d.name)
  const superficialDistractorsChosen = submission.selectedDimensionIds
    .filter((id) => distractorDimensions.some((d) => d.id === id))
    .map((id) => caseSet.dimensions.find((d) => d.id === id)?.name ?? id)

  const deepRecall = (identifiedDeepDimensions.length / Math.max(deepDimensions.length, 1)) * 100
  const distractorPenalty = superficialDistractorsChosen.length * 25
  const fdrs = Math.max(0, Math.min(100, Math.round(deepRecall - distractorPenalty)))

  if (identifiedDeepDimensions.length === deepDimensions.length && distractorPenalty === 0) {
    strengths.push(
      'Superb perceptual discrimination: perfectly differentiated deep structural invariants from superficial distractors (Schwartz & Bransford 1998).',
    )
  } else if (superficialDistractorsChosen.length > 0) {
    vulnerabilities.push(
      `Fell for superficial feature distractors: ${superficialDistractorsChosen.join(', ')}.`,
    )
  }

  // 2. Invented Metric Invariance (IMI) & Ranking Accuracy
  // Canonical sorting order: sorted by outcomeValue ascending
  const sortedVariants = [...caseSet.variants].sort((a, b) => a.outcomeValue - b.outcomeValue)
  const canonicalRankingOrder = sortedVariants.map((v) => v.id)

  let rankingMatches = 0
  for (let i = 0; i < submission.variantRankings.length; i++) {
    if (submission.variantRankings[i] === canonicalRankingOrder[i]) {
      rankingMatches++
    }
  }

  const rankingAccuracy = Math.round((rankingMatches / Math.max(caseSet.variants.length, 1)) * 100)

  const formulaWords = submission.formulaDescription.trim().split(/\s+/).filter(Boolean).length
  const formulaRigorBonus = formulaWords >= 15 ? 30 : (formulaWords / 15) * 30
  const imi = Math.max(
    0,
    Math.min(100, Math.round((rankingAccuracy / 100) * 70 + formulaRigorBonus)),
  )

  if (rankingAccuracy >= 80) {
    strengths.push(
      'Robust metric invariance: invented rule successfully orders contrasting variants along true physical/statistical gradients.',
    )
  } else {
    vulnerabilities.push(
      'Metric instability: invented rule misranks contrasting variants when tested against boundary conditions.',
    )
  }

  // 3. Preparation for Future Readiness Index (PFRI)
  const reflectionLength = submission.reflectionNotes.trim().length
  const impasseProductive = submission.impasseEncountered && reflectionLength >= 30

  let pfri = 50
  if (impasseProductive) pfri += 35
  if (fdrs >= 60) pfri += 15
  pfri = Math.min(100, pfri)

  if (impasseProductive) {
    strengths.push(
      'Productive impasse achieved: actively formulated cognitive tension, priming mental schema for canonical lecture delivery.',
    )
  }

  // 4. Contrasting Differentiation & Transfer Score (CDTS)
  // CDTS = 0.35 * FDRS + 0.35 * IMI + 0.30 * PFRI
  const cdts = Math.min(100, Math.round(fdrs * 0.35 + imi * 0.35 + pfri * 0.3))

  let maturityBand: ContrastingEvaluation['maturityBand'] = 'superficial_observer'
  if (cdts >= 85) maturityBand = 'canonical_synthesizer'
  else if (cdts >= 70) maturityBand = 'differentiating_theorist'
  else if (cdts >= 50) maturityBand = 'proto_inventor'

  // Pedagogical Feedback Synthesis
  if (maturityBand === 'canonical_synthesizer') {
    pedagogicalFeedback.push(
      'Exceptional Preparation for Future Learning: Your invented metric captures the underlying invariance across cases, allowing seamless synthesis with formal theory (Schwartz & Martin 2004).',
    )
  } else if (maturityBand === 'differentiating_theorist') {
    pedagogicalFeedback.push(
      'Strong structural differentiation. You discerned the critical parameters; now inspect how the formal equation coordinates these ratios into a universal constant.',
    )
  } else if (maturityBand === 'proto_inventor') {
    pedagogicalFeedback.push(
      'Promising intuitive model. You noticed differences across cases, but superficial features (e.g., raw scale, shape) partially confounded your rule.',
    )
  } else {
    pedagogicalFeedback.push(
      'Surface feature fixation: Your model evaluated cases by absolute magnitudes rather than intensive ratios. Compare the extreme outlier cases to see why raw numbers fail.',
    )
  }

  return {
    fdrs,
    imi,
    pfri,
    cdts,
    maturityBand,
    identifiedDeepDimensions,
    missedDeepDimensions,
    superficialDistractorsChosen,
    rankingAccuracy,
    impasseProductive,
    pedagogicalFeedback,
    strengths,
    vulnerabilities,
  }
}

/**
 * Generates calibrated FSRS-6 review cards based on contrasting cases differentiation telemetry.
 */
export function generateContrastingFSRSDeck(
  caseSet: ContrastingCaseSet,
  evaluation: ContrastingEvaluation,
): CalibratedContrastingDeck {
  const cdtsFactor = evaluation.cdts / 100
  const baseStability = parseFloat((3.5 + cdtsFactor * 4.0).toFixed(1)) // 3.5d to 7.5d
  const baseDifficulty = parseFloat((6.5 - cdtsFactor * 2.5).toFixed(1)) // 6.5 down to 4.0

  const cards: CalibratedContrastingCard[] = [
    {
      id: `contrasting-card-${caseSet.id}-1`,
      cardType: 'perceptual_differentiation',
      front: `[Contrasting Cases: ${caseSet.title}]\nWhen comparing the contrasting cases in ${caseSet.title}, what deep structural invariant separates the variants, and what surface feature is a distractor?`,
      back: `Deep Structural Invariant:\n${caseSet.dimensions
        .filter((d) => d.isDeepDimension)
        .map((d) => `• ${d.name}: ${d.description}`)
        .join('\n')}\n\nSuperficial Distractors to Discard:\n${caseSet.dimensions
        .filter((d) => !d.isDeepDimension)
        .map((d) => `• ${d.name}: ${d.explanation}`)
        .join('\n')}`,
      targetConcept: 'Perceptual Feature Differentiation (Schwartz & Bransford 1998)',
      fsrsParameters: {
        stability: baseStability,
        difficulty: baseDifficulty,
      },
    },
    {
      id: `contrasting-card-${caseSet.id}-2`,
      cardType: 'invariant_ratio',
      front: `[Invented Invariance: ${caseSet.title}]\nWhat invariant mathematical ratio or relation coordinates all contrasting cases without dimensional error?`,
      back: `Governing Relation:\n${caseSet.canonicalTelling.formalEquation}\n\nExplanation:\n${caseSet.canonicalTelling.howItCoordinatesCases}`,
      targetConcept: 'Dimensional Invariance & Mathematical Coordination',
      fsrsParameters: {
        stability: parseFloat((baseStability * 1.15).toFixed(1)),
        difficulty: baseDifficulty,
      },
    },
    {
      id: `contrasting-card-${caseSet.id}-3`,
      cardType: 'canonical_telling',
      front: `[A Time for Telling: ${caseSet.title}]\nWhy do naive intuitive rules (like additive differences or raw counts) fail on extreme contrasting cases in ${caseSet.title}?`,
      back: `${caseSet.canonicalTelling.whyIntuitiveMetricsFail}\n\nCanonical Solution:\n${caseSet.canonicalTelling.explanation}`,
      targetConcept: 'Preparation for Future Learning & Canonical Theory Synthesis',
      fsrsParameters: {
        stability: baseStability,
        difficulty: parseFloat(Math.max(2.5, baseDifficulty - 0.5).toFixed(1)),
      },
    },
    {
      id: `contrasting-card-${caseSet.id}-4`,
      cardType: 'transfer_application',
      front: `[Far Transfer Challenge: ${caseSet.transferChallenge.scenarioTitle}]\n${caseSet.transferChallenge.question}`,
      back: `Correct Principle:\n${caseSet.transferChallenge.options[caseSet.transferChallenge.correctOptionIndex]}\n\nDeep Explanation:\n${caseSet.transferChallenge.explanation}`,
      targetConcept: caseSet.transferChallenge.targetConcept,
      fsrsParameters: {
        stability: parseFloat((baseStability * 1.3).toFixed(1)),
        difficulty: parseFloat(Math.max(2.0, baseDifficulty - 1.0).toFixed(1)),
      },
    },
  ]

  return {
    setId: caseSet.id,
    setTitle: caseSet.title,
    cdtsBaseline: evaluation.cdts,
    cards,
  }
}
