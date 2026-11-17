/**
 * Cognitive science CLI commands:
 * 1. generation: Slamecka & Graf (1978) Generation Effect ladder & evaluation.
 * 2. feynman: Rozenblit & Keil (2002) IOED & Feynman teach-back diagnostic.
 * 3. metacognition: Koriat & Bjork (2005) Calibration & Glenn Brier score.
 */
import {
  createGenerationLadder,
  evaluateFeynmanExplanation,
  evaluateGenerationTrial,
  evaluateMetacognitiveProfile,
  generationTierEnum,
  type GenerationTier,
  type JudgmentOfLearning,
} from '@learning-hub/core'
import { db, revlog } from '@learning-hub/db'
import { desc } from 'drizzle-orm'

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1]
  }
  return undefined
}

export function generationCommand(args: string[]): void {
  const sub = args[0] || 'challenge'

  if (sub === 'challenge') {
    const concept = parseFlag(args, '--concept') || 'Active Recall'
    const text =
      parseFlag(args, '--text') ||
      'Retrieval practice produces durable memory consolidation and synaptic potentiation'
    const rawTier = parseFlag(args, '--tier') || 'stem_completion'
    const tierParsed = generationTierEnum.safeParse(rawTier)
    const tier: GenerationTier = tierParsed.success ? tierParsed.data : 'stem_completion'

    const ladder = createGenerationLadder(concept, text, tier)

    console.log(`\n🧠 Slamecka-Graf Generation Effect Ladder (Tier ${ladder.tierLevel}/4)`)
    console.log(`Concept:               ${ladder.concept}`)
    console.log(
      `Difficulty Tier:       ${ladder.tier} (${ladder.generationMultiplier}x retention multiplier)`,
    )
    console.log(`Challenge:             ${ladder.challengeText}`)
    if (ladder.maskedTarget) {
      console.log(`Masked Target:         ${ladder.maskedTarget}`)
    }
    if (ladder.scrambledTokens && ladder.scrambledTokens.length > 0) {
      console.log(`Scrambled Tokens:      [${ladder.scrambledTokens.join(' | ')}]`)
    }
    console.log(`Hint:                  ${ladder.hint}`)
    return
  }

  if (sub === 'eval') {
    const concept = parseFlag(args, '--concept')
    const expected = parseFlag(args, '--expected')
    const attempt = parseFlag(args, '--attempt')
    const rawTier = parseFlag(args, '--tier') || 'stem_completion'

    if (!concept || !expected || !attempt) {
      console.error(
        'Usage: learning-hub generation eval --concept <name> --expected <text> --attempt <text> [--tier stem_completion|semantic_anagram|reverse_query|analogy_synthesis]',
      )
      return
    }

    const tierParsed = generationTierEnum.safeParse(rawTier)
    const tier: GenerationTier = tierParsed.success ? tierParsed.data : 'stem_completion'

    const result = evaluateGenerationTrial({
      concept,
      expectedAnswer: expected,
      userAttempt: attempt,
      tier,
      latencyMs: 3000,
    })

    console.log(`\n🎯 Generation Evaluation: ${concept}`)
    console.log(`Outcome:               ${result.isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`)
    console.log(`Similarity Score:      ${(result.similarityScore * 100).toFixed(1)}%`)
    console.log(`Retention Multiplier:  ${result.retentionMultiplier}x`)
    console.log(`Next Recommended Tier: ${result.recommendedNextTier}`)
    console.log(`Feedback:              ${result.feedback}`)
    return
  }

  console.error(`Unknown subcommand: ${sub}. Usage: learning-hub generation [challenge|eval]`)
}

export function feynmanCommand(args: string[]): void {
  const sub = args[0] || 'eval'

  if (sub === 'eval') {
    const concept = parseFlag(args, '--concept') || 'Spaced Repetition'
    const explanation =
      parseFlag(args, '--explanation') ||
      'Spaced repetition is a method where you review flashcards right before you forget them so synapses strengthen.'
    const confidence = Number(parseFlag(args, '--confidence') || '4')

    const report = evaluateFeynmanExplanation({
      concept,
      explanation,
      initialConfidence: Math.min(5, Math.max(1, confidence)),
    })

    console.log(`\n📚 Feynman Teach-Back & IOED Report: ${concept}`)
    console.log(`Summary Verdict:       ${report.summaryVerdict}`)
    console.log(`Explanatory Depth:     ${report.explanatoryDepthScore}/100`)
    console.log(`Reading Ease (Flesch): ${report.fleschReadingEase.toFixed(1)}/100`)
    console.log(`Grade Level (Kincaid): Grade ${report.fleschKincaidGradeLevel.toFixed(1)}`)
    console.log(`12-Year-Old Accessible:${report.isTwelveYearOldAccessible ? ' YES' : ' NO'}`)
    console.log(
      `Jargon Terms (${report.jargonTerms.length}):   ${report.jargonTerms.join(', ') || 'None'}`,
    )
    console.log(
      `Causal Mechanisms:     ${report.causalMarkerCount} markers (${report.causalDensity.toFixed(2)}/sentence)`,
    )
    console.log(
      `IOED Calibration Gap:  ${report.ioedGap > 0 ? `+${report.ioedGap} (overconfident)` : report.ioedGap}`,
    )

    if (report.socraticProbes.length > 0) {
      console.log(`\nSocratic Reflection Probes:`)
      for (const probe of report.socraticProbes) {
        console.log(`  [${probe.type}] ${probe.prompt}`)
      }
    }
    return
  }

  console.error(
    `Unknown subcommand: ${sub}. Usage: learning-hub feynman eval --concept <name> --explanation <text>`,
  )
}

export async function metacognitionCommand(args: string[]): Promise<void> {
  const sub = args[0] || 'stats'

  if (sub === 'stats') {
    const limit = Number(parseFlag(args, '--limit') || '50')
    const rows = await db
      .select({
        cardId: revlog.cardId,
        rating: revlog.rating,
        confidence: revlog.confidence,
        timeMs: revlog.timeMs,
      })
      .from(revlog)
      .orderBy(desc(revlog.id))
      .limit(limit)

    const trials: JudgmentOfLearning[] = rows.map((r) => ({
      cardId: r.cardId,
      confidence: r.confidence === 1 ? 0.9 : 0.35,
      outcome: r.rating >= 3 ? 1 : 0,
      latencyMs: r.timeMs,
    }))

    const report = evaluateMetacognitiveProfile(trials)

    console.log(`\n🔍 Metacognitive Calibration Profile (${trials.length} reviews evaluated)`)
    console.log(`Status:                ${report.status}`)
    console.log(
      `Brier Score:           ${report.brierScore} (0 = perfect calibration, 1 = max error)`,
    )
    console.log(
      `Confidence Bias:       ${report.bias > 0 ? `+${report.bias} (overconfident)` : report.bias}`,
    )
    console.log(`Empirical Accuracy:    ${(report.accuracy * 100).toFixed(1)}%`)
    console.log(`Average Confidence:    ${(report.averageConfidence * 100).toFixed(1)}%`)
    console.log(`Difficulty Adjustment: ${report.difficultyAdjustment}`)
    console.log(`Guidance:              ${report.guidance}`)
    return
  }

  console.error(`Unknown subcommand: ${sub}. Usage: learning-hub metacognition [stats]`)
}
