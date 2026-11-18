/**
 * Learning HUB — Deliberate Practice & Progressive Error Recovery Engine
 *
 * Implements K. Anders Ericsson's Deliberate Practice Theory (Ericsson, Krampe, Tesch-Römer 1993; Ericsson 2006, 2016),
 * Kurt VanLehn's Impasse-Driven Learning & Schema Bug Repair (VanLehn 1990, 1999),
 * and Nina Keith & Michael Frese's Error Management Training (EMT, Keith & Frese 2005, 2008).
 *
 * Theoretical & Mathematical Foundations:
 * 1. Ericsson's Deliberate Practice Paradigm (1993):
 *    - Expert performance is not driven by hours of automatic repetition, but by effortful,
 *      goal-directed activity designed specifically to improve particular aspects of performance
 *      through immediate informative feedback, full attentional concentration, and repetition on deficits.
 *    - Deliberate Effort Index:
 *      D = FocusedReps * (1 + 0.45 * DeficitTargetingRate) * (1 + 0.35 * ImpasseRepairRate)
 *
 * 2. Vygotsky / Ericsson Zone of Proximal Development (ZPD) Frontier:
 *    - The optimal learning zone occurs when recent performance is maintained within:
 *      P_recent in [0.65, 0.85] (65% to 85% success rate).
 *    - If P_recent > 0.85: Task has become automatic; trigger Desirable Difficulty expansion.
 *    - If P_recent < 0.65: Cognitive overload / excessive failure; inject micro-skill scaffolding.
 *
 * 3. VanLehn's (1990) Impasse-Driven Schema Repair:
 *    - True conceptual restructuring occurs at cognitive impasses (where current mental procedures fail).
 *    - Bug Classification:
 *      a) 'misconception': Inverted or invalid mental model (e.g., confounding correlation with causation).
 *      b) 'procedural_lapse': Omitting an invariant or prerequisite operation in a sequence.
 *      c) 'boundary_oversight': Neglecting boundary conditions (e.g., 0, null, off-by-one, concurrency races).
 *      d) 'attentional_slip': Minor perceptual or transient working-memory transposition.
 *
 * 4. Keith & Frese (2008) Error Management Training (EMT):
 *    - Errors are explicit metacognitive signposts rather than signs of personal deficiency.
 *    - Positive Error Climate promotes emotional regulation and enhances adaptive transfer to novel problems.
 *
 * 5. FSRS-6 Deliberate Micro-Repair Bridge:
 *    - Cards failed due to specific bug classes receive targeted micro-repairs with tailored initial stabilities:
 *      S_0 = S_base * (1 + 0.35 * RepairQuality - 0.20 * BugSeverity)
 */

import { z } from 'zod'

// ============================================================================
// 1. Types & Zod Schemas
// ============================================================================

export type BugClass =
  | 'misconception' // Deep conceptual flaw (Severity = 4)
  | 'procedural_lapse' // Skipped invariant step (Severity = 3)
  | 'boundary_oversight' // Edge-case or boundary failure (Severity = 2)
  | 'attentional_slip' // Transient working memory slip (Severity = 1)

export type PracticeDifficultyTier =
  'foundational' | 'intermediate' | 'advanced' | 'frontier_stretch'

export type ZPDRecommendation =
  | 'expand_difficulty' // Accuracy > 85%: Stretch to next tier
  | 'maintain_deliberate_sweet_spot' // Accuracy in [65%, 85%]: Ideal deliberate practice
  | 'inject_micro_scaffold' // Accuracy < 65%: Isolate sub-skills

export interface MicroSkillDrill {
  readonly id: string
  readonly title: string
  readonly targetedDeficit: string
  readonly difficultyTier: PracticeDifficultyTier
  readonly prompt: string
  readonly expectedKeyInsight: string
  readonly options: readonly {
    readonly id: string
    readonly text: string
    readonly isCorrect: boolean
    readonly bugClass?: BugClass
    readonly diagnosticFeedback: string
    readonly schemaRepairInstruction?: string
  }[]
}

export interface ImpasseCheckpoint {
  readonly id: string
  readonly title: string
  readonly contextScenario: string
  readonly failureTrigger: string
  readonly bugClass: BugClass
  readonly erroneousReasoning: string
  readonly correctInvariantRepair: string
  readonly conceptualReframingEMT: string
  readonly reflectionQuestions: readonly string[]
}

export interface DeliberatePracticeSuite {
  readonly id: string
  readonly title: string
  readonly domain: string
  readonly theoreticalBackground: string
  readonly targetMasteryGoal: string
  readonly drills: readonly MicroSkillDrill[]
  readonly impasseCheckpoints: readonly ImpasseCheckpoint[]
}

export interface ZPDFrontierState {
  readonly currentTier: PracticeDifficultyTier
  readonly rollingAccuracy: number // 0.0 to 1.0
  readonly totalAttempts: number
  readonly isOptimalZPD: boolean
  readonly recommendation: ZPDRecommendation
  readonly guidanceMessage: string
}

export interface ErrorTaxonomyBreakdown {
  readonly totalErrors: number
  readonly misconceptionCount: number
  readonly proceduralLapseCount: number
  readonly boundaryOversightCount: number
  readonly attentionalSlipCount: number
  readonly predominantBugClass: BugClass | 'none'
  readonly meanBugSeverity: number // 1.0 to 4.0
}

export interface DeliberateEffortMetrics {
  readonly totalFocusedReps: number
  readonly targetedDeficitReps: number
  readonly deficitTargetingRate: number // 0.0 to 1.0
  readonly impasseRepairsCompleted: number
  readonly deliberateEffortIndex: number // D = Reps * (1 + 0.45*DeficitRate) * (1 + 0.35*RepairRate)
  readonly deliberateMasteryGrade:
    'Apprentice' | 'Proficient' | 'Frontier Specialist' | 'Master Craftsman'
}

export interface FSRSMicroRepairCard {
  readonly id: string
  readonly suiteId: string
  readonly drillId: string
  readonly bugClass: BugClass
  readonly prompt: string
  readonly erroneousImpasse: string
  readonly schemaRepairSolution: string
  readonly emtReframingMnemonic: string
  readonly recommendedStabilityMultiplier: number
}

// Zod schemas
export const DrillAnswerSubmissionSchema = z.object({
  suiteId: z.string().min(1),
  drillId: z.string().min(1),
  selectedOptionId: z.string().min(1),
  reactionTimeMs: z.number().nonnegative(),
})

// Bug severity lookup table
export const BUG_SEVERITY_WEIGHTS: Record<BugClass, number> = {
  misconception: 4,
  procedural_lapse: 3,
  boundary_oversight: 2,
  attentional_slip: 1,
}

// ============================================================================
// 2. Pre-Configured Deliberate Practice Suites
// ============================================================================

export const CALIBRATED_DELIBERATE_SUITES: Record<string, DeliberatePracticeSuite> = {
  lock_free_concurrency: {
    id: 'lock_free_concurrency',
    title: 'Lock-Free Data Structures & ABA Memory Invariants',
    domain: 'Systems Programming & Concurrency Theory',
    theoreticalBackground:
      'Mastering lock-free concurrent algorithms (Herlihy & Shavit 2008) requires deliberate practice at the boundary of atomic memory orderings (Acquire/Release vs Relaxed) and pointer reuse hazards (the ABA problem). Learners frequently commit subtle race-condition bugs that evade traditional unit tests.',
    targetMasteryGoal:
      'Attain flawless schema automation for atomic CAS retry loops, generation-tagged pointer validation, and hazard-pointer hazard mitigation under high thread contention.',
    drills: [
      {
        id: 'drill_cas_retry_loop',
        title: 'Compare-And-Swap Retry Loop Invariant',
        targetedDeficit: 'Omitting re-read of atomic head pointer inside CAS loop',
        difficultyTier: 'foundational',
        prompt:
          'In a lock-free Treiber stack push operation, what must be re-read on every retry iteration before calling compare_exchange_weak?',
        expectedKeyInsight:
          'The local snapshot of the head pointer must be updated on each failed CAS, otherwise the next CAS operates on stale expectations.',
        options: [
          {
            id: 'opt_reread_head',
            text: 'Re-read new_node->next = head.load(memory_order_relaxed) on each retry iteration.',
            isCorrect: true,
            diagnosticFeedback:
              'Spot on! Re-reading head inside the retry loop ensures the node points to the latest valid top before attempting CAS.',
          },
          {
            id: 'opt_cached_head',
            text: 'Retain the initial pre-loop head pointer to ensure strict FIFO sequencing.',
            isCorrect: false,
            bugClass: 'procedural_lapse',
            diagnosticFeedback:
              'Procedural Lapse: If head is not re-read inside the loop, the CAS will continuously fail against the now-updated head or corrupt the stack chain.',
            schemaRepairInstruction:
              'Repair: Treat the retry loop as an invariant verification cycle: always re-sample atomic head on failure.',
          },
          {
            id: 'opt_lock_fallback',
            text: 'Acquire an OS mutex lock whenever CAS fails more than 3 times.',
            isCorrect: false,
            bugClass: 'misconception',
            diagnosticFeedback:
              'Misconception: Falling back to mutexes destroys the lock-free liveness guarantee (at least one thread makes progress).',
            schemaRepairInstruction:
              'Repair: Lock-free algorithms rely on thread contention resolution via progressive backoff, not mutual exclusion.',
          },
        ],
      },
      {
        id: 'drill_aba_generation_tag',
        title: 'ABA Hazard Tag Counter Coupling',
        targetedDeficit: 'Confusing pointer equality with node identity invariance',
        difficultyTier: 'intermediate',
        prompt:
          'Why does storing a 64-bit monotonic generation counter alongside the pointer (e.g. TaggedPointer<T>) resolve the ABA hazard in lock-free pop?',
        expectedKeyInsight:
          'Even if node A is popped, freed, and re-allocated at the identical memory address, the incremented generation tag ensures the CAS fails.',
        options: [
          {
            id: 'opt_atomic_pair',
            text: 'The counter increments on every update, so an ABA cycle results in (ptr A, tag+2), causing double-word CAS to detect modification.',
            isCorrect: true,
            diagnosticFeedback:
              'Exactly right. The 128-bit atomic double-word compare-and-swap validates both address continuity and epoch freshness.',
          },
          {
            id: 'opt_pointer_hash',
            text: 'It encrypts the pointer memory address so other threads cannot read it.',
            isCorrect: false,
            bugClass: 'misconception',
            diagnosticFeedback:
              'Misconception: Generation tags are monotonic sequence counters, not cryptographic hashes or privacy measures.',
            schemaRepairInstruction:
              'Repair: The purpose of generation tags is temporal disambiguation of reused heap addresses.',
          },
          {
            id: 'opt_ignore_aba',
            text: 'The ABA problem only occurs on 32-bit CPUs and is physically impossible on modern 64-bit architectures.',
            isCorrect: false,
            bugClass: 'boundary_oversight',
            diagnosticFeedback:
              'Boundary Oversight: Modern memory allocators aggressively reuse recently freed cache lines, making ABA extremely prevalent in 64-bit lock-free stacks.',
            schemaRepairInstruction:
              'Repair: Memory recycling makes ABA an omnipresent hazard across all CPU architectures.',
          },
        ],
      },
      {
        id: 'drill_memory_order_release_acquire',
        title: 'Acquire-Release Memory Synchronization',
        targetedDeficit:
          'Applying memory_order_relaxed where published payload visibility is required',
        difficultyTier: 'advanced',
        prompt:
          'When pushing a node containing client payload data into a lock-free queue, what minimum memory order is mandatory on the successful CAS that publishes the new node?',
        expectedKeyInsight:
          'memory_order_release ensures all prior writes to the node payload are visible to any thread that acquires the node via memory_order_acquire.',
        options: [
          {
            id: 'opt_release_order',
            text: 'memory_order_release on success, ensuring all payload field writes happen-before another thread’s acquire.',
            isCorrect: true,
            diagnosticFeedback:
              'Flawless! Acquire-Release creates a synchronized-with relationship that prevents CPU out-of-order store reordering.',
          },
          {
            id: 'opt_relaxed_order',
            text: 'memory_order_relaxed on success, because the CAS itself provides full sequential consistency across cores.',
            isCorrect: false,
            bugClass: 'misconception',
            diagnosticFeedback:
              'Misconception: memory_order_relaxed does NOT enforce ordering on surrounding memory operations, exposing readers to uninitialized garbage payload.',
            schemaRepairInstruction:
              'Repair: Atomic operations without release semantics permit the CPU/compiler to reorder payload initialization after pointer publication.',
          },
          {
            id: 'opt_seq_cst_only',
            text: 'Only memory_order_seq_cst can be used; weaker models always lead to hardware crashes.',
            isCorrect: false,
            bugClass: 'attentional_slip',
            diagnosticFeedback:
              'Attentional Slip / Over-conservatism: Acquire-Release is strictly sound and much faster than total Sequential Consistency on ARM/x86.',
            schemaRepairInstruction:
              'Repair: Acquire-Release is the canonical synchronization bridge for publishing data structures.',
          },
        ],
      },
      {
        id: 'drill_hazard_pointers',
        title: 'Safe Memory Reclamation via Hazard Pointers',
        targetedDeficit: 'Immediate deallocation of popped nodes during active concurrent reads',
        difficultyTier: 'frontier_stretch',
        prompt:
          'When a thread pops node X from a lock-free stack, why can it NOT immediately call free(X) / delete X?',
        expectedKeyInsight:
          'Concurrent reader threads may have already loaded the pointer to X and are about to read X->next, causing use-after-free.',
        options: [
          {
            id: 'opt_use_after_free',
            text: 'Concurrent threads may hold a reference to X and access X->next before completing their CAS, producing a fatal use-after-free.',
            isCorrect: true,
            diagnosticFeedback:
              'Spot on! Hazard pointers or Epoch-Based Reclamation (EBR) defer reclamation until all threads drop hazardous references.',
          },
          {
            id: 'opt_heap_fragmentation',
            text: 'Freeing nodes immediately causes catastrophic virtual memory fragmentation.',
            isCorrect: false,
            bugClass: 'boundary_oversight',
            diagnosticFeedback:
              'Boundary Oversight: While fragmentation matters, the fatal issue in concurrent lock-free data structures is memory safety violation (use-after-free).',
            schemaRepairInstruction:
              'Repair: Never free a concurrent node while other threads might dereference its internal pointers.',
          },
        ],
      },
    ],
    impasseCheckpoints: [
      {
        id: 'impasse_aba_stack_pop',
        title: 'The Treiber Stack ABA Invariant Impasse',
        contextScenario:
          'Stack contains [A -> B -> C]. Thread 1 reads top = A, next = B, but is suspended before CAS. Thread 2 pops A, pops B, and pushes A back. Stack is now [A -> C]. Thread 1 resumes and executes CAS(expected: A, new: next).',
        failureTrigger:
          'Thread 1 expects top is A, which matches! But Thread 1’s cached "next" is B, which has already been freed! Stack top becomes dangling pointer B!',
        bugClass: 'misconception',
        erroneousReasoning:
          'Assuming that if an atomic pointer value has not changed between read and CAS, the underlying list structure is identically unchanged.',
        correctInvariantRepair:
          'Pointer equality does NOT imply structural invariance when nodes can be recycled. Bind a monotonic generation counter or use deferred reclamation to ensure ABA safety.',
        conceptualReframingEMT:
          'Errors like ABA are the ultimate test of concurrency expertise. When your intuition fails, you have located the precise boundary where hardware memory models diverge from sequential thought!',
        reflectionQuestions: [
          'Why did the CAS succeed despite the underlying stack having lost node B?',
          'How does a 64-bit generation tag detect that an ABA cycle took place?',
          'What happens if the operating system recycles virtual memory page addresses immediately?',
        ],
      },
    ],
  },

  deep_learning_numerical_stability: {
    id: 'deep_learning_numerical_stability',
    title: 'Deep Learning Numerical Stability & Gradient Invariants',
    domain: 'Machine Learning Engineering & Applied Mathematics',
    theoreticalBackground:
      'Training deep neural networks requires deliberate practice managing floating-point dynamics (IEEE 754 float32/bfloat16): avoiding catastrophic underflow in softmax cross-entropy, preventing exploding/vanishing gradients, and maintaining learning rate warmup invariants.',
    targetMasteryGoal:
      'Attain deep intuition for numerical conditioning tricks (Log-Sum-Exp, gradient norm clipping, LayerNorm epsilon) and diagnose numerical collapse before training divergent failure.',
    drills: [
      {
        id: 'drill_log_sum_exp',
        title: 'Log-Sum-Exp Numerical Stabilization Trick',
        targetedDeficit: 'Directly computing sum(exp(logits)) causing float32 overflow',
        difficultyTier: 'foundational',
        prompt:
          'When computing the denominator of Softmax over logits [1000, 1002, 1005], why does a naive sum(exp(x)) crash with Inf / NaN?',
        expectedKeyInsight:
          'In float32, exp(x) overflows to Infinity for x > 88.7. Subtracting max(logits) shifts the exponent safely into [exp(-x), 1.0].',
        options: [
          {
            id: 'opt_subtract_max',
            text: 'Subtract max(x) before exponentiation: exp(x - c) / sum(exp(x - c)) where c = max(x).',
            isCorrect: true,
            diagnosticFeedback:
              'Correct! Shifting by max(x) bounds the maximum exponent to exp(0) = 1.0, eliminating float32 overflow completely.',
          },
          {
            id: 'opt_clip_input',
            text: 'Divide all inputs by 1000 so the exponents stay below 1.0.',
            isCorrect: false,
            bugClass: 'misconception',
            diagnosticFeedback:
              'Misconception: Dividing logits by a constant alters the temperature of the distribution, fundamentally distorting model predictions.',
            schemaRepairInstruction:
              'Repair: Subtracting a constant from all logits cancels out mathematically in softmax; dividing does NOT.',
          },
          {
            id: 'opt_double_precision',
            text: 'Cast the tensor to float64, which is physically immune to overflow.',
            isCorrect: false,
            bugClass: 'procedural_lapse',
            diagnosticFeedback:
              'Procedural Lapse: float64 merely delays overflow (fails at x > 709) while halving GPU throughput and doubling VRAM.',
            schemaRepairInstruction:
              'Repair: Always use the mathematically invariant Log-Sum-Exp shift rather than relying on precision inflation.',
          },
        ],
      },
      {
        id: 'drill_gradient_clipping',
        title: 'Global Gradient Norm Clipping Invariant',
        targetedDeficit:
          'Clipping gradient values individually rather than scaling the global norm vector',
        difficultyTier: 'intermediate',
        prompt:
          'Why is scaling gradients by min(1.0, max_norm / ||g||) strictly superior to element-wise clipping clip_by_value(g, -c, +c)?',
        expectedKeyInsight:
          'Global norm clipping preserves the directional orientation of the gradient vector in parameter space, altering only its magnitude.',
        options: [
          {
            id: 'opt_preserve_direction',
            text: 'Global norm scaling preserves the true descent direction while element-wise clipping distorts the angle of the update vector.',
            isCorrect: true,
            diagnosticFeedback:
              'Flawless! Element-wise clipping projects high-gradient dimensions onto a box boundary, ruining optimization trajectories.',
          },
          {
            id: 'opt_zero_gradients',
            text: 'Element-wise clipping sets all gradients to zero whenever any parameter exceeds the threshold.',
            isCorrect: false,
            bugClass: 'attentional_slip',
            diagnosticFeedback:
              'Attentional Slip: clip_by_value clamps values to the threshold boundary [-c, +c]; it does not zero them.',
            schemaRepairInstruction:
              'Repair: Understand that clamping creates artificial 45-degree angle vectors in multi-dimensional space.',
          },
          {
            id: 'opt_faster_gpu',
            text: 'Global norm calculation avoids all GPU synchronization barriers.',
            isCorrect: false,
            bugClass: 'boundary_oversight',
            diagnosticFeedback:
              'Boundary Oversight: Calculating global norm actually requires an all-reduce across parameters, but the mathematical fidelity is worth it.',
            schemaRepairInstruction:
              'Repair: Global norm clipping is chosen for mathematical correctness (vector direction preservation), not synchronization reduction.',
          },
        ],
      },
      {
        id: 'drill_layernorm_epsilon',
        title: 'Layer Normalization Variance Epsilon Safeguard',
        targetedDeficit: 'Omitting epsilon inside variance square root causing division by zero',
        difficultyTier: 'advanced',
        prompt:
          'In LayerNorm(x) = (x - mean) / sqrt(var + eps) * gamma + beta, what is the exact catastrophic failure mode if eps = 0?',
        expectedKeyInsight:
          'If all elements in the normalized layer have identical values (e.g. constant activation), variance is 0, causing division by zero and NaN gradients.',
        options: [
          {
            id: 'opt_zero_variance_nan',
            text: 'Zero variance yields division by zero, producing NaN activations and permanently destroying backpropagation weights.',
            isCorrect: true,
            diagnosticFeedback:
              'Spot on! Epsilon (typically 1e-5) guarantees numerical stability when features are uniform or dead.',
          },
          {
            id: 'opt_underflow_loss',
            text: 'Eps = 0 causes the weights to shrink to zero during SGD updates.',
            isCorrect: false,
            bugClass: 'misconception',
            diagnosticFeedback:
              'Misconception: Division by zero does not shrink weights; it produces Inf/NaN which propagates irreversibly through all downstream layers.',
            schemaRepairInstruction:
              'Repair: Division by zero is a catastrophic failure that corrupts floating-point representations entirely.',
          },
        ],
      },
    ],
    impasseCheckpoints: [
      {
        id: 'impasse_cross_entropy_underflow',
        title: 'Cross-Entropy Catastrophic Underflow Impasse',
        contextScenario:
          'A classifier computes p = softmax(logits), then loss = -log(p[target]). For a confidently wrong prediction, p[target] underflows to float32 0.0.',
        failureTrigger:
          'Evaluating -log(0.0) produces positive Infinity, which results in NaN gradients during the very first backward pass!',
        bugClass: 'boundary_oversight',
        erroneousReasoning:
          'Separating softmax from cross-entropy in code instead of using an integrated fused LogSoftmax kernel.',
        correctInvariantRepair:
          'Use fused LogSoftmax with Log-Sum-Exp: log(exp(x_i)/sum(exp(x))) = x_i - c - log(sum(exp(x - c))), avoiding intermediate probabilities entirely.',
        conceptualReframingEMT:
          'Floating-point numbers are not continuous real numbers! Encountering a NaN impasse is the doorway to understanding discrete numerical analysis.',
        reflectionQuestions: [
          'Why does exp(-100) underflow to 0.0 in 32-bit floating point?',
          'How does mathematical factorization cancel the exponentiation before division?',
        ],
      },
    ],
  },

  clinical_diagnostic_debiasing: {
    id: 'clinical_diagnostic_debiasing',
    title: 'Clinical Diagnostic De-Biasing & Cognitive Forcing Functions',
    domain: 'Medical Decision Making & Cognitive Psychology',
    theoreticalBackground:
      'Pat Croskerry (2002, 2003) and Jerome Groopman (2007) pioneered cognitive forcing functions to deliberately interrupt System 1 intuitive heuristics (anchoring bias, premature closure, search satisficing, base-rate neglect) during acute differential diagnosis.',
    targetMasteryGoal:
      'Acquire deliberate metacognitive habits to pause, calibrate prior base-rates, systematically verify lethal red flags, and counter premature diagnostic closure.',
    drills: [
      {
        id: 'drill_anchoring_triage',
        title: 'Anchoring Bias on Referral Triage Label',
        targetedDeficit:
          'Adopting prior triage classification uncritically without independent verification',
        difficultyTier: 'foundational',
        prompt:
          'A patient is sent from triage labeled "gastroenteritis: nausea and epigastric discomfort". Vital signs show HR 105, BP 90/60. What is the mandatory cognitive forcing action before prescribing anti-emetics?',
        expectedKeyInsight:
          'Systematically de-bias by generating lethal alternative etiologies (inferior STEMI, acute mesenteric ischemia, diabetic ketoacidosis, ruptured AAA) that share epigastric presentation.',
        options: [
          {
            id: 'opt_ecg_lethal',
            text: 'Obtain an immediate 12-lead ECG and basic metabolic panel to rule out atypical inferior STEMI and metabolic shock.',
            isCorrect: true,
            diagnosticFeedback:
              'Outstanding! Cognitive forcing explicitly requires ruling out worst-first killers masquerading as benign common presentations.',
          },
          {
            id: 'opt_antiemetic_first',
            text: 'Administer ondansetron first to relieve nausea, then re-evaluate in 2 hours.',
            isCorrect: false,
            bugClass: 'procedural_lapse',
            diagnosticFeedback:
              'Procedural Lapse: Symptomatic masking before diagnostic triage in an unstable hypotensive patient delays recognition of catastrophic coronary or vascular shock.',
            schemaRepairInstruction:
              'Repair: Never administer symptomatic suppressants in shock-index abnormal patients without ruling out occult cardiac or surgical emergencies.',
          },
          {
            id: 'opt_assume_gastro',
            text: 'Confirm the triage diagnosis because viral gastroenteritis is overwhelmingly more frequent than coronary syndrome.',
            isCorrect: false,
            bugClass: 'misconception',
            diagnosticFeedback:
              'Misconception: Anchoring on the triage diagnosis is the single leading cause of preventable diagnostic delays in emergency medicine.',
            schemaRepairInstruction:
              'Repair: Triage notes are preliminary impressions, not diagnostic truth. Always construct an independent differential.',
          },
        ],
      },
      {
        id: 'drill_base_rate_neglect',
        title: 'Bayesian Base-Rate Integration & Rare Mimics',
        targetedDeficit: 'Ignoring low disease prevalence when evaluating positive screening tests',
        difficultyTier: 'intermediate',
        prompt:
          'A screening test for rare disease X (prevalence 1 in 1,000) has 99% sensitivity and 95% specificity. A patient tests positive. What is the approximate true posterior probability P(Disease | +)?',
        expectedKeyInsight:
          'Due to low base rate (0.1%), false positives (5% of 999 = ~50) dwarf true positives (0.99 of 1 = ~1), yielding ~1/51 ≈ 2% posterior probability.',
        options: [
          {
            id: 'opt_bayes_approx',
            text: 'Approximately 2% (around 1 in 50), because false positives in the healthy majority outnumber rare true positives.',
            isCorrect: true,
            diagnosticFeedback:
              'Flawless Bayesian calibration! Base-rate neglect is a primary cognitive trap; even high-accuracy tests have low positive predictive value in ultra-rare conditions.',
          },
          {
            id: 'opt_ninety_nine',
            text: '99%, because the sensitivity of the test is 99% accurate.',
            isCorrect: false,
            bugClass: 'misconception',
            diagnosticFeedback:
              'Misconception: Sensitivity reflects P(+ | Disease), NOT P(Disease | +). Equating them is the classic prosecutor’s / base-rate fallacy.',
            schemaRepairInstruction:
              'Repair: Always weigh test sensitivity against the prevalence prior in the population.',
          },
          {
            id: 'opt_ninety_five',
            text: '95%, because the test specificity is 95%.',
            isCorrect: false,
            bugClass: 'boundary_oversight',
            diagnosticFeedback:
              'Boundary Oversight: Specificity of 95% means a 5% false-positive rate. In a population of 1000 healthy individuals, 50 will falsely test positive.',
            schemaRepairInstruction:
              'Repair: The denominator of positive tests is (True Positives + False Positives).',
          },
        ],
      },
      {
        id: 'drill_premature_closure',
        title: 'Search Satisficing & Twin Pathology Verification',
        targetedDeficit:
          'Terminating diagnostic search immediately after finding one positive finding',
        difficultyTier: 'advanced',
        prompt:
          'In high-energy polytrauma, a plain radiograph identifies an obvious clavicle fracture. Why must a systematic trauma survey continue without premature closure?',
        expectedKeyInsight:
          'Search satisficing causes clinicians to overlook concurrent lethal occult injuries (pneumothorax, aortic injury, visceral rupture) once an obvious injury is found.',
        options: [
          {
            id: 'opt_search_satisficing',
            text: 'Finding an obvious distraction injury primes search satisficing; lethal occult injuries (pneumothorax, visceral tears) must be actively hunted.',
            isCorrect: true,
            diagnosticFeedback:
              'Spot on! Search satisficing is the tendency to stop searching once the first target is acquired. Polytrauma mandates complete anatomical sweeps.',
          },
          {
            id: 'opt_single_injury_rule',
            text: 'High-energy trauma rarely produces more than one major anatomical lesion.',
            isCorrect: false,
            bugClass: 'misconception',
            diagnosticFeedback:
              'Misconception: High-energy kinetic trauma routinely produces multi-compartment occult injuries.',
            schemaRepairInstruction:
              'Repair: Energy transfer distributes across anatomical cavities. Always complete the secondary survey.',
          },
          {
            id: 'opt_stop_when_found',
            text: 'Once an operative fracture is identified, diagnostic imaging should halt to minimize radiation exposure.',
            isCorrect: false,
            bugClass: 'attentional_slip',
            diagnosticFeedback:
              'Attentional Slip: Withholding life-saving trauma imaging over minor radiation concerns violates emergency triage protocols.',
            schemaRepairInstruction:
              'Repair: Life-threatening occult pathology takes immediate precedence over secondary imaging radiation concerns.',
          },
        ],
      },
    ],
    impasseCheckpoints: [
      {
        id: 'impasse_premature_closure_pe',
        title: 'The Pleuritic Pain & Premature Musculoskeletal Closure Impasse',
        contextScenario:
          'A 28-year-old runner presents with sharp right-sided chest pain after lifting weights. Palpation of the chest wall reproduces tenderness. The clinician diagnoses costochondritis and discharges with NSAIDs. Two hours later, the patient collapses from a massive saddle pulmonary embolism.',
        failureTrigger:
          'Premature diagnostic closure triggered by confirmation bias: reproducible chest wall pain does not rule out concurrent PE, especially without reviewing oral contraceptive history or Wells criteria.',
        bugClass: 'boundary_oversight',
        erroneousReasoning:
          'Treating a positive musculoskeletal physical exam sign as mutually exclusive with life-threatening thromboembolic disease.',
        correctInvariantRepair:
          'Execute Croskerry’s Cognitive Forcing Rule: "Rule out the worst first." Reproducible tenderness has low negative predictive value for ruling out pulmonary embolism when risk factors exist.',
        conceptualReframingEMT:
          'Diagnostic errors are not moral failures; they are predictable systematic traps of human bounded rationality. By studying this impasse, you install a lifelong cognitive forcing shield!',
        reflectionQuestions: [
          'What cognitive bias led the clinician to accept the first benign explanation?',
          'How does the Wells score mandate deliberate probability stratification?',
          'What question should every practitioner ask before finalizing a discharge diagnosis?',
        ],
      },
    ],
  },
}

// ============================================================================
// 3. Mathematical Core: ZPD Frontier & Deliberate Effort
// ============================================================================

/**
 * Calculates dynamic Zone of Proximal Development (ZPD) frontier state.
 * (Vygotsky 1978; Ericsson 1993, 2016)
 */
export function calculateZPDFrontier(
  recentResults: readonly boolean[], // Last K attempts
  currentTier: PracticeDifficultyTier,
): ZPDFrontierState {
  const n = recentResults.length
  if (n === 0) {
    return {
      currentTier,
      rollingAccuracy: 1.0,
      totalAttempts: 0,
      isOptimalZPD: true,
      recommendation: 'maintain_deliberate_sweet_spot',
      guidanceMessage: 'Baseline session initiated. Focus on high-attentional precision.',
    }
  }

  const successes = recentResults.filter(Boolean).length
  const rollingAccuracy = Math.round((successes / n) * 100) / 100

  let recommendation: ZPDRecommendation = 'maintain_deliberate_sweet_spot'
  let guidanceMessage =
    'Optimal deliberate practice zone! Performance matches your competence frontier.'

  if (rollingAccuracy > 0.85 && n >= 3) {
    recommendation = 'expand_difficulty'
    guidanceMessage =
      'Accuracy exceeds 85%. Automated competence reached. Step up difficulty or inject boundary edge cases.'
  } else if (rollingAccuracy < 0.65 && n >= 3) {
    recommendation = 'inject_micro_scaffold'
    guidanceMessage =
      'Accuracy fell below 65%. Cognitive resistance detected. Isolate sub-skills into micro-repetition drills.'
  }

  const isOptimalZPD = rollingAccuracy >= 0.65 && rollingAccuracy <= 0.85

  return {
    currentTier,
    rollingAccuracy,
    totalAttempts: n,
    isOptimalZPD,
    recommendation,
    guidanceMessage,
  }
}

/**
 * Categorizes and breaks down accumulated errors according to Kurt VanLehn's (1990) taxonomy.
 */
export function analyzeErrorTaxonomy(recordedErrors: readonly BugClass[]): ErrorTaxonomyBreakdown {
  const totalErrors = recordedErrors.length
  if (totalErrors === 0) {
    return {
      totalErrors: 0,
      misconceptionCount: 0,
      proceduralLapseCount: 0,
      boundaryOversightCount: 0,
      attentionalSlipCount: 0,
      predominantBugClass: 'none',
      meanBugSeverity: 0,
    }
  }

  let misc = 0
  let proc = 0
  let bound = 0
  let slip = 0
  let sumSeverity = 0

  for (const bug of recordedErrors) {
    sumSeverity += BUG_SEVERITY_WEIGHTS[bug]
    if (bug === 'misconception') misc++
    else if (bug === 'procedural_lapse') proc++
    else if (bug === 'boundary_oversight') bound++
    else if (bug === 'attentional_slip') slip++
  }

  // Find predominant class
  const counts: Record<BugClass, number> = {
    misconception: misc,
    procedural_lapse: proc,
    boundary_oversight: bound,
    attentional_slip: slip,
  }
  let maxCount = -1
  let predominant: BugClass = 'misconception'
  for (const [k, v] of Object.entries(counts)) {
    if (v > maxCount) {
      maxCount = v
      predominant = k as BugClass
    }
  }

  const meanBugSeverity = Math.round((sumSeverity / totalErrors) * 100) / 100

  return {
    totalErrors,
    misconceptionCount: misc,
    proceduralLapseCount: proc,
    boundaryOversightCount: bound,
    attentionalSlipCount: slip,
    predominantBugClass: predominant,
    meanBugSeverity,
  }
}

/**
 * Calculates Ericsson Deliberate Effort Index:
 * D = FocusedReps * (1 + 0.45 * DeficitTargetingRate) * (1 + 0.35 * ImpasseRepairRate)
 */
export function calculateDeliberateEffortIndex(
  totalReps: number,
  targetedDeficitReps: number,
  impasseRepairsCompleted: number,
): DeliberateEffortMetrics {
  const boundedReps = Math.max(0, totalReps)
  const deficitRate = boundedReps > 0 ? Math.min(1.0, targetedDeficitReps / boundedReps) : 0
  const repairRate = boundedReps > 0 ? Math.min(1.0, impasseRepairsCompleted / boundedReps) : 0

  const rawEffort = boundedReps * (1 + 0.45 * deficitRate) * (1 + 0.35 * repairRate)
  const deliberateEffortIndex = Math.round(rawEffort * 10) / 10

  let deliberateMasteryGrade: DeliberateEffortMetrics['deliberateMasteryGrade'] = 'Apprentice'
  if (deliberateEffortIndex >= 40) {
    deliberateMasteryGrade = 'Master Craftsman'
  } else if (deliberateEffortIndex >= 25) {
    deliberateMasteryGrade = 'Frontier Specialist'
  } else if (deliberateEffortIndex >= 12) {
    deliberateMasteryGrade = 'Proficient'
  }

  return {
    totalFocusedReps: boundedReps,
    targetedDeficitReps,
    deficitTargetingRate: Math.round(deficitRate * 100) / 100,
    impasseRepairsCompleted,
    deliberateEffortIndex,
    deliberateMasteryGrade,
  }
}

// ============================================================================
// 4. Stateful Deliberate Practice Session Coordinator
// ============================================================================

export interface SessionSubmissionResult {
  readonly isCorrect: boolean
  readonly bugClass?: BugClass
  readonly feedback: string
  readonly triggeredImpasseId?: string
  readonly zpdRecommendation: ZPDRecommendation
}

export class DeliberatePracticeSession {
  private readonly suite: DeliberatePracticeSuite
  private currentTier: PracticeDifficultyTier = 'foundational'
  private history: boolean[] = []
  private recordedErrors: BugClass[] = []
  private completedRepairs: Set<string> = new Set()
  private targetedDeficitReps = 0

  constructor(suiteId: string) {
    const s = CALIBRATED_DELIBERATE_SUITES[suiteId]
    if (!s) {
      throw new Error(`Unknown deliberate practice suite: ${suiteId}`)
    }
    this.suite = s
  }

  getSuite(): DeliberatePracticeSuite {
    return this.suite
  }

  getCurrentTier(): PracticeDifficultyTier {
    return this.currentTier
  }

  setCurrentTier(tier: PracticeDifficultyTier): void {
    this.currentTier = tier
  }

  submitAnswer(drillId: string, optionId: string): SessionSubmissionResult {
    const drill = this.suite.drills.find((d) => d.id === drillId)
    if (!drill) throw new Error(`Drill ${drillId} not found in suite ${this.suite.id}`)

    const option = drill.options.find((o) => o.id === optionId)
    if (!option) throw new Error(`Option ${optionId} not found in drill ${drillId}`)

    const isCorrect = option.isCorrect
    this.history.push(isCorrect)

    if (drill.targetedDeficit) {
      this.targetedDeficitReps++
    }

    let triggeredImpasseId: string | undefined

    if (!isCorrect && option.bugClass) {
      this.recordedErrors.push(option.bugClass)
      // Check if there is an associated impasse checkpoint in the suite
      const matchedImpasse = this.suite.impasseCheckpoints.find(
        (c) => c.bugClass === option.bugClass,
      )
      if (matchedImpasse) {
        triggeredImpasseId = matchedImpasse.id
      }
    }

    const zpd = calculateZPDFrontier(this.getRecentHistory(5), this.currentTier)

    return {
      isCorrect,
      bugClass: option.bugClass,
      feedback: option.diagnosticFeedback,
      triggeredImpasseId,
      zpdRecommendation: zpd.recommendation,
    }
  }

  recordImpasseRepair(impasseId: string): boolean {
    const checkpoint = this.suite.impasseCheckpoints.find((c) => c.id === impasseId)
    if (checkpoint) {
      this.completedRepairs.add(impasseId)
      return true
    }
    return false
  }

  getRecentHistory(windowSize = 5): readonly boolean[] {
    return this.history.slice(-windowSize)
  }

  getZPDFrontier(): ZPDFrontierState {
    return calculateZPDFrontier(this.getRecentHistory(5), this.currentTier)
  }

  getErrorTaxonomy(): ErrorTaxonomyBreakdown {
    return analyzeErrorTaxonomy(this.recordedErrors)
  }

  getDeliberateEffort(): DeliberateEffortMetrics {
    return calculateDeliberateEffortIndex(
      this.history.length,
      this.targetedDeficitReps,
      this.completedRepairs.size,
    )
  }

  /**
   * Generates FSRS-6 Micro-Repair cards with stability multipliers calibrated for bug severity.
   */
  exportFSRSCards(_baseStabilityDays = 4.0): readonly FSRSMicroRepairCard[] {
    const effort = this.getDeliberateEffort()
    const cards: FSRSMicroRepairCard[] = []

    for (const drill of this.suite.drills) {
      for (const opt of drill.options) {
        if (!opt.isCorrect && opt.bugClass) {
          const isRepaired = Array.from(this.completedRepairs.values()).length > 0
          const severity = BUG_SEVERITY_WEIGHTS[opt.bugClass]

          // S_0 formula: boost stability if repaired, discount if high severity
          const multiplier = isRepaired
            ? Math.round(
                (1.0 + 0.3 * (effort.deliberateEffortIndex / 25) - 0.05 * severity) * 100,
              ) / 100
            : 0.8

          cards.push({
            id: `fsrs_${this.suite.id}_${drill.id}_${opt.id}`,
            suiteId: this.suite.id,
            drillId: drill.id,
            bugClass: opt.bugClass,
            prompt: `[${this.suite.title} - Deliberate Impasse]\n${drill.prompt}`,
            erroneousImpasse: `Identified Bug: ${opt.text}\nDiagnostic: ${opt.diagnosticFeedback}`,
            schemaRepairSolution: opt.schemaRepairInstruction || drill.expectedKeyInsight,
            emtReframingMnemonic:
              'Keith & Frese EMT: "Errors are information! The error exposes the exact boundary of your schema."',
            recommendedStabilityMultiplier: Math.max(0.6, multiplier),
          })
        }
      }
    }

    return cards
  }
}
