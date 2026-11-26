/**
 * Weekly digest — one-shot job: builds a compact weekly study summary from the
 * local database and POSTs it to every URL in `LEARNING_HUB_WEBHOOKS` (same
 * env format as webhooks.ts), plus a web-push notification when VAPID keys are
 * configured. Schedule it with cron/Task Scheduler:
 *
 *   node --import tsx apps/server/src/digest.ts
 */
import { sql } from 'drizzle-orm'
import { getDb } from '@learning-hub/db'
import { sendPushToAll } from './push'
import { parseWebhookSpec, postDigestSummary } from './webhooks'

async function main(): Promise<void> {
  const db = getDb()
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const reviews =
    db.all<{ c: number }>(sql`SELECT count(*) AS c FROM revlog WHERE reviewed_at >= ${since}`)[0]
      ?.c ?? 0
  const xp =
    db.all<{ c: number }>(
      sql`SELECT coalesce(sum(amount), 0) AS c FROM xp_events WHERE created_at >= ${since}`,
    )[0]?.c ?? 0
  const focusMinutes =
    db.all<{ c: number }>(
      sql`SELECT coalesce(sum(coalesce(actual_minutes, planned_minutes)), 0) AS c FROM focus_sessions WHERE coalesce(ended_at, started_at) >= ${since}`,
    )[0]?.c ?? 0
  const trees =
    db.all<{ c: number }>(
      sql`SELECT count(*) AS c FROM forest_plots WHERE created_at >= ${since}`,
    )[0]?.c ?? 0
  const trueRetention =
    db.all<{ r: number | null }>(sql`SELECT retention_pct AS r FROM v_true_retention`)[0]?.r ?? null

  const summary = {
    kind: 'weekly-digest',
    generatedAt: new Date().toISOString(),
    week: { reviews, xp, focusMinutes, trees, trueRetention },
  }

  const targets = parseWebhookSpec(process.env.LEARNING_HUB_WEBHOOKS)
  await postDigestSummary(targets, summary)
  if (targets.length === 0) {
    console.log('[digest] no LEARNING_HUB_WEBHOOKS targets configured — nothing sent')
  }

  const pushConfigured = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
  if (pushConfigured) {
    const result = await sendPushToAll({
      title: 'Learning HUB — weekly digest',
      body: `${reviews} reviews · ${xp} XP · ${Math.round(focusMinutes)} focus minutes this week. Open Weekly Review for the full picture.`,
      url: '/weekly',
      tag: 'lh-digest',
    })
    console.log(`[digest] push sent to ${result.sent} device(s)`)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('[digest] failed:', err)
  process.exit(1)
})
