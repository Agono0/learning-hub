/**
 * Audio schedule, Cognitive Load telemetry, and Solo RPG Games CLI commands.
 */
import { BOSS_ROSTER } from '@learning-hub/core'
import {
  getActiveBossBattle,
  getDueCardsForAudio,
  getRecentCognitiveTelemetry,
  getTmrCuesForSleepReplay,
  mintTmrCuesForRecentReviews,
  syncBossBattleProgress,
} from '@learning-hub/db'

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1]
  }
  return undefined
}

export function audioCommand(args: string[]): void {
  const sub = args[0] || 'schedule'

  if (sub === 'schedule') {
    const kind = parseFlag(args, '--kind') ?? 'commute'
    const limit = Number(parseFlag(args, '--limit') ?? (kind === 'tmr' ? '40' : '20'))

    if (kind === 'tmr') {
      const action = parseFlag(args, '--action') ?? 'get'
      if (action === 'mint') {
        const sinceHours = Number(parseFlag(args, '--since-hours') ?? '24')
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
}

export function focusLoadCmd(args: string[]): void {
  const limit = Number(parseFlag(args, '--limit') ?? '20')
  const cardIdStr = parseFlag(args, '--card')
  const cardId = cardIdStr ? Number(cardIdStr) : undefined

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
}
