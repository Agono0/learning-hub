/**
 * Calibrated seed curriculum for the structural invariance engine (TD-05).
 *
 * CONTENT, not logic: the fully counter-balanced discrimination corpus — four
 * structural categories and twelve problem templates across three surface story
 * families (pool & pipes, railway & trains, office & machines). Kept out of
 * `structural-invariance-engine.ts` so engine diffs stay about algorithms, not
 * data. The `ProblemCategory` and `ProblemTemplate` types stay in the engine
 * (type-only imports here — type-only cycles are safe); the engine re-exports
 * these constants so every existing import path keeps working.
 *
 * @module @learning-hub/core/interleaving
 */

import type { ProblemCategory, ProblemTemplate } from './structural-invariance-engine'

/**
 * Calibrated four-category problem set built on three surface story families
 * (pool & pipes, railway & trains, office & machines). Every family appears
 * exactly once per category and every category once per family — the fully
 * counter-balanced design of Rohrer et al. (2014): each deep structure wears
 * every disguise, so keying on the story cannot work, and every category pair
 * shares one same-family problem pair (surface distance < 1) while their
 * structural signatures stay maximally distinct (structural distance = 1).
 */
export const CALIBRATED_INVARIANCE_CATEGORIES: ProblemCategory[] = [
  {
    id: 'rate_completion',
    label: 'Combined Work-Rate Completion',
    deepPrinciple:
      'Independent agents working on the same target add their rates: 1/a + 1/b + ... = 1/t (harmonic completion invariant).',
    structuralSignature: {
      schema: 'parallel_rate_summation',
      invariant: 'rates_add_reciprocals',
      equation: 'sum(1/a_i) = 1/t',
      quantity_type: 'rate',
    },
    discriminationHint:
      'If two actors each have their OWN completion time against the SAME target, rates add reciprocally — not the times, not the differences.',
  },
  {
    id: 'partwhole_proportion',
    label: 'Part-Whole Direct Proportion',
    deepPrinciple:
      'A fixed ratio k between a part and the whole: part = k × whole (linear scaling invariant, k constant across instances).',
    structuralSignature: {
      schema: 'linear_proportion',
      invariant: 'constant_ratio',
      equation: 'part = k * whole',
      quantity_type: 'ratio',
    },
    discriminationHint:
      'If the question scales a fixed fraction of a varying total, multiply by the constant ratio — no rates, no overlap subtraction.',
  },
  {
    id: 'geometric_decay',
    label: 'Geometric Decay Summation',
    deepPrinciple:
      'A quantity repeatedly multiplied by ratio r (|r| < 1) totals a/(1 − r) across infinite steps (geometric series invariant).',
    structuralSignature: {
      schema: 'geometric_series',
      invariant: 'multiplicative_decay',
      equation: 'total = a / (1 - r)',
      quantity_type: 'series',
    },
    discriminationHint:
      'If each step MULTIPLIES the remaining amount by the same factor, sum with a/(1−r) — adding step sizes by hand is the trap.',
  },
  {
    id: 'inclusion_exclusion',
    label: 'Inclusion-Exclusion Overlap',
    deepPrinciple:
      'Union counts add memberships then subtract the double-counted overlap: |A ∪ B| = |A| + |B| − |A ∩ B|.',
    structuralSignature: {
      schema: 'overlap_correction',
      invariant: 'subtract_intersection',
      equation: '|AuB| = |A| + |B| - |AnB|',
      quantity_type: 'count',
    },
    discriminationHint:
      'If two groups can both contain the same member, subtract the intersection once — simple addition double-counts it.',
  },
]

export const CALIBRATED_INVARIANCE_PROBLEMS: ProblemTemplate[] = [
  // ── Family: pool & pipes ────────────────────────────────────────────────
  {
    id: 'rate_pipes_pool',
    categoryId: 'rate_completion',
    title: 'Two Pipes, One Pool',
    prompt:
      'Pipe A alone fills the pool in 6 hours; pipe B alone fills it in 3 hours. Both open together — how long until the pool is full?',
    surfaceFeatures: { context: 'pool', entity: 'pipes', quantity: 'time', narrative: 'filling' },
    structuralFeatures: {
      schema: 'parallel_rate_summation',
      invariant: 'rates_add_reciprocals',
      equation: '1/6 + 1/3 = 1/t',
      quantity_type: 'rate',
    },
    surfaceLure:
      'Answering "4.5 hours" (the arithmetic mean) instead of summing rates: 1/6 + 1/3 = 1/2 → t = 2 hours.',
    difficulty: 0.4,
  },
  {
    id: 'prop_pipes_throughput',
    categoryId: 'partwhole_proportion',
    title: 'Filtration Loop Recovery',
    prompt:
      'A pool filtration standard requires the filter to return exactly 70% of the water it receives back to the pool. The pump sends 9,000 liters through the filter — how much returns?',
    surfaceFeatures: {
      context: 'pool',
      entity: 'pipes',
      quantity: 'volume',
      narrative: 'filtering',
    },
    structuralFeatures: {
      schema: 'linear_proportion',
      invariant: 'constant_ratio',
      equation: 'returned = 0.70 * sent',
      quantity_type: 'ratio',
    },
    surfaceLure:
      'Looking for "two agents, one target" rates because pipes are involved; this is a single fixed ratio.',
    difficulty: 0.25,
  },
  {
    id: 'geo_pipes_pressure',
    categoryId: 'geometric_decay',
    title: 'Pressure Loss Per Segment',
    prompt:
      'Each pipe segment leaves only 80% of the pressure that entered it. If 100 kPa enters an indefinitely long line of segments, what total pressure is delivered across all segments?',
    surfaceFeatures: {
      context: 'pool',
      entity: 'pipes',
      quantity: 'pressure',
      narrative: 'losing',
    },
    structuralFeatures: {
      schema: 'geometric_series',
      invariant: 'multiplicative_decay',
      equation: 'total = 100 * 0.8 / (1 - 0.8)',
      quantity_type: 'series',
    },
    surfaceLure:
      'Adding the first few segments and guessing; the invariant total is a/(1−r) = 400 kPa.',
    difficulty: 0.55,
  },
  {
    id: 'incl_pipes_service',
    categoryId: 'inclusion_exclusion',
    title: 'Pipes Under Two Inspections',
    prompt:
      'An audit flagged 26 pipes for corrosion and 31 for seal wear; 9 pipes carry both flags. How many distinct pipes must the crew service?',
    surfaceFeatures: { context: 'pool', entity: 'pipes', quantity: 'count', narrative: 'auditing' },
    structuralFeatures: {
      schema: 'overlap_correction',
      invariant: 'subtract_intersection',
      equation: '26 + 31 - 9',
      quantity_type: 'count',
    },
    surfaceLure:
      'Answering 57 by adding both flags — the 9 double-counted pipes must be subtracted: 48.',
    difficulty: 0.3,
  },
  // ── Family: railway & trains ────────────────────────────────────────────
  {
    id: 'rate_trains_track',
    categoryId: 'rate_completion',
    title: 'Two Trains, One Track',
    prompt:
      'Two maintenance trains clear the same track: the first needs 10 days alone, the second 15 days alone. Clearing together, how many days?',
    surfaceFeatures: {
      context: 'railway',
      entity: 'trains',
      quantity: 'time',
      narrative: 'clearing',
    },
    structuralFeatures: {
      schema: 'parallel_rate_summation',
      invariant: 'rates_add_reciprocals',
      equation: '1/10 + 1/15 = 1/t',
      quantity_type: 'rate',
    },
    surfaceLure: 'Averaging 10 and 15 to get 12.5 days; the harmonic completion time is 6 days.',
    difficulty: 0.45,
  },
  {
    id: 'prop_trains_occupancy',
    categoryId: 'partwhole_proportion',
    title: 'Train Occupancy',
    prompt:
      'On this line, exactly 85% of seats are sold before departure. A train has 480 seats — how many passengers board?',
    surfaceFeatures: {
      context: 'railway',
      entity: 'trains',
      quantity: 'count',
      narrative: 'boarding',
    },
    structuralFeatures: {
      schema: 'linear_proportion',
      invariant: 'constant_ratio',
      equation: 'passengers = 0.85 * seats',
      quantity_type: 'ratio',
    },
    difficulty: 0.2,
  },
  {
    id: 'geo_trains_riders',
    categoryId: 'geometric_decay',
    title: 'Shrinking Ridership',
    prompt:
      'A line serves 8,000 riders and loses 10% of its remaining ridership each year. Summed over all future years, how many rider-years does the line still hold?',
    surfaceFeatures: {
      context: 'railway',
      entity: 'trains',
      quantity: 'population',
      narrative: 'shrinking',
    },
    structuralFeatures: {
      schema: 'geometric_series',
      invariant: 'multiplicative_decay',
      equation: 'total = 8000 / (1 - 0.9)',
      quantity_type: 'series',
    },
    surfaceLure:
      'Multiplying 8000 × 10% = 800 "lost per year" as a constant; the loss itself shrinks geometrically.',
    difficulty: 0.6,
  },
  {
    id: 'incl_trains_routes',
    categoryId: 'inclusion_exclusion',
    title: 'Trains on Two Routes',
    prompt:
      '58 trains serve the northern corridor, 47 the southern, and 19 trains serve both corridors. How many distinct trains does the depot roster?',
    surfaceFeatures: {
      context: 'railway',
      entity: 'trains',
      quantity: 'count',
      narrative: 'serving',
    },
    structuralFeatures: {
      schema: 'overlap_correction',
      invariant: 'subtract_intersection',
      equation: '58 + 47 - 19',
      quantity_type: 'count',
    },
    difficulty: 0.35,
  },
  // ── Family: office & machines ───────────────────────────────────────────
  {
    id: 'rate_printers_batch',
    categoryId: 'rate_completion',
    title: 'Two Machines, One Batch',
    prompt:
      'Machine X prints a batch in 12 minutes; machine Y needs 6 minutes for the same batch. Running together, how long?',
    surfaceFeatures: {
      context: 'office',
      entity: 'machines',
      quantity: 'time',
      narrative: 'printing',
    },
    structuralFeatures: {
      schema: 'parallel_rate_summation',
      invariant: 'rates_add_reciprocals',
      equation: '1/12 + 1/6 = 1/t',
      quantity_type: 'rate',
    },
    surfaceLure: 'Averaging 12 and 6 to get 9 minutes; the harmonic completion time is 4 minutes.',
    difficulty: 0.35,
  },
  {
    id: 'prop_machines_budget',
    categoryId: 'partwhole_proportion',
    title: 'Toner Budget Share',
    prompt:
      'An office allots exactly 24% of its $250 monthly supply budget to toner. How much money goes to toner this month?',
    surfaceFeatures: {
      context: 'office',
      entity: 'machines',
      quantity: 'money',
      narrative: 'budgeting',
    },
    structuralFeatures: {
      schema: 'linear_proportion',
      invariant: 'constant_ratio',
      equation: 'toner = 0.24 * budget',
      quantity_type: 'ratio',
    },
    difficulty: 0.2,
  },
  {
    id: 'geo_machines_value',
    categoryId: 'geometric_decay',
    title: 'Depreciating Machine Value',
    prompt:
      'An office machine is worth $20,000 and loses 50% of its remaining value each year. Summed over all future years of ownership, what total value does it deliver?',
    surfaceFeatures: {
      context: 'office',
      entity: 'machines',
      quantity: 'money',
      narrative: 'depreciating',
    },
    structuralFeatures: {
      schema: 'geometric_series',
      invariant: 'multiplicative_decay',
      equation: 'total = 20000 / (1 - 0.5)',
      quantity_type: 'series',
    },
    surfaceLure:
      'Adding the first few years and guessing "about $38,750"; the invariant total is exactly $40,000.',
    difficulty: 0.5,
  },
  {
    id: 'incl_machines_maintenance',
    categoryId: 'inclusion_exclusion',
    title: 'Machines Under Two Programs',
    prompt:
      '34 machines are enrolled in the preventive-maintenance program, 41 in the cleaning rotation, and 12 machines are in both. How many distinct machines are covered?',
    surfaceFeatures: {
      context: 'office',
      entity: 'machines',
      quantity: 'count',
      narrative: 'maintaining',
    },
    structuralFeatures: {
      schema: 'overlap_correction',
      invariant: 'subtract_intersection',
      equation: '34 + 41 - 12',
      quantity_type: 'count',
    },
    surfaceLure:
      'Answering 75 by adding both programs — the 12 overlapping machines must be subtracted: 63.',
    difficulty: 0.3,
  },
]
