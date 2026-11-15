/**
 * Workload Balancer: Load Smoothing, Easy Days & Backlog Catch-Up.
 *
 * Implements evidence-based spaced repetition workload management:
 * 1. Load Smoothing: Eliminates review spikes by shifting due dates within a safe
 *    fuzz tolerance window (+/- 5% of interval, capped at 2 days) so retention
 *    is not compromised.
 * 2. Easy Days: Reduces or eliminates review load on selected weekdays (e.g. weekends).
 * 3. Backlog Recovery: Reschedules accumulated overdue backlogs into manageable daily
 *    chunks prioritised by retrievability (lowest R first to salvage fading traces).
 *
 * PRESERVES AGENTS.md RULE 7: Modifies card `due` dates only; never mutates FSRS
 * stability, difficulty, reps, or revlog.
 */
import { z } from 'zod'

export interface WorkloadCardItem {
  id: number
  due: string // ISO timestamp
  stability: number
  intervalDays: number
  state: number
  lapses?: number
}

export interface DayForecast {
  day: string // YYYY-MM-DD
  count: number
}

export interface BalanceOptions {
  days?: number // default 30
  maxPerDay?: number
  easyDays?: number[] // 0=Sunday, 6=Saturday
  asOf?: Date
}

export interface ScheduledShift {
  cardId: number
  originalDue: string
  newDue: string
  shiftDays: number
}

export const workloadBalanceSchema = z.object({
  action: z.enum(['forecast', 'balance', 'catch_up']),
  deckId: z.number().int().positive().optional(),
  days: z.number().int().min(7).max(90).default(30),
  maxPerDay: z.number().int().min(5).max(500).optional(),
  easyDays: z.array(z.number().int().min(0).max(6)).default([]),
  dailyCap: z.number().int().min(5).max(300).default(30),
})

function formatDayKey(d: Date): string {
  return d.toISOString().split('T')[0]!
}

/**
 * Computes a day-by-day due count forecast for the next N days.
 */
export function forecastWorkload(
  cards: WorkloadCardItem[],
  days = 30,
  asOf = new Date(),
): DayForecast[] {
  const counts = new Map<string, number>()
  const startMs = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()).getTime()

  for (let i = 0; i < days; i++) {
    const d = new Date(startMs + i * 86_400_000)
    counts.set(formatDayKey(d), 0)
  }

  for (const c of cards) {
    if (c.state === 0) continue // Unseen new cards are not on the calendar yet
    const cardDueMs = new Date(c.due).getTime()
    const diffDays = Math.floor((cardDueMs - startMs) / 86_400_000)
    const targetDayIndex = Math.max(0, diffDays)

    if (targetDayIndex < days) {
      const d = new Date(startMs + targetDayIndex * 86_400_000)
      const key = formatDayKey(d)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries()).map(([day, count]) => ({ day, count }))
}

/**
 * Balances due dates to respect easy days and max daily caps without harming retention.
 * Only cards with interval >= 3 days are shifted, and shifts are bounded by
 * +/- min(interval * 0.05, 2 days).
 */
export function balanceWorkload(
  cards: WorkloadCardItem[],
  opts: BalanceOptions = {},
): { shifts: ScheduledShift[]; newForecast: DayForecast[] } {
  const days = opts.days ?? 30
  const easyDays = new Set(opts.easyDays ?? [])
  const asOf = opts.asOf ?? new Date()
  const startMs = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()).getTime()

  // Compute daily load
  const dayLoads = new Map<string, number>()
  for (let i = 0; i < days; i++) {
    const d = new Date(startMs + i * 86_400_000)
    dayLoads.set(formatDayKey(d), 0)
  }

  // Calculate target average or cap
  const eligibleCards = cards.filter((c) => c.state !== 0)
  const nonEasyDayCount = Math.max(
    1,
    Array.from({ length: days }).filter((_, i) => {
      const d = new Date(startMs + i * 86_400_000)
      return !easyDays.has(d.getDay())
    }).length,
  )

  const avgPerDay = Math.ceil(eligibleCards.length / nonEasyDayCount)
  const cap = opts.maxPerDay
    ? Math.min(opts.maxPerDay, avgPerDay * 2)
    : Math.max(10, avgPerDay * 1.2)

  const shifts: ScheduledShift[] = []

  for (const card of eligibleCards) {
    const origDue = new Date(card.due)
    const origDueMs = origDue.getTime()
    const dayIndex = Math.floor((origDueMs - startMs) / 86_400_000)

    // Only shift future or near-due cards within the forecast window
    if (dayIndex < 0 || dayIndex >= days) continue

    const origDay = new Date(startMs + dayIndex * 86_400_000)
    const isEasyDay = easyDays.has(origDay.getDay())
    const currentLoad = dayLoads.get(formatDayKey(origDay)) ?? 0

    // Check if card needs shift due to easy day or overload
    if ((isEasyDay || currentLoad > cap) && card.intervalDays >= 3) {
      const maxFuzzDays = Math.min(2, Math.max(1, Math.round(card.intervalDays * 0.05)))

      // Search neighboring days within [-maxFuzzDays, +maxFuzzDays]
      let bestDayIndex = dayIndex
      let lowestLoad = Infinity

      for (let offset = -maxFuzzDays; offset <= maxFuzzDays; offset++) {
        const candidateIndex = dayIndex + offset
        if (candidateIndex < 0 || candidateIndex >= days) continue

        const candDate = new Date(startMs + candidateIndex * 86_400_000)
        if (easyDays.has(candDate.getDay())) continue // Do not shift onto easy days

        const candLoad = dayLoads.get(formatDayKey(candDate)) ?? 0
        if (candLoad < lowestLoad) {
          lowestLoad = candLoad
          bestDayIndex = candidateIndex
        }
      }

      if (bestDayIndex !== dayIndex) {
        const newDueMs = origDueMs + (bestDayIndex - dayIndex) * 86_400_000
        const newDue = new Date(newDueMs).toISOString()
        shifts.push({
          cardId: card.id,
          originalDue: card.due,
          newDue,
          shiftDays: bestDayIndex - dayIndex,
        })
        const bestKey = formatDayKey(new Date(startMs + bestDayIndex * 86_400_000))
        dayLoads.set(bestKey, (dayLoads.get(bestKey) ?? 0) + 1)
        continue
      }
    }

    const key = formatDayKey(origDay)
    dayLoads.set(key, (dayLoads.get(key) ?? 0) + 1)
  }

  const newForecast = Array.from(dayLoads.entries()).map(([day, count]) => ({ day, count }))
  return { shifts, newForecast }
}

/**
 * Reschedules an overdue backlog over N days (vacation / catch-up mode).
 * Prioritizes cards by lowest stability first so rapidly fading traces are salvaged.
 */
export function catchUpBacklog(
  overdueCards: WorkloadCardItem[],
  dailyCap = 30,
  asOf = new Date(),
): ScheduledShift[] {
  const startMs = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()).getTime()

  // Sort lowest stability first (salvage fading memories first)
  const sorted = [...overdueCards].sort((a, b) => a.stability - b.stability)
  const shifts: ScheduledShift[] = []

  let currentDayIndex = 0
  let countOnCurrentDay = 0

  for (const card of sorted) {
    if (countOnCurrentDay >= dailyCap) {
      currentDayIndex += 1
      countOnCurrentDay = 0
    }

    const newDueMs = startMs + currentDayIndex * 86_400_000 + 12 * 3600 * 1000 // midday
    const newDue = new Date(newDueMs).toISOString()

    shifts.push({
      cardId: card.id,
      originalDue: card.due,
      newDue,
      shiftDays: currentDayIndex,
    })

    countOnCurrentDay += 1
  }

  return shifts
}
