/**
 * /api/notifications/prefs — the user-managed delivery policy.
 *
 * GET returns the effective policy merged with catalog defaults plus the
 * channel catalog (so the UI never hard-codes channel copy). PUT replaces the
 * policy wholesale (client renders the full editor state); the core parser
 * re-validates and drops unknown channel ids, so stale clients can never
 * corrupt the stored policy.
 */
import {
  DELIVERY_DECISION_REASON,
  defaultNotificationPrefs,
  localDayBoundsIso,
  notificationPrefsSchema,
  NOTIFICATION_CHANNELS,
} from '@learning-hub/core/notification-center'
import {
  countNotificationsOnDay,
  getNotificationPrefs,
  updateNotificationPrefs,
} from '@learning-hub/db'
import { readJson, withRoute, tzOffsetFromQuery } from '@/lib/api'

export const GET = withRoute(async (req: Request) => {
  const prefs = getNotificationPrefs()
  // The daily-cap counter uses the CLIENT's calendar day (its tz offset), so
  // "8 notifications today" always matches what the user experiences.
  const bounds = localDayBoundsIso(tzOffsetFromQuery(req))
  const deliveredToday = countNotificationsOnDay(bounds.dayStartIso, bounds.dayEndIso)
  return Response.json({
    ok: true,
    prefs,
    defaults: defaultNotificationPrefs(),
    channels: NOTIFICATION_CHANNELS,
    decisionReasons: DELIVERY_DECISION_REASON,
    deliveredToday,
  })
})

export const PUT = withRoute(async (req: Request) => {
  const body = await readJson(req, notificationPrefsSchema)
  const prefs = updateNotificationPrefs(body)
  return Response.json({ ok: true, prefs })
})
