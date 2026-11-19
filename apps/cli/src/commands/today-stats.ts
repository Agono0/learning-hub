/**
 * `today` and `stats` CLI commands — the daily snapshot and the learning
 * panel. Both read the shared stats repos (repos/stats, repos/quests,
 * repos/quotes, repos/focus-lock) — one definition for every host.
 */
import { dayKey, levelFromXp, levelProgress } from '@learning-hub/core'
import {
  dailyReviewsSeries,
  getDailyQuest,
  getDueCardCount,
  getRandomQuote,
  getStreakRow,
  getTrueRetention,
  getXpTotals,
  sumFocusMinutes,
} from '@learning-hub/db'
import { bar, panel } from './ui'
import type { RegisteredCommand } from './registry'

async function today() {
  const now = new Date()
  const dueCount = getDueCardCount({ now })
  const quest = getDailyQuest(dayKey(now))
  const quote = getRandomQuote()
  const streakRow = getStreakRow({ now })
  const lines = [
    `Due cards:   ${dueCount}`,
    `Streak:      ${streakRow?.current ?? 0} days (best ${streakRow?.best ?? 0})`,
    `Quest:       ${quest ? (quest.completed ? 'complete ✓' : 'in progress') : 'not generated yet'}`,
  ]
  if (quote) lines.push(`Quote:       "${quote.text}" — ${quote.author}`)
  console.log(panel(`TODAY · ${dayKey(now)}`, lines))
  console.log('\nRun `learning-hub review` to start your session.')
}

async function stats() {
  const now = new Date()
  // Shared stats repo — one definition for web, MCP and the headless server.
  const retention = getTrueRetention({ now })
  const dueCount = getDueCardCount({ now })
  const streakRow = getStreakRow({ now })
  const { total: xpTotal, today: xpToday } = getXpTotals({ now })
  // v_daily_reviews already excludes undone reviews; ascending (oldest first).
  const week = dailyReviewsSeries({ days: 7, now })
  // Web weekly-report parity: completed sessions only (repos/focus-lock).
  const focusMinutes = sumFocusMinutes({ days: 7, now })

  const level = levelFromXp(xpTotal)
  const lines = [
    `True retention: ${retention.retention_pct ?? '—'}%  (${retention.total} real reviews)`,
    `Due now:        ${dueCount} cards`,
    `Streak:         ${streakRow?.current ?? 0} days (best ${streakRow?.best ?? 0}, ❄️ ${streakRow?.freezes ?? 2} freezes)`,
    `XP:             ${xpTotal} total · ${xpToday} today · level ${level} ${bar(levelProgress(xpTotal) * 100, 100)}`,
    `Focus (7d):     ${Math.round(focusMinutes)} minutes`,
    '',
    'Reviews last 7 days:',
    ...week.map(
      (d) =>
        `  ${d.day}  ${bar(d.reviews, Math.max(...week.map((w) => w.reviews), 1))} ${d.reviews}`,
    ),
  ]
  console.log(panel('LEARNING STATS', lines))
}

export const todayStatsCommands: RegisteredCommand[] = [
  { name: 'today', description: 'due cards, quests, quote', run: () => today() },
  { name: 'stats', description: 'retention, streak, XP, focus', run: () => stats() },
]
