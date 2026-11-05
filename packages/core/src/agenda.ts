/**
 * Today agenda (M4): merge everything the learner could do next into one
 * prioritized list — exams first (deadlines), then due cards (the daily
 * engine), then unfinished lessons (Zeigarnik), then the supporting loop
 * (focus block, quest, small win). Pure module — the dashboard handler
 * gathers the facts, the page renders the list.
 */

/** Facts the caller gathers (all optional — absent facts produce no items). */
export interface AgendaInput {
  /** cards due right now */
  dueCount: number
  /** exams within their countdown window, soonest first */
  exams: { title: string; daysLeft: number }[]
  /** lessons started but not completed, most recent first */
  inProgressLessons: { lessonId: number; title: string; courseTitle: string }[]
  /** focus minutes actually completed today */
  focusMinutesToday: number
  /** minutes of focus a "good day" includes (e.g. one Pomodoro) */
  focusTargetMinutes: number
  quest: { title: string; completed: boolean } | null
  /** a small win was journaled today */
  journalDoneToday: boolean
}

/** One "do this next" row on the dashboard. */
export interface AgendaItem {
  kind: 'exam' | 'review' | 'lesson' | 'focus' | 'quest' | 'journal'
  /** lower = earlier in the list */
  priority: number
  title: string
  detail?: string
  href: string
}

export const FOCUS_TARGET_MINUTES = 25

/**
 * Build today's agenda: prioritized, honest, calm — one row per real
 * commitment, nothing that isn't actually pending.
 */
export function buildAgenda(input: AgendaInput): AgendaItem[] {
  const items: AgendaItem[] = []

  for (const exam of input.exams) {
    if (exam.daysLeft >= 0) {
      items.push({
        kind: 'exam',
        priority: 0,
        title: exam.title,
        detail: exam.daysLeft === 0 ? 'today' : `in ${exam.daysLeft} day(s)`,
        href: '/courses',
      })
    }
  }

  if (input.dueCount > 0) {
    items.push({
      kind: 'review',
      priority: 1,
      title: `Review ${input.dueCount} due card${input.dueCount === 1 ? '' : 's'}`,
      href: '/review',
    })
  }

  for (const lesson of input.inProgressLessons.slice(0, 2)) {
    items.push({
      kind: 'lesson',
      priority: 2,
      title: `Continue: ${lesson.title}`,
      detail: lesson.courseTitle,
      href: `/courses/lesson?id=${lesson.lessonId}`,
    })
  }

  if (input.focusMinutesToday < input.focusTargetMinutes) {
    items.push({
      kind: 'focus',
      priority: 3,
      title: `One focus block (${input.focusTargetMinutes} min)`,
      detail: input.focusMinutesToday > 0 ? `${input.focusMinutesToday} min done today` : undefined,
      href: '/focus',
    })
  }

  if (input.quest && !input.quest.completed) {
    items.push({
      kind: 'quest',
      priority: 4,
      title: `Daily quest: ${input.quest.title}`,
      href: '/motivation',
    })
  }

  if (!input.journalDoneToday) {
    items.push({
      kind: 'journal',
      priority: 5,
      title: 'Log a small win',
      href: '/journal',
    })
  }

  return items.sort((a, b) => a.priority - b.priority)
}
