/**
 * Context Variability MCP tools. Same repository functions as the web handler
 * and the CLI `ctxv` command. Learning-science basis: recall is better when the
 * study and test contexts match (Godden & Baddeley 1975) and studying in more
 * than one context helps (Smith, Glenberg & Bjork 1978), though the effect is
 * modest (Smith & Vela 2001). The audit is observational: present it as such.
 *
 * Tools:
 * 1. ctxv_audit   - recall by place and time of day, home-versus-away gap, goal readiness
 * 2. ctxv_session - start, end or log a study session
 * 3. ctxv_goal    - add or archive a performance goal (place and hours)
 */
import { z } from 'zod'
import {
  ContextLimitError,
  ContextValidationError,
  addContextGoal,
  archiveContextGoal,
  endContextSession,
  logContextSession,
  runContextAuditDb,
  startContextSession,
} from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

const noise = z.enum(['quiet', 'moderate', 'loud']).nullish()

function guard<T>(fn: () => T) {
  try {
    return json({ ok: true, ...fn() })
  } catch (e) {
    if (e instanceof ContextValidationError || e instanceof ContextLimitError)
      return json({ ok: false, error: e.message })
    throw e
  }
}

export const contextVariabilityTools: RegisteredTool[] = [
  tool(
    'ctxv_audit',
    'Audit recall by study place and time of day: success rates with intervals, the home-versus-away gap, cards tied to one context, and readiness for performance goals. Observational, not causal.',
    { windowDays: z.number().int().min(7).max(365).default(60) },
    ({ windowDays = 60 }) => json({ ok: true, ...runContextAuditDb({ windowDays }) }),
  ),
  tool(
    'ctxv_session',
    'Start, end or log a study session at a named place. action=start needs place; action=end closes the open session; action=log needs place, startedAt and endedAt (ISO, under 12 hours).',
    {
      action: z.enum(['start', 'end', 'log']),
      place: z.string().max(60).optional(),
      startedAt: z.string().max(40).optional(),
      endedAt: z.string().max(40).optional(),
      noise,
    },
    ({ action, place, startedAt, endedAt, noise: n }) =>
      guard(() => {
        if (action === 'end') return { session: endContextSession() }
        if (!place) throw new ContextValidationError('place is required')
        if (action === 'start') return { ...startContextSession({ place, noise: n }) }
        if (!startedAt || !endedAt)
          throw new ContextValidationError('startedAt and endedAt are required')
        return { ...logContextSession({ place, startedAt, endedAt, noise: n }) }
      }),
  ),
  tool(
    'ctxv_goal',
    'Add a performance goal (place and local hours) or archive one. action=add needs label, place, startHour, endHour; action=archive needs id.',
    {
      action: z.enum(['add', 'archive']),
      id: z.number().int().positive().optional(),
      label: z.string().max(60).optional(),
      place: z.string().max(60).optional(),
      startHour: z.number().int().min(0).max(23).optional(),
      endHour: z.number().int().min(0).max(24).optional(),
      noise,
    },
    ({ action, id, label, place, startHour, endHour, noise: n }) =>
      guard(() => {
        if (action === 'archive') {
          if (!id) throw new ContextValidationError('id is required')
          return { archived: archiveContextGoal(id) }
        }
        if (!label || !place || startHour === undefined || endHour === undefined)
          throw new ContextValidationError('label, place, startHour and endHour are required')
        return { ...addContextGoal({ label, place, startHour, endHour, noise: n }) }
      }),
  ),
]
