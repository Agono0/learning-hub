/**
 * Audio schedule, Cognitive Load telemetry, and Solo RPG Games CLI commands.
 */
import { limitFlag, numFlag, optNumFlag } from '../flags'
import { type RegisteredCommand } from './registry'
import { BOSS_ROSTER, buildTonightPlan, sleepProfileSchema } from '@learning-hub/core'
import {
  getActiveBossBattle,
  getDueCardsForAudio,
  getRecentCognitiveTelemetry,
  getTmrCuesForSleepReplay,
  listCardsByStability,
  mintTmrCuesForRecentReviews,
  syncBossBattleProgress,
} from '@learning-hub/db'
import { fragilityScore, toConsolidationCandidates } from '@learning-hub/core/tmr'

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1]
  }
  return undefined
}

/**
 * `audio tmr-plan` — builds tonight's TMR consolidation plan from REAL FSRS
 * card state (same selection algorithm as the web handler): ranks review-state
 * cards by fragility, fits the sleep-architecture hypnogram, and prints the
 * schedule with per-card predicted boosts.
 */
export function tmrPlanCommand(args: string[]): void {
  const profile = sleepProfileSchema.parse({
    bedtime: parseFlag(args, '--bedtime') ?? '23:00',
    wakeTime: parseFlag(args, '--wake') ?? '07:00',
    chronotype: numFlag(parseFlag(args, '--chronotype'), '--chronotype', 0),
    sleepDebtHours: numFlag(parseFlag(args, '--debt'), '--debt', 0),
    maxAcousticDba: numFlag(parseFlag(args, '--dba'), '--dba', 35),
  })

  // Shared repo projection — identical candidate fetch to the MCP
  // `sleep_consolidation_plan` tool (repos/cards.listCardsByStability).
  const rows = listCardsByStability({ limit: 300 })

  const candidates = toConsolidationCandidates(
    rows
      .filter((r) => !r.suspended && r.state >= 2 && r.stability > 0)
      .map((r) => ({ id: r.id, stability: r.stability, difficulty: r.difficulty, due: r.due })),
  )
    .sort((a, b) => fragilityScore(b) - fragilityScore(a))
    .slice(0, limitFlag(parseFlag(args, '--limit'), 12))

  const plan = buildTonightPlan(profile, candidates)

  const { hypnogram } = plan
  console.log(
    `\n🌙 Tonight's TMR plan — ${profile.bedtime} → ${profile.wakeTime} (${hypnogram.cycleCount} cycles, SWS ${Math.round(hypnogram.swsShare * 100)}%)`,
  )
  if (plan.safety.withinArousalCeiling) {
    console.log(
      `   Acoustics: ${plan.safety.maxAcousticDba} dBA (under the 42 dBA arousal ceiling)`,
    )
  } else {
    console.log(`   ⚠ ${plan.safety.note}`)
  }
  if (plan.cues.length === 0) {
    console.log('   No cues: no review-state cards found (review cards to mint candidates).')
    return
  }
  console.log(`   ${plan.cues.length} cues · mean predicted boost ≈ ${plan.meanPredictedBoostPct}%`)
  for (const cue of plan.cues.slice(0, 15)) {
    const hh = String(Math.floor(cue.offsetMinutes / 60)).padStart(2, '0')
    const mm = String(Math.round(cue.offsetMinutes % 60)).padStart(2, '0')
    console.log(
      `   ${hh}:${mm}  card #${cue.cardId}  cycle ${cue.cycleIndex}  Δ${cue.blockDeltaWeight}  ${cue.baseFrequency} Hz  +${cue.predictedBoostPct}% (${cue.stabilizationTier})`,
    )
  }
  if (plan.unscheduledCardIds.length > 0) {
    console.log(
      `   ${plan.unscheduledCardIds.length} cards did not fit the slow-wave windows (honest capacity limit).`,
    )
  }
  console.log('   Advisory: TMR is an evidence-inspired bonus, not a substitute for review.')
}

export function audioCommand(args: string[]): void {
  const sub = args[0] || 'schedule'

  if (sub === 'schedule') {
    const kind = parseFlag(args, '--kind') ?? 'commute'
    const limit = limitFlag(parseFlag(args, '--limit'), kind === 'tmr' ? 40 : 20)

    if (kind === 'tmr') {
      const action = parseFlag(args, '--action') ?? 'get'
      if (action === 'mint') {
        const sinceHours = numFlag(parseFlag(args, '--since-hours'), '--since-hours', 24)
        const sinceIso = new Date(Date.now() - sinceHours * 3600_000).toISOString()
        const minted = mintTmrCuesForRecentReviews(sinceIso, limit)
        console.log(
          `✔ Minted/refreshed ${minted} sleep TMR cues from reviews in last ${sinceHours}h.`,
        )
      }

      const cues = getTmrCuesForSleepReplay(limit)
      if (cues.length === 0) {
        console.log('No sleep TMR cues scheduled. Review cards or mint cues with --action mint.')
        return
      }

      console.log(`Sleep TMR Replay Queue (${cues.length} cues):`)
      for (const cue of cues.slice(0, 15)) {
        console.log(
          `  Card #${cue.cardId} | Cued Awake: ${cue.timesCuedAwake}x | Cued Sleep: ${cue.timesCuedSleep}x`,
        )
      }
      return
    }

    // commute audio review
    const cards = getDueCardsForAudio(limit)
    if (cards.length === 0) {
      console.log('No due cards ready for audio review. You are caught up!')
      return
    }

    console.log(`Audio Hands-Free Commute Queue (${cards.length} cards):`)
    for (const card of cards.slice(0, 15)) {
      const deck = card.deckName ? `[${card.deckName}] ` : ''
      console.log(`  #${card.id} ${deck}${card.spokenFront.slice(0, 50)}...`)
    }
    return
  }

  console.error(
    `Unknown subcommand: ${sub}. Usage: learning-hub audio schedule [--kind commute|tmr]`,
  )
  process.exitCode = 1
}

export function focusLoadCmd(args: string[]): void {
  const limit = limitFlag(parseFlag(args, '--limit'), 20)
  const cardIdStr = parseFlag(args, '--card')
  const cardId = optNumFlag(cardIdStr, '--card', { int: true, min: 1 })

  const events = getRecentCognitiveTelemetry(limit, cardId)
  if (events.length === 0) {
    console.log('No cognitive telemetry events recorded yet.')
    return
  }

  const avgCli = events.reduce((acc, e) => acc + e.estimatedCli, 0) / events.length
  const flowDistribution: Record<string, number> = {
    underload: 0,
    optimal_flow: 0,
    overload: 0,
  }
  for (const e of events) {
    if (e.flowZone in flowDistribution) {
      flowDistribution[e.flowZone] = (flowDistribution[e.flowZone] ?? 0) + 1
    }
  }

  console.log('Cognitive Load & Flow Telemetry (Sweller CLT):')
  console.log(`  Average Cognitive Load Index (CLI): ${(avgCli * 100).toFixed(1)}%`)
  console.log(
    `  Flow Channel Distribution: Underload: ${flowDistribution.underload} | Optimal Flow: ${flowDistribution.optimal_flow} | Overload: ${flowDistribution.overload}`,
  )
  console.log(`\nRecent Telemetry Events:`)
  for (const e of events.slice(0, 10)) {
    console.log(
      `  Card #${e.cardId ?? '?'} | Latency: ${e.responseLatencyMs}ms | CLI: ${(e.estimatedCli * 100).toFixed(0)}% [${e.flowZone}]`,
    )
  }
}

export function gamesCommand(args: string[]): void {
  const sub = args[0] || 'status'

  if (sub === 'status') {
    const active = getActiveBossBattle()
    if (active) {
      syncBossBattleProgress()
    }
    const synced = getActiveBossBattle()

    console.log('Solo RPG Boss Battle Status:')
    if (synced && synced.status === 'active') {
      const hpPct = Math.round((synced.currentHp / synced.maxHp) * 100)
      console.log(`  ⚔️ Active Battle: ${synced.bossName} (${synced.bossKey})`)
      console.log(`     Boss HP:   ${synced.currentHp}/${synced.maxHp} (${hpPct}%)`)
      console.log(`     Player HP: ${synced.playerHp}/100`)
      console.log(`     Started:   ${synced.startedAt}`)
    } else {
      console.log('  No active boss battle. Start one in the web app under Games.')
    }

    console.log('\nMythical Boss Roster:')
    for (const boss of Object.values(BOSS_ROSTER)) {
      console.log(
        `  ${boss.avatar} ${boss.name.padEnd(25)} HP: ${String(boss.maxHp).padStart(4)} | XP: +${boss.rewardXp} | ${boss.title}`,
      )
    }
    return
  }

  console.error(`Unknown subcommand: ${sub}. Usage: learning-hub games status`)
  process.exitCode = 1
}

export const audioCommands: RegisteredCommand[] = [
  {
    name: 'audio',
    description: 'speakable commute review and sleep TMR earcons',
    usage: '[schedule|tmr-plan]',
    run: (runArgs) => {
      const sub = runArgs[0]
      if (sub === 'tmr-plan') return tmrPlanCommand(runArgs.slice(1))
      return audioCommand(runArgs)
    },
  },
]

export const gamesCommands: RegisteredCommand[] = [
  {
    name: 'games',
    description: 'solo RPG boss battles and mythical boss roster',
    usage: '[status]',
    run: (runArgs) => gamesCommand(runArgs),
  },
]
