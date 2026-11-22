/**
 * Tasks handlers batch C (S3-18) — CSV export.
 *
 * GET /api/tasks-worklog/export?from=YYYY-MM-DD&to=YYYY-MM-DD — one row per
 * tracked session (`task_id,title,day,minutes,source,started_at`), RFC 4180
 * quoting on the title, as `text/csv` attachment (the Worklog page's export
 * button and S3-28's inline corrections both consume the same log source).
 */
import { getTaskItem, listTimeLogs } from '@learning-hub/db'
import { readQuery } from '@/lib/api'
import { z } from 'zod'

const querySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

/** RFC 4180: quote a field when it carries a comma, quote or newline. */
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export async function GET(req: Request) {
  const q = readQuery(req, querySchema)
  const logs = listTimeLogs({ from: q.from, to: q.to })

  const header = 'task_id,title,day,minutes,source,started_at'
  const lines = logs.map((log) => {
    const title = getTaskItem(log.taskId)?.title ?? ''
    return [
      String(log.taskId),
      csvField(title),
      log.day,
      String(Math.round(log.sessionMs / 60_000)),
      log.source,
      log.startedAt ?? '',
    ].join(',')
  })

  const body = [header, ...lines].join('\r\n')
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="worklog-${q.from ?? 'all'}-${q.to ?? 'all'}.csv"`,
    },
  })
}
