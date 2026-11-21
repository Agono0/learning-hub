/**
 * Scenario corpora for the prototype & exemplar categorization engine (TD-05).
 *
 * CONTENT, not logic: the five canonical category sets (Rosch bird typicality,
 * Posner & Keele prototype distortion, Medin & Schaffer 5-4 structure, Nosofsky
 * attention set, Ashby & Gott rule boundary) plus `CANONICAL_CATEGORIZATION_SETS`
 * and the `defineStimulus` builder the data literals are expressed through.
 * Kept out of `prototype-exemplar-engine.ts` so engine diffs stay about
 * algorithms, not data. Types are imported type-only from the engine (type-only
 * cycles are safe); the engine re-exports all of these so every existing import
 * path keeps working.
 *
 * @module @learning-hub/core/prototype-exemplar
 */
import type { Category, CategorySet, Stimulus } from './prototype-exemplar-engine'

/**
 * Compact stimulus builder for the canonical sets below. `isTransfer`
 * defaults to false (studied item); `normativeTypicality` is only provided
 * where the literature reports it.
 */
export function defineStimulus(
  id: string,
  label: string,
  features: number[],
  category: Category,
  options: { normativeTypicality?: number; isTransfer?: boolean } = {},
): Stimulus {
  return {
    id,
    label,
    features,
    category,
    normativeTypicality: options.normativeTypicality,
    isTransfer: options.isTransfer ?? false,
  }
}

/**
 * Scenario 1 — Rosch's bird typicality structure (natural category).
 * Normative ratings are Rosch's (1975) published 1-7 norms for commonly
 * reproduced members (robin 1.18 … ostrich 5.76); items without published
 * norms are scored against family-resemblance predictions. "Has feathers" is
 * the defining feature (Smith, Shoben & Rafferty 1974) — the bat is the
 * classic characteristic-feature decoy: it flies, but it is not a bird.
 */
export const BIRD_TYPICALITY_SET: CategorySet = {
  id: 'proto-bird-typicality',
  title: 'Rosch Bird Typicality & Family Resemblance',
  domain: 'semantic_memory',
  difficulty: 'introductory',
  structureKind: 'natural_typicality',
  dimensionLabels: [
    'has_feathers',
    'flies',
    'sings',
    'perches_in_trees',
    'small_body',
    'swims',
    'waddles',
    'long_legs',
    'farmyard',
    'large_body',
  ],
  categoryLabels: { A: 'Bird', B: 'Not a bird' },
  pedagogicalFraming:
    'Category membership in natural kinds is graded: robins are verified faster than penguins and rated better examples (Rosch 1975). Rate typicality on the 1-7 scale, then classify old and never-seen items. Watch the bat — it flies, but characteristic features are not defining features.',
  studyItems: [
    defineStimulus('bird-robin', 'Robin', [1, 1, 1, 1, 1, 0, 0, 0, 0, 0], 'A', {
      normativeTypicality: 1.18,
    }),
    defineStimulus('bird-sparrow', 'Sparrow', [1, 1, 1, 1, 1, 0, 0, 0, 1, 0], 'A', {
      normativeTypicality: 1.18,
    }),
    defineStimulus('bird-bluejay', 'Bluejay', [1, 1, 1, 1, 1, 0, 0, 0, 0, 0], 'A', {
      normativeTypicality: 1.42,
    }),
    defineStimulus('bird-hawk', 'Hawk', [1, 1, 0, 1, 0, 0, 0, 0, 0, 0], 'A'),
    defineStimulus('bird-chicken', 'Chicken', [1, 0, 0, 0, 0, 0, 0, 1, 1, 0], 'A', {
      normativeTypicality: 3.95,
    }),
    defineStimulus('bird-duck', 'Duck', [1, 1, 0, 0, 0, 1, 1, 0, 1, 0], 'A', {
      normativeTypicality: 3.6,
    }),
    defineStimulus('bird-penguin', 'Penguin', [1, 0, 0, 0, 0, 1, 1, 0, 0, 0], 'A', {
      normativeTypicality: 4.53,
    }),
    defineStimulus('bird-ostrich', 'Ostrich', [1, 0, 0, 0, 0, 0, 0, 1, 0, 1], 'A', {
      normativeTypicality: 5.76,
    }),
    defineStimulus('bird-bat', 'Bat', [0, 1, 0, 1, 1, 0, 0, 0, 0, 0], 'B'),
  ],
  testItems: [
    defineStimulus('bird-robin-old', 'Robin (old)', [1, 1, 1, 1, 1, 0, 0, 0, 0, 0], 'A', {
      normativeTypicality: 1.18,
    }),
    defineStimulus('bird-chicken-old', 'Chicken (old)', [1, 0, 0, 0, 0, 0, 0, 1, 1, 0], 'A', {
      normativeTypicality: 3.95,
    }),
    defineStimulus('bird-penguin-old', 'Penguin (old)', [1, 0, 0, 0, 0, 1, 1, 0, 0, 0], 'A', {
      normativeTypicality: 4.53,
    }),
    defineStimulus('bird-bat-old', 'Bat (old)', [0, 1, 0, 1, 1, 0, 0, 0, 0, 0], 'B'),
    defineStimulus('bird-eagle', 'Eagle', [1, 1, 0, 1, 0, 0, 0, 0, 0, 0], 'A', {
      normativeTypicality: 1.88,
      isTransfer: true,
    }),
    defineStimulus('bird-dove', 'Dove', [1, 1, 1, 1, 1, 0, 0, 0, 1, 0], 'A', { isTransfer: true }),
    defineStimulus('bird-kiwi', 'Kiwi', [1, 0, 0, 0, 1, 0, 0, 1, 0, 0], 'A', { isTransfer: true }),
    defineStimulus('bird-butterfly', 'Butterfly', [0, 1, 0, 0, 1, 0, 0, 0, 0, 0], 'B', {
      isTransfer: true,
    }),
    defineStimulus('bird-moth', 'Moth', [0, 1, 0, 0, 1, 0, 0, 0, 0, 0], 'B', { isTransfer: true }),
  ],
}

/**
 * Scenario 2 — Posner & Keele (1968, 1970) prototype abstraction. Study
 * items are distortions of two dot-cloud centers; the transfer probes ARE the
 * never-studied prototypes themselves. Accepting an unseen center as a
 * category member is the abstraction signature; the exemplar model can only
 * explain it through summed similarity to the stored distortions.
 */
export const PROTOTYPE_DISTORTION_SET: CategorySet = {
  id: 'proto-distortion-abstraction',
  title: 'Prototype Abstraction from Distorted Patterns',
  domain: 'perceptual_categorization',
  difficulty: 'intermediate',
  structureKind: 'artificial_dimensional',
  dimensionLabels: [
    'dimension 1 (pattern position, normalized)',
    'dimension 2 (pattern position, normalized)',
  ],
  categoryLabels: {
    A: 'Pattern family α (low-low center)',
    B: 'Pattern family β (high-high center)',
  },
  pedagogicalFraming:
    'You will study distorted patterns from two families. Neither family center is ever shown in study. At test, decide whether the never-seen centers belong to their families — the prototype-abstraction effect (Posner & Keele 1968, 1970) predicts above-chance acceptance of the unseen centers.',
  studyItems: [
    defineStimulus('dist-a-low-1', 'Pattern α-1 (low distortion)', [0.36, 0.27], 'A'),
    defineStimulus('dist-a-low-2', 'Pattern α-2 (low distortion)', [0.25, 0.35], 'A'),
    defineStimulus('dist-a-low-3', 'Pattern α-3 (low distortion)', [0.3, 0.22], 'A'),
    defineStimulus('dist-a-high-1', 'Pattern α-4 (high distortion)', [0.15, 0.4], 'A'),
    defineStimulus('dist-a-high-2', 'Pattern α-5 (high distortion)', [0.44, 0.2], 'A'),
    defineStimulus('dist-b-low-1', 'Pattern β-1 (low distortion)', [0.64, 0.73], 'B'),
    defineStimulus('dist-b-low-2', 'Pattern β-2 (low distortion)', [0.75, 0.65], 'B'),
    defineStimulus('dist-b-low-3', 'Pattern β-3 (low distortion)', [0.7, 0.78], 'B'),
    defineStimulus('dist-b-high-1', 'Pattern β-4 (high distortion)', [0.82, 0.58], 'B'),
    defineStimulus('dist-b-high-2', 'Pattern β-5 (high distortion)', [0.56, 0.8], 'B'),
  ],
  testItems: [
    defineStimulus('dist-old-a-low-1', 'Pattern α-1 (old)', [0.36, 0.27], 'A'),
    defineStimulus('dist-old-a-high-1', 'Pattern α-4 (old)', [0.15, 0.4], 'A'),
    defineStimulus('dist-old-b-low-1', 'Pattern β-1 (old)', [0.64, 0.73], 'B'),
    defineStimulus('dist-old-b-high-1', 'Pattern β-4 (old)', [0.82, 0.58], 'B'),
    defineStimulus('dist-proto-a', 'UNSEEN center of family α', [0.3, 0.3], 'A', {
      isTransfer: true,
    }),
    defineStimulus('dist-proto-b', 'UNSEEN center of family β', [0.7, 0.7], 'B', {
      isTransfer: true,
    }),
    defineStimulus('dist-novel-a', 'Novel pattern (near family α)', [0.4, 0.33], 'A', {
      isTransfer: true,
    }),
    defineStimulus('dist-novel-b', 'Novel pattern (near family β)', [0.6, 0.67], 'B', {
      isTransfer: true,
    }),
  ],
}

/**
 * Scenario 3 — the Medin & Schaffer (1978) 5-4 structure, using the coding
 * reproduced in Smith & Minda (2000, Table 1) and Chen et al. (2024, Table 1):
 * A = {1110, 1010, 1011, 1101, 0111}, B = {1100, 0110, 0001, 0000}; A0 = 1111
 * is the theoretical K1 prototype. Four binary dimensions, no single
 * defining feature, and the category centers are never labeled as such. The
 * transfer set adds the unseen K1 center (1111) plus novel combinations;
 * exemplar storage predicts specific errors on high-similarity exceptions
 * that a pure prototype summary cannot.
 */
export const FIVE_FOUR_STRUCTURE_SET: CategorySet = {
  id: 'proto-54-structure',
  title: 'Medin-Schaffer 5-4 Exception Structure',
  domain: 'concept_learning',
  difficulty: 'advanced',
  structureKind: 'binary_structure',
  dimensionLabels: [
    'feature 1 (e.g., shape)',
    'feature 2 (e.g., size)',
    'feature 3 (e.g., color)',
    'feature 4 (e.g., texture)',
  ],
  categoryLabels: { A: 'Category K1', B: 'Category K2' },
  pedagogicalFraming:
    'Nine studied items on four binary dimensions — the 5-4 structure of Medin & Schaffer (1978). No single feature defines either category, and the prototypes are never labeled as such. The transfer set adds the unseen category center (1111) plus novel combinations; exemplar storage predicts specific errors on high-similarity exceptions that a pure prototype summary cannot.',
  studyItems: [
    defineStimulus('54-a1', 'Item A1 (1110)', [1, 1, 1, 0], 'A'),
    defineStimulus('54-a2', 'Item A2 (1010)', [1, 0, 1, 0], 'A'),
    defineStimulus('54-a3', 'Item A3 (1011)', [1, 0, 1, 1], 'A'),
    defineStimulus('54-a4', 'Item A4 (1101)', [1, 1, 0, 1], 'A'),
    defineStimulus('54-a5', 'Item A5 (0111)', [0, 1, 1, 1], 'A'),
    defineStimulus('54-b1', 'Item B1 (1100)', [1, 1, 0, 0], 'B'),
    defineStimulus('54-b2', 'Item B2 (0110)', [0, 1, 1, 0], 'B'),
    defineStimulus('54-b3', 'Item B3 (0001)', [0, 0, 0, 1], 'B'),
    defineStimulus('54-b4', 'Item B4 (0000)', [0, 0, 0, 0], 'B'),
  ],
  testItems: [
    defineStimulus('54-t-a1', 'Item A1 (old)', [1, 1, 1, 0], 'A'),
    defineStimulus('54-t-a3', 'Item A3 (old)', [1, 0, 1, 1], 'A'),
    defineStimulus('54-t-a5', 'Item A5 (old)', [0, 1, 1, 1], 'A'),
    defineStimulus('54-t-b1', 'Item B1 (old)', [1, 1, 0, 0], 'B'),
    defineStimulus('54-t-b2', 'Item B2 (old)', [0, 1, 1, 0], 'B'),
    defineStimulus('54-t-b3', 'Item B3 (old)', [0, 0, 0, 1], 'B'),
    defineStimulus('54-t-proto-a', 'UNSEEN center K1 (1111)', [1, 1, 1, 1], 'A', {
      isTransfer: true,
    }),
    defineStimulus('54-t-novel-1', 'Novel item (1001)', [1, 0, 0, 1], 'A', { isTransfer: true }),
    defineStimulus('54-t-novel-2', 'Novel item (0011)', [0, 0, 1, 1], 'A', { isTransfer: true }),
    defineStimulus('54-t-novel-3', 'Novel item (0101)', [0, 1, 0, 1], 'A', { isTransfer: true }),
  ],
}

/**
 * Scenario 4 — Nosofsky (1986) attention probe: two separable dimensions
 * (size × brightness) with category-correlated values plus CONFLICT probes
 * where the two dimensions disagree. The fitted attention weights reveal what
 * the learner actually attended to: w_size → 1 classifies small-but-bright
 * probes as A; w_brightness → 1 classifies them as B (city-block metric,
 * selective attention over separable dimensions).
 */
export const NOSOFSKY_ATTENTION_SET: CategorySet = {
  id: 'proto-attention-probe',
  title: 'Selective Attention & Dimension Weighting',
  domain: 'perceptual_categorization',
  difficulty: 'intermediate',
  structureKind: 'artificial_dimensional',
  dimensionLabels: ['size (0 = small, 1 = large)', 'brightness (0 = dark, 1 = bright)'],
  categoryLabels: { A: 'Family: small & dark', B: 'Family: large & bright' },
  pedagogicalFraming:
    'Two separable dimensions, size and brightness, correlated across categories (Nosofsky 1986). The test set includes conflict probes — small-but-bright and large-but-dark — whose classification depends entirely on WHICH dimension you attend. Your fitted attention weights will be reported.',
  studyItems: [
    defineStimulus('att-a1', 'Stimulus A1 (small, dark)', [0.2, 0.2], 'A'),
    defineStimulus('att-a2', 'Stimulus A2 (small, dark)', [0.3, 0.35], 'A'),
    defineStimulus('att-a3', 'Stimulus A3 (small, dark)', [0.4, 0.25], 'A'),
    defineStimulus('att-a4', 'Stimulus A4 (small, dark)', [0.25, 0.4], 'A'),
    defineStimulus('att-b1', 'Stimulus B1 (large, bright)', [0.7, 0.8], 'B'),
    defineStimulus('att-b2', 'Stimulus B2 (large, bright)', [0.8, 0.7], 'B'),
    defineStimulus('att-b3', 'Stimulus B3 (large, bright)', [0.6, 0.75], 'B'),
    defineStimulus('att-b4', 'Stimulus B4 (large, bright)', [0.75, 0.6], 'B'),
  ],
  testItems: [
    defineStimulus('att-t-a1', 'Stimulus A1 (old)', [0.2, 0.2], 'A'),
    defineStimulus('att-t-a3', 'Stimulus A3 (old)', [0.4, 0.25], 'A'),
    defineStimulus('att-t-b1', 'Stimulus B1 (old)', [0.7, 0.8], 'B'),
    defineStimulus('att-t-b4', 'Stimulus B4 (old)', [0.75, 0.6], 'B'),
    defineStimulus('att-t-new-a', 'Novel (small, dark)', [0.3, 0.3], 'A', { isTransfer: true }),
    defineStimulus('att-t-new-b', 'Novel (large, bright)', [0.7, 0.7], 'B', { isTransfer: true }),
    defineStimulus('att-t-conflict-sb', 'CONFLICT probe (small but bright)', [0.3, 0.7], 'A', {
      isTransfer: true,
    }),
    defineStimulus('att-t-conflict-lb', 'CONFLICT probe (large but dark)', [0.7, 0.3], 'B', {
      isTransfer: true,
    }),
  ],
}

/**
 * Scenario 5 — Ashby & Gott (1988) rule-boundary contrast: a single
 * unidimensional threshold rule perfectly separates the categories, but the
 * exemplar cloud is sparse near the extremes. Rule-based strategies stay
 * confident far from all stored instances; exemplar strategies degrade — the
 * extreme probes are where the representations diverge.
 */
export const RULE_BOUNDARY_SET: CategorySet = {
  id: 'proto-rule-boundary',
  title: 'Rule vs Similarity: Boundary Strategy Contrast',
  domain: 'decision_bound_categorization',
  difficulty: 'advanced',
  structureKind: 'rule_boundary',
  dimensionLabels: ['dimension 1 (criterion)', 'dimension 2 (noise)'],
  categoryLabels: { A: 'Family R1 (high on criterion)', B: 'Family R2 (low on criterion)' },
  pedagogicalFraming:
    'One dimension carries a perfect threshold rule ("criterion ≥ 0.5 → R1"); the other is noise. Extreme probes sit far from every studied item: a rule user classifies them perfectly, while a similarity user wobbles — exemplar evidence is unreliable where no instances were stored (Ashby & Gott 1988).',
  decisionRule: {
    dimensionIndex: 0,
    threshold: 0.5,
    direction: 'above',
    categoryIfTrue: 'A',
    description: 'If dimension 1 ≥ 0.5 → R1, else R2',
  },
  studyItems: [
    defineStimulus('rule-a1', 'Stimulus R1-1', [0.6, 0.1], 'A'),
    defineStimulus('rule-a2', 'Stimulus R1-2', [0.7, 0.9], 'A'),
    defineStimulus('rule-a3', 'Stimulus R1-3', [0.8, 0.5], 'A'),
    defineStimulus('rule-a4', 'Stimulus R1-4', [0.95, 0.2], 'A'),
    defineStimulus('rule-a5', 'Stimulus R1-5', [0.65, 0.65], 'A'),
    defineStimulus('rule-b1', 'Stimulus R2-1', [0.4, 0.2], 'B'),
    defineStimulus('rule-b2', 'Stimulus R2-2', [0.3, 0.8], 'B'),
    defineStimulus('rule-b3', 'Stimulus R2-3', [0.2, 0.5], 'B'),
    defineStimulus('rule-b4', 'Stimulus R2-4', [0.05, 0.7], 'B'),
    defineStimulus('rule-b5', 'Stimulus R2-5', [0.35, 0.35], 'B'),
  ],
  testItems: [
    defineStimulus('rule-t-a1', 'Stimulus R1-1 (old)', [0.6, 0.1], 'A'),
    defineStimulus('rule-t-b2', 'Stimulus R2-2 (old)', [0.3, 0.8], 'B'),
    defineStimulus('rule-t-b4', 'Stimulus R2-4 (old)', [0.05, 0.7], 'B'),
    defineStimulus('rule-t-near-a', 'Near-boundary novel (0.55)', [0.55, 0.5], 'A', {
      isTransfer: true,
    }),
    defineStimulus('rule-t-near-b', 'Near-boundary novel (0.45)', [0.45, 0.5], 'B', {
      isTransfer: true,
    }),
    defineStimulus('rule-t-extreme-a', 'EXTREME novel (deep in R1)', [0.99, 0.99], 'A', {
      isTransfer: true,
    }),
    defineStimulus('rule-t-extreme-b', 'EXTREME novel (deep in R2)', [0.01, 0.01], 'B', {
      isTransfer: true,
    }),
  ],
}

/** All canonical category sets served by GET and consumed by the studio. */
export const CANONICAL_CATEGORIZATION_SETS: CategorySet[] = [
  BIRD_TYPICALITY_SET,
  PROTOTYPE_DISTORTION_SET,
  FIVE_FOUR_STRUCTURE_SET,
  NOSOFSKY_ATTENTION_SET,
  RULE_BOUNDARY_SET,
]
