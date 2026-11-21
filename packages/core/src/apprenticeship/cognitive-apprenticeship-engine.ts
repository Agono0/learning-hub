/**
 * Cognitive Apprenticeship & Expert Modeling Engine
 *
 * Grounded in:
 * - Allan Collins, John Seely Brown, & Susan E. Newman (1989):
 *   "Cognitive Apprenticeship: Teaching the crafts of reading, writing, and mathematics"
 *   Core Methods: Modeling, Coaching, Scaffolding, Articulation, Reflection, Exploration.
 * - Jean Lave & Etienne Wenger (1991):
 *   "Situated Learning: Legitimate Peripheral Participation (LPP)"
 *   Apprentices transition from peripheral observation to autonomous mastery within authentic practice cultures.
 * - Kurt VanLehn (1999) & Michelene Chi (2000):
 *   Making tacit expert heuristics visible through think-aloud decomposition and prompt-driven self-articulation.
 */

// TD-05: scenario corpora (content, not logic) live in './content'.
import { CALIBRATED_APPRENTICESHIP_SUITES } from './content'

// ============================================================================
// 1. Domain Types and Interfaces
// ============================================================================

export type ApprenticeshipStage =
  'modeling' | 'coaching' | 'scaffolding' | 'articulation' | 'reflection' | 'exploration'

export type ParticipationLevel =
  'peripheral_observer' | 'guided_contributor' | 'autonomous_practitioner' | 'master_modeler'

export type ThinkAloudPhase =
  'orientation' | 'decomposition' | 'execution' | 'validation' | 'backtracking'

export interface RejectedAlternative {
  readonly alternative: string
  readonly reason: string
}

export interface ExpertThinkAloudTrace {
  readonly id: string
  readonly stepNumber: number
  readonly title: string
  readonly phase: ThinkAloudPhase
  readonly observableAction: string
  readonly tacitHeuristic: string
  readonly tradeoffsConsidered: readonly string[]
  readonly rejectedAlternatives: readonly RejectedAlternative[]
  readonly metacognitiveSelfCorrection: string
}

export interface TacitPrinciple {
  readonly id: string
  readonly name: string
  readonly coreFormulaOrMaxim: string
  readonly description: string
  readonly noviceMisconception: string
  readonly expertDiagnosticIndicator: string
}

export interface ArticulationOption {
  readonly id: string
  readonly text: string
  readonly tacitAlignmentScore: number // 0.0 to 1.0
  readonly diagnosticFeedback: string
  readonly principleId?: string
}

export interface ApprenticeArticulationPrompt {
  readonly id: string
  readonly traceStepId: string
  readonly promptTitle: string
  readonly question: string
  readonly cognitiveSkillTested: string
  readonly options: readonly ArticulationOption[]
  readonly openArticulationScaffold: string
}

export interface ReflectionContrast {
  readonly id: string
  readonly aspect: string
  readonly expertApproach: string
  readonly noviceApproach: string
  readonly underlyingMentalModel: string
  readonly reflectionQuestion: string
  readonly goldenInsight: string
}

export interface CognitiveApprenticeshipSuite {
  readonly id: string
  readonly title: string
  readonly domain: string
  readonly expertPersona: string
  readonly problemContext: string
  readonly targetMasteryOutcome: string
  readonly traces: readonly ExpertThinkAloudTrace[]
  readonly principles: readonly TacitPrinciple[]
  readonly prompts: readonly ApprenticeArticulationPrompt[]
  readonly reflectionContrasts: readonly ReflectionContrast[]
}

export interface ApprenticeshipMetrics {
  readonly totalTracesObserved: number
  readonly totalArticulationsAttempted: number
  readonly meanArticulationScore: number
  readonly extractedPrincipleCount: number
  readonly totalAvailablePrinciples: number
  readonly tacitExtractionRate: number
  readonly completedReflectionsCount: number
  readonly fadingIndex: number // 0.0 to 1.0
  readonly participationLevel: ParticipationLevel
  readonly stageReadiness: Record<ApprenticeshipStage, boolean>
}

export interface FSRSTacitHeuristicCard {
  readonly id: string
  readonly suiteId: string
  readonly principleId: string
  readonly stage: ApprenticeshipStage
  readonly prompt: string
  readonly expertThinkAloudQuote: string
  readonly underlyingTacitHeuristic: string
  readonly commonNoviceTrap: string
  readonly collinsPedagogicalNote: string
  readonly recommendedStabilityMultiplier: number
}

// ============================================================================
// 2. Calibrated Cognitive Apprenticeship Suites
// ============================================================================

// TD-05: the calibrated apprenticeship suites live in './content' (content, not logic).
export { CALIBRATED_APPRENTICESHIP_SUITES } from './content'

// ============================================================================
// 3. Mathematical Core: Articulation, Extraction & Fading
// ============================================================================

/**
 * Calculates Tacit Knowledge Extraction Rate:
 * E_tacit = min(1.0, (extractedPrinciples / totalPrinciples) * 0.6 + articulationMean * 0.4)
 */
export function calculateTacitExtractionRate(
  extractedPrinciplesCount: number,
  totalAvailablePrinciples: number,
  articulationScores: readonly number[],
): number {
  if (totalAvailablePrinciples === 0) return 0
  const principleRatio = Math.min(1.0, extractedPrinciplesCount / totalAvailablePrinciples)

  const n = articulationScores.length
  const meanArticulation = n > 0 ? articulationScores.reduce((a, b) => a + b, 0) / n : 0

  const rawScore = principleRatio * 0.6 + meanArticulation * 0.4
  return Math.round(Math.min(1.0, rawScore) * 100) / 100
}

/**
 * Stage autonomy weights based on Collins, Brown & Newman (1989):
 * modeling (0.10), coaching (0.25), scaffolding (0.45), articulation (0.65), reflection (0.85), exploration (1.0).
 */
export const STAGE_AUTONOMY_WEIGHTS: Record<ApprenticeshipStage, number> = {
  modeling: 0.1,
  coaching: 0.25,
  scaffolding: 0.45,
  articulation: 0.65,
  reflection: 0.85,
  exploration: 1.0,
}

/**
 * Calculates the Fading Index:
 * Measures the degree to which pedagogical scaffolds have been faded and the learner operates autonomously.
 * F = min(1.0, W_stage * 0.6 + (successfulArticulations / totalRequired) * 0.4)
 */
export function calculateFadingIndex(
  currentStage: ApprenticeshipStage,
  completedArticulations: number,
  totalArticulations: number,
): number {
  const stageWeight = STAGE_AUTONOMY_WEIGHTS[currentStage]
  const completionRatio =
    totalArticulations > 0 ? Math.min(1.0, completedArticulations / totalArticulations) : 0

  const fading = stageWeight * 0.6 + completionRatio * 0.4
  return Math.round(Math.min(1.0, fading) * 100) / 100
}

/**
 * Determines Legitimate Peripheral Participation (LPP) Level (Lave & Wenger 1991):
 * - >= 0.85: 'master_modeler'
 * - >= 0.65: 'autonomous_practitioner'
 * - >= 0.38: 'guided_contributor'
 * - < 0.38: 'peripheral_observer'
 */
export function determineParticipationLevel(
  fadingIndex: number,
  tacitExtractionRate: number,
): ParticipationLevel {
  const composite = fadingIndex * 0.5 + tacitExtractionRate * 0.5

  if (composite >= 0.85) return 'master_modeler'
  if (composite >= 0.65) return 'autonomous_practitioner'
  if (composite >= 0.38) return 'guided_contributor'
  return 'peripheral_observer'
}

// ============================================================================
// 4. Stateful Cognitive Apprenticeship Session Coordinator
// ============================================================================

export interface ArticulationSubmissionResult {
  readonly score: number
  readonly isAccurate: boolean
  readonly feedback: string
  readonly newlyUnlockedPrinciple?: TacitPrinciple
  readonly newParticipationLevel: ParticipationLevel
  readonly fadingIndex: number
}

export class CognitiveApprenticeshipSession {
  private readonly suite: CognitiveApprenticeshipSuite
  private currentStage: ApprenticeshipStage = 'modeling'
  private observedTraceIds: Set<string> = new Set()
  private extractedPrincipleIds: Set<string> = new Set()
  private articulationScores: number[] = []
  private completedReflectionIds: Set<string> = new Set()

  constructor(suiteId: string) {
    const s = CALIBRATED_APPRENTICESHIP_SUITES[suiteId]
    if (!s) {
      throw new Error(`Unknown cognitive apprenticeship suite: ${suiteId}`)
    }
    this.suite = s
  }

  getSuite(): CognitiveApprenticeshipSuite {
    return this.suite
  }

  getCurrentStage(): ApprenticeshipStage {
    return this.currentStage
  }

  setCurrentStage(stage: ApprenticeshipStage): void {
    this.currentStage = stage
  }

  observeTrace(traceId: string): boolean {
    const trace = this.suite.traces.find((t) => t.id === traceId)
    if (trace) {
      this.observedTraceIds.add(traceId)
      return true
    }
    return false
  }

  submitArticulation(promptId: string, optionId: string): ArticulationSubmissionResult {
    const prompt = this.suite.prompts.find((p) => p.id === promptId)
    if (!prompt) throw new Error(`Prompt ${promptId} not found in suite ${this.suite.id}`)

    const option = prompt.options.find((o) => o.id === optionId)
    if (!option) throw new Error(`Option ${optionId} not found in prompt ${promptId}`)

    const score = option.tacitAlignmentScore
    this.articulationScores.push(score)

    let newlyUnlockedPrinciple: TacitPrinciple | undefined

    if (option.principleId && score >= 0.8) {
      const principle = this.suite.principles.find((pr) => pr.id === option.principleId)
      if (principle && !this.extractedPrincipleIds.has(principle.id)) {
        this.extractedPrincipleIds.add(principle.id)
        newlyUnlockedPrinciple = principle
      }
    }

    const metrics = this.getMetrics()

    return {
      score,
      isAccurate: score >= 0.8,
      feedback: option.diagnosticFeedback,
      newlyUnlockedPrinciple,
      newParticipationLevel: metrics.participationLevel,
      fadingIndex: metrics.fadingIndex,
    }
  }

  completeReflection(contrastId: string): boolean {
    const contrast = this.suite.reflectionContrasts.find((c) => c.id === contrastId)
    if (contrast) {
      this.completedReflectionIds.add(contrastId)
      return true
    }
    return false
  }

  getMetrics(): ApprenticeshipMetrics {
    const totalPrinciples = this.suite.principles.length
    const extractedCount = this.extractedPrincipleIds.size
    const tacitExtractionRate = calculateTacitExtractionRate(
      extractedCount,
      totalPrinciples,
      this.articulationScores,
    )

    const fadingIndex = calculateFadingIndex(
      this.currentStage,
      this.articulationScores.length,
      this.suite.prompts.length,
    )

    const participationLevel = determineParticipationLevel(fadingIndex, tacitExtractionRate)

    const meanArticulation =
      this.articulationScores.length > 0
        ? Math.round(
            (this.articulationScores.reduce((a, b) => a + b, 0) / this.articulationScores.length) *
              100,
          ) / 100
        : 0

    const stageReadiness: Record<ApprenticeshipStage, boolean> = {
      modeling: this.observedTraceIds.size > 0,
      coaching: this.observedTraceIds.size >= this.suite.traces.length,
      scaffolding: this.articulationScores.length > 0,
      articulation: this.articulationScores.length >= this.suite.prompts.length,
      reflection: this.completedReflectionIds.size > 0,
      exploration:
        fadingIndex >= 0.7 &&
        this.completedReflectionIds.size >= this.suite.reflectionContrasts.length,
    }

    return {
      totalTracesObserved: this.observedTraceIds.size,
      totalArticulationsAttempted: this.articulationScores.length,
      meanArticulationScore: meanArticulation,
      extractedPrincipleCount: extractedCount,
      totalAvailablePrinciples: totalPrinciples,
      tacitExtractionRate,
      completedReflectionsCount: this.completedReflectionIds.size,
      fadingIndex,
      participationLevel,
      stageReadiness,
    }
  }

  exportFSRSCards(): readonly FSRSTacitHeuristicCard[] {
    const cards: FSRSTacitHeuristicCard[] = []

    for (const pr of this.suite.principles) {
      const isExtracted = this.extractedPrincipleIds.has(pr.id)
      const matchingPrompt = this.suite.prompts.find((p) =>
        p.options.some((o) => o.principleId === pr.id),
      )
      const matchingTrace = matchingPrompt
        ? this.suite.traces.find((t) => t.id === matchingPrompt.traceStepId)
        : this.suite.traces[0]

      cards.push({
        id: `fsrs_${this.suite.id}_${pr.id}`,
        suiteId: this.suite.id,
        principleId: pr.id,
        stage: this.currentStage,
        prompt: `[Cognitive Apprenticeship - ${this.suite.title}]\nHow does an expert model "${pr.name}"?\nCore Maxim: ${pr.coreFormulaOrMaxim}`,
        expertThinkAloudQuote: matchingTrace
          ? matchingTrace.tacitHeuristic
          : 'Expert Heuristic: Focus on invariant boundary conditions.',
        underlyingTacitHeuristic: pr.description,
        commonNoviceTrap: pr.noviceMisconception,
        collinsPedagogicalNote:
          'Collins, Brown & Newman (1989): Articulation makes tacit expert heuristics explicit, transforming fuzzy intuitions into durable mental models.',
        recommendedStabilityMultiplier: isExtracted ? 1.4 : 0.85,
      })
    }

    return cards
  }
}
