/**
 * Lifestyle MCP Tools — Habits, Reflection Journal, and Physiology Telemetry:
 * 1. habit_list: habit loops, current streaks, and automaticity stages.
 * 2. habit_checkin: idempotent daily habit check-ins with streak tracking and canonical XP.
 * 3. journal_write: daily reflection, mood tracking, small wins, gratitude, and worry dump.
 * 4. journal_search: search journal entries by keyword query across text fields.
 * 5. physio_log: sleep, exercise, caffeine, and Yerkes-Dodson arousal telemetry + evidence-based learning advice.
 */
import { z } from 'zod'
import { dayKey } from '@learning-hub/core'
import {
  checkinHabit,
  getPhysioInsights,
  listHabits,
  searchJournalEntries,
  upsertJournalEntry,
  upsertPhysioLog,
} from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

export const lifestyleTools: RegisteredTool[] = [
  tool(
    'habit_list',
    'List all active (or archived) habits with streak counts, today completion status, and automaticity stages (Lally 2010).',
    {
      includeArchived: z.boolean().optional(),
    },
    (args) => {
      const result = listHabits({ includeArchived: args.includeArchived })
      return json({
        ok: true,
        today: result.today,
        habits: result.habits.map((h) => {
          const logSet = new Set(h.logDates)
          let currentStreak = 0
          let check = new Date(result.today)
          if (!logSet.has(result.today)) {
            check = new Date(check.getTime() - 86_400_000)
          }
          while (logSet.has(check.toISOString().slice(0, 10))) {
            currentStreak++
            check = new Date(check.getTime() - 86_400_000)
          }

          return {
            id: h.id,
            name: h.name,
            cue: h.cue,
            cueType: h.cueType,
            craving: h.craving,
            response: h.response,
            reward: h.reward,
            anchor: h.anchor,
            currentStreak,
            todayDone: h.todayDone,
            stage: h.solidifying.stage,
            totalLoggedDays: h.solidifying.days,
            daysToNextStage: h.solidifying.daysToNext,
            archived: h.archived,
          }
        }),
        stageThresholds: result.stageThresholds,
      })
    },
  ),

  tool(
    'habit_checkin',
    'Check in a habit for today or a specific date (YYYY-MM-DD). Unique per (habitId, date); re-check-in updates note, never duplicates rows or double-awards XP.',
    {
      habitId: z.number().int().positive(),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      note: z.string().max(500).optional(),
    },
    (args) => {
      const date = args.date ?? dayKey(new Date(), 0)
      const result = checkinHabit({
        habitId: args.habitId,
        date,
        note: args.note ?? null,
      })
      if (result.notFound) {
        return json({ ok: false, error: `Habit #${args.habitId} not found` })
      }
      return json({
        ok: true,
        created: !result.alreadyDone,
        alreadyDone: result.alreadyDone,
        date: result.date,
        xpAwarded: result.xpAwarded,
      })
    },
  ),

  tool(
    'journal_write',
    'Write or update a daily journal entry (mood 1-5, small wins, gratitude, expressive writing worry dump). Idempotent per date.',
    {
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      mood: z.number().int().min(1).max(5).optional(),
      smallWins: z.string().max(2000).optional(),
      gratitude: z.string().max(2000).optional(),
      worryDump: z.string().max(4000).optional(),
    },
    (args) => {
      const date = args.date ?? dayKey(new Date(), 0)
      const result = upsertJournalEntry({
        date,
        mood: args.mood,
        smallWins: args.smallWins,
        gratitude: args.gratitude,
        worryDump: args.worryDump,
      })
      return json({
        ok: true,
        created: result.created,
        entry: result.entry,
        xpAwarded: result.xpAwarded,
      })
    },
  ),

  tool(
    'journal_search',
    'Search daily journal entries by keyword query across wins, gratitude, worry dump, and AI insights.',
    {
      q: z.string().min(1),
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    },
    (args) => {
      const entries = searchJournalEntries(args.q, { from: args.from, to: args.to })
      return json({
        ok: true,
        query: args.q,
        count: entries.length,
        entries,
      })
    },
  ),

  tool(
    'physio_log',
    'Dual-purpose: record daily physiology metrics (sleep, exercise timing, caffeine cutoff, Yerkes-Dodson arousal) or omit metrics to retrieve recent telemetry and retention advice (Walker 2017, Stickgold 2005).',
    {
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      sleepHours: z.number().min(0).max(24).optional(),
      sleepQuality: z.number().int().min(1).max(5).optional(),
      exerciseMinutes: z.number().int().min(0).max(720).optional(),
      exerciseHoursAfterLearning: z.number().min(0).max(24).optional(),
      caffeineCutoffHour: z.number().int().min(0).max(23).optional(),
      arousal: z.number().int().min(1).max(10).optional(),
      notes: z.string().max(1000).optional(),
    },
    (args) => {
      const hasInputs =
        args.sleepHours !== undefined ||
        args.sleepQuality !== undefined ||
        args.exerciseMinutes !== undefined ||
        args.exerciseHoursAfterLearning !== undefined ||
        args.caffeineCutoffHour !== undefined ||
        args.arousal !== undefined ||
        args.notes !== undefined

      let saved = null
      if (hasInputs) {
        saved = upsertPhysioLog({
          date: args.date,
          sleepHours: args.sleepHours,
          sleepQuality: args.sleepQuality,
          exerciseMinutes: args.exerciseMinutes,
          exerciseHoursAfterLearning: args.exerciseHoursAfterLearning,
          caffeineCutoffHour: args.caffeineCutoffHour,
          arousal: args.arousal,
          notes: args.notes,
        })
      }

      const insights = getPhysioInsights({ limit: 14 })
      return json({
        ok: true,
        saved: Boolean(saved),
        log: saved ? saved.log : null,
        insights: insights.insights,
        recentHistory: insights.history.slice(0, 7),
      })
    },
  ),
]
