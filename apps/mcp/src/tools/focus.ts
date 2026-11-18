/**
 * Focus MCP tools — the focus summary (recent sessions, completion rate,
 * leaks, friction-by-trigger) built on the shared focus-lock repository.
 */
import { frictionByTrigger, listRecentFocusSessions } from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

export const focusTools: RegisteredTool[] = [
  tool('focus_summary', 'Recent focus sessions plus friction (distraction) stats.', {}, () => {
    const sessions = listRecentFocusSessions({ limit: 10 })
    const completed = sessions.filter((s) => s.completed)
    const friction = frictionByTrigger()
    const totalLeakMinutes = sessions.reduce((acc, s) => acc + (s.leaks ?? 0), 0)
    return json({
      recentSessions: sessions.map((s) => ({
        id: s.id,
        startedAt: s.startedAt,
        plannedMinutes: s.plannedMinutes,
        actualMinutes: s.actualMinutes,
        completed: s.completed,
        task: s.task,
        leaks: s.leaks,
      })),
      completedRate: sessions.length ? completed.length / sessions.length : null,
      totalLeaks: totalLeakMinutes,
      frictionByTrigger: friction.map((f) => ({
        trigger: f.trigger,
        count: f.count,
        proceeded: f.proceeded,
      })),
    })
  }),
]
