/**
 * Habits, Journal, and Physio CLI commands.
 */
import { numFlag, optNumFlag } from '../flags'
import { type RegisteredCommand } from './registry'
import { dayKey } from '@learning-hub/core'
import {
  checkinHabit,
  getJournalEntry,
  getPhysioInsights,
  listHabits,
  listJournalEntries,
  upsertJournalEntry,
  upsertPhysioLog,
} from '@learning-hub/db'

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1]
  }
  return undefined
}

export function habitsCommand(args: string[]): void {
  const sub = args[0] || 'list'
  if (sub === 'list') {
    const includeArchived = args.includes('--archived')
    const { habits, today } = listHabits({ includeArchived })
    if (habits.length === 0) {
      console.log('No habits found. Create habits in the web app.')
      return
    }
    const lines = habits.map((h) => {
      const status = h.todayDone ? '✓' : '·'
      const stage = `[${h.solidifying.stage}]`
      const logSet = new Set(h.logDates)
      let currentStreak = 0
      let check = new Date(today)
      if (!logSet.has(today)) {
        check = new Date(check.getTime() - 86_400_000)
      }
      while (logSet.has(check.toISOString().slice(0, 10))) {
        currentStreak++
        check = new Date(check.getTime() - 86_400_000)
      }
      return `  #${h.id} ${h.name.padEnd(25)} streak: ${String(currentStreak).padStart(2)}d ${status} ${stage}`
    })
    console.log(`Habits (${today}):\n${lines.join('\n')}`)
    return
  }

  if (sub === 'checkin') {
    const id = Number(args[1])
    if (!Number.isInteger(id) || id <= 0) {
      console.error('Usage: learning-hub habits checkin <id> [--date YYYY-MM-DD] [--note "note"]')
      process.exitCode = 1
      return
    }
    const date = parseFlag(args, '--date') ?? dayKey(new Date(), 0)
    const note = parseFlag(args, '--note')
    const res = checkinHabit({ habitId: id, date, note })
    if (res.notFound) {
      console.error(`✖ Habit #${id} not found.`)
      process.exitCode = 1
      return
    }
    if (res.alreadyDone) {
      console.log(`ℹ Habit #${id} already checked in for ${date}.`)
    } else {
      console.log(`✔ Checked in habit #${id} for ${date} (+${res.xpAwarded} XP).`)
    }
    return
  }

  if (sub === 'history') {
    const id = Number(args[1])
    if (!Number.isInteger(id) || id <= 0) {
      console.error('Usage: learning-hub habits history <id> [--days N]')
      process.exitCode = 1
      return
    }
    const days = numFlag(parseFlag(args, '--days'), '--days', 14)
    const { habits } = listHabits({ includeArchived: true })
    const habit = habits.find((h) => h.id === id)
    if (!habit) {
      console.error(`✖ Habit #${id} not found.`)
      process.exitCode = 1
      return
    }
    const now = new Date()
    const historyLines: string[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = dayKey(new Date(now.getTime() - i * 86_400_000), 0)
      const done = habit.logDates.includes(d)
      historyLines.push(`  ${d}: ${done ? '✓ completed' : '· missed'}`)
    }
    console.log(`History for "${habit.name}" (last ${days} days):\n${historyLines.join('\n')}`)
    return
  }

  console.log(
    'Usage: learning-hub habits [list [--archived] | checkin <id> [--date YYYY-MM-DD] | history <id> [--days N]]',
  )
}

export function journalCommand(args: string[]): void {
  const sub = args[0] || 'show'
  if (sub === 'write') {
    const date = parseFlag(args, '--date') ?? dayKey(new Date(), 0)
    const moodStr = parseFlag(args, '--mood')
    const mood = optNumFlag(moodStr, '--mood', { int: true, min: 1, max: 5 })
    const smallWins = parseFlag(args, '--wins')
    const gratitude = parseFlag(args, '--gratitude')
    const worryDump = parseFlag(args, '--worry')

    const res = upsertJournalEntry({
      date,
      mood,
      smallWins,
      gratitude,
      worryDump,
    })
    console.log(
      `✔ Journal entry saved for ${date} (mood: ${res.entry.mood ?? 'none'}, +${res.xpAwarded} XP).`,
    )
    return
  }

  if (sub === 'show') {
    const target = args[1] || dayKey(new Date(), 0)
    if (target === 'week') {
      const now = new Date()
      const from = dayKey(new Date(now.getTime() - 7 * 86_400_000), 0)
      const to = dayKey(now, 0)
      const entries = listJournalEntries({ from, to })
      if (entries.length === 0) {
        console.log(`No journal entries between ${from} and ${to}.`)
        return
      }
      for (const e of entries) {
        console.log(`\n--- ${e.date} (mood: ${e.mood ?? '-'}) ---`)
        if (e.smallWins) console.log(`  Wins: ${e.smallWins}`)
        if (e.gratitude) console.log(`  Gratitude: ${e.gratitude}`)
        if (e.worryDump) console.log(`  Worry dump: ${e.worryDump}`)
      }
      return
    }

    const entry = getJournalEntry(target)
    if (!entry) {
      console.log(`No journal entry found for ${target}.`)
      return
    }
    console.log(`Journal entry for ${entry.date} (mood: ${entry.mood ?? '-'}):`)
    if (entry.smallWins) console.log(`  Wins: ${entry.smallWins}`)
    if (entry.gratitude) console.log(`  Gratitude: ${entry.gratitude}`)
    if (entry.worryDump) console.log(`  Worry dump: ${entry.worryDump}`)
    if (entry.aiInsight) console.log(`  Insight: ${entry.aiInsight}`)
    return
  }

  console.log(
    'Usage: learning-hub journal [write [--date YYYY-MM-DD] [--mood 1-5] [--wins ...] [--gratitude ...] [--worry ...] | show [date|week]]',
  )
}

export function physioCommand(args: string[]): void {
  const date = parseFlag(args, '--date')
  const sleepStr = parseFlag(args, '--sleep')
  const qualityStr = parseFlag(args, '--quality')
  const exerciseStr = parseFlag(args, '--exercise')
  const exerciseHoursStr = parseFlag(args, '--exercise-hours')
  const cutoffStr = parseFlag(args, '--cutoff')
  const arousalStr = parseFlag(args, '--arousal')

  const hasFlags = Boolean(
    sleepStr || qualityStr || exerciseStr || exerciseHoursStr || cutoffStr || arousalStr,
  )

  if (hasFlags) {
    upsertPhysioLog({
      date,
      sleepHours: optNumFlag(sleepStr, '--sleep', { min: 0, max: 24 }),
      sleepQuality: optNumFlag(qualityStr, '--quality', { min: 0, max: 10 }),
      exerciseMinutes: optNumFlag(exerciseStr, '--exercise', { min: 0, max: 1440 }),
      exerciseHoursAfterLearning: optNumFlag(exerciseHoursStr, '--exercise-hours', {
        min: 0,
        max: 48,
      }),
      caffeineCutoffHour: optNumFlag(cutoffStr, '--cutoff', { min: 0, max: 24 }),
      arousal: optNumFlag(arousalStr, '--arousal', { min: 0, max: 10 }),
    })
    console.log(`✔ Recorded physiology telemetry.`)
  }

  const { insights, history } = getPhysioInsights({ limit: 7 })
  const latest = history[0]

  console.log('--- Physiology & Retention Telemetry ---')
  if (latest) {
    console.log(
      `Latest log (${latest.date}): sleep: ${latest.sleepHours ?? '-'}h (quality: ${latest.sleepQuality ?? '-'}/5), exercise: ${latest.exerciseMinutes ?? '-'}m, arousal: ${latest.arousal ?? '-'}/10`,
    )
  }
  console.log(`Yerkes-Dodson zone: ${insights.arousal.zone} — ${insights.arousal.advice}`)
  console.log(`Caffeine advice: ${insights.caffeine.cutoffHour}:00 — ${insights.caffeine.advice}`)
  if (insights.exercise.nudge) {
    console.log(`Exercise nudge: ${insights.exercise.nudge}`)
  }
}

export const habitsCommands: RegisteredCommand[] = [
  {
    name: 'habits',
    description: 'habit loops, streaks, and check-ins',
    usage: '[list|checkin|history]',
    run: (runArgs) => habitsCommand(runArgs),
  },
]

export const journalCommands: RegisteredCommand[] = [
  {
    name: 'journal',
    description: 'daily reflection journal and mood tracking',
    usage: '[write|show]',
    run: (runArgs) => journalCommand(runArgs),
  },
]

export const physioCommands: RegisteredCommand[] = [
  {
    name: 'physio',
    description: 'physiology metrics and learning advice',
    usage: '[--sleep N --exercise N ...]',
    run: (runArgs) => physioCommand(runArgs),
  },
]
