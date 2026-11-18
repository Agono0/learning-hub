/**
 * Learning HUB — Multi-Representational Fluency & Representational Competence Engine
 *
 * Grounded in the cognitive science of:
 * - Shaaron Ainsworth (1999, 2006):
 *   "A functional taxonomy of multiple representations" (Computers & Education)
 *   "DeFT (Design, Functions, Tasks) framework for learning with multiple representations"
 *   (Learning and Instruction)
 *   Complementary, Constraining, and Constructing cognitive functions of Multiple External Representations (MERs).
 * - Richard Lesh, Thomas Post, & Merlyn Behr (1987):
 *   "Representations and Translations among Representations in Mathematics Learning and Problem Solving"
 *   The Lesh Translation Model: fluency across symbolic, manipulative, pictorial, verbal, and contextual modes.
 * - Robert L. Goldstone & Ji Y. Son (2005):
 *   "The Transfer of Scientific Principles Using Concrete and Idealized Simulations" (Cognitive Science)
 *   Concreteness fading: scaffolding understanding from grounded perceptual cases to abstract formalisms.
 * - Richard E. Mayer (2005):
 *   "Cognitive Theory of Multimedia Learning" (CTML)
 *   Multiple representation principle and spatial/temporal contiguity in cross-modal integration.
 */

import { z } from 'zod'

// -----------------------------------------------------------------------------
// Schemas & Types
// -----------------------------------------------------------------------------

export const RepresentationModalitySchema = z.enum([
  'symbolic_formal', // Mathematical equations, formal symbolic proofs, linear algebra
  'computational_code', // Executable algorithmic implementations, vectorized tensor expressions
  'visual_geometric', // Geometric diagrams, phase-space vector plots, computation graphs
  'concrete_physical', // Grounded physical analogies, water/pipe flows, mechanical intuition
  'verbal_narrative', // Structured causal prose, explanatory mechanistic stories
])
export type RepresentationModality = z.infer<typeof RepresentationModalitySchema>

export const AinsworthDeFTFunctionSchema = z.enum([
  'complementary', // Representations contain divergent information or support distinct cognitive processes
  'constraining', // Familiar representation constrains interpretation of unfamiliar/ambiguous representation
  'constructing', // Multi-modal integration constructs a deeper, abstracted mental schema
])
export type AinsworthDeFTFunction = z.infer<typeof AinsworthDeFTFunctionSchema>

export const ModalityArtifactSchema = z.object({
  modality: RepresentationModalitySchema,
  title: z.string(),
  content: z.string(),
  keyElements: z.array(z.string()),
  cognitiveAffordance: z.string(), // What this modality makes easy to perceive
  cognitiveLimitation: z.string(), // What this modality obscures or makes difficult
})
export type ModalityArtifact = z.infer<typeof ModalityArtifactSchema>

export const CrossModalMappingChallengeSchema = z.object({
  id: z.string(),
  sourceModality: RepresentationModalitySchema,
  targetModality: RepresentationModalitySchema,
  deftFunction: AinsworthDeFTFunctionSchema,
  prompt: z.string(),
  sourceElement: z.string(),
  targetElementOptions: z.array(z.string()),
  correctTargetElement: z.string(),
  structuralMappingExplanation: z.string(),
  goldstoneFadingStep: z.enum(['grounded_concrete', 'intermediate_visual', 'idealized_formal']),
})
export type CrossModalMappingChallenge = z.infer<typeof CrossModalMappingChallengeSchema>

export const RepresentationalProblemSchema = z.object({
  id: z.string(),
  domain: z.enum(['information_theory', 'state_estimation', 'signal_processing', 'deep_learning']),
  title: z.string(),
  coreInvariancePrinciple: z.string(),
  artifacts: z.record(RepresentationModalitySchema, ModalityArtifactSchema),
  translationChallenges: z.array(CrossModalMappingChallengeSchema),
  deepSynthesisSynthesis: z.string(),
})
export type RepresentationalProblem = z.infer<typeof RepresentationalProblemSchema>

export const RepresentationalSessionMetricsSchema = z.object({
  problemId: z.string(),
  exploredModalities: z.array(RepresentationModalitySchema),
  completedChallengeIds: z.array(z.string()),
  correctChallengeIds: z.array(z.string()),
  averageTranslationLatencyMs: z.number(),
  representationalCoordinationGap: z.number().min(0).max(1),
  crossModalCoherenceScore: z.number().min(0).max(1),
  representationalFluencyIndex: z.number().min(0).max(1),
})
export type RepresentationalSessionMetrics = z.infer<typeof RepresentationalSessionMetricsSchema>

export interface FSRSTranslationCard {
  id: string
  problemTitle: string
  sourceModality: RepresentationModality
  targetModality: RepresentationModality
  deftFunction: AinsworthDeFTFunction
  prompt: string
  answer: string
  isomorphismRule: string
  cognitiveAffordanceNote: string
}

// -----------------------------------------------------------------------------
// Modality Metadata & Lesh Model Catalog
// -----------------------------------------------------------------------------

export interface ModalityCatalogEntry {
  modality: RepresentationModality
  label: string
  leshEquivalent: string
  primaryStrength: string
  vulnerabilityToMisconception: string
}

export const CANONICAL_MODALITY_CATALOG: Record<RepresentationModality, ModalityCatalogEntry> = {
  symbolic_formal: {
    modality: 'symbolic_formal',
    label: 'Formal Symbolic / Mathematical',
    leshEquivalent: 'Written Symbols',
    primaryStrength: 'Maximal conciseness, rigorous deductive proof, and algebraic manipulation.',
    vulnerabilityToMisconception:
      'Symbol manipulation without semantic grounding (formula-plugging syndrome).',
  },
  computational_code: {
    modality: 'computational_code',
    label: 'Computational / Algorithmic Code',
    leshEquivalent: 'Procedural Manipulation',
    primaryStrength:
      'Unambiguous operational execution, boundary condition testing, and state inspection.',
    vulnerabilityToMisconception:
      'Implementation accidental complexity masking fundamental mathematical principles.',
  },
  visual_geometric: {
    modality: 'visual_geometric',
    label: 'Geometric / Visual Topology',
    leshEquivalent: 'Static Pictorial Models',
    primaryStrength:
      'Holistic spatial relationships, qualitative trend recognition, and manifold topology.',
    vulnerabilityToMisconception:
      'Perceptual salience illusions and over-reliance on 2D/3D visual artifacts.',
  },
  concrete_physical: {
    modality: 'concrete_physical',
    label: 'Concrete Physical / Grounded Analogy',
    leshEquivalent: 'Real-World Situations & Manipulatives',
    primaryStrength:
      'Immediate sensorimotor intuition, emotional plausibility, and causal grounding.',
    vulnerabilityToMisconception:
      'Superficial disanalogies where physical limits do not map to formal theory.',
  },
  verbal_narrative: {
    modality: 'verbal_narrative',
    label: 'Verbal / Mechanistic Narrative',
    leshEquivalent: 'Spoken / Written Language',
    primaryStrength:
      'Causal teleology, explaining "why" mechanisms interact, and human communicability.',
    vulnerabilityToMisconception:
      'Semantic ambiguity and hand-waving that hides non-conservation or divergence.',
  },
}

// -----------------------------------------------------------------------------
// Calibrated Multi-Representational Problems
// -----------------------------------------------------------------------------

export const CALIBRATED_REPRESENTATIONAL_PROBLEMS: RepresentationalProblem[] = [
  {
    id: 'shannon_information_entropy',
    domain: 'information_theory',
    title: 'Shannon Information Entropy & KL Divergence',
    coreInvariancePrinciple:
      'Information is the average reduction in uncertainty; entropy H(X) measures the expected surprise (bits) required to encode outcomes under an optimal source code.',
    artifacts: {
      symbolic_formal: {
        modality: 'symbolic_formal',
        title: 'Symbolic Formalism (Claude Shannon 1948)',
        content:
          'H(X) = - \\sum_{x \\in \\mathcal{X}} P(x) \\log_2 P(x) = \\mathbb{E}_{X}[I(x)]\n\nD_{KL}(P \\parallel Q) = \\sum_{x \\in \\mathcal{X}} P(x) \\log_2 \\left(\\frac{P(x)}{Q(x)}\\right) = \\mathbb{E}_{P}\\left[\\log_2 \\frac{P(x)}{Q(x)}\\right]',
        keyElements: [
          'P(x): Probability distribution of symbol x',
          'I(x) = -log2 P(x): Self-information / Surprise of event x in bits',
          'D_KL(P || Q): Relative entropy (extra bits wasted using distribution Q instead of true P)',
          'Jensen inequality: D_KL(P || Q) >= 0 with equality iff P = Q',
        ],
        cognitiveAffordance:
          'Precise deductive proofs of non-negativity and source coding theorem limits.',
        cognitiveLimitation:
          'Obscures how bits correspond to physical decision trees or search paths.',
      },
      computational_code: {
        modality: 'computational_code',
        title: 'Vectorized Computational Implementation (PyTorch / NumPy)',
        content: `import numpy as np

def shannon_entropy(p: np.ndarray, eps: float = 1e-12) -> float:
    """Computes Shannon entropy H(X) in bits."""
    p_safe = np.clip(p, eps, 1.0)
    p_safe = p_safe / np.sum(p_safe)
    return float(-np.sum(p_safe * np.log2(p_safe)))

def kl_divergence(p: np.ndarray, q: np.ndarray, eps: float = 1e-12) -> float:
    """Computes KL divergence D_KL(P || Q) in bits."""
    p_safe = np.clip(p / np.sum(p), eps, 1.0)
    q_safe = np.clip(q / np.sum(q), eps, 1.0)
    return float(np.sum(p_safe * np.log2(p_safe / q_safe)))`,
        keyElements: [
          'eps clipping: handles log(0) numeric singularities',
          'Normalization: ensures sum(p) == 1.0 probability simplex constraint',
          'Pointwise array multiply: vectorized expected value computation',
        ],
        cognitiveAffordance: 'Direct numerical testing with arbitrary discrete distributions.',
        cognitiveLimitation: 'Numerical epsilon guards can obscure exact theoretical zero limits.',
      },
      visual_geometric: {
        modality: 'visual_geometric',
        title: 'Geometric Probability Simplex & Surprise Curve',
        content:
          'For a binary distribution X ~ Bernoulli(p):\n- Entropy curve H(p) is a symmetric concave arch over p in [0, 1].\n- Peak at p = 0.5 where H(0.5) = 1.0 bit (maximal ignorance).\n- Boundary limits H(0) = 0 and H(1) = 0 (absolute certainty, zero surprise).\n- KL divergence D_KL(P || Q) forms a Bregman divergence: asymmetric curvature distance on the probability simplex.',
        keyElements: [
          'Symmetric concave parabola peaking at uniform distribution',
          'Tangent slopes representing marginal information gain',
          'Asymmetric manifold distance between distribution points',
        ],
        cognitiveAffordance:
          'Instant qualitative visualization of maximal uncertainty at uniformity.',
        cognitiveLimitation: 'Difficult to visualize for state spaces with dimension > 3.',
      },
      concrete_physical: {
        modality: 'concrete_physical',
        title: 'Concrete 20-Questions Optimal Binary Search Tree',
        content:
          'Imagine a game of 20 Questions where you must identify an animal out of 8 possibilities:\n- If all 8 animals are equally likely (p = 1/8), each optimal yes/no question splits the pool in half, taking exactly log2(8) = 3 questions.\n- If a dog has p = 0.5, cat has p = 0.25, and 6 rare birds have p = 0.0416 each, an optimal tree asks "Is it a dog?" first (1 bit), minimizing average questions asked to H(X) = 1.75 questions.',
        keyElements: [
          'Yes/No questions: exactly 1 bit of information bandwidth each',
          'Optimal prefix tree: frequent items near root, rare items deep in branches',
          'Wasted questions: using the wrong question tree (KL divergence)',
        ],
        cognitiveAffordance:
          'Intuitive sensorimotor understanding of bits as necessary binary decisions.',
        cognitiveLimitation:
          'Discrete questions make fractional bit values (e.g. 1.75 bits) feel counterintuitive.',
      },
      verbal_narrative: {
        modality: 'verbal_narrative',
        title: 'Causal Mechanistic Narrative',
        content:
          'Entropy is the quantitative cost of surprise. If the sun rises tomorrow, nobody prints a newspaper because the probability is near 1 and the information content is zero. If the sun failed to rise, the surprise is astronomical and the information payload is enormous. Shannon entropy measures the expected average surprise of an observer before a message arrives: when all messages are equally likely, anticipation is maximally scrambled and entropy peaks.',
        keyElements: [
          'Surprise is inversely proportional to prior expectation',
          'Entropy is average anticipatory uncertainty',
          'Compression limit: cannot compress below H(X) without loss',
        ],
        cognitiveAffordance: 'Accessible conceptual intuition for non-technical communicators.',
        cognitiveLimitation:
          'Lacks quantitative formula to compute exact channel transmission limits.',
      },
    },
    translationChallenges: [
      {
        id: 'ent_trans_1',
        sourceModality: 'concrete_physical',
        targetModality: 'symbolic_formal',
        deftFunction: 'constraining',
        prompt:
          'In the 20-Questions physical game, asking a question that isolates an event of probability P(x) requires -log2 P(x) binary queries. What mathematical term represents this?',
        sourceElement: 'The number of yes/no questions needed to confirm outcome x',
        targetElementOptions: [
          'Self-information I(x) = -log2 P(x)',
          'KL Divergence D_KL(P || Q)',
          'Joint entropy H(X, Y)',
          'Channel capacity C',
        ],
        correctTargetElement: 'Self-information I(x) = -log2 P(x)',
        structuralMappingExplanation:
          'Each optimal binary question halves the uncertainty (factor of 2). Resolving an event with probability P(x) requires halving the hypothesis space log2(1/P(x)) = -log2 P(x) times.',
        goldstoneFadingStep: 'grounded_concrete',
      },
      {
        id: 'ent_trans_2',
        sourceModality: 'visual_geometric',
        targetModality: 'computational_code',
        deftFunction: 'complementary',
        prompt:
          'On the geometric entropy curve, the entropy drops to exactly 0 when p = 0. How does the computational code guard against mathematical undefined behavior at this point?',
        sourceElement: 'The boundary point p = 0 where log2(0) = -infinity',
        targetElementOptions: [
          'np.clip(p, eps, 1.0) with small epsilon clamp',
          'p * 0 return override',
          'np.nan_to_num exception handler',
          'assert p > 0 check',
        ],
        correctTargetElement: 'np.clip(p, eps, 1.0) with small epsilon clamp',
        structuralMappingExplanation:
          'While lim_{p->0} p*log2(p) = 0 analytically, IEEE-754 floating point evaluates 0.0 * -inf as NaN. Clamping with epsilon prevents NaN while preserving near-zero entropy.',
        goldstoneFadingStep: 'intermediate_visual',
      },
      {
        id: 'ent_trans_3',
        sourceModality: 'symbolic_formal',
        targetModality: 'verbal_narrative',
        deftFunction: 'constructing',
        prompt:
          'Translate the symbolic asymmetric definition D_KL(P || Q) = sum P(x) log(P(x) / Q(x)) into the causal narrative of an observer using an incorrect model.',
        sourceElement: 'D_KL(P || Q) relative entropy',
        targetElementOptions: [
          'The average number of extra bits wasted per message when encoding reality (P) using beliefs (Q)',
          'The symmetric distance between two physical probability clouds',
          'The total noise added by an electrical transmission wire',
          'The probability that distribution P equals distribution Q',
        ],
        correctTargetElement:
          'The average number of extra bits wasted per message when encoding reality (P) using beliefs (Q)',
        structuralMappingExplanation:
          'KL divergence is not a true metric distance because it is asymmetric: expecting Q when reality is P incurs an efficiency penalty proportional to P(x) * log(P(x)/Q(x)).',
        goldstoneFadingStep: 'idealized_formal',
      },
    ],
    deepSynthesisSynthesis:
      'Shannon Entropy demonstrates that information is fundamentally relational: whether viewed as optimal binary tree branchings (concrete), concave curvature on a simplex (visual), vectorized sums with numerical epsilons (code), or expected surprise (verbal), the underlying invariance is the logarithmic measure of uncertainty.',
  },
  {
    id: 'kalman_filter_state_estimation',
    domain: 'state_estimation',
    title: 'Kalman Filter State Estimation & Bayesian Fusion',
    coreInvariancePrinciple:
      'Optimal state estimation dynamically fuses noisy physical predictions with noisy sensor observations by weighting each by the inverse of their covariance.',
    artifacts: {
      symbolic_formal: {
        modality: 'symbolic_formal',
        title: 'Kalman Matrix Recurrence Equations (R.E. Kalman 1960)',
        content:
          'Predict Step:\n\\hat{x}_{k|k-1} = F_k \\hat{x}_{k-1|k-1} + B_k u_k\nP_{k|k-1} = F_k P_{k-1|k-1} F_k^T + Q_k\n\nUpdate Step:\nK_k = P_{k|k-1} H_k^T (H_k P_{k|k-1} H_k^T + R_k)^{-1}\n\\hat{x}_{k|k} = \\hat{x}_{k|k-1} + K_k (z_k - H_k \\hat{x}_{k|k-1})\nP_{k|k} = (I - K_k H_k) P_{k|k-1}',
        keyElements: [
          'F, B: State transition and control input matrices',
          'Q, R: Process noise and measurement noise covariance matrices',
          'K_k: Kalman Gain matrix balancing prior confidence vs sensor innovation',
          '(z_k - H x): Innovation / Measurement residual',
        ],
        cognitiveAffordance:
          'Provable Minimum Mean Square Error (MMSE) optimality for linear Gaussian models.',
        cognitiveLimitation:
          'Matrix inversions and transpose products hide the intuitive 1D weighted averaging mechanism.',
      },
      computational_code: {
        modality: 'computational_code',
        title: '1D Kalman Filter Implementation in Python',
        content: `class KalmanFilter1D:
    def __init__(self, x0: float, p0: float, q: float, r: float):
        self.x = x0  # state estimate
        self.p = p0  # estimate variance
        self.q = q   # process noise variance
        self.r = r   # measurement noise variance

    def predict(self, u: float = 0.0) -> None:
        self.x = self.x + u
        self.p = self.p + self.q

    def update(self, z: float) -> float:
        # Kalman gain: variance ratio
        k = self.p / (self.p + self.r)
        self.x = self.x + k * (z - self.x)
        self.p = (1.0 - k) * self.p
        return self.x`,
        keyElements: [
          'k = p / (p + r): Scalar Kalman gain as simple fraction in [0, 1]',
          'self.x + k * (z - self.x): Linear interpolation between prediction and observation',
          'Variance shrinkage: self.p = (1 - k) * self.p',
        ],
        cognitiveAffordance:
          'Exposes how Kalman gain simplifies to a classical convex combination scalar in 1D.',
        cognitiveLimitation: 'Scalar version lacks directional cross-covariance correlation terms.',
      },
      visual_geometric: {
        modality: 'visual_geometric',
        title: 'Multiplication of Two Gaussian Probability Densities',
        content:
          '1. Prior belief is a Gaussian bell curve centered at x_pred with width sigma_p.\n2. New measurement is a Gaussian bell curve centered at z with width sigma_r.\n3. Bayesian posterior is the product of the two Gaussians:\n   - New peak lies strictly between the two peaks.\n   - New bell curve is narrower (lower variance) than BOTH the prior and the measurement.\n   - Fusing two noisy pieces of data always increases certainty.',
        keyElements: [
          'Prior Gaussian curve + Measurement Gaussian curve',
          'Posterior product curve with narrower variance ellipse',
          'Kalman gain as the shift towards measurement peak',
        ],
        cognitiveAffordance:
          'Visualizes why fusing two uncertain measurements produces an answer more certain than either alone.',
        cognitiveLimitation:
          'Hard to mentally visualize multidimensional hyper-ellipsoid rotations.',
      },
      concrete_physical: {
        modality: 'concrete_physical',
        title: 'Navigating a Boat in Fog (Compass vs GPS)',
        content:
          'You are piloting a boat in zero-visibility fog:\n- Your dead reckoning (motor speed and rudder) says you traveled 10 miles forward, but ocean currents add drift (process noise Q).\n- Your cheap GPS receiver bleeps with a reading, but GPS satellites jitter by +/- 50 meters (measurement noise R).\n- If your GPS has strong satellite lock (R is tiny), you trust the GPS (K -> 1).\n- If heavy rain attenuates GPS signals (R is huge), you ignore the GPS and trust your motor dead reckoning (K -> 0).',
        keyElements: [
          'Dead reckoning: Predict step based on internal physics',
          'Jittery GPS: Noisy measurement update',
          'Trust dial: Kalman Gain K dynamically tilting toward the cleaner sensor',
        ],
        cognitiveAffordance:
          'Grounded physical intuition for why noise variances dictate dynamic trust.',
        cognitiveLimitation: 'Doesn’t explain the mathematical formula for variance shrinkage.',
      },
      verbal_narrative: {
        modality: 'verbal_narrative',
        title: 'Causal Mechanistic Narrative',
        content:
          'A Kalman filter is a Bayesian conversation between expectation and reality. It maintains an internal physics simulation of the world, advancing it through time while honestly acknowledging that its simulation accumulates doubt. When an external sensor reports, the filter does not slavishly believe the sensor nor stubborn refuse it; instead, it compares the uncertainty of its internal model against the uncertainty of the sensor, computing the exact mathematical compromise that minimizes total error.',
        keyElements: [
          'Conversation between physics simulation and sensory feedback',
          'Dynamic trust weighting',
          'Uncertainty accumulation during prediction; uncertainty reduction during observation',
        ],
        cognitiveAffordance:
          'Conveys the philosophy of scientific epistemology and Bayesian humility.',
        cognitiveLimitation:
          'Does not provide mathematical matrices for engineering implementation.',
      },
    },
    translationChallenges: [
      {
        id: 'kalman_trans_1',
        sourceModality: 'concrete_physical',
        targetModality: 'computational_code',
        deftFunction: 'constraining',
        prompt:
          'When torrential rain degrades the boat’s GPS signal (measurement noise R becomes enormous), what happens to the scalar Kalman gain `k` in the computational code?',
        sourceElement: 'Heavy rain causing measurement noise R -> infinity',
        targetElementOptions: [
          'k = p / (p + r) approaches 0, so self.x remains dominated by self.x (dead reckoning)',
          'k approaches 1, forcing full trust in the noisy GPS',
          'k becomes negative, inverting the direction of the boat',
          'k oscillates randomly between 0 and 1',
        ],
        correctTargetElement:
          'k = p / (p + r) approaches 0, so self.x remains dominated by self.x (dead reckoning)',
        structuralMappingExplanation:
          'As measurement noise r >> p, the denominator dominates, driving k -> 0. The update self.x = self.x + k * (z - self.x) leaves self.x unchanged, ignoring the noisy sensor.',
        goldstoneFadingStep: 'grounded_concrete',
      },
      {
        id: 'kalman_trans_2',
        sourceModality: 'visual_geometric',
        targetModality: 'symbolic_formal',
        deftFunction: 'complementary',
        prompt:
          'Geometrically, the product of two Gaussian curves is strictly narrower than either original curve. Which matrix equation in the formal model guarantees this variance shrinkage?',
        sourceElement: 'Narrower posterior Gaussian curve',
        targetElementOptions: [
          'P_{k|k} = (I - K_k H_k) P_{k|k-1}',
          'P_{k|k-1} = F_k P_{k-1|k-1} F_k^T + Q_k',
          'K_k = P H^T (H P H^T + R)^{-1}',
          'x_{k|k} = x + K (z - H x)',
        ],
        correctTargetElement: 'P_{k|k} = (I - K_k H_k) P_{k|k-1}',
        structuralMappingExplanation:
          'Because K_k H_k is positive semi-definite with eigenvalues in [0, 1], multiplying by (I - K_k H_k) strictly contracts the covariance matrix P, shrinking posterior uncertainty.',
        goldstoneFadingStep: 'intermediate_visual',
      },
      {
        id: 'kalman_trans_3',
        sourceModality: 'symbolic_formal',
        targetModality: 'verbal_narrative',
        deftFunction: 'constructing',
        prompt:
          'In the update step, the expression (z_k - H_k \\hat{x}_{k|k-1}) is termed the "innovation". What does this represent in the causal narrative?',
        sourceElement: 'Innovation term (z_k - H_k x_{k|k-1})',
        targetElementOptions: [
          'The novel, surprising delta reported by the sensor that was not already predicted by internal physics',
          'The total sensor error that must be discarded',
          'The accumulated velocity of the vessel',
          'The mathematical determinant of the state matrix',
        ],
        correctTargetElement:
          'The novel, surprising delta reported by the sensor that was not already predicted by internal physics',
        structuralMappingExplanation:
          'H_k x is the sensor reading expected by the physics model. Subtracting it from actual measurement z_k isolates the purely new information ("innovation") offered by reality.',
        goldstoneFadingStep: 'idealized_formal',
      },
    ],
    deepSynthesisSynthesis:
      'The Kalman Filter exemplifies Lesh representational translation: whether formulated as a Bayesian product of Gaussians (visual), an optimal matrix contracting covariance (symbolic), a dynamic trust fraction k in [0, 1] (code), or piloting a boat in fog (concrete), the core invariant is the balancing of model physics with sensory evidence.',
  },
  {
    id: 'fourier_transform_duality',
    domain: 'signal_processing',
    title: 'Fourier Transform & Frequency Domain Duality',
    coreInvariancePrinciple:
      'Any well-behaved time-domain signal can be uniquely represented as a linear combination of continuous complex rotating sinusoids, establishing an invariant duality between time duration and spectral bandwidth.',
    artifacts: {
      symbolic_formal: {
        modality: 'symbolic_formal',
        title: 'Continuous & Discrete Fourier Transform Equations',
        content:
          'Continuous Forward Transform:\n\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(t) e^{-2\\pi i t \\xi} dt\n\nContinuous Inverse Transform:\nf(t) = \\int_{-\\infty}^{\\infty} \\hat{f}(\\xi) e^{2\\pi i t \\xi} d\\xi\n\nDiscrete Fourier Transform (DFT):\nX_k = \\sum_{n=0}^{N-1} x_n \\cdot e^{-i 2\\pi k n / N} = \\sum_{n=0}^{N-1} x_n \\left[\\cos\\left(\\frac{2\\pi kn}{N}\\right) - i \\sin\\left(\\frac{2\\pi kn}{N}\\right)\\right]',
        keyElements: [
          'e^{-2pi i t xi}: Complex exponential rotating on unit circle at frequency xi',
          'Inner product / Projection onto orthogonal harmonic basis',
          'Euler formula: e^{i theta} = cos(theta) + i sin(theta)',
          'Plancherel theorem: Energy is conserved between domains (||f||^2 = ||\\hat{f}||^2)',
        ],
        cognitiveAffordance:
          'Allows analytical integration and rigorous proof of spectral theorems.',
        cognitiveLimitation:
          'Complex numbers and imaginary unit i can obscure intuitive physical motion.',
      },
      computational_code: {
        modality: 'computational_code',
        title: 'Naive Discrete Fourier Transform Matrix Multiplication',
        content: `import numpy as np

def dft_matrix(N: int) -> np.ndarray:
    """Constructs the N x N DFT Vandermonde basis matrix."""
    n = np.arange(N)
    k = n.reshape((N, 1))
    # Outer product creates grid of harmonic angles
    W = np.exp(-2j * np.pi * k * n / N)
    return W

def compute_dft(signal: np.ndarray) -> np.ndarray:
    """Projects time-domain signal vector onto frequency basis."""
    N = len(signal)
    W = dft_matrix(N)
    return W @ signal`,
        keyElements: [
          'Vandermonde matrix W: Each row is an orthogonal rotating basis wave',
          'Matrix-vector product W @ signal: Computes dot product across all frequencies simultaneously',
          'Output vector contains complex amplitudes (magnitude = volume, angle = phase)',
        ],
        cognitiveAffordance:
          'Transforms continuous calculus into transparent linear algebra matrix operations.',
        cognitiveLimitation:
          'O(N^2) complexity obscures the recursive divide-and-conquer FFT optimization.',
      },
      visual_geometric: {
        modality: 'visual_geometric',
        title: 'Geometric Winding Around the Complex Unit Circle (3Blue1Brown Model)',
        content:
          '1. Take the time-domain signal f(t) and wrap it around the 2D complex plane at a variable winding frequency f_wind.\n2. When f_wind does not match any frequency present in the signal, the winding is scattered symmetrically around the origin; its center of mass rests at (0, 0).\n3. When f_wind EXACTLY equals a constituent frequency of the signal, all peaks line up on one side of the circle, pulling the center of mass away from the origin.\n4. The Fourier transform plot is simply tracking the center-of-mass coordinate as f_wind varies from 0 to infinity.',
        keyElements: [
          'Winding frequency f_wind',
          'Symmetric cancellation when frequency is absent',
          'Center of mass displacement spike when frequency resonates',
        ],
        cognitiveAffordance:
          'Provides vivid spatial intuition for why the integral evaluates to zero everywhere except at resonance.',
        cognitiveLimitation:
          'Difficult to visualize for signals with dozens of concurrent frequencies.',
      },
      concrete_physical: {
        modality: 'concrete_physical',
        title: 'Untangling a Smoothie into Original Fruits / Music Equalizer',
        content:
          'Imagine passing a fruit smoothie through an impossible filter that separates it back into 2 bananas, 5 strawberries, and a cup of milk:\n- A musical chord (C-major) played on a piano produces a single complex vibrating sound wave in the air.\n- The human ear contains the cochlea, a coiled fluid organ lined with thousands of microscopic hair cells tuned to specific frequencies.\n- The cochlea physically performs an analog Fourier transform in real time: low notes vibrate the apex; high notes vibrate the base.',
        keyElements: [
          'Time domain: Single combined pressure wave reaching ear',
          'Cochlea: Mechanical physical spectrum analyzer',
          'Frequency domain: Piano sheet music notes (C, E, G)',
        ],
        cognitiveAffordance:
          'Connects abstract mathematics to human biological hearing and musical harmony.',
        cognitiveLimitation: 'Conceals phase angle information (human ear is largely phase-deaf).',
      },
      verbal_narrative: {
        modality: 'verbal_narrative',
        title: 'Causal Mechanistic Narrative',
        content:
          'The Fourier transform is a change of perspective. In the time domain, we ask: "What is happening at this exact microsecond?" In the frequency domain, we ask: "What enduring rhythms compose this entire piece?" Neither view is superior; they are dual reflections of the same underlying reality. Just as a musical score tells a musician what notes to play rather than plotting microphone voltage over time, the Fourier transform reveals the timeless recipes of dynamic processes.',
        keyElements: [
          'Change of perspective from momentary change to enduring cycle',
          'Information conservation across domains',
          'Uncertainty duality: shortening time duration broadens frequency spectrum',
        ],
        cognitiveAffordance: 'Fosters conceptual philosophical appreciation of duality.',
        cognitiveLimitation: 'Lacks computational mechanics to calculate filtering responses.',
      },
    },
    translationChallenges: [
      {
        id: 'fourier_trans_1',
        sourceModality: 'visual_geometric',
        targetModality: 'symbolic_formal',
        deftFunction: 'constraining',
        prompt:
          'In the 3Blue1Brown winding circle model, what mathematical term corresponds to calculating the center of mass of the wound graph?',
        sourceElement: 'Center-of-mass integral of the wound signal',
        targetElementOptions: [
          'The integral \\int f(t) e^{-2pi i t xi} dt',
          'The phase angle arctan(Im / Re)',
          'The derivative df/dt',
          'The Nyquist rate 2 * f_max',
        ],
        correctTargetElement: 'The integral \\int f(t) e^{-2pi i t xi} dt',
        structuralMappingExplanation:
          'Multiplying f(t) by e^{-2pi i t xi} wraps the signal around the circle; integrating over time computes the continuous center-of-mass vector in the complex plane.',
        goldstoneFadingStep: 'intermediate_visual',
      },
      {
        id: 'fourier_trans_2',
        sourceModality: 'concrete_physical',
        targetModality: 'computational_code',
        deftFunction: 'complementary',
        prompt:
          'In the musical piano chord analogy, each piano key resonates at a specific note. In the computational DFT matrix `W`, what corresponds to an individual piano key test?',
        sourceElement: 'An individual piano key resonator',
        targetElementOptions: [
          'A single row vector in matrix W: W[k, :] = exp(-2j * pi * k * n / N)',
          'The length of the signal array N',
          'The matrix dot product operator @',
          'The imaginary constant 1j',
        ],
        correctTargetElement:
          'A single row vector in matrix W: W[k, :] = exp(-2j * pi * k * n / N)',
        structuralMappingExplanation:
          'Row k of the DFT matrix is a discretized complex sinusoid vibrating at harmonic frequency k. Taking its dot product with the signal measures the amplitude of that specific note.',
        goldstoneFadingStep: 'grounded_concrete',
      },
      {
        id: 'fourier_trans_3',
        sourceModality: 'verbal_narrative',
        targetModality: 'symbolic_formal',
        deftFunction: 'constructing',
        prompt:
          'The narrative states that shrinking a signal in time broadens its frequency representation (Heisenberg-Gabor uncertainty). What formal property encapsulates this?',
        sourceElement: 'Time-frequency scaling duality',
        targetElementOptions: [
          'Scaling property: f(a*t) <---> (1/|a|) * \\hat{f}(\\xi / a)',
          'Linearity: a*f(t) + b*g(t) <---> a*F(\\xi) + b*G(\\xi)',
          'Time shift: f(t - t0) <---> F(\\xi) * e^{-2pi i \\xi t0}',
          'Convolution theorem: f * g <---> F(\\xi) * G(\\xi)',
        ],
        correctTargetElement: 'Scaling property: f(a*t) <---> (1/|a|) * \\hat{f}(\\xi / a)',
        structuralMappingExplanation:
          'Compressing a signal by factor a (f(a*t)) stretches its Fourier transform by 1/a, demonstrating that infinite precision in time requires infinite bandwidth in frequency.',
        goldstoneFadingStep: 'idealized_formal',
      },
    ],
    deepSynthesisSynthesis:
      'Fourier duality demonstrates that representations are not passive pictures but active tools: winding circles provide visual mechanics, matrix multiplication provides computational execution, musical instruments provide concrete intuition, and exponential integrals provide formal proof.',
  },
  {
    id: 'backpropagation_autodiff',
    domain: 'deep_learning',
    title: 'Backpropagation & Reverse-Mode Automatic Differentiation',
    coreInvariancePrinciple:
      'Reverse-mode automatic differentiation computes the sensitivity of a scalar loss with respect to all intermediate parameters in a single backward pass by topologically accumulating vector-Jacobian products.',
    artifacts: {
      symbolic_formal: {
        modality: 'symbolic_formal',
        title: 'Multivariable Calculus Chain Rule & Vector-Jacobian Product (VJP)',
        content:
          'For a computation graph with intermediate nodes v_i = f_i(Parents(v_i)):\n\nForward Primal Value:\nv_i = f_i(v_1, v_2, \\dots, v_{i-1})\n\nBackward Adjoint Sensitivity (Chain Rule):\n\\bar{v}_i = \\frac{\\partial L}{\\partial v_i} = \\sum_{j \\in \\text{Children}(v_i)} \\bar{v}_j \\frac{\\partial v_j}{\\partial v_i}\n\nVector-Jacobian Product Formulation:\n\\bar{x} = J_f^T \\bar{y}',
        keyElements: [
          'v_i: Primal node values computed during forward pass',
          '\\bar{v}_i = dL/dv_i: Adjoint values computed during backward pass',
          'Reverse topological ordering: Sums over all children that consume node v_i',
          'Vector-Jacobian Product (VJP): Avoids computing dense full Jacobian matrices',
        ],
        cognitiveAffordance:
          'Proves mathematical correctness of exact gradient computation without truncation.',
        cognitiveLimitation:
          'Summation indices over children make dynamic branching difficult to follow.',
      },
      computational_code: {
        modality: 'computational_code',
        title: 'Minimal Python Autodiff Engine (Micrograd Style)',
        content: `class Value:
    def __init__(self, data: float, _children=()):
        self.data = data
        self.grad = 0.0
        self._backward = lambda: None
        self._prev = set(_children)

    def __add__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data + other.data, (self, other))
        def _backward():
            self.grad += 1.0 * out.grad
            other.grad += 1.0 * out.grad
        out._backward = _backward
        return out

    def __mul__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data * other.data, (self, other))
        def _backward():
            self.grad += other.data * out.grad
            other.grad += self.data * out.grad
        out._backward = _backward
        return out`,
        keyElements: [
          'self.grad += ...: Gradient accumulation handles multi-path fanout',
          'Closure _backward: Remembers input data values from the forward pass',
          'Local chain rule: self.data * out.grad implements product rule derivative',
        ],
        cognitiveAffordance:
          'Directly displays how closures bind local gradients to graph dependencies.',
        cognitiveLimitation:
          'Object-oriented recursion obscures tensorized GPU execution efficiency.',
      },
      visual_geometric: {
        modality: 'visual_geometric',
        title: 'Directed Acyclic Computation Graph (DAG)',
        content:
          '1. Forward Pass (Left-to-Right):\n   - Input features x1, x2 flow rightward through addition and multiplication nodes.\n   - Each node stores its evaluated output scalar.\n2. Backward Pass (Right-to-Left):\n   - Loss scalar L seeds the gradient \\bar{L} = 1.0.\n   - Gradients flow backward along the edges, multiplied by local partial derivatives.\n   - At bifurcations (nodes that feed multiple children), incoming gradients are summed.',
        keyElements: [
          'Bipartite graph: Nodes are variables; edges are operations',
          'Forward arrow: Value propagation',
          'Reverse arrow: Gradient backpropagation',
          'Fan-out node: Gradient summation junction',
        ],
        cognitiveAffordance:
          'Visualizes why dynamic programming reduces complexity from exponential to O(Operations).',
        cognitiveLimitation:
          'Graph drawings become unwieldy for networks with millions of parameters.',
      },
      concrete_physical: {
        modality: 'concrete_physical',
        title: 'Hydraulic Water Pipe Network / Leaking Valve Audit',
        content:
          'Imagine a complex branching water system where turning multiple upstream valves controls the final water pressure at a single spigot (the Loss):\n- Instead of turning each valve one by one to see how much the spigot changes (Forward-mode / finite differences = hours of testing),\n- You inject a single drop of dye at the spigot and pump water in reverse.\n- The dye splits at every junction proportional to how wide each pipe is open, staining all upstream valves in a single pass according to their exact contribution to the spigot pressure.',
        keyElements: [
          'Reverse dye flow: Backpropagation of loss gradient',
          'Pipe width: Local partial derivative sensitivity',
          'Single pass: Reverse-mode efficiency independent of parameter count',
        ],
        cognitiveAffordance:
          'Dramatically clarifies why reverse mode scales to billions of parameters while forward mode stalls.',
        cognitiveLimitation:
          'Water flow analogy does not directly capture negative or zero gradients.',
      },
      verbal_narrative: {
        modality: 'verbal_narrative',
        title: 'Causal Mechanistic Narrative',
        content:
          'Backpropagation is the art of assigning blame backwards through time. When a neural network makes a prediction, every intermediate calculation contributed to the final error. Rather than asking each parameter individually how it might have altered the outcome, reverse-mode autodiff starts at the final mistake and walks backward down the topological trace of the computation, handing each operation its exact mathematical share of responsibility.',
        keyElements: [
          'Blame assignment in reverse topological sequence',
          'Dynamic reuse of intermediate values stored during forward pass',
          'Total derivative accumulation across divergent computational pathways',
        ],
        cognitiveAffordance: 'Intuitive conceptual framing of credit assignment and optimization.',
        cognitiveLimitation: 'Does not provide matrix formulas for implementing CUDA kernels.',
      },
    },
    translationChallenges: [
      {
        id: 'backprop_trans_1',
        sourceModality: 'computational_code',
        targetModality: 'visual_geometric',
        deftFunction: 'constraining',
        prompt:
          'In the Python code, the gradient is accumulated with `+=` instead of `=`: `self.grad += other.data * out.grad`. What geometric feature of the computation graph demands this addition?',
        sourceElement: 'The `+=` operator in gradient accumulation',
        targetElementOptions: [
          'A node whose output splits into multiple children (fan-out junction)',
          'A node with multiple incoming inputs (fan-in junction)',
          'A leaf node with zero parents',
          'A cycle in the computation graph',
        ],
        correctTargetElement:
          'A node whose output splits into multiple children (fan-out junction)',
        structuralMappingExplanation:
          'By the multivariable chain rule, if variable v affects multiple children, its total influence on Loss is the sum of partial derivatives through all pathways. Geometrically, this is a fan-out node.',
        goldstoneFadingStep: 'intermediate_visual',
      },
      {
        id: 'backprop_trans_2',
        sourceModality: 'concrete_physical',
        targetModality: 'symbolic_formal',
        deftFunction: 'complementary',
        prompt:
          'In the hydraulic dye analogy, injecting dye once at the single spigot stains all upstream valves in a single pass. What symbolic efficiency property does this demonstrate?',
        sourceElement: 'Single backward pass measuring all upstream valve sensitivities',
        targetElementOptions: [
          'Vector-Jacobian Product (VJP) scales with output dimension (1), independent of input parameter count (N)',
          'Jacobian-Vector Product (JVP) scales with input dimension N',
          'Hessian matrix inversion complexity O(N^3)',
          'Finite difference approximation complexity O(2N)',
        ],
        correctTargetElement:
          'Vector-Jacobian Product (VJP) scales with output dimension (1), independent of input parameter count (N)',
        structuralMappingExplanation:
          'Reverse-mode automatic differentiation computes \\bar{x} = J^T \\bar{y}. When output y is a scalar loss (dimension 1), a single VJP pass yields gradients for all N parameters in O(1) passes.',
        goldstoneFadingStep: 'grounded_concrete',
      },
      {
        id: 'backprop_trans_3',
        sourceModality: 'symbolic_formal',
        targetModality: 'computational_code',
        deftFunction: 'constructing',
        prompt:
          'In symbolic multivariable calculus, the derivative of multiplication d(u*v)/du = v. Where is `v` stored in the computational implementation so it is available during the backward pass?',
        sourceElement: 'Symbolic multiplier value `v` in d(u*v)/du = v',
        targetElementOptions: [
          'Captured in the closure scope of `_backward` as `other.data` during the forward execution',
          'Re-computed from scratch during backward traversal',
          'Stored in a global lookup table',
          'Passed as an explicit parameter into `out.backward()`',
        ],
        correctTargetElement:
          'Captured in the closure scope of `_backward` as `other.data` during the forward execution',
        structuralMappingExplanation:
          'Python closures capture lexical bindings from their enclosing scope. The forward pass binds `other.data` inside `_backward`, preserving the primal value needed for the gradient product.',
        goldstoneFadingStep: 'idealized_formal',
      },
    ],
    deepSynthesisSynthesis:
      'Backpropagation demonstrates that algorithmic computation and calculus are duals: graph nodes are variables, code closures are chain-rule memories, reverse dye injections are vector-Jacobian products, and blame assignment is topological gradient propagation.',
  },
]

// -----------------------------------------------------------------------------
// Computational Heuristics & Scoring Functions
// -----------------------------------------------------------------------------

/**
 * Calculates the Representational Coordination Gap (Ainsworth 2006).
 * Measures the learner's difficulty in coordinating mappings between distinct representations.
 */
export function calculateRepresentationalCoordinationGap(params: {
  totalChallenges: number
  correctChallenges: number
  exploredModalitiesCount: number
}): number {
  if (params.totalChallenges === 0) return 1.0

  const accuracy = params.correctChallenges / params.totalChallenges
  const explorationFraction = Math.min(1.0, params.exploredModalitiesCount / 5.0)

  // Gap is high when accuracy is low or representations are unvisited
  const gap = 1.0 - (0.6 * accuracy + 0.4 * explorationFraction)
  return Number(Math.max(0, Math.min(1, gap)).toFixed(3))
}

/**
 * Calculates Cross-Modal Coherence Score.
 * Reflects how consistently the learner can translate across different modality pairings.
 */
export function calculateCrossModalCoherenceScore(params: {
  totalChallenges: number
  correctChallenges: number
  averageTranslationLatencyMs: number
}): number {
  if (params.totalChallenges === 0) return 0

  const accuracy = params.correctChallenges / params.totalChallenges

  // Latency penalty: translations taking > 15s show high cognitive friction
  const latencyFactor = Math.max(
    0,
    Math.min(1.0, 1.0 - (params.averageTranslationLatencyMs - 3000) / 15000),
  )

  const coherence = 0.7 * accuracy + 0.3 * latencyFactor
  return Number(Math.max(0, Math.min(1, coherence)).toFixed(3))
}

/**
 * Calculates the overall Multi-Representational Fluency Index.
 *
 * Fluency_index = w1 * Accuracy + w2 * ModalityDiversity + w3 * Coherence + w4 * (1 - Gap)
 */
export function calculateRepresentationalFluencyIndex(params: {
  totalChallenges: number
  correctChallenges: number
  exploredModalitiesCount: number
  crossModalCoherenceScore: number
  representationalCoordinationGap: number
}): number {
  const accuracy =
    params.totalChallenges > 0 ? params.correctChallenges / params.totalChallenges : 0
  const diversity = Math.min(1.0, params.exploredModalitiesCount / 5.0)
  const coherence = params.crossModalCoherenceScore
  const gapResistance = 1.0 - params.representationalCoordinationGap

  const fluency = 0.35 * accuracy + 0.25 * diversity + 0.25 * coherence + 0.15 * gapResistance

  return Number(Math.max(0, Math.min(1, fluency)).toFixed(3))
}

export type RepresentationalFluencyTier =
  | 'unimodal_novice' // Locked in single modality; high translation friction
  | 'bimodal_translator' // Translates between 2 familiar representations
  | 'multimodal_integrator' // Coordinates 3-4 representations effectively
  | 'polymath_fluent' // Seamless Ainsworth DeFT integration across all 5 modalities

export function evaluateRepresentationalFluencyTier(
  fluencyIndex: number,
): RepresentationalFluencyTier {
  if (fluencyIndex >= 0.85) return 'polymath_fluent'
  if (fluencyIndex >= 0.7) return 'multimodal_integrator'
  if (fluencyIndex >= 0.45) return 'bimodal_translator'
  return 'unimodal_novice'
}

// -----------------------------------------------------------------------------
// FSRS-6 Cross-Modal Translation Flashcard Generator
// -----------------------------------------------------------------------------

/**
 * Generates spaced repetition cards focused on cross-modal translation isomorphisms.
 */
export function generateFSRSTranslationDeck(
  problem: RepresentationalProblem,
): FSRSTranslationCard[] {
  const cards: FSRSTranslationCard[] = []

  problem.translationChallenges.forEach((challenge, idx) => {
    const src = CANONICAL_MODALITY_CATALOG[challenge.sourceModality]
    const tgt = CANONICAL_MODALITY_CATALOG[challenge.targetModality]

    cards.push({
      id: `${problem.id}_translation_card_${idx + 1}`,
      problemTitle: problem.title,
      sourceModality: challenge.sourceModality,
      targetModality: challenge.targetModality,
      deftFunction: challenge.deftFunction,
      prompt: `[${problem.title}] (${src.label} ➔ ${tgt.label})\n${challenge.prompt}`,
      answer: `Correct Mapping: ${challenge.correctTargetElement}\n\nStructural Explanation: ${challenge.structuralMappingExplanation}`,
      isomorphismRule: `Ainsworth DeFT (${challenge.deftFunction}): Connects ${src.leshEquivalent} to ${tgt.leshEquivalent}.`,
      cognitiveAffordanceNote: `${src.label} affords: ${problem.artifacts[challenge.sourceModality].cognitiveAffordance}`,
    })
  })

  return cards
}
