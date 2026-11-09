/**
 * Telemetry & Audio MCP Tools — Commute Audio, Sleep TMR, Cognitive Load Telemetry, and Solo Boss RPG:
 * 1. audio_schedule: inspect speakable hands-free commute cards or mint/inspect sleep TMR earcon cues.
 * 2. cognitive_load_report: inspect Cognitive Load Index (CLI) scoring, hesitation jitter, and flow zones.
 * 3. boss_status: inspect active solo boss battle health, revlog combat progress, and mythical boss roster.
 */
import { z } from 'zod'
import { BOSS_ROSTER } from '@learning-hub/core'
import {
  getActiveBossBattle,
  getDueCardsForAudio,
  getRecentCognitiveTelemetry,
  getTmrCuesForSleepReplay,
  mintTmrCuesForRecentReviews,
  syncBossBattleProgress,
} from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

export const telemetryAudioTools: RegisteredTool[] = [
  tool(
    'audio_schedule',
    'Inspect or mint speakable audio review queues for hands-free commute and targeted memory reactivation (TMR) sleep earcon cues.',
    {
      kind: z.enum(['commute', 'tmr']).optional(),
      action: z.enum(['get', 'mint']).optional(),
      limit: z.number().int().positive().max(100).optional(),
      sinceHours: z.number().positive().max(72).optional(),
    },
    (args) => {
      const kind = args.kind ?? 'commute'

      if (kind === 'tmr') {
        let minted = 0
        if (args.action === 'mint') {
          const sinceIso = new Date(Date.now() - (args.sinceHours ?? 24) * 3600_000).toISOString()
          minted = mintTmrCuesForRecentReviews(sinceIso, args.limit ?? 40)
        }

        const cues = getTmrCuesForSleepReplay(args.limit ?? 40)
        return json({
          ok: true,
          kind: 'tmr',
          minted,
          count: cues.length,
          cues: cues.map((c) => ({
            cardId: c.cardId,
            earconSignature: c.earconSignature,
            timesCuedAwake: c.timesCuedAwake,
            timesCuedSleep: c.timesCuedSleep,
            lastSleepCueAt: c.lastSleepCueAt,
          })),
        })
      }

      const cards = getDueCardsForAudio(args.limit ?? 20)
      return json({
        ok: true,
        kind: 'commute',
        count: cards.length,
        queue: cards.map((c) => ({
          id: c.id,
          deckName: c.deckName,
          spokenFront: c.spokenFront,
          back: c.back,
          stabilityDays: Math.round(c.stability * 10) / 10,
        })),
      })
    },
  ),

  tool(
    'cognitive_load_report',
    'Report real-time Cognitive Load Index (CLI), hesitation jitter, and Yerkes-Dodson flow zone telemetry (Sweller CLT).',
    {
      limit: z.number().int().positive().max(100).optional(),
      cardId: z.number().int().positive().optional(),
    },
    (args) => {
      const events = getRecentCognitiveTelemetry(args.limit ?? 20, args.cardId)
      const avgCli =
        events.length > 0 ? events.reduce((acc, e) => acc + e.estimatedCli, 0) / events.length : 0

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

      return json({
        ok: true,
        count: events.length,
        summary: {
          averageCli: Math.round(avgCli * 100) / 100,
          flowDistribution,
        },
        events: events.map((e) => ({
          id: e.id,
          cardId: e.cardId,
          responseLatencyMs: e.responseLatencyMs,
          estimatedCli: e.estimatedCli,
          flowZone: e.flowZone,
          interventionApplied: e.interventionApplied,
          createdAt: e.createdAt,
        })),
      })
    },
  ),

  tool(
    'boss_status',
    'Inspect active solo RPG boss battles, combat turn derived from spaced reviews, and the roster of mythical bosses.',
    {
      includeRoster: z.boolean().optional(),
    },
    (args) => {
      const active = getActiveBossBattle()
      if (active) {
        syncBossBattleProgress()
      }
      const synced = getActiveBossBattle()

      const roster = Object.values(BOSS_ROSTER).map((b) => ({
        key: b.key,
        name: b.name,
        title: b.title,
        avatar: b.avatar,
        maxHp: b.maxHp,
        rewardXp: b.rewardXp,
        description: b.description,
      }))

      return json({
        ok: true,
        active: synced
          ? {
              id: synced.id,
              bossKey: synced.bossKey,
              bossName: synced.bossName,
              currentHp: synced.currentHp,
              maxHp: synced.maxHp,
              playerHp: synced.playerHp,
              status: synced.status,
              startedAt: synced.startedAt,
            }
          : null,
        roster: args.includeRoster !== false ? roster : undefined,
      })
    },
  ),
]
