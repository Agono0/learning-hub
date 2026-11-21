/**
 * Metacognition (Hypercorrection Engine) — Scenario Content (TD-05)
 *
 * This file holds ONLY the calibrated Epistemic Crucible problem bank: seeded
 * illusion-diagnostic items (thermal equilibrium, Linda conjunction fallacy,
 * Monty Hall dilemma, volatile memory visibility) used by
 * `hypercorrection-engine.ts`.
 *
 * Why it lives here: scenario data is CONTENT, not logic. Splitting it out of
 * `hypercorrection-engine.ts` keeps the Goodman-Kruskal gamma, Murphy/Brier
 * decomposition and session logic reviewable without hundreds of lines of data
 * noise in every diff (TD-05 from docs/tech-debt.md). Values were moved
 * verbatim (same names, same values); the engine re-exports
 * `EPISTEMIC_CRUCIBLE_PROBLEMS` so every existing import path (including the
 * `@learning-hub/core/metacognition` barrel, which re-exports both engines in
 * this folder) keeps working. The sibling `correction-crucible.ts` engine
 * does not use this file.
 *
 * Data only: no function bodies, no zod schemas, type-only imports.
 */

import type { EpistemicCrucibleItem } from './hypercorrection-engine'

export const EPISTEMIC_CRUCIBLE_PROBLEMS: Record<string, EpistemicCrucibleItem> = {
  crucible_thermal_equilibrium: {
    id: 'crucible_thermal_equilibrium',
    domain: 'physics_thermodynamics',
    title: 'Thermal Sensation & Equilibrium Invariant',
    stem: 'A metal spoon and a wooden spoon have been sitting undisturbed on the same kitchen table in an air-conditioned 20°C (68°F) room for 24 hours. When you touch both spoons with bare hands, why does the metal spoon feel colder?',
    options: [
      {
        id: 'opt_metal_temp',
        text: 'The metal spoon is at a lower temperature because metal naturally absorbs and retains cold.',
        isCorrect: false,
        illusionType: 'intuitive_physics_bias',
        misconceptionRationale:
          'Violates the Zeroth Law of Thermodynamics. Objects in thermal equilibrium with the environment share identical temperature.',
      },
      {
        id: 'opt_thermal_cond',
        text: 'Both spoons are at the exact same 20°C temperature; metal has much higher thermal conductivity (k ≈ 50-400 W/m·K vs wood k ≈ 0.15 W/m·K), conducting heat away from your 37°C finger much faster.',
        isCorrect: true,
        misconceptionRationale: '',
      },
      {
        id: 'opt_wood_heat',
        text: 'The wooden spoon generates internal biological heat from microscopic cellular friction, keeping it warmer.',
        isCorrect: false,
        illusionType: 'intuitive_physics_bias',
        misconceptionRationale:
          'Dead wood has zero metabolic activity; it cannot produce endogenous heat.',
      },
      {
        id: 'opt_specific_heat',
        text: 'The metal spoon has a higher specific heat capacity than wood, causing it to drop temperature faster.',
        isCorrect: false,
        illusionType: 'lexical_familiarity',
        misconceptionRationale:
          'Wood actually has a higher specific heat capacity (~1700 J/kg·K) than steel (~500 J/kg·K); sensory sensation is driven by thermal conductivity.',
      },
    ],
    canonicalScientificExplanation:
      'Human cutaneous thermoreceptors measure heat flux (rate of thermal energy transfer per unit area dq/dt = -k ∇T), NOT absolute temperature. Since both spoons are in thermal equilibrium with the 20°C room, both are at 20°C. Metal conducts heat away from 37°C skin orders of magnitude faster than wood.',
    epistemicPredictionErrorExplanation:
      'The intuitive sensory perception "metal is colder" is a sensory illusion. The sensory system measures rate of heat loss from your skin, conflating high thermal conductivity with low ambient temperature.',
    counterEvidence:
      'If you place a thermocouple or digital infrared thermometer on both spoons, both register 20.0°C ± 0.1°C.',
    subGoalChunking: [
      'Apply Zeroth Law: 24h immersion guarantees identical temperature T_spoon = T_room = 20°C.',
      'Identify cutaneous sensory transducer: human skin detects heat flux q = -k(dT/dx), not T.',
      'Compare transport properties: k_metal >> k_wood.',
      'Synthesize: higher heat loss rate elicits stronger cold receptor firing.',
    ],
  },

  crucible_conjunction_fallacy: {
    id: 'crucible_conjunction_fallacy',
    domain: 'cognitive_heuristics',
    title: 'The Linda Problem & Conjunction Fallacy',
    stem: 'Linda is 31 years old, single, outspoken, and very bright. She majored in philosophy. As a student, she was deeply concerned with issues of discrimination and social justice, and participated in anti-nuclear demonstrations. Which statement is mathematically more probable?',
    options: [
      {
        id: 'opt_linda_both',
        text: 'Linda is a bank teller and is active in the feminist movement.',
        isCorrect: false,
        illusionType: 'conjunction_fallacy',
        misconceptionRationale:
          'Violates the fundamental probability axiom P(A ∩ B) ≤ P(A). A joint conjunction cannot exceed the probability of its constituent set.',
      },
      {
        id: 'opt_linda_teller',
        text: 'Linda is a bank teller.',
        isCorrect: true,
        misconceptionRationale: '',
      },
      {
        id: 'opt_linda_equal',
        text: 'Both statements are equally probable because the feminist description is already known to be true.',
        isCorrect: false,
        illusionType: 'conjunction_fallacy',
        misconceptionRationale:
          'The premise described Linda’s college background, not her current adult occupation or political activism.',
      },
    ],
    canonicalScientificExplanation:
      'The set of all bank tellers completely subsumes the subset of bank tellers who are also active in the feminist movement. Under Kolmogorov probability axioms, P(A ∩ B) ≤ P(A). Adding extra conditions strictly cannot increase probability.',
    epistemicPredictionErrorExplanation:
      'The representativeness heuristic (Tversky & Kahneman 1983) leads intuitive thinking to substitute subjective narrative plausibility/stereotypicality for set-theoretic mathematical probability.',
    counterEvidence:
      'If there are 1,000,000 bank tellers in the world and only 10,000 of them are active in the feminist movement, picking a random person satisfying "teller" is 100x more likely than "teller AND feminist".',
    subGoalChunking: [
      'Define set A: Bank Tellers.',
      'Define set B: Active in the feminist movement.',
      'Define conjunction: A ∩ B.',
      'Apply Venn inclusion: (A ∩ B) ⊆ A, therefore |A ∩ B| ≤ |A| and P(A ∩ B) ≤ P(A).',
    ],
  },

  crucible_monty_hall: {
    id: 'crucible_monty_hall',
    domain: 'probability_fallacies',
    title: 'The Monty Hall 3-Door Dilemma & Prior Information',
    stem: 'You are on a game show given the choice of 3 closed doors: Behind one door is a luxury car; behind the others, goats. You pick Door #1. The host (who knows what is behind all doors) opens Door #3, revealing a goat. He then asks: "Do you want to switch to Door #2?" What is the optimal mathematical strategy?',
    options: [
      {
        id: 'opt_monty_equal',
        text: 'It makes no difference; with 2 doors remaining, the car is behind either door with 50/50 probability.',
        isCorrect: false,
        illusionType: 'gambler_fallacy',
        misconceptionRationale:
          'Fallacy of uniform distribution. The host’s action is constrained by knowledge and is not an independent random coin flip.',
      },
      {
        id: 'opt_monty_switch',
        text: 'Always switch to Door #2; switching yields a 2/3 (66.7%) probability of winning the car, while staying gives only 1/3 (33.3%).',
        isCorrect: true,
        misconceptionRationale: '',
      },
      {
        id: 'opt_monty_stay',
        text: 'Always stay with Door #1; initial intuition has an established psychological advantage in Bayes theorem.',
        isCorrect: false,
        illusionType: 'fluency_illusion',
        misconceptionRationale:
          'Psychological attachment or endowment effect does not alter probability. Staying keeps you at P = 1/3.',
      },
    ],
    canonicalScientificExplanation:
      'When you initially chose Door #1, P(Car = Door 1) = 1/3, and P(Car in Door 2 or 3) = 2/3. The host is strictly constrained: he must always reveal a goat and cannot open Door #1. His informed reveal transfers the entire 2/3 collective probability mass onto the remaining unchosen Door #2.',
    epistemicPredictionErrorExplanation:
      'Intuition evaluates the 2 closed doors as a fresh, symmetrical 50/50 scenario, completely discarding the prior information constraint governing the host’s selective action.',
    counterEvidence:
      'Consider 100 doors: you pick Door #1 (1/100). Host opens 98 doors with goats, leaving Door #77. The probability car is behind Door #77 is 99/100!',
    subGoalChunking: [
      'Initial prior: P(Door 1) = 1/3, P(Doors 2 or 3) = 2/3.',
      'Host constraint analysis: Host cannot pick your door and cannot reveal the car.',
      'Probability transfer: P(Door 3 | Host reveals goat) = 0.',
      'Bayes update: All 2/3 probability mass of {Door 2, Door 3} collapses onto Door 2.',
    ],
  },

  crucible_concurrency_visibility: {
    id: 'crucible_concurrency_visibility',
    domain: 'systems_concurrency',
    title: 'Memory Visibility & Volatile Counter Increments',
    stem: 'In Java/C++, a shared counter is declared as `volatile int counter = 0;`. Ten concurrent worker threads each execute `counter++` exactly 1,000 times without explicit mutex locks. Is the final value guaranteed to be 10,000?',
    options: [
      {
        id: 'opt_vol_guarantee',
        text: 'Yes, because volatile variables are written directly to main memory and bypass all CPU L1/L2 caches, guaranteeing atomicity.',
        isCorrect: false,
        illusionType: 'memory_concurrency_illusion',
        misconceptionRationale:
          'Volatile guarantees memory visibility (happens-before) and ordering, NOT compound atomicity. counter++ is three separate instructions: Read, Modify, Write.',
      },
      {
        id: 'opt_vol_race',
        text: 'No, because counter++ is a non-atomic read-modify-write composite operation (load, increment, store). Threads will interleave loads, resulting in lost updates and final counter < 10,000.',
        isCorrect: true,
        misconceptionRationale: '',
      },
      {
        id: 'opt_vol_deadlock',
        text: 'No, because volatile variables acquire exclusive bus locks that will trigger a hardware deadlock with ten threads.',
        isCorrect: false,
        illusionType: 'lexical_familiarity',
        misconceptionRationale:
          'Volatile does not acquire bus locks or cause deadlocks; it generates memory barrier instructions (MFENCE/DMB).',
      },
    ],
    canonicalScientificExplanation:
      'Volatile establishes a happens-before relationship ensuring memory visibility across CPU cores (preventing stale register/cache reads). However, `counter++` compiles into three discrete machine operations: 1. LOAD value into register, 2. ADD 1, 3. STORE back to memory. Two threads reading simultaneously will both increment the same baseline value, overwriting each other.',
    epistemicPredictionErrorExplanation:
      'Developers confuse "memory visibility" with "thread safety / atomicity". Seeing a concurrency keyword like `volatile` gives a false sense of comprehensive synchronization.',
    counterEvidence:
      'Running this snippet in Java or C++ almost always yields values like 8,421 or 9,134 rather than 10,000. Replacing with `AtomicInteger.incrementAndGet()` guarantees 10,000 using CPU Compare-And-Swap (CAS).',
    subGoalChunking: [
      'Deconstruct counter++ into assembly primitives: LOAD, ADD, STORE.',
      'Analyze volatile semantic scope: memory ordering & flush, not mutual exclusion.',
      'Simulate interleaving: Thread A loads 5, Thread B loads 5, both store 6 (one update lost).',
      'Prescribe correct primitive: Atomic CAS (AtomicInteger) or mutex lock.',
    ],
  },
}
